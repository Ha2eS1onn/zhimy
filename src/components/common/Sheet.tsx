"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
interface SheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

type SheetPhase = "closed" | "open" | "closing";

/** 通用弹层：桌面右侧抽屉，手机底部上滑面板。 */
export function Sheet({ open, title, description, onClose, children, footer, size = "md" }: SheetProps) {
  const [phase, setPhase] = useState<SheetPhase>(open ? "open" : "closed");
  const mounted = phase !== "closed";
  const closing = phase === "closing";

  useEffect(() => {
    // 对齐下一帧再切换状态，让 CSS 能可靠播放进入/退出动画。
    const frame = window.requestAnimationFrame(() => {
      setPhase((current) => {
        if (open) return "open";
        return current === "open" ? "closing" : current;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // 动画被中断或系统禁用动态效果时，也必须可靠卸载。
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setPhase("closed"), 320);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center md:items-stretch md:justify-end ${
        closing ? "pointer-events-none" : ""
      }`}
    >
      <button
        type="button"
        aria-label="关闭"
        tabIndex={closing ? -1 : undefined}
        onClick={closing ? undefined : onClose}
        data-state={phase}
        className="sheet-overlay absolute inset-0 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={closing || undefined}
        inert={closing}
        data-state={phase}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && closing) setPhase("closed");
        }}
        className={`sheet-panel relative flex max-h-[min(88dvh,calc(100dvh-1rem))] w-full flex-col rounded-t-[24px] bg-shell md:h-full md:max-h-none md:rounded-none md:rounded-l-[24px] ${
          size === "lg" ? "md:w-[520px]" : "md:w-[420px]"
        }`}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
