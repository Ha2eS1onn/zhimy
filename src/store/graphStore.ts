"use client";

import { create } from "zustand";
import { buildSeedGraph } from "@/data/seed";
import { newId, nowIso } from "@/lib/ids";
import { getRepo } from "@/lib/repo";
import { dedupeRelations, makeRelation } from "@/lib/relations";
import type {
  GraphData,
  KnowledgeNode,
  NodeSource,
  NodeStatus,
  Relation,
  Source,
  Suggestion,
} from "@/types";
import { useSessionStore } from "./sessionStore";

interface GraphState {
  nodes: KnowledgeNode[];
  relations: Relation[];
  sources: Source[];
  nodeSources: NodeSource[];
  loading: boolean;
  error: string | null;
  loadedFor: string | null;
  load: (userId: string) => Promise<void>;
  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
  addSource: (input: { question: string; answer: string }) => Promise<Source>;
  adopt: (input: {
    suggestion: Suggestion;
    parentId: string | null;
    title: string;
    summary: string;
  }) => Promise<{ nodeId: string; status: NodeStatus }>;
  reparent: (nodeId: string, parentId: string | null) => Promise<void>;
  setStatus: (nodeId: string, status: NodeStatus) => Promise<void>;
  /** 修改知识点名称 / 摘要（详情面板里的编辑功能）。 */
  updateDetails: (nodeId: string, patch: { title?: string; summary?: string }) => Promise<void>;
  /** 切换账号时清空本地缓存，等待重新加载。 */
  resetLocal: () => void;
  seedExample: () => Promise<void>;
  clearGraph: () => Promise<void>;
  exportJson: () => string;
}

function currentUserId(): string {
  const user = useSessionStore.getState().user;
  if (!user) throw new Error("账号尚未就绪，请稍后重试");
  return user.id;
}

