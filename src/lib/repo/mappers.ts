import type {
  ChatMessage,
  Conversation,
  KnowledgeNode,
  MessagePayload,
  NodeSource,
  Relation,
  RelationOrigin,
  RelationType,
  Source,
} from "@/types";

/** 数据库行 ↔ 领域对象映射（snake_case ↔ camelCase）。 */

export interface NodeRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  summary: string;
  detail: string | null;
  manual_position: { x: number; y: number; z: number } | null;
  status: string;
  aliases: string[] | null;
  mastery: number | null;
  created_at: string;
  updated_at: string;
}

export interface RelationRow {
  id: string;
  user_id: string;
  from_node: string;
  to_node: string;
  type: string;
  confidence: number;
  origin: string;
  created_at: string;
}

export interface SourceRow {
  id: string;
  user_id: string;
  kind: string;
  question: string;
  answer: string;
  image_path: string | null;
  created_at: string;
}

export interface NodeSourceRow {
  user_id: string;
  node_id: string;
  source_id: string;
}

export interface MessageRow {
  id: string;
  user_id: string;
  role: string;
  content: string;
  image_name: string | null;
  conversation_id: string | null;
  payload: unknown;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** 只接受有限数字的三维坐标，脏数据一律当成"未手动定位"。 */
function parseManualPosition(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const z = Number(record.z);
  if (![x, y, z].every((item) => Number.isFinite(item))) return null;
  return { x, y, z };
}

export function nodeFromRow(row: NodeRow): KnowledgeNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    summary: row.summary ?? "",
    detail: row.detail ?? "",
    manualPosition: parseManualPosition(row.manual_position),
    status: row.status === "inbox" ? "inbox" : "active",
    aliases: row.aliases ?? [],
    mastery: row.mastery,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function nodeToRow(userId: string, node: KnowledgeNode): NodeRow {
  return {
    id: node.id,
    user_id: userId,
    parent_id: node.parentId,
    title: node.title,
    summary: node.summary,
    detail: node.detail,
    manual_position: node.manualPosition,
    status: node.status,
    aliases: node.aliases,
    mastery: node.mastery,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  };
}

export function relationFromRow(row: RelationRow): Relation {
  return {
    id: row.id,
    fromId: row.from_node,
    toId: row.to_node,
    type: row.type as RelationType,
    confidence: row.confidence,
    origin: row.origin as RelationOrigin,
    createdAt: row.created_at,
  };
}

export function relationToRow(userId: string, relation: Relation): RelationRow {
  return {
    id: relation.id,
    user_id: userId,
    from_node: relation.fromId,
    to_node: relation.toId,
    type: relation.type,
    confidence: relation.confidence,
    origin: relation.origin,
    created_at: relation.createdAt,
  };
}

export function sourceFromRow(row: SourceRow): Source {
  return {
    id: row.id,
    kind: row.kind === "image" ? "image" : "chat",
    question: row.question ?? "",
    answer: row.answer ?? "",
    imagePath: row.image_path,
    createdAt: row.created_at,
  };
}

export function sourceToRow(userId: string, source: Source): SourceRow {
  return {
    id: source.id,
    user_id: userId,
    kind: source.kind,
    question: source.question,
    answer: source.answer,
    image_path: source.imagePath,
    created_at: source.createdAt,
  };
}

export function nodeSourceFromRow(row: NodeSourceRow): NodeSource {
  return { nodeId: row.node_id, sourceId: row.source_id };
}

export function nodeSourceToRow(userId: string, link: NodeSource): NodeSourceRow {
  return { user_id: userId, node_id: link.nodeId, source_id: link.sourceId };
}

export function messageFromRow(row: MessageRow): ChatMessage {
  const payload = (row.payload ?? {}) as MessagePayload;
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content ?? "",
    imageName: row.image_name,
    conversationId: row.conversation_id,
    payload,
    createdAt: row.created_at,
  };
}

export function messageToRow(userId: string, message: ChatMessage): MessageRow {
  return {
    id: message.id,
    user_id: userId,
    role: message.role,
    content: message.content,
    image_name: message.imageName,
    conversation_id: message.conversationId,
    payload: message.payload,
    created_at: message.createdAt,
  };
}

export function conversationFromRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title || "新对话",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function conversationToRow(userId: string, conversation: Conversation): ConversationRow {
  return {
    id: conversation.id,
    user_id: userId,
    title: conversation.title,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
  };
}
