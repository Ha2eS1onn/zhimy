"use client";

export function ErrorScreen({
  title,
  message,
  hint,
  onRetry,
}: {
  title: string;
  message: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell px-4">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-lg font-semibold text-danger">{title}</h1>
        <p className="mt-2 break-words text-sm text-ink">{message}</p>
        {hint ? <p className="mt-3 text-xs leading-relaxed text-muted">{hint}</p> : null}
        <div className="mt-5 flex gap-2">
          {onRetry ? (
            <button type="button" className="btn-primary" onClick={onRetry}>
              重试
            </button>
          ) : null}
          <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      </div>
    </div>
  );
}
