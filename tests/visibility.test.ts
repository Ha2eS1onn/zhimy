import { describe, expect, it } from "vitest";
import { computeVisibility } from "@/lib/atlas/visibility";
import { computeLayout } from "@/lib/layout/layout";
import { sampleNodes } from "./helpers";

describe("密度与折叠（visibility）", () => {
  const layout = computeLayout(sampleNodes());

  it("概览档只显示到章（深度 ≤ 2）", () => {
    const { visibleIds, badges } = computeVisibility(layout, 2, new Set());
    expect(visibleIds.size).toBe(5);
    expect(visibleIds.has("phys")).toBe(true);
    expect(visibleIds.has("resistor")).toBe(false);
    expect(badges.get("resistor")).toBeUndefined();
    expect(badges.get("phys-elec")).toBe(2);
  });

  it("标准档显示到节（深度 ≤ 3），节点数接近 40 的量级", () => {
    const { visibleIds, badges } = computeVisibility(layout, 3, new Set());
    expect(visibleIds.has("resistor")).toBe(true);
    expect(visibleIds.has("r-parallel")).toBe(false);
    expect(badges.get("resistor")).toBe(3);
    expect(badges.get("ohm")).toBe(1);
  });

  it("展开的节点会渲染下一层，并减少对应的 +N", () => {
    const { visibleIds, badges } = computeVisibility(layout, 2, new Set(["phys-elec"]));
    expect(visibleIds.has("resistor")).toBe(true);
    expect(badges.get("phys-elec")).toBeUndefined();
    expect(badges.get("resistor")).toBe(3);
  });

  it("细节档显示全部节点", () => {
    const { visibleIds } = computeVisibility(layout, 5, new Set());
    expect(visibleIds.size).toBe(layout.nodes.length);
  });
});
