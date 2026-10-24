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

/** 节点可更新的字段。 */
export type NodeUpdatePatch = Partial<
  Pick<
    KnowledgeNode,
    "parentId" | "title" | "summary" | "status" | "detail" | "manualPosition"
  >
>;

/** 向量检索参数（用户范围由 RLS / auth.uid() 决定）。 */
export interface MatchNodesInput {
  embedding: number[];
  model: string;
  limit?: number;
  minSimilarity?: number;
}

/** 数据仓库接口：Supabase 实现之外，演示模式还有一份内存实现。 */
export interface DataRepo {
  readonly kind: "supabase" | "memory";
  loadGraph(userId: string): Promise<GraphData>;
  /** 会话列表（按最近更新倒序由实现返回或调用方排序）。 */
  loadConversations(userId: string): Promise<Conversation[]>;
  insertConversation(userId: string, conversation: Conversation): Promise<void>;
  updateConversation(
    userId: string,
    conversationId: string,
    patch: Partial<Pick<Conversation, "title" | "updatedAt">>,
  ): Promise<void>;
  deleteConversation(userId: string, conversationId: string): Promise<void>;
  /** 清空全部会话与消息（设置页「清空对话记录」）。 */
  clearConversations(userId: string): Promise<void>;
  /** 只加载指定会话的消息；新会话没有 id 时不调用。 */
  loadMessages(userId: string, conversationId: string): Promise<ChatMessage[]>;
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
  ensureProfile(userId: string): Promise<void>;
  /** 向量检索：由 RPC 按 auth.uid() 过滤，只返回当前模型生成的向量。 */
  matchNodesByVector(input: MatchNodesInput): Promise<VectorMatch[]>;
  /** 写入/覆盖节点向量；失败由调用方决定是否提示（命中链路只记日志）。 */
  setNodeEmbedding(input: {
    nodeId: string;
    embedding: number[];
    model: string;
  }): Promise<void>;
  /** 缺向量或向量模型不一致的节点（回填用）。 */
  listNodesMissingEmbedding(model: string): Promise<NodeIndexTarget[]>;
  /** 指标埋点事件。 */
  insertEvent(userId: string, event: AppEvent): Promise<void>;
}
