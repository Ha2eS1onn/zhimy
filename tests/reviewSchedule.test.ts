import { describe, expect, it } from "vitest";
import type { KnowledgeNode, ReviewState } from "@/types";
import {
  AGAIN_INTERVAL_DAYS,
  DAY_MS,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MAX_QUEUE,
  MIN_EASE,
  buildReviewQueue,
  formatInterval,
  gradeReview,
  isDue,
  newReviewState,
} from "@/lib/review/schedule";

const NOW = new Date("2026-11-06T00:00:00.000Z");

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return { ...newReviewState("node-1", NOW), ...overrides };
}

function node(id: string, overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id,
    parentId: null,
    title: id,
    summary: "",
    detail: "",
    manualPosition: null,
    status: "active",
    aliases: [],
    mastery: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("review schedule", () => {
  it("新卡立即到期，使用初始 ease 与掌握度", () => {
    const next = newReviewState("n1", NOW, 0.4);
    expect(next.dueAt).toBe(NOW.toISOString());
    expect(next.intervalDays).toBe(0);
    expect(next.ease).toBe(2.5);
    expect(next.lapses).toBe(0);
    expect(next.mastery).toBe(0.4);
    expect(next.lastGrade).toBeNull();
  });

  it("good：新卡间隔 1 天，掌握度 +0.1", () => {
    const next = gradeReview(state(), "good", NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.mastery).toBeCloseTo(0.3);
    expect(next.dueAt).toBe(new Date(NOW.getTime() + DAY_MS).toISOString());
    expect(next.lastGrade).toBe("good");
    expect(next.lapses).toBe(0);
  });

  it("easy：新卡间隔 3 天，ease +0.15", () => {
    const next = gradeReview(state(), "easy", NOW);
    expect(next.intervalDays).toBe(3);
    expect(next.ease).toBeCloseTo(2.65);
    expect(next.mastery).toBeCloseTo(0.4);
  });

  it("again：10 分钟内重来，ease 降、lapses +1、掌握度下降", () => {
    const next = gradeReview(state(), "again", NOW);
    expect(next.intervalDays).toBeCloseTo(AGAIN_INTERVAL_DAYS);
    expect(next.dueAt).toBe(
      new Date(NOW.getTime() + AGAIN_INTERVAL_DAYS * DAY_MS).toISOString(),
    );
    expect(next.ease).toBeCloseTo(2.3);
    expect(next.lapses).toBe(1);
    expect(next.mastery).toBeCloseTo(0.05);
  });

  it("hard：新卡至少 1 天，ease 降、掌握度小降", () => {
    const next = gradeReview(state(), "hard", NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.ease).toBeCloseTo(2.35);
    expect(next.mastery).toBeCloseTo(0.15);
  });

  it("连续 good：间隔按 ease 递增", () => {
    const first = gradeReview(state(), "good", NOW);
    const second = gradeReview(first, "good", NOW);
    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBeCloseTo(2.5);
  });

  it("ease 有下限和上限", () => {
    let current = state();
    for (let index = 0; index < 20; index += 1) current = gradeReview(current, "again", NOW);
    expect(current.ease).toBe(MIN_EASE);
    for (let index = 0; index < 20; index += 1) current = gradeReview(current, "easy", NOW);
    expect(current.ease).toBe(MAX_EASE);
    expect(current.intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  it("间隔不超过上限，日期不会溢出", () => {
    let current = state({ intervalDays: 300 });
    for (let index = 0; index < 5; index += 1) current = gradeReview(current, "easy", NOW);
    expect(current.intervalDays).toBe(MAX_INTERVAL_DAYS);
    expect(Number.isNaN(new Date(current.dueAt).getTime())).toBe(false);
  });

  it("掌握度限制在 0 到 1", () => {
    expect(gradeReview(state({ mastery: 1 }), "easy", NOW).mastery).toBe(1);
    expect(gradeReview(state({ mastery: 0 }), "again", NOW).mastery).toBe(0);
  });

  it("isDue 按毫秒比较", () => {
    expect(isDue(state({ dueAt: NOW.toISOString() }), NOW)).toBe(true);
    expect(isDue(state({ dueAt: new Date(NOW.getTime() + 1).toISOString() }), NOW)).toBe(false);
  });
});

describe("buildReviewQueue", () => {
  it("过滤掉非 active、没有状态和未到期的节点", () => {
    const nodes = [
      node("due"),
      node("future"),
      node("inbox", { status: "inbox" }),
      node("missing"),
    ];
    const states = [
      state({ nodeId: "due", dueAt: NOW.toISOString() }),
      state({ nodeId: "future", dueAt: new Date(NOW.getTime() + DAY_MS).toISOString() }),
      state({ nodeId: "inbox", dueAt: NOW.toISOString() }),
    ];
    const queue = buildReviewQueue(nodes, states, NOW);
    expect(queue.map((card) => card.node.id)).toEqual(["due"]);
  });

  it("按到期时间升序并应用上限", () => {
    const nodes = Array.from({ length: 3 }, (_, index) => node(`n${index}`));
    const states = [
      state({ nodeId: "n0", dueAt: new Date(NOW.getTime() - 2000).toISOString() }),
      state({ nodeId: "n1", dueAt: new Date(NOW.getTime() - 1000).toISOString() }),
      state({ nodeId: "n2", dueAt: NOW.toISOString() }),
    ];
    const queue = buildReviewQueue(nodes, states, NOW);
    expect(queue.map((card) => card.node.id)).toEqual(["n0", "n1", "n2"]);
    expect(buildReviewQueue(nodes, states, NOW, 2)).toHaveLength(2);
    expect(MAX_QUEUE).toBe(50);
  });
});

describe("formatInterval", () => {
  it("按分钟 / 小时 / 天 / 月输出", () => {
    expect(formatInterval(AGAIN_INTERVAL_DAYS)).toBe("10 分钟");
    expect(formatInterval(0.5)).toBe("12 小时");
    expect(formatInterval(3)).toBe("3 天");
    expect(formatInterval(60)).toBe("2 个月");
  });
});
