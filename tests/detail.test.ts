import { describe, expect, it } from "vitest";
import {
  buildDetailPrompt,
  buildTemplateDetail,
  parseDetailResponse,
  type DetailInput,
} from "@/lib/ai/detail";
import { makeNode, sampleNodes } from "./helpers";

function detailInput(): DetailInput {
  const nodes = sampleNodes();
  const node = nodes.find((item) => item.id === "r-parallel")!;
  const relations = nodes
    .filter((item) => item.id === "r-series" || item.id === "ohm")
    .map((item) => ({ type: "related" as const, targetTitle: item.title }));
  return {
    node,
    path: "物理 / 电学 / 电阻 / 电阻的并联",
    relations,
    childTitles: [],
    sources: [{ question: "电阻并联怎么算？", answer: "用 1/R = 1/R1 + 1/R2 求等效电阻。" }],
  };
}

describe("详情页 AI 讲解生成", () => {
  it("prompt 包含知识点、来源与结构要求", () => {
    const prompt = buildDetailPrompt(detailInput());
    expect(prompt).toContain("电阻的并联");
    expect(prompt).toContain("## 一句话理解");
    expect(prompt).toContain("不要编造");
    expect(prompt).toContain("电阻并联怎么算");
  });

  it("演示模板包含固定小节且能反映关系与来源", () => {
    const template = buildTemplateDetail(detailInput());
    for (const section of ["一句话理解", "核心概念", "关键要点", "易错点", "与其他知识点的关系"]) {
      expect(template).toContain(section);
    }
    expect(template).toContain("电阻的串联");
    expect(template).toContain("电阻并联怎么算");
  });

  it("没有来源时模板给出待补充", () => {
    const input = detailInput();
    const template = buildTemplateDetail({ ...input, sources: [] });
    expect(template).toContain("待补充");
  });

  it("解析模型输出时去掉代码块包裹与前后解释", () => {
    const raw = [
      "好的，下面是讲解：",
      "```markdown",
      "## 一句话理解",
      "并联总电阻比支路都小。",
      "```",
    ].join("\n");
    const parsed = parseDetailResponse(raw);
    expect(parsed.startsWith("## 一句话理解")).toBe(true);
    expect(parsed).not.toContain("```");
  });

  it("空输出返回空串（由调用方决定是否报错）", () => {
    expect(parseDetailResponse("")).toBe("");
    expect(parseDetailResponse("   ")).toBe("");
  });

  it("孤立节点也能生成模板", () => {
    const node = makeNode("solo", null, "浮力", { detail: "" });
    const template = buildTemplateDetail({
      node,
      path: "物理 / 力学 / 压强与浮力 / 浮力",
      relations: [],
      childTitles: [],
      sources: [],
    });
    expect(template).toContain("浮力");
    expect(template).toContain("暂无关系");
  });
});
