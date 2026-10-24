import type { Relation, RelationOrigin, RelationType } from "@/types";

export const UNDIRECTED_TYPES: ReadonlySet<RelationType> = new Set(["related", "contrast"]);

export interface RelationPair {
  fromId: string;
  toId: string;
}

/** 无向关系入库前规范化方向（按 id 字典序），避免 A→B / B→A 重复。 */
export function normalizePair(type: RelationType, a: string, b: string): RelationPair {
  if (UNDIRECTED_TYPES.has(type) && a > b) return { fromId: b, toId: a };
  return { fromId: a, toId: b };
}

/** 唯一键：用户内同一对节点 + 同一类型只允许一条。 */
export function relationKey(type: RelationType, fromId: string, toId: string): string {
  const pair = normalizePair(type, fromId, toId);
  return `${type}:${pair.fromId}:${pair.toId}`;
}

export const RELATION_META: Record<RelationType, { label: string; color: string }> = {
  prerequisite: { label: "先修", color: "#FFB300" },
  related: { label: "相关", color: "#4DD0E1" },
  contrast: { label: "易混", color: "#FF5252" },
  source: { label: "同源", color: "#90A4AE" },
};

export function relationLabel(type: RelationType): string {
  return RELATION_META[type]?.label ?? type;
}

const RELATION_LIGHT_COLOR: Record<RelationType, string> = {
  prerequisite: "#a35f00",
  related: "#087d8c",
  contrast: "#c03546",
  source: "#5d7484",
};

export function relationColor(type: RelationType, theme: "light" | "dark" = "dark"): string {
  if (theme === "light") return RELATION_LIGHT_COLOR[type] ?? "#5d7484";
  return RELATION_META[type]?.color ?? "#90A4AE";
}

/** 与某节点相连的全部关系。 */
export function relationsOf(relations: Relation[], nodeId: string): Relation[] {
  return relations.filter((r) => r.fromId === nodeId || r.toId === nodeId);
}

/** 与某节点相连的 1 跳邻居（去重）。 */
export function neighborIds(relations: Relation[], nodeId: string): string[] {
  const ids = new Set<string>();
  for (const r of relations) {
    if (r.fromId === nodeId) ids.add(r.toId);
    else if (r.toId === nodeId) ids.add(r.fromId);
  }
  return Array.from(ids);
}

/** 关系对面的节点 id。 */
export function otherEnd(relation: Relation, nodeId: string): string {
  return relation.fromId === nodeId ? relation.toId : relation.fromId;
}

/** 展示给用户的关系方向文案。 */
export function relationDirectionText(relation: Relation, nodeId: string): string {
  const isFrom = relation.fromId === nodeId;
  switch (relation.type) {
    case "prerequisite":
      return isFrom ? "先修 → 对方" : "对方 → 先修";
    case "related":
    case "contrast":
      return "双向";
    case "source":
      return isFrom ? "同源" : "同源";
  }
}

/** 构建关系对象。 */
export function makeRelation(input: {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  confidence?: number;
  origin?: RelationOrigin;
  createdAt?: string;
}): Relation {
  const pair = normalizePair(input.type, input.fromId, input.toId);
  return {
    id: input.id,
    fromId: pair.fromId,
    toId: pair.toId,
    type: input.type,
    confidence: input.confidence ?? 1,
    origin: input.origin ?? "ai",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** 去重：同 key 保留第一条（通常置信度更高或用户手改）。 */
export function dedupeRelations(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  const out: Relation[] = [];
  for (const r of relations) {
    const key = relationKey(r.type, r.fromId, r.toId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
