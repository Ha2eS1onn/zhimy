"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { EVENTS, track } from "@/lib/analytics";
import { clearThumbnails } from "@/lib/media/localThumbnailStore";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { AppShell } from "./AppShell";
import { AuthGate } from "./AuthGate";
import { BootScreen } from "./BootScreen";
import { ConfigGuide } from "./ConfigGuide";
import { ErrorScreen } from "./ErrorScreen";

/** Demo 模式自动载入示例图谱的去重标记：同一浏览器会话只自动执行一次。 */
const DEMO_SEED_STORAGE_KEY = "zhimy:demo-seeded";

export function AppProviders({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const error = useSessionStore((state) => state.error);
  const errorHint = useSessionStore((state) => state.errorHint);
  const graphLoading = useGraphStore((state) => state.loading);
  const graphEmpty = useGraphStore((state) => state.nodes.length === 0);
  const previousUserIdRef = useRef<string | null>(null);
  const demoSeedRef = useRef(false);

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
      // 本地缩略图跟着账号走，避免下一个账号在同浏览器里看到上一账号的图片。
      void clearThumbnails();
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

  // 线上 Demo 体验：新访客带 ?demo=1 打开时自动载入示例图谱，避免看到空图谱。
  // 只在该账号图谱确实为空、且加载结束后执行；每个浏览器会话最多一次。
  useEffect(() => {
    if (status !== "ready" || !user || graphLoading || !graphEmpty) return;
    if (typeof window === "undefined") return;
    if (demoSeedRef.current) return;
    try {
      if (window.sessionStorage.getItem(DEMO_SEED_STORAGE_KEY) === "1") return;
    } catch {
      // 隐私模式/禁用存储时读不到：继续执行，由 ref 保证本页只跑一次。
    }
    // 必须读实时状态：ensureLoaded 刚触发时，本回合渲染捕获的 loading/nodes 仍是旧值，
    // 只看旧值会在「已有图谱的账号」上误判为空并清空数据。
    const live = useGraphStore.getState();
    if (live.loading || live.nodes.length > 0) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("demo") !== "1") return;

    demoSeedRef.current = true;
    try {
      window.sessionStorage.setItem(DEMO_SEED_STORAGE_KEY, "1");
    } catch {
      // 存储不可用不影响主流程。
    }
    // 先移除 demo 参数（保留其它 query 与 hash），避免刷新后重复触发。
    url.searchParams.delete("demo");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    void (async () => {
      try {
        await useGraphStore.getState().seedExample();
        toast("已载入示例图谱（Demo 模式）", "success");
        track(EVENTS.graphSeeded, { source: "demo" });
      } catch (error) {
        // 失败时不标记为已执行，用户重新加 ?demo=1 刷新还能再试一次。
        try {
          window.sessionStorage.removeItem(DEMO_SEED_STORAGE_KEY);
        } catch {
          // ignore
        }
        toast(error instanceof Error ? error.message : "载入示例图谱失败，请稍后重试", "error");
      }
    })();
  }, [status, user, graphLoading, graphEmpty]);

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
