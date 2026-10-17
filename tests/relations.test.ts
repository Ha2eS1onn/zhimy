import { describe, expect, it } from "vitest";
import {
  dedupeRelations,
  makeRelation,
  neighborIds,
  normalizePair,
  relationKey,
  relationsOf,
} from "@/lib/relations";

const make = (id: string, fromId: string, toId: string, type: Parameters<typeof makeRelation>[0]["type"]) =>
  makeRelation({ id, fromId, toId, type, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z" });

describe("关系规范化与去重", () => {
  it("无向类型按 id 字典序规范化", () => {
    expect(normalizePair("related", "b", "a")).toEqual({ fromId: "a", toId: "b" });
    expect(normalizePair("contrast", "a", "b")).toEqual({ fromId: "a", toId: "b" });
  });

  it("有向类型不改方向", () => {
    expect(normalizePair("prerequisite", "b", "a")).toEqual({ fromId: "b", toId: "a" });
  });

  it("同一对无向关系的两个方向得到同一个 key", () => {
    expect(relationKey("related", "a", "b")).toBe(relationKey("related", "b", "a"));
    expect(relationKey("prerequisite", "a", "b")).not.toBe(relationKey("prerequisite", "b", "a"));
  });

  it("makeRelation 会规范化无向关系", () => {
    const relation = make("r1", "b", "a", "related");
    expect(relation.fromId).toBe("a");
    expect(relation.toId).toBe("b");
  });

  it("dedupeRelations 去掉重复关系", () => {
    const duplicated = [make("r1", "a", "b", "related"), make("r2", "b", "a", "related")];
    expect(dedupeRelations(duplicated)).toHaveLength(1);
  });

  it("relationsOf / neighborIds 返回 1 跳邻域", () => {
    const relations = [
      make("r1", "a", "b", "related"),
      make("r2", "a", "c", "prerequisite"),
      make("r3", "b", "c", "contrast"),
    ];
    expect(relationsOf(relations, "a")).toHaveLength(2);
    expect(neighborIds(relations, "a").sort()).toEqual(["b", "c"]);
  });
});
