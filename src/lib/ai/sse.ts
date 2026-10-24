/** SSE（Server-Sent Events）解析：抽成纯函数方便单测。 */

export interface SseParseResult {
  events: string[];
  done: boolean;
  rest: string;
}

/** 从缓冲区里拆出完整的 data 行；返回未完成的残留。 */
export function parseSseBuffer(buffer: string): SseParseResult {
  const events: string[] = [];
  let done = false;
  let rest = buffer;
  for (;;) {
    const newlineIndex = rest.indexOf("\n");
    if (newlineIndex < 0) break;
    const rawLine = rest.slice(0, newlineIndex);
    rest = rest.slice(newlineIndex + 1);
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      rest = "";
      break;
    }
    events.push(data);
  }
  return { events, done, rest };
}

/** 把 ReadableStream 逐块解析为 SSE 事件。 */
export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) yield event;
      if (parsed.done) return;
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSseBuffer(`${buffer}\n`);
      for (const event of parsed.events) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: unknown;
      reasoning?: unknown;
      thinking?: unknown;
      reasoning_details?: unknown;
    };
    message?: {
      content?: string | null;
      reasoning_content?: unknown;
      reasoning?: unknown;
      thinking?: unknown;
      reasoning_details?: unknown;
    };
    reasoning?: unknown;
    text?: string | null;
  }>;
  reasoning?: unknown;
}

export interface CompletionParts {
  content: string;
  reasoning: string;
}

const EMPTY_PARTS: CompletionParts = { content: "", reasoning: "" };

function readText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "summary"]) {
      if (typeof record[key] === "string" && record[key]) return record[key] as string;
    }
  }
  return "";
}

/** reasoning_details 可能是数组；字符串直接返回，对象取 text/summary。 */
function readReasoning(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(readReasoning).join("");
  return readText(value);
}

function firstNonEmpty(values: string[]): string {
  return values.find((value) => value.length > 0) ?? "";
}

/**
 * 从一条 SSE data 或非流式响应里同时取正文与思维链。
 * 兼容 DeepSeek/Qwen 的 reasoning_content、OpenRouter 的 reasoning、
 * 部分代理的 thinking 以及 reasoning_details 数组；没有就返回空串。
 */
export function readCompletionParts(payload: unknown): CompletionParts {
  if (!payload || typeof payload !== "object") return EMPTY_PARTS;

  const json = payload as ChatCompletionChunk;
  const choice = json.choices?.[0];
  if (!choice) {
    return { content: "", reasoning: readReasoning(json.reasoning) };
  }

  const delta = choice.delta;
  const message = choice.message;
  const reasoning = firstNonEmpty([
    readReasoning(delta?.reasoning_content),
    readReasoning(delta?.reasoning),
    readReasoning(delta?.thinking),
    readReasoning(delta?.reasoning_details),
    readReasoning(message?.reasoning_content),
    readReasoning(message?.reasoning),
    readReasoning(message?.thinking),
    readReasoning(message?.reasoning_details),
    readReasoning(choice.reasoning),
    readReasoning(json.reasoning),
  ]);

  const content = firstNonEmpty([
    typeof choice.delta?.content === "string" ? choice.delta.content : "",
    typeof choice.message?.content === "string" ? choice.message.content : "",
    typeof choice.text === "string" ? choice.text : "",
  ]);

  return { content, reasoning };
}

/** 从一条 SSE data 中取出正文与思维链；解析失败返回空串。 */
export function extractDeltaParts(data: string): CompletionParts {
  try {
    return readCompletionParts(JSON.parse(data));
  } catch {
    return EMPTY_PARTS;
  }
}

/** 从一条 SSE data 中取出增量文本；解析失败返回空串。 */
export function extractDelta(data: string): string {
  return extractDeltaParts(data).content;
}
