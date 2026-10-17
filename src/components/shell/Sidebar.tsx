"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import { Icon, type IconName } from "./Icon";

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "综合", icon: "home" },
  { href: "/chat", label: "对话", icon: "chat" },
  { href: "/atlas", label: "知识库", icon: "atlas" },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useSessionStore((state) => state.user);
  const openSettings = useUIStore((state) => state.openSettings);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="app-sidebar">
      <div className="px-3 py-5 xl:px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="知脉首页">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent via-[#b388ff] to-pink text-[15px] font-bold text-black">
            知
          </span>
          <span className="hidden xl:block">
            <span className="block text-[15px] font-semibold tracking-wide text-ink">知脉</span>
            <span className="block text-[10px] text-muted">AI 知识地图</span>
          </span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-2 xl:px-3">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            data-active={isActive(item.href)}
            className="nav-item justify-center xl:justify-start"
          >
            <Icon name={item.icon} size={18} />
            <span className="hidden xl:inline">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 px-2 pb-4 xl:px-3">
        <button
          type="button"
          title="账号"
          onClick={() => openSettings("account")}
          className="nav-item justify-center xl:justify-start"
        >
          <Icon name="user" size={18} />
          <span className="hidden truncate xl:inline">
            {user?.isAnonymous ? "游客账号" : (user?.email ?? "账号")}
          </span>
        </button>
        <button
          type="button"
          title="设置"
          onClick={() => openSettings("llm")}
          className="nav-item justify-center xl:justify-start"
        >
          <Icon name="settings" size={18} />
          <span className="hidden xl:inline">设置</span>
        </button>
      </div>
    </aside>
  );
}
