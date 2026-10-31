"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "@/store/settingsStore";
import { Icon } from "@/components/shell/Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
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
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);

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

  // 减少动画时立即卸载；否则等待退场动画结束。
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setPhase("closed"), reducedMotion ? 0 : 320);
    return () => window.clearTimeout(timer);
  }, [closing, reducedMotion]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
  }, [open]);

  useEffect(() => {
    if (mounted) return;
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }, [mounted]);

  useEffect(() => {
    if (phase !== "open") return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>(
        "[data-sheet-initial-focus], input[autofocus], textarea[autofocus]",
      );
      const insideBody = panel.querySelector<HTMLElement>(`.sheet-body ${FOCUSABLE}`);
      (preferred ?? insideBody ?? panel).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
      <div
        aria-hidden="true"
        onClick={closing ? undefined : onClose}
        data-state={phase}
        className="sheet-overlay absolute inset-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={closing || undefined}
        inert={closing}
        tabIndex={-1}
        data-state={phase}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && closing) setPhase("closed");
        }}
        className={`sheet-panel relative flex max-h-[min(88dvh,calc(100dvh-1rem))] w-full flex-col rounded-t-[24px] border-t bg-surface outline-none md:h-full md:max-h-none md:rounded-none md:rounded-l-[24px] md:border-t-0 md:border-l ${
          size === "lg" ? "md:w-[520px]" : "md:w-[420px]"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-[750] tracking-[-0.02em] text-ink">{title}</h2>
            {description ? <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="icon-btn shrink-0" aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="sheet-body min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line bg-shell px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
