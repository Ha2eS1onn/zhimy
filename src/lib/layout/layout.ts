import type { KnowledgeNode } from "@/types";
import { add, cross, length, normalize, scale, sub, vec, type Vec3 } from "@/lib/math3";
import {
  CONE_HALF_ANGLE,
  CONE_HALF_ANGLE_WIDE,
  LAYER_DISTANCE,
  NODE_COLORS,
  NODE_RADIUS_BY_DEPTH,
  SUBJECT_RADIUS,
  WIDE_CONE_SIBLING_THRESHOLD,
} from "./constants";

export interface LayoutNode {
  id: string;
  parentId: string | null;
  depth: number;
  position: Vec3;
  /** 父节点指向本节点的单位方向，作为下一层锥面的轴。 */
  axis: Vec3;
  radius: number;
  color: string;
  childIds: string[];
}

export interface LayoutResult {
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
  maxDepth: number;
}

function radiusForDepth(depth: number): number {
  return NODE_RADIUS_BY_DEPTH[Math.min(depth, 5)] ?? NODE_RADIUS_BY_DEPTH[5]!;
}

/** 给定轴向构造两个正交基向量，保证同一份数据的基向量完全一致。 */
function basisFor(axis: Vec3): { u: Vec3; v: Vec3 } {
  const up = Math.abs(axis.y) > 0.99 ? vec(1, 0, 0) : vec(0, 1, 0);
  const u = normalize(cross(up, axis));
  const v = normalize(cross(axis, u));
  return { u, v };
}

/**
 * 确定性分层球壳布局（方案 §5.3）：
 * - 根不渲染；学科均分在半径 70 的球面上；
 * - 子节点以父节点为球心、父方向为轴，落在半顶角 32°（兄弟 >8 时 42°）的锥面上；
 * - 层距按深度取 46 / 34 / 24 / 18；
 * - 位置只由父位置、父方向、兄弟序号与数量、深度决定，无随机、无力导向。
 */
export function computeLayout(nodes: KnowledgeNode[]): LayoutResult {
  const nodeIds = new Set(nodes.map((n) => n.id));

  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId || !nodeIds.has(node.parentId)) continue;
    const list = childrenMap.get(node.parentId);
    if (list) list.push(node.id);
    else childrenMap.set(node.parentId, [node.id]);
  }

  // 顶层节点（学科）：没有父节点或父节点缺失。顺序沿用数据顺序，保证可复现。
  const roots = nodes.filter((n) => !n.parentId || !nodeIds.has(n.parentId)).map((n) => n.id);

  const byId = new Map<string, LayoutNode>();
  const rootCount = Math.max(roots.length, 1);

  roots.forEach((id, index) => {
    const azimuth = (2 * Math.PI * index) / rootCount;
    const position = vec(Math.cos(azimuth) * SUBJECT_RADIUS, 0, Math.sin(azimuth) * SUBJECT_RADIUS);
    byId.set(id, {
      id,
      parentId: null,
      depth: 1,
      position,
      axis: normalize(position),
      radius: radiusForDepth(1),
      color: NODE_COLORS[index % NODE_COLORS.length]!,
      childIds: childrenMap.get(id) ?? [],
    });
  });

  const queue: string[] = [...roots];
  let chapterCounter = 0;

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = byId.get(parentId);
    if (!parent) continue;
    const childIds = childrenMap.get(parentId) ?? [];
    const siblingCount = childIds.length;
    if (siblingCount === 0) continue;

    const halfAngle =
      siblingCount > WIDE_CONE_SIBLING_THRESHOLD ? CONE_HALF_ANGLE_WIDE : CONE_HALF_ANGLE;
    const depth = parent.depth + 1;
    const distance = LAYER_DISTANCE[depth] ?? LAYER_DISTANCE[5]!;
    const { u, v } = basisFor(parent.axis);

    childIds.forEach((childId, index) => {
      const phi = (2 * Math.PI * index) / siblingCount;
      const radial = add(scale(u, Math.cos(phi)), scale(v, Math.sin(phi)));
      const direction = add(scale(parent.axis, Math.cos(halfAngle)), scale(radial, Math.sin(halfAngle)));
      const unit = normalize(direction);
      const position = add(parent.position, scale(unit, distance));

      let color = parent.color;
      if (depth === 2) {
        color = NODE_COLORS[chapterCounter % NODE_COLORS.length]!;
        chapterCounter += 1;
      }

      byId.set(childId, {
        id: childId,
        parentId,
        depth,
        position,
        axis: normalize(sub(position, parent.position)),
        radius: radiusForDepth(depth),
        color,
        childIds: childrenMap.get(childId) ?? [],
      });
      queue.push(childId);
    });
  }

  // 防御：父链断裂导致未布局的节点，当作额外的顶层节点放到外圈，避免整张图缺节点。
  const missing = nodes.filter((n) => !byId.has(n.id));
  missing.forEach((node, index) => {
    const azimuth = (2 * Math.PI * (roots.length + index)) / Math.max(roots.length + missing.length, 1);
    const position = vec(Math.cos(azimuth) * SUBJECT_RADIUS, 0, Math.sin(azimuth) * SUBJECT_RADIUS);
    byId.set(node.id, {
      id: node.id,
      parentId: null,
      depth: 1,
      position,
      axis: normalize(position),
      radius: radiusForDepth(1),
      color: NODE_COLORS[index % NODE_COLORS.length]!,
      childIds: [],
    });
  });

  const layoutNodes = Array.from(byId.values());
  const maxDepth = layoutNodes.reduce((max, node) => Math.max(max, node.depth), 0);
  return { nodes: layoutNodes, byId, maxDepth };
}

/** 计算两个布局节点在三维空间中的距离（测试与调参用）。 */
export function layoutDistance(a: LayoutNode, b: LayoutNode): number {
  return length(sub(a.position, b.position));
}
