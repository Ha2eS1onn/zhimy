"use client";

import { create } from "zustand";
import { buildSeedGraph } from "@/data/seed";
import { newId, nowIso } from "@/lib/ids";
import { getRepo } from "@/lib/repo";
import { dedupeRelations, makeRelation, normalizePair, relationKey } from "@/lib/relations";
import type {
  GraphData,
  KnowledgeNode,
  NodeSource,
  NodeStatus,
  Relation,
  RelationOrigin,
  RelationType,
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
  /** 修改知识点名称 / 摘要 / 完整讲解（详情页与面板里的编辑功能）。 */
  updateDetails: (nodeId: string, patch: { title?: string; summary?: string; detail?: string }) => Promise<void>;
  /** 拖动节点：一次更新父级与手动位置。 */
  moveNode: (
    nodeId: string,
    patch: { parentId?: string | null; manualPosition?: { x: number; y: number; z: number } | null },
  ) => Promise<void>;
  clearManualPosition: (nodeId: string) => Promise<void>;
  clearAllManualPositions: () => Promise<void>;
  addRelation: (input: {
    fromId: string;
    toId: string;
    type: RelationType;
    confidence?: number;
    origin?: RelationOrigin;
  }) => Promise<Relation>;
  updateRelationType: (relationId: string, type: RelationType) => Promise<void>;
  deleteRelation: (relationId: string) => Promise<void>;
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
      detail: "",
      manualPosition: null,
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
    const clean: { title?: string; summary?: string; detail?: string } = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("知识点名称不能为空");
      clean.title = title;
    }
    if (patch.summary !== undefined) clean.summary = patch.summary.trim();
    if (patch.detail !== undefined) clean.detail = patch.detail.replace(/\r\n/g, "\n");

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

  moveNode: async (nodeId, patch) => {
    const userId = currentUserId();
    const previous = get().nodes;
    set({
      nodes: previous.map((node) =>
        node.id === nodeId ? { ...node, ...patch, updatedAt: nowIso() } : node,
      ),
    });
    try {
      await getRepo().updateNode(userId, nodeId, patch);
    } catch (error) {
      set({ nodes: previous });
      throw error;
    }
  },

  clearManualPosition: async (nodeId) => {
    await get().moveNode(nodeId, { manualPosition: null });
  },

  clearAllManualPositions: async () => {
    const userId = currentUserId();
    const previous = get().nodes;
    const targets = previous.filter((node) => node.manualPosition !== null);
    if (targets.length === 0) return;
    set({
      nodes: previous.map((node) =>
        node.manualPosition ? { ...node, manualPosition: null, updatedAt: nowIso() } : node,
      ),
    });
    try {
      for (const node of targets) {
        await getRepo().updateNode(userId, node.id, { manualPosition: null });
      }
    } catch (error) {
      set({ nodes: previous });
      throw error;
    }
  },

  addRelation: async ({ fromId, toId, type, confidence = 0.8, origin = "user" }) => {
    const userId = currentUserId();
    if (fromId === toId) throw new Error("不能把知识点连到它自己");
    if (!get().nodes.some((node) => node.id === fromId) || !get().nodes.some((node) => node.id === toId)) {
      throw new Error("关系两端的知识点必须存在");
    }
    const key = relationKey(type, fromId, toId);
    if (get().relations.some((relation) => relationKey(relation.type, relation.fromId, relation.toId) === key)) {
      throw new Error("这两个知识点之间已经有同类关系了");
    }
    const relation = makeRelation({ id: newId(), fromId, toId, type, confidence, origin });
    set((state) => ({ relations: dedupeRelations([...state.relations, relation]) }));
    try {
      await getRepo().insertRelations(userId, [relation]);
    } catch (error) {
      set((state) => ({ relations: state.relations.filter((item) => item.id !== relation.id) }));
      throw error;
    }
    return relation;
  },

  updateRelationType: async (relationId, type) => {
    const userId = currentUserId();
    const previous = get().relations;
    const current = previous.find((relation) => relation.id === relationId);
    if (!current) throw new Error("关系不存在");
    if (current.type === type) return;

    // 无向类型要按 id 重新排序，避免违反数据库方向约束。
    const pair = normalizePair(type, current.fromId, current.toId);
    const key = relationKey(type, pair.fromId, pair.toId);
    if (
      previous.some(
        (relation) =>
          relation.id !== relationId &&
          relationKey(relation.type, relation.fromId, relation.toId) === key,
      )
    ) {
      throw new Error("这两个知识点之间已经有同类关系了");
    }

    set({
      relations: previous.map((relation) =>
        relation.id === relationId
          ? { ...relation, type, fromId: pair.fromId, toId: pair.toId }
          : relation,
      ),
    });
    try {
      await getRepo().updateRelation(userId, relationId, {
        type,
        fromId: pair.fromId,
        toId: pair.toId,
      });
    } catch (error) {
      set({ relations: previous });
      throw error;
    }
  },

  deleteRelation: async (relationId) => {
    const userId = currentUserId();
    const previous = get().relations;
    set({ relations: previous.filter((relation) => relation.id !== relationId) });
    try {
      await getRepo().deleteRelation(userId, relationId);
    } catch (error) {
      set({ relations: previous });
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
