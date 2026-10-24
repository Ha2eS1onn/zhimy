import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { resolveProxyTarget } from "@/lib/ai/proxyGuard";
import type { ChatTurn } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ProxyBody {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  messages?: ChatTurn[];
  temperature?: number;
  maxTokens?: number;
}

// 图片以 base64 dataURL 随消息体发送：客户端会把视觉输入压到 1600px，
// 这里留到 4 MB，低于 Vercel Functions 约 4.5 MB 的请求体上限。
const MAX_MESSAGES_BYTES = 4_000_000;

/** BYOK 代理：只负责转发 OpenAI 兼容的 chat/completions，不存储、不记录 Key。 */
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

  const { baseUrl, apiKey, model, messages, temperature, maxTokens } = body;
  if (!baseUrl || !apiKey || !model || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: { message: "缺少 baseUrl / apiKey / model / messages" } },
      { status: 400 },
    );
  }
  if (JSON.stringify(messages).length > MAX_MESSAGES_BYTES) {
    return NextResponse.json(
      { error: { message: "请求内容过大（含图片时请压缩或换一张更小的图片）" } },
      { status: 413 },
    );
  }

  let target;
  try {
    target = await resolveProxyTarget(baseUrl);
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
        messages,
        stream: true,
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    const message =
      (error as Error)?.name === "TimeoutError"
        ? "模型服务响应超时"
        : `无法连接模型服务：${(error as Error)?.message ?? "未知错误"}`;
    return NextResponse.json({ error: { message } }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new NextResponse(text || JSON.stringify({ error: { message: `上游返回 ${upstream.status}` } }), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && upstream.body) {
    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    headers: { "content-type": contentType || "application/json" },
  });
}
