import { resolveQuestion } from "@/lib/search";
import type { KnowledgeNode, VectorMatch } from "@/types";
import { HIT_SIMILARITY_THRESHOLD } from "./embeddings";
import { decideVectorHit, type SemanticSearch } from "./semanticSearch";

/**
 * 统一命中判定（P1-A）：
 * 先走向量语义检索（embedding 余弦相似度 ≥ 0.78），失败/未命中再回退到本机关键词检索。
 * 向量链路异常或超时只降低召回，不影响问答本身，因此一律静默降级。
 */

export type HitSource = "vector" | "keyword";
export type HitFallback = "not-configured" | "error" | "timeout";

export interface HitResult {
  nodeId: string | null;
  score: number;
  source: HitSource;
  fallback?: HitFallback;
}

const DEFAULT_TIMEOUT_MS = 6000;
const VECTOR_LIMIT = 5;

/** 失败原因归类：AbortSignal.timeout / fetch 中断都算超时，其余算普通错误。 */
function classifyHitError(error: unknown): HitFallback {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
}

/** 向量链路里的最高相似度（只统计本地图谱存在的节点），用于失败时报告分数。 */
function bestVectorScore(matches: VectorMatch[], nodes: KnowledgeNode[]): number {
  const knownIds = new Set(nodes.map((node) => node.id));
  let best = 0;
  for (const match of matches) {
    if (!knownIds.has(match.nodeId)) continue;
    if (typeof match.similarity === "number" && Number.isFinite(match.similarity)) {
      best = Math.max(best, match.similarity);
    }
  }
  return best;
}

function emptyHit(): HitResult {
  return { nodeId: null, score: 0, source: "keyword" };
}

/**
 * 问题命中判定：
 * 1) 空问题 / 空图谱直接返回未命中；
 * 2) 有语义检索则先试向量 top-5，达到阈值即命中；
 * 3) 未命中或抛错时用关键词检索兜底；两边都没命中时返回较高分备查。
 */
export async function resolveHit(input: {
  nodes: KnowledgeNode[];
  question: string;
  semantic?: SemanticSearch | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<HitResult> {
  const { nodes, question, semantic, signal, timeoutMs } = input;
  if (!question.trim() || nodes.length === 0) return emptyHit();

  const keyword = resolveQuestion(nodes, question);
  const keywordHit: HitResult = {
    nodeId: keyword.nodeId,
    score: keyword.score,
    source: "keyword",
  };
  if (!semantic) return keywordHit;

  const timeoutSignal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  let fallback: HitFallback | undefined;
  let vectorScore = 0;
  try {
    const embedding = await semantic.embedQuery(question, requestSignal);
    const matches = await semantic.matchNodes(embedding, { limit: VECTOR_LIMIT });
    vectorScore = bestVectorScore(matches, nodes);
    const hit = decideVectorHit(matches, nodes, HIT_SIMILARITY_THRESHOLD);
    if (hit) return { nodeId: hit.nodeId, score: hit.score, source: "vector" };
  } catch (error) {
    fallback = classifyHitError(error);
  }

  if (keyword.nodeId) {
    return { ...keywordHit, ...(fallback ? { fallback } : {}) };
  }
  return {
    nodeId: null,
    score: Math.max(keyword.score, vectorScore),
    source: "keyword",
    ...(fallback ? { fallback } : {}),
  };
}
