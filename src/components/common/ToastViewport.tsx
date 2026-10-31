"use client";

import { useToastStore } from "@/store/toastStore";

const TONE_CLASS: Record<string, string> = {
  info: "border-line bg-surface text-ink",
  success: "border-ok/50 bg-surface text-ok",
  error: "border-danger/50 bg-surface text-danger",
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      className="toast-viewport pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-3"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toastItem) => (
        <button
          key={toastItem.id}
          type="button"
          data-state={toastItem.leaving ? "leaving" : "open"}
          onClick={() => dismiss(toastItem.id)}
          className={`toast-item pointer-events-auto min-h-11 max-w-[92vw] rounded-xl border px-4 py-2.5 text-left text-xs shadow-[var(--shadow-float)] ${TONE_CLASS[toastItem.tone] ?? TONE_CLASS.info}`}
        >
          {toastItem.message}
        </button>
      ))}
    </div>
  );
}
