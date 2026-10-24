import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { resolveProxyTarget } from "@/lib/ai/proxyGuard";
import { EMBEDDING_DIM } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ProxyBody {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  input?: string | string[];
  dimensions?: number;
}

const MAX_INPUTS = 32;
const MAX_INPUT_CHARS = 2_000;
const MAX_TOTAL_CHARS = 16_000;
const FETCH_TIMEOUT_MS = 30_000;

/** 校验 input：单条字符串或字符串数组；返回规整后的数组。 */
function normalizeInputs(input: ProxyBody["input"]): string[] | null {
  const rawInputs = typeof input === "string" ? [input] : input;
  if (!Array.isArray(rawInputs) || rawInputs.length === 0) return null;
  if (rawInputs.length > MAX_INPUTS) return null;
  if (rawInputs.some((item) => typeof item !== "string" || !item.trim())) return null;
  if (rawInputs.some((item) => item.length > MAX_INPUT_CHARS)) return null;
  const totalChars = rawInputs.reduce((sum, item) => sum + item.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) return null;
  return rawInputs;
}

/**
 * BYOK 向量代理：只负责转发 OpenAI 兼容的 /embeddings，请求体/Key 不记录、不落库，
 * 复用与 /api/llm/chat 相同的登录校验、https、域名白名单与 DNS 私网拦截（防 SSRF）。
 */
export async function POST(request: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: { message: "服务端未配置 Supabase" } }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { message: "需要先建立会话（游客账号就绪后重试）" } },
      { status: 401 },
    );
  }

  let body: ProxyBody;
  try {
    body = (await request.json()) as ProxyBody;
  } catch {
    return NextResponse.json({ error: { message: "请求体不是合法的 JSON" } }, { status: 400 });
  }

  const { baseUrl, apiKey, model, input, dimensions } = body;
  if (
    typeof baseUrl !== "string" ||
    !baseUrl.trim() ||
    typeof apiKey !== "string" ||
    !apiKey.trim() ||
    typeof model !== "string" ||
    !model.trim()
  ) {
    return NextResponse.json(
      { error: { message: "缺少 baseUrl / apiKey / model / input" } },
      { status: 400 },
    );
  }
  const inputs = normalizeInputs(input);
  if (!inputs) {
    return NextResponse.json(
      {
        error: {
          message: `input 需为非空字符串或字符串数组：最多 ${MAX_INPUTS} 条、单条 ≤ ${MAX_INPUT_CHARS} 字符、总长 ≤ ${MAX_TOTAL_CHARS} 字符`,
        },
      },
      { status: 400 },
    );
  }
  if (dimensions !== undefined && dimensions !== EMBEDDING_DIM) {
    return NextResponse.json(
      { error: { message: `dimensions 只支持 ${EMBEDDING_DIM}` } },
      { status: 400 },
    );
  }

  let target;
  try {
    target = await resolveProxyTarget(baseUrl, "/embeddings");
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "接口地址不可用" } },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
        ...(dimensions !== undefined ? { dimensions } : {}),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      (error as Error)?.name === "TimeoutError"
        ? "向量服务响应超时"
        : `无法连接向量服务：${(error as Error)?.message ?? "未知错误"}`;
    return NextResponse.json({ error: { message } }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new NextResponse(text || JSON.stringify({ error: { message: `上游返回 ${upstream.status}` } }), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  const text = await upstream.text();
  return new NextResponse(text, { headers: { "content-type": "application/json" } });
}
