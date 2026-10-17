import type { ProjectedNode } from "./renderer";

/** 屏幕空间命中：取最近（z 最小）且在半径 + 容差内的节点。 */
export function hitTest(
  projected: ProjectedNode[],
  x: number,
  y: number,
  isMobile = false,
): ProjectedNode | null {
  const tolerance = isMobile ? 18 : 14;
  let best: ProjectedNode | null = null;
  for (const node of projected) {
    const distance = Math.hypot(node.x - x, node.y - y);
    const threshold = Math.max(node.screenRadius, tolerance);
    if (distance > threshold) continue;
    if (!best || node.z < best.z) best = node;
  }
  return best;
}
