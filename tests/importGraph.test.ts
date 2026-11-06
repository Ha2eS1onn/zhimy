import { describe, expect, it } from "vitest";
import type { GraphData } from "@/types";
import { ImportError, parseGraphJson } from "@/lib/importGraph";
import { makeNode } from "./helpers";

const emptyGraph: GraphData = { nodes: [], relations: [], sources: [], nodeSources: [] };
const STAMP = "2026-11-06T00:00:00.000Z";

function backup(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: "zhimy",
    version: 1,
    exportedAt: STAMP,
    nodes: [],
    relations: [],
    sources: [],
    nodeSources: [],
    ...overrides,
  });
}

function nodeDef(id: string, parentId: string | null, title: string, extra = {}) {
  return {
    id,
    parentId,
    title,
    summary: "",
    detail: "",
    manualPosition: null,
    status: "active",
    aliases: [],
    mastery: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

describe("parseGraphJson", () => {
  it("解析 v1 备份并保留节点/来源，关系重新生成 id", () => {
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("n1", null, "物理"), nodeDef("n2", "n1", "电学")],
        relations: [
          {
            id: "r1",
            fromId: "n1",
            toId: "n2",
            type: "prerequisite",
            confidence: 0.9,
            origin: "user",
            createdAt: STAMP,
          },
        ],
        sources: [
          { id: "s1", kind: "chat", question: "q", answer: "a", imagePath: null, createdAt: STAMP },
        ],
        nodeSources: [{ nodeId: "n2", sourceId: "s1" }],
      }),
      emptyGraph,
    );

    const ids = plan.nodes.map((node) => node.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe("n1");
    expect(plan.relations).toHaveLength(1);
    expect(plan.relations[0]).toMatchObject({
      fromId: ids[0],
      toId: ids[1],
      type: "prerequisite",
    });
    expect(plan.relations[0].id).not.toBe("r1");
    expect(plan.sources[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.nodeSources).toEqual([{ nodeId: ids[1], sourceId: plan.sources[0].id }]);
    expect(plan.stats).toMatchObject({ nodes: 2, relations: 1, sources: 1, reused: 0 });
  });

  it("拒绝非法 JSON、非知脉文件和未知版本", () => {
    expect(() => parseGraphJson("not json", emptyGraph)).toThrow(ImportError);
    expect(() => parseGraphJson(JSON.stringify({ app: "other" }), emptyGraph)).toThrow(
      "不是知脉导出的备份文件",
    );
    expect(() => parseGraphJson(JSON.stringify({ app: "zhimy", version: 2 }), emptyGraph)).toThrow(
      "仅支持 v1 备份文件",
    );
  });

  it("节点 id 已存在时复用，不覆盖现有内容", () => {
    const existing: GraphData = {
      ...emptyGraph,
      nodes: [makeNode("n1", null, "旧标题")],
    };
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("n1", null, "新标题")],
        relations: [{ fromId: "n1", toId: "n1", type: "related" }],
      }),
      existing,
    );
    expect(plan.nodes).toHaveLength(0);
    expect(plan.stats.reused).toBe(1);
  });

  it("同父级同名（大小写不同）复用现有节点，关系映射到旧 id", () => {
    const existing: GraphData = {
      ...emptyGraph,
      nodes: [makeNode("old", null, "物理"), makeNode("child", "old", "电学")],
    };
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("new-phys", null, "物理"), nodeDef("new-child", "new-phys", "电学")],
        relations: [{ fromId: "new-phys", toId: "new-child", type: "prerequisite" }],
      }),
      existing,
    );
    // 两个节点都复用了已有节点，关系落到 old → child。
    expect(plan.nodes).toHaveLength(0);
    expect(plan.stats.reused).toBe(2);
    expect(plan.relations).toHaveLength(1);
    expect(plan.relations[0]).toMatchObject({ fromId: "old", toId: "child" });
  });

  it("备份内部同父级同名只插入第一个，后续映射复用", () => {
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("a", null, "物理"), nodeDef("b", null, "物理")],
        relations: [{ fromId: "b", toId: "a", type: "related" }],
      }),
      emptyGraph,
    );
    expect(plan.nodes).toHaveLength(1);
    expect(plan.stats.reused).toBe(1);
    // b 被映射回 a，自环关系应被丢弃。
    expect(plan.relations).toHaveLength(0);
  });

  it("子节点排在父节点之前时仍能正确挂载", () => {
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("child", "parent", "电学"), nodeDef("parent", null, "物理")],
      }),
      emptyGraph,
    );
    const parent = plan.nodes.find((node) => node.title === "物理");
    const child = plan.nodes.find((node) => node.title === "电学");
    expect(parent?.parentId).toBeNull();
    expect(child?.parentId).toBe(parent?.id);
  });

  it("父级缺失时提升为顶层并记录 orphans", () => {
    const plan = parseGraphJson(
      backup({ nodes: [nodeDef("n1", "missing-parent", "浮力")] }),
      emptyGraph,
    );
    expect(plan.nodes[0].parentId).toBeNull();
    expect(plan.stats.orphans).toBe(1);
  });

  it("关系两端不存在或自环时丢弃", () => {
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("n1", null, "物理")],
        relations: [
          { fromId: "n1", toId: "missing", type: "related" },
          { fromId: "n1", toId: "n1", type: "related" },
          { fromId: "n1", toId: "n1", type: "contrast" },
        ],
      }),
      emptyGraph,
    );
    expect(plan.relations).toHaveLength(0);
  });

  it("来源 id 已存在时复用，并保留 nodeSource 关联", () => {
    const existing: GraphData = {
      ...emptyGraph,
      nodes: [makeNode("n1", null, "物理")],
      sources: [
        {
          id: "s1",
          kind: "chat",
          question: "旧问题",
          answer: "旧答案",
          imagePath: null,
          createdAt: STAMP,
        },
      ],
    };
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("n2", null, "电学")],
        sources: [
          { id: "s1", kind: "chat", question: "新问题", answer: "新答案", imagePath: null, createdAt: STAMP },
        ],
        nodeSources: [{ nodeId: "n2", sourceId: "s1" }],
      }),
      existing,
    );
    expect(plan.sources).toHaveLength(0);
    expect(plan.nodeSources).toEqual([{ nodeId: plan.nodes[0].id, sourceId: "s1" }]);
  });

  it("脏字段回落到安全默认值", () => {
    const plan = parseGraphJson(
      backup({
        nodes: [
          nodeDef("n1", null, "物理", {
            status: "weird",
            aliases: "not-array",
            mastery: 2,
            manualPosition: { x: "bad", y: 1, z: 2 },
          }),
        ],
      }),
      emptyGraph,
    );
    expect(plan.nodes[0]).toMatchObject({
      status: "active",
      aliases: [],
      mastery: 1,
      manualPosition: null,
    });
  });

  it("无向关系按 id 字典序规范化，重复关系去重", () => {
    const plan = parseGraphJson(
      backup({
        nodes: [nodeDef("a", null, "A"), nodeDef("b", null, "B")],
        relations: [
          { fromId: "b", toId: "a", type: "related" },
          { fromId: "a", toId: "b", type: "related" },
        ],
      }),
      emptyGraph,
    );
    const ids = plan.nodes.map((node) => node.id).sort();
    expect(plan.relations).toHaveLength(1);
    expect(plan.relations[0].fromId).toBe(ids[0]);
    expect(plan.relations[0].toId).toBe(ids[1]);
  });
});
