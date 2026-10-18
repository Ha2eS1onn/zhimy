# 知脉 · 进度汇报与后续计划（交接文档）

> 更新：2026-10-18 ｜ 分支 `main` ｜ 最新提交 `c947c7a` ｜ 阅读对象：接手本项目的开发者 / Agent
>
> 本文档只写"事实 + 决策 + 下一步"，产品理念与交互细节见 [产品方案](知脉-知识地图产品方案-v1.0.docx) 与 [README](../README.md)。

## 0. TL;DR

- 这是「知脉」——把 AI 答疑沉淀成**可寻址、可联想、可收纳的个人知识图谱**的 Web 应用（Next.js 16 + Supabase）。
- **方案里的 P0 已完整落地**，P1 的账号/持久化/页面/真实 AI（对话、抽取、讲解、关系建议）已提前完成；**最大缺口是「命中」仍是关键词匹配，以及没有指标埋点与部署**。
- 当前状态：`typecheck / lint / test（85 个）/ build` 全绿；真实 Supabase 云端 E2E（收编、命中、登录、详情编辑、关系编辑、拖拽定位）已验证通过。
- 下一步建议：**P1-A 真实命中（pgvector embedding）+ P1-B 指标埋点**（详见第 9、10 节）。

## 1. 运行与自检

### 环境要求

- Windows（当前开发机）+ Node.js >= 20.19 + npm
- Supabase 项目（免费版即可）：数据库、Auth 匿名登录已启用
- 国内网络需要代理：本机 Clash Verge，系统代理 `http://127.0.0.1:7897`

### 启动

```powershell
npm install                    # 首次
npm run dev:proxy              # 开发服务器（Node 请求走代理，必须）
# 或 npm run dev（网络可直连 supabase 时）
# http://localhost:3100
```

### 密钥与配置

- `.env.local`（**已 gitignore，内含真实 Supabase URL/anon key/DB 密码**）：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_DB_URL`（也可以只填数据库密码，`db:init` 会自动拼连接串；或改用 `SUPABASE_ACCESS_TOKEN` 走管理 API）
- 模板见 `.env.example`。**不要把真实密钥写进任何文档或提交。**

### 自检命令

```powershell
npm run typecheck
npm run lint
npm run test          # 85 个纯逻辑单测
npm run build         # 生产构建；路由含 /、/chat、/atlas、/node/[id]、/api/llm/chat
npm run db:init       # 幂等：建表/索引/RLS/触发器，并补齐增量列
npm run verify:rls    # 双匿名账号验证 RLS（需代理环境变量）
```

代理环境变量（跑 `db:init` / `verify:rls` / 无头脚本前）：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:NO_PROXY="localhost,127.0.0.1,::1"
$env:NODE_USE_ENV_PROXY="1"
```

### 本地端到端脚本（未提交，位于 `_verify/`，gitignored）

- `_verify/flow-check.mjs`：真实云端主流程（登录、载入示例图谱、命中、收编、3D 定位、持久化、详情重命名、设置登录入口）
- `_verify/features-check.mjs`：新功能验收（详情页生成/编辑/保存、关系创建、3D 拖拽定位）
- 两者依赖本机 Edge 无头模式 + 已存在的测试账号浏览器 profile（`_verify-cloud/edge-profile`）。换机器需重建 profile 或先用页面登录一次测试账号。
- 建议后续把它们整理进 `scripts/e2e/`（需要把依赖参数化）。

## 2. 进度总览（对照方案阶段）

| 阶段 | 方案要求 | 状态 | 说明 |
|---|---|---|---|
| P0 原型 | 可点击原型、3D 知识库、三端布局 | ✅ 完成 | 额外完成云账号与持久化（原属 P1） |
| P1 MVP | 账号、真实 AI、数据持久化、三大页面 | 🟡 约 80% | 账号✅ 持久化✅ 三大页面✅；真实 AI 的对话/抽取/讲解/关系建议✅；**命中仍关键词**、**图片未持久化**、**未部署** |
| P2 增强 | 复习、关系编辑、导出、分享 | 🟡 约 40% | 关系编辑✅ 导出 JSON✅；复习闭环、分享、Realtime、导入/删号未做 |

