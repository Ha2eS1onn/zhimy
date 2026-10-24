#!/usr/bin/env node
/**
 * RLS 隔离校验：验证互相看不到对方的数据，以及 P1-A/P1-B 新增的向量与事件。
 *
 * 两种运行方式：
 *   1. 默认（HTTPS）：用两个匿名账号走 Supabase Auth + PostgREST。
 *      需要本机可访问 *.supabase.co（国内网络先用 npm run dev:proxy 或设置代理）。
 *   2. 直连（--direct）：用 SUPABASE_DB_URL 直连 Postgres，借助 set local role + JWT claims 模拟用户。
 *      适合 HTTPS 被重置但 5432 可用的环境；会复用两个已存在的 auth 用户，只写入临时行并在结束时删除。
 *
 * 用法：
 *   npm run verify:rls
 *   node scripts/verify-rls.mjs --direct
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

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
const readEnv = (key) => process.env[key] || fileEnv[key];
const rawUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

// 兼容用户直接粘贴的带路径地址（https://xxx.supabase.co/rest/v1/）
const projectUrl = (() => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return rawUrl.replace(/\/+$/, "");
  }
})();

function projectRef() {
  const explicit = readEnv("SUPABASE_PROJECT_REF");
  if (explicit) return explicit;
  if (!projectUrl) return null;
  try {
    return new URL(projectUrl).host.split(".")[0];
  } catch {
    return null;
  }
}

/** 解析数据库连接串：支持完整 URI，或只填密码（按项目 ref 拼串）。 */
function resolveDbUrl() {
  const raw = readEnv("SUPABASE_DB_URL");
  if (!raw) return null;
  if (/^postgres(ql)?:\/\//i.test(raw)) return raw;
  const ref = projectRef();
  if (!ref) return null;
  return `postgresql://postgres:${encodeURIComponent(raw)}@db.${ref}.supabase.co:5432/postgres`;
}

// ---------------------------------------------------------------------------
// 方式一：HTTPS（两个真实匿名账号 + PostgREST / Auth）
// ---------------------------------------------------------------------------
async function runViaHttp() {
  if (!projectUrl || !anonKey) {
    console.error("✗ 缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const createAnonClient = () =>
    createClient(projectUrl, anonKey, {
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
      title: `RLS 校验节点 ${now}`,
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
}

// ---------------------------------------------------------------------------
// 方式二：直连 Postgres（模拟两个已存在的用户）
// ---------------------------------------------------------------------------
const EMBEDDING_MODEL = "verify-rls:1024";
const SYNTHETIC_VECTOR = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0));

async function runViaDirect() {
  const dbUrl = resolveDbUrl();
  if (!dbUrl) {
    console.error("✗ --direct 模式需要 SUPABASE_DB_URL（完整 URI 或数据库密码）");
    process.exit(1);
  }

  const sql = postgres(dbUrl, {
    max: 1,
    ssl: /sslmode=disable/.test(dbUrl) ? false : "require",
    onnotice: () => {},
    connect_timeout: 25,
  });

  const vectorText = JSON.stringify(SYNTHETIC_VECTOR);
  const nodeId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const conversationMessageId = crypto.randomUUID();
  const crossMessageId = crypto.randomUUID();
  const stamp = new Date().toISOString();
  let exitCode = 0;

  /** 以某个用户身份执行：切换 role + JWT claims，事务结束自动复位。 */
  const asUser = (userId, fn) =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      return fn(tx);
    });

  try {
    const users = await sql`
      select id from auth.users order by created_at asc limit 2
    `;
    if (users.length < 2) {
      throw new Error("直连模式需要至少两个已存在的 auth 用户（可先用浏览器各建一个游客账号）");
    }
    const userA = users[0].id;
    const userB = users[1].id;
    console.log(`✓ 复用两个已有账号：A=${String(userA).slice(0, 8)}… B=${String(userB).slice(0, 8)}…`);

    // 1) 基础 RLS：A 写节点，B 读不到
    await asUser(userA, async (tx) => {
      await tx`
        insert into public.nodes (id, user_id, parent_id, title, summary, status, aliases, created_at, updated_at)
        values (${nodeId}, ${userA}, null, ${`RLS 直连校验 ${stamp}`}, '脚本结束后删除', 'active', '{}', ${stamp}, ${stamp})
      `;
    });
    const readByA = await asUser(userA, (tx) =>
      tx`select id from public.nodes where id = ${nodeId}`,
    );
    const readByB = await asUser(userB, (tx) =>
      tx`select id from public.nodes where id = ${nodeId}`,
    );
    if (readByA.length !== 1) throw new Error("A 读取不到自己刚写入的节点");
    if (readByB.length !== 0) throw new Error("B 能读到 A 的节点：RLS 策略没有生效！");
    console.log("✓ 节点读写隔离生效");

    // 2) 向量写入 + 检索隔离（P1-A）
    await asUser(userA, async (tx) => {
      await tx`select public.set_node_embedding(${nodeId}::uuid, ${vectorText}::vector, ${EMBEDDING_MODEL})`;
    });
    const hitA = await asUser(userA, (tx) =>
      tx`select node_id, similarity from public.match_nodes(${vectorText}::vector, 5, 0, ${EMBEDDING_MODEL})`,
    );
    const hitB = await asUser(userB, (tx) =>
      tx`select node_id, similarity from public.match_nodes(${vectorText}::vector, 5, 0, ${EMBEDDING_MODEL})`,
    );
    if (!hitA.some((row) => row.node_id === nodeId)) {
      throw new Error("A 的向量检索没有命中自己的节点");
    }
    if (hitA.find((row) => row.node_id === nodeId).similarity < 0.99) {
      throw new Error("相似度计算异常：命中自身节点应接近 1");
    }
    if (hitB.length !== 0) throw new Error("B 能通过向量检索读到 A 的节点：RPC/RLS 未隔离！");
    console.log("✓ 向量检索只对本人生效（match_nodes + RLS）");

    // 3) 越权写向量必须失败
    let denied = false;
    try {
      await asUser(userB, async (tx) => {
        await tx`select public.set_node_embedding(${nodeId}::uuid, ${vectorText}::vector, ${EMBEDDING_MODEL})`;
      });
    } catch (error) {
      denied = /节点不存在或无权修改|42501|permission|权限/i.test(error.message);
    }
    if (!denied) throw new Error("B 竟然能修改 A 的节点向量：set_node_embedding 缺少隔离！");
    console.log("✓ 越权写入向量被拒绝");

    // 4) events 读写隔离（P1-B）
    await asUser(userA, async (tx) => {
      await tx`
        insert into public.events (id, user_id, name, props, created_at)
        values (${eventId}, ${userA}, 'verify_event', ${JSON.stringify({ source: "verify-rls" })}::jsonb, ${stamp})
      `;
    });
    const eventByA = await asUser(userA, (tx) =>
      tx`select id from public.events where id = ${eventId}`,
    );
    const eventByB = await asUser(userB, (tx) =>
      tx`select id from public.events where id = ${eventId}`,
    );
    if (eventByA.length !== 1) throw new Error("A 读取不到自己写入的埋点事件");
    if (eventByB.length !== 0) throw new Error("B 能读到 A 的埋点事件：events RLS 未生效！");
    console.log("✓ 埋点事件读写隔离生效");

    // 5) 回填列表只返回本人数据
    const missing = await asUser(userA, (tx) =>
      tx`select id from public.list_nodes_missing_embedding('another-model')`,
    );
    if (!missing.some((row) => row.id === nodeId)) {
      throw new Error("list_nodes_missing_embedding 未返回当前用户的待回填节点");
    }
    const missingB = await asUser(userB, (tx) =>
      tx`select id from public.list_nodes_missing_embedding('another-model') where id = ${nodeId}`,
    );
    if (missingB.length !== 0) throw new Error("B 能看到 A 的待回填节点：隔离失效！");
    console.log("✓ 回填列表按用户隔离");

    // 6) 会话与消息归属隔离（P1-D 多会话）
    await asUser(userA, async (tx) => {
      await tx`
        insert into public.conversations (id, user_id, title, created_at, updated_at)
        values (${conversationId}, ${userA}, 'RLS 会话校验', ${stamp}, ${stamp})
      `;
      await tx`
        insert into public.chat_messages (id, user_id, conversation_id, role, content, payload, created_at)
        values (${conversationMessageId}, ${userA}, ${conversationId}, 'user', '会话隔离校验', '{}'::jsonb, ${stamp})
      `;
    });
    const conversationByA = await asUser(userA, (tx) =>
      tx`select id from public.conversations where id = ${conversationId}`,
    );
    const conversationByB = await asUser(userB, (tx) =>
      tx`select id from public.conversations where id = ${conversationId}`,
    );
    const messageByB = await asUser(userB, (tx) =>
      tx`select id from public.chat_messages where id = ${conversationMessageId}`,
    );
    if (conversationByA.length !== 1) throw new Error("A 读取不到自己的会话");
    if (conversationByB.length !== 0) throw new Error("B 能读到 A 的会话：RLS 未生效！");
    if (messageByB.length !== 0) throw new Error("B 能读到 A 的会话消息：RLS 未生效！");

    let crossConversationDenied = false;
    try {
      await asUser(userB, async (tx) => {
        await tx`
          insert into public.chat_messages (id, user_id, conversation_id, role, content, payload, created_at)
          values (${crossMessageId}, ${userB}, ${conversationId}, 'user', '越权会话消息', '{}'::jsonb, ${stamp})
        `;
      });
    } catch (error) {
      crossConversationDenied = /row-level security|new row violates|42501|permission|权限/i.test(
        error.message,
      );
    }
    if (!crossConversationDenied) {
      throw new Error("B 能把消息挂到 A 的会话：conversation 归属策略未生效！");
    }
    console.log("✓ 会话与消息归属隔离生效");

    console.log("\nRLS / 向量 / 埋点 / 会话直连校验通过 ✅");
  } catch (error) {
    if (/function .* does not exist|42883/i.test(error.message)) {
      console.error("\nRLS 校验失败 ✗：缺少向量/事件相关函数，请先执行 npm run db:init");
    } else {
      console.error(`\nRLS 校验失败 ✗：${error.message}`);
    }
    exitCode = 1;
  } finally {
    // 以 postgres 身份清理（绕过 RLS），确保脚本可重复执行。
    await sql`delete from public.chat_messages where id in (${conversationMessageId}, ${crossMessageId})`.catch(() => {});
    await sql`delete from public.conversations where id = ${conversationId}`.catch(() => {});
    await sql`delete from public.events where id = ${eventId}`.catch(() => {});
    await sql`delete from public.nodes where id = ${nodeId}`.catch(() => {});
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(exitCode);
  }
}

const direct = process.argv.includes("--direct");
if (direct) {
  await runViaDirect();
} else {
  await runViaHttp();
}
