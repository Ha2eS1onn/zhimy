import { getSupabaseConfig, isDemoMode } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { MemoryRepo } from "./memoryRepo";
import { createSupabaseRepo } from "./supabaseRepo";
import type { DataRepo } from "./types";

let repo: DataRepo | null = null;

/**
 * 选择数据仓库：
 * - 正常情况：Supabase（云端 Postgres + RLS）；
 * - 演示模式或尚未配置 Supabase：内存示例仓库（无持久化，仅供查看 UI）。
 */
export function getRepo(): DataRepo {
  if (repo) return repo;
  if (isDemoMode() || !getSupabaseConfig()) {
    repo = new MemoryRepo();
  } else {
    repo = createSupabaseRepo(() => getBrowserSupabase());
  }
  return repo;
}

export function isMemoryRepo(): boolean {
  return getRepo().kind === "memory";
}

export { MemoryRepo } from "./memoryRepo";
export type { DataRepo } from "./types";
