# 知脉 · 部署手册（维护者）

> 面向对象：持有 GitHub 仓库、Supabase 项目与 Vercel 账号的维护者 / 接手 Agent。
> 本文档覆盖 P1-D 中「部署 + 运维」的完整步骤；仓库侧（CI、保活工作流、`.nvmrc`、`?demo=1`）已就绪，**实际部署尚未执行**。
> 文中 `<!-- TODO: ... -->` 标记的位置在真实部署完成后补填，**不要提交占位或编造的域名/徽章链接**。

## 0. 部署前检查

- [ ] 待部署提交已在 `main` 上通过 GitHub Actions CI（`.github/workflows/ci.yml`）
- [ ] 目标 Supabase 项目已执行 `npm run db:init`（幂等，含 pgvector / events / RPC，见 §3.2）
- [ ] `.env.local` 未被提交（`git status` 确认；本仓库 `.gitignore` 已忽略）
- [ ] 已确认使用 Vercel **Hobby（免费、非商业）** 与 Supabase **免费项目**，接受 §8 的限制
- [ ] 已明确公开 Demo 定位：技术展示，不承诺 SLA 与数据持久性

## 1. 架构与前提

| 组件 | 选型 | 说明 |
| --- | --- | --- |
| 代码托管 / CI | GitHub + GitHub Actions | `ci.yml` 每次 push / PR 跑 typecheck → lint → test → build |
| 应用托管 | Vercel Hobby | 免费非商业；Next.js 16 自动识别 |
| 数据库 / Auth | Supabase 免费项目（建议 Singapore） | Postgres + RLS + pgvector + Anonymous Sign-ins |
| Demo 保活 | GitHub Actions cron | `keepalive.yml` 每日 ping 一次 Supabase REST |
| 可选监控 | `/api/health` | 部署后可用于 curl / 简单 uptime 检查 |

定位：个人开源、非商业项目。部署目标是「可访问的技术 Demo + 可复现的工程流程」，**不做** VPS / Docker / 备案 / 限流 / 告警 / 多环境。

## 2. 仓库 CI

- 工作流：`.github/workflows/ci.yml`（`name: CI`）
- 触发：`push` 与 `pull_request`
- 运行环境：`ubuntu-latest`，Node 版本取自 `.nvmrc`（当前 `22`）
- 步骤：`npm ci` → `npm run typecheck` → `npm run lint` → `npm run test` → `npm run build`
- 顶层 `env: NEXT_TELEMETRY_DISABLED: "1"`；**不配置任何 Supabase 密钥**——缺少环境变量时应用渲染配置引导页，构建不依赖云端
- 建议在 GitHub 仓库 Settings → Branches 对 `main` 开启「Require status checks to pass」并勾选 CI 任务

CI 徽章（README「部署与 CI」小节）在真实跑过一次后再补填：

```markdown
<!-- TODO: 把 <owner>/<repo> 换成真实仓库，路径保持 .github/workflows/ci.yml：
![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)
-->
```

## 3. Supabase 准备

### 3.1 项目与密钥

