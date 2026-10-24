import { getRepo } from "@/lib/repo";
import { embedQuery, embeddingEndpoint } from "./embeddings";
import type { SemanticSearch } from "./semanticSearch";
import type { LlmSettings } from "./types";

/**
 * 用真实数据仓库 + 向量客户端组装语义检索（P1-A）。
 * 未配置向量服务（演示模式 / 缺模型 / 缺 Key / 缺地址）时返回 null，
 * 调用方据此直接走关键词链路；本函数不读 store，设置显式传入。
 */
export function createSemanticSearch(llm: LlmSettings): SemanticSearch | null {
  const endpoint = embeddingEndpoint(llm);
  if (!endpoint) return null;

  return {
    configured: true,
    embedQuery: (text, signal) => embedQuery(llm, text, signal),
    matchNodes: (embedding, options) =>
      getRepo().matchNodesByVector({
        embedding,
        model: endpoint.model,
        ...options,
      }),
  };
}
