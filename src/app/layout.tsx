import type { Metadata, Viewport } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AppProviders } from "@/components/shell/AppProviders";
import { PwaBridge } from "@/components/shell/PwaBridge";
import { ThemeController } from "@/components/shell/Theme";
import { siteUrl } from "@/lib/site";

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
  metadataBase: new URL(siteUrl()),
  title: "知脉 · AI 知识地图",
  description: "把 AI 答疑变成可寻址、可联想、可收纳的个人知识图谱",
  applicationName: "知脉",
  // iOS 添加到主屏幕后以独立窗口运行（图标见 src/app/apple-icon.png）。
  appleWebApp: {
    capable: true,
    title: "知脉",
    statusBarStyle: "default",
  },
  // 图谱里的数字别被 iOS 识别成电话号码。
  formatDetection: { telephone: false },
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
        {/* Next 只输出新版 mobile-web-app-capable，老 iOS 仍认 apple- 前缀。 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">跳到主要内容</a>
        <ThemeController />
        <PwaBridge />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
