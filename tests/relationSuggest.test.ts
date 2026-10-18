import { describe, expect, it } from "vitest";
import {
  buildRelationCandidates,
  parseRelationSuggestions,
  sharedSourceSuggestions,
} from "@/lib/ai/relationSuggest";
import { makeRelation } from "@/lib/relations";
import type { NodeSource } from "@/types";
import { sampleNodes } from "./helpers";

const nodes = sampleNodes();
const currentNode = nodes.find((node) => node.id === "r-parallel")!;

describe("关系建议：候选、解析与同源启发式", () => {
  it("候选节点排除自己和已有关联", () => {
    const relations = [
      makeRelation({ id: "rel-1", fromId: "r-parallel", toId: "resistor", type: "prerequisite" }),
    ];
    const candidates = buildRelationCandidates(currentNode, nodes, relations);
    const ids = candidates.map((candidate) => candidate.id);
    expect(ids).not.toContain("r-parallel");
    expect(ids).not.toContain("resistor");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.path.length).toBeGreaterThan(0);
  });

  it("解析合法 JSON 并校验候选 id / 类型 / 重复", () => {
    const relations: ReturnType<typeof makeRelation>[] = [];
    const candidates = buildRelationCandidates(currentNode, nodes, relations);
    const validTarget = candidates[0]!.id;
    const raw = JSON.stringify({
      relations: [
        { targetId: validTarget, type: "related", confidence: 0.8, reason: "同属电阻" },
        { targetId: "not-a-node", type: "related", confidence: 0.9, reason: "坏 id" },
        { targetId: validTarget, type: "made-up", confidence: 0.9, reason: "坏类型" },
      ],
    });
    const suggestions = parseRelationSuggestions(raw, candidates, relations, currentNode.id);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.targetId).toBe(validTarget);
    expect(suggestions[0]!.source).toBe("ai");
  });

  it("已经存在同类关系时不再建议", () => {
    const relations = [
      makeRelation({ id: "rel-1", fromId: "r-parallel", toId: "r-series", type: "contrast" }),
    ];
    const candidates = [{ id: "r-series", title: "电阻的串联", path: "物理 / 电学 / 电阻" }];
    const raw = JSON.stringify({
      relations: [{ targetId: "r-series", type: "contrast", confidence: 0.9, reason: "易混" }],
    });
    expect(parseRelationSuggestions(raw, candidates, relations, "r-parallel")).toEqual([]);
  });

  it("非法 JSON 返回空数组", () => {
    expect(parseRelationSuggestions("sorry", [], [], "r-parallel")).toEqual([]);
    expect(parseRelationSuggestions('{"relations":[]}', [], [], "r-parallel")).toEqual([]);
  });

  it("共享来源的知识点会建议同源关系", () => {
    const nodeSources: NodeSource[] = [
      { nodeId: "r-parallel", sourceId: "s1" },
      { nodeId: "r-equivalent", sourceId: "s1" },
      { nodeId: "r-series", sourceId: "s2" },
    ];
    const suggestions = sharedSourceSuggestions(currentNode, nodes, [], nodeSources);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.targetId).toBe("r-equivalent");
    expect(suggestions[0]!.type).toBe("source");
    expect(suggestions[0]!.source).toBe("source");
  });

  it("已经存在同源关系时不重复建议", () => {
    const nodeSources: NodeSource[] = [
      { nodeId: "r-parallel", sourceId: "s1" },
      { nodeId: "r-equivalent", sourceId: "s1" },
    ];
    const relations = [
      makeRelation({ id: "rel-1", fromId: "r-parallel", toId: "r-equivalent", type: "source" }),
    ];
    expect(sharedSourceSuggestions(currentNode, nodes, relations, nodeSources)).toEqual([]);
  });
});
