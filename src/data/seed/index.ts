import { makeRelation } from "@/lib/relations";
import { newId } from "@/lib/ids";
import type { GraphData, KnowledgeNode, SeedNodeDef, SeedRelationDef } from "@/types";
import { SEED_NODES } from "./nodes";
import { SEED_RELATIONS } from "./relations";

export { SEED_NODES, SEED_RELATIONS };

const SEED_CREATED_AT = "2026-01-01T00:00:00.000Z";

/** 把示例定义展开成领域对象：sid → uuid，关系随之映射。 */
export function buildSeedGraph(): GraphData {
  const idBySid = new Map<string, string>();
  for (const def of SEED_NODES) idBySid.set(def.sid, newId());

  const nodes: KnowledgeNode[] = SEED_NODES.map((def: SeedNodeDef) => ({
    id: idBySid.get(def.sid)!,
    parentId: def.parentSid ? (idBySid.get(def.parentSid) ?? null) : null,
    title: def.title,
    summary: def.summary,
    status: "active",
    aliases: def.aliases ?? [],
    mastery: null,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  }));

  const relations = SEED_RELATIONS.flatMap((def: SeedRelationDef) => {
    const fromId = idBySid.get(def.fromSid);
    const toId = idBySid.get(def.toSid);
    if (!fromId || !toId) return [];
    return [
      makeRelation({
        id: newId(),
        fromId,
        toId,
        type: def.type,
        confidence: def.confidence ?? 0.8,
        origin: "seed",
        createdAt: SEED_CREATED_AT,
      }),
    ];
  });

  return { nodes, relations, sources: [], nodeSources: [] };
}

export const SEED_NODE_COUNT = SEED_NODES.length;
