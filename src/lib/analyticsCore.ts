/**
 * 埋点的纯逻辑部分：事件名常量与属性清洗。
 *
 * 这里不 import 任何 store / repo / 浏览器 API，Node 测试环境可以直接引用；
 * 真正的上报入口在 ./analytics.ts（track）。
 */

/**
 * 全量埋点事件名。值即写入 public.events.name 的字符串，
 * 改动时需同步 docs/insights.sql 里的查询口径。
 */
export const EVENTS = {
  chatSent: "chat_sent",
  hitAttempt: "hit_attempt",
  captureShown: "capture_shown",
  captureAdopted: "capture_adopted",
  captureDismissed: "capture_dismissed",
  nodeOpened: "node_opened",
  detailGenerated: "detail_generated",
  detailSaved: "detail_saved",
  profileSaved: "profile_saved",
  relationCreated: "relation_created",
  relationSuggestionAdopted: "relation_suggestion_adopted",
  relationUpdated: "relation_updated",
  relationDeleted: "relation_deleted",
  nodeMoved: "node_moved",
  positionsReset: "positions_reset",
  authLogin: "auth_login",
  authBindRequested: "auth_bind_requested",
  graphSeeded: "graph_seeded",
  graphCleared: "graph_cleared",
  graphExported: "graph_exported",
  embeddingBackfill: "embedding_backfill",
  llmConnectionTested: "llm_connection_tested",
} as const;

export type AnalyticsEventName = (typeof EVENTS)[keyof typeof EVENTS];

/** 单条事件最多保留的属性键数，避免 events.props 无限膨胀。 */
export const MAX_PROP_KEYS = 12;
/** 字符串属性保留的最大字符数（trim 之后截断）。 */
export const MAX_PROP_STRING_LENGTH = 120;

/**
 * 清洗埋点属性，保证只把小的标量写进 JSONB：
 * - 只保留 string / number / boolean；嵌套对象、数组、null、undefined 一律丢弃；
 * - string 先 trim，再截断到 120 字符；
 * - number 丢弃 NaN / Infinity（JSON 无法表示，写库会报错）；
 * - 最多保留前 12 个合法键，超出部分丢弃。
 */
export function sanitizeProps(
  props?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!props || typeof props !== "object" || Array.isArray(props)) return result;

  let kept = 0;
  for (const [key, value] of Object.entries(props)) {
    if (kept >= MAX_PROP_KEYS) break;
    if (typeof value === "string") {
      result[key] = value.trim().slice(0, MAX_PROP_STRING_LENGTH);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else {
      continue;
    }
    kept += 1;
  }
  return result;
}
