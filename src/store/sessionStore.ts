"use client";

import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { AppUser } from "@/types";
import { getSupabaseConfig, isDemoMode } from "@/lib/env";
import { getRepo } from "@/lib/repo";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export type SessionStatus = "boot" | "needs-config" | "error" | "ready" | "signed-out";

const SIGNED_OUT_KEY = "zhimy:signed-out";
const DEMO_USER: AppUser = {
  id: "demo-user",
  email: null,
  isAnonymous: true,
  createdAt: null,
};

function mapUser(user: User | null): AppUser | null {
  if (!user) return null;
  const anonymous = (user as User & { is_anonymous?: boolean }).is_anonymous;
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: Boolean(anonymous),
    createdAt: user.created_at ?? null,
  };
}

function readSignedOutFlag(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSignedOutFlag(value: boolean): void {
  try {
    if (value) localStorage.setItem(SIGNED_OUT_KEY, "1");
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略。
  }
}

interface SessionState {
  status: SessionStatus;
  user: AppUser | null;
  error: string | null;
  errorHint: string | null;
  bootstrap: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  bindAccount: (email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

let authListenerRegistered = false;

function ensureAuthListener(): void {
  if (authListenerRegistered) return;
  const supabase = getBrowserSupabase();
  if (!supabase) return;
  authListenerRegistered = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      useSessionStore.setState({ status: "signed-out", user: null });
      return;
    }
    const user = mapUser(session?.user ?? null);
    if (user) {
      useSessionStore.setState({ status: "ready", user, error: null, errorHint: null });
    }
  });
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: "boot",
  user: null,
  error: null,
  errorHint: null,

  bootstrap: async () => {
    if (isDemoMode()) {
      set({ status: "ready", user: DEMO_USER, error: null, errorHint: null });
      await getRepo().ensureProfile(DEMO_USER.id);
      return;
    }
    if (!getSupabaseConfig()) {
      set({ status: "needs-config", user: null });
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) {
      set({ status: "needs-config", user: null });
      return;
    }
    ensureAuthListener();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session?.user) {
        const user = mapUser(data.session.user);
        set({ status: "ready", user, error: null, errorHint: null });
        if (user) await getRepo().ensureProfile(user.id);
        return;
      }
      if (readSignedOutFlag()) {
        set({ status: "signed-out", user: null });
        return;
      }
      // 匿名游客：打开即用，数据从第一次提问起就在云端。
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      const user = mapUser(anonData.user);
      if (!user) throw new Error("匿名账号创建失败");
      set({ status: "ready", user, error: null, errorHint: null });
      await getRepo().ensureProfile(user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const anonymousDisabled =
        /anonymous/i.test(message) ||
        /disabled/i.test(message) ||
        /not enabled/i.test(message) ||
        /signups? not allowed/i.test(message);
      set({
        status: "error",
        user: null,
        error: anonymousDisabled ? "无法创建游客账号：" + message : "连接云端失败：" + message,
        errorHint: anonymousDisabled
          ? "请在 Supabase 控制台 → Authentication → Sign In / Providers 中开启 Anonymous Sign-ins，然后重试。"
          : "检查 .env.local 中的 NEXT_PUBLIC_SUPABASE_URL 与 ANON_KEY，以及网络是否可访问 supabase.co。",
      });
    }
  },

  continueAsGuest: async () => {
    writeSignedOutFlag(false);
    set({ status: "boot", error: null, errorHint: null });
    await get().bootstrap();
  },

  signIn: async (email, password) => {
    const supabase = getBrowserSupabase();
    if (!supabase) throw new Error("Supabase 未配置，无法登录");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    writeSignedOutFlag(false);
    await get().refreshUser();
  },

  signOut: async () => {
    const supabase = getBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    writeSignedOutFlag(true);
    set({ status: "signed-out", user: null });
  },

  bindAccount: async (email, password) => {
    if (isDemoMode()) {
      throw new Error("演示模式不支持绑定账号，请先配置 Supabase");
    }
    const supabase = getBrowserSupabase();
    if (!supabase) throw new Error("Supabase 未配置，无法绑定账号");
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    set((state) => (state.user ? { user: { ...state.user, email } } : state));
    return { needsConfirm: true };
  },

  refreshUser: async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      set({ status: "signed-out", user: null });
      return;
    }
    const user = mapUser(data.user);
    set(user ? { status: "ready", user } : { status: "signed-out", user: null });
    if (user) await getRepo().ensureProfile(user.id);
  },

  clearError: () => set({ status: "boot", error: null, errorHint: null }),
}));
