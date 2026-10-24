# 知脉 · 进度汇报与后续计划（交接文档）

> 更新：2026-10-24 ｜ 分支 `main` ｜ 线上 Demo <https://zhimy.kasho.fun>（备用 <https://zhimy.vercel.app>） ｜ 仓库 <https://github.com/Ha2eS1onn/zhimy> ｜ 阅读对象：接手本项目的开发者 / Agent
>
> 本文档只写"事实 + 决策 + 下一步"，产品理念与交互细节见 [产品方案](知脉-知识地图产品方案-v1.0.docx) 与 [README](../README.md)。
>
> 项目定位：**个人开源、非商业（MIT）**，重心是技术实现与工程质量；线上 Demo 仅用于技术展示，不以用户量/商业化为目标。

## 0. TL;DR

- 这是「知脉」——把 AI 答疑沉淀成**可寻址、可联想、可收纳的个人知识图谱**的 Web 应用（Next.js 16 + Supabase）。
- **P1-A 真实命中（pgvector 1024 维 + 关键词兜底）与 P1-B 指标埋点（events + insights）已完成 ✅**；**P1-C 拍题链路代码完成 🟡**（原图只喂当次请求的模型、视觉模型优先，不上传云端；聊天缩略图存本机 IndexedDB；浏览器验收待执行）；**P1-D 已完成 ✅**——仓库已公开、CI 首跑全绿、Vercel 生产部署上线（主域名 <https://zhimy.kasho.fun>，备用 <https://zhimy.vercel.app>，Let's Encrypt 证书已签发）、keepalive 已配置并手动验证通过、Git 连接已开启 push 自动部署（2026-10-24）。
- 当前状态（2026-10-24）：**P1 全部改动已提交并推送**（`b659a6b` 向量命中 / `872233b` 会话+埋点+拍题+公式 / `a3654f1` 部署与 CI / `934c6ec` 徽章 / `5e6ecf4`、`4888c28`、`aa7762c` 部署与域名文档）。整体验证：`typecheck` / `lint` 通过、vitest **26 个文件 201 个用例全绿**、`next build` 通过（8 条路由 + Proxy）、CI 在 GitHub 上实跑全绿（2m36s）、`npm run db:init` 47 条语句全部 ok、线上 `/api/health` 返回 `{"ok":true}`、匿名登录 REST 校验通过。**线上 E2E（Playwright / Chromium headless，2026-10-24）14/14 通过、0 console error / 0 page error / 0 failed request**：`?demo=1` 自动载入 102 节点 → 3D 渲染 → 对话流式回答 → 抽取 2 张收编卡 → 收编写入 → `/atlas?node=` 深链定位 → 详情页 AI 模板生成 → 保存 → 刷新后仍在 → 进入对话页默认新会话。**尚未执行**：`verify-rls` 双账号校验、拍题/公式/思维链的线上自动化验收、向量命中「5 种问法」验收（缺真实 embedding Key）。
- **向量命中的「5 种问法 ≥4 命中」云端验收尚未执行**：需要维护者配置真实 embedding Key 后按第 9 节 checklist 验证；无 Key 时按设计降级关键词，不影响构建与基础使用。
- 部署方案：**Vercel Hobby（免费）+ GitHub Actions CI + 每日 keepalive**，定位是公开 Demo 与工程完整度；不做 VPS/Docker/备案/商业合规（详见 P1-D 与 `docs/DEPLOY.md`）。
- 下一步建议：① 配真实 embedding Key 跑「5 种问法 ≥4 命中」与 `docs/insights.sql` 落库验收；② 补拍题/公式/思维链的线上专项验收（主闭环已 E2E 通过）；③ P2 增强（复习闭环、Realtime、分享）。自定义域名与 Supabase Auth 的 Site URL / Redirect URLs 已于 2026-10-24 配置完成。
- 流式体验（2026-10-24）：SSE 支持读取 `reasoning_content` / `reasoning` / `thinking` / `reasoning_details`，聊天里展示可折叠「思考过程」；正文用前端打字机逐字上屏。思维链存入当前账号的 `chat_messages.payload`（上限 2 万字），不写 events。
- 多会话（2026-10-24）：新增 `conversations`，`chat_messages.conversation_id` 归属；进入 `/chat` 默认新对话（空会话不写库，发第一条消息才建会话），顶部「历史」切换/删除，`?c=` 恢复；每个会话的上下文完全隔离。system prompt 同时放宽到全学科（哲学、编程等）。

## 1. 运行与自检

### 环境要求

- Windows（当前开发机）+ Node.js **22**（仓库含 `.nvmrc`，CI 也用它；最低 >= 20.19）+ npm
- Supabase 项目（免费版即可）：数据库、Auth 匿名登录已启用；本轮 schema 需要 pgvector（`db:init` 自动创建）
- 国内网络通常需要代理（本机 Clash Verge，系统代理 `http://127.0.0.1:7897`）。**本机 2026-10-23 实测：Postgres 5432 可直连（`db:init` 与 `verify-rls --direct` 可用），但 HTTPS（Auth/PostgREST）会被重置**；浏览器端能否直连取决于当时网络，Node 侧 HTTPS 失败时用 `dev:proxy` 或下文代理环境变量。

### 启动

```powershell
npm install                    # 首次
npm run dev:proxy              # 开发服务器（Node 请求走代理；网络能直连时可省略）
# 或 npm run dev（网络可直连 supabase 时）
# http://localhost:3100
```

### 密钥与配置

