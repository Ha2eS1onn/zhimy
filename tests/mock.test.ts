import { describe, expect, it } from "vitest";
import { fallbackKnowledgeTitle, mockAnswerFor, mockExtract, pickScenario } from "@/lib/ai/mock";
import { sampleNodes } from "./helpers";

describe("演示模式脚本与抽取", () => {
  it("按关键词选中对应剧本", () => {
    expect(pickScenario("电阻并联怎么算？")?.answer).toContain("并联");
    expect(pickScenario("浮力怎么理解")?.answer).toContain("阿基米德");
    expect(pickScenario("今天天气怎么样")).toBeNull();
  });

  it("未知问题给兜底解答", () => {
    const answer = mockAnswerFor("随便问一个");
    expect(answer).toContain("三步");
  });

  it("抽取建议能解析到已有节点的父节点与关系目标", () => {
    const nodes = sampleNodes();
    const suggestions = mockExtract("电阻并联怎么算？", nodes, "source-1");
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    const parallel = suggestions.find((item) => item.title === "电阻的并联");
    expect(parallel).toBeTruthy();
    expect(parallel!.suggestedParentId).toBe("resistor");
    expect(parallel!.sourceId).toBe("source-1");
    expect(parallel!.confidence).toBeGreaterThan(0.75);
    const contrast = parallel!.relations.find((relation) => relation.type === "contrast");
    expect(contrast?.targetNodeId).toBe("r-series");
  });

  it("无关问题走低置信度兜底，进入待处理", () => {
    const suggestions = mockExtract("一道没见过的怪题", sampleNodes(), null);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.confidence).toBeLessThan(0.75);
    expect(suggestions[0]!.suggestedParentId).toBeNull();
  });

  it("兜底标题会过滤「再详细讲一道」这类对话指令", () => {
    expect(fallbackKnowledgeTitle("再详细讲一道")).toBe("待整理知识点");
    expect(fallbackKnowledgeTitle("继续")).toBe("待整理知识点");
    expect(fallbackKnowledgeTitle("详细讲讲")).toBe("待整理知识点");
    expect(fallbackKnowledgeTitle("电路故障分析")).toBe("电路故障分析");
    const suggestions = mockExtract("再详细讲一道", sampleNodes(), null);
    expect(suggestions[0]!.title).toBe("待整理知识点");
  });
});
