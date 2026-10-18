import type {
  ChatMessage,
  GraphData,
  KnowledgeNode,
  MessagePayload,
  NodeSource,
  Relation,
  Source,
} from "@/types";

/** 节点可更新的字段。 */
export type NodeUpdatePatch = Partial<
  Pick<
    KnowledgeNode,
    "parentId" | "title" | "summary" | "status" | "detail" | "manualPosition"
  >
>;

/** 数据仓库接口：Supabase 实现之外，演示模式还有一份内存实现。 */
export interface DataRepo {
  readonly kind: "supabase" | "memory";
  loadGraph(userId: string): Promise<GraphData>;
  loadMessages(userId: string): Promise<ChatMessage[]>;
  insertNode(userId: string, node: KnowledgeNode): Promise<void>;
  /** 按深度逐层插入，保证父节点先于子节点写入（自引用外键）。 */
  insertNodes(userId: string, nodes: KnowledgeNode[]): Promise<void>;
  updateNode(userId: string, nodeId: string, patch: NodeUpdatePatch): Promise<void>;
  deleteNode(userId: string, nodeId: string): Promise<void>;
  deleteAllNodes(userId: string): Promise<void>;
  insertRelations(userId: string, relations: Relation[]): Promise<void>;
  updateRelation(
    userId: string,
    relationId: string,
    patch: Partial<Pick<Relation, "type" | "confidence" | "fromId" | "toId">>,
  ): Promise<void>;
  deleteRelation(userId: string, relationId: string): Promise<void>;
  insertSource(userId: string, source: Source): Promise<void>;
  insertNodeSources(userId: string, links: NodeSource[]): Promise<void>;
  insertMessage(userId: string, message: ChatMessage): Promise<void>;
  updateMessagePayload(userId: string, messageId: string, payload: MessagePayload): Promise<void>;
  clearMessages(userId: string): Promise<void>;
  ensureProfile(userId: string): Promise<void>;
}