- `.env.local`（**已 gitignore，内含真实 Supabase URL/anon key/DB 密码**）：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_DB_URL`（也可以只填数据库密码，`db:init` 会自动拼连接串；或改用 `SUPABASE_ACCESS_TOKEN` 走管理 API）
  - （可选）`EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`：**仅 `npm run embed:backfill` 本地回填脚本使用**，运行时不读；向量模型本身仍由用户在「设置 → 模型 → 向量模型」里配置（Key 只存本机 localStorage）
- 模板见 `.env.example`。**不要把真实密钥写进任何文档或提交。**
- 线上部署（Vercel）**只配两个 `NEXT_PUBLIC_*` 变量**；不要配 `NEXT_PUBLIC_DEMO_MODE` / `SUPABASE_DB_URL` / `SUPABASE_ACCESS_TOKEN`，见 `docs/DEPLOY.md`。

### 自检命令

```powershell
npm run typecheck
npm run lint
npm run test          # 纯逻辑单测（本轮新增向量/埋点/schema 相关用例，数量以实际输出为准）
npm run build         # 生产构建；路由含 /、/chat、/atlas、/node/[id]、/api/llm/chat、/api/llm/embeddings、/api/health
npm run db:init       # 幂等：建表/索引/RLS/触发器 + pgvector/embedding 列/HNSW/RPC + events 表
npm run verify:rls    # 双匿名账号验证 RLS（需代理环境变量）
node scripts/verify-rls.mjs --direct   # 用 SUPABASE_DB_URL 直连 Postgres 校验同一套 RLS（含 events/向量表/会话归属；HTTPS 被重置时用）
npm run embed:backfill # 用 BYOK 向量模型回填存量节点向量（读 .env.local 的 SUPABASE_DB_URL + EMBEDDING_*；支持 -- --dry-run/--force）
```

CI：`.github/workflows/ci.yml` 在 push / PR 上跑 `npm ci → typecheck → lint → test → build`（不配置任何云端密钥）；Supabase 保活见 `.github/workflows/keepalive.yml`。

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
| P1 MVP | 账号、真实 AI、数据持久化、三大页面 | ✅ 完成 | 账号✅ 持久化✅ 三大页面✅ 真实 AI✅；P1-A 向量命中✅、P1-B 指标埋点✅、P1-C 拍题缩略图（本地）🟡 浏览器验收待跑、P1-D 部署✅（线上 Demo 已上线） |
| P2 增强 | 复习、关系编辑、导出、分享 | 🟡 约 40% | 关系编辑✅ 导出 JSON✅；复习闭环、分享、Realtime、导入/删号未做 |

P1 子项状态：

| 子项 | 状态 | 说明 |
|---|---|---|
| P1-A 真实命中 | ✅ 完成 | pgvector 1024 维 + HNSW，余弦相似度 ≥ 0.78 命中；未配置/异常/低分降级关键词 |
| P1-B 指标埋点 | ✅ 完成 | `events` 表（RLS）+ `src/lib/analytics.ts` + `docs/insights.sql` |
| P1-C 拍题链路 | 🟡 代码完成，浏览器验收待执行 | 原图只用于当次视觉模型请求，不上传云端；聊天/来源缩略图存本机 IndexedDB（2026-10-24 决策，见第 5 节 #16） |
| P1-D 部署 + CI | ✅ 完成（2026-10-24） | GitHub 仓库公开 + CI 全绿；Vercel 生产部署 <https://zhimy.kasho.fun>（备用 vercel.app）；keepalive 已配 `vars.SUPABASE_URL` / `secrets.SUPABASE_ANON_KEY` 并手动跑通；已连接 Git（push 自动部署） |

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
- 命中判定：**向量优先**——`src/lib/ai/hit.ts` 的 `resolveHit`（问题 embed → `match_nodes` top-k → 相似度 ≥ 0.78 视为命中并给出路径）；未配置向量模型、调用异常/超时或相似度不足时**降级关键词**（`src/lib/search.ts` 的 `resolveQuestion`）
- 真实抽取：`src/lib/ai/extract.ts`（检索候选 → 模型输出 JSON → 系统校验 title/parentId/relations；带最近对话上下文与防注入提示）；候选召回向量优先、关键词补齐
- 收编卡片：可改名称/摘要、换位置、取消；低置信度进 `inbox`。**「换个位置」支持新建父级路径**（`物理 / 电学`，同父级同名复用、缺失逐级创建，`graphStore.createPath`），用户显式选过位置/新建路径后收编直接 `active`（`adopt({ forceActive })`）。**同名收编复用（2026-10-24）**：`adopt` 先按「同父级 + 标题大小写不敏感」查重，命中则复用已有节点、只补来源与关系（摘要为空时补写），返回 `reused`，卡片显示「已关联」，不再撞唯一索引
- 拍题图片：原图只在本次请求内使用，**不落库、不上传 Storage**；发送前压到最长边 1600（控制 base64 请求体），图片请求优先使用设置里的视觉模型，未配置时沿用文本模型并提示一次；缩略图（640px / JPEG 0.72）写入本机 IndexedDB，聊天气泡与知识点来源页按 id 读取（换设备/清缓存后只显示文件名）
- 多会话：`conversations` 存会话标题/更新时间，`chat_messages.conversation_id` 归属；聊天页进入时默认新对话，发送第一条消息才创建会话；历史面板可切换/删除；每个会话独立加载消息，`buildRecentContext` 与模型历史都只读当前会话
- 流式思维链与打字机：`sse.ts` 同时提取正文与 reasoning；`ChatScreen` 收到 reasoning chunk 后显示「思考过程」面板，正文交给 `useTypewriter` 逐字上屏；完整 reasoning 随 assistant 消息写入 `payload.reasoning`（`MessageBubble` 里默认折叠，可回看）
- 文件：`src/components/chat/*`、`src/store/chatStore.ts`、`src/store/graphStore.ts`、`src/lib/ai/hit.ts`、`src/lib/ai/semanticSearch.ts`、`src/lib/ai/semanticClient.ts`

### 3.4 3D 知识库

- 确定性分层球壳布局 + **手动位置覆盖**：`src/lib/layout/layout.ts`（读 `node.manualPosition`，子树自动跟随）
- 投影/逆投影、轨道相机：`src/lib/atlas/camera.ts`（pitch ±55°、zoom 0.7–1.8，点击聚焦、双击复位）
- 渲染：`src/lib/atlas/renderer.ts`（预渲染光晕精灵、层级线、1 跳关系线、全部关系线模式、拖拽/落点高亮、折叠 +N）
- 交互：`src/components/atlas/CanvasAtlas.tsx`（空白拖拽旋转、节点拖拽移动 + 拖到节点上改父级 + 防环、双指缩放、连线模式点击）
- 页面/面板/工具栏：`src/components/atlas/AtlasScreen.tsx`、`AtlasPanel.tsx`
- 位置选择：`src/components/common/PositionPicker.tsx`（搜索/顶层 + 新建父级路径），atlas 面板、详情页、首页整理待处理、收编卡片共用；换位置时会把「自己 + 后代」传给 `createPath` 做循环守卫（`src/lib/path.ts` 的 `blockedSubtree`）。**2026-10-24 起守卫下沉到 store**：`reparentError` 统一校验，`graphStore.reparent` / `moveNode` 都会先检查，避免其它调用方绕过 UI 造环
- 关系编辑：`RelationList.tsx`（改类型/删除）、`RelationEditor.tsx`（手动建立）、`RelationSuggestions.tsx`（同源启发式 + AI 推荐，采纳才写入）
- 只读调试钩子：开发环境 `window.__zhimyAtlasDebug.projectNode(id)`（生产不挂载，供 E2E 用）

### 3.5 知识点完整讲解子页

- 路由 `/node/[id]`：`src/app/node/[id]/page.tsx` → `src/components/node/NodeDetailPage.tsx`
- Markdown-lite 渲染/解析：`src/components/node/MarkdownLite.tsx`
- **数学公式（2026-10-24 改用 KaTeX）**：`src/components/node/TeXMath.tsx` 用 `katex.renderToString` 渲染（`throwOnError:false`、`trust:false`、MathML），KaTeX CSS 在 `layout.tsx` 引入；`src/lib/math/inline.ts` 负责 `$...$`/`$$...$$`/`\(...\)`/`\[...\]` 分词，`src/lib/math/display.ts` 负责聊天里跨行/行中的独立公式；`RichText` 先切 display 段再逐行渲染。自研 `src/lib/math/tex.ts` 已删除；支持 `\overrightarrow`、`\left|...\right|`、矩阵、cases 等复杂写法
- 编辑/预览 + Ctrl+S：`src/components/node/DetailEditor.tsx`
- AI 生成讲解：`src/lib/ai/detail.ts`（BYOK 生成 400–900 字结构化讲解；提示词要求公式用 `$...$` / `$$...$$`；未配置模型时用确定性模板）
- 侧栏：来源对话（可展开，带本机缩略图）、关系（可编辑）、子知识点（可进入）、元信息

### 3.6 BYOK 模型接入

- 设置：服务商预设、Base URL/Key/模型、视觉模型（图片提问实际使用的模型；留空沿用文本模型）、代理或直连、测试连接（`SettingsSheet.tsx`）
- **向量模型（P1-A 新增）**：预设里带 `embeddingModel`（OpenAI `text-embedding-3-small`、智谱 `embedding-3`、硅基流动 `BAAI/bge-m3`）；支持独立「向量 Base URL / 向量 Key」（留空复用对话配置），可「测试向量」并「重建向量索引」
- 客户端：`src/lib/ai/llmClient.ts`（SSE、错误映射、AbortSignal、temperature/maxTokens）；向量走 `src/lib/ai/embeddings.ts`
- 服务端代理：`src/app/api/llm/chat/route.ts` 与 `src/app/api/llm/embeddings/route.ts`（登录校验、https、域名白名单、DNS 私网拦截，防 SSRF；`src/lib/ai/proxyGuard.ts` + `ipGuard.ts`）
- Key 只存本机 localStorage，不入库、不导出；设置 store v2 迁移补齐 embedding 字段（旧配置不会读到 undefined）

### 3.7 数据与运维

- 数据仓库抽象：`src/lib/repo/*`（Supabase 实现 + 演示模式内存实现）；向量检索通过 RPC，memoryRepo 返回空（自动降级关键词）
- 导入示例图谱、导出 JSON、清空图谱/对话、RLS 校验脚本 `scripts/verify-rls.mjs`（默认两个匿名账号走 HTTPS/PostgREST；`--direct` 用 `SUPABASE_DB_URL` 直连 Postgres），已覆盖 events、向量 RPC、会话与消息归属的越权校验
- `db:init` 支持三种执行方式：直连 URI / 只填密码 / Supabase 管理 API（国内网络）
- 国内网络适配：`npm run dev:proxy`、README 的代理章节、`NODE_USE_ENV_PROXY=1`
- 健康检查：`src/app/api/health/route.ts`（部署后可用于 curl 探活）
- 仓库侧部署文件：`.nvmrc`、`.github/workflows/{ci,keepalive}.yml`、`docs/DEPLOY.md`（见 3.10）

### 3.8 真实命中：向量 + 关键词兜底（P1-A）

- 向量客户端：`src/lib/ai/embeddings.ts`（`EMBEDDING_DIM=1024`、`HIT_SIMILARITY_THRESHOLD=0.78`、批量 16 条、超时 30s、维度校验、`cosineSimilarity`、`testEmbedding`；支持 `dimensions` 的模型请求 1024 维，`bge-m3` 原生 1024 维）
- 代理路由：`src/app/api/llm/embeddings/route.ts`（与对话代理同样的认证/https/白名单/私网拦截）
- 检索抽象：`src/lib/ai/semanticSearch.ts`（`SemanticSearch` 接口、`decideVectorHit`、`mergeVectorFirst` 向量优先 + 关键词补齐）、`semanticClient.ts`（`getRepo().matchNodesByVector` + `embedTexts`）
- 命中入口：`src/lib/ai/hit.ts` 的 `resolveHit`（向量命中直接给路径，否则复用 `resolveQuestion`）；ChatScreen 改异步命中
- 候选召回：`extract.ts` / `relationSuggest.ts` 增加异步向量候选构建（保留原同步函数与单测兼容）
- 写入链路：`src/lib/ai/nodeIndex.ts` 在收编 / 改标题摘要后异步重嵌入（fire-and-forget，失败只记日志）；`src/lib/ai/backfill.ts` + `scripts/embed-backfill.mjs` 批量回填（按 `embedding_model` 筛缺失）
- 测试：`tests/embeddings.test.ts`、`tests/proxyGuard.test.ts`、`tests/hit.test.ts`、`tests/semanticCandidates.test.ts`

### 3.9 指标埋点与 insights（P1-B）

- `src/lib/analytics.ts`（+ `analyticsCore.ts`）：`EVENTS` 事件名常量、`sanitizeProps`（只允许标量，最多 12 个键、字符串截断）、`track(name, props?)` fire-and-forget（演示模式/内存仓库 console.debug，失败静默，不抛错）
- 写入：`repo.insertEvent` → Supabase `events` 表（RLS 只能读写自己的行）
- 埋点位置：对话发送/命中（ChatScreen）、收编展示/采纳/忽略（CaptureCard）、节点打开/讲解生成保存（NodeDetailPage）、关系创建/采纳/更新/删除（RelationEditor/RelationList/RelationSuggestions）、拖拽/重置位置、登录/绑定（AuthGate）、示例图谱载入（AppProviders `?demo=1` → `graph_seeded`）、清空/导出、向量回填、连接测试
- 查询：`docs/insights.sql`（每日命中率、周收编率、7 日留存、功能使用计数、命中来源分布、向量覆盖率）；在 Supabase SQL Editor（service role）执行可看全量，应用内无管理看板
- 测试：`tests/analytics.test.ts`

### 3.10 部署与 CI（P1-D ✅ 已上线）

- `.nvmrc`（Node 22）、`.github/workflows/ci.yml`（push/PR：`npm ci → typecheck → lint → test → build`，不配云端密钥）
- `.github/workflows/keepalive.yml`（每日 03:00 UTC ping 一次 Supabase REST；URL 取 `vars.SUPABASE_URL`、Key 取 `secrets.SUPABASE_ANON_KEY`，未配置时 step 自动跳过）
- `?demo=1`：`AppProviders` 在账号就绪、图谱加载完成且为空时自动 `seedExample()`；sessionStorage `zhimy:demo-seeded` + ref 去重，先 `history.replaceState` 移除参数，成功 toast「已载入示例图谱（Demo 模式）」并上报 `graph_seeded`，失败只提示不标记
- `docs/DEPLOY.md`：Vercel Hobby 导入、Supabase Auth/`db:init`、保活 secrets、发布/回滚、已知限制、待填 TODO 清单
- **线上（2026-10-24）**：<https://zhimy.kasho.fun>（自定义域名，Let's Encrypt 证书至 2027-01-22；备用 <https://zhimy.vercel.app>）；项目 `prj_07iYEUoon7lzPOXAiDuMIQsTBDvM`，Vercel CLI 65.1.0 部署，构建 43s、总 3m；项目已通过 `vercel git connect` 关联 GitHub，push `main` 自动部署；Deployment Protection（Vercel Authentication）已关闭，公网可直接访问
- 环境变量只配 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（production / preview / development），未配任何服务端密钥
- README 已补真实 Live Demo 与 CI 徽章

## 4. 数据模型与迁移

### 表

| 表 | 关键字段 | 说明 |
|---|---|---|
| `profiles` | user_id, display_name, prefs | 账号资料（触发器自动创建） |
| `nodes` | id, user_id, parent_id, title, summary, **detail**, **manual_position**, **embedding**, **embedding_model**, **embedding_updated_at**, status, aliases, mastery | 知识点；`detail`=Markdown 讲解，`manual_position`=绝对空间坐标，`embedding vector(1024)`=语义向量（不随图谱查询下发前端），`embedding_model`=生成该向量的模型（隔离用） |
| `relations` | from_node, to_node, type, confidence, origin | 四类关系；无向类型按 id 排序，唯一索引 + check 约束 |
| `sources` | kind, question, answer, image_path | 一次问答/一张图；`image_path` 为未来云端持久化预留，当前不写（图片只做本地缩略图） |
| `node_sources` | node_id, source_id | 多对多 |
| `chat_messages` | role, content, image_name, conversation_id, payload(jsonb) | 对话与命中/建议/思维链快照；`conversation_id` 归属 conversations（旧数据回填「历史对话」） |
| `conversations` | id, user_id, title, created_at, updated_at | 独立会话；RLS owner-only，删除级联消息 |
| `events` | id, user_id, name, props(jsonb), created_at | 指标埋点；只存事件名与标量属性，不存问题/答案正文；索引 `(user_id, created_at desc)` 与 `(name, created_at desc)` |

- 所有表（含 `events`）启用 RLS，策略统一为 `user_id = auth.uid()`（`supabase/schema.sql` 底部的 DO 块批量创建）
- 向量：`create extension vector`（装到 `extensions` schema）；`nodes_embedding_hnsw_idx` 使用 `hnsw (embedding vector_cosine_ops)`，只索引 `embedding is not null` 的行
- 3 个 RPC（均 `security invoker` + RLS，只能操作自己的数据）：
  - `match_nodes(query_embedding vector(1024), match_count int, min_similarity real, p_model text)`：按 `embedding_model` 过滤、返回 `node_id/title/summary/similarity`
  - `set_node_embedding(p_node_id uuid, p_embedding vector(1024), p_model text)`：写入/覆盖节点向量与模型名，越权或节点不存在明确报错
  - `list_nodes_missing_embedding(p_model text)`：回填用，返回缺向量或模型不一致的节点（每次上限 500，脚本分批）
- `loadGraph` 的 nodes 查询是**显式列清单**（不含 `embedding`），避免把 1024 维数组拉到前端
- 维度守卫：`db:init` 发现 `nodes.embedding` 已是其它维度会直接报错（不允许静默错配）
- 路径**不落库**：运行时沿 `parent_id` 链拼装（`src/lib/path.ts`），改名/换父自动生效
- 迁移方式：改 `supabase/schema.sql`（用 `-- STATEMENT` 分隔）→ `npm run db:init`。新增列用 `alter table ... add column if not exists`，保持幂等
- 本轮新增：`conversations` 表、`chat_messages.conversation_id` 与旧消息回填、pgvector 扩展、`embedding` / `embedding_model` / `embedding_updated_at` 三列、HNSW 索引、3 个 RPC、`events` 表；更早一轮新增 `detail text not null default ''`、`manual_position jsonb`

## 5. 关键设计决策（改代码前先理解）

1. **匿名优先账号**：降低使用门槛；代价是未绑定前清缓存会丢入口，所以首页/设置都有绑定提醒。
2. **路径不落库**：只存 `parentId`，避免改名/换父后 path 脏数据。
3. **关系方向语义**：`from` 是关系主体（先修 = from 是 to 的基础）；相关/易混无向，入库前按 id 排序；改类型时由 store 调 `normalizePair` 重排，避免数据库 check 失败。
4. **手动位置是绝对坐标**：拖动父节点会带动未手动定位的子节点（布局以父位置重新计算）；已手动定位的节点不随父移动；可"恢复自动位置"。
5. **抽取/关系建议/命中均为"检索候选 → 模型做选择题 → 系统校验"**：模型不生成路径字符串，路径永远由父链拼装。
6. **AI 生成只提议，用户确认才写云**：收编、关系采纳、讲解保存都遵循这一点。
7. **演示模式与真实模式双轨**：无 Supabase 可内存运行（`NEXT_PUBLIC_DEMO_MODE=1`）；无模型 Key 时对话/抽取/讲解/关系用确定性脚本或模板。所有 UI 与交互都可离线演示。
8. **BYOK 代理白名单**：服务端不存 Key，但为防 SSRF，只允许 https + 白名单域名 + 拒绝私网解析；新增服务商需改 `src/lib/ai/proxyGuard.ts` 或环境变量 `LLM_PROXY_ALLOWED_HOSTS`。
9. **Markdown-lite 自研，公式改用 KaTeX**：Markdown 仍是自研轻量渲染；数学公式交给 KaTeX（`katex@^0.19.1`），支持 `$...$`/`$$...$$`/`\(...\)`/`\[...\]` 与复杂 LaTeX，输出 MathML。
10. **依赖策略**：除公式的 KaTeX 外，3D、SSE、Markdown、关系图仍自研；KaTeX 只进入包含公式的路由 chunk，CSS/字体按需加载。
11. **向量维度定为 1024**：`nodes.embedding vector(1024)`、`EMBEDDING_DIM=1024` 与设置预设一致；OpenAI `text-embedding-3*` 通过 `dimensions` 参数输出 1024 维，`bge-m3` 原生 1024 维。**维度不可轻改**——换维度需迁移数据库列并全量重建，schema 有守卫。
12. **命中采用 hybrid（向量优先 + 关键词兜底）**：余弦相似度 ≥ `0.78` 视为命中；未配置向量模型、调用异常/超时或相似度不足时自动降级 `resolveQuestion` 关键词匹配。保证无 Key 用户零配置可用，向量只提升「换说法」命中率，不阻塞主流程。
13. **向量按模型隔离**：`embedding_model` 记录生成模型，检索 RPC 按当前模型过滤；换模型后旧向量不参与新模型检索，必须「重建向量索引」或 `embed-backfill`。不同模型的向量空间不可比较。
14. **events 隐私约束**：只写事件名 + `sanitizeProps` 清洗后的标量属性（最多 12 键、字符串截断），**禁止写入问题/答案/图片/Key 等正文或敏感内容**；events 启用 RLS，只能读写自己的行；全量指标聚合在 Supabase SQL Editor（service role）执行。
15. **`?demo=1` 只在空图谱自动 seed**：sessionStorage + ref 去重、读实时 store 校验（防止 ensureLoaded 竞态误清空已有图谱）、先删 URL 参数再 seed；失败不标记，可重试。仅用于线上 Demo 展示，不改变正常账号流程。
16. **拍题图片不做云端持久化（2026-10-24）**：原图只用于当次视觉模型请求，请求结束即释放；聊天缩略图压到最长边 640、JPEG 0.72，存浏览器 IndexedDB（`zhimy-media/thumbnails`，最多 200 条，消息与来源各一份）。`sources.image_path` 保留为预留字段但不写。理由：图片是一次性输入，避免 Storage 桶/RLS/签名 URL/额度与清理成本，隐私面更小；代价：不跨设备、清缓存丢失、HEIC 不在支持格式内（需先导出 JPG）。
17. **图片请求链路（2026-10-24 修复）**：`visionModel` 现在是图片请求**真正使用的模型**（此前只作为“是否附图”的开关，请求仍用文本模型）；未配置视觉模型时不再静默丢图——仍附上图片、沿用文本模型，并在本次会话首次发图时提示一次；请求前把图片压到最长边 1600 / JPEG 0.82（仍超 3.5M 字符则降到 1280），代理消息体上限从 200 KB 提到 4 MB（低于 Vercel Functions 约 4.5 MB 的请求体限制）。
18. **流式思维链 + 打字机（2026-10-24）**：SSE 兼容 `reasoning_content` / `reasoning` / `thinking` / `reasoning_details`（只被动读取，不主动要求模型输出思考），正文由 `useTypewriter` 以 24ms 的节奏逐字上屏，网络结束时 flush。完整 reasoning 写入 `chat_messages.payload.reasoning`（截断到 2 万字），不写 events、不参与抽取；最终消息里默认折叠，可刷新后回看。
19. **多会话与上下文隔离（2026-10-24）**：新增 `conversations`，消息按 `conversation_id` 归属；进入 `/chat` 默认新对话草稿（空会话不写库），首条消息才创建会话；顶部历史可切换/删除，`?c=` 恢复。每个会话独立加载消息，主对话历史、抽取上下文、思维链都只作用于当前会话。
20. **system prompt 放宽（2026-10-24）**：从“中学理科助教”改为不限学段/学科的学习助手，覆盖哲学、编程、语言学习等；同时去掉 400 字硬上限和“只讲题目”的限制，代码问题允许 Markdown 代码块。

## 6. 已知限制与技术债

### 产品/功能

- **向量命中依赖 BYOK embedding 服务**：需要服务商支持 OpenAI `/embeddings` 协议并输出 1024 维；没配 Key、未填向量模型或调用失败时自动降级关键词，换说法仍可能漏命中，方案目标命中率 > 80% 尚无云端实测数据
- **5 种问法的云端命中验收尚未执行**：本地/CI 没有真实 Key，只能验证降级路径与纯逻辑；验收需维护者按第 9 节 checklist 在真实配置下跑
- **存量 / 示例图谱需要回填向量**：已有节点和通过「载入示例图谱」/`?demo=1` 载入的节点默认没有向量，需「重建向量索引」或 `npm run embed:backfill`；换向量模型需重建，维度固定 1024 不能轻改
- 图片**不做云端持久化**：原图仅当次请求发给模型（发送前压到最长边 1600）；聊天/来源缩略图只存当前浏览器 IndexedDB（最多 200 条，未加密），换设备、无痕窗口、清站点数据后只剩文件名提示；仅支持 JPG/PNG/WebP/GIF（HEIC 需先导出），>10 MB 直接拒绝；**图片识图依赖模型能力**：视觉模型留空时沿用文本模型，纯文本模型（如 deepseek-chat）会拒绝图片，视觉模型需与 Base URL/Key 同服务商；缩略图方向依赖浏览器对 EXIF 的处理；不做 OCR 与原图压缩；同一缩略图在消息与来源各存一份（约 2× 空间）
- **思维链依赖服务商/模型**：只读取 `reasoning_content` / `reasoning` / `thinking` / `reasoning_details`，普通文本模型通常不返回；不做“强制展示思考”的请求参数。reasoning 存在 `chat_messages.payload`（单条上限 2 万字，超出截断），不写 events；当前「导出 JSON」只导出图谱、不含对话消息，清空对话时删除；不做流式 reasoning 的结构化渲染（按纯文本展示）
- **会话**：进入对话页默认新对话，旧会话需从「历史」进入；暂不支持重命名、搜索、置顶或跨会话合并。空会话不落库，发送第一条消息时才创建；删除会话会级联删除消息；迁移前的历史消息统一归入「历史对话」。`?c=` 只做恢复提示，不是稳定的分享链接
- **system prompt**：已放宽到全学科，但知识抽取/讲解生成仍以“知识点”为单位；纯代码项目、长篇创作等可能只抽出少量可收编节点，属于产品模型限制
- **有基础埋点但没有应用内看板**：`events` 只记事件名与少量属性，聚合查询需在 Supabase SQL Editor 手动执行 `docs/insights.sql`
- **已上线，主闭环 E2E 通过**：<https://zhimy.kasho.fun> 可访问（证书至 2027-01-22）、`/api/health` 正常、匿名登录可用；Playwright 线上跑通「示例图谱 → 对话 → 收编 → 3D 深链 → 详情生成/保存 → 刷新持久化」14 项。**未覆盖**：拍题缩略图、公式渲染、思维链面板的线上自动化验收。**邮箱绑定注意**：Supabase 当前 `mailer_autoconfirm = false`（需确认邮件），免费版内置 SMTP 额度极低，公开 Demo 的「绑定邮箱」大概率收不到确认信；要在 Demo 演示该流程需配置自有 SMTP 或临时关闭 Confirm email（仅演示项目可接受）。无 PWA service worker；Hobby 函数区域美东，国内访问延迟较高
- 无账号删除/数据删除入口；无 JSON 导入（只有导出）
- 复习闭环（掌握度/间隔重复/到期复习）未做
- 跨端同步靠"重新打开/切回页面刷新"，无 Realtime
- 关系置信度用户端固定 0.8，无滑杆；AI 建议理由不持久化
- Markdown-lite 不支持表格/图片；公式由 KaTeX 渲染，未安装的扩展（如 mhchem `\ce{}`）会红色高亮；详情正文无版本历史/撤销
- 演示模式数据在内存，刷新即重置
- 移动端手势较密（拖节点 vs 旋转靠"是否按中节点"区分），未做专门的编辑模式

### 工程/环境

- 开发环境在网络受限时依赖 Clash 代理（`dev:proxy`）；本轮实测 Postgres 5432 可直连（`db:init` / `--direct` 可用），但 HTTPS 到 `*.supabase.co` 会被重置；浏览器端 E2E 需要能访问 Supabase HTTPS 的网络或代理
- **启动屏卡住的已知环境原因（2026-10-23 实测）**：Clash 7897 在监听但 Windows `ProxyEnable=0`（系统代理未开），`npm run dev` 下浏览器直连 Supabase HTTPS 失败 → 一直停在「正在连接你的知识图谱…」。修复：开启 Clash 系统代理/TUN（浏览器侧）并 `npm run dev:proxy`（Node 侧）；无头 Edge 加 `--proxy-server=http://127.0.0.1:7897` 已实测可访问 Supabase。现在启动 6s 显示提示、15s 转错误页；`next.config.ts` 会自动把本机网卡 IPv4 加入 `allowedDevOrigins`（局域网访问不再拦 HMR）
- Windows 沙箱/受限终端下 `next build`/`vitest`/无头 Edge 会 `spawn EPERM`（需要正常终端权限）；本轮 `typecheck`/`lint` 在沙箱内跑，`test`/`build` 在完整权限下跑，均通过
- `next-env.d.ts` 会在 dev / build 之间自动切换内容，`git status` 常变脏；提交前 `git checkout -- next-env.d.ts` 即可
- E2E 脚本在 `_verify/`（未提交，依赖本机 Edge 与测试账号 profile）；向量命中的 E2E 额外需要真实 embedding Key
- 测试账号数据：Supabase 里有一个匿名账号被载入示例图谱、收编了"电路故障分析"、创建过测试关系、详情页有 E2E 标记；用户自己的浏览器账号是独立的，不受影响
- CI 工作流尚未在 GitHub 上实际运行；`.github/workflows/keepalive.yml` 需要仓库配置 `vars.SUPABASE_URL` + `secrets.SUPABASE_ANON_KEY` 后才生效（未配置时自动跳过）
- Supabase 免费项目 7 天不活跃会暂停（数据保留）

## 7. 计划与完成情况（按优先级）

> 排序依据：先把技术主线做扎实（真实命中 + 指标），再做拍题链路与 P2 增强。P1-A / P1-B / P1-C（简化版）已完成；剩余优先级：完成 P1-D 实际部署 → P2 增强（复习闭环、Realtime、分享）。部署只做"公开 Demo + 工程完整度"，不阻塞主线。

### P1-A 真实命中：pgvector embedding ✅（2026-10-23 完成）

**目标**：同一知识点换 5 种问法能命中；不同知识点不误命中；命中率可统计。

**已实现**

1. **决策**：向量维度 **1024**（`vector(1024)` + HNSW cosine）；命中阈值 `HIT_SIMILARITY_THRESHOLD = 0.78`
2. **schema**：`create extension vector`（装到 `extensions` schema）、`nodes.embedding` / `embedding_model` / `embedding_updated_at`、HNSW 索引、3 个 RPC（`match_nodes` / `set_node_embedding` / `list_nodes_missing_embedding`），见第 4 节
3. **BYOK**：`LlmSettings` 新增 `embeddingModel` / `embeddingBaseUrl` / `embeddingApiKey`（留空复用对话配置）；设置里可独立配置并「测试向量」；设置 store v2 迁移
4. **客户端**：`src/lib/ai/embeddings.ts`（维度/余弦/批量/超时/错误中文化）+ 代理 `src/app/api/llm/embeddings/route.ts`（复用 `proxyGuard` 的 https/白名单/私网防护）
5. **写入链路**：`graphStore.adopt` / `updateDetails` 后 `nodeIndex` 异步重嵌入（失败不阻塞收编）；`backfill.ts` + `scripts/embed-backfill.mjs` 批量回填（`npm run embed:backfill`，直连 Postgres，按模型筛缺失、支持 `--force` / `--dry-run`）
6. **读取链路**：`resolveHit` 向量优先（top-k → 阈值 → 命中路径）；`extract.ts` / `relationSuggest.ts` 增加异步向量候选（关键词补齐）；异常 / 超时 / 未配置一律降级关键词
7. **测试**：`tests/embeddings.test.ts`、`tests/proxyGuard.test.ts`、`tests/hit.test.ts`、`tests/semanticCandidates.test.ts`、`tests/schema.test.ts`

**验收状态**

- ✅ 纯逻辑单测覆盖：维度校验、余弦相似度、阈值判定、降级路径、候选合并、RPC 参数与 schema 约定
- ⏳ **云端 E2E「同一节点 5 种问法 ≥4 命中」未执行**：需要真实 embedding Key；无 Key 环境按设计降级关键词（不影响构建与基础使用）

### P1-B 指标埋点与验证 ✅（2026-10-23 完成）

**目标**：能量化方案第 10 章的 4 个指标。

**已实现**

1. **迁移**：`events` 表（`id, user_id, name, props jsonb, created_at`）+ RLS（只读写自己的行）+ 索引 `(user_id, created_at desc)`、`(name, created_at desc)`
2. **`src/lib/analytics.ts`（+ `analyticsCore.ts`）**：`EVENTS` 事件名常量、`sanitizeProps`（仅标量、最多 12 键、字符串截断）、`track(name, props?)` 同步 fire-and-forget、失败静默；演示模式 / 内存仓库 console.debug
3. **埋点位置**：对话发送、命中/未命中（ChatScreen）；收编建议展示/采纳/不收（CaptureCard）；打开 3D 节点、详情页生成/保存讲解（AtlasScreen / NodeDetailPage）；关系创建/采纳/改类型/删除；拖拽与重置位置；登录/绑定（AuthGate）；示例图谱载入（`?demo=1` → `graph_seeded`）/清空/导出；向量回填、连接测试
4. **`docs/insights.sql`**：每日命中率、周收编率、7 日留存、功能使用计数、命中来源分布与平均相似度、向量覆盖率（Supabase SQL Editor / service role 看全量；普通用户 RLS 只能看自己）
5. 可选 `/insights` 页面未做（非必需）

**验收状态**

- ✅ 埋点不阻塞主流程（纯函数清洗 + 静默失败，单测 `tests/analytics.test.ts`）
- ⏳ 真实事件落库与 insights SQL 需在配置好 Supabase 的环境跑一次（验收标准：测试账号 ≥10 条事件后视图非空）

### P1-C 拍题链路（简化版）🟡 代码完成（浏览器验收待执行）

**决策**：不做云端图片持久化。原图只在当次请求内以 dataURL 交给模型（视觉模型优先，未配置则沿用文本模型），聊天缩略图压缩后存本机 IndexedDB（见第 5 节 #16/#17）。

**已实现**

1. **校验**：仅 JPG / PNG / WebP / GIF，≤10 MB；`src/lib/media/imageInputCore.ts`（纯函数，单测覆盖）
2. **图片预处理**：一次解码同时生成缩略图（640px / JPEG 0.72）与视觉输入图（1600px / JPEG 0.82，超 3.5M 字符降到 1280）；`src/lib/media/imageThumbnails.ts`，解码失败返回 null 不阻塞提问
3. **请求组装**：`src/lib/ai/chatTurns.ts`——有图一定附 `image_url`；有视觉模型时请求模型切换为视觉模型，未配置时沿用文本模型并在本会话首次发图时提示；代理 `/api/llm/chat` 消息体上限 200 KB → 4 MB
4. **本地缓存**：`src/lib/media/localThumbnailStore.ts`，IndexedDB `zhimy-media/thumbnails`，消息用 `message.id`、来源用 `source.id`，最多 200 条；账号切换清空全部，清空对话只清 `kind=message`
5. **展示**：`src/components/common/LocalThumbnail.tsx` 接入聊天气泡、详情页来源、3D 面板来源；缺失时自动回退文件名或原问题文案
6. **来源标记**：`sources.kind` 现在会写 `image`（`image_path` 保留但不写）
7. **测试**：`tests/imageAttachments.test.ts`（格式/大小/尺寸计算）、`tests/chatTurns.test.ts`（有图必附图、视觉模型选型、历史截断）

**验收状态**

- ✅ `typecheck` / `lint` 通过
- ⏳ 浏览器验收待执行（见第 9 节）：配置视觉模型后发图，模型能复述题干；刷新缩略图仍在；无痕窗口只显示文件名；Network 无 Storage 请求
- 明确不做：Supabase Storage / 签名 URL / OCR / 跨设备 / 原图持久化

### P1-D 部署 + CI ✅（2026-10-24 已上线）

**定位**：个人开源、非商业的小体量项目，部署目标不是承载真实用户，而是「可访问的技术 Demo + 可复现的工程流程」。

**已完成（线上）**
- GitHub 公开仓库 <https://github.com/Ha2eS1onn/zhimy>，4 个提交推送；CI 首跑全绿（2m36s，8 步）
- Vercel 项目 `zhimy`（Hobby）生产部署：<https://zhimy.kasho.fun>（自定义域名）；`vercel git connect` 已关联仓库，push 自动部署
- 只配置 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（三个环境），未配 `NEXT_PUBLIC_DEMO_MODE` 或任何服务端密钥
- Deployment Protection 已关闭，公网匿名可访问；`/api/health` 返回 `{"ok":true}`；匿名登录 CREATE 成功（`is_anonymous: true`）
- 目标 Supabase 已执行 `npm run db:init`（47/47 语句 ok）
- keepalive：`vars.SUPABASE_URL` + `secrets.SUPABASE_ANON_KEY` 已配置，手动触发成功（run `40067630722`）

**已完成补充（2026-10-24）**
- 自定义域名 `zhimy.kasho.fun` 接入（CNAME → Vercel，Let's Encrypt 证书至 2027-01-22），`zhimy.vercel.app` 并存
- Supabase Auth 的 `Site URL` / `Redirect URLs` 已由维护者配置为新域名
- 线上 E2E 14/14 通过（主闭环：示例图谱 → 对话 → 收编 → 3D 深链 → 详情生成/保存 → 刷新持久化）

**剩余（需要真实 Key / 维护者决定）**
1. 配真实 embedding Key 后跑向量命中与 `docs/insights.sql` 验收
2. 拍题缩略图、公式、思维链的线上专项 E2E（主闭环已通过）
3. 邮箱确认策略：当前 `mailer_autoconfirm = false`，公开 Demo 若要演示「绑定邮箱」需配自有 SMTP 或临时关闭 Confirm email（`docs/DEPLOY.md` §3.3）
4. 可选（后置）：Dependabot / CodeQL、Deploy Button、收窄 `src/proxy.ts` 的 matcher、升级 Actions 到 v5（当前 v4 有 Node 20 弃用告警）

**已知限制**：Hobby 函数区域固定（美东）且时长/并发额度有限，BYOK 长回答流式需实测；Demo 不承诺 SLA 与数据持久性；免费版邮箱确认受限。

**不做**：VPS / Docker / 备案 / 限流 / 监控告警 / 多环境 / Sentry 等（非商业 Demo 无收益，需要时再评估）

### P2 增强（验证后再排）

1. **复习闭环**：`review_state` 表（due_at/interval/ease/mastery/last_reviewed）、到期复习页、对话后推荐复习；与掌握度联动
2. **Realtime 跨端同步**：Supabase `postgres_changes` 订阅 nodes/relations/messages；冲突 last-write-wins
3. **合规与数据管理**：账号/数据删除、JSON 导入、隐私说明（未成年人场景）
4. **分享与导出**：知识图谱长图/只读链接；复习卡片导出
5. **移动端打磨**：显式"编辑模式"开关（区分旋转与拖拽）、手势提示、长文阅读优化
6. **3D 性能**：500 节点压力测试、静态帧渲染优化、WebGL 升级评估

## 8. 本轮任务拆解与状态（2026-10-23）

| # | 任务 | 涉及文件 | 产出/验收 | 状态 |
|---|---|---|---|---|
| 1 | 定 embedding 模型与维度（与产品确认） | — | 决策记录到本文档：**1024 维** | ✅ 完成 |
| 2 | schema 迁移：vector 扩展、embedding 列、HNSW、3 个 RPC、events 表 | `supabase/schema.sql` | `npm run db:init` 幂等通过 | ✅ 完成（本轮迁移 47 条语句 ok） |
| 3 | BYOK 增加 embedding 模型设置 + 代理路由 | `src/lib/ai/types.ts`、`SettingsSheet.tsx`、`src/app/api/llm/embeddings/route.ts` | 测试连接通过 | ✅ 代码完成（测试向量需真实 Key） |
| 4 | embeddings 客户端 + 写入链路（adopt/updateDetails 后异步） | `src/lib/ai/embeddings.ts`、`nodeIndex.ts`、`graphStore.ts` | 新节点自动有向量 | ✅ 代码完成 |
| 5 | 存量回填脚本 | `scripts/embed-backfill.mjs` | 脚本可重复执行 | ✅ 完成 |
| 6 | 命中改为向量检索 + 降级 | `src/lib/ai/hit.ts`、`ChatScreen.tsx` | 5 种问法命中 ≥4 | 🟡 代码完成；云端验收待真实 Key |
| 7 | 抽取/关系候选改为向量检索 + 降级 | `src/lib/ai/extract.ts`、`relationSuggest.ts` | 单测 + 抽查效果 | ✅ 代码完成 |
| 8 | events 表 + analytics + 埋点 | 见 P1-B | 视图有数据 | ✅ 代码完成；落库验收待云端 |
| 9 | 指标 SQL 视图文档 | `docs/insights.sql` | 4 个指标可查 | ✅ 完成 |
| 10 | 测试/构建/E2E/README 更新 | `tests/*`、`README.md` | 全绿 | ✅ typecheck / lint / test（177）/ build 全绿；浏览器 E2E 待真实 Key 与可用 HTTPS |
| 11 | P1-D：CI + keepalive + `.nvmrc` + `?demo=1` + DEPLOY + README | `.github/workflows/*`、`.nvmrc`、`AppProviders.tsx`、`docs/DEPLOY.md`、`README.md` | CI 徽章全绿 + 公网 Demo | ✅ 完成（2026-10-24：CI 全绿 + <https://zhimy.kasho.fun>） |
| 12 | 收编/移动时新建父级路径（空图谱可用） | `PositionPicker.tsx`、`graphStore.ts`、`path.ts`、四处调用点 | 新建 `物理 / 电学` 并复用；循环守卫；显式归位直接 active | ✅ 完成（单测覆盖 path 解析/复用/阻断） |
| 13 | 讲解正文 LaTeX 公式渲染 | `MarkdownLite.tsx`、`TeXMath.tsx`、`lib/math/*`、`RichText.tsx`、AI 提示词 | `\(...\)`/`$...$`/`$$...$$` 渲染为公式；复杂公式可渲染 | ✅ 完成（2026-10-24 改用 KaTeX） |
| 14 | P1-C 简化版：拍题图片本地缩略图 | `src/lib/media/*`、`LocalThumbnail.tsx`、Composer/ChatScreen/MessageBubble/详情页/3D 面板 | 发图 → 刷新缩略图仍在（同浏览器）；不上传云端、无 DB 变更 | ✅ 代码完成（浏览器验收待执行） |
| 15 | 修复图片未送达模型 | `src/lib/ai/chatTurns.ts`、`ChatScreen.tsx`、`imageThumbnails.ts`、`api/llm/chat/route.ts`、`SettingsSheet.tsx` | 视觉模型真正参与请求；无视觉模型时不再静默丢图；图片压缩后经代理发送 | ✅ 代码完成（需配置视觉模型后浏览器验收） |
| 16 | 复杂公式：KaTeX 替换自研子集 | `TeXMath.tsx`、`RichText.tsx`、`lib/math/*`、`layout.tsx`、`globals.css`、测试 | 截图公式（`\overrightarrow`、`\left|`、嵌套分数/根号）正常；跨行 `$$` 与数字坐标不再原文显示 | ✅ 代码完成（浏览器公式验收待跑） |
| 17 | 流式思维链 + 逐字显示 | `sse.ts`、`llmClient.ts`、`ChatScreen.tsx`、`useTypewriter.ts`、`MessageBubble.tsx`、`types` | `reasoning_content`/`reasoning` 实时面板；正文逐字上屏；`payload.reasoning` 刷新可回看 | ✅ 代码完成（需推理模型验收） |
| 18 | 多会话 + system prompt 放宽 | `schema.sql`、`conversations.ts`、`chatStore.ts`、repo、`ChatScreen.tsx`、`prompt.ts` | 默认新会话、历史切换/删除、上下文隔离；全学科提示词 | ✅ 代码完成；`db:init` 47 条语句 ok（浏览器验收待执行） |

> 1–18 为技术主线，均已落到代码并上线；#11 的部署已于 2026-10-24 完成（GitHub + Vercel + keepalive），剩余仅为 Supabase Auth URL 配置与真实 Key 的指标验收。

## 9. 接手第一步 checklist

1. 读 [README](../README.md)、本文档、[产品方案](知脉-知识地图产品方案-v1.0.docx)、[部署手册](DEPLOY.md)
2. 确认 `.env.local` 存在且 Supabase 项目可访问（问项目所有者，不要提交密钥）
3. `npm install`；`npm run dev:proxy` 打开页面；确认当前匿名账号可用
4. 跑一遍自检：`typecheck` → `lint` → `test` → `build` → `db:init`（确认语句全部 ok，数量以脚本输出为准）→ `node scripts/verify-rls.mjs --direct`；仓库推送后 GitHub Actions CI 应同步全绿
5. **向量命中验收（需要真实 embedding Key）**：设置 → 模型 → 向量模型（如 `BAAI/bge-m3` 或 `text-embedding-3-small`）→「测试向量」→「重建向量索引」→ 对同一知识点用 5 种不同说法提问（≥4 次命中正确路径、无关问题不命中）→ 在 Supabase SQL Editor 执行 `docs/insights.sql`，确认 `hit_attempt` / 命中率 / 向量覆盖率有数据
6. 无 Key / 未配置向量模型时：确认对话仍可用、命中自动降级关键词（这是设计行为，不是 bug）
7. 浏览关键路径：对话收编 → 3D 定位/拖拽/连线 → 详情页生成与编辑；若已部署，打开 README 里的 Live Demo 跑一遍"提问 → 收编 → 3D 找到"（`?demo=1` 可自动载入示例图谱）。**会话验收**：在 `/chat` 发一条消息 → 新建对话再发另一条，确认两个会话历史互不串；刷新 `/chat?c=<id>` 能恢复；历史面板删除一个会话后消息消失。**拍题验收**：先在设置里填好视觉模型，发图提问确认模型能复述题干；刷新后缩略图仍在（同浏览器）、详情页来源可见；无痕窗口同账号只显示文件名；DevTools Network 不应出现 Supabase Storage 请求。**公式验收**：把截图里的 `\overrightarrow{DE}`、`\left|...\right|`、嵌套分数/根号发进聊天与详情预览，确认不再显示原始 `$$`/反斜杠；`$(1,0,0)$` 能渲染而 `$5` 保持文字。**流式验收**：用 `deepseek-reasoner` 一类支持 reasoning 的模型发问，确认思考面板实时增长、正文逐字出现；刷新后在消息里可展开「思考过程」。
8. 后续按第 7 节执行：先完成 P1-D 实际部署（需账号授权），再做 P2 增强；P1-C 已按简化方案完成（图片云端持久化与 OCR 不做）。每完成一项跑全量检查 + 提交。
9. 提交前：`git checkout -- next-env.d.ts`（避免生成文件噪音），确认 `.env.local` 未被提交

## 10. 风险与注意事项

- **密钥**：`.env.local` 内含 Supabase 与（可选）管理 API token、`EMBEDDING_*`，严禁提交；不要在文档/截图里暴露
- **数据安全**：所有表（含 events）必须保持 RLS；`events` 的策略与其他表一致（owner-only select / insert / update / delete，只能读写自己的行），新增埋点字段必须走 `sanitizeProps`，禁止写入问题/答案/图片/Key 等正文或敏感内容
- **embedding 成本 / 回填**：向量回填按 token 计费（用维护者自己的 Key），一次全量回填注意批量（`EMBEDDING_BATCH=16`）与速率；用户日常命中也由用户自己的 Key 承担，量级远小于对话
- **向量维度不可轻改**：`vector(1024)`、`EMBEDDING_DIM=1024`、设置预设必须一致；换维度需要迁移数据库列并全量重建（schema 有维度守卫，会直接报错而不是静默错配）
- **换模型需重建**：`embedding_model` 隔离不同向量空间，不重建会导致旧节点「向量不可见」、命中率下降（表现为降级关键词）
- **线上部署已实测（基础项）**：CI 在真实仓库实跑全绿（2m36s）；Vercel 生产构建 43s、总 3m；`/api/health` 与匿名登录校验通过。**待实测**：Hobby 函数区域（美东）下的 BYOK 长流式稳定性、免费版额度与冷启动；浏览器端完整业务闭环
- **中国网络**：`*.supabase.co` 的 HTTPS 在部分网络会被 reset（本机 2026-10-23 实测 HTTPS 被重置、Postgres 5432 正常）；遇 reset 浏览器走系统代理、Node 需 `dev:proxy`，数据库迁移与 `--direct` 校验不受影响。线上 Demo 受众以开发者为主，Vercel 访问性可接受；若以后面向国内用户再评估平台
- **免费 Supabase**：7 天不活跃会暂停，Demo 用每日 keepalive cron 缓解（需配置 vars/secrets 且 cron 有偶发延迟）；需要更多配额时再评估升级
- **未成年人**：产品主要面向学生与自学者，**若超出技术 Demo 定位、面向真实学生开放**，至少要有隐私说明、内容安全策略与数据删除能力；当前公开 Demo 应注明仅供演示
- **Demo 定位**：个人开源非商业项目，线上 Demo 不承诺数据持久性、可用性与 SLA；Demo 环境的邮箱确认等限制已写入 README 与 `docs/DEPLOY.md`
- **演示数据**：demo 模式的种子数据只用于展示；真实账号首次进入是空图谱，可用「载入示例图谱」或 `?demo=1` 自动载入；示例节点需要回填向量才有向量命中

## 11. 常用文件索引

| 想改什么 | 先看哪里 |
|---|---|
| 页面/路由 | `src/app/**/page.tsx`、`src/components/shell/AppShell.tsx` |
| 全局状态 | `src/store/{graph,chat,session,settings,ui,toast}Store.ts` |
| 数据读写/迁移字段 | `src/lib/repo/{types,supabaseRepo,memoryRepo,mappers}.ts`、`supabase/schema.sql` |
| 3D 布局与交互 | `src/lib/layout/*`、`src/lib/atlas/*`、`src/components/atlas/*` |
| AI 能力（对话/抽取/讲解/关系） | `src/lib/ai/{llmClient,extract,detail,relationSuggest}.ts`、`src/app/api/llm/chat/route.ts` |
| **向量命中（P1-A）** | `src/lib/ai/{embeddings,semanticSearch,semanticClient,hit,nodeIndex,backfill}.ts`、`src/app/api/llm/embeddings/route.ts`、`scripts/embed-backfill.mjs` |
| **指标埋点（P1-B）** | `src/lib/analytics.ts`（+ `analyticsCore.ts`）、`docs/insights.sql`、`supabase/schema.sql` 的 events 表 |
| 路径/检索/关系规则 | `src/lib/{path,search,relations}.ts` |
| 账号与设置 | `src/store/sessionStore.ts`、`src/components/shell/SettingsSheet.tsx`、`src/lib/authErrors.ts` |
| 文案与视觉令牌 | `src/app/globals.css`（颜色/断点/字体） |
| **Markdown / 公式渲染** | `src/components/node/MarkdownLite.tsx`、`TeXMath.tsx`（KaTeX）、`src/lib/math/{inline,display}.ts`、`src/components/chat/RichText.tsx` |
| **拍题图片 / 本地缩略图（P1-C）** | `src/lib/media/{imageInputCore,imageThumbnails,localThumbnailStore}.ts`、`src/lib/ai/chatTurns.ts`、`src/components/common/LocalThumbnail.tsx` |
| **流式思维链 / 打字机** | `src/lib/ai/sse.ts`（reasoning 提取）、`llmClient.ts`、`src/components/chat/ChatScreen.tsx`、`useTypewriter.ts`、`MessageBubble.tsx` |
| **会话 / 上下文隔离** | `supabase/schema.sql`（conversations / conversation_id）、`src/lib/conversations.ts`、`src/store/chatStore.ts`、`src/components/chat/ChatScreen.tsx` |
| **部署 / CI / Demo / 健康检查** | `docs/DEPLOY.md`、`.github/workflows/{ci,keepalive}.yml`、`.nvmrc`、`src/components/shell/AppProviders.tsx`（`?demo=1`）、`src/app/api/health/route.ts` |

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
| 2026-10-18 | 项目按个人开源技术项目管理，不做商业化、不追用户量 | 精力投入技术实现与工程质量，部署只服务 Demo |
| 2026-10-18 | 线上 Demo 用 Vercel Hobby + GitHub Actions，不自建 VPS | 非商业小体量，运维成本应趋近于零 |
| 2026-10-23 | 向量维度定为 **1024**（`vector(1024)` + HNSW cosine） | OpenAI `text-embedding-3*` 可传 `dimensions` 输出 1024，`bge-m3` 原生 1024；维度守卫避免静默错配 |
| 2026-10-23 | 命中采用 **hybrid**：向量优先（阈值 0.78），未配置/异常/低分降级关键词 | 无 Key 用户零配置可用；向量只提升换说法命中率，不阻塞主流程 |
| 2026-10-23 | 向量按 `embedding_model` 隔离，换模型必须重建 | 不同模型向量空间不可比较，混用会误命中；检索 RPC 与回填都按模型过滤 |
| 2026-10-23 | events 隐私约束：只存事件名 + ≤12 个标量属性，不含问题/答案正文 | 指标必要 ≠ 内容采集；`sanitizeProps` + RLS 双保险 |
| 2026-10-23 | P1-D 本轮只做仓库部分（CI/keepalive/`?demo=1`/DEPLOY/README），不实际部署 | 缺 Vercel/GitHub 授权；先让工程流程可复现，实际部署由维护者在有账号时执行 |
| 2026-10-23 | `?demo=1` 只在空图谱自动 seed，用 sessionStorage + ref 去重 | 避免重复清空/覆盖已有数据；读实时 store 防止 ensureLoaded 竞态误判 |
| 2026-10-24 | LaTeX 用**自研子集渲染**（不引 KaTeX），支持 `$...$`/`$$...$$`/`\(...\)`/`\[...\]` | 保持零运行时依赖；覆盖中学常见公式（分数/根号/上下标/希腊/运算符），复杂环境与未知命令按原文回退，内容不丢（同日已被下方的 KaTeX 决策取代） |
| 2026-10-24 | 公式**改用 KaTeX**，删除自研子集渲染器 | 自研渲染器无法覆盖 `\overrightarrow`、伸缩定界符、矩阵/cases 等复杂公式；KaTeX 覆盖度、错误处理和 MathML 可访问性更好，接受公式路由约 +300 KB 原始 / +85 KB gzip 的增量 |
| 2026-10-24 | 部署落地：公开 GitHub 仓库 + Vercel Hobby + CLI 部署 + Git 自动部署 | 维护者提供 gh 网页授权与 Vercel Token；只配两个 `NEXT_PUBLIC_*`，延续"服务端零密钥"原则 |
| 2026-10-24 | 关闭 Vercel Deployment Protection（`ssoProtection: null`） | 公开 Demo 需要匿名可访问；私有项目/预览保护会拦截访客 |
| 2026-10-24 | 仓库忽略 `.workbuddy/` 与 `.vercel/` | 前者是本地 Agent 工作目录（含项目记忆），后者是 Vercel 项目关联信息，都不应发布 |
| 2026-10-24 | `docs/项目现状梳理.md` 暂不入库 | 内部现状评估含技术债与文档偏差的坦率结论，是否公开由维护者决定 |
| 2026-10-24 | **流式思维链 + 打字机**：读取 reasoning 字段，正文 24ms 逐字上屏；reasoning 存 `chat_messages.payload` | 提升可观察性，但 reasoning 是服务商可选字段、非所有模型有；存 payload 便于刷新回看，上限 2 万字避免 jsonb 膨胀，不写 events |
| 2026-10-24 | **多会话 + 默认新对话**：conversations 表、消息 conversation_id；进入聊天页默认草稿，首条消息才落库 | 解决不同问题上下文互相干扰；空会话不写库，历史可恢复/删除；迁移旧消息到「历史对话」 |
| 2026-10-24 | **system prompt 放宽到全学科**：去掉“中学理科助教”和 400 字硬限制 | 用户会用哲学、编程等非理科问题；身份限制会导致模型在思考里纠结“是否该回答” |
| 2026-10-24 | P1-C 改为**本地缩略图**：原图只喂当次模型，缩略图存 IndexedDB，不做 Supabase Storage | 图片是一次性输入，避免桶/RLS/签名 URL/额度与清理成本；代价是不跨设备、清缓存丢失 |
| 2026-10-24 | 图片请求**视觉模型优先、未配置沿用文本模型**；发送前压到 1600px，代理上限 4MB | 修复“设了视觉模型仍用文本模型”和“未配置时静默丢图”；控制 base64 请求体在 Vercel 4.5MB 限制内 |
