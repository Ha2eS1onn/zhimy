/** 知脉领域模型：与数据库行结构解耦，渲染层只依赖这里的类型。 */

export type RelationType = "prerequisite" | "related" | "contrast" | "source";
export type RelationOrigin = "seed" | "ai" | "user";
export type NodeStatus = "active" | "inbox";
export type ChatRole = "user" | "assistant";

/** 知识点节点。id 是身份，parentId 决定地址；路径不落库，运行时沿父链拼装。 */
export interface KnowledgeNode {
  id: string;
  parentId: string | null;
  title: string;
  summary: string;
  /** 用户在详情页编辑/补充的 Markdown-lite 完整讲解。 */
  detail: string;
  /** 手动拖拽后固定的空间位置；null 表示继续使用自动球壳布局。 */
  manualPosition: { x: number; y: number; z: number } | null;
  status: NodeStatus;
  aliases: string[];
  mastery: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 四类关系；related / contrast 无向，入库前按 id 规范化方向。 */
export interface Relation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  confidence: number;
  origin: RelationOrigin;
  createdAt: string;
}

/** 一次问答 / 一张图，是知识点的来源。 */
export interface Source {
  id: string;
  kind: "chat" | "image";
  question: string;
  answer: string;
  imagePath: string | null;
  createdAt: string;
}

export interface NodeSource {
  nodeId: string;
  sourceId: string;
}

/** AI 提议的一条关系；targetNodeId 为空表示目标节点尚不存在（P0 跳过）。 */
export interface SuggestionRelation {
  type: RelationType;
  targetNodeId: string | null;
  targetTitle: string;
  confidence: number;
}

/** 收编卡片：一次抽取产出的知识点建议。 */
export interface Suggestion {
  id: string;
  title: string;
  summary: string;
  suggestedParentId: string | null;
  confidence: number;
  relations: SuggestionRelation[];
  sourceId: string | null;
  status: "pending" | "adopted" | "dismissed";
  adoptedNodeId?: string | null;
}

export interface MessagePayload {
  hit?: { nodeId: string; score: number } | null;
  suggestions?: Suggestion[];
  /**
   * 模型返回的思维链（部分服务商会在 reasoning_content / reasoning 里给出）。
   * 只存当前账号的 chat_messages.payload，不写入 events；换设备登录仍可见。
   */
  reasoning?: string;
}

/** 一段独立对话；chat_messages 通过 conversationId 归属到会话。 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  imageName: string | null;
  /** 所属会话；旧数据在 db:init 时回填到「历史对话」。 */
  conversationId: string | null;
  payload: MessagePayload;
  createdAt: string;
}

export interface AppUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  createdAt: string | null;
}

export interface GraphData {
  nodes: KnowledgeNode[];
  relations: Relation[];
  sources: Source[];
  nodeSources: NodeSource[];
}

/** 向量检索命中：由 match_nodes RPC 返回，只保留展示与判定需要的字段。 */
export interface VectorMatch {
  nodeId: string;
  title: string;
  summary: string;
  similarity: number;
}

/** 回填向量的目标节点（不含向量本身，避免把 1024 维数组拉到前端）。 */
export interface NodeIndexTarget {
  id: string;
  title: string;
  summary: string;
}

/** 指标埋点事件（只存事件名与小体量属性，不存问答正文）。 */
export interface AppEvent {
  id: string;
  name: string;
  props: Record<string, unknown>;
  createdAt: string;
}

export interface SeedNodeDef {
  sid: string;
  parentSid: string | null;
  title: string;
  summary: string;
  aliases?: string[];
}

export interface SeedRelationDef {
  fromSid: string;
  toSid: string;
  type: RelationType;
  confidence?: number;
}

export type Density = "overview" | "standard" | "detail";
