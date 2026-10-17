import type { KnowledgeNode } from "@/types";

/** 由节点数组建索引，供路径 / 深度等高频查询复用。 */
export function indexNodes(nodes: KnowledgeNode[]): Map<string, KnowledgeNode> {
  const map = new Map<string, KnowledgeNode>();
  for (const node of nodes) map.set(node.id, node);
  return map;
}

const MAX_WALK = 64;

/** 沿 parentId 链自顶向下返回节点（物理 / 电学 / 电阻 / 电阻的并联）。 */
export function buildPath(
  nodesOrMap: KnowledgeNode[] | Map<string, KnowledgeNode>,
  id: string,
): KnowledgeNode[] {
  const map = Array.isArray(nodesOrMap) ? indexNodes(nodesOrMap) : nodesOrMap;
  const chain: KnowledgeNode[] = [];
  let current: KnowledgeNode | undefined = map.get(id);
  let guard = 0;
  while (current && guard < MAX_WALK) {
    chain.push(current);
    if (!current.parentId) break;
    current = map.get(current.parentId);
    guard += 1;
  }
  return chain.reverse();
}

/** 深度：顶层节点（学科）为 1；找不到节点返回 0。 */
export function getDepth(
  nodesOrMap: KnowledgeNode[] | Map<string, KnowledgeNode>,
  id: string,
): number {
  const map = Array.isArray(nodesOrMap) ? indexNodes(nodesOrMap) : nodesOrMap;
  let depth = 0;
  let current: KnowledgeNode | undefined = map.get(id);
  let guard = 0;
  while (current && guard < MAX_WALK) {
    depth += 1;
    if (!current.parentId) break;
    current = map.get(current.parentId);
    guard += 1;
  }
  return depth;
}

export function pathLabel(
  nodesOrMap: KnowledgeNode[] | Map<string, KnowledgeNode>,
  id: string,
  separator = " / ",
): string {
  return buildPath(nodesOrMap, id)
    .map((n) => n.title)
    .join(separator);
}

/** ancestorId 是否为 id 的祖先（含自身）。 */
export function isSelfOrDescendant(
  nodesOrMap: KnowledgeNode[] | Map<string, KnowledgeNode>,
  ancestorId: string,
  id: string,
): boolean {
  const map = Array.isArray(nodesOrMap) ? indexNodes(nodesOrMap) : nodesOrMap;
  let current = map.get(id);
  let guard = 0;
  while (current && guard < MAX_WALK) {
    if (current.id === ancestorId) return true;
    if (!current.parentId) return false;
    current = map.get(current.parentId);
    guard += 1;
  }
  return false;
}

/** 直接子节点（保持节点数组顺序，保证布局确定性）。 */
export function childrenOf(nodes: KnowledgeNode[], parentId: string | null): KnowledgeNode[] {
  return nodes.filter((n) => n.parentId === parentId);
}