## 3. 已实现能力（模块 → 关键文件）

### 3.1 应用外壳 / 三端

- 桌面侧栏 216px / 平板图标栏 64px / 手机顶栏 + 底部 Tab
- 文件：`src/components/shell/*`、`src/app/layout.tsx`、`src/proxy.ts`（Supabase 会话刷新，Next 16 的 proxy 约定）
- 全局弹层：`Sheet`、`ToastViewport`、`PositionPicker`（`src/components/common/`）

### 3.2 账号（匿名游客 + 邮箱绑定 + 登录切换）

- 首次打开自动 `signInAnonymously()`；数据即云端
- 设置 → 账号：绑定游客账号 / 登录已有账号两个页签；邮箱已注册等错误会中文提示并引导登录
- 换账号时 `AppProviders` 检测 user id 变化，清空旧 store 再拉取
- 文件：`src/store/sessionStore.ts`、`src/lib/authErrors.ts`、`src/components/shell/SettingsSheet.tsx`、`src/lib/supabase/{browser,server}.ts`

### 3.3 对话 / 收编闭环

- 演示脚本流式回答（无模型 Key）与 BYOK 真实流式回答（OpenAI 兼容）
- 命中判定：目前是本地关键词（`src/lib/search.ts` 的 `resolveQuestion`）
- 真实抽取：`src/lib/ai/extract.ts`（检索候选 → 模型输出 JSON → 系统校验 title/parentId/relations；带最近对话上下文与防注入提示）
- 收编卡片：可改名称/摘要、换位置、取消；低置信度进 `inbox`
- 文件：`src/components/chat/*`、`src/store/chatStore.ts`、`src/store/graphStore.ts`

### 3.4 3D 知识库

- 确定性分层球壳布局 + **手动位置覆盖**：`src/lib/layout/layout.ts`（读 `node.manualPosition`，子树自动跟随）
- 投影/逆投影、轨道相机：`src/lib/atlas/camera.ts`（pitch ±55°、zoom 0.7–1.8，点击聚焦、双击复位）
- 渲染：`src/lib/atlas/renderer.ts`（预渲染光晕精灵、层级线、1 跳关系线、全部关系线模式、拖拽/落点高亮、折叠 +N）
- 交互：`src/components/atlas/CanvasAtlas.tsx`（空白拖拽旋转、节点拖拽移动 + 拖到节点上改父级 + 防环、双指缩放、连线模式点击）
- 页面/面板/工具栏：`src/components/atlas/AtlasScreen.tsx`、`AtlasPanel.tsx`
- 关系编辑：`RelationList.tsx`（改类型/删除）、`RelationEditor.tsx`（手动建立）、`RelationSuggestions.tsx`（同源启发式 + AI 推荐，采纳才写入）
- 只读调试钩子：开发环境 `window.__zhimyAtlasDebug.projectNode(id)`（生产不挂载，供 E2E 用）

### 3.5 知识点完整讲解子页

- 路由 `/node/[id]`：`src/app/node/[id]/page.tsx` → `src/components/node/NodeDetailPage.tsx`
- Markdown-lite 渲染/解析：`src/components/node/MarkdownLite.tsx`
- 编辑/预览 + Ctrl+S：`src/components/node/DetailEditor.tsx`
- AI 生成讲解：`src/lib/ai/detail.ts`（BYOK 生成 400–900 字结构化讲解；未配置模型时用确定性模板）
- 侧栏：来源对话（可展开）、关系（可编辑）、子知识点（可进入）、元信息

### 3.6 BYOK 模型接入

- 设置：服务商预设、Base URL/Key/模型/视觉模型、代理或直连、测试连接（`SettingsSheet.tsx`）
- 客户端：`src/lib/ai/llmClient.ts`（SSE、错误映射、AbortSignal、temperature/maxTokens）
- 服务端代理：`src/app/api/llm/chat/route.ts`（登录校验、https、域名白名单、DNS 私网拦截，防 SSRF；`src/lib/ai/proxyGuard.ts` + `ipGuard.ts`）
- Key 只存本机 localStorage，不入库、不导出

