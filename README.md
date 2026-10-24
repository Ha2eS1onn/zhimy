# 知脉 · AI 知识地图

> 把 AI 答疑从「一次性消耗」变成**可寻址、可联想、可收纳**的个人知识图谱。

学生和自学者每天都在问 AI，但问答是一次性消耗：答案滑走、笔记散落，下次遇到同一个知识点还是从零开始。知脉只做一件事——把每次提问里出现的知识点「收编」进一张个人知识图谱，给每个知识点一个稳定地址（`物理 / 电学 / 电阻 / 电阻的并联`），并记录它与其他知识点的关系（先修、相关、易混）。

这是 **P0 原型 + P1 技术主线**（方案见 [docs/知脉-知识地图产品方案-v1.0.docx](docs/知脉-知识地图产品方案-v1.0.docx)）：用真实可交互的产品验证「收编 → 归位 → 命中」闭环，并用向量检索与指标埋点量化命中率。

> 🤝 **开发进度 / 架构说明 / 后续计划 / 交接文档：[docs/HANDOFF.md](docs/HANDOFF.md)**

![综合页](docs/screenshots/home-desktop.png)
![对话与收编](docs/screenshots/chat-desktop.png)
![3D 知识库](docs/screenshots/atlas-desktop.png)

## 现在能做什么

