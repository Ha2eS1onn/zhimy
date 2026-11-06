/** 站点绝对地址：PWA manifest、metadataBase 等需要完整 URL 的地方统一用它。 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // Vercel 上优先用生产域名，其次部署域名（预览环境）。
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3100";
}
