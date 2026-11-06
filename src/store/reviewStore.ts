"use client";

import { create } from "zustand";
import { gradeReview, newReviewState } from "@/lib/review/schedule";
import { getRepo } from "@/lib/repo";
import type { ReviewGrade, ReviewState } from "@/types";
import { useGraphStore } from "./graphStore";
import { useSessionStore } from "./sessionStore";

interface ReviewStoreState {
  states: Record<string, ReviewState>;
  loading: boolean;
  loadedFor: string | null;
  error: string | null;
  load: (userId: string) => Promise<void>;
  ensureLoaded: () => Promise<void>;
  /** 加入复习：已存在则不重复写。 */
  enqueue: (nodeId: string) => Promise<void>;
  /** 批量加入，返回实际新增数量；单次最多 20 个。 */
  enqueueMany: (nodeIds: string[]) => Promise<number>;
  /** 评级并写回调度状态与节点掌握度。 */
  grade: (nodeId: string, grade: ReviewGrade) => Promise<ReviewState>;
  remove: (nodeId: string) => Promise<void>;
  resetLocal: () => void;
}

function currentUser() {
  const user = useSessionStore.getState().user;
  if (!user) throw new Error("账号尚未就绪，请稍后重试");
  return user;
}

function activeNode(nodeId: string) {
  return useGraphStore.getState().nodes.find((node) => node.id === nodeId);
}

export const useReviewStore = create<ReviewStoreState>()((set, get) => ({
  states: {},
  loading: false,
  loadedFor: null,
  error: null,

  load: async (userId) => {
    set({ loading: true, error: null });
    try {
      const states = await getRepo().loadReviewStates(userId);
      const map: Record<string, ReviewState> = {};
      for (const state of states) map[state.nodeId] = state;
      set({ states: map, loading: false, loadedFor: userId, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "复习状态加载失败",
      });
    }
  },

  ensureLoaded: async () => {
    const user = useSessionStore.getState().user;
    if (!user) return;
    if (get().loadedFor === user.id || get().loading) return;
    await get().load(user.id);
  },

  enqueue: async (nodeId) => {
    const user = currentUser();
    if (get().states[nodeId]) return;
    const node = activeNode(nodeId);
    if (!node) throw new Error("知识点不存在");
    const next = newReviewState(nodeId, new Date(), node.mastery ?? 0.2);
    await getRepo().upsertReviewStates(user.id, [next]);
    set((state) => ({ states: { ...state.states, [nodeId]: next } }));
  },

  enqueueMany: async (nodeIds) => {
    const user = currentUser();
    const ids = [...new Set(nodeIds)].slice(0, 20);
    const existing = get().states;
    const additions: ReviewState[] = [];
    const now = new Date();
    for (const nodeId of ids) {
      if (existing[nodeId]) continue;
      const node = activeNode(nodeId);
      if (!node || node.status !== "active") continue;
      additions.push(newReviewState(nodeId, now, node.mastery ?? 0.2));
    }
    if (additions.length === 0) return 0;
    await getRepo().upsertReviewStates(user.id, additions);
    set((state) => {
      const map = { ...state.states };
      for (const item of additions) map[item.nodeId] = item;
      return { states: map };
    });
    return additions.length;
  },

  grade: async (nodeId, grade) => {
    const user = currentUser();
    const existing = get().states[nodeId];
    if (!existing) throw new Error("这个知识点还没有加入复习");
    const next = gradeReview(existing, grade);
    await getRepo().upsertReviewStates(user.id, [next]);
    await useGraphStore.getState().setMastery(nodeId, next.mastery);
    set((state) => ({ states: { ...state.states, [nodeId]: next } }));
    return next;
  },

  remove: async (nodeId) => {
    const user = currentUser();
    await getRepo().deleteReviewState(user.id, nodeId);
    set((state) => {
      const map = { ...state.states };
      delete map[nodeId];
      return { states: map };
    });
  },

  resetLocal: () => {
    set({ states: {}, loading: false, loadedFor: null, error: null });
  },
}));
