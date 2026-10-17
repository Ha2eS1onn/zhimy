import { describe, expect, it } from "vitest";
import { buildPath, getDepth, isSelfOrDescendant, pathLabel } from "@/lib/path";
import { makeNode, sampleNodes } from "./helpers";

describe("路径：id 是身份，path 由父链拼装", () => {
  const nodes = sampleNodes();

  it("按顶层 → 叶子的顺序返回路径", () => {
    const path = buildPath(nodes, "r-parallel");
    expect(path.map((node) => node.title)).toEqual(["物理", "电学", "电阻", "电阻的并联"]);
  });

  it("pathLabel 用 / 分隔", () => {
    expect(pathLabel(nodes, "r-parallel")).toBe("物理 / 电学 / 电阻 / 电阻的并联");
  });

  it("深度按父链计算", () => {
    expect(getDepth(nodes, "phys")).toBe(1);
    expect(getDepth(nodes, "r-parallel")).toBe(4);
    expect(getDepth(nodes, "missing")).toBe(0);
  });

  it("换父节点后路径自动变化（不依赖存储的 path 字段）", () => {
    const moved = nodes.map((node) =>
      node.id === "r-parallel" ? { ...node, parentId: "ohm" } : node,
    );
    expect(pathLabel(moved, "r-parallel")).toBe("物理 / 电学 / 欧姆定律 / 电阻的并联");
  });

  it("isSelfOrDescendant 能识别祖先关系", () => {
    expect(isSelfOrDescendant(nodes, "phys", "r-parallel")).toBe(true);
    expect(isSelfOrDescendant(nodes, "chem", "r-parallel")).toBe(false);
  });

  it("父链断裂时不进入死循环", () => {
    const cyclic = [
      makeNode("a", "b", "A"),
      makeNode("b", "a", "B"),
    ];
    const path = buildPath(cyclic, "a");
    expect(path.length).toBeLessThanOrEqual(64);
  });
});
