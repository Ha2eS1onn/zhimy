"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { AppShell } from "./AppShell";
import { AuthGate } from "./AuthGate";
import { BootScreen } from "./BootScreen";
import { ConfigGuide } from "./ConfigGuide";
import { ErrorScreen } from "./ErrorScreen";

export function AppProviders({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const error = useSessionStore((state) => state.error);
  const errorHint = useSessionStore((state) => state.errorHint);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    void useSettingsStore.persist.rehydrate();
    void useSessionStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (status !== "ready" || !user) return;
    // 切换账号（例如从游客登录到已有账号）时，先清空上一个账号的本地缓存再拉取。
    if (previousUserIdRef.current && previousUserIdRef.current !== user.id) {
      useGraphStore.getState().resetLocal();
      useChatStore.getState().resetLocal();
    }
    previousUserIdRef.current = user.id;
    void useGraphStore.getState().ensureLoaded();
    void useChatStore.getState().ensureLoaded();
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        void useGraphStore.getState().refresh();
      }
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [status, user]);

  if (status === "boot") return <BootScreen />;
  if (status === "needs-config") return <ConfigGuide />;
  if (status === "error") {
    return (
      <ErrorScreen
        title="连接云端失败"
        message={error ?? "未知错误"}
        hint={errorHint ?? undefined}
        onRetry={() => {
          useSessionStore.getState().clearError();
          void useSessionStore.getState().bootstrap();
        }}
      />
    );
  }
  if (status === "signed-out") return <AuthGate />;

  return <AppShell>{children}</AppShell>;
}
