"use client";

import { useEffect, useState } from "react";

export function BootScreen() {
  // 网络被重置时 Supabase 客户端会重试一段时间；超过几秒给出可操作的提示，
  // 15 秒后 sessionStore 会切到错误页（带代理/演示模式指引）。
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main id="main" className="flex h-dvh flex-col items-center justify-center gap-5 bg-shell px-6 text-ink">
      <div className="relative grid size-16 place-items-center">
        <span className="brand-mark size-16 rounded-2xl text-2xl">知</span>
        <span className="absolute -bottom-2 h-1 w-10 -rotate-2 rounded-full bg-[var(--orange)]" />
      </div>
      <div className="max-w-md text-center">
        <p className="eyebrow">知脉 · AI 知识地图</p>
        <p className="mt-2 text-base font-[750] tracking-[-0.02em]">正在连接你的知识图谱…</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">把 AI 答疑变成可寻址、可联想、可收纳的知识地图</p>
        {slow ? (
          <p className="mx-auto mt-3 max-w-sm rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
            网络较慢或无法访问 Supabase。国内网络请先启动代理，再用{" "}
            <code className="font-mono">npm run dev:proxy</code> 重启开发服务器；
            或临时设置 NEXT_PUBLIC_DEMO_MODE=1 离线预览。
          </p>
        ) : null}
      </div>
    </main>
  );
}