function applyGraph(data: GraphData) {
  return {
    nodes: data.nodes,
    relations: data.relations,
    sources: data.sources,
    nodeSources: data.nodeSources,
  };
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  nodes: [],
  relations: [],
  sources: [],
  nodeSources: [],
  loading: false,
  error: null,
  loadedFor: null,

  load: async (userId) => {
    set({ loading: true, error: null });
    try {
      const data = await getRepo().loadGraph(userId);
      set({ ...applyGraph(data), loading: false, loadedFor: userId, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "图谱加载失败",
      });
    }
  },

  ensureLoaded: async () => {
    const user = useSessionStore.getState().user;
    if (!user) return;
    if (get().loadedFor === user.id || get().loading) return;
    await get().load(user.id);
  },

  refresh: async () => {
    const user = useSessionStore.getState().user;
    if (!user) return;
    await get().load(user.id);
  },

  addSource: async ({ question, answer }) => {
    const userId = currentUserId();
    const source: Source = {
      id: newId(),
      kind: "chat",
      question,
      answer,
      imagePath: null,
      createdAt: nowIso(),
    };
    await getRepo().insertSource(userId, source);
    set((state) => ({ sources: [...state.sources, source] }));
    return source;
  },

  adopt: async ({ suggestion, parentId, title, summary }) => {
    const userId = currentUserId();
    // 没有选到父节点时（尤其图谱已有数据），先进入待处理，避免把临时条目当成"学科"挂在顶层。
    const status: NodeStatus =
      parentId === null && get().nodes.length > 0
        ? "inbox"
        : suggestion.confidence >= 0.75
          ? "active"
          : "inbox";
    const createdAt = nowIso();
    const node: KnowledgeNode = {
      id: newId(),
      parentId,
      title: title.trim(),
      summary: summary.trim(),
      status,
      aliases: [],
      mastery: null,
      createdAt,
      updatedAt: createdAt,
    };
    const relations: Relation[] = [];
    for (const relation of suggestion.relations) {
      if (!relation.targetNodeId || relation.targetNodeId === node.id) continue;
      if (!get().nodes.some((item) => item.id === relation.targetNodeId)) continue;
      relations.push(
        makeRelation({
          id: newId(),
          fromId: node.id,
          toId: relation.targetNodeId,
          type: relation.type,
          confidence: relation.confidence,
          origin: "ai",
        }),
      );
    }
    const links: NodeSource[] = suggestion.sourceId
      ? [{ nodeId: node.id, sourceId: suggestion.sourceId }]
      : [];

    // 乐观更新：失败时回滚。
    set((state) => ({
      nodes: [...state.nodes, node],
      relations: dedupeRelations([...state.relations, ...relations]),
      nodeSources: [...state.nodeSources, ...links],
    }));

    try {
      await getRepo().insertNode(userId, node);
      if (relations.length > 0) await getRepo().insertRelations(userId, relations);
      if (links.length > 0) await getRepo().insertNodeSources(userId, links);
    } catch (error) {
      set((state) => ({
        nodes: state.nodes.filter((item) => item.id !== node.id),
        relations: state.relations.filter(
          (relation) => relation.fromId !== node.id && relation.toId !== node.id,
        ),
        nodeSources: state.nodeSources.filter((link) => link.nodeId !== node.id),
      }));
      throw error;
    }

    return { nodeId: node.id, status };
  },

  reparent: async (nodeId, parentId) => {
    const userId = currentUserId();
    const previous = get().nodes;
    set({
      nodes: previous.map((node) =>
        node.id === nodeId ? { ...node, parentId, updatedAt: nowIso() } : node,
      ),
    });
    try {
      await getRepo().updateNode(userId, nodeId, { parentId });
    } catch (error) {
      set({ nodes: previous });
      throw error;
    }
  },

  setStatus: async (nodeId, status) => {
    const userId = currentUserId();
    const previous = get().nodes;
    set({
      nodes: previous.map((node) =>
        node.id === nodeId ? { ...node, status, updatedAt: nowIso() } : node,
      ),
    });
    try {
      await getRepo().updateNode(userId, nodeId, { status });
    } catch (error) {
      set({ nodes: previous });
      throw error;
    }
  },

  updateDetails: async (nodeId, patch) => {
    const userId = currentUserId();
    const previous = get().nodes;
    const clean: { title?: string; summary?: string } = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("知识点名称不能为空");
      clean.title = title;
    }
    if (patch.summary !== undefined) clean.summary = patch.summary.trim();

    set({
      nodes: previous.map((node) =>
        node.id === nodeId ? { ...node, ...clean, updatedAt: nowIso() } : node,
      ),
    });
    try {
      await getRepo().updateNode(userId, nodeId, clean);
    } catch (error) {
      set({ nodes: previous });
      throw error;
    }
  },

  resetLocal: () => {
    set({
      nodes: [],
      relations: [],
      sources: [],
      nodeSources: [],
      loading: false,
      error: null,
      loadedFor: null,
    });
  },

  seedExample: async () => {
    const userId = currentUserId();
    const data = buildSeedGraph();
    set({ loading: true, error: null });
    try {
      await getRepo().deleteAllNodes(userId);
      await getRepo().insertNodes(userId, data.nodes);
      if (data.relations.length > 0) await getRepo().insertRelations(userId, data.relations);
      const graph = await getRepo().loadGraph(userId);
      set({ ...applyGraph(graph), loading: false, loadedFor: userId });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "载入示例数据失败",
      });
      throw error;
    }
  },

  clearGraph: async () => {
    const userId = currentUserId();
    await getRepo().deleteAllNodes(userId);
    set({ nodes: [], relations: [], nodeSources: [] });
  },

  exportJson: () => {
    const { nodes, relations, sources, nodeSources } = get();
    return JSON.stringify(
      {
        app: "zhimy",
        version: 1,
        exportedAt: nowIso(),
        nodes,
        relations,
        sources,
        nodeSources,
      },
      null,
      2,
    );
  },
}));
