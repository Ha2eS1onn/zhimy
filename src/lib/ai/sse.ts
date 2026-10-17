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
    delta?: { content?: string | null };
    message?: { content?: string | null };
    text?: string | null;
  }>;
}

/** 从一条 SSE data 中取出增量文本；解析失败返回空串。 */
export function extractDelta(data: string): string {
  try {
    const json = JSON.parse(data) as ChatCompletionChunk;
    const choice = json.choices?.[0];
    if (!choice) return "";
    return choice.delta?.content ?? choice.message?.content ?? choice.text ?? "";
  } catch {
    return "";
  }
}
