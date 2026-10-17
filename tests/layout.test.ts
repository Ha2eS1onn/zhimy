import { describe, expect, it } from "vitest";
import { computeLayout } from "@/lib/layout/layout";
import {
  CONE_HALF_ANGLE,
  LAYER_DISTANCE,
  SUBJECT_RADIUS,
} from "@/lib/layout/constants";
import { dot, length, normalize, sub } from "@/lib/math3";
import { makeNode, sampleNodes } from "./helpers";

describe("computeLayout（确定性分层球壳）", () => {
  const nodes = sampleNodes();
  const layout = computeLayout(nodes);

  it("同一份数据两次布局完全一致（不依赖随机数）", () => {
    const first = computeLayout(nodes);
    const second = computeLayout(nodes);
    expect(JSON.stringify(first.nodes.map((n) => n.position))).toBe(
      JSON.stringify(second.nodes.map((n) => n.position)),
    );
  });

  it("学科位于半径 70 的球面上", () => {
    const subjects = layout.nodes.filter((node) => node.depth === 1);
    expect(subjects).toHaveLength(2);
    for (const subject of subjects) {
      expect(length(subject.position)).toBeCloseTo(SUBJECT_RADIUS, 6);
    }
  });

  it("子节点与父节点的距离等于对应层距", () => {
    for (const node of layout.nodes) {
      if (!node.parentId) continue;
      const parent = layout.byId.get(node.parentId)!;
      const distance = length(sub(parent.position, node.position));
      expect(distance).toBeCloseTo(LAYER_DISTANCE[Math.min(node.depth, 5)]!, 6);
    }
  });

  it("子节点落在父方向锥面上（32°，宽兄弟时 42°）", () => {
    for (const node of layout.nodes) {
      if (!node.parentId) continue;
      const parent = layout.byId.get(node.parentId)!;
      const direction = normalize(sub(node.position, parent.position));
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(parent.axis, direction))));
      expect(angle).toBeCloseTo(CONE_HALF_ANGLE, 6);
    }
  });

  it("兄弟节点位置互不相同且没有 NaN", () => {
    const byParent = new Map<string, string>();
    for (const node of layout.nodes) {
      const key = node.parentId ?? "root";
      const previous = byParent.get(key);
      const positionKey = `${node.position.x.toFixed(4)},${node.position.y.toFixed(4)},${node.position.z.toFixed(4)}`;
      if (previous) expect(previous).not.toBe(positionKey);
      byParent.set(key, positionKey);
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(Number.isFinite(node.position.z)).toBe(true);
    }
  });

  it("最大深度与数据一致", () => {
    expect(layout.maxDepth).toBe(4);
  });

  it("父节点缺失时不会崩溃，孤儿节点被放到顶层", () => {
    const broken = [...sampleNodes(), makeNode("orphan", "not-exist", "孤儿节点")];
    const brokenLayout = computeLayout(broken);
    expect(brokenLayout.byId.has("orphan")).toBe(true);
    expect(brokenLayout.byId.get("orphan")!.depth).toBe(1);
  });
});
