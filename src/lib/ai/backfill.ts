import { getRepo } from "@/lib/repo";
import type { NodeIndexTarget } from "@/types";
import { EMBEDDING_BATCH, embedTexts, embeddingEndpoint } from "./embeddings";
import type { LlmSettings } from "./types";

export interface BackfillProgress {
  done: number;
  total: number;
  embedded: number;
  failed: number;
}

export interface BackfillResult {
  embedded: number;
  skipped: number;
  failed: number;
}

/** 最多回填轮数：RPC 单次上限 500 条，10 轮足够覆盖 5000 个历史节点，避免无限循环。 */
const MAX_ROUNDS = 10;

/** 回填文本上限，与实时索引保持一致。 */
const MAX_TEXT = 1000;

/** 单个节点的向量文本：标题 + 摘要，截断 1000 字。 */
function indexText(target: NodeIndexTarget): string {
  return `${target.title}\n${target.summary}`.slice(0, MAX_TEXT);
}

/**
 * 历史节点向量回填（设置页「重建索引」）：
 * 每轮拉取「缺向量 / 向量模型不一致」的节点，按 EMBEDDING_BATCH 分批生成向量并逐条写回；
 * 列表为空即结束，最多 MAX_ROUNDS 轮；单条/单批失败计入 failed 并继续，不中断整轮回填。
 */
export async function backfillEmbeddings(input: {
  llm: LlmSettings;
  onProgress?: (progress: BackfillProgress) => void;
  signal?: AbortSignal;
}): Promise<BackfillResult> {
  const { llm, onProgress, signal } = input;
  const endpoint = embeddingEndpoint(llm);
  if (!endpoint) return { embedded: 0, skipped: 0, failed: 0 };
  const repo = getRepo();
  if (repo.kind === "memory") return { embedded: 0, skipped: 0, failed: 0 };

  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;
  let done = 0;

  const report = (): void => {
    onProgress?.({ done, total, embedded, failed });
  };

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (signal?.aborted) break;
    const targets = await repo.listNodesMissingEmbedding(endpoint.model);
    if (targets.length === 0) break;
    total += targets.length;
    // 整轮没有任何成功写入时提前结束：避免服务不可用时把同一批节点重复请求 10 轮。
    let progressThisRound = false;

    for (let start = 0; start < targets.length; start += EMBEDDING_BATCH) {
      if (signal?.aborted) break;
      const batch = targets.slice(start, start + EMBEDDING_BATCH);
      const pending: Array<{ target: NodeIndexTarget; text: string }> = [];
      for (const target of batch) {
        const text = indexText(target);
        if (!text.trim()) {
          // 空节点生成不出有意义的向量，跳过且不回写。
          skipped += 1;
          done += 1;
          report();
          continue;
        }
        pending.push({ target, text });
      }
      if (pending.length === 0) continue;

      let vectors: number[][];
      try {
        vectors = await embedTexts({
          settings: llm,
          inputs: pending.map((item) => item.text),
          signal,
          kind: "document",
        });
      } catch (error) {
        // 整批失败（服务不可用 / 超时）：整批计入 failed 后继续，下一轮还会再试。
        failed += pending.length;
        done += pending.length;
        report();
        if (signal?.aborted) break;
        console.warn("[zhimy] 向量回填批次失败", error);
        continue;
      }

      for (let index = 0; index < pending.length; index += 1) {
        const { target } = pending[index];
        const embedding = vectors[index];
        if (!embedding) {
          failed += 1;
        } else {
          try {
            await repo.setNodeEmbedding({ nodeId: target.id, embedding, model: endpoint.model });
            embedded += 1;
            progressThisRound = true;
          } catch {
            failed += 1;
          }
        }
        done += 1;
        report();
      }
    }

    if (!progressThisRound) break;
  }

  return { embedded, skipped, failed };
}
