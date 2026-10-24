"use client";

import { useSessionStore } from "@/store/sessionStore";

export function ConfigGuide() {
  const bootstrap = useSessionStore((state) => state.bootstrap);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell px-4 py-10">
      <div className="card w-full max-w-xl p-6 md:p-8">
        <div className="flex items-center gap-3">
          <span className="brand-mark size-10 text-lg">
            知
          </span>
          <div>
            <h1 className="text-lg font-semibold">还差一步：连接 Supabase</h1>
            <p className="text-xs text-muted">云端账号与数据已经就绪，现在只缺你的项目配置。</p>
          </div>
        </div>

        <ol className="mt-6 space-y-4 text-sm">
          <li>
            <p className="font-medium">1. 创建 Supabase 项目（免费）</p>
            <p className="mt-1 text-xs text-muted">
              打开 supabase.com → New project，区域选 Singapore（离国内最近）。
            </p>
          </li>
          <li>
            <p className="font-medium">2. 开启匿名登录</p>
            <p className="mt-1 text-xs text-muted">
              Authentication → Sign In / Providers → 打开 Anonymous Sign-ins。
            </p>
          </li>
          <li>
            <p className="font-medium">3. 把三个值写进项目根目录的 .env.local</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-[11px] leading-relaxed text-muted">
              {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_DB_URL=postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres`}
            </pre>
            <p className="mt-1 text-xs text-muted">
              前两个在 Project Settings → API；DB URL 在 Project Settings → Database → Connection string。
            </p>
          </li>
          <li>
            <p className="font-medium">4. 初始化数据库并重启开发服务器</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-[11px] leading-relaxed text-muted">
              {`npm run db:init
npm run dev`}
            </pre>
          </li>
        </ol>

        <div className="mt-6 rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">
          想先看看界面？在 <code className="text-ink">.env.local</code> 里加一行{" "}
          <code className="text-ink">NEXT_PUBLIC_DEMO_MODE=1</code> 重启，即可用内存示例数据体验完整 UI（无持久化）。
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button type="button" className="btn-primary" onClick={() => void bootstrap()}>
            我已经配置好了，重新检测
          </button>
          <a
            className="btn-ghost"
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            打开 Supabase
          </a>
        </div>
      </div>
    </div>
  );
}
