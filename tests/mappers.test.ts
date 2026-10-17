import { describe, expect, it } from "vitest";
import {
  messageFromRow,
  messageToRow,
  nodeFromRow,
  nodeToRow,
  relationFromRow,
  relationToRow,
  type NodeRow,
} from "@/lib/repo/mappers";

describe("数据库行 ↔ 领域对象映射", () => {
  it("node 往返一致", () => {
    const node = {
      id: "n1",
      parentId: null,
      title: "物理",
      summary: "学科",
      status: "active" as const,
      aliases: ["物理学科"],
      mastery: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const row = nodeToRow("user-1", node);
    expect(row.user_id).toBe("user-1");
    expect(row.parent_id).toBeNull();
    expect(nodeFromRow(row)).toEqual(node);
  });

  it("数据库里 status/aliases 为空时给出安全默认值", () => {
    const row: NodeRow = {
      id: "n1",
      user_id: "u1",
      parent_id: null,
      title: "T",
      summary: "",
      status: "weird",
      aliases: null,
      mastery: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const node = nodeFromRow(row);
    expect(node.status).toBe("active");
    expect(node.aliases).toEqual([]);
  });

  it("relation 往返一致", () => {
    const relation = {
      id: "r1",
      fromId: "a",
      toId: "b",
      type: "related" as const,
      confidence: 0.8,
      origin: "seed" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(relationFromRow(relationToRow("u1", relation))).toEqual(relation);
  });

  it("message payload 往返一致", () => {
    const message = {
      id: "m1",
      role: "assistant" as const,
      content: "答案",
      imageName: null,
      payload: {
        hit: { nodeId: "n1", score: 0.9 },
        suggestions: [],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(messageFromRow(messageToRow("u1", message))).toEqual(message);
  });
});
