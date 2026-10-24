import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * 开发期允许的跨域来源：本机回环 + 当前网卡 IPv4。
 * 手机/平板用局域网 IP（如 http://192.168.1.103:3100）打开时，
 * 不加进 allowedDevOrigins 会被 Next 拦截 /_next/hmr，页面无法热更新。
 */
function devOrigins(): string[] {
  const origins = new Set(["localhost", "127.0.0.1", "[::1]"]);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) origins.add(address.address);
    }
  }
  const extra = process.env.DEV_ALLOWED_ORIGINS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const origin of extra ?? []) origins.add(origin);
  return Array.from(origins);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
