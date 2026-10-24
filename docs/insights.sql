-- ============================================================================
-- 知脉 · P1-B 指标查询（insights）
--
-- 使用方式：整段粘贴到 Supabase Dashboard → SQL Editor 执行。
-- 权限注意：public.events 与 public.nodes 都启用了 RLS（只能看自己的行）。
--   SQL Editor 默认以项目 postgres（service role）身份运行，能聚合全量数据；
--   若改用 anon/authenticated key 连接（如 PostgREST / 应用内），只能看到本人数据。
-- 事件结构：public.events(id uuid, user_id uuid, name text, props jsonb, created_at timestamptz)
--   事件名清单见 src/lib/analyticsCore.ts 的 EVENTS；
--   props 在写入前被 sanitizeProps 清洗过：只有 string/number/boolean 标量，最多 12 个键。
-- 时间口径：统一按东八区 Asia/Shanghai 切日 / 切周（与产品使用场景一致）。
-- 空表安全：所有聚合都做了 nullif 防除零，events 为空时返回 0 行或 NULL，不会报错。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) 埋点自检：最近 20 条事件
-- 用途：确认埋点是否真的落库（验收标准：测试账号能产生 10 条以上事件）。
-- ----------------------------------------------------------------------------
select created_at, name, props
from public.events
order by created_at desc
limit 20;


-- ----------------------------------------------------------------------------
-- 1) 每日命中率
-- 口径：hit_attempt 每次提问记一条，props.hit 为 JSON boolean（命中 true）。
--   命中率 = 命中条数 / 尝试条数。
-- 注意：props.hit 是 track() 写入的真 boolean，>-> 得到 'true'/'false' 可安全 cast；
--   若历史上手工塞过非布尔字符串，整个查询会因 cast 报错（可改用 (props->>'hit') = 'true'）。
-- ----------------------------------------------------------------------------
select
  (created_at at time zone 'Asia/Shanghai')::date as day,
  count(*) as attempts,
  count(*) filter (where coalesce((props ->> 'hit')::boolean, false)) as hits,
  round(
    100.0 * count(*) filter (where coalesce((props ->> 'hit')::boolean, false))
      / nullif(count(*), 0),
    1
  ) as hit_rate_pct
from public.events
where name = 'hit_attempt'
group by 1
order by 1 desc;


-- ----------------------------------------------------------------------------
-- 2) 周收编率
-- 口径：capture_shown 每条消息记录本次展示的收编建议数（props.count）；
--   capture_adopted 每收编一张卡片记一条。
--   收编率 = 收编卡片数 / 展示建议数。
-- 注意：
--   - 展示与收编按各自事件发生时间归周，跨周收编（周一展示、周二收编）会落到不同周，
--     这是「事件所在周」口径；若要严格同批转化，需按 messageId 关联（当前未采集）。
--   - sum 的 cast 对缺失/非法值会报错；正常埋点固定写入整数 count。
-- ----------------------------------------------------------------------------
with weekly as (
  select
    date_trunc('week', created_at at time zone 'Asia/Shanghai')::date as week_start,
    coalesce(
      sum((props ->> 'count')::int) filter (where name = 'capture_shown'),
      0
    ) as suggestions_shown,
    count(*) filter (where name = 'capture_adopted') as adopted
  from public.events
  where name in ('capture_shown', 'capture_adopted')
  group by 1
)
select
  week_start,
  suggestions_shown,
  adopted,
  round(100.0 * adopted / nullif(suggestions_shown, 0), 1) as adopt_rate_pct
from weekly
order by week_start desc;


