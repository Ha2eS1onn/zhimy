import { getRepo } from "@/lib/repo";
import { useSettingsStore } from "@/store/settingsStore";
import type { KnowledgeNode } from "@/types";
import { embedTexts, embeddingEndpoint } from "./embeddings";

/** 节点向量文本上限：标题 + 摘要足够表达语义，过长反而稀释主题。 */
const MAX_INDEX_TEXT = 1000;

/**
 * 节点新增/编辑后异步重建向量（fire-and-forget）。
 * - 未配置向量服务、演示内存仓库时直接跳过；
 * - 任何失败只 console.warn，绝不抛到调用方；
 * - 调用方不 await，主流程（收编 / 重命名 / 详情保存）不会被拖慢。
 */
export function reindexNode(node: Pick<KnowledgeNode, "id" | "title" | "summary">): void {
  void reindexNodeAsync(node);
}

async function reindexNodeAsync(
  node: Pick<KnowledgeNode, "id" | "title" | "summary">,
): Promise<void> {
  try {
    const llm = useSettingsStore.getState().llm;
    const endpoint = embeddingEndpoint(llm);
    if (!endpoint) return;
    const repo = getRepo();
    if (repo.kind === "memory") return;

    const text = `${node.title}\n${node.summary}`.slice(0, MAX_INDEX_TEXT);
    const vectors = await embedTexts({ settings: llm, inputs: [text], kind: "document" });
    const embedding = vectors[0];
    if (!embedding) return;
    await repo.setNodeEmbedding({ nodeId: node.id, embedding, model: endpoint.model });
  } catch (error) {
    console.warn("[zhimy] 向量更新失败", error);
  }
}
