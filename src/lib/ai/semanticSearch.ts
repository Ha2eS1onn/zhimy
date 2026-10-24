import type { KnowledgeNode, VectorMatch } from "@/types";
import { HIT_SIMILARITY_THRESHOLD } from "./embeddings";

/**
 * 语义检索的抽象层：只做两件事——把查询文本变成向量、在向量库里找近邻。
 * 这里不 import repo / store，方便在测试里用对象字面量注入假实现（P1-A）。
 */
export interface SemanticSearch {
  readonly configured: true;
  embedQuery(text: string, signal?: AbortSignal): Promise<number[]>;
  matchNodes(
    embedding: number[],
    options?: { limit?: number; minSimilarity?: number },
  ): Promise<VectorMatch[]>;
}

/**
 * 在向量 top-k 里挑出可以算「命中」的节点：
 * - 只认本地图谱里真实存在的 id（向量库可能比内存图谱新）；
 * - 相似度必须达到阈值；多个达标时取相似度最高的一个。
 */
export function decideVectorHit(
  matches: VectorMatch[],
  nodes: KnowledgeNode[],
  threshold = HIT_SIMILARITY_THRESHOLD,
): { nodeId: string; score: number } | null {
  if (matches.length === 0 || nodes.length === 0) return null;
  const knownIds = new Set(nodes.map((node) => node.id));
  let best: { nodeId: string; score: number } | null = null;
  for (const match of matches) {
    if (!knownIds.has(match.nodeId)) continue;
    const score = match.similarity;
    if (typeof score !== "number" || !Number.isFinite(score) || score < threshold) continue;
    if (!best || score > best.score) best = { nodeId: match.nodeId, score };
  }
  return best;
}

/** 向量优先合并：先放向量候选，再用关键词候选补齐，按 key 去重并受上限约束。 */
export function mergeVectorFirst<T>(
  vectorItems: T[],
  keywordItems: T[],
  limit: number,
  keyOf: (item: T) => string,
  exclude?: Set<string>,
): T[] {
  if (limit <= 0) return [];
  const taken = new Set(exclude ?? []);
  const merged: T[] = [];
  for (const item of [...vectorItems, ...keywordItems]) {
    if (merged.length >= limit) break;
    const key = keyOf(item);
    if (taken.has(key)) continue;
    taken.add(key);
    merged.push(item);
  }
  return merged;
}
