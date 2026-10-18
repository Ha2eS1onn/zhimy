-- 知脉 · P0 数据库结构
-- 幂等脚本：可以重复执行。被 scripts/db-init.mjs 按 “-- STATEMENT” 标记切分执行。
-- 也可以整段粘贴到 Supabase SQL Editor 里运行。

create extension if not exists pgcrypto;

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
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  image_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- STATEMENT
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

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
  on public.profiles, public.nodes, public.relations, public.sources, public.node_sources, public.chat_messages
  to anon, authenticated;

-- STATEMENT
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'nodes', 'relations', 'sources', 'node_sources', 'chat_messages'
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
