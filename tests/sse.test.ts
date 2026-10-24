import { describe, expect, it } from "vitest";
import {
  extractDelta,
  extractDeltaParts,
  parseSseBuffer,
  parseSseStream,
} from "@/lib/ai/sse";

describe("SSE 解析", () => {
  it("拆出多个 data 事件并识别 [DONE]", () => {
    const buffer =
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n';
    const result = parseSseBuffer(buffer);
    expect(result.done).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.rest).toBe("");
  });

  it("半行数据留到下一次解析", () => {
    const first = parseSseBuffer('data: {"choices":[{"delta":{"content":"电"}');
    expect(first.events).toHaveLength(0);
    expect(first.rest.startsWith("data:")).toBe(true);

    const second = parseSseBuffer(`${first.rest}}]}\n\ndata: [DONE]\n\n`);
    expect(second.events).toHaveLength(1);
    expect(extractDelta(second.events[0]!)).toBe("电");
  });

  it("忽略注释与非 data 行", () => {
    const result = parseSseBuffer(': keep-alive\nevent: message\ndata: {}\n');
    expect(result.events).toEqual(["{}"]);
  });

  it("extractDelta 兼容 delta / message / text 三种结构", () => {
    expect(extractDelta('{"choices":[{"delta":{"content":"A"}}]}')).toBe("A");
    expect(extractDelta('{"choices":[{"message":{"content":"B"}}]}')).toBe("B");
    expect(extractDelta('{"choices":[{"text":"C"}]}')).toBe("C");
    expect(extractDelta("not-json")).toBe("");
  });

  it("提取思维链：reasoning_content / reasoning / reasoning_details", () => {
    expect(
      extractDeltaParts('{"choices":[{"delta":{"reasoning_content":"先看题意"}}]}'),
    ).toEqual({ content: "", reasoning: "先看题意" });
    expect(
      extractDeltaParts('{"choices":[{"delta":{"reasoning":"再列式"}}]}'),
    ).toEqual({ content: "", reasoning: "再列式" });
    expect(
      extractDeltaParts('{"choices":[{"delta":{"thinking":"部分代理的思考"}}]}'),
    ).toEqual({ content: "", reasoning: "部分代理的思考" });
    expect(
      extractDeltaParts(
        '{"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"设未知数"},{"type":"reasoning.text","text":"再解方程"}]}}]}',
      ),
    ).toEqual({ content: "", reasoning: "设未知数再解方程" });
    expect(
      extractDeltaParts('{"choices":[{"message":{"reasoning_content":"非流式思考"}}]}'),
    ).toEqual({ content: "", reasoning: "非流式思考" });
  });

  it("正文与思维链可以同时出现在一条事件里", () => {
    expect(
      extractDeltaParts('{"choices":[{"delta":{"reasoning_content":"想","content":"答"}}]}'),
    ).toEqual({ content: "答", reasoning: "想" });
  });

  it("parseSseStream 正确处理跨块的 UTF-8 与事件", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"电阻"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"并联"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const full = chunks.join("");
    const bytes = encoder.encode(full);
    const splitAt = 20; // 故意切在中文字符中间
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, splitAt));
        controller.enqueue(bytes.slice(splitAt));
        controller.close();
      },
    });
    const events: string[] = [];
    for await (const event of parseSseStream(stream)) events.push(event);
    expect(events).toHaveLength(2);
    expect(events.map(extractDelta).join("")).toBe("电阻并联");
  });
});