- **对话与收编**：提问（学科题、概念、代码、哲学问题都可以）或上传图片 → 分步解答 → 抽取 1–3 个知识点 → 收编卡片（名称/摘要/建议路径/建议关联）→ 写入图谱。接入自己的模型后由模型做真实抽取（从图谱候选节点里选择题式归位），演示模式则用内置脚本
- **独立会话**：从侧栏进入对话页默认是**新对话**；顶部「历史」可切换、删除旧会话，URL 带 `?c=` 可恢复。每个会话的消息、思维链和上下文完全隔离，不会把上一题的内容带进新问题；空会话不会提前写库
- **不限学科的学习助手**：system prompt 覆盖数学、物理、化学、生物、语文、历史、地理、哲学、编程等，不再假设用户是中学生；代码问题用 Markdown 代码块，数学公式用 LaTeX + KaTeX 渲染
- **拍题识图**：选图后先压到最长边 1600（控制请求体，原图不上传云端），优先用设置里的「视觉模型」，未配置则沿用文本模型（需要该模型本身支持图片）；请求结束即释放。聊天记录里的缩略图另压到最长边 640、存在浏览器 IndexedDB（每浏览器最多 200 张），刷新后仍能看到，换设备/清缓存后只保留文件名提示
- **流式思考与逐字显示**：模型返回的 `reasoning_content` / `reasoning` 会实时出现在「思考过程」面板；正文由前端打字机逐字上屏，网络 chunk 再大也不会整段跳出来。思维链随消息存进当前账号的 `chat_messages.payload`（上限 2 万字），刷新后可折叠回看；不返回该字段的模型不会显示面板
- **可编辑与整理**：收编前可改名称与摘要；详情面板里还能重命名、改摘要、调整位置、查看来源与命中记录；「换个位置」支持**新建父级路径**（如 `物理 / 电学 / 电路`，已有同名层级自动复用、缺失的自动创建），空图谱也能直接建学科/章节
- **完整讲解子页**：每个知识点有独立的 `/node/[id]` 页面，可由 AI 根据来源对话生成 Markdown 讲解，也可手动编辑保存；正文支持行内/独立 LaTeX 公式（`$...$`、`$$...$$`），由 KaTeX 渲染，向量箭头、绝对值、矩阵、cases 等复杂写法都能正确排版；侧栏带来源、关系、子知识点与元信息
- **可视化整理**：在 3D 画布上直接拖动节点改变空间位置（父节点会带着子树走），拖到另一个节点上松手即可改变归属；支持「恢复自动位置 / 重置全部位置」
- **关系编辑**：画布连线模式点两个点即可建立关系；面板/详情页里可添加、改类型、删除关系；支持「同源启发式」与「AI 推荐」自动建议（采纳后才写入）
- **双地址定位**：按图找（路径面包屑）+ 按记忆找（标题/别名检索），第二次问同一个知识点直接给路径而不是重讲
- **3D 知识库**：确定性分层球壳布局 + 手动位置覆盖、受控轨道视角、关系聚焦/全部关系线切换、密度三档（概览/标准/细节）、折叠 `+N`、搜索与深链定位
- **三端响应式**：桌面（侧栏）/ 平板（图标栏）/ 手机（顶栏 + 底部 Tab）
- **云端账号**：匿名游客打开即用，数据存云端；绑定邮箱密码后换设备登录同一账号即可互通。已有账号可在「设置 → 账号 → 登录已有账号」直接切换
- **BYOK**：接入自己的 OpenAI 兼容模型（DeepSeek / OpenAI / Kimi / 智谱 / 硅基流动…），Key 只存本机，经本站代理转发规避 CORS
- **真实向量命中**：配好向量模型后，提问先做语义检索（pgvector 1024 维 + HNSW，余弦相似度 ≥ 0.78 命中），对换了说法的问法更稳；未配置 Key、调用失败或相似度不足时**自动降级关键词匹配**，交互不变
- **指标埋点与 insights**：对话、命中、收编、关系、登录等关键行为写入 `events` 表（只记事件名与少量数值属性，**不记录问题/答案正文**），用 `docs/insights.sql` 在 Supabase SQL Editor 查命中率、收编率、7 日留存、向量覆盖率
- **Demo 一键体验**：`?demo=1` 打开自动载入示例图谱（每个浏览器会话只执行一次），适合公开 Demo
- **数据兜底**：一键导出 JSON、载入示例图谱、清空图谱/对话

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS 4 |
| 状态 | zustand（graph / chat / session / settings 四个 store） |
| 数据与账号 | Supabase（Auth 匿名登录、Postgres、行级安全 RLS、pgvector 向量检索）；拍题缩略图存浏览器 IndexedDB（不上传云端） |
| 3D 渲染 | Canvas 2D 伪 3D（自研轨道相机 + 手动位置覆盖 + 拖拽交互，零渲染依赖） |
| Markdown / 公式 | Markdown-lite 自研；公式用 **KaTeX** 渲染（复杂 LaTeX、MathML 可访问性）；3D、SSE、关系图等其余部分保持零依赖 |
| AI | 演示脚本（P0）+ BYOK OpenAI 兼容流式接口 + `/api/llm/chat` 代理（对话 / 抽取 / 讲解 / 关系建议 / 图片识图）；支持读取服务商返回的流式思维链，正文前端逐字上屏；图片识图优先用独立视觉模型；embedding 走 OpenAI `/embeddings` 协议，统一 1024 维 |
| 测试 | vitest（纯逻辑单测，含向量命中/埋点/图片校验与图片请求组装/公式分词/SSE 思维链提取/会话标题）+ `scripts/verify-rls.mjs` 权限校验 |
| CI | GitHub Actions（`.github/workflows/ci.yml`：`npm ci → typecheck → lint → test → build`） |

## 快速开始

### 1. 环境

- Node.js 22（仓库含 `.nvmrc`；最低 20.19）
- npm

```powershell
npm install
```

### 2. 配置 Supabase（约 5 分钟）

