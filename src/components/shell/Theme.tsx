"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { Icon } from "./Icon";

const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(callback: () => void) {
  const media = window.matchMedia(SYSTEM_THEME_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSystemThemeSnapshot() {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches;
}

/** 当前实际生效的主题；“跟随系统”也会在系统切换时立即更新。 */
export function useResolvedTheme(): "light" | "dark" {
  const preference = useSettingsStore((state) => state.theme);
  const systemDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    () => false,
  );
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function applyTheme(preference: "light" | "dark" | "system") {
  const resolved =
    preference === "system"
      ? window.matchMedia(SYSTEM_THEME_QUERY).matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#0a1424" : "#f3f7fc");
}

/** 将持久化偏好同步到 DOM；系统主题变化只在“跟随系统”时生效。 */
export function ThemeController() {
  const theme = useSettingsStore((state) => state.theme);
  const [hydrated, setHydrated] = useState(false);

  // 首帧由内联脚本按 localStorage 上色；等偏好真正水合后再接管，避免闪回系统主题。
  useEffect(() => {
    const sync = () => setHydrated(useSettingsStore.persist.hasHydrated());
    sync();
    return useSettingsStore.persist.onFinishHydration(sync);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const update = () => applyTheme(theme);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [hydrated, theme]);

  return null;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const setTheme = useSettingsStore((state) => state.setTheme);
  const resolved = useResolvedTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "light" ? "切换到浅色模式" : "切换到深色模式";

  return (
    <button
      type="button"
      className={className || "btn-ghost btn-sm size-9 px-0"}
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <span key={resolved} className="icon-swap inline-grid place-items-center">
        <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
      </span>
      <span className="hidden xl:inline">{resolved === "dark" ? "浅色模式" : "深色模式"}</span>
    </button>
  );
}
