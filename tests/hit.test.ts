import { describe, expect, it } from "vitest";
import { resolveHit } from "@/lib/ai/hit";
import type { SemanticSearch } from "@/lib/ai/semanticSearch";
import type { VectorMatch } from "@/types";
import { sampleNodes } from "./helpers";

function vectorMatch(nodeId: string, similarity: number): VectorMatch {
  return { nodeId, title: nodeId, summary: "", similarity };
}

function fakeSemantic(overrides: {
  embedQuery?: SemanticSearch["embedQuery"];
  matchNodes?: SemanticSearch["matchNodes"];
} = {}): SemanticSearch {
  return {
    configured: true,
    embedQuery: overrides.embedQuery ?? (async () => [0.1, 0.2, 0.3]),
    matchNodes: overrides.matchNodes ?? (async () => []),
  };
}

function namedError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

const nodes = sampleNodes();

describe("resolveHit：向量优先 + 关键词兜底", () => {
  it("向量命中（≥0.78）时返回 source:vector 与相似度", async () => {
    const semantic = fakeSemantic({
      matchNodes: async () => [
        vectorMatch("r-parallel", 0.9),
        vectorMatch("resistor", 0.8),
      ],
    });
    const result = await resolveHit({
      nodes,
      question: "并联电路的总电阻怎么求",
      semantic,
    });
    expect(result).toEqual({ nodeId: "r-parallel", score: 0.9, source: "vector" });
  });

  it("低于阈值不算命中，回退关键词且不标记 fallback", async () => {
    const semantic = fakeSemantic({
      matchNodes: async () => [vectorMatch("r-parallel", 0.77)],
    });
    const result = await resolveHit({ nodes, question: "电阻并联怎么算？", semantic });
    expect(result.source).toBe("keyword");
    expect(result.nodeId).toBe("r-parallel");
    expect(result.fallback).toBeUndefined();
  });

  it("embedQuery 抛错时降级关键词并标记 fallback:error", async () => {
    const semantic = fakeSemantic({
      embedQuery: async () => {
        throw new Error("网络错误");
      },
    });
    const result = await resolveHit({ nodes, question: "电阻并联怎么算？", semantic });
    expect(result).toMatchObject({
      nodeId: "r-parallel",
      source: "keyword",
      fallback: "error",
    });
  });

  it("TimeoutError / AbortError 归类为 fallback:timeout", async () => {
    for (const name of ["TimeoutError", "AbortError"]) {
      const semantic = fakeSemantic({
        embedQuery: async () => {
          throw namedError(name);
        },
      });
      const result = await resolveHit({ nodes, question: "电阻并联怎么算？", semantic });
      expect(result.nodeId).toBe("r-parallel");
      expect(result.source).toBe("keyword");
      expect(result.fallback).toBe("timeout");
    }
  });

  it("真实超时：AbortSignal.timeout 触发时降级关键词", async () => {
    const semantic = fakeSemantic({
      embedQuery: (_text, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    });
    const result = await resolveHit({
      nodes,
      question: "电阻并联怎么算？",
      semantic,
      timeoutMs: 20,
    });
    expect(result.nodeId).toBe("r-parallel");
    expect(result.source).toBe("keyword");
    expect(result.fallback).toBe("timeout");
  });

  it("未配置语义检索（null）时只用关键词，fallback 为空", async () => {
    const result = await resolveHit({ nodes, question: "电阻并联怎么算？", semantic: null });
    expect(result.nodeId).toBe("r-parallel");
    expect(result.source).toBe("keyword");
    expect(result.fallback).toBeUndefined();
  });

  it("向量返回的未知 id 会被忽略", async () => {
    const semantic = fakeSemantic({
      matchNodes: async () => [vectorMatch("ghost-node", 0.99), vectorMatch("r-parallel", 0.5)],
    });
    const result = await resolveHit({ nodes, question: "电阻并联怎么算？", semantic });
    expect(result.source).toBe("keyword");
    expect(result.nodeId).toBe("r-parallel");
  });

  it("空问题或空图谱直接返回未命中", async () => {
    let called = false;
    const semantic = fakeSemantic({
      embedQuery: async () => {
        called = true;
        return [0];
      },
    });
    expect(
      await resolveHit({ nodes: [], question: "电阻并联", semantic }),
    ).toEqual({ nodeId: null, score: 0, source: "keyword" });
    expect(await resolveHit({ nodes, question: "   ", semantic })).toEqual({
      nodeId: null,
      score: 0,
      source: "keyword",
    });
    expect(called).toBe(false);
  });

  it("两条链路都没命中时返回较高分备查", async () => {
    const semantic = fakeSemantic({
      matchNodes: async () => [vectorMatch("phys-mech", 0.5)],
    });
    const result = await resolveHit({ nodes, question: "今天天气怎么样", semantic });
    expect(result.nodeId).toBeNull();
    expect(result.source).toBe("keyword");
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.fallback).toBeUndefined();
  });
});
