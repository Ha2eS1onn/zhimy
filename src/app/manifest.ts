import type { MetadataRoute } from "next";

/**
 * PWA manifest（Next 自动生成 /manifest.webmanifest 并注入 <link rel="manifest">）。
 * 配色与 minty-paper 一致；主题色取浅色墙色，深色模式下由 layout 的启动脚本改 meta。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "知脉 · AI 知识地图",
    short_name: "知脉",
    description: "把 AI 答疑变成可寻址、可联想、可收纳的个人知识图谱",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#e9f2ee",
    theme_color: "#e9f2ee",
    lang: "zh-CN",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "接着复习", short_name: "复习", url: "/review" },
      { name: "继续对话", short_name: "对话", url: "/chat" },
      { name: "知识地图", short_name: "地图", url: "/atlas" },
    ],
  };
}
