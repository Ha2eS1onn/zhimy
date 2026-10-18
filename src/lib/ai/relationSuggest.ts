import { newId } from "@/lib/ids";
import { buildPath } from "@/lib/path";
import { relationKey } from "@/lib/relations";
import { searchNodes } from "@/lib/search";
import type { KnowledgeNode, NodeSource, Relation, RelationType } from "@/types";
import { streamChat } from "./llmClient";
import type { LlmSettings } from "./types";

/** 自动关系建议：本地同源启发式 + BYOK 模型推荐（都只提议，不自动写入）。 */

const RELATION_TYPES = new Set<RelationType>(["prerequisite", "related", "contrast", "source"]);

export interface RelationCandidate {
  id: string;
  title: string;
  path: string;
}

export interface RelationSuggestion {
  id: string;
  targetId: string;
  targetTitle: string;
  type: RelationType;
  confidence: number;
  reason: string;
  source: "ai" | "source";
}

function clamp01(value: unknown, fallback = 0.6): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

/** 已经和该节点有关系的 id（任意类型），用于去重。 */
function connectedIds(nodeId: string, relations: Relation[]): Set<string> {
  const ids = new Set<string>();
  for (const relation of relations) {
    if (relation.fromId === nodeId) ids.add(relation.toId);
    else if (relation.toId === nodeId) ids.add(relation.fromId);
  }
  return ids;
}

export function buildRelationCandidates(
  node: KnowledgeNode,
  nodes: KnowledgeNode[],
  relations: Relation[],
  limit = 12,
): RelationCandidate[] {
  const excluded = connectedIds(node.id, relations);
  const queries = [
    node.title,
    node.summary,
    ...nodes.filter((item) => item.parentId === node.id).map((item) => item.title),
  ];
  const merged = new Map<string, RelationCandidate>();
  for (const query of queries) {
    if (!query.trim()) continue;
    for (const hit of searchNodes(nodes, query, limit)) {
      if (hit.node.id === node.id || excluded.has(hit.node.id) || merged.has(hit.node.id)) continue;
      const path = buildPath(nodes, hit.node.id);
      merged.set(hit.node.id, {
        id: hit.node.id,
        title: hit.node.title,
        path: path.slice(0, -1).map((item) => item.title).join(" / "),
      });
      if (merged.size >= limit) break;
    }
    if (merged.size >= limit) break;
  }
  return Array.from(merged.values());
}

/** 解析模型输出并校验候选 id / 类型 / 重复关系。 */
export function parseRelationSuggestions(
  raw: string,
  candidates: RelationCandidate[],
  existingRelations: Relation[],
  nodeId: string,
): RelationSuggestion[] {
  if (!raw) return [];
  const text = raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];

  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const record = data as Record<string, unknown>;
  const list = Array.isArray(record.relations) ? (record.relations as unknown[]) : [];

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const titleById = new Map(candidates.map((candidate) => [candidate.id, candidate.title]));
  const existingKeys = new Set(
    existingRelations.map((relation) => relationKey(relation.type, relation.fromId, relation.toId)),
  );
  const seen = new Set<string>();
  const suggestions: RelationSuggestion[] = [];

  for (const item of list.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const targetId = typeof value.targetId === "string" ? value.targetId.trim() : "";
    const type = typeof value.type === "string" ? value.type : "";
    if (!candidateIds.has(targetId) || targetId === nodeId) continue;
    if (!RELATION_TYPES.has(type as RelationType)) continue;
    const key = relationKey(type as RelationType, nodeId, targetId);
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      id: newId(),
      targetId,
      targetTitle: titleById.get(targetId) ?? "",
      type: type as RelationType,
      confidence: clamp01(value.confidence, 0.6),
      reason: typeof value.reason === "string" ? value.reason.trim().slice(0, 40) : "",
      source: "ai",
    });
    if (suggestions.length >= 3) break;
  }
  return suggestions;
}

/** 本地同源启发式：共享同一段来源对话的知识点，建议建立"同源"关系。 */
export function sharedSourceSuggestions(
  node: KnowledgeNode,
  nodes: KnowledgeNode[],
  relations: Relation[],
  nodeSources: NodeSource[],
): RelationSuggestion[] {
  const nodeId = node.id;
  const ownSourceIds = new Set(
    nodeSources.filter((link) => link.nodeId === nodeId).map((link) => link.sourceId),
  );
  if (ownSourceIds.size === 0) return [];

  const excluded = connectedIds(nodeId, relations);
  const existingKeys = new Set(
    relations.map((relation) => relationKey(relation.type, relation.fromId, relation.toId)),
  );
  const seen = new Set<string>();
  const suggestions: RelationSuggestion[] = [];

  for (const link of nodeSources) {
    if (!ownSourceIds.has(link.sourceId) || link.nodeId === nodeId) continue;
    if (excluded.has(link.nodeId) || seen.has(link.nodeId)) continue;
    if (existingKeys.has(relationKey("source", nodeId, link.nodeId))) continue;
    const target = nodes.find((item) => item.id === link.nodeId);
    if (!target) continue;
    seen.add(link.nodeId);
    suggestions.push({
      id: newId(),
      targetId: target.id,
      targetTitle: target.title,
      type: "source",
      confidence: 0.6,
      reason: "来自同一段对话/同一道题",
      source: "source",
    });
    if (suggestions.length >= 3) break;
  }
  return suggestions;
}

export function buildRelationSuggestionPrompt(
  node: KnowledgeNode,
  candidates: RelationCandidate[],
  relations: Relation[],
): string {
  const path = `${node.title}`;
  const existing = relations
    .filter((relation) => relation.fromId === node.id || relation.toId === node.id)
    .slice(0, 8)
    .map((relation) => ({
      type: relation.type,
      targetId: relation.fromId === node.id ? relation.toId : relation.fromId,
    }));
  return [
    `当前知识点：${path}`,
    node.summary ? `摘要：${node.summary}` : "",
    `已有关系：${JSON.stringify(existing)}`,
    `候选节点（targetId 只能取以下 id）：${JSON.stringify(candidates)}`,
    "",
    "请从候选中挑 1~3 个与当前知识点确实相关、且尚未建立关系的节点，给出关系类型：",
    "prerequisite = 当前知识点是对方的基础；related = 同思路/同类题；contrast = 易混；source = 同源。",
    "只输出 JSON：",
    '{"relations":[{"targetId":"候选 id","type":"prerequisite|related|contrast|source","confidence":0.0,"reason":"不超过 30 字"}]}',
    "没有合适关系就输出 {\"relations\":[]}；不要编造候选之外的节点。",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function suggestRelationsWithLlm(input: {
  settings: LlmSettings;
  node: KnowledgeNode;
  nodes: KnowledgeNode[];
  relations: Relation[];
  signal?: AbortSignal;
}): Promise<RelationSuggestion[]> {
  const candidates = buildRelationCandidates(input.node, input.nodes, input.relations);
  if (candidates.length === 0) return [];
  const prompt = buildRelationSuggestionPrompt(input.node, candidates, input.relations);

  let raw = "";
  await streamChat({
    settings: input.settings,
    messages: [
      {
        role: "system",
        content:
          "你是「知脉」的知识关系整理助手。只输出 JSON 对象，不要输出 Markdown 代码块或解释。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    maxTokens: 700,
    signal: input.signal,
    onDelta: (chunk) => {
      raw += chunk;
    },
  });

  return parseRelationSuggestions(raw, candidates, input.relations, input.node.id);
}
