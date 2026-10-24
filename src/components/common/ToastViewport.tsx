"use client";

import { useToastStore } from "@/store/toastStore";

const TONE_CLASS: Record<string, string> = {
  info: "border-line bg-surface-2 text-ink",
  success: "border-ok/30 bg-ok/10 text-ok",
  error: "border-danger/40 bg-danger/10 text-danger",
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
          className={`toast-item pointer-events-auto max-w-[92vw] rounded-xl border px-3.5 py-2 text-left text-xs shadow-lg backdrop-blur ${TONE_CLASS[toastItem.tone] ?? TONE_CLASS.info}`}
        >
          {toastItem.message}
        </button>
      ))}
    </div>
  );
}
