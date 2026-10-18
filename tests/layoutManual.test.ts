import { describe, expect, it } from "vitest";
import { computeLayout } from "@/lib/layout/layout";
import { LAYER_DISTANCE } from "@/lib/layout/constants";
import { length, sub } from "@/lib/math3";
import { makeNode, sampleNodes } from "./helpers";

describe("手动位置（拖拽）与自动布局", () => {
  it("手动位置覆盖自动位置", () => {
    const nodes = sampleNodes().map((node) =>
      node.id === "phys-elec"
        ? { ...node, manualPosition: { x: 10, y: 20, z: 30 } }
        : node,
    );
    const layout = computeLayout(nodes);
    const parent = layout.byId.get("phys")!;
    expect(layout.byId.get("phys-elec")!.position).toEqual({ x: 10, y: 20, z: 30 });
    // 子节点跟着父节点走：与父节点的距离仍等于层距。
    const child = layout.byId.get("resistor")!;
    expect(length(sub(child.position, { x: 10, y: 20, z: 30 }))).toBeCloseTo(
      LAYER_DISTANCE[3]!,
      6,
    );
    // 手动位置的节点，axis 由实际位置重新计算。
    expect(layout.byId.get("phys-elec")!.axis).not.toEqual(parent.axis);
  });

  it("拖动手动节点时子树整体跟随", () => {
    const base = computeLayout(sampleNodes());
    const moved = computeLayout(
      sampleNodes().map((node) =>
        node.id === "resistor" ? { ...node, manualPosition: { x: 0, y: 0, z: 0 } } : node,
      ),
    );
    expect(moved.byId.get("resistor")!.position).toEqual({ x: 0, y: 0, z: 0 });

    const childBase = base.byId.get("r-parallel")!.position;
    const parentBase = base.byId.get("resistor")!.position;
    const childMoved = moved.byId.get("r-parallel")!.position;
    const parentMoved = moved.byId.get("resistor")!.position;

    // 节点位置变了，但它与父节点的距离仍等于层距（子树整体跟随）。
    expect(childMoved).not.toEqual(childBase);
    expect(length(sub(childMoved, parentMoved))).toBeCloseTo(LAYER_DISTANCE[4]!, 6);
    // 移动前的自动布局同样保持层距。
    expect(length(sub(childBase, parentBase))).toBeCloseTo(LAYER_DISTANCE[4]!, 6);
  });

  it("手动定位的子节点保持绝对位置，不随父节点移动", () => {
    const layout = computeLayout([
      ...sampleNodes().map((node) =>
        node.parentId === "resistor" && node.id === "r-parallel"
          ? { ...node, manualPosition: { x: 5, y: 5, z: 5 } }
          : node,
      ),
    ]);
    expect(layout.byId.get("r-parallel")!.position).toEqual({ x: 5, y: 5, z: 5 });
  });

  it("没有手动位置时与原有确定性格局完全一致", () => {
    const a = computeLayout(sampleNodes());
    const b = computeLayout(sampleNodes());
    expect(JSON.stringify(a.nodes.map((node) => node.position))).toBe(
      JSON.stringify(b.nodes.map((node) => node.position)),
    );
  });

  it("手动位置同样适用于顶层学科节点", () => {
    const nodes = sampleNodes().map((node) =>
      node.id === "phys" ? { ...node, manualPosition: { x: -40, y: 0, z: 10 } } : node,
    );
    const layout = computeLayout(nodes);
    expect(layout.byId.get("phys")!.position).toEqual({ x: -40, y: 0, z: 10 });
  });

  it("手动位置是有限数字以外的值会被当作不存在（由 mapper 处理，这里兜底）", () => {
    const node = makeNode("solo", null, "单独节点", { manualPosition: null });
    const layout = computeLayout([node]);
    expect(layout.byId.get("solo")!.position).not.toEqual({ x: 0, y: 0, z: 0 });
  });
});
