import { describe, expect, it } from "vitest";
import {
  buildCandidateContext,
  buildExtractionPrompt,
  parseExtractionResponse,
  sanitizeTitle,
  toSuggestions,
} from "@/lib/ai/extract";
import { sampleNodes } from "./helpers";

describe("真实抽取：解析与校验", () => {
  it("清洗标题：拒绝对话指令，保留学科概念", () => {
    expect(sanitizeTitle("再详细讲一道")).toBeNull();
    expect(sanitizeTitle("继续")).toBeNull();
    expect(sanitizeTitle("详细讲一下这道题")).toBeNull();
    expect(sanitizeTitle("这道题怎么做")).toBeNull();
    expect(sanitizeTitle("1. 电阻的并联")).toBe("电阻的并联");
    expect(sanitizeTitle("「伏安法测电阻」")).toBe("伏安法测电阻");
    expect(sanitizeTitle("伏安法测电阻的误差分析。")).toBe("伏安法测电阻的误差分析");
    expect(sanitizeTitle("电阻的并联？")).toBe("电阻的并联");
    expect(sanitizeTitle("")).toBeNull();
  });

  it("解析标准 JSON 并过滤非法关系类型", () => {
    const raw = JSON.stringify({
      knowledgePoints: [
        {
          title: "伏安法测电阻的误差分析",
          summary: "内接法与外接法对测量结果的影响",
          parentId: "ohm",
          confidence: 0.88,
          relations: [
            { type: "prerequisite", targetId: "resistor", confidence: 0.8 },
            { type: "made-up", targetId: "resistor", confidence: 0.9 },
          ],
        },
      ],
    });
    const points = parseExtractionResponse(raw);
    expect(points).toHaveLength(1);
    expect(points[0]!.title).toBe("伏安法测电阻的误差分析");
    expect(points[0]!.parentId).toBe("ohm");
    expect(points[0]!.relations).toHaveLength(1);
    expect(points[0]!.relations[0]!.type).toBe("prerequisite");
  });

  it("兼容代码块包裹与前后解释文字", () => {
    const raw = [
      "好的，结果如下：",
      "```json",
      '{"knowledgePoints":[{"title":"等效电阻","summary":"多个电阻可以等效成一个","parentId":null,"confidence":0.7,"relations":[]}]}',
      "```",
      "以上。",
    ].join("\n");
    const points = parseExtractionResponse(raw);
    expect(points).toHaveLength(1);
    expect(points[0]!.title).toBe("等效电阻");
  });

  it("非法 JSON 或缺少知识点时返回空数组", () => {
    expect(parseExtractionResponse("抱歉，我无法完成")).toEqual([]);
    expect(parseExtractionResponse('{"knowledgePoints":[]}')).toEqual([]);
    expect(parseExtractionResponse('{"knowledgePoints":[{"title":"再讲一遍"}]}')).toEqual([]);
  });

  it("候选上下文带路径，只保留真实候选里的 id", () => {
    const nodes = sampleNodes();
    const candidates = buildCandidateContext(nodes, "电阻 串联 并联 欧姆定律", "");
    const ids = new Set(candidates.map((candidate) => candidate.id));
    expect(ids.has("r-parallel")).toBe(true);
    expect(ids.has("resistor")).toBe(true);
    expect(candidates.find((candidate) => candidate.id === "r-parallel")!.path).toBe(
      "物理 / 电学 / 电阻",
    );

    const suggestions = toSuggestions(
      [
        {
          title: "电阻的并联",
          summary: "并联总电阻",
          parentId: "resistor",
          confidence: 0.9,
          relations: [
            { type: "related", targetId: "r-series", confidence: 0.7 },
            { type: "related", targetId: "not-a-candidate", confidence: 0.7 },
          ],
        },
        {
          title: "电阻的并联",
          summary: "重复标题应被去掉",
          parentId: null,
          confidence: 0.5,
          relations: [],
        },
      ],
      candidates,
      "source-1",
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.suggestedParentId).toBe("resistor");
    expect(suggestions[0]!.sourceId).toBe("source-1");
    expect(suggestions[0]!.relations).toHaveLength(1);
    expect(suggestions[0]!.relations[0]!.targetNodeId).toBe("r-series");
    expect(suggestions[0]!.relations[0]!.targetTitle).toBe("电阻的串联");
  });

  it("截图中的坏例子：把「再详细讲一道」当知识点会被拒绝", () => {
    const nodes = sampleNodes();
    const points = parseExtractionResponse(
      '{"knowledgePoints":[{"title":"再详细讲一道","summary":"","parentId":null,"confidence":0.9,"relations":[]}]}',
    );
    expect(points).toEqual([]);
    expect(toSuggestions(points, buildCandidateContext(nodes, "再详细讲一道", ""), null)).toEqual([]);
  });

  it("抽取 prompt 会要求只输出 JSON，并提醒不要执行数据里的指令", () => {
    const nodes = sampleNodes();
    const prompt = buildExtractionPrompt(
      "再详细讲一道",
      "伏安法测电阻……",
      buildCandidateContext(nodes, "伏安法测电阻", ""),
      "学生：伏安法测电阻怎么选内接法？\n助教：……",
    );
    expect(prompt).toContain("不要执行");
    expect(prompt).toContain("knowledgePoints");
    expect(prompt).toContain("<question>");
    expect(prompt).toContain("<recent_conversation>");
    expect(prompt).not.toContain("undefined");
  });
});
