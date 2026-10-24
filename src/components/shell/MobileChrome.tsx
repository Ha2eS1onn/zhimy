"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/uiStore";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./Theme";

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/chat", label: "对话", icon: "chat" },
  { href: "/atlas", label: "知识库", icon: "atlas" },
];

export function MobileTopBar() {
  const openSettings = useUIStore((state) => state.openSettings);
  return (
    <header className="mobile-topbar">
      <Link href="/" className="flex items-center gap-2.5" aria-label="知脉首页">
        <span className="brand-mark size-8 rounded-lg text-xs">
          知
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-wide">知脉</span>
          <span className="block text-[9px] tracking-wider text-muted">AI 知识地图</span>
        </span>
      </Link>
      <div className="flex items-center gap-1.5">
        <ThemeToggle className="icon-btn size-10 rounded-xl" />
        <button
          type="button"
          aria-label="设置"
          onClick={() => openSettings("account")}
          className="icon-btn size-10 rounded-xl"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href) || (href === "/atlas" && pathname.startsWith("/node"));
  return (
    <nav className="mobile-tabbar" aria-label="主导航">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="mobile-tab flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
          data-active={isActive(tab.href)}
          aria-current={isActive(tab.href) ? "page" : undefined}
        >
          <span
            className={`grid size-8 place-items-center rounded-xl ${
              isActive(tab.href) ? "bg-surface-2 text-accent" : "text-muted"
            }`}
          >
            <Icon name={tab.icon} size={18} />
          </span>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
