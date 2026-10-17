import type { LayoutResult } from "@/lib/layout/layout";

export interface VisibilityResult {
  visibleIds: Set<string>;
  /** 每个可见节点被折叠的直接子节点数量（画 +N 徽标）。 */
  badges: Map<string, number>;
}

/**
 * 由密度档位 + 展开集合计算可见节点。
 * - 深度 ≤ maxDepth 的节点默认可见；
 * - 被显式展开的节点，其子节点也可见（可以逐层展开）；
 * - 可见节点下未渲染的直接子节点计入 +N。
 */
export function computeVisibility(
  layout: LayoutResult,
  maxDepth: number,
  expandedIds: Set<string>,
): VisibilityResult {
  const visibleIds = new Set<string>();
  const queue: string[] = [];

  for (const node of layout.nodes) {
    if (!node.parentId) {
      visibleIds.add(node.id);
      queue.push(node.id);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = layout.byId.get(id);
    if (!node) continue;
    const expand = node.depth < maxDepth || expandedIds.has(id);
    if (!expand) continue;
    for (const childId of node.childIds) {
      if (visibleIds.has(childId)) continue;
      visibleIds.add(childId);
      queue.push(childId);
    }
  }

  const badges = new Map<string, number>();
  for (const node of layout.nodes) {
    if (!visibleIds.has(node.id)) continue;
    let hidden = 0;
    for (const childId of node.childIds) {
      if (!visibleIds.has(childId)) hidden += 1;
    }
    if (hidden > 0) badges.set(node.id, hidden);
  }

  return { visibleIds, badges };
}
