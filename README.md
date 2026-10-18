# 知脉 · AI 知识地图

> 把 AI 答疑从「一次性消耗」变成**可寻址、可联想、可收纳**的个人知识图谱。

学生每天都在问 AI，但问答是一次性消耗：答案滑走、笔记散落，下次遇到同一个知识点还是从零开始。知脉只做一件事——把每次提问里出现的知识点「收编」进一张个人知识图谱，给每个知识点一个稳定地址（`物理 / 电学 / 电阻 / 电阻的并联`），并记录它与其他知识点的关系（先修、相关、易混）。

这是 **P0 原型**（方案见 [docs/知脉-知识地图产品方案-v1.0.docx](docs/知脉-知识地图产品方案-v1.0.docx)）：用真实可交互的产品验证「收编 → 归位 → 命中」闭环是否成立。

![综合页](docs/screenshots/home-desktop.png)
![对话与收编](docs/screenshots/chat-desktop.png)
![3D 知识库](docs/screenshots/atlas-desktop.png)

## 现在能做什么

- **对话与收编**：提问或上传题目图片 → 分步解答 → 抽取 1–3 个知识点 → 收编卡片（名称/摘要/建议路径/建议关联）→ 写入图谱。接入自己的模型后由模型做真实抽取（从图谱候选节点里选择题式归位），演示模式则用内置脚本
- **可编辑与整理**：收编前可改名称与摘要；详情面板里还能重命名、改摘要、调整位置、查看来源与命中记录
- **双地址定位**：按图找（路径面包屑）+ 按记忆找（标题/别名检索），第二次问同一个知识点直接给路径而不是重讲
- **3D 知识库**：确定性分层球壳布局、受控轨道视角、关系聚焦、密度三档（概览/标准/细节）、折叠 `+N`、搜索与深链定位
- **三端响应式**：桌面（侧栏）/ 平板（图标栏）/ 手机（顶栏 + 底部 Tab）
- **云端账号**：匿名游客打开即用，数据存云端；绑定邮箱密码后换设备登录同一账号即可互通。已有账号可在「设置 → 账号 → 登录已有账号」直接切换
- **BYOK**：接入自己的 OpenAI 兼容模型（DeepSeek / OpenAI / Kimi / 智谱 / 硅基流动…），Key 只存本机，经本站代理转发规避 CORS
- **数据兜底**：一键导出 JSON、载入示例图谱、清空图谱/对话

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS 4 |
| 状态 | zustand（graph / chat / session / settings 四个 store） |
| 数据与账号 | Supabase（Auth 匿名登录、Postgres、行级安全 RLS） |
| 3D 渲染 | Canvas 2D 伪 3D（自研轨道相机，零渲染依赖） |
| AI | 演示脚本（P0）+ BYOK OpenAI 兼容流式接口 + `/api/llm/chat` 代理 |
| 测试 | vitest（46 个纯逻辑单测）+ `scripts/verify-rls.mjs` 权限校验 |

## 快速开始

### 1. 环境

- Node.js >= 20.19
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

6. 初始化数据库（建表 + 索引 + RLS 策略 + 触发器，可重复执行）：

```powershell
npm run db:init
```

> 无法直连数据库时（国内网络常见）：在 **Account → Access Tokens** 生成 token，把
> `SUPABASE_ACCESS_TOKEN=sbp_xxx` 写进 `.env.local`，`db:init` 会自动改走 `api.supabase.com`
> 的管理 API；也可以直接把 `supabase/schema.sql` 粘贴到 Supabase 控制台的 SQL Editor 执行。
> `SUPABASE_DB_URL` 也支持只填数据库密码，脚本会按项目 ref 自动拼连接串。

### 3. 启动

```powershell
npm run dev
# http://localhost:3100
```

打开页面会自动创建匿名游客账号（数据已在云端）。在「设置 → 账号」绑定邮箱密码后，就可以在其他设备用同一账号登录。

### 国内网络 / 需要代理时

浏览器端的 Supabase 请求会自动走系统代理（Clash / v2ray 等）；但终端里的 Node 默认**不走**系统代理，常见现象是登录失败、控制台 `fetch failed`、`ECONNRESET`。

