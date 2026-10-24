"use client";

import { create } from "zustand";
import { buildSeedGraph } from "@/data/seed";
import { newId, nowIso } from "@/lib/ids";
import { reindexNode } from "@/lib/ai/nodeIndex";
import { findChildByTitle, reparentError, validatePathSegments } from "@/lib/path";
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
  addSource: (input: {
    question: string;
    answer: string;
    /** 本次提问是否带图：只影响 sources.kind，图片本身不上传云端。 */
    hasImage?: boolean;
  }) => Promise<Source>;
  adopt: (input: {
    suggestion: Suggestion;
    parentId: string | null;
    title: string;
    summary: string;
    /** 用户显式选过位置（含新建父级路径）时直接归位，不再因 AI 置信度低进入待处理。 */
    forceActive?: boolean;
  }) => Promise<{ nodeId: string; status: NodeStatus; reused: boolean }>;
  /**
   * 新建（或复用）一条父级路径：例如 ["物理", "电学"]。
   * 同父级下同名节点会复用；缺失的逐级创建，返回路径末端节点 id。
   */
  createPath: (
    segments: string[],
    options?: { blockedIds?: string[] },
  ) => Promise<{ leafId: string; created: KnowledgeNode[] }>;
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

  addSource: async ({ question, answer, hasImage = false }) => {
    const userId = currentUserId();
    const source: Source = {
      id: newId(),
      kind: hasImage ? "image" : "chat",
      question,
      answer,
      imagePath: null,
      createdAt: nowIso(),
    };
    await getRepo().insertSource(userId, source);
    set((state) => ({ sources: [...state.sources, source] }));
    return source;
  },

  adopt: async ({ suggestion, parentId, title, summary, forceActive = false }) => {
    const userId = currentUserId();
    const cleanTitle = title.trim();
    const cleanSummary = summary.trim();
    if (!cleanTitle) throw new Error("知识点名称不能为空");

    // 同一父级下已有同名知识点：复用已有节点，只补来源与关系。
    // 数据库有 (user_id, parent_id, lower(title)) 唯一索引，直接插入会撞唯一约束。
    const existing = findChildByTitle(get().nodes, parentId, cleanTitle);
    if (existing) {
      const links: NodeSource[] = [];
      if (suggestion.sourceId) {
        const alreadyLinked = get().nodeSources.some(
          (link) => link.nodeId === existing.id && link.sourceId === suggestion.sourceId,
        );
        if (!alreadyLinked) links.push({ nodeId: existing.id, sourceId: suggestion.sourceId });
      }

      const takenKeys = new Set(
        get().relations.map((relation) =>
          relationKey(relation.type, relation.fromId, relation.toId),
        ),
      );
      const relations: Relation[] = [];
      for (const relation of suggestion.relations) {
        const targetId = relation.targetNodeId;
        if (!targetId || targetId === existing.id) continue;
        if (!get().nodes.some((node) => node.id === targetId)) continue;
        const key = relationKey(relation.type, existing.id, targetId);
        if (takenKeys.has(key)) continue;
        takenKeys.add(key);
        relations.push(
          makeRelation({
            id: newId(),
            fromId: existing.id,
            toId: targetId,
            type: relation.type,
            confidence: relation.confidence,
            origin: "ai",
          }),
        );
      }

      // 已有节点摘要为空时才用本次抽取补上，不覆盖用户写过的内容。
      const fillSummary = !existing.summary.trim() && cleanSummary.length > 0;
      const previous = get();
      set((state) => ({
        nodes: fillSummary
          ? state.nodes.map((node) =>
              node.id === existing.id
                ? { ...node, summary: cleanSummary, updatedAt: nowIso() }
                : node,
            )
          : state.nodes,
        relations: dedupeRelations([...state.relations, ...relations]),
        nodeSources: [...state.nodeSources, ...links],
      }));

      try {
        if (links.length > 0) await getRepo().insertNodeSources(userId, links);
        if (relations.length > 0) await getRepo().insertRelations(userId, relations);
        if (fillSummary) {
          await getRepo().updateNode(userId, existing.id, { summary: cleanSummary });
        }
      } catch (error) {
        set({
          nodes: previous.nodes,
          relations: previous.relations,
          nodeSources: previous.nodeSources,
        });
        throw error;
      }

      if (fillSummary) reindexNode({ ...existing, summary: cleanSummary });
      return { nodeId: existing.id, status: existing.status, reused: true };
    }

    // 用户显式选过位置（含新建父级路径）就视为已归位；否则没有选到父节点时（尤其图谱已有数据）
    // 先进入待处理，避免把临时条目当成"学科"挂在顶层。
    const status: NodeStatus = forceActive
      ? "active"
      : parentId === null && get().nodes.length > 0
        ? "inbox"
        : suggestion.confidence >= 0.75
          ? "active"
          : "inbox";
    const createdAt = nowIso();
    const node: KnowledgeNode = {
      id: newId(),
      parentId,
      title: cleanTitle,
      summary: cleanSummary,
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

    // 收编成功后在后台补向量；失败只记日志，不阻塞收编流程。
    reindexNode(node);
    return { nodeId: node.id, status, reused: false };
  },

  createPath: async (segments, options) => {
    const userId = currentUserId();
    const clean = segments.map((segment) => segment.trim()).filter(Boolean);
    const invalid = validatePathSegments(clean);
    if (invalid) throw new Error(invalid);

    const blocked = new Set(options?.blockedIds ?? []);
    const created: KnowledgeNode[] = [];
    let parentId: string | null = null;

    try {
      for (const title of clean) {
        const existing = findChildByTitle(get().nodes, parentId, title);
        if (existing) {
          if (blocked.has(existing.id)) {
            throw new Error(`路径里的「${title}」正是当前节点或其子节点，换一个路径试试`);
          }
          parentId = existing.id;
          continue;
        }

        const createdAt = nowIso();
        const node: KnowledgeNode = {
          id: newId(),
          parentId,
          title,
          summary: "",
          detail: "",
          manualPosition: null,
          status: "active",
          aliases: [],
          mastery: null,
          createdAt,
          updatedAt: createdAt,
        };
        // 父级先于子级写入（自引用外键），本地先乐观插入；
        // 先记录到 created，保证 insert 失败时也能从 state 回滚这一条。
        set((state) => ({ nodes: [...state.nodes, node] }));
        created.push(node);
        await getRepo().insertNode(userId, node);
        parentId = node.id;
      }
    } catch (error) {
      // 任一环节失败：回滚本次创建的全部节点，避免留下半截路径。
      if (created.length > 0) {
        const createdIds = new Set(created.map((node) => node.id));
        set((state) => ({ nodes: state.nodes.filter((node) => !createdIds.has(node.id)) }));
        for (const node of [...created].reverse()) {
          await getRepo()
            .deleteNode(userId, node.id)
            .catch(() => {});
        }
      }
      throw error;
    }

    // 新建的结构性节点也补向量（未配置向量服务时内部直接跳过）。
    for (const node of created) reindexNode(node);
    return { leafId: parentId as string, created };
  },

  reparent: async (nodeId, parentId) => {
    const userId = currentUserId();
    // 循环守卫下沉到 store：UI（拖拽 / 位置选择器）之外还有首页、详情页等调用方。
    const invalid = reparentError(get().nodes, nodeId, parentId);
    if (invalid) throw new Error(invalid);
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

    // 标题/摘要变化会改变语义，后台重算向量（detail 变化不影响 embedding）。
    if (clean.title !== undefined || clean.summary !== undefined) {
      const updated = get().nodes.find((node) => node.id === nodeId);
      if (updated) reindexNode(updated);
    }
  },

  moveNode: async (nodeId, patch) => {
    const userId = currentUserId();
    if (patch.parentId !== undefined) {
      const invalid = reparentError(get().nodes, nodeId, patch.parentId ?? null);
      if (invalid) throw new Error(invalid);
    }
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
      // 示例图谱替换整张图，旧来源也随之失效。
      await getRepo().deleteAllSources(userId);
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
    // 节点没了，来源也不再被任何知识点引用：一并删掉，避免 sources 无限累积。
    await getRepo().deleteAllSources(userId);
    set({ nodes: [], relations: [], sources: [], nodeSources: [] });
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
