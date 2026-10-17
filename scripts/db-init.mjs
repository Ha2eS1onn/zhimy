#!/usr/bin/env node
/**
 * 初始化 Supabase 数据库：读取 supabase/schema.sql，按 "-- STATEMENT" 切分后逐条执行。
 * 用法：在 .env.local 填好 SUPABASE_DB_URL 后执行 npm run db:init
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
const dbUrl = process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("✗ 缺少 SUPABASE_DB_URL。");
  console.error(
    "  请把 Supabase 的数据库连接串写进 .env.local：Project Settings → Database → Connection string → URI。",
  );
  process.exit(1);
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

const sslMode = process.env.PGSSL || (/sslmode=disable/.test(dbUrl) ? "disable" : "require");
const sql = postgres(dbUrl, {
  max: 1,
  ssl: sslMode === "disable" ? false : "require",
  onnotice: () => {},
  connect_timeout: 15,
});

try {
  console.log(`→ 连接数据库并执行 ${statements.length} 条语句…`);
  for (let index = 0; index < statements.length; index += 1) {
    await sql.unsafe(statements[index]);
    console.log(`  [${String(index + 1).padStart(2, "0")}/${statements.length}] ok`);
  }
  console.log("✓ 数据库初始化完成：表、索引、RLS 策略、触发器均已就绪。");
} catch (error) {
  console.error("✗ 数据库初始化失败：", error.message);
  if (/auth|permission|policy/i.test(error.message)) {
    console.error("  提示：请使用 Project Settings → Database 里的 postgres 连接串，并确认 auth schema 可用。");
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
