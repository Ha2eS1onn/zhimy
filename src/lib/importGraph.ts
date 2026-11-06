import type {
  GraphData,
  KnowledgeNode,
  NodeSource,
  Relation,
  RelationOrigin,
  RelationType,
  Source,
} from "@/types";
import { newId, nowIso } from "@/lib/ids";
import { normalizePair } from "@/lib/relations";

/** 导入 v1 JSON 备份：只做纯变换，写库由 graphStore 负责。 */

export interface ImportStats {
  nodes: number;
  reused: number;
  skipped: number;
  relations: number;
  sources: number;
  /** 父级在备份和当前图谱里都找不到、被提升为顶层的节点数。 */
  orphans: number;
}

export interface ImportPlan {
  nodes: KnowledgeNode[];
  relations: Relation[];
  sources: Source[];
  nodeSources: NodeSource[];
  stats: ImportStats;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const RELATION_TYPES: RelationType[] = ["prerequisite", "related", "contrast", "source"];
const RELATION_ORIGINS: RelationOrigin[] = ["seed", "ai", "user"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function iso(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
    ? value
    : nowIso();
}

function position(value: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function aliases(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mastery(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nodeKey(parentId: string | null, title: string): string {
  return `${parentId ?? "root"}|${title.trim().toLowerCase()}`;
}

function relationKeyFor(type: RelationType, fromId: string, toId: string): string {
  const pair = normalizePair(type, fromId, toId);
  return `${type}:${pair.fromId}:${pair.toId}`;
}

export function parseGraphJson(raw: string, existing: GraphData): ImportPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ImportError("文件不是合法的 JSON");
  }
  if (!isRecord(parsed) || parsed.app !== "zhimy") {
    throw new ImportError("不是知脉导出的备份文件");
  }
  if (parsed.version !== 1) {
    throw new ImportError("仅支持 v1 备份文件");
  }

  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const rawRelations = Array.isArray(parsed.relations) ? parsed.relations : [];
  const rawSources = Array.isArray(parsed.sources) ? parsed.sources : [];
  const rawLinks = Array.isArray(parsed.nodeSources) ? parsed.nodeSources : [];

  const existingNodeIds = new Set(existing.nodes.map((node) => node.id));
  const existingByKey = new Map<string, KnowledgeNode>();
  for (const node of existing.nodes) {
    existingByKey.set(nodeKey(node.parentId, node.title), node);
  }

  const idMap = new Map<string, string>();
  const plannedByKey = new Map<string, KnowledgeNode>();
  const nodes: KnowledgeNode[] = [];
  let reused = 0;
  let skipped = 0;
  let orphans = 0;

  interface PendingNode {
    id: string;
    title: string;
    parentId: string | null;
    raw: Record<string, unknown>;
  }

  const pending: PendingNode[] = [];
  for (const item of rawNodes) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }
    const id = text(item.id);
    const title = text(item.title).trim();
    if (!id || !title) {
      skipped += 1;
      continue;
    }
    if (existingNodeIds.has(id)) {
      idMap.set(id, id);
      reused += 1;
      continue;
    }
    pending.push({ id, title, parentId: textOrNull(item.parentId), raw: item });
  }

  const createNode = (entry: PendingNode, parentId: string | null): void => {
    // 统一重新生成 UUID：备份里的 id 可能是手改的字符串，而数据库列是 uuid。
    const id = newId();
    const node: KnowledgeNode = {
      id,
      parentId,
      title: entry.title,
      summary: text(entry.raw.summary),
      detail: text(entry.raw.detail),
      manualPosition: position(entry.raw.manualPosition),
      status: entry.raw.status === "inbox" ? "inbox" : "active",
      aliases: aliases(entry.raw.aliases),
      mastery: mastery(entry.raw.mastery),
      createdAt: iso(entry.raw.createdAt),
      updatedAt: iso(entry.raw.updatedAt),
    };
    nodes.push(node);
    plannedByKey.set(nodeKey(parentId, entry.title), node);
    idMap.set(entry.id, id);
  };

  // 按父链分轮处理：父节点还没解析时先延后，支持子节点排在父节点之前的备份。
  let remaining = pending;
  while (remaining.length > 0) {
    const next: PendingNode[] = [];
    const remainingIds = new Set(remaining.map((item) => item.id));
    let progressed = false;
    for (const entry of remaining) {
      const parentId = entry.parentId;
      const parentPending = parentId ? remainingIds.has(parentId) : false;
      if (parentPending && parentId && !idMap.has(parentId)) {
        next.push(entry);
        continue;
      }
      const mappedParent = parentId ? (idMap.get(parentId) ?? null) : null;
      const parentMissing = Boolean(parentId && !mappedParent);
      const key = nodeKey(mappedParent, entry.title);
      const existingSame = existingByKey.get(key);
      if (existingSame) {
        idMap.set(entry.id, existingSame.id);
        reused += 1;
        progressed = true;
        continue;
      }
      const plannedSame = plannedByKey.get(key);
      if (plannedSame) {
        idMap.set(entry.id, plannedSame.id);
        reused += 1;
        progressed = true;
        continue;
      }
      createNode(entry, mappedParent);
      if (parentMissing) orphans += 1;
      progressed = true;
    }
    if (!progressed) {
      // 剩余的是循环引用或无法解析的父链：全部提升为顶层。
      for (const entry of next) {
        const key = nodeKey(null, entry.title);
        const existingSame = existingByKey.get(key);
        if (existingSame) {
          idMap.set(entry.id, existingSame.id);
          reused += 1;
          continue;
        }
        const plannedSame = plannedByKey.get(key);
        if (plannedSame) {
          idMap.set(entry.id, plannedSame.id);
          reused += 1;
          continue;
        }
        createNode(entry, null);
        orphans += 1;
      }
      break;
    }
    remaining = next;
  }

  const relationKeys = new Set(
    existing.relations.map((relation) =>
      relationKeyFor(relation.type, relation.fromId, relation.toId),
    ),
  );
  const relations: Relation[] = [];
  for (const item of rawRelations) {
    if (!isRecord(item)) continue;
    const type = RELATION_TYPES.includes(item.type as RelationType)
      ? (item.type as RelationType)
      : null;
    if (!type) continue;
    const fromId = idMap.get(text(item.fromId));
    const toId = idMap.get(text(item.toId));
    if (!fromId || !toId || fromId === toId) continue;
    const pair = normalizePair(type, fromId, toId);
    const key = relationKeyFor(type, pair.fromId, pair.toId);
    if (relationKeys.has(key)) continue;
    relationKeys.add(key);
    relations.push({
      id: newId(),
      fromId: pair.fromId,
      toId: pair.toId,
      type,
      confidence: Math.min(1, Math.max(0, numberOr(item.confidence, 0.8))),
      origin: RELATION_ORIGINS.includes(item.origin as RelationOrigin)
        ? (item.origin as RelationOrigin)
        : "user",
      createdAt: iso(item.createdAt),
    });
  }

  const existingSourceIds = new Set(existing.sources.map((source) => source.id));
  const allSourceIds = new Set(existingSourceIds);
  const sourceIdMap = new Map<string, string>();
  const sources: Source[] = [];
  for (const item of rawSources) {
    if (!isRecord(item)) continue;
    const id = text(item.id);
    if (!id) continue;
    if (existingSourceIds.has(id)) {
      sourceIdMap.set(id, id);
      continue;
    }
    if (sourceIdMap.has(id)) continue;
    const sourceId = newId();
    const source: Source = {
      id: sourceId,
      kind: item.kind === "image" ? "image" : "chat",
      question: text(item.question),
      answer: text(item.answer),
      imagePath: textOrNull(item.imagePath),
      createdAt: iso(item.createdAt),
    };
    sources.push(source);
    allSourceIds.add(sourceId);
    sourceIdMap.set(id, sourceId);
  }

  const allNodeIds = new Set([...existingNodeIds, ...nodes.map((node) => node.id)]);
  const linkKeys = new Set(
    existing.nodeSources.map((link) => `${link.nodeId}:${link.sourceId}`),
  );
  const nodeSources: NodeSource[] = [];
  for (const item of rawLinks) {
    if (!isRecord(item)) continue;
    const nodeId = idMap.get(text(item.nodeId));
    const sourceId = sourceIdMap.get(text(item.sourceId));
    if (!nodeId || !sourceId) continue;
    if (!allNodeIds.has(nodeId) || !allSourceIds.has(sourceId)) continue;
    const key = `${nodeId}:${sourceId}`;
    if (linkKeys.has(key)) continue;
    linkKeys.add(key);
    nodeSources.push({ nodeId, sourceId });
  }

  return {
    nodes,
    relations,
    sources,
    nodeSources,
    stats: {
      nodes: nodes.length,
      reused,
      skipped,
      relations: relations.length,
      sources: sources.length,
      orphans,
    },
  };
}
