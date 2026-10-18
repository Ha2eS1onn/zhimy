#!/usr/bin/env node
/**
 * 初始化 Supabase 数据库：读取 supabase/schema.sql，按 "-- STATEMENT" 切分后逐条执行。
 *
 * 支持两种执行方式（按优先级）：
 *   1. 直连 Postgres：.env.local 里配置 SUPABASE_DB_URL
 *   2. Supabase 管理 API：配置 SUPABASE_ACCESS_TOKEN（Account → Access Tokens）
 *      —— 适合国内网络无法直连 db.<ref>.supabase.co 的情况
 *
 * 用法：npm run db:init
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

const accessToken = readEnv("SUPABASE_ACCESS_TOKEN");
const projectUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
let projectRef = readEnv("SUPABASE_PROJECT_REF");
if (!projectRef && projectUrl) {
  try {
    projectRef = new URL(projectUrl).host.split(".")[0];
  } catch {
    projectRef = undefined;
  }
}

// SUPABASE_DB_URL 支持两种写法：完整 URI，或者只填数据库密码（自动按项目 ref 拼连接串）。
const rawDbUrl = readEnv("SUPABASE_DB_URL");
let dbUrl = rawDbUrl;
let dbUrlNote = "";
if (rawDbUrl && !/^postgres(ql)?:\/\//i.test(rawDbUrl)) {
  if (!projectRef) {
    console.error("✗ SUPABASE_DB_URL 只填了密码，但无法确定项目 ref（请补 NEXT_PUBLIC_SUPABASE_URL）");
    process.exit(1);
  }
  dbUrl = `postgresql://postgres:${encodeURIComponent(rawDbUrl)}@db.${projectRef}.supabase.co:5432/postgres`;
  dbUrlNote = "（SUPABASE_DB_URL 只填了密码，已自动拼成连接串）";
}

const schemaPath = path.resolve(process.cwd(), "supabase/schema.sql");
if (!existsSync(schemaPath)) {
  console.error("✗ 找不到 supabase/schema.sql");
  process.exit(1);
}

const statements = readFileSync(schemaPath, "utf8")
  .split(/^--\s*STATEMENT\s*$/m)
  .map((statement) => statement.trim())
  .filter(Boolean);

async function runViaPostgres() {
  const sslMode = process.env.PGSSL || (/sslmode=disable/.test(dbUrl) ? "disable" : "require");
  const sql = postgres(dbUrl, {
    max: 1,
    ssl: sslMode === "disable" ? false : "require",
    onnotice: () => {},
    connect_timeout: 20,
  });
  try {
    console.log(`→ 直连 Postgres，执行 ${statements.length} 条语句…`);
    for (let index = 0; index < statements.length; index += 1) {
      await sql.unsafe(statements[index]);
      console.log(`  [${String(index + 1).padStart(2, "0")}/${statements.length}] ok`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runViaManagementApi() {
  console.log(`→ 使用 Supabase 管理 API（project: ${projectRef}），执行 ${statements.length} 条语句…`);
  for (let index = 0; index < statements.length; index += 1) {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: statements[index] }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`管理 API 返回 ${response.status}：${detail.slice(0, 400)}`);
    }
    console.log(`  [${String(index + 1).padStart(2, "0")}/${statements.length}] ok`);
  }
}

async function main() {
  if (dbUrl) {
    if (dbUrlNote) console.log(dbUrlNote);
    await runViaPostgres();
  } else if (accessToken && projectRef) {
    await runViaManagementApi();
  } else {
    console.error("✗ 没有可用的数据库执行方式。请任选一种写入 .env.local：");
    console.error(
      "  方式 A（直连）：SUPABASE_DB_URL=postgresql://postgres:密码@db.<ref>.supabase.co:5432/postgres",
    );
    console.error(
      "  方式 B（管理 API，适合国内网络）：SUPABASE_ACCESS_TOKEN=sbp_xxx（Account → Access Tokens）",
    );
    console.error("  也可以直接把 supabase/schema.sql 粘贴到 Supabase 控制台的 SQL Editor 执行。");
    process.exit(1);
  }
  console.log("✓ 数据库初始化完成：表、索引、RLS 策略、触发器均已就绪。");
}

try {
  await main();
} catch (error) {
  console.error("✗ 数据库初始化失败：", error.message);
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(error.message)) {
    console.error(
      "  提示：你的网络可能无法直连 Supabase。可在终端设置 HTTPS_PROXY 后重试，或改用方式 B（管理 API）。",
    );
  }
  process.exitCode = 1;
}
