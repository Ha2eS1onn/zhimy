"use client";

import { useState } from "react";
import { EVENTS, track } from "@/lib/analytics";
import { useSessionStore } from "@/store/sessionStore";
import { MintyIllustration } from "@/components/common/MintyIllustration";

export function AuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useSessionStore((state) => state.signIn);
  const continueAsGuest = useSessionStore((state) => state.continueAsGuest);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      track(EVENTS.authLogin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查邮箱和密码");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-shell px-4 py-8">
      <div className="card w-full max-w-md p-6 md:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark size-10 text-lg">知</span>
            <div>
              <p className="eyebrow">个人知识地图</p>
              <h1 className="mt-1 text-xl font-[750] tracking-[-0.03em] text-ink">登录知脉</h1>
            </div>
          </div>
          <MintyIllustration variant="account" className="h-16 w-24 shrink-0" />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">用绑定的邮箱登录，三端数据保持一致。</p>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="label">邮箱</span>
            <input
              className="input mt-1"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label className="block">
            <span className="label">密码</span>
            <input
              className="input mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              required
            />
          </label>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2 text-[11px] text-muted">
          <span className="h-px flex-1 bg-line" />
          或者
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => void continueAsGuest()}
          disabled={busy}
        >
          以游客身份继续（数据同样保存在云端）
        </button>
      </div>
    </main>
  );
}