1. 在 [supabase.com](https://supabase.com/dashboard) 新建免费项目（建议区域 **Singapore**）
2. **Authentication → Sign In / Providers** 打开 **Anonymous Sign-ins**（匿名游客登录必需）
3. **Project Settings → API** 记下 `Project URL` 与 `anon public key`（部署时用）
4. **Project Settings → Database** 的连接串 / 数据库密码仅本地迁移用，**不要配置到 Vercel**

### 3.2 数据库初始化（发布前置步骤）

在本地 `.env.local` 填好 Supabase 配置后执行：

```powershell
npm run db:init
```

- 脚本幂等，可重复执行；本轮结构包含：
  - `create extension vector`（pgvector，装到 `extensions` schema）
  - `nodes.embedding vector(1024)`、`embedding_model`、`embedding_updated_at`
  - HNSW 索引 `nodes_embedding_hnsw_idx`（`vector_cosine_ops`，仅 `embedding is not null`）
  - RPC：`match_nodes`、`set_node_embedding`、`list_nodes_missing_embedding`
  - `events` 表（指标埋点）与索引、RLS 策略
  - `conversations` 表与 `chat_messages.conversation_id`；旧消息自动回填为「历史对话」
- **已初始化过旧版数据库的项目也要再跑一次**（补齐 embedding / events）；脚本带维度守卫：如果 `nodes.embedding` 已是其它维度会直接报错，此时需先迁移或删除该列再执行
- **无需配置 Supabase Storage**：拍题图片不上传云端，只用于当次视觉模型请求；聊天缩略图存在用户浏览器 IndexedDB，部署侧没有额外 bucket / RLS / 环境变量需要准备
- 无法直连数据库时，两种备选：
  - `SUPABASE_ACCESS_TOKEN=sbp_xxx` 写入 `.env.local`，`db:init` 自动改走管理 API
  - 在 Supabase 控制台 **SQL Editor** 整段执行 `supabase/schema.sql`（脚本用 `-- STATEMENT` 分隔语句）
- 若存量节点已存在：配好 BYOK 向量模型后，用「设置 → 数据 → 重建向量索引」或 `npm run embed:backfill` 回填（见 §6）

### 3.3 Auth 配置

1. **Authentication → URL Configuration**
   - `Site URL`：线上主域名（当前 `https://zhimy.vercel.app`；挂自定义域名后改为 `https://zhimy.kasho.fun`）
   - `Redirect URLs`：追加 `https://zhimy.vercel.app/**`、`https://zhimy.kasho.fun/**` 与本地开发地址 `http://localhost:3100/**`
2. **Anonymous Sign-ins** 保持开启（新访客打开即用）
3. **免费版邮箱确认限制**：
   - Supabase 内置 SMTP 免费额度/速率极低，Demo 环境「绑定邮箱 / 找回密码」的确认邮件基本收不到
   - 公开 Demo 建议在 **Authentication → Providers → Email** 关闭 `Confirm email`，让绑定流程可演示；README 的 FAQ 已注明「线上 Demo 的邮箱绑定仅作演示，可能收不到确认邮件」及自建 SMTP 的做法
   - 若面向真实用户开放，必须重新开启邮箱确认并配置自有 SMTP，同时补隐私说明与数据删除能力（当前不做）
4. 可选：定期清理 Demo 项目的测试匿名账号（控制台或 SQL）

## 4. Vercel 部署（Hobby）

### 4.1 导入仓库

1. 登录 [vercel.com](https://vercel.com) → **Add New → Project**
2. 授权并导入 GitHub 仓库：
   <!-- TODO: 换成真实仓库地址，例如 https://github.com/<owner>/<repo> -->
3. 配置（其余保留默认）：
   - Framework Preset：**Next.js**（自动识别）
   - Root Directory：仓库根目录
   - Install Command：保持默认（`npm install`）；如希望严格按 lockfile 安装，可改为 `npm ci`
   - Build Command：`npm run build`
   - Node.js Version：**22.x**（与 `.nvmrc` 一致）
4. **Environment Variables**（Production 与 Preview 都配）——只配这两项：

   | 变量 | 值 |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 的 `anon public key` |

5. **不要**配置以下变量：
   - `NEXT_PUBLIC_DEMO_MODE`：会把线上应用切成**内存演示模式**，真实云端账号与数据全部失效
   - `SUPABASE_DB_URL` / `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF`：仅本地迁移脚本使用，运行时不需要，配到 Vercel 只会扩大密钥泄露面
   - `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`：仅本地回填脚本使用；线上向量模型在用户自己的「设置」里配置
   - `LLM_PROXY_ALLOWED_HOSTS`：除非要额外放开服务商域名，默认不需要
6. Deploy。首次部署完成后拿到域名 `https://<project>.vercel.app`，回到 §3.3 把它写进 Supabase 的 `Site URL` / `Redirect URLs`

### 4.2 部署后自检

- [ ] 首页打开后自动创建匿名游客（没有停在「配置引导页 / 连接云端失败」）
- [ ] `https://<demo-domain>/?demo=1` 自动载入示例图谱，toast 提示「已载入示例图谱（Demo 模式）」，地址栏的 `demo` 参数消失
- [ ] 完成一次「提问 → 收编 → 3D 知识库找到该节点」
- [ ] 新建对话后再提问，确认新旧会话上下文互不干扰；刷新带 `?c=` 的地址能恢复会话
- [ ] 在「设置 → 模型」填 BYOK 后，测试连接通过；填向量模型后测试向量通过
- [ ] 若演示拍题：填写与 Base URL 同服务商的视觉模型，发图后模型能复述题干（留空会沿用文本模型，纯文本模型会拒绝图片）
- [ ] `curl -fsS https://<demo-domain>/api/health` 返回正常 JSON（本轮新增的 `/api/health` 路由提供）
- [ ] 刷新页面后数据仍在（真实云端持久化）
- [ ] 发一张题目图 → 刷新后缩略图仍在（同一浏览器）；无痕窗口登录同账号只显示文件名；DevTools Network 不出现 Storage 请求
- [ ] 换一个浏览器无痕窗口重复打开，不串数据（RLS + 独立匿名账号）

### 4.3 把 Demo 信息写回仓库

部署成功后需要同步三处（当前 `https://zhimy.kasho.fun` 已按此更新，备用 `https://zhimy.vercel.app`）：

| 位置 | 内容 |
| --- | --- |
| `README.md`「部署与 CI」 | Live Demo 链接 + CI 徽章（`https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg`） |
| `docs/HANDOFF.md` | P1-D 状态、线上地址、部署日期 |
| `docs/DEPLOY.md` §3.3 / §4.4 | Site URL 与自定义域名记录 |

### 4.4 自定义域名（可选）

当前线上主域名为 `https://zhimy.kasho.fun`（2026-10-24 接入，CNAME → `cname.vercel-dns.com`，Let's Encrypt 证书已签发），备用地址 `https://zhimy.vercel.app` 同时保留。若需给其它域名做同样配置，按下述步骤操作。

**第 1 步：Vercel 添加域名**

1. 项目 → **Settings → Domains** → 输入 `zhimy.kasho.fun` → **Add**
2. 选择 **Connect to production**（不要选 Redirect，除非确实想把新域名跳到旧地址）
3. Vercel 会显示 `Invalid Configuration` 并提示期望的 CNAME 值（通常是 `cname.vercel-dns.com`）

**第 2 步：DNS 添加 CNAME**

| 字段 | 值 |
| --- | --- |
| 类型 | `CNAME` |
| 主机名 | `zhimy`（部分面板要求完整 `zhimy.kasho.fun`） |
| 值 / 目标 | `cname.vercel-dns.com`（面板要求末尾点时写 `cname.vercel-dns.com.`） |
| TTL | 600（或面板最小值） |

注意：
- 不要开 URL 转发 / CDN 加速 / 泛解析，保持普通 CNAME
- 使用 Cloudflare 时必须设为 **DNS only（灰云）**，橙云代理会拦截 Vercel 的证书签发
- 国内解析面板（如新网互联 `ns1/ns2.myhostadmin.net`、阿里云、DNSPod）对 CNAME 值的格式校验较严，保存失败时先确认类型选的是 CNAME 而不是「显性 URL」

**第 3 步：等待验证与证书**

- 通常 1–10 分钟；Vercel 显示 **Valid Configuration** 后自动签发 Let's Encrypt 证书
- 验证：`curl -I https://zhimy.kasho.fun` 返回 200；`curl https://zhimy.kasho.fun/api/health` 返回 `{"ok":true}`
- 解析查询：`https://cloudflare-dns.com/dns-query?name=zhimy.kasho.fun&type=CNAME`（带 `accept: application/dns-json`）

**第 4 步：生效后同步配置**

1. Supabase → Authentication → URL Configuration：
   - `Site URL` = `https://zhimy.kasho.fun`
   - `Redirect URLs` 追加 `https://zhimy.kasho.fun/**`，保留 `https://zhimy.vercel.app/**` 与 `http://localhost:3100/**`
2. 更新 `README.md` 的 Live Demo、`docs/HANDOFF.md` 顶部地址
3. 若希望旧地址统一到新域名，可在 Vercel Domains 里把 `zhimy.vercel.app` 设为 **Redirect to** 新域名（301）

## 5. Supabase 保活（keepalive）

免费项目连续 **7 天无请求**会被自动暂停（数据保留，控制台手动恢复）。`.github/workflows/keepalive.yml` 每天用 anon key 请求一次 REST 接口，让项目保持活跃。

一次性配置（GitHub 仓库 **Settings → Secrets and variables → Actions**）：

1. **Variables** 页 → New repository variable：
   - Name：`SUPABASE_URL`
   - Value：`https://<project-ref>.supabase.co`（**不要带结尾斜杠**）
2. **Secrets** 页 → New repository secret：
   - Name：`SUPABASE_ANON_KEY`
   - Value：Supabase `anon public key`（该 key 本就会下发到浏览器，用于保活请求无额外风险；**不要**用 service_role key）
3. 验证：Actions → Supabase Keepalive → **Run workflow**，日志应显示 `curl` 成功（接口返回空数组即正常）；之后每天 03:00 UTC（北京时间 11:00）自动运行

说明：

- 未配置时步骤通过 `if` 自动跳过并输出提示，**不会出现红叉**
- `schedule` 只在默认分支生效；GitHub cron 可能延迟/偶发跳过，长期不活跃时可手动 Run workflow
- 保活只避免「不活跃暂停」，不提升任何配额

## 6. Demo 体验：`?demo=1`

- 实现：`src/components/shell/AppProviders.tsx` 在「账号已就绪 + 图谱加载完成 + 图谱为空」时检测 `?demo=1`，调用 `seedExample()` 载入内置示例图谱；成功后 toast「已载入示例图谱（Demo 模式）」并上报 `graph_seeded` 事件
- 去重：`sessionStorage` key `zhimy:demo-seeded` + 组件 `ref` 保证同一浏览器会话只自动执行一次；执行前先用 `history.replaceState` 从地址栏移除 `demo` 参数（保留其它 query 与 hash）
- 安全性：只有**空图谱**账号才会自动填充，不会覆盖已有数据；载入失败只提示错误、不标记为已执行，重新加参数刷新可重试
- 示例图谱里的节点需要**向量回填**才能体验向量命中：
  1. 在「设置 → 模型」配置可用的向量模型（见 README「向量命中」）
  2. 「设置 → 数据 → 重建向量索引」，或本地执行 `npm run embed:backfill`（直连 Postgres，需 `.env.local` 的 `SUPABASE_DB_URL` + `EMBEDDING_*`；可先 `-- --dry-run`）
- 与 `NEXT_PUBLIC_DEMO_MODE=1` 的区别：`?demo=1` 是**真实云端账号 + 示例图谱**（可部署到 Vercel）；`NEXT_PUBLIC_DEMO_MODE` 是纯内存演示（刷新即重置，只能本地预览，线上禁用）

## 7. 日常发布流程

1. 本地：`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`
2. 若 `supabase/schema.sql` 有变更：先在目标项目执行 `npm run db:init`（幂等），再合并部署
3. 合并 / push `main` → CI 绿 → Vercel 自动部署生产
4. 按 §4.2 跑部署后自检；破坏性变更（删列/改维度）不要直接上线，先做数据迁移
5. 指标：在 Supabase SQL Editor 执行 `docs/insights.sql`（SQL Editor / service role 不受 RLS 限制，可看全量聚合；普通用户只能看自己的 events）
6. 回滚：Vercel → Deployments → 选中上一个 Ready 版本 → **Promote to Production**；数据库侧只做向前兼容变更（本仓库约定：新增列/表用 `if not exists`，不删不重命名）
7. 事故排查：先看 Vercel Function Logs 与 `/api/health`，再看 Supabase Logs；嵌入/LLM 相关错误多数是用户侧 BYOK Key、额度或代理白名单问题

## 8. 已知限制（部署后仍存在）

- Vercel **Hobby 仅限非商业用途**；Serverless 函数区域固定（默认美东 iad1）、单次执行时长与并发额度有限，BYOK 长回答的流式响应需实测
- Supabase 免费版：7 天不活跃会暂停（§5 缓解）；数据库/带宽/存储/内置 SMTP 均有额度上限
- 公开 Demo 的邮箱确认 / 找回密码受内置 SMTP 限制（§3.3）；匿名账号清浏览器缓存会丢失访问入口
- Demo **不承诺 SLA、可用性与数据持久性**；不做限流、监控告警、Sentry
- 中国大陆访问 `vercel.app` / `supabase.co` 可能不稳定，Demo 受众以开发者为主
- 图片请求在浏览器端压到最长边 1600 后经 `/api/llm/chat` 转发（代理消息体上限 4 MB，低于 Vercel Functions 约 4.5 MB 的限制）；「视觉模型」留空时会沿用文本模型，纯文本模型不支持图片，需用户自己配置同服务商的视觉模型
- 公式由 KaTeX 在浏览器端渲染（只进入包含公式的 chat/node 路由 chunk，约 +85 KB gzip；字体按需加载），不需要服务端渲染或额外配置
- 指标聚合需要 SQL Editor / service role 手动执行；应用内没有管理后台
- `events` 只记录事件名与少量属性，不含问题/答案正文（隐私约束，见 `docs/HANDOFF.md` 第 5 节）

## 9. 验收清单（P1-D 完成后勾选）

- [ ] CI 在默认分支全绿，README 徽章指向真实 workflow
- [ ] 公网可访问，新访客可完成「提问 → 收编 → 3D 找到」
- [ ] `/?demo=1` 自动载入示例图谱（每个会话一次）
- [ ] keepalive 手动触发成功；未配置 secrets 时跳过且不红叉
- [ ] README Live Demo 链接已补填且可打开
- [ ] `docs/HANDOFF.md` 第 0/2/7/8/12 节状态已同步（P1-D ✅ / 最新提交）

## 10. 待填项汇总（TODO）

| 项目 | 位置 | 说明 |
| --- | --- | --- |
| 仓库地址 | 本文档 §4.1、§4.3 | GitHub 公开仓库 URL |
| CI 徽章 | `README.md`「部署与 CI」、本文档 §2 | 真实 workflow 徽章 URL |
| Live Demo | `README.md`「部署与 CI」 | 真实 Vercel 域名 |
| 部署日期 / 提交 | `docs/HANDOFF.md` 顶部、第 12 节 | 部署完成后再写事实 |
| Supabase 项目 ref | §3.3 / §5 | 仅维护者可见，不要写进公开文档正文 |