1. 打开 [supabase.com](https://supabase.com/dashboard) 创建一个免费项目（建议区域选 **Singapore**）
2. **Authentication → Sign In / Providers** 里打开 **Anonymous Sign-ins**（匿名游客登录必需）
3. **Project Settings → API** 复制 `Project URL` 与 `anon public key`
4. **Project Settings → Database → Connection string → URI** 复制数据库连接串（国内网络连不上时跳过，改用第 6 步的「管理 API」方式）
5. 把值写进项目根目录的 `.env.local`（可参考 `.env.example`）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_DB_URL=postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres
```

6. 初始化数据库（建表 + 索引 + RLS 策略 + 触发器 + pgvector 向量列 + events 埋点表，可重复执行）：

```powershell
npm run db:init
```

> 无法直连数据库时（国内网络常见）：在 **Account → Access Tokens** 生成 token，把
> `SUPABASE_ACCESS_TOKEN=sbp_xxx` 写进 `.env.local`，`db:init` 会自动改走 `api.supabase.com`
> 的管理 API；也可以直接把 `supabase/schema.sql` 粘贴到 Supabase 控制台的 SQL Editor 执行。
> `SUPABASE_DB_URL` 也支持只填数据库密码，脚本会按项目 ref 自动拼连接串。
>
> 已经初始化过旧版本数据库的项目：再执行一次 `npm run db:init` 即可补齐 `detail`（讲解正文）、
> `manual_position`（手动位置）、`embedding`/`embedding_model`/`embedding_updated_at`（向量列）、
> HNSW 索引与 `events` 表、3 个向量 RPC、`conversations` 表与 `chat_messages.conversation_id`（旧消息回填「历史对话」），
> 脚本是幂等的。若 `embedding` 列已是其它维度，脚本会报错提示先迁移（维度不可轻改，见「向量命中」小节）。

### 3. 启动

```powershell
npm run dev
# http://localhost:3100
```

打开页面会自动创建匿名游客账号（数据已在云端）。在「设置 → 账号」绑定邮箱密码后，就可以在其他设备用同一账号登录。

新账号首次打开是空图谱。想直接看示例数据：打开 `http://localhost:3100/?demo=1`，会在图谱为空时自动载入内置示例图谱（每个浏览器会话只执行一次，随后自动从地址栏移除 `demo` 参数）。

### 国内网络 / 需要代理时

浏览器端的 Supabase 请求会自动走系统代理（Clash / v2ray 等）；但终端里的 Node 默认**不走**系统代理，常见现象是登录失败、控制台 `fetch failed`、`ECONNRESET`。

- 启动开发服务器：`npm run dev:proxy`（默认代理 `http://127.0.0.1:7897`，端口不同就改 `scripts/dev-proxy.ps1` 的 `-Proxy` 参数或直接改脚本）
- 需要访问 Supabase **HTTPS**（Auth / PostgREST）的操作，例如浏览器端 E2E、`npm run verify:rls`（默认模式），先在终端设置代理：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:NO_PROXY="localhost,127.0.0.1,::1"
$env:NODE_USE_ENV_PROXY="1"
```

- `npm run db:init` 走 Postgres 5432：能直连时**不需要代理**；连不上时再用上方代理，或改走管理 API。
- `node scripts/verify-rls.mjs --direct` 同样走 Postgres 5432，HTTPS 被重置时用它校验 RLS（含 events / 向量 RPC / 会话与消息归属）。

### 演示模式（不连接 Supabase）

只想先看界面？在 `.env.local` 里加一行：

```bash
NEXT_PUBLIC_DEMO_MODE=1
```

重启后使用内存示例数据（物理 + 化学约 100 个知识点），**无持久化**，仅供预览 UI 与交互。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器（3100 端口） |
| `npm run dev:proxy` | 走本地代理的开发服务器（国内网络用） |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm run test` | vitest 单元测试 |
| `npm run db:init` | 初始化 / 更新数据库结构（含 pgvector、events、向量 RPC，幂等） |
| `npm run verify:rls` | 用两个匿名账号验证 RLS 隔离 |
| `node scripts/verify-rls.mjs --direct` | 走 Postgres 直连（`SUPABASE_DB_URL`）校验同一套 RLS（含 events / 向量表 / 会话归属），HTTPS 被重置时可用 |
| `npm run embed:backfill` | 直连 Postgres（`SUPABASE_DB_URL`）用 BYOK 向量模型回填存量节点向量（读 `EMBEDDING_*`；支持 `-- --dry-run` / `-- --force`） |

## 向量命中（可选）

命中默认仍可用关键词匹配；配好向量模型后会优先做语义检索，不配也不影响使用。**没有 Key 或服务不可用时自动降级关键词**。

1. 打开「设置 → 模型 → 向量模型」，可选预设：OpenAI `text-embedding-3-small`、硅基流动 `BAAI/bge-m3`、智谱 `embedding-3`；也可以手填任何 OpenAI 兼容 `/embeddings` 模型的名称
2. 若向量服务与对话服务不是同一家，可在设置里单独填「向量 Base URL / 向量 Key」；**Key 只存本机 localStorage**，不入库、不导出、不写日志
3. 点「测试向量」确认连通：会请求一次 `/embeddings` 并校验输出是否为 **1024 维**
4. 存量节点需要补向量：「设置 → 数据 → 重建向量索引」；或本地执行 `npm run embed:backfill`（直连 Postgres，需 `.env.local` 的 `SUPABASE_DB_URL` + `EMBEDDING_*`，可先 `-- --dry-run` 预览）
5. **换向量模型后必须重建索引**：向量按 `embedding_model` 隔离，旧模型的向量不会参与新模型的检索
6. 判定规则：余弦相似度 ≥ `0.78` 视为命中；低于阈值、未配置或调用异常时降级为关键词匹配（`src/lib/search.ts`）

> 向量维度固定 **1024**（对应数据库 `nodes.embedding vector(1024)` 与 HNSW 索引）。换维度需要改数据库列并重建全部向量，不能只改配置。
> 支持 `dimensions` 参数的模型（`text-embedding-3*`、`embedding-3` 等）会自动请求 1024 维；`bge-m3` 等原生 1024 维模型直接使用。

## 部署与 CI

仓库侧已就绪，完整步骤见 **[docs/DEPLOY.md](docs/DEPLOY.md)**（Vercel Hobby 导入、Supabase Auth/数据库配置、keepalive secrets、发布与回滚）：

- `.nvmrc`：固定 Node **22**
- `.github/workflows/ci.yml`：push / PR 跑 `npm ci → typecheck → lint → test → build`，不配置任何云端密钥
- `.github/workflows/keepalive.yml`：每日 ping 一次 Supabase REST，规避免费项目 7 天不活跃暂停（未配置 secrets 时自动跳过）
- 支持 `?demo=1` 自动载入示例图谱，适合公开 Demo

[![CI](https://github.com/Ha2eS1onn/zhimy/actions/workflows/ci.yml/badge.svg)](https://github.com/Ha2eS1onn/zhimy/actions/workflows/ci.yml)

> **线上 Demo**：<https://zhimy.kasho.fun>（备用：<https://zhimy.vercel.app>；Vercel Hobby，公开访问，打开即自动创建匿名游客账号）
>
> 仓库：<https://github.com/Ha2eS1onn/zhimy> ｜ 部署步骤与回滚见 [docs/DEPLOY.md](docs/DEPLOY.md)

## 目录结构

```
src/
├─ app/                     # Next.js App Router
│  ├─ page.tsx              # 综合页
│  ├─ chat/page.tsx         # 对话页
│  ├─ atlas/page.tsx        # 3D 知识库（拖拽定位 / 连线 / 关系编辑）
│  ├─ node/[id]/page.tsx    # 知识点完整讲解子页
│  ├─ api/llm/chat/route.ts # BYOK 对话代理（认证 + https + 白名单 + 防 SSRF）
│  ├─ api/llm/embeddings/route.ts # 向量代理（同样的防护）
│  └─ api/health/route.ts   # 健康检查
├─ components/
│  ├─ shell/                # AppShell / 侧栏 / 移动端导航 / 设置弹层
│  ├─ chat/                 # 对话流、收编卡片、输入器
│  ├─ atlas/                # Canvas 渲染、详情面板、关系列表/编辑器/建议
│  ├─ node/                 # 完整讲解页、Markdown-lite 渲染与正文编辑器
│  └─ common/               # Sheet / 位置选择器 / Toast / 本地缩略图
├─ lib/
│  ├─ layout/               # 确定性球壳布局 + 手动位置覆盖（方案 §5.3）
│  ├─ atlas/                # 投影/逆投影、相机、渲染、命中、可见性
│  ├─ ai/                   # 演示脚本、BYOK 客户端、图片请求组装、向量检索/命中、抽取、讲解生成、关系建议
│  ├─ conversations.ts      # 会话标题与排序的纯逻辑
│  ├─ media/                # 拍题图校验、缩略图生成、IndexedDB 本地缩略图缓存
│  ├─ math/                # 公式定界符分词（inline）与聊天跨行公式切分（display）
│  ├─ repo/                 # Supabase / 内存两种数据仓库实现
│  └─ path.ts search.ts relations.ts analytics.ts
├─ store/                   # zustand stores
├─ data/seed/               # 示例图谱（物理 + 化学）
└─ proxy.ts                 # Supabase 会话刷新（Next 16 proxy 约定）
supabase/schema.sql         # 数据库结构（幂等；含 pgvector / events / RPC）
docs/insights.sql           # 指标聚合 SQL（Supabase SQL Editor 执行）
scripts/                    # db-init / verify-rls / embed-backfill / 无头截图
.github/workflows/          # CI + Supabase 保活
tests/                      # 纯逻辑单元测试
```

## 数据与隐私

- 知识点、关系、来源、对话和会话都存在**你自己的 Supabase 账号**下，所有表启用 RLS，只能读写自己的数据；消息只能挂到自己的会话下
- 语义向量（1024 维）也存在你自己的数据库节点表里；生成向量的 Key 只在本机，经本站代理转发时不做保存
- 拍题原图不写入 Supabase：完整图片只在当次请求中发给用户自己配置的模型（发送前压到最长边 1600），聊天缩略图另压到 640px 后仅存本机 IndexedDB（未加密，清站点数据即丢失）；分享设备前记得切换账号，切换账号会清空本地缩略图
- 埋点只写事件名与少量数值属性（最多 12 个标量键），**不记录问题、答案、图片内容**；`events` 同样启用 RLS，只能读自己的行
- 思维链（reasoning）只存在当前账号的 `chat_messages.payload` 里，不写 events；当前「导出 JSON 备份」只导出图谱，不包含对话消息/思维链，「清空对话记录」会一并删除。部分服务商可能把系统提示或中间推理带进 reasoning，分享屏幕前请留意
- 匿名账号只存在于当前浏览器的会话 cookie 里：**绑定邮箱前清缓存会丢失访问入口**，请尽早绑定（首页与设置里都有入口）
- 模型 API Key 只存本机 localStorage，不入库、不导出、不写日志；代理模式只做转发
- 内置「导出 JSON 备份」，建议定期导出

## 路线图

- **P0（已完成）**：页面骨架、云端账号、收编闭环、3D 知识库与拖拽定位、关系编辑、完整讲解子页、三端布局、BYOK 对话/抽取/讲解/关系建议
- **P1（进行中）**：真实命中 ✅（pgvector 1024 维 + 关键词兜底）、指标埋点与 insights ✅、拍题缩略图本地缓存 ✅、独立会话与上下文隔离 ✅、部署与 CI ✅（<https://zhimy.kasho.fun>，push 自动部署）、抽取效果优化（多轮对话上下文）、跨端 Realtime、复习闭环；图片云端持久化与 OCR 明确不做
- **P2**：掌握度与推荐、导入、分享、移动端壳

## 已知限制

- **向量命中依赖服务商支持 OpenAI `/embeddings` 协议（1024 维）**：没配 Key、未填向量模型或调用失败时会自动降级关键词匹配，命中率随之下降；5 种问法的命中验收需要真实 Key
- 存量节点 / 载入的示例图谱需要回填向量（数据页「重建向量索引」或 `npm run embed:backfill`）；换向量模型必须重建，维度 1024 不能轻改
- 演示模式的抽取出自脚本，真实模式已支持 BYOK 抽取
- 公式由 KaTeX 渲染，覆盖中学常见写法；`mhchem`（`\ce{}` 化学式）等未安装的扩展会以红色高亮显示，表格仍不支持；Markdown-lite 不支持图片
- **思维链依赖服务商/模型自己返回**：本项目只做被动读取（`reasoning_content` / `reasoning` / `thinking` / `reasoning_details`），不会主动要求模型“展示思考”，也不保证每个模型都有；DeepSeek 可试 `deepseek-reasoner`，OpenRouter 可试带 reasoning 的模型。单条保存上限 2 万字，超出会截断
- 手动拖动的空间位置是**绝对坐标**：拖动父节点会带动未手动定位的子节点；已经手动定位的节点不会随父节点移动，可用「恢复自动位置」清除
- 题目图片**不上传云端**：原图只用于当次模型提问（发送前压到 1600px），聊天缩略图仅存在当前浏览器 IndexedDB（最多 200 张，未加密）；换设备、无痕窗口或清站点数据后图片不会出现，只保留文件名提示，属于设计取舍而非故障
- **图片识图依赖模型能力**：设置里的「视觉模型」留空时会沿用文本模型，纯文本模型（如 `deepseek-chat`）会拒绝图片输入；视觉模型需与 Base URL / Key 属于同一服务商。发图后模型说“没看到图片”，先检查这里
- 多端同步依赖重新打开页面刷新，暂无实时推送
- **会话**：默认进入对话页是新对话；旧会话从「历史」进入，暂不支持重命名、搜索和置顶。删除会话会级联删除该会话的消息；「清空对话记录」会删除全部会话。旧版本历史消息在 `db:init` 时归入「历史对话」
- 演示模式（`NEXT_PUBLIC_DEMO_MODE=1`）是内存数据，刷新即重置
- 线上 Demo 部署在 Vercel Hobby（美东区域），不承诺 SLA 与数据持久性；Supabase 免费项目的邮箱确认受内置 SMTP 额度限制，公开 Demo 的「绑定邮箱」仅作演示（见 [docs/DEPLOY.md](docs/DEPLOY.md)）
- Supabase 免费项目 7 天不活跃会暂停（数据保留，控制台恢复即可；已提供每日 keepalive 工作流）
- 中国大陆访问 `supabase.co` 可能较慢，正式运营可迁移自托管实例

## 常见问题

**匿名登录失败 / 提示 anonymous sign-ins disabled？**
去 Supabase 控制台 Authentication → Sign In / Providers 打开 Anonymous Sign-ins，然后重试。

**在另一个浏览器里怎么登录已有账号？**
打开「设置 → 账号」→ 切到「登录已有账号」，用绑定过的邮箱和密码登录即可（新浏览器会先自动创建游客账号，登录后会切换到你的账号，游客数据不会合并）。如果提示"A user with this email address has already been registered"，说明该邮箱已绑定，直接走登录即可，不必再次绑定。

**BYOK 对话报跨域（CORS）错误？**
把设置里的请求方式切到「代理（推荐）」，由本站 `/api/llm/chat` 转发；如果服务商域名不在默认白名单，可用 `LLM_PROXY_ALLOWED_HOSTS=api.example.com` 环境变量扩展。

**配了向量模型，命中还是关键词？**
先到「设置 → 模型」点「测试向量」，确认连通且返回 1024 维（部分服务商需要支持 `dimensions` 参数，或改用原生 1024 维的 `BAAI/bge-m3`）；再「设置 → 数据 → 重建向量索引」给存量节点补向量。相似度低于 0.78、未配置 Key 或调用异常时，按设计自动降级为关键词匹配。

**线上 Demo 绑定邮箱收不到确认邮件？**
公开 Demo 使用 Supabase 免费项目，内置 SMTP 免费额度极低，「绑定邮箱 / 找回密码」的确认邮件可能收不到，仅作功能演示。本地或自建 Supabase 项目配置自有 SMTP 并开启邮箱确认后可正常使用（见 [docs/DEPLOY.md](docs/DEPLOY.md)）。

**打开后图谱是空的 / 想看示例数据？**
新账号默认是空图谱。访问 `/?demo=1` 会在图谱为空时自动载入示例图谱；也可以「设置 → 数据 → 载入示例图谱」。注意示例图谱节点需要用「重建向量索引」回填向量后才能体验向量命中。

**图谱为空时怎么建学科 / 章节？**
不用先建空壳：在收编卡片的「换个位置」或已有节点的「换个位置」里，找到「新建父级路径」，输入 `物理 / 电学` 这种带 `/` 的层级后点「创建并使用」即可——已存在的同名层级会复用、缺失的自动创建，知识点会直接挂到路径末端。新建的层级是普通知识点节点（状态 active），之后可以继续往下挂内容；移动节点时如果路径经过自己或自己的子节点，会提示换一个路径而不会产生循环。

**页面一直停在「正在连接你的知识图谱…」？**
说明浏览器或开发服务器访问不到 `*.supabase.co`（国内网络常见 HTTPS 被 reset，日志里是 `AuthRetryableFetchError: fetch failed`）：
1. 先启动 Clash 等代理，再用 `npm run dev:proxy` 重启（**不要**用 `npm run dev`；`dev:proxy` 会让 Node 侧请求也走代理）
2. 现在启动超过 6 秒会显示提示，15 秒仍失败会切到错误页，按提示启动代理后点「重试」即可，不用一直等
3. 只想先看界面：在 `.env.local` 加 `NEXT_PUBLIC_DEMO_MODE=1` 后重启，使用内存示例数据（无持久化，刷新重置）
4. 用手机/平板通过局域网 IP 访问时，除网络本身要能访问 Supabase 外，浏览器所在设备也需要各自的代理/网络配置；`next.config.ts` 已自动把本机网卡 IPv4 加入 `allowedDevOrigins`（也可用 `DEV_ALLOWED_ORIGINS=ip1,ip2` 追加），改完需重启 dev server

**拖动了节点但看起来位置没变？**
拖动节点后会固定为「手动定位」（详情面板会显示徽标）。点「恢复自动位置」可回到球壳布局；顶栏「重置位置」会清除全部手动位置。若刚拖动的是父节点，子节点会跟着一起移动，这是预期行为。

**刷新后拍题图片没了 / 换设备看不到图？**
这是设计行为：原图只用于当次提问，不会上传云端；聊天缩略图只保存在当前浏览器的 IndexedDB（每浏览器最多 200 张）。换设备、无痕窗口、清站点数据、或缩略图超过上限被裁掉后，消息里只会显示文件名提示。需要长期留图请自行保存原图或截图。

**上一题的内容总是带进新问题？**
进入对话页默认是新对话；随时点顶部的「新对话」也会清空上下文。每个会话的消息和思维链独立存储，互不影响，旧会话从「历史」进入。注意：默认新对话只在发送第一条消息时才创建，空会话不会写库。

**公式显示成原始 `$$` / 反斜杠？**
先确认页面已加载最新代码并刷新。公式现在由 KaTeX 渲染：聊天里的跨行 `$$...$$` 会先被切成独立公式块，行内 `$...$` / `\(...\)` 也会识别；`$(1,0,0)$` 这类坐标同样按公式处理。如果某个命令仍以红色高亮显示，说明 KaTeX 不支持该宏/环境（例如未安装的 `mhchem`），把原始公式发我即可补支持。

**为什么看不到「思考过程」/ 模型不显示思维链？**
思维链是服务商的可选字段，不是所有模型都会返回。DeepSeek 需要 `deepseek-reasoner` 一类推理模型，OpenRouter 需要选择带 reasoning 的模型；普通对话模型通常只返回正文。即使模型返回 reasoning，本项目也不会把它写进 events 或分享内容，只存在当前账号的聊天记录里。

**发图后模型说没看到图片 / 只回复文字？**
先检查「设置 → 模型 → 视觉模型」：留空时图片请求会沿用文本模型；DeepSeek 等纯文本模型不支持图片，请填同一服务商的视觉模型（例如 `glm-4v-flash`、`gpt-4o-mini`、`Qwen2.5-VL` 系列），保存后重新发图。图片会压到最长边 1600 随请求发送，不会上传到 Supabase；如果仍失败，设置页的错误提示会说明是模型不支持还是请求体过大。

**选了图片却没显示缩略图 / 提示格式不支持？**
本项目没有“上传”步骤：图片只在选中后读取为本地 dataURL，压缩后发给你的模型（视觉模型优先）。提示格式不支持时请改用 JPG / PNG / WebP / GIF；超过 10 MB 请先压缩或截图；iPhone 的 HEIC 原图不在支持列表里，请先在相册中导出为 JPG 再选择（个别图片解码失败时提问仍可继续，只是消息里只显示文件名）。

**在受限的 Windows 沙箱/终端里 `next build` 或 `vitest` 报 `spawn EPERM`？**
构建/测试需要启动子进程，请在普通终端（完整权限）里执行；本项目代码本身不依赖该限制。

## 开源协议

[MIT](LICENSE) © 2026 Ha2eS1onn
