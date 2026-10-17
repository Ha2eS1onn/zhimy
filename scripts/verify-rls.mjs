#!/usr/bin/env node
/**
 * RLS 隔离校验：用两个匿名账号验证互相看不到对方的数据。
 * 用法：配置好 .env.local 并开启 Anonymous Sign-ins 后执行 npm run verify:rls
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(file) {
  const result = {};
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

const envPath = path.resolve(process.cwd(), ".env.local");
const fileEnv = existsSync(envPath) ? loadEnvFile(envPath) : {};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("✗ 缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const createAnonClient = () =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const clientA = createAnonClient();
const clientB = createAnonClient();

let createdNodeId = null;
let exitCode = 0;

try {
  const a = await clientA.auth.signInAnonymously();
  if (a.error) throw new Error(`A 账号匿名登录失败：${a.error.message}（确认已开启 Anonymous Sign-ins）`);
  const b = await clientB.auth.signInAnonymously();
  if (b.error) throw new Error(`B 账号匿名登录失败：${b.error.message}`);

  const userA = a.data.user;
  const userB = b.data.user;
  if (!userA || !userB || userA.id === userB.id) {
    throw new Error("未能创建两个独立的匿名账号");
  }
  console.log(`✓ 已创建两个匿名账号：A=${userA.id.slice(0, 8)}… B=${userB.id.slice(0, 8)}…`);

  createdNodeId = crypto.randomUUID();
  const now = new Date().toISOString();
  const insert = await clientA.from("nodes").insert({
    id: createdNodeId,
    user_id: userA.id,
    parent_id: null,
    title: `RLS 校验节点 ${new Date().toISOString()}`,
    summary: "仅用于权限隔离校验，脚本结束时删除",
    status: "active",
    aliases: [],
    created_at: now,
    updated_at: now,
  });
  if (insert.error) throw new Error(`A 写入节点失败：${insert.error.message}`);
  console.log("✓ A 已写入一个测试节点");

  const readByB = await clientB.from("nodes").select("id").eq("id", createdNodeId);
  if (readByB.error) throw new Error(`B 查询失败：${readByB.error.message}`);
  if ((readByB.data ?? []).length !== 0) {
    throw new Error("B 能读到 A 的节点：RLS 策略没有生效！");
  }
  console.log("✓ B 查不到 A 的数据（RLS 生效）");

  const readByA = await clientA.from("nodes").select("id").eq("id", createdNodeId);
  if (readByA.error) throw new Error(`A 自读失败：${readByA.error.message}`);
  if ((readByA.data ?? []).length !== 1) {
    throw new Error("A 读取不到自己刚写入的节点");
  }
  console.log("✓ A 能读到自己的数据");

  const anonRead = await createAnonClient().from("nodes").select("id").limit(1);
  if (anonRead.error) {
    console.log(`· 未登录查询返回错误（可接受）：${anonRead.error.message}`);
  } else if ((anonRead.data ?? []).length !== 0) {
    throw new Error("未登录会话读到了数据：RLS 策略没有生效！");
  } else {
    console.log("✓ 未登录会话读不到任何数据");
  }

  console.log("\nRLS 校验通过 ✅");
} catch (error) {
  console.error(`\nRLS 校验失败 ✗：${error.message}`);
  exitCode = 1;
} finally {
  if (createdNodeId && clientA) {
    const cleanup = await clientA.from("nodes").delete().eq("id", createdNodeId);
    if (cleanup.error) {
      console.warn(`· 清理测试节点失败（可手动删除）：${cleanup.error.message}`);
    } else {
      console.log("· 已清理测试节点");
    }
  }
  await clientA.auth.signOut().catch(() => {});
  await clientB.auth.signOut().catch(() => {});
  process.exit(exitCode);
}
