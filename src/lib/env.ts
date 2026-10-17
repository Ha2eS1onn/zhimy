/** 运行环境与可配置常量。 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || url.includes("your-project-ref") || anonKey.includes("your-anon-key")) {
    return null;
  }
  return { url, anonKey };
}

/** 演示模式：未连接 Supabase 时用内存示例数据查看界面，绝不在生产开启。 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export const APP_NAME = "知脉";
export const APP_TAGLINE = "把 AI 答疑变成可寻址、可联想、可收纳的个人知识图谱";
