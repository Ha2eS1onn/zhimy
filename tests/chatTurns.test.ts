import { describe, expect, it } from "vitest";
import { planChatRequest } from "@/lib/ai/chatTurns";
import { IMAGE_HINT } from "@/lib/ai/prompt";

const base = {
  question: "这道电路题怎么做？",
  imageDataUrl: null,
  history: [],
  textModel: "deepseek-chat",
  visionModel: "",
};

describe("图片提问的消息组装", () => {
  it("无图：user turn 是纯文本，模型用文本模型", () => {
    const plan = planChatRequest(base);
    expect(plan.model).toBe("deepseek-chat");
    expect(plan.imageAttached).toBe(false);
    expect(plan.visionModelConfigured).toBe(false);
    expect(plan.turns[0]).toMatchObject({ role: "system" });
    expect(plan.turns.at(-1)).toEqual({ role: "user", content: "这道电路题怎么做？" });
  });

  it("有图且配置视觉模型：实际请求模型切换为视觉模型，图片附在 user turn", () => {
    const plan = planChatRequest({
      ...base,
      imageDataUrl: "data:image/jpeg;base64,AAAA",
      visionModel: " glm-4v-flash ",
    });
    expect(plan.model).toBe("glm-4v-flash");
    expect(plan.imageAttached).toBe(true);
    expect(plan.visionModelConfigured).toBe(true);
    const userTurn = plan.turns.at(-1)!;
    expect(Array.isArray(userTurn.content)).toBe(true);
    const parts = userTurn.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("这道电路题怎么做？");
    expect(parts[0].text).toContain(IMAGE_HINT);
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
  });

  it("有图但未配置视觉模型：仍附图、沿用文本模型，不再静默丢图", () => {
    const plan = planChatRequest({
      ...base,
      imageDataUrl: "data:image/jpeg;base64,BBBB",
    });
    expect(plan.imageAttached).toBe(true);
    expect(plan.visionModelConfigured).toBe(false);
    expect(plan.model).toBe("deepseek-chat");
    const parts = plan.turns.at(-1)!.content as Array<{ type: string }>;
    expect(parts.map((part) => part.type)).toEqual(["text", "image_url"]);
  });

  it("历史只保留最近 8 轮，每轮截断 1200 字", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `${index}-${"长".repeat(2000)}`,
    }));
    const plan = planChatRequest({ ...base, history });
    // system + 8 条历史 + 当前提问
    expect(plan.turns).toHaveLength(10);
    expect(plan.turns[1]).toMatchObject({ role: "user" });
    expect((plan.turns[1].content as string).length).toBe(1200);
    expect((plan.turns[1].content as string).startsWith("2-")).toBe(true);
  });
});
