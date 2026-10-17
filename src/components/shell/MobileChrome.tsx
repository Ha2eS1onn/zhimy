"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/uiStore";
import { Icon, type IconName } from "./Icon";

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/chat", label: "对话", icon: "chat" },
  { href: "/atlas", label: "知识库", icon: "atlas" },
];

export function MobileTopBar() {
  const openSettings = useUIStore((state) => state.openSettings);
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4 md:hidden">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent via-[#b388ff] to-pink text-[12px] font-bold text-black">
          知
        </span>
        <span className="text-sm font-semibold tracking-wide">知脉</span>
      </div>
      <button
        type="button"
        aria-label="设置"
        onClick={() => openSettings("account")}
        className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
      >
        <Icon name="settings" size={18} />
      </button>
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className="flex h-14 shrink-0 items-stretch border-t border-line bg-shell md:hidden">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
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
