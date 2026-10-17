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
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  imageName: string | null;
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
