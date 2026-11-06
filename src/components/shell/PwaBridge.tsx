"use client";

import { useEffect, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallState {
  /** 浏览器已触发 beforeinstallprompt，可以弹原生安装框。 */
  canInstall: boolean;
  /** 已安装或正以独立窗口运行。 */
  installed: boolean;
  /** iOS 不支持 beforeinstallprompt，只能手动「添加到主屏幕」。 */
  manualHint: boolean;
}

const INITIAL: PwaInstallState = { canInstall: false, installed: false, manualHint: false };

let state: PwaInstallState = INITIAL;
let promptEvent: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function setState(patch: Partial<PwaInstallState>) {
  state = { ...state, ...patch };
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return INITIAL;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari 的私有标记
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

/** 安装状态（canInstall / installed / manualHint），由 <PwaBridge /> 维护。 */
export function usePwaInstall() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 触发浏览器原生安装框；返回是否真的弹出了。 */
export async function promptInstall(): Promise<boolean> {
  if (!promptEvent) return false;
  const event = promptEvent;
  promptEvent = null;
  setState({ canInstall: false });
  await event.prompt();
  const choice = await event.userChoice.catch(() => null);
  if (choice?.outcome === "accepted") setState({ installed: true });
  return true;
}

/**
 * 全局只挂载一次：注册 Service Worker，并把安装能力桥接给设置页。
 * 生产环境才注册 SW；开发环境反过来注销旧 SW，避免本地调试被缓存干扰。
 */
export function PwaBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (process.env.NODE_ENV !== "production") {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistrations().then((list) => {
          for (const item of list) void item.unregister();
        });
      }
      return;
    }

    if ("serviceWorker" in navigator) {
      const register = () => {
        void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
          // 注册失败不影响主流程（HTTPS 才可用，localhost 例外）。
        });
      };
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      promptEvent = event as BeforeInstallPromptEvent;
      setState({ canInstall: true });
    };
    const onInstalled = () => {
      promptEvent = null;
      setState({ canInstall: false, installed: true });
    };

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      const installed = isStandalone();
      setState({ installed, manualHint: !installed && isIos() });
    };
    sync();

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", sync);
    };
  }, []);

  return null;
}
