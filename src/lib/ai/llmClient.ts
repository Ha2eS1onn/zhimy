import { describeLlmStatus, LlmError, type ChatTurn, type LlmSettings, type StreamChatOptions } from "./types";
import { extractDeltaParts, readCompletionParts, parseSseStream } from "./sse";

/** 规范化 Base URL：去尾部斜杠，校验协议。 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new LlmError("还没有填写接口地址", { hint: "例如 https://api.deepseek.com/v1" });
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new LlmError("接口地址格式不正确", { hint: "需要以 https:// 开头的完整地址" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new LlmError("接口地址只支持 http(s)");
  }
  if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new LlmError("公网接口必须使用 https", { hint: "本地调试可以用 http://localhost" });
  }
  return trimmed;
}

function buildRequest(
  settings: LlmSettings,
  messages: ChatTurn[],
  options: { temperature?: number; maxTokens?: number } = {},
) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const body = {
    baseUrl,
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    messages,
    ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
    ...(typeof options.maxTokens === "number" ? { maxTokens: options.maxTokens } : {}),
  };
  return { baseUrl, body };
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return (json.error?.message ?? json.message ?? text).slice(0, 240);
  } catch {
    return "";
  }
}

async function consumeResponse(
  response: Response,
  onDelta: (chunk: string) => void,
  onReasoningDelta?: (chunk: string) => void,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && response.body) {
    let full = "";
    let hadReasoning = false;
    for await (const event of parseSseStream(response.body)) {
      const parts = extractDeltaParts(event);
      if (parts.reasoning) {
        hadReasoning = true;
        onReasoningDelta?.(parts.reasoning);
      }
      if (!parts.content) continue;
      full += parts.content;
      onDelta(parts.content);
    }
    if (!full) {
      throw new LlmError("模型没有返回内容", {
        hint: hadReasoning
          ? "模型只返回了思考过程，没有正文；可以换个模型或让它直接给出答案。"
          : "可能是模型不支持流式输出，或接口地址少了 /v1 前缀。",
      });
    }
    return full;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
    reasoning?: unknown;
  };
  const parts = readCompletionParts(data);
  if (parts.reasoning) onReasoningDelta?.(parts.reasoning);
  const content = parts.content;
  if (!content) {
    throw new LlmError(data.error?.message ?? "模型没有返回内容");
  }
  onDelta(content);
  return content;
}

/** 发起一次流式对话，返回完整文本。 */
export async function streamChat(options: StreamChatOptions): Promise<string> {
  const { settings, messages, signal, onDelta, onReasoningDelta, temperature, maxTokens } = options;
  if (settings.mode !== "real") {
    throw new LlmError("当前是演示模式，请先在设置里接入自己的模型");
  }
  if (!settings.apiKey.trim()) {
    throw new LlmError("还没有填写 API Key", { hint: "Key 只保存在本机浏览器，不会上传。" });
  }
  if (!settings.model.trim()) {
    throw new LlmError("还没有填写模型名", { hint: "例如 deepseek-chat、gpt-4o-mini。" });
  }

  const { baseUrl, body } = buildRequest(settings, messages, { temperature, maxTokens });

  let response: Response;
  try {
    if (settings.transport === "direct") {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${body.apiKey}`,
        },
        body: JSON.stringify({
          model: body.model,
          messages,
          stream: true,
          ...(temperature !== undefined ? { temperature } : {}),
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        }),
        signal,
      });
    } else {
      response = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    }
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") throw error;
    throw new LlmError("网络请求失败", {
      hint: "浏览器直连可能被跨域（CORS）拦截，试试在设置里切换到「代理模式」。",
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const translated = describeLlmStatus(response.status);
    throw new LlmError(detail ? `${translated.message}：${detail}` : translated.message, {
      status: response.status,
      hint: translated.hint,
    });
  }

  return consumeResponse(response, onDelta, onReasoningDelta);
}

/** 设置页的「测试连接」：发一条极短的对话确认 Key / 地址 / 模型可用。 */
export async function testConnection(settings: LlmSettings): Promise<string> {
  let text = "";
  const reply = await streamChat({
    settings,
    messages: [
      { role: "system", content: "你是连通性测试助手，只回复四个字：连接成功。" },
      { role: "user", content: "ping" },
    ],
    onDelta: (chunk) => {
      text += chunk;
    },
  });
  return (reply || text).slice(0, 40);
}
