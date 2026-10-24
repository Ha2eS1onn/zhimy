"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SettingsSheet } from "./SettingsSheet";
import { MobileTabBar, MobileTopBar } from "./MobileChrome";
import { Sidebar } from "./Sidebar";
import { ToastViewport } from "@/components/common/ToastViewport";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <MobileTopBar />
        <main className="app-content" id="main">
          <div key={pathname} className="page-frame">
            {children}
          </div>
        </main>
        <MobileTabBar />
      </div>
      <SettingsSheet />
      <ToastViewport />
    </div>
  );
}
