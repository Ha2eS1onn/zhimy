import { describe, expect, it } from "vitest";
import {
  HIT_THRESHOLD,
  bigrams,
  normalizeText,
  resolveQuestion,
  searchNodes,
  textScore,
} from "@/lib/search";
import { sampleNodes } from "./helpers";

describe("命中判定与检索", () => {
  const nodes = sampleNodes();

  it("归一化会去掉标点、虚词与问句词", () => {
    expect(normalizeText("电阻的并联怎么算？")).toBe("电阻并联");
    expect(normalizeText("什么是欧姆定律")).toBe("欧姆定律");
  });

  it("标题包含 + 别名能让自然问法命中", () => {
    const result = resolveQuestion(nodes, "电阻并联怎么算？");
    expect(result.nodeId).toBe("r-parallel");
    expect(result.score).toBeGreaterThanOrEqual(HIT_THRESHOLD);
  });

  it("完全不相干的问题不命中", () => {
    const result = resolveQuestion(nodes, "今天天气怎么样");
    expect(result.nodeId).toBeNull();
  });

  it("命中阈值以下的相似度不算命中", () => {
    const score = textScore("凸透镜成像规律", "电阻的并联");
    expect(score).toBeLessThan(HIT_THRESHOLD);
  });

  it("searchNodes 返回按分数排序的候选", () => {
    const hits = searchNodes(nodes, "电阻");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[hits.length - 1]!.score);
  });

  it("bigrams 对单字与空串安全", () => {
    expect(bigrams("").size).toBe(0);
    expect(bigrams("电").size).toBe(1);
    expect(bigrams("电阻").size).toBe(1);
  });
});
