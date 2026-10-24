import { describe, expect, it } from "vitest";
import {
  EVENTS,
  MAX_PROP_KEYS,
  MAX_PROP_STRING_LENGTH,
  sanitizeProps,
} from "@/lib/analyticsCore";

/** P1-B 约定的事件清单；顺序无关，用于守住漏写 / 拼错事件名。 */
const EXPECTED_EVENT_NAMES = [
  "auth_bind_requested",
  "auth_login",
  "capture_adopted",
  "capture_dismissed",
  "capture_shown",
  "chat_sent",
  "detail_generated",
  "detail_saved",
  "embedding_backfill",
  "graph_cleared",
  "graph_exported",
  "graph_seeded",
  "hit_attempt",
  "llm_connection_tested",
  "node_moved",
  "node_opened",
  "positions_reset",
  "profile_saved",
  "relation_created",
  "relation_deleted",
  "relation_suggestion_adopted",
  "relation_updated",
];

describe("sanitizeProps", () => {
  it("保留 string / number / boolean 标量", () => {
    expect(
      sanitizeProps({ source: "vector", score: 0.83, hit: true, misses: 0 }),
    ).toEqual({ source: "vector", score: 0.83, hit: true, misses: 0 });
  });

  it("string 先 trim 再截断到上限", () => {
    const long = "x".repeat(MAX_PROP_STRING_LENGTH + 50);
    expect(sanitizeProps({ spaced: "  电路故障分析  " })).toEqual({ spaced: "电路故障分析" });
    const result = sanitizeProps({ long });
    expect(result.long).toHaveLength(MAX_PROP_STRING_LENGTH);
    expect(result.long).toBe(long.slice(0, MAX_PROP_STRING_LENGTH));
  });

  it("丢弃嵌套对象、数组、null、undefined", () => {
    expect(
      sanitizeProps({
        keep: "ok",
        nested: { a: 1 },
        list: [1, 2],
        nothing: null,
        missing: undefined,
        deep: { inner: { score: 1 } },
      }),
    ).toEqual({ keep: "ok" });
  });

  it("丢弃 NaN 与 Infinity，保留有限数字", () => {
    expect(
      sanitizeProps({ nan: Number.NaN, inf: Number.POSITIVE_INFINITY, ninf: Number.NEGATIVE_INFINITY, finite: 1.5 }),
    ).toEqual({ finite: 1.5 });
  });

  it("最多保留 12 个键", () => {
    const input: Record<string, unknown> = {};
    for (let index = 0; index < 20; index += 1) input[`k${index}`] = index;
    const result = sanitizeProps(input);
    expect(MAX_PROP_KEYS).toBe(12);
    expect(Object.keys(result)).toHaveLength(MAX_PROP_KEYS);
    expect(result).toEqual({
      k0: 0, k1: 1, k2: 2, k3: 3, k4: 4, k5: 5,
      k6: 6, k7: 7, k8: 8, k9: 9, k10: 10, k11: 11,
    });
  });

  it("非法值不占键位名额", () => {
    const input: Record<string, unknown> = { nested: { a: 1 }, nan: Number.NaN };
    for (let index = 0; index < 13; index += 1) input[`k${index}`] = index;
    expect(Object.keys(sanitizeProps(input))).toHaveLength(MAX_PROP_KEYS);
  });

  it("空输入返回空对象", () => {
    expect(sanitizeProps()).toEqual({});
    expect(sanitizeProps({})).toEqual({});
    expect(sanitizeProps(undefined)).toEqual({});
  });
});

describe("EVENTS", () => {
  it("事件名唯一", () => {
    const names = Object.values(EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("事件名全部是 snake_case", () => {
    for (const name of Object.values(EVENTS)) {
      expect(name).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/);
    }
  });

  it("覆盖 P1-B 约定的全部事件", () => {
    expect(Object.values(EVENTS).sort()).toEqual([...EXPECTED_EVENT_NAMES].sort());
  });
});
