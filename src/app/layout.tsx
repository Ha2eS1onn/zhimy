import type { Metadata, Viewport } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AppProviders } from "@/components/shell/AppProviders";
import { ThemeController } from "@/components/shell/Theme";

const THEME_BOOT_SCRIPT = `
(function () {
  var preference = "system";
  try {
    var saved = JSON.parse(localStorage.getItem("zhimy:settings:v1") || "null");
    var value = saved && saved.state && saved.state.theme;
    if (value === "light" || value === "dark" || value === "system") preference = value;
    if (saved && saved.state && saved.state.reducedMotion === true) {
      document.documentElement.dataset.reducedMotion = "true";
    }
  } catch (_) {}
  var dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var resolved = dark ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#14232b" : "#e9f2ee");
})();
`;

export const metadata: Metadata = {
  title: "知脉 · AI 知识地图",
  description: "把 AI 答疑变成可寻址、可联想、可收纳的个人知识图谱",
  applicationName: "知脉",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#e9f2ee" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">跳到主要内容</a>
        <ThemeController />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
