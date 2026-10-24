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

/**
 * 移动 / 归位前的父级校验：返回中文错误，合法返回 null。
 *
 * 循环守卫不能只放在 UI 层（拖拽、位置选择器各自实现过一遍），
 * store 的 reparent / moveNode 也调用这里，避免其它调用方绕过检查造出环。
 */
export function reparentError(
  nodes: KnowledgeNode[],
  nodeId: string,
  parentId: string | null,
): string | null {
  if (!parentId) return null;
  if (parentId === nodeId) return "不能把知识点挂到它自己下面";
  if (!nodes.some((node) => node.id === parentId)) return "目标父级不存在，可能已被删除";
  if (isSelfOrDescendant(nodes, nodeId, parentId)) {
    return "不能移动到自己的子节点下面，换一个位置试试";
  }
  return null;
}

// ---------------------------------------------------------------------------
// 新建父级路径（收编卡片 / 换个位置共用）
// ---------------------------------------------------------------------------

/** 新建父级路径时的分隔符：中英文斜杠、箭头、顿号与反斜杠。 */
const PATH_INPUT_SEPARATOR = /[/／>＞→\\、]/g;

/** 一条路径最多几级（学科 → 章节 → 小节 → …）。 */
export const MAX_PATH_SEGMENTS = 5;

/** 每级名称长度上限，与 AI 抽取的标题长度保持一致。 */
export const MAX_PATH_SEGMENT_LENGTH = 24;

/** 把「物理 / 电学」这类输入拆成层级数组；空段会被丢弃。 */
export function parsePathInput(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(PATH_INPUT_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** 校验路径；有问题返回中文提示，合法返回 null。 */
export function validatePathSegments(segments: string[]): string | null {
  if (segments.length === 0) return "请输入至少一级名称，例如：物理 / 电学";
  if (segments.length > MAX_PATH_SEGMENTS) return `路径最多 ${MAX_PATH_SEGMENTS} 级`;
  for (const segment of segments) {
    if (segment.length > MAX_PATH_SEGMENT_LENGTH) {
      return `每一级名称不能超过 ${MAX_PATH_SEGMENT_LENGTH} 个字`;
    }
  }
  return null;
}

/** 在同一父级下按标题找节点（大小写不敏感，与数据库 lower(title) 唯一索引一致）。 */
export function findChildByTitle(
  nodes: KnowledgeNode[],
  parentId: string | null,
  title: string,
): KnowledgeNode | undefined {
  const target = title.trim().toLowerCase();
  if (!target) return undefined;
  return nodes.find(
    (node) => node.parentId === parentId && node.title.trim().toLowerCase() === target,
  );
}

/** 需要排除的子树：excludeId 自身 + 全部后代（换位置时不能挂到自己下面）。 */
export function blockedSubtree(
  nodes: KnowledgeNode[],
  excludeId?: string | null,
): Set<string> {
  const blocked = new Set<string>();
  if (!excludeId) return blocked;
  blocked.add(excludeId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && blocked.has(node.parentId) && !blocked.has(node.id)) {
        blocked.add(node.id);
        changed = true;
      }
    }
  }
  return blocked;
}
