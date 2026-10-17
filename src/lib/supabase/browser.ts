"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/** 浏览器端 Supabase 客户端（cookie 会话，服务端可读）。未配置时返回 null。 */
export function getBrowserSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.anonKey);
  }
  return browserClient;
}
