import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeRelations } from "@/lib/relations";
import type {
  ChatMessage,
  GraphData,
  KnowledgeNode,
  MessagePayload,
  NodeSource,
  Relation,
  Source,
} from "@/types";
import type { DataRepo } from "./types";
import {
  messageFromRow,
  messageToRow,
  nodeFromRow,
  nodeSourceFromRow,
  nodeSourceToRow,
  nodeToRow,
  relationFromRow,
  relationToRow,
  sourceFromRow,
  sourceToRow,
  type MessageRow,
  type NodeRow,
  type NodeSourceRow,
  type RelationRow,
  type SourceRow,
} from "./mappers";

type GetClient = () => SupabaseClient | null;

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function rows<T>(result: QueryResult<unknown>): T[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

function ensure(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/** Supabase 端实现：所有查询都走 RLS（user_id = auth.uid()），客户端拿 anon key。 */
export function createSupabaseRepo(getClient: GetClient): DataRepo {
  return {
    kind: "supabase",

    async loadGraph(userId: string): Promise<GraphData> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const [nodesRes, relationsRes, sourcesRes, linksRes] = await Promise.all([
        client.from("nodes").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        client
          .from("relations")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        client
          .from("sources")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        client.from("node_sources").select("*").eq("user_id", userId),
      ]);
      return {
        nodes: rows<NodeRow>(nodesRes).map(nodeFromRow),
        relations: rows<RelationRow>(relationsRes).map(relationFromRow),
        sources: rows<SourceRow>(sourcesRes).map(sourceFromRow),
        nodeSources: rows<NodeSourceRow>(linksRes).map(nodeSourceFromRow),
      };
    },

    async loadMessages(userId: string): Promise<ChatMessage[]> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const result = await client
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      return rows<MessageRow>(result).map(messageFromRow);
    },

    async insertNode(userId: string, node: KnowledgeNode): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("nodes").insert(nodeToRow(userId, node)));
    },

    async insertNodes(userId: string, nodes: KnowledgeNode[]): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const depthCache = new Map<string, number>();
      const depthOf = (node: KnowledgeNode): number => {
        const cached = depthCache.get(node.id);
        if (cached) return cached;
        let depth = 1;
        let parentId = node.parentId;
        const guard = new Set<string>([node.id]);
        while (parentId && guard.size < 64) {
          const parent = byId.get(parentId);
          if (!parent || guard.has(parent.id)) break;
          guard.add(parent.id);
          depth += 1;
          parentId = parent.parentId;
        }
        depthCache.set(node.id, depth);
        return depth;
      };

      const levels = new Map<number, KnowledgeNode[]>();
      for (const node of nodes) {
        const depth = depthOf(node);
        const list = levels.get(depth);
        if (list) list.push(node);
        else levels.set(depth, [node]);
      }
      const sortedDepths = Array.from(levels.keys()).sort((a, b) => a - b);
      for (const depth of sortedDepths) {
        const batch = levels.get(depth)!;
        ensure(await client.from("nodes").insert(batch.map((node) => nodeToRow(userId, node))));
      }
    },

    async updateNode(
      userId: string,
      nodeId: string,
      patch: Partial<Pick<KnowledgeNode, "parentId" | "title" | "summary" | "status">>,
    ): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.parentId !== undefined) row.parent_id = patch.parentId;
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.summary !== undefined) row.summary = patch.summary;
      if (patch.status !== undefined) row.status = patch.status;
      ensure(await client.from("nodes").update(row).eq("id", nodeId).eq("user_id", userId));
    },

    async deleteNode(userId: string, nodeId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("nodes").delete().eq("id", nodeId).eq("user_id", userId));
    },

    async deleteAllNodes(userId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("nodes").delete().eq("user_id", userId));
    },

    async insertRelations(userId: string, relations: Relation[]): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const payload = dedupeRelations(relations).map((relation) => relationToRow(userId, relation));
      if (payload.length === 0) return;
      ensure(
        await client
          .from("relations")
          .upsert(payload, { onConflict: "user_id,from_node,to_node,type", ignoreDuplicates: true }),
      );
    },

    async insertSource(userId: string, source: Source): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("sources").insert(sourceToRow(userId, source)));
    },

    async insertNodeSources(userId: string, links: NodeSource[]): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      if (links.length === 0) return;
      ensure(
        await client
          .from("node_sources")
          .upsert(links.map((link) => nodeSourceToRow(userId, link)), {
            onConflict: "node_id,source_id",
            ignoreDuplicates: true,
          }),
      );
    },

    async insertMessage(userId: string, message: ChatMessage): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("chat_messages").insert(messageToRow(userId, message)));
    },

    async updateMessagePayload(
      userId: string,
      messageId: string,
      payload: MessagePayload,
    ): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(
        await client
          .from("chat_messages")
          .update({ payload })
          .eq("id", messageId)
          .eq("user_id", userId),
      );
    },

    async clearMessages(userId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("chat_messages").delete().eq("user_id", userId));
    },

    async ensureProfile(userId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(
        await client
          .from("profiles")
          .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }),
      );
    },
  };
}
