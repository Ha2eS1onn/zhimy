import { describe, expect, it } from "vitest";
import { buildCandidateContext, buildCandidateContextAsync } from "@/lib/ai/extract";
import {
  buildRelationCandidates,
  buildRelationCandidatesAsync,
} from "@/lib/ai/relationSuggest";
import { mergeVectorFirst, type SemanticSearch } from "@/lib/ai/semanticSearch";
import { makeRelation } from "@/lib/relations";
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

const nodes = sampleNodes();

describe("mergeVectorFirst", () => {
  it("向量候选在前，按 key 去重，关键词补齐，受上限约束", () => {
    const merged = mergeVectorFirst(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }, { id: "d" }],
      3,
      (item) => item.id,
    );
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("exclude 中的 key 被跳过，且不改动传入集合", () => {
    const exclude = new Set(["a"]);
    const merged = mergeVectorFirst(
      [{ id: "a" }, { id: "b" }],
      [{ id: "c" }],
      10,
      (item) => item.id,
      exclude,
    );
    expect(merged.map((item) => item.id)).toEqual(["b", "c"]);
    expect(exclude.has("a")).toBe(true);
    expect(exclude.has("b")).toBe(false);
  });

  it("limit 非正时返回空数组，两路都为空时也返回空", () => {
    expect(mergeVectorFirst([{ id: "a" }], [{ id: "b" }], 0, (item) => item.id)).toEqual([]);
    expect(
      mergeVectorFirst<{ id: string }>([], [], 5, (item) => item.id),
    ).toEqual([]);
  });
});

describe("buildCandidateContextAsync：向量候选带路径", () => {
  it("向量候选排在最前，路径/深度按父链生成，关键词候选补齐", async () => {
    const semantic = fakeSemantic({
      matchNodes: async () => [vectorMatch("molecule", 0.9), vectorMatch("ghost-node", 0.99)],
    });
    const candidates = await buildCandidateContextAsync(nodes, "电阻 欧姆定律", "", semantic, 6);
    expect(candidates[0]).toMatchObject({
      id: "molecule",
      title: "分子与原子",
      path: "化学 / 物质的构成",
      depth: 3,
    });
    const ids = candidates.map((candidate) => candidate.id);
    expect(ids).toContain("resistor");
    expect(ids).not.toContain("ghost-node");
    expect(ids.length).toBeLessThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("向量查询文本 = 问题 + 解答前段（截断 1000）", async () => {
    let seen = "";
    const semantic = fakeSemantic({
      embedQuery: async (text) => {
        seen = text;
        return [0];
      },
      matchNodes: async () => [],
    });
    const longAnswer = "甲".repeat(1200);
    await buildCandidateContextAsync(nodes, "电阻并联怎么算", longAnswer, semantic);
    expect(seen.startsWith("电阻并联怎么算\n")).toBe(true);
    expect(seen.length).toBeLessThanOrEqual(1000);
    expect(seen).toContain("甲".repeat(100));
  });

  it("语义抛错时回退到同步 buildCandidateContext", async () => {
    const semantic = fakeSemantic({
      embedQuery: async () => {
        throw new Error("embedding 服务不可用");
      },
    });
    const actual = await buildCandidateContextAsync(nodes, "电阻 串联", "并联电阻", semantic);
    expect(actual).toEqual(buildCandidateContext(nodes, "电阻 串联", "并联电阻"));
  });

  it("未传 semantic 时与同步版本完全一致", async () => {
    const actual = await buildCandidateContextAsync(nodes, "电阻 串联", "并联电阻", null);
    expect(actual).toEqual(buildCandidateContext(nodes, "电阻 串联", "并联电阻"));
  });
});

describe("buildRelationCandidatesAsync：排除自身与已连接节点", () => {
  const currentNode = nodes.find((node) => node.id === "r-parallel")!;
  const relations = [
    makeRelation({
      id: "rel-1",
      fromId: "r-parallel",
      toId: "resistor",
      type: "prerequisite",
    }),
  ];

  it("向量候选带路径排前，自身/已连接/未知 id 被排除，关键词补齐", async () => {
    const semantic = fakeSemantic({
      matchNodes: async () => [
        vectorMatch("r-parallel", 0.95),
        vectorMatch("resistor", 0.92),
        vectorMatch("ohm", 0.88),
        vectorMatch("ghost-node", 0.99),
      ],
    });
    const candidates = await buildRelationCandidatesAsync(
      currentNode,
      nodes,
      relations,
      semantic,
      8,
    );
    const ids = candidates.map((candidate) => candidate.id);
    expect(ids[0]).toBe("ohm");
    expect(candidates[0]).toMatchObject({ title: "欧姆定律", path: "物理 / 电学" });
    expect(ids).not.toContain("r-parallel");
    expect(ids).not.toContain("resistor");
    expect(ids).not.toContain("ghost-node");
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.length).toBeLessThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("向量查询文本包含标题、摘要与直接子节点标题", async () => {
    let seen = "";
    const semantic = fakeSemantic({
      embedQuery: async (text) => {
        seen = text;
        return [0];
      },
      matchNodes: async () => [],
    });
    const resistor = nodes.find((node) => node.id === "resistor")!;
    await buildRelationCandidatesAsync(resistor, nodes, [], semantic);
    expect(seen).toContain(resistor.title);
    expect(seen).toContain(resistor.summary);
    expect(seen).toContain("电阻的串联");
    expect(seen.length).toBeLessThanOrEqual(1000);
  });

  it("语义抛错时回退到同步 buildRelationCandidates", async () => {
    const semantic = fakeSemantic({
      embedQuery: async () => {
        throw new Error("embedding 服务不可用");
      },
    });
    const actual = await buildRelationCandidatesAsync(
      currentNode,
      nodes,
      relations,
      semantic,
    );
    expect(actual).toEqual(buildRelationCandidates(currentNode, nodes, relations));
  });
});