### 3.7 数据与运维

- 数据仓库抽象：`src/lib/repo/*`（Supabase 实现 + 演示模式内存实现）
- 导入示例图谱、导出 JSON、清空图谱/对话、RLS 校验脚本
- `db:init` 支持三种执行方式：直连 URI / 只填密码 / Supabase 管理 API（国内网络）
- 国内网络适配：`npm run dev:proxy`、README 的代理章节、`NODE_USE_ENV_PROXY=1`

## 4. 数据模型与迁移

### 表

| 表 | 关键字段 | 说明 |
|---|---|---|
| `profiles` | user_id, display_name, prefs | 账号资料（触发器自动创建） |
| `nodes` | id, user_id, parent_id, title, summary, **detail**, **manual_position**, status, aliases, mastery | 知识点；`detail`=Markdown 讲解，`manual_position`=绝对空间坐标 |
| `relations` | from_node, to_node, type, confidence, origin | 四类关系；无向类型按 id 排序，唯一索引 + check 约束 |
| `sources` | kind, question, answer, image_path | 一次问答/一张图 |
| `node_sources` | node_id, source_id | 多对多 |
| `chat_messages` | role, content, image_name, payload(jsonb) | 对话与命中/建议快照 |
| `events`（**未建**） | — | 下一步指标埋点用，见第 10 节 |

- 所有表启用 RLS，策略统一为 `user_id = auth.uid()`（`supabase/schema.sql` 底部的 DO 块批量创建）
- 路径**不落库**：运行时沿 `parent_id` 链拼装（`src/lib/path.ts`），改名/换父自动生效
- 迁移方式：改 `supabase/schema.sql`（用 `-- STATEMENT` 分隔）→ `npm run db:init`。新增列用 `alter table ... add column if not exists`，保持幂等
- 本次已新增：`detail text not null default ''`、`manual_position jsonb`

## 5. 关键设计决策（改代码前先理解）

1. **匿名优先账号**：降低学生注册摩擦；代价是未绑定前清缓存会丢入口，所以首页/设置都有绑定提醒。
2. **路径不落库**：只存 `parentId`，避免改名/换父后 path 脏数据。
3. **关系方向语义**：`from` 是关系主体（先修 = from 是 to 的基础）；相关/易混无向，入库前按 id 排序；改类型时由 store 调 `normalizePair` 重排，避免数据库 check 失败。
4. **手动位置是绝对坐标**：拖动父节点会带动未手动定位的子节点（布局以父位置重新计算）；已手动定位的节点不随父移动；可"恢复自动位置"。
5. **抽取/关系建议/命中均为"检索候选 → 模型做选择题 → 系统校验"**：模型不生成路径字符串，路径永远由父链拼装。
6. **AI 生成只提议，用户确认才写云**：收编、关系采纳、讲解保存都遵循这一点。
7. **演示模式与真实模式双轨**：无 Supabase 可内存运行（`NEXT_PUBLIC_DEMO_MODE=1`）；无模型 Key 时对话/抽取/讲解/关系用确定性脚本或模板。所有 UI 与交互都可离线演示。
8. **BYOK 代理白名单**：服务端不存 Key，但为防 SSRF，只允许 https + 白名单域名 + 拒绝私网解析；新增服务商需改 `src/lib/ai/proxyGuard.ts` 或环境变量 `LLM_PROXY_ALLOWED_HOSTS`。
9. **Markdown-lite 自研**：不引富文本/渲染依赖；只支持标题、列表、加粗、行内代码、引用、代码块、分割线。
10. **无新依赖**：3D、SSE、Markdown、关系图均为自研，保持小体量开源。

## 6. 已知限制与技术债

### 产品/功能

