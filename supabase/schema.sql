-- 知脉 · P0 数据库结构
-- 幂等脚本：可以重复执行。被 scripts/db-init.mjs 按 “-- STATEMENT” 标记切分执行。
-- 也可以整段粘贴到 Supabase SQL Editor 里运行。

create extension if not exists pgcrypto;

-- STATEMENT
create schema if not exists extensions;

-- STATEMENT
-- pgvector：节点语义向量。维度必须与 src/lib/ai/embeddings.ts 的 EMBEDDING_DIM 一致（当前 1024）。
-- Supabase 的默认 search_path 已包含 extensions，函数内也会显式声明。
create extension if not exists vector with schema extensions;

-- STATEMENT
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- STATEMENT
create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.nodes(id) on delete cascade,
  title text not null,
  summary text not null default '',
  detail text not null default '',
  manual_position jsonb,
  status text not null default 'active' check (status in ('active', 'inbox')),
  aliases text[] not null default '{}',
  mastery real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- STATEMENT
-- 兼容已建库的项目：补上"完整讲解正文"与"手动空间位置"两列（幂等）。
alter table public.nodes add column if not exists detail text not null default '';

-- STATEMENT
alter table public.nodes add column if not exists manual_position jsonb;

-- STATEMENT
-- 语义向量（P1-A）：embedding 为 pgvector 向量，embedding_model 隔离不同模型的向量空间。
alter table public.nodes add column if not exists embedding vector(1024);

-- STATEMENT
alter table public.nodes add column if not exists embedding_model text;

-- STATEMENT
alter table public.nodes add column if not exists embedding_updated_at timestamptz;

-- STATEMENT
-- 维度守卫：已存在 embedding 列但维度不是 1024 时直接报错，避免静默错配。
do $$
declare
  current_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into current_type
    from pg_attribute a
   where a.attrelid = 'public.nodes'::regclass
     and a.attname = 'embedding'
     and not a.attisdropped;
  if current_type is not null and current_type not like '%vector(1024)' then
    raise exception 'nodes.embedding 维度不匹配：当前 %，期望 vector(1024)。请先迁移该列或删除后重新执行。', current_type;
  end if;
end;
$$;

-- STATEMENT
create index if not exists nodes_embedding_hnsw_idx
  on public.nodes using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- STATEMENT
create index if not exists nodes_user_parent_idx on public.nodes (user_id, parent_id);

-- STATEMENT
create unique index if not exists nodes_unique_title_idx
  on public.nodes (
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(title)
  );

-- STATEMENT
create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_node uuid not null references public.nodes(id) on delete cascade,
  to_node uuid not null references public.nodes(id) on delete cascade,
  type text not null check (type in ('prerequisite', 'related', 'contrast', 'source')),
  confidence real not null default 1,
  origin text not null default 'ai' check (origin in ('seed', 'ai', 'user')),
  created_at timestamptz not null default now(),
  constraint relations_nodes_distinct check (from_node <> to_node),
  constraint relations_undirected_normalized check (
    type in ('prerequisite', 'source') or from_node::text < to_node::text
  )
);

-- STATEMENT
create unique index if not exists relations_unique_idx
  on public.relations (user_id, from_node, to_node, type);

-- STATEMENT
create index if not exists relations_from_idx on public.relations (user_id, from_node);

-- STATEMENT
create index if not exists relations_to_idx on public.relations (user_id, to_node);

-- STATEMENT
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat', 'image')),
  question text not null default '',
  answer text not null default '',
  image_path text,
  created_at timestamptz not null default now()
);

-- STATEMENT
create table if not exists public.node_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  primary key (node_id, source_id)
);

-- STATEMENT
-- 会话：每个用户可以把问答分成多个独立上下文；chat_messages 通过 conversation_id 归属。
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- STATEMENT
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- STATEMENT
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  image_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- STATEMENT
-- 兼容旧库：补上会话归属列（可空，旧消息在下方回填）。
alter table public.chat_messages
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

-- STATEMENT
create index if not exists chat_messages_conversation_idx
  on public.chat_messages (user_id, conversation_id, created_at);

-- STATEMENT
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

-- STATEMENT
-- 迁移旧数据：把每个用户没有会话归属的历史消息收进一条「历史对话」。
-- 若之后又出现 null（旧客户端写入），再执行本脚本也会兜底处理。
do $$
declare
  target record;
  created_id uuid;
begin
  for target in
    select user_id, min(created_at) as first_at, max(created_at) as last_at
    from public.chat_messages
    where conversation_id is null
    group by user_id
  loop
    insert into public.conversations (id, user_id, title, created_at, updated_at)
    values (gen_random_uuid(), target.user_id, '历史对话', target.first_at, target.last_at)
    returning id into created_id;

    update public.chat_messages
       set conversation_id = created_id
     where user_id = target.user_id
       and conversation_id is null;
  end loop;
