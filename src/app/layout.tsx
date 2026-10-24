import type { Metadata, Viewport } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AppProviders } from "@/components/shell/AppProviders";

export const metadata: Metadata = {
  title: "知脉 · AI 知识地图",
  description: "把 AI 答疑变成可寻址、可联想、可收纳的个人知识图谱",
  applicationName: "知脉",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