- **命中仍是关键词匹配**（`src/lib/search.ts`），换说法容易漏命中；方案目标命中率 > 80% 无法真实保证
- 图片只做本地预览，不上传、不持久化（BYOK 视觉模型可直传 dataURL，但历史消息/来源里看不到图）
- 无可观测指标（收编率/命中率/留存/可读性都没有采集）
- 未部署上线；无 CI；无 PWA service worker
- 无账号删除/数据删除入口；无 JSON 导入（只有导出）
- 复习闭环（掌握度/间隔重复/到期复习）未做
- 跨端同步靠"重新打开/切回页面刷新"，无 Realtime
- 关系置信度用户端固定 0.8，无滑杆；AI 建议理由不持久化
- Markdown-lite 不支持表格/图片/公式；详情正文无版本历史/撤销
- 演示模式数据在内存，刷新即重置
- 移动端手势较密（拖节点 vs 旋转靠"是否按中节点"区分），未做专门的编辑模式

### 工程/环境

- 本地开发强依赖 Clash 代理（`dev:proxy`）；直连 `*.supabase.co` 会被 reset
- Windows 沙箱/受限终端下 `next build`/`vitest`/无头 Edge 会 `spawn EPERM`（需要正常终端权限）
- `next-env.d.ts` 会在 dev / build 之间自动切换内容，`git status` 常变脏；提交前 `git checkout -- next-env.d.ts` 即可
- E2E 脚本在 `_verify/`（未提交，依赖本机 Edge 与测试账号 profile）
- 测试账号数据：Supabase 里有一个匿名账号被载入示例图谱、收编了"电路故障分析"、创建过测试关系、详情页有 E2E 标记；用户自己的浏览器账号是独立的，不受影响
- Supabase 免费项目 7 天不活跃会暂停（数据保留）

## 7. 后续计划（按优先级）

> 排序依据：先补齐"产品假设能否成立"的验证能力（真实命中 + 指标），再做真实拍题链路，最后部署与 P2 增强。

### P1-A 真实命中：pgvector embedding（最高优先）

**目标**：同一知识点换 5 种问法能命中；不同知识点不误命中；命中率可统计。

**改动点**
1. `supabase/schema.sql`：`create extension if not exists vector;`；`alter table nodes add column if not exists embedding vector(1536);`；HNSW 索引 `using hnsw (embedding vector_cosine_ops)`（维度需与所选 embedding 模型一致，**先决定模型**：OpenAI `text-embedding-3-small`=1536，bge-m3=1024 等，数据库列维度要一次定好）
2. BYOK 设置（`src/lib/ai/types.ts`、`SettingsSheet.tsx`）：新增 `embeddingModel` 字段 + 连通性测试
3. 新增 `src/lib/ai/embeddings.ts`：调用 OpenAI 兼容 `/embeddings`（复用 `/api/llm/chat` 的代理思路，新增 `src/app/api/llm/embeddings/route.ts`，同样做认证/白名单/防 SSRF）
4. 写入链路：节点创建（`graphStore.adopt`）与标题/摘要更新（`updateDetails`）后异步生成向量并更新 `nodes.embedding`（失败只记日志，不阻塞收编）
5. 读取链路：
   - `resolveQuestion` 改为异步：embed 问题 → 调用 Supabase RPC（`match_nodes` SQL 函数，`embedding <=> query` + `limit`）→ 阈值判定；无 embedding 配置时降级关键词
   - `extract.ts` / `relationSuggest.ts` 的候选构建改为向量检索 top-k（关键词兜底）
6. 迁移注意：存量节点需要回填向量（写一个 `scripts/embed-backfill.mjs` 用 BYOK 配置逐条补）
7. 测试：余弦相似度/阈值、RPC 参数校验、降级逻辑、候选排序

**验收**
- E2E：对同一节点用 5 种不同说法提问，≥4 次命中正确路径；无关问题不命中
- `npm run test` 新增向量相关单测通过；`npm run build` 通过
- 为指标埋点提供 hit/miss 事件（配合 P1-B）

### P1-B 指标埋点与验证（与 A 同迭代）

**目标**：能量化方案第 10 章的 4 个指标。

