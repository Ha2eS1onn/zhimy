import { describe, expect, it } from "vitest";
import {
  MAX_PATH_SEGMENTS,
  blockedSubtree,
  buildPath,
  findChildByTitle,
  getDepth,
  isSelfOrDescendant,
  parsePathInput,
  pathLabel,
  reparentError,
  validatePathSegments,
} from "@/lib/path";
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

  it("reparentError 允许挂到顶层或其它分支", () => {
    expect(reparentError(nodes, "r-parallel", null)).toBeNull();
    expect(reparentError(nodes, "r-parallel", "chem")).toBeNull();
  });

  it("reparentError 拒绝挂到自己或自己的子节点下", () => {
    expect(reparentError(nodes, "resistor", "resistor")).toMatch(/自己/);
    expect(reparentError(nodes, "resistor", "r-parallel")).toMatch(/子节点/);
  });

  it("reparentError 拒绝不存在的父级", () => {
    expect(reparentError(nodes, "r-parallel", "missing")).toMatch(/不存在/);
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

describe("新建父级路径：输入解析与校验", () => {
  it("支持中英文斜杠、箭头、顿号与反斜杠", () => {
    expect(parsePathInput("物理 / 电学")).toEqual(["物理", "电学"]);
    expect(parsePathInput("物理／电学>电路→基础")).toEqual(["物理", "电学", "电路", "基础"]);
    expect(parsePathInput("、物理、 电学 、")).toEqual(["物理", "电学"]);
    expect(parsePathInput("物理 / / 电学")).toEqual(["物理", "电学"]);
  });

  it("空输入与纯分隔符返回空数组", () => {
    expect(parsePathInput("")).toEqual([]);
    expect(parsePathInput(" / ／ 、 ")).toEqual([]);
  });

  it("校验层级数量与每级长度", () => {
    expect(validatePathSegments([])).toContain("至少一级");
    expect(validatePathSegments(["物理"])).toBeNull();
    expect(validatePathSegments(Array.from({ length: MAX_PATH_SEGMENTS + 1 }, () => "x"))).toContain(
      "最多",
    );
    expect(validatePathSegments(["x".repeat(25)])).toContain("不能超过");
  });
});

describe("新建父级路径：同父级复用与阻断子树", () => {
  const nodes = sampleNodes();

  it("同父级下按标题命中（大小写不敏感）", () => {
    expect(findChildByTitle(nodes, null, "物理")?.id).toBe("phys");
    const custom = [makeNode("alg", null, "Algebra"), makeNode("alg2", "alg", "Linear Algebra")];
    expect(findChildByTitle(custom, null, "algebra")?.id).toBe("alg");
    expect(findChildByTitle(custom, "alg", "linear algebra")?.id).toBe("alg2");
  });

  it("不同父级下的同名节点不会误命中", () => {
    // 「电阻的并联」挂在电阻下，直接找物理的下一级不应命中它
    expect(findChildByTitle(nodes, "phys", "电阻的并联")).toBeUndefined();
    expect(findChildByTitle(nodes, "resistor", "电阻的并联")?.id).toBe("r-parallel");
  });

  it("blockedSubtree 覆盖自身与全部后代", () => {
    const blocked = blockedSubtree(nodes, "resistor");
    expect(blocked.has("resistor")).toBe(true);
    expect(blocked.has("r-series")).toBe(true);
    expect(blocked.has("r-parallel")).toBe(true);
    expect(blocked.has("r-equivalent")).toBe(true);
    expect(blocked.has("ohm")).toBe(false);
    expect(blockedSubtree(nodes, null).size).toBe(0);
  });
});
