import type { KnowledgeNode, ReviewCard, ReviewGrade, ReviewState } from "@/types";

/** 复习调度（SM-2 简化版）：纯函数、无依赖，时间统一用 UTC ISO。 */

export const DAY_MS = 86_400_000;
export const AGAIN_INTERVAL_DAYS = 10 / 1440;
export const INITIAL_EASE = 2.5;
export const INITIAL_MASTERY = 0.2;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
/** 间隔上限：避免连续 easy 让日期溢出，也符合「一年内回看」的产品预期。 */
export const MAX_INTERVAL_DAYS = 365;
export const MAX_QUEUE = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 新卡：立即到期，ease 用初始值；已有节点掌握度时沿用。 */
export function newReviewState(
  nodeId: string,
  now = new Date(),
  mastery = INITIAL_MASTERY,
): ReviewState {
  const iso = now.toISOString();
  return {
    nodeId,
    dueAt: iso,
    intervalDays: 0,
    ease: INITIAL_EASE,
    lapses: 0,
    mastery: clamp(mastery, 0, 1),
    lastGrade: null,
    lastReviewedAt: null,
    updatedAt: iso,
  };
}

export function gradeReview(
  state: ReviewState,
  grade: ReviewGrade,
  now = new Date(),
): ReviewState {
  let intervalDays = state.intervalDays;
  let ease = state.ease;
  let lapses = state.lapses;
  let mastery = state.mastery;

  switch (grade) {
    case "again":
      intervalDays = AGAIN_INTERVAL_DAYS;
      ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      lapses += 1;
      mastery = clamp(mastery - 0.15, 0, 1);
      break;
    case "hard":
      intervalDays = Math.max(1, intervalDays * 1.2);
      ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      mastery = clamp(mastery - 0.05, 0, 1);
      break;
    case "good":
      intervalDays = intervalDays < 1 ? 1 : intervalDays * ease;
      mastery = clamp(mastery + 0.1, 0, 1);
      break;
    case "easy":
      intervalDays = intervalDays < 1 ? 3 : intervalDays * ease * 1.3;
      ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      mastery = clamp(mastery + 0.2, 0, 1);
      break;
  }

  const boundedInterval = clamp(intervalDays, AGAIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
  const nowMs = now.getTime();
  return {
    ...state,
    intervalDays: boundedInterval,
    ease,
    lapses,
    mastery,
    lastGrade: grade,
    lastReviewedAt: new Date(nowMs).toISOString(),
    dueAt: new Date(nowMs + boundedInterval * DAY_MS).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function isDue(state: ReviewState, now = new Date()): boolean {
  return new Date(state.dueAt).getTime() <= now.getTime();
}

/** 到期队列：只取 active 节点，按到期时间升序，上限 50 张。 */
export function buildReviewQueue(
  nodes: KnowledgeNode[],
  states: ReviewState[],
  now = new Date(),
  limit = MAX_QUEUE,
): ReviewCard[] {
  const byId = new Map(states.map((state) => [state.nodeId, state]));
  const cards: ReviewCard[] = [];
  for (const node of nodes) {
    if (node.status !== "active") continue;
    const state = byId.get(node.id);
    if (!state || !isDue(state, now)) continue;
    cards.push({ node, state });
  }
  cards.sort(
    (a, b) => new Date(a.state.dueAt).getTime() - new Date(b.state.dueAt).getTime(),
  );
  return cards.slice(0, limit);
}

/** 给 UI 用的间隔文案：10 分钟 / 3 小时 / 12 天 / 2 个月。 */
export function formatInterval(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} 分钟`;
  if (days < 1) return `${Math.round(days * 24)} 小时`;
  if (days < 30) return `${Math.round(days)} 天`;
  return `${Math.round(days / 30)} 个月`;
}
