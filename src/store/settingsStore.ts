"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Density } from "@/types";
import type { LlmSettings } from "@/lib/ai/types";

export type ThemePreference = "light" | "dark" | "system";

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  mode: "mock",
  transport: "proxy",
  baseUrl: "",
  apiKey: "",
  model: "",
  visionModel: "",
  embeddingModel: "",
  embeddingBaseUrl: "",
  embeddingApiKey: "",
};

interface SettingsState {
  llm: LlmSettings;
  density: Density;
  autoRotate: boolean;
  theme: ThemePreference;
  reducedMotion: boolean;
  setLlm: (patch: Partial<LlmSettings>) => void;
  clearApiKey: () => void;
  setDensity: (density: Density) => void;
  setAutoRotate: (autoRotate: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
}

/** 本机设置（含 BYOK 的 Key）：只写浏览器 localStorage，不上传、不入库。 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llm: DEFAULT_LLM_SETTINGS,
      density: "standard",
      autoRotate: true,
      theme: "system",
      reducedMotion: false,
      setLlm: (patch) => set((state) => ({ llm: { ...state.llm, ...patch } })),
      clearApiKey: () =>
        set((state) => ({
          llm: { ...state.llm, apiKey: "", embeddingApiKey: "", mode: "mock" as const },
        })),
      setDensity: (density) => set({ density }),
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setTheme: (theme) => set({ theme }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    {
      name: "zhimy:settings:v1",
      version: 4,
      // 兼容旧配置：补齐向量字段、主题与减少动画偏好，避免旧 localStorage 读到 undefined。
      migrate: (persisted) => {
        const state = persisted as
          | {
              llm?: Partial<LlmSettings>;
              theme?: ThemePreference;
              reducedMotion?: boolean;
            }
          | undefined;
        return {
          ...(state ?? {}),
          llm: { ...DEFAULT_LLM_SETTINGS, ...(state?.llm ?? {}) },
          theme: state?.theme ?? "system",
          reducedMotion: state?.reducedMotion ?? false,
        };
      },
      skipHydration: true,
      partialize: (state) => ({
        llm: state.llm,
        density: state.density,
        autoRotate: state.autoRotate,
        theme: state.theme,
        reducedMotion: state.reducedMotion,
      }),
    },
  ),
);
