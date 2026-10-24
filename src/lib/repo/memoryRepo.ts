import { buildSeedGraph } from "@/data/seed";
import { mockAnswerFor, mockExtract } from "@/lib/ai/mock";
import { newId, nowIso } from "@/lib/ids";
import { dedupeRelations, makeRelation } from "@/lib/relations";
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
import { sortConversations } from "@/lib/conversations";
import type { DataRepo, MatchNodesInput, NodeUpdatePatch } from "./types";

/**
 * 演示模式的内存仓库：不连接 Supabase，也没有任何持久化，
 * 仅用于在未配置云端时查看完整 UI 与交互流程。
 */
export class MemoryRepo implements DataRepo {
  readonly kind = "memory" as const;

  private graph: GraphData;
  private messages: ChatMessage[] = [];
  private conversations: Conversation[] = [];

  constructor() {
    this.graph = buildSeedGraph();
    this.seedDemoConversation();
  }

  private seedDemoConversation(): void {
    const question = "电阻并联怎么算？";
    const answer = mockAnswerFor(question);
    const conversationId = newId();
    const createdAt = nowIso();
    this.conversations = [
      {
        id: conversationId,
        title: question,
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const source: Source = {
      id: newId(),
      kind: "chat",
      question,
      answer,
      imagePath: null,
      createdAt: nowIso(),
    };
    this.graph.sources.push(source);
    const suggestions = mockExtract(question, this.graph.nodes, source.id);
    this.messages = [
      {
        id: newId(),
        role: "user",
        content: question,
        imageName: null,
        conversationId,
        payload: {},
        createdAt: nowIso(),
      },
      {
        id: newId(),
        role: "assistant",
        content: answer,
        imageName: null,
        conversationId,
        payload: { suggestions },
        createdAt: nowIso(),
      },
    ];

    // 造一条「已收下、待归位」的知识点，便于演示收件箱。
    const chapter = this.graph.nodes.find((node) => node.title === "电学");
    const inboxNode: KnowledgeNode = {
      id: newId(),
      parentId: chapter?.id ?? null,
      title: "电路故障分析",
      summary: "来自一次提问的临时知识点，还没有确认放在哪一节。",
      detail: "",
      manualPosition: null,
      status: "inbox",
      aliases: ["电路故障"],
      mastery: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.graph.nodes.push(inboxNode);
  }

  async loadGraph(): Promise<GraphData> {
    return {
      nodes: [...this.graph.nodes],
      relations: [...this.graph.relations],
      sources: [...this.graph.sources],
      nodeSources: [...this.graph.nodeSources],
    };
  }

  async loadMessages(_userId: string, conversationId: string): Promise<ChatMessage[]> {
    return this.messages.filter((message) => message.conversationId === conversationId);
  }

  async loadConversations(): Promise<Conversation[]> {
    return sortConversations(this.conversations);
  }

  async insertConversation(_userId: string, conversation: Conversation): Promise<void> {
    this.conversations.push(conversation);
  }

  async updateConversation(
    _userId: string,
    conversationId: string,
    patch: Partial<Pick<Conversation, "title" | "updatedAt">>,
  ): Promise<void> {
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, ...patch } : conversation,
    );
  }

  async deleteConversation(_userId: string, conversationId: string): Promise<void> {
    this.conversations = this.conversations.filter((conversation) => conversation.id !== conversationId);
    this.messages = this.messages.filter((message) => message.conversationId !== conversationId);
  }

  async clearConversations(): Promise<void> {
    this.conversations = [];
    this.messages = [];
  }

  async insertNode(_userId: string, node: KnowledgeNode): Promise<void> {
    this.graph.nodes.push(node);
  }

  async insertNodes(_userId: string, nodes: KnowledgeNode[]): Promise<void> {
    this.graph.nodes.push(...nodes);
  }

  async updateNode(
    _userId: string,
    nodeId: string,
    patch: NodeUpdatePatch,
  ): Promise<void> {
    this.graph.nodes = this.graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...patch, updatedAt: nowIso() } : node,
    );
  }

  async deleteNode(_userId: string, nodeId: string): Promise<void> {
    const descendants = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of this.graph.nodes) {
        if (node.parentId && descendants.has(node.parentId) && !descendants.has(node.id)) {
          descendants.add(node.id);
          changed = true;
        }
      }
    }
    this.graph.nodes = this.graph.nodes.filter((node) => !descendants.has(node.id));
    this.graph.relations = this.graph.relations.filter(
      (relation) => !descendants.has(relation.fromId) && !descendants.has(relation.toId),
    );
    this.graph.nodeSources = this.graph.nodeSources.filter((link) => !descendants.has(link.nodeId));
  }

  async deleteAllNodes(): Promise<void> {
    this.graph.nodes = [];
    this.graph.relations = [];
    this.graph.nodeSources = [];
  }

  async insertRelations(_userId: string, relations: Relation[]): Promise<void> {
    const merged = dedupeRelations([...this.graph.relations, ...relations]);
    this.graph.relations = merged;
  }

  async updateRelation(
    _userId: string,
    relationId: string,
    patch: Partial<Pick<Relation, "type" | "confidence" | "fromId" | "toId">>,
  ): Promise<void> {
    this.graph.relations = this.graph.relations.map((relation) =>
      relation.id === relationId ? { ...relation, ...patch } : relation,
    );
  }

  async deleteRelation(_userId: string, relationId: string): Promise<void> {
    this.graph.relations = this.graph.relations.filter((relation) => relation.id !== relationId);
  }

  async insertSource(_userId: string, source: Source): Promise<void> {
    this.graph.sources.push(source);
  }

  async insertNodeSources(_userId: string, links: NodeSource[]): Promise<void> {
    const seen = new Set(this.graph.nodeSources.map((link) => `${link.nodeId}:${link.sourceId}`));
    for (const link of links) {
      const key = `${link.nodeId}:${link.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.graph.nodeSources.push(link);
    }
  }

  async insertMessage(_userId: string, message: ChatMessage): Promise<void> {
    this.messages.push(message);
  }

  async updateMessagePayload(
    _userId: string,
    messageId: string,
    payload: MessagePayload,
  ): Promise<void> {
    this.messages = this.messages.map((message) =>
      message.id === messageId ? { ...message, payload } : message,
    );
  }

  async ensureProfile(): Promise<void> {
    // 内存模式没有账号体系，忽略。
  }

  /** 内存模式没有向量索引：命中与候选自动退回关键词。 */
  async matchNodesByVector(_input: MatchNodesInput): Promise<VectorMatch[]> {
    return [];
  }

  async setNodeEmbedding(_input: {
    nodeId: string;
    embedding: number[];
    model: string;
  }): Promise<void> {
    // 内存模式不保存向量。
  }

  async listNodesMissingEmbedding(_model: string): Promise<NodeIndexTarget[]> {
    return [];
  }

  async insertEvent(_userId: string, _event: AppEvent): Promise<void> {
    // 内存模式不落库；analytics 在演示模式自行 console.debug。
  }

  /** 仅演示模式使用：给「载入示例图谱」一个幂等的重建入口。 */
  resetToSeed(): void {
    this.graph = buildSeedGraph();
    this.seedDemoConversation();
  }

  /** 演示用的示例关系（测试与调试）。 */
  static sampleRelation(fromId: string, toId: string): Relation {
    return makeRelation({ id: newId(), fromId, toId, type: "related", origin: "seed" });
  }
}