end;
$$;

-- STATEMENT
-- 向量检索 RPC：只返回当前用户、当前 embedding 模型的 top-k，相似度 = 1 - 余弦距离。
create or replace function public.match_nodes(
  query_embedding vector(1024),
  match_count integer default 8,
  min_similarity real default 0,
  p_model text default null
)
returns table (node_id uuid, title text, summary text, similarity real)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    n.id as node_id,
    n.title,
    n.summary,
    (1 - (n.embedding <=> query_embedding))::real as similarity
  from public.nodes n
  where n.user_id = auth.uid()
    and n.embedding is not null
    and (p_model is null or n.embedding_model = p_model)
    and (1 - (n.embedding <=> query_embedding)) >= coalesce(min_similarity, 0)
  order by n.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 8), 1), 50);
$$;

-- STATEMENT
-- 写入/更新节点向量：RLS 决定可写范围，越权或节点不存在时明确报错。
create or replace function public.set_node_embedding(
  p_node_id uuid,
  p_embedding vector(1024),
  p_model text
)
returns void
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  update public.nodes
     set embedding = p_embedding,
         embedding_model = p_model,
         embedding_updated_at = now()
   where id = p_node_id
     and user_id = auth.uid();
  if not found then
    raise exception '节点不存在或无权修改' using errcode = '42501';
  end if;
end;
$$;

-- STATEMENT
-- 回填用：当前用户缺向量、或向量由其它模型生成的节点（上限 500，客户端分批循环）。
create or replace function public.list_nodes_missing_embedding(p_model text)
returns table (id uuid, title text, summary text)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select n.id, n.title, n.summary
  from public.nodes n
  where n.user_id = auth.uid()
    and (n.embedding is null or n.embedding_model is distinct from p_model)
  order by n.created_at asc
  limit 500;
$$;

-- STATEMENT
grant execute on function public.match_nodes(vector, integer, real, text) to anon, authenticated;

-- STATEMENT
grant execute on function public.set_node_embedding(uuid, vector, text) to anon, authenticated;

-- STATEMENT
grant execute on function public.list_nodes_missing_embedding(text) to anon, authenticated;

-- STATEMENT
-- 指标埋点：只记事件名、小体量属性与时间，不存问题/答案正文。
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- STATEMENT
create index if not exists events_user_created_idx
  on public.events (user_id, created_at desc);

-- STATEMENT
create index if not exists events_name_created_idx
  on public.events (name, created_at desc);

-- STATEMENT
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- STATEMENT
drop trigger if exists nodes_set_updated_at on public.nodes;
create trigger nodes_set_updated_at
  before update on public.nodes
  for each row execute function public.set_updated_at();

-- STATEMENT
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- STATEMENT
drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- STATEMENT
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- STATEMENT
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- STATEMENT
grant usage on schema public to anon, authenticated;

-- STATEMENT
grant select, insert, update, delete
  on public.profiles, public.nodes, public.relations, public.sources, public.node_sources, public.conversations, public.chat_messages, public.events
  to anon, authenticated;

-- STATEMENT
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'nodes', 'relations', 'sources', 'node_sources', 'conversations', 'chat_messages', 'events'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('drop policy if exists %I on public.%I', target || '_owner_select', target);
    execute format(
      'create policy %I on public.%I for select using (user_id = auth.uid())',
      target || '_owner_select', target
    );
    execute format('drop policy if exists %I on public.%I', target || '_owner_insert', target);
    execute format(
      'create policy %I on public.%I for insert with check (user_id = auth.uid())',
      target || '_owner_insert', target
    );
    execute format('drop policy if exists %I on public.%I', target || '_owner_update', target);
    execute format(
      'create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
      target || '_owner_update', target
    );
    execute format('drop policy if exists %I on public.%I', target || '_owner_delete', target);
    execute format(
      'create policy %I on public.%I for delete using (user_id = auth.uid())',
      target || '_owner_delete', target
    );
  end loop;
end;
$$;

-- STATEMENT
-- 聊天消息除了归属当前用户，还要求 conversation_id 指向自己的会话，避免跨用户引用。
drop policy if exists chat_messages_owner_insert on public.chat_messages;
create policy chat_messages_owner_insert on public.chat_messages
  for insert
  with check (
    user_id = auth.uid()
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
      )
    )
  );

-- STATEMENT
drop policy if exists chat_messages_owner_update on public.chat_messages;
create policy chat_messages_owner_update on public.chat_messages
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
      )
    )
  );
