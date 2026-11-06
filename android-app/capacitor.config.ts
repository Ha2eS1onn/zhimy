import type { CapacitorConfig } from "@capacitor/cli";

/**
 * APK 只是原生壳：WebView 直接加载线上站点，内容更新不需要重新发版。
 * 想改加载地址时改 server.url 后重新构建（或临时用 ANDROID_APP_URL 覆盖）。
 */
const config: CapacitorConfig = {
  appId: "fun.kasho.zhimy",
  appName: "知脉",
  webDir: "www",
  server: {
    url: process.env.ANDROID_APP_URL ?? "https://zhimy.kasho.fun",
    cleartext: false,
  },
  android: {
    backgroundColor: "#e9f2ee",
    // Web 端可用 UA 里的标记判断"运行在 APK 里"。
    appendUserAgent: "ZhimyApp/0.1.0",
  },
};

export default config;