- 启动开发服务器：`npm run dev:proxy`（默认代理 `http://127.0.0.1:7897`，端口不同就改 `scripts/dev-proxy.ps1` 的 `-Proxy` 参数或直接改脚本）
- 运行 `npm run db:init` / `npm run verify:rls` 前，先在终端设置代理：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:NO_PROXY="localhost,127.0.0.1,::1"
$env:NODE_USE_ENV_PROXY="1"
```

- 数据库迁移走管理 API 时（见上文），不需要代理。

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
| `npm run db:init` | 初始化 / 更新数据库结构 |
| `npm run verify:rls` | 用两个匿名账号验证 RLS 隔离 |

## 目录结构

```
src/
├─ app/                     # Next.js App Router
│  ├─ page.tsx              # 综合页
│  ├─ chat/page.tsx         # 对话页
│  ├─ atlas/page.tsx        # 3D 知识库
│  └─ api/llm/chat/route.ts # BYOK 代理（认证 + https + 白名单 + 防 SSRF）
├─ components/
│  ├─ shell/                # AppShell / 侧栏 / 移动端导航 / 设置弹层
│  ├─ chat/                 # 对话流、收编卡片、输入器
│  ├─ atlas/                # Canvas 渲染、详情面板、工具栏
│  └─ common/               # Sheet / 位置选择器 / Toast
├─ lib/
│  ├─ layout/               # 确定性球壳布局（方案 §5.3）
│  ├─ atlas/                # 投影、相机、渲染、命中、可见性
│  ├─ ai/                   # 演示脚本、OpenAI 兼容客户端、SSE、代理守卫
│  ├─ repo/                 # Supabase / 内存两种数据仓库实现
│  └─ path.ts search.ts relations.ts
├─ store/                   # zustand stores
├─ data/seed/               # 示例图谱（物理 + 化学）
└─ proxy.ts                 # Supabase 会话刷新（Next 16 proxy 约定）
supabase/schema.sql         # 数据库结构（幂等）
scripts/                    # db-init / verify-rls / 无头截图
tests/                      # 纯逻辑单元测试
```

## 数据与隐私

- 知识点、关系、来源、对话都存在**你自己的 Supabase 账号**下，所有表启用 RLS，只能读写自己的数据
- 匿名账号只存在于当前浏览器的会话 cookie 里：**绑定邮箱前清缓存会丢失访问入口**，请尽早绑定（首页与设置里都有入口）
- 模型 API Key 只存本机 localStorage，不入库、不导出、不写日志；代理模式只做转发
- 内置「导出 JSON 备份」，建议定期导出

## 路线图

- **P0（当前）**：页面骨架、云端账号、收编闭环、3D 知识库、三端布局、BYOK 对话与真实抽取；命中判定为本地关键词匹配
- **P1**：embedding 检索与命中、抽取效果优化（多轮对话上下文）、图片上传与 OCR、跨端 Realtime、复习闭环、部署上线
- **P2**：掌握度与推荐、导入、分享、移动端壳

## 已知限制

- 命中判定仍是本地关键词匹配（P1 换成 embedding 检索）；演示模式的抽取出自脚本，真实模式已支持 BYOK 抽取
- 题目图片仅本地预览，不会上传（P1 接 Supabase Storage）
- 多端同步依赖重新打开页面刷新，暂无实时推送
- 演示模式是内存数据，刷新即重置
- Supabase 免费项目 7 天不活跃会暂停（数据保留，控制台恢复即可）
- 中国大陆访问 `supabase.co` 可能较慢，正式运营可迁移自托管实例

## 常见问题

**匿名登录失败 / 提示 anonymous sign-ins disabled？**
去 Supabase 控制台 Authentication → Sign In / Providers 打开 Anonymous Sign-ins，然后重试。

**在另一个浏览器里怎么登录已有账号？**
打开「设置 → 账号」→ 切到「登录已有账号」，用绑定过的邮箱和密码登录即可（新浏览器会先自动创建游客账号，登录后会切换到你的账号，游客数据不会合并）。如果提示"A user with this email address has already been registered"，说明该邮箱已绑定，直接走登录即可，不必再次绑定。

**BYOK 对话报跨域（CORS）错误？**
把设置里的请求方式切到「代理（推荐）」，由本站 `/api/llm/chat` 转发；如果服务商域名不在默认白名单，可用 `LLM_PROXY_ALLOWED_HOSTS=api.example.com` 环境变量扩展。

**在受限的 Windows 沙箱/终端里 `next build` 或 `vitest` 报 `spawn EPERM`？**
构建/测试需要启动子进程，请在普通终端（完整权限）里执行；本项目代码本身不依赖该限制。

## 开源协议

[MIT](LICENSE) © 2026 Ha2eS1onn
