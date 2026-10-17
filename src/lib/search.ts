import type { KnowledgeNode } from "@/types";

/** 归一化：小写、去标点空白、去中文虚词与常见问句词，让「电阻并联怎么算」对齐「电阻的并联」。 */
const PUNCTUATION = /[\s，。、！？,.:;：；"'“”‘’()（）《》【】[\]!?~·…\-—_=+*/\\|<>%#@&]+/g;
const PARTICLES = ["的", "地", "得", "了", "吗", "呢", "吧", "啊"];
const QUESTION_WORDS = [
  "什么是",
  "怎么算",
  "怎么",
  "如何",
  "为什么",
  "是什么",
  "什么",
  "请问",
  "帮我",
  "一下",
  "讲讲",
  "解释",
  "介绍",
  "有哪些",
  "求",
];

export function normalizeText(input: string): string {
  let text = input.toLowerCase().replace(PUNCTUATION, "");
  for (const word of QUESTION_WORDS) text = text.split(word).join("");
  for (const p of PARTICLES) text = text.split(p).join("");
  return text;
}

export function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  if (text.length < 2) {
    if (text.length === 1) set.add(text);
    return set;
  }
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** 重叠系数：用较小集合做分母，对「短标题出现在长问题里」更友好。 */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  return inter / Math.min(a.size, b.size);
}

/** 查询与目标文本的相似度 0–1。 */
export function textScore(query: string, target: string): number {
  const q = normalizeText(query);
  const t = normalizeText(target);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (q.includes(t) || t.includes(q)) {
    const ratio = Math.min(q.length, t.length) / Math.max(q.length, t.length);
    return 0.72 + 0.28 * ratio;
  }
  const qb = bigrams(q);
  const tb = bigrams(t);
  const overlap = overlapCoefficient(qb, tb);
  const jac = jaccard(qb, tb);
  return Math.max(0, overlap * 0.82 + jac * 0.18);
}

export const HIT_THRESHOLD = 0.62;

export interface SearchHit {
  node: KnowledgeNode;
  score: number;
}

/** 在知识图谱中检索候选节点（标题 + 别名）。 */
export function searchNodes(nodes: KnowledgeNode[], query: string, limit = 8): SearchHit[] {
  const q = normalizeText(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const node of nodes) {
    let best = textScore(q, node.title);
    for (const alias of node.aliases) {
      best = Math.max(best, textScore(q, alias));
    }
    if (best > 0.18) hits.push({ node, score: best });
  }
  hits.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title, "zh"));
  return hits.slice(0, limit);
}

export interface ResolveResult {
  nodeId: string | null;
  score: number;
}

/** 命中判定：问题是否已经在图谱里。 */
export function resolveQuestion(nodes: KnowledgeNode[], question: string): ResolveResult {
  const hits = searchNodes(nodes, question, 1);
  const top = hits[0];
  if (!top || top.score < HIT_THRESHOLD) return { nodeId: null, score: top?.score ?? 0 };
  return { nodeId: top.node.id, score: top.score };
}
