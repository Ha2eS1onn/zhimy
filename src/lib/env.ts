/** 运行环境与可配置常量。 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * 用户经常直接粘贴 Supabase 页面上的带路径地址（如 https://xxx.supabase.co/rest/v1/），
 * 这里统一归一化成 origin，避免 supabase-js 拼出 /rest/v1/rest/v1/ 这类错误地址。
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (
    !rawUrl ||
    !anonKey ||
    rawUrl.includes("your-project-ref") ||
    anonKey.includes("your-anon-key")
  ) {
    return null;
  }
  const url = normalizeSupabaseUrl(rawUrl);
  if (!/^https?:\/\//.test(url)) return null;
  return { url, anonKey };
}

/** 演示模式：未连接 Supabase 时用内存示例数据查看界面，绝不在生产开启。 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export const APP_NAME = "知脉";
export const APP_TAGLINE = "把 AI 答疑变成可寻址、可联想、可收纳的个人知识图谱";
