#!/usr/bin/env node
/**
 * 存量/示例图谱的向量回填（运维脚本）。
 *
 * 浏览器端的「设置 → 数据 → 重建向量索引」走 RLS 与 BYOK，适合普通用户；
 * 本脚本直连 Postgres，适合本机批量维护（例如给示例图谱一次性补向量）。
 *
 * 依赖 .env.local 或环境变量：
 *   SUPABASE_DB_URL        完整连接串，或只填数据库密码（按项目 ref 自动拼串）
 *   NEXT_PUBLIC_SUPABASE_URL  （只填密码时用于确定项目 ref）
 *   EMBEDDING_API_KEY      embedding 服务的 Key（不会写入数据库）
 *   EMBEDDING_BASE_URL     例如 https://api.openai.com/v1 / https://api.siliconflow.cn/v1
 *   EMBEDDING_MODEL        例如 text-embedding-3-small / BAAI/bge-m3（需输出 1024 维）
 *
 * 用法：
 *   npm run embed:backfill -- --dry-run
 *   npm run embed:backfill
 *   npm run embed:backfill -- --force --limit 50
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const EMBEDDING_DIM = 1024;

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

function parseArgs(argv) {
  const options = { dryRun: false, force: false, limit: 0, batch: 16 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--limit") options.limit = Number(argv[(index += 1)] ?? 0);
    else if (arg === "--batch") options.batch = Number(argv[(index += 1)] ?? 16);
    else if (arg === "--help" || arg === "-h") {
      console.log("用法：node scripts/embed-backfill.mjs [--dry-run] [--force] [--limit N] [--batch N]");
      process.exit(0);
    } else {
      console.error(`✗ 未知参数：${arg}`);
      process.exit(1);
    }
  }
  if (!Number.isFinite(options.batch) || options.batch < 1 || options.batch > 64) {
    options.batch = 16;
  }
  if (!Number.isFinite(options.limit) || options.limit < 0) options.limit = 0;
  return options;
}

function resolveDbUrl() {
  const raw = readEnv("SUPABASE_DB_URL");
  if (!raw) return null;
  if (/^postgres(ql)?:\/\//i.test(raw)) return raw;
  const projectUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  let ref = readEnv("SUPABASE_PROJECT_REF");
  if (!ref && projectUrl) {
    try {
      ref = new URL(projectUrl).host.split(".")[0];
    } catch {
      ref = null;
    }
  }
  if (!ref) return null;
  return `postgresql://postgres:${encodeURIComponent(raw)}@db.${ref}.supabase.co:5432/postgres`;
}

function supportsCustomDimensions(model) {
  return /^text-embedding-3|^embedding-3|^text-embedding-v[34]/i.test(model);
}

function trimTrailingSlashes(value) {
  return value.trim().replace(/\/+$/, "");
}

function readErrorBody(text) {
  try {
    const json = JSON.parse(text);
    return (json.error?.message ?? json.message ?? text).slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

async function requestEmbeddings({ baseUrl, apiKey, model, inputs, dimensions }) {
  const url = `${trimTrailingSlashes(baseUrl)}/embeddings`;
  const send = async (withDimensions) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: inputs,
        ...(withDimensions ? { dimensions: EMBEDDING_DIM } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    return response;
  };

  let response = await send(dimensions);
  if (!response.ok && dimensions) {
    const detail = await response.text().catch(() => "");
    if (response.status === 400 && /dimension/i.test(detail)) {
      response = await send(false);
    } else {
      throw new Error(`embedding 服务返回 ${response.status}：${readErrorBody(detail)}`);
    }
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`embedding 服务返回 ${response.status}：${readErrorBody(detail)}`);
  }

  const data = await response.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  const sorted = [...list].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = sorted.map((item) => {
    const values = item?.embedding;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
      throw new Error(
        `向量维度不匹配：期望 ${EMBEDDING_DIM}，实际 ${Array.isArray(values) ? values.length : "未知"}。请换用输出 1024 维的模型（或支持 dimensions 参数的模型）。`,
      );
    }
    return values.map((value) => Number(value));
  });
  if (vectors.length !== inputs.length) {
    throw new Error(`向量条数不匹配：请求 ${inputs.length} 条，返回 ${vectors.length} 条`);
  }
  return vectors;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const dbUrl = resolveDbUrl();
  if (!dbUrl) {
    console.error("✗ 缺少 SUPABASE_DB_URL（完整连接串或数据库密码 + NEXT_PUBLIC_SUPABASE_URL）");
    process.exit(1);
  }
  const baseUrl = readEnv("EMBEDDING_BASE_URL");
  const apiKey = readEnv("EMBEDDING_API_KEY");
  const model = readEnv("EMBEDDING_MODEL") || "text-embedding-3-small";
  if (!baseUrl || !apiKey) {
    console.error("✗ 缺少 EMBEDDING_BASE_URL / EMBEDDING_API_KEY（建议写在环境变量里，不要提交）");
    process.exit(1);
  }

  const sql = postgres(dbUrl, {
    max: 1,
    ssl: /sslmode=disable/.test(dbUrl) ? false : "require",
    onnotice: () => {},
    connect_timeout: 25,
  });

  try {
    const rows = await sql`
      select id, title, summary, embedding_model
      from public.nodes
      where ${options.force ? sql`true` : sql`embedding is null or embedding_model is distinct from ${model}`}
      order by created_at asc
      ${options.limit > 0 ? sql`limit ${options.limit}` : sql``}
    `;

    if (rows.length === 0) {
      console.log("✓ 没有需要回填的节点（同模型已覆盖）。如需强制重算，加 --force。");
      return;
    }

    console.log(
      `→ 待回填 ${rows.length} 个节点 · model=${model} · batch=${options.batch}${options.dryRun ? " · dry-run" : ""}`,
    );
    if (options.dryRun) {
      for (const row of rows.slice(0, 10)) {
        console.log(`  · ${row.title}（当前模型：${row.embedding_model ?? "无"}）`);
      }
      if (rows.length > 10) console.log(`  · …还有 ${rows.length - 10} 个`);
      return;
    }

    const dimensions = supportsCustomDimensions(model);
    let embedded = 0;
    let failed = 0;

    for (let start = 0; start < rows.length; start += options.batch) {
      const batch = rows.slice(start, start + options.batch);
      const texts = batch.map((row) =>
        `${row.title}\n${row.summary ?? ""}`.slice(0, 1000),
      );
      let vectors;
      try {
        vectors = await requestEmbeddings({ baseUrl, apiKey, model, inputs: texts, dimensions });
      } catch (error) {
        failed += batch.length;
        console.warn(`  ✗ 第 ${start + 1}-${start + batch.length} 条失败：${error.message}`);
        continue;
      }

      for (let index = 0; index < batch.length; index += 1) {
        const row = batch[index];
        const vector = vectors[index];
        try {
          await sql`
            update public.nodes
               set embedding = ${JSON.stringify(vector)}::vector,
                   embedding_model = ${model},
                   embedding_updated_at = now()
             where id = ${row.id}::uuid
          `;
          embedded += 1;
        } catch (error) {
          failed += 1;
          console.warn(`  ✗ 写入「${row.title}」失败：${error.message}`);
        }
      }
      console.log(`  [${Math.min(start + batch.length, rows.length)}/${rows.length}] 已写入 ${embedded}，失败 ${failed}`);
      await sleep(120);
    }

    console.log(`✓ 回填完成：成功 ${embedded}，失败 ${failed}（可重复执行；失败项下次会重试）`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (error) {
  console.error(`✗ 回填失败：${error.message}`);
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(error.message)) {
    console.error("  提示：本机可能无法直连 db.<ref>.supabase.co，可在终端设置 HTTPS_PROXY 后重试。");
  }
  process.exitCode = 1;
}
