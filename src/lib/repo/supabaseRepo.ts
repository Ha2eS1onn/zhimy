import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeRelations } from "@/lib/relations";
import type {
  AppEvent,
  ChatMessage,
  Conversation,
  GraphData,
  KnowledgeNode,
  MessagePayload,
  NodeIndexTarget,
  NodeSource,
  Relation,
  Source,
  VectorMatch,
} from "@/types";
import type { DataRepo, MatchNodesInput, NodeUpdatePatch } from "./types";
import {
  conversationFromRow,
  conversationToRow,
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
  type ConversationRow,
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

/**
 * 显式列清单：绝不能 select("*")，否则会把 1024 维的 embedding 一起拉到前端。
 * 向量只在服务端 RPC 内部使用。
 */
const NODE_COLUMNS =
  "id,user_id,parent_id,title,summary,detail,manual_position,status,aliases,mastery,created_at,updated_at";

/** Supabase 端实现：所有查询都走 RLS（user_id = auth.uid()），客户端拿 anon key。 */
export function createSupabaseRepo(getClient: GetClient): DataRepo {
  return {
    kind: "supabase",

    async loadGraph(userId: string): Promise<GraphData> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const [nodesRes, relationsRes, sourcesRes, linksRes] = await Promise.all([
        client
          .from("nodes")
          .select(NODE_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
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

    async loadMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const result = await client
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      return rows<MessageRow>(result).map(messageFromRow);
    },

    async loadConversations(userId: string): Promise<Conversation[]> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const result = await client
        .from("conversations")
        .select("id,user_id,title,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      return rows<ConversationRow>(result).map(conversationFromRow);
    },

    async insertConversation(userId: string, conversation: Conversation): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(await client.from("conversations").insert(conversationToRow(userId, conversation)));
    },

    async updateConversation(
      userId: string,
      conversationId: string,
      patch: Partial<Pick<Conversation, "title" | "updatedAt">>,
    ): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
      if (Object.keys(row).length === 0) return;
      ensure(
        await client
          .from("conversations")
          .update(row)
          .eq("id", conversationId)
          .eq("user_id", userId),
      );
    },

    async deleteConversation(userId: string, conversationId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(
        await client
          .from("conversations")
          .delete()
          .eq("id", conversationId)
          .eq("user_id", userId),
      );
    },

    async clearConversations(userId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      // 先删消息，兼容迁移前可能存在的 conversation_id 为空的历史行；再删会话。
      ensure(await client.from("chat_messages").delete().eq("user_id", userId));
      ensure(await client.from("conversations").delete().eq("user_id", userId));
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
      patch: NodeUpdatePatch,
    ): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.parentId !== undefined) row.parent_id = patch.parentId;
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.summary !== undefined) row.summary = patch.summary;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.detail !== undefined) row.detail = patch.detail;
      if (patch.manualPosition !== undefined) row.manual_position = patch.manualPosition;
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

    async updateRelation(
      userId: string,
      relationId: string,
      patch: Partial<Pick<Relation, "type" | "confidence" | "fromId" | "toId">>,
    ): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const row: Record<string, unknown> = {};
      if (patch.type !== undefined) row.type = patch.type;
      if (patch.confidence !== undefined) row.confidence = patch.confidence;
      if (patch.fromId !== undefined) row.from_node = patch.fromId;
      if (patch.toId !== undefined) row.to_node = patch.toId;
      ensure(
        await client
          .from("relations")
          .update(row)
          .eq("id", relationId)
          .eq("user_id", userId),
      );
    },

    async deleteRelation(userId: string, relationId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(
        await client.from("relations").delete().eq("id", relationId).eq("user_id", userId),
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

    async ensureProfile(userId: string): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(
        await client
          .from("profiles")
          .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }),
      );
    },

    async matchNodesByVector(input: MatchNodesInput): Promise<VectorMatch[]> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const result = await client.rpc("match_nodes", {
        query_embedding: input.embedding,
        match_count: input.limit ?? 8,
        min_similarity: input.minSimilarity ?? 0,
        p_model: input.model,
      });
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data ?? []) as Array<{
        node_id: string;
        title: string;
        summary: string;
        similarity: number;
      }>;
      return rows.map((row) => ({
        nodeId: row.node_id,
        title: row.title,
        summary: row.summary ?? "",
        similarity: row.similarity,
      }));
    },

    async setNodeEmbedding(input: {
      nodeId: string;
      embedding: number[];
      model: string;
    }): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const result = await client.rpc("set_node_embedding", {
        p_node_id: input.nodeId,
        p_embedding: input.embedding,
        p_model: input.model,
      });
      if (result.error) throw new Error(result.error.message);
    },

    async listNodesMissingEmbedding(model: string): Promise<NodeIndexTarget[]> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      const result = await client.rpc("list_nodes_missing_embedding", { p_model: model });
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data ?? []) as NodeIndexTarget[];
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary ?? "",
      }));
    },

    async insertEvent(userId: string, event: AppEvent): Promise<void> {
      const client = getClient();
      if (!client) throw new Error("Supabase 未配置");
      ensure(
        await client.from("events").insert({
          id: event.id,
          user_id: userId,
          name: event.name,
          props: event.props,
          created_at: event.createdAt,
        }),
      );
    },
  };
}
