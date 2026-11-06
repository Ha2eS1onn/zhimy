"use client";

import { isNativeShell } from "@/lib/platform";
import { promptInstall, usePwaInstall } from "./PwaBridge";

/** 设置页里的安装入口：支持原生安装时给按钮，否则给对应平台的提示。 */
export function PwaInstallRow() {
  const { canInstall, installed, manualHint } = usePwaInstall();
  // 已经在 Android 壳里运行时不用再提示"安装为应用"。
  if (installed || isNativeShell()) return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-line bg-shell px-3 py-2">
      <div>
        <p className="text-xs font-semibold text-ink">安装为应用</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {canInstall
            ? "装到桌面或主屏幕，独立窗口打开，图标直达。"
            : manualHint
              ? "在 Safari 里点「分享 → 添加到主屏幕」。"
              : "用 Chrome / Edge 打开本页后，可在地址栏右侧安装。"}
        </p>
      </div>
      {canInstall ? (
        <button
          type="button"
          className="btn-primary btn-sm shrink-0"
          onClick={() => void promptInstall()}
        >
          安装
        </button>
      ) : null}
    </div>
  );
}