**改动点**
1. 迁移：`events` 表（`id, user_id, name, props jsonb, created_at`），RLS 只允许 insert/select 自己的行；索引 `(user_id, created_at)`
2. `src/lib/analytics.ts`：`track(name, props?)`，失败静默（不影响主流程）；演示模式下 console.debug
3. 埋点位置：
   - 对话发送、命中/未命中（`ChatScreen`）
   - 收编建议展示 / 收编 / 不收（`CaptureCard`）
   - 打开 3D 节点、详情页生成/保存讲解（`AtlasScreen` / `NodeDetailPage`）
   - 关系创建/采纳建议、拖拽保存位置
   - 登录/绑定成功
4. `docs/insights.sql`：收编率、命中率、7 日留存、功能使用计数等聚合视图（用 service role 在 Supabase SQL Editor 跑；普通用户 RLS 看不到全量）
5. 可选：`/insights` 简易页（仅本人数据）用于调试埋点是否生效

**验收**：测试账号产生 10 条事件后，SQL 视图返回非空；埋点不引起页面报错。

### P1-C 拍题链路真实化

- Supabase Storage 建私有 bucket `chat-images`，RLS 按 `auth.uid()` 分目录
- Composer 选图后上传，`sources.image_path` 存对象路径；消息/来源/详情页显示签名 URL
- 视觉模型调用继续用 dataURL（不改协议）；历史记录展示原图
- 验收：手机拍照 → 提问 → 刷新后仍能看到图片与解答

### P1-D 部署 + CI（与真实用户试用绑定）

- 平台选择（待定）：Vercel 最省事；国内访问优先考虑 EdgeOne Pages / 自建 VPS；Supabase 保持 Singapore
- GitHub Actions：`npm ci` → typecheck → lint → test → build
- Supabase 生产配置：Site URL / Redirect URLs（邮箱确认回跳）、匿名登录、备份策略
- 环境变量清单写入 README；`db:init` 作为发布步骤
- 可选：PWA manifest + 简单离线壳
- 验收：公网可访问，新用户能完成"提问 → 收编 → 3D 找到"

### P2 增强（验证后再排）

1. **复习闭环**：`review_state` 表（due_at/interval/ease/mastery/last_reviewed）、到期复习页、对话后推荐复习；与掌握度联动
2. **Realtime 跨端同步**：Supabase `postgres_changes` 订阅 nodes/relations/messages；冲突 last-write-wins
3. **合规与数据管理**：账号/数据删除、JSON 导入、隐私说明（未成年人场景）
4. **分享与导出**：知识图谱长图/只读链接；复习卡片导出
5. **移动端打磨**：显式"编辑模式"开关（区分旋转与拖拽）、手势提示、长文阅读优化
6. **3D 性能**：500 节点压力测试、静态帧渲染优化、WebGL 升级评估

## 8. 下一个迭代的具体任务拆解（建议直接照此排期）

| # | 任务 | 涉及文件 | 产出/验收 |
|---|---|---|---|
| 1 | 定 embedding 模型与维度（与产品确认） | — | 决策记录到本文档 |
| 2 | schema 迁移：vector 扩展、embedding 列、HNSW、`match_nodes` RPC | `supabase/schema.sql` | `npm run db:init` 幂等通过 |
| 3 | BYOK 增加 embedding 模型设置 + 代理路由 | `src/lib/ai/types.ts`、`SettingsSheet.tsx`、`src/app/api/llm/embeddings/route.ts` | 测试连接通过 |
| 4 | embeddings 客户端 + 写入链路（adopt/updateDetails 后异步） | `src/lib/ai/embeddings.ts`、`src/store/graphStore.ts` | 新节点自动有向量 |
| 5 | 存量回填脚本 | `scripts/embed-backfill.mjs` | 脚本可重复执行 |
| 6 | 命中改为向量检索 + 降级 | `src/lib/search.ts`、`ChatScreen.tsx` | 5 种问法命中 ≥4 |
| 7 | 抽取/关系候选改为向量检索 + 降级 | `src/lib/ai/extract.ts`、`relationSuggest.ts` | 单测 + 抽查效果 |
| 8 | events 表 + analytics + 埋点 | 见 P1-B | 视图有数据 |
| 9 | 指标 SQL 视图文档 | `docs/insights.sql` | 4 个指标可查 |
| 10 | 测试/构建/E2E/README 更新 | `tests/*`、`README.md` | 全绿 |

