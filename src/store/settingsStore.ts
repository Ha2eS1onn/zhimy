"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Density } from "@/types";
import type { LlmSettings } from "@/lib/ai/types";

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  mode: "mock",
  transport: "proxy",
  baseUrl: "",
  apiKey: "",
  model: "",
  visionModel: "",
};

interface SettingsState {
  llm: LlmSettings;
  density: Density;
  autoRotate: boolean;
  setLlm: (patch: Partial<LlmSettings>) => void;
  clearApiKey: () => void;
  setDensity: (density: Density) => void;
  setAutoRotate: (autoRotate: boolean) => void;
}

/** 本机设置（含 BYOK 的 Key）：只写浏览器 localStorage，不上传、不入库。 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llm: DEFAULT_LLM_SETTINGS,
      density: "standard",
      autoRotate: true,
      setLlm: (patch) => set((state) => ({ llm: { ...state.llm, ...patch } })),
      clearApiKey: () =>
        set((state) => ({ llm: { ...state.llm, apiKey: "", mode: "mock" as const } })),
      setDensity: (density) => set({ density }),
      setAutoRotate: (autoRotate) => set({ autoRotate }),
    }),
    {
      name: "zhimy:settings:v1",
      skipHydration: true,
      partialize: (state) => ({
        llm: state.llm,
        density: state.density,
        autoRotate: state.autoRotate,
      }),
    },
  ),
);