-- ----------------------------------------------------------------------------
-- 3) 7 日留存（按首次活跃日分队列）
-- 口径：
--   - cohort_day = 用户产生任意事件的第一天；
--   - dN = 该用户在 cohort_day + N 天有任意事件（经典按日留存，非「7 天内任意一天」）；
--   - 队列用户数 = 该日首次活跃的用户数，百分比 = dN / 队列用户数。
-- 实现：先用 min() 求首次活跃日，再用 correlated exists 逐天判断（每用户 1 行），
--   避免 join 多日活动行导致计数放大。
-- 注意：只统计「产生过事件」的用户；注册但零事件的用户在 events 里不存在。
-- ----------------------------------------------------------------------------
with first_active as (
  select
    user_id,
    min((created_at at time zone 'Asia/Shanghai')::date) as cohort_day
  from public.events
  group by user_id
),
cohort_flags as (
  select
    f.cohort_day,
    f.user_id,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 1
    ) as d1,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 2
    ) as d2,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 3
    ) as d3,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 4
    ) as d4,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 5
    ) as d5,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 6
    ) as d6,
    exists (
      select 1 from public.events e
      where e.user_id = f.user_id
        and (e.created_at at time zone 'Asia/Shanghai')::date = f.cohort_day + 7
    ) as d7
  from first_active f
)
select
  cohort_day,
  count(*) as cohort_users,
  count(*) filter (where d1) as d1_users,
  round(100.0 * count(*) filter (where d1) / nullif(count(*), 0), 1) as d1_pct,
  count(*) filter (where d2) as d2_users,
  round(100.0 * count(*) filter (where d2) / nullif(count(*), 0), 1) as d2_pct,
  count(*) filter (where d3) as d3_users,
  round(100.0 * count(*) filter (where d3) / nullif(count(*), 0), 1) as d3_pct,
  count(*) filter (where d4) as d4_users,
  round(100.0 * count(*) filter (where d4) / nullif(count(*), 0), 1) as d4_pct,
  count(*) filter (where d5) as d5_users,
  round(100.0 * count(*) filter (where d5) / nullif(count(*), 0), 1) as d5_pct,
  count(*) filter (where d6) as d6_users,
  round(100.0 * count(*) filter (where d6) / nullif(count(*), 0), 1) as d6_pct,
  count(*) filter (where d7) as d7_users,
  round(100.0 * count(*) filter (where d7) / nullif(count(*), 0), 1) as d7_pct
from cohort_flags
group by cohort_day
order by cohort_day desc;


-- ----------------------------------------------------------------------------
-- 4) 功能使用计数
-- 口径：按事件名统计总条数、去重用户数、首末次发生时间；按条数降序。
-- 用途：一眼看出哪些功能被真实使用、哪些埋点还没跑起来。
-- ----------------------------------------------------------------------------
select
  name,
  count(*) as event_count,
  count(distinct user_id) as users,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from public.events
group by name
order by event_count desc, name;


-- ----------------------------------------------------------------------------
-- 5) 命中来源分布与平均相似度
-- 口径：hit_attempt 的 props.source 标识命中来源（如 vector / keyword / none），
--   props.score 为命中相似度（0–1，未命中或关键词兜底时可能缺省）。
--   按来源分组统计尝试数、命中率与平均相似度。
-- 注意：
--   - avg 自动跳过 NULL，所以「平均分」只覆盖带 score 的命中；
--   - 来源缺失归入 (unknown)；score 若被非数字污染 cast 会报错（正常埋点不会）。
-- ----------------------------------------------------------------------------
select
  coalesce(props ->> 'source', '(unknown)') as source,
  count(*) as attempts,
  count(*) filter (where coalesce((props ->> 'hit')::boolean, false)) as hits,
  round(
    100.0 * count(*) filter (where coalesce((props ->> 'hit')::boolean, false))
      / nullif(count(*), 0),
    1
  ) as hit_rate_pct,
  round(avg((props ->> 'score')::numeric), 3) as avg_score
from public.events
where name = 'hit_attempt'
group by 1
order by attempts desc;


-- ----------------------------------------------------------------------------
-- 6) 向量覆盖率（P1-A 配套）
-- 口径：按 nodes.embedding_model 分组统计节点总数、已生成向量的节点数、覆盖率。
--   embedding 为 NULL 即未生成；embedding_model 与当前配置不一致的旧向量单独成组，
--   便于判断是否需要重建索引（backfill）。
-- 注意：
--   - 普通用户受 RLS 限制只能看到自己的节点，全量覆盖率需 service role；
--   - 只对 embedding 做 count(embedding)（判空），不会把 1024 维向量拉出来。
-- ----------------------------------------------------------------------------
select
  coalesce(embedding_model, '(none)') as embedding_model,
  count(*) as node_count,
  count(embedding) as embedded_count,
  round(100.0 * count(embedding) / nullif(count(*), 0), 1) as coverage_pct,
  max(embedding_updated_at) as last_embedded_at
from public.nodes
group by embedding_model
order by node_count desc;
