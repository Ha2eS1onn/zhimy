/**
 * 是否运行在「知脉」Android 壳（Capacitor）里。
 * capacitor.config.ts 的 android.appendUserAgent 会追加 `ZhimyApp/0.1.0`。
 */
export function isNativeShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("ZhimyApp/");
}
