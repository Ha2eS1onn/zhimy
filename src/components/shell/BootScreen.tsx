"use client";

export function BootScreen() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-shell text-ink">
      <div className="relative grid size-16 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
        <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-accent via-[#b388ff] to-pink text-2xl font-bold text-black">
          知
        </span>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">正在连接你的知识图谱…</p>
        <p className="mt-1 text-xs text-muted">把 AI 答疑变成可寻址、可联想、可收纳的知识地图</p>
      </div>
    </div>
  );
}