## 9. 接手第一步 checklist

1. 读 [README](../README.md)、本文档、[产品方案](知脉-知识地图产品方案-v1.0.docx)
2. 确认 `.env.local` 存在且 Supabase 项目可访问（问项目所有者，不要提交密钥）
3. `npm install`；`npm run dev:proxy` 打开页面；确认当前匿名账号可用
4. 跑一遍自检：`typecheck` → `lint` → `test` → `build` → `db:init`（确认 23 条语句 ok）
5. 浏览关键路径：对话收编 → 3D 定位/拖拽/连线 → 详情页生成与编辑
6. 从第 8 节任务 #1 开始；每完成一项跑全量检查 + 提交
7. 提交前：`git checkout -- next-env.d.ts`（避免生成文件噪音），确认 `.env.local` 未被提交

## 10. 风险与注意事项

- **密钥**：`.env.local` 内含 Supabase 与（可选）管理 API token，严禁提交；不要在文档/截图里暴露
- **数据安全**：RLS 已验证，但新增表（events、review_state、图片 bucket）必须同时写 RLS 策略并跑 `verify:rls` 思路的越权校验
- **成本**：AI 生成（对话/抽取/讲解/关系建议）用的是用户自己的 Key；embedding 回填会产生一次性费用，注意批量与速率
- **中国网络**：项目 API 域名直连被 reset，浏览器走系统代理、Node 需 `dev:proxy`；部署平台也要考虑国内可访问性
- **免费 Supabase**：7 天不活跃暂停；正式试用前评估升级
- **未成年人**：面向学生的产品，P1-D 部署前至少要有隐私说明、内容安全策略与数据删除能力
- **演示数据**：demo 模式的种子数据只用于展示；真实账号首次进入是空图谱，可用「载入示例图谱」

## 11. 常用文件索引

| 想改什么 | 先看哪里 |
|---|---|
| 页面/路由 | `src/app/**/page.tsx`、`src/components/shell/AppShell.tsx` |
| 全局状态 | `src/store/{graph,chat,session,settings,ui,toast}Store.ts` |
| 数据读写/迁移字段 | `src/lib/repo/{types,supabaseRepo,memoryRepo,mappers}.ts`、`supabase/schema.sql` |
| 3D 布局与交互 | `src/lib/layout/*`、`src/lib/atlas/*`、`src/components/atlas/*` |
| AI 能力 | `src/lib/ai/{llmClient,extract,detail,relationSuggest}.ts`、`src/app/api/llm/chat/route.ts` |
| 路径/检索/关系规则 | `src/lib/{path,search,relations}.ts` |
| 账号与设置 | `src/store/sessionStore.ts`、`src/components/shell/SettingsSheet.tsx`、`src/lib/authErrors.ts` |
| 文案与视觉令牌 | `src/app/globals.css`（颜色/断点/字体） |
| 指标（下一步） | 新建 `src/lib/analytics.ts` + `supabase/schema.sql` events 表 + `docs/insights.sql` |

## 12. 决策记录（需要改之前先确认）

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-10-17 | 采用 Next.js 全栈 + Supabase（而非 Vite 纯前端） | 需要三端互通/云持久化/账号 |
| 2026-10-17 | 匿名游客 + 邮箱绑定（非强制注册） | 降低学生使用门槛 |
| 2026-10-17 | 不用 Prisma，`supabase-js` + SQL 迁移 | 少一层依赖，RLS 直连 |
| 2026-10-18 | 真实抽取/关系建议用"候选选择题" | 防模型编造 id/路径 |
| 2026-10-18 | 手动位置为绝对坐标 | 实现简单、可预测；用"恢复自动位置"兜底 |
| 2026-10-18 | 命中暂用关键词，P1 换 embedding | 先验证交互闭环，控制 P0 范围 |
| 2026-10-18 | 不引入第三方 UI/3D/Markdown 库 | 小体量开源、可离线、易维护 |
