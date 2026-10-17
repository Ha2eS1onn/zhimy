"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

interface SheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

/** 通用弹层：桌面右侧抽屉，手机底部上滑面板。 */
export function Sheet({ open, title, description, onClose, children, footer, size = "md" }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-stretch md:justify-end">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-line bg-shell shadow-2xl shadow-black/60 md:h-full md:max-h-none md:rounded-none md:rounded-l-2xl md:border-y-0 md:border-r-0 ${
          size === "lg" ? "md:w-[520px]" : "md:w-[420px]"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
