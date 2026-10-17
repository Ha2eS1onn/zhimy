"use client";

import { create } from "zustand";

export type SettingsTab = "account" | "llm" | "data";

interface UIState {
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  settingsOpen: false,
  settingsTab: "llm",
  openSettings: (tab = "llm") => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
}));
