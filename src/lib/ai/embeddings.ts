/**
 * 向量（embedding）客户端：兼容 OpenAI /embeddings 协议。
 *
 * - 向量维度固定 1024，与数据库 nodes.embedding 的 vector(1024) 对齐；
 * - Key 只在调用时传入，不上报、不落库；
 * - 不在模块内读 store / localStorage，调用方显式传 LlmSettings，方便在组件外使用。
 */
import { describeLlmStatus, LlmError, type LlmSettings } from "./types";

/** 数据库 nodes.embedding 的固定维度；换模型时必须同时迁移数据库列。 */
export const EMBEDDING_DIM = 1024;

/** 命中阈值：余弦相似度 ≥ 该值视为命中同一知识点。 */
export const HIT_SIMILARITY_THRESHOLD = 0.78;

/** 单次 /embeddings 请求最多携带的文本条数（服务商普遍限制 batch 大小）。 */
export const EMBEDDING_BATCH = 16;

/** 单次向量请求的超时时间。 */
const REQUEST_TIMEOUT_MS = 30_000;

/** 一份可用的向量服务配置。 */
export interface EmbeddingEndpoint {
  /** 已去掉尾部斜杠的 Base URL。 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** embedTexts 的入参。 */
export interface EmbedTextsOptions {
  settings: LlmSettings;
  inputs: string[];
  signal?: AbortSignal;
  /** 预留的文本前缀策略：当前 query / document 都按原样发送。 */
  kind?: "query" | "document";
}

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** 向量服务是否已配置：真实模式 + 模型名 + Key（独立 Key 优先，否则复用对话 Key）。 */
export function isEmbeddingConfigured(llm: LlmSettings): boolean {
  if (llm.mode !== "real") return false;
  if (!(llm.embeddingModel ?? "").trim()) return false;
  const apiKey = (llm.embeddingApiKey ?? "").trim() || (llm.apiKey ?? "").trim();
  return Boolean(apiKey);
}

/** 解析向量服务地址：独立 Base URL 优先，否则复用对话 Base URL；尾部斜杠会被去掉。 */
export function embeddingEndpoint(llm: LlmSettings): EmbeddingEndpoint | null {
  if (!isEmbeddingConfigured(llm)) return null;
  const baseUrl =
    trimTrailingSlashes(llm.embeddingBaseUrl ?? "") || trimTrailingSlashes(llm.baseUrl ?? "");
  const apiKey = (llm.embeddingApiKey ?? "").trim() || (llm.apiKey ?? "").trim();
  const model = (llm.embeddingModel ?? "").trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

/**
 * 模型是否支持自定义输出维度（OpenAI text-embedding-3*、通用 embedding-3、
 * 以及 DashScope text-embedding-v3/v4）。bge-m3 等原生就是 1024 维，不能传 dimensions。
 */
export function supportsCustomDimensions(model: string): boolean {
  const name = model.trim().toLowerCase();
  if (!name) return false;
  return (
    name.includes("text-embedding-3") ||
    name.includes("embedding-3") ||
    name.includes("text-embedding-v3") ||
    name.includes("text-embedding-v4")
  );
}

/** 把服务商返回的向量校验并转成 number[]；非数组 / 非有限数 / 维度不符都抛中文 LlmError。 */
export function normalizeEmbeddingVector(raw: unknown, expected = EMBEDDING_DIM): number[] {
  if (!Array.isArray(raw)) {
    throw new LlmError("向量服务返回的 embedding 不是数组", {
      hint: "确认 Base URL 指向 OpenAI 兼容的 /embeddings 接口，模型名是否可用。",
    });
  }
  const vector: number[] = [];
  for (const item of raw) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new LlmError("向量服务返回的 embedding 含非数值内容", {
        hint: "检查向量模型是否可用；部分服务商的 embedding 接口返回结构与 OpenAI 不同。",
      });
    }
    vector.push(item);
  }
  if (vector.length !== expected) {
    throw new LlmError(
      `向量维度不匹配：模型返回 ${vector.length} 维，系统需要 ${expected} 维`,
      {
        hint: `请换成输出 ${expected} 维的向量模型（例如 bge-m3），或使用支持 dimensions 参数的模型（如 text-embedding-3-small 并传 dimensions=${expected}）。`,
      },
    );
  }
  return vector;
}

interface EmbeddingResponseItem {
  embedding?: unknown;
  index?: unknown;
}

/** 解析 OpenAI 兼容的 `{ data: [{ embedding, index }] }`；按 index 排序并校验条数与维度。 */
export function parseEmbeddingResponse(raw: unknown, expected = EMBEDDING_DIM): number[][] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new LlmError("向量服务没有返回 embedding 数据", {
      hint: "确认 Base URL 是否包含 /v1 等版本前缀，模型名是否与服务商文档一致。",
    });
  }
  const items = data.map((entry, position) => {
    if (typeof entry !== "object" || entry === null) {
      throw new LlmError("向量服务返回的 data 结构不正确", {
        hint: "期望 OpenAI 兼容格式：{ data: [{ embedding, index }] }。",
      });
    }
    const item = entry as EmbeddingResponseItem;
    const index = item.index === undefined ? position : item.index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
      throw new LlmError("向量服务返回的 index 不是合法整数", {
        hint: "重试一次；若持续出现，说明服务商 /embeddings 实现不兼容 OpenAI 协议。",
      });
    }
    return { index, vector: normalizeEmbeddingVector(item.embedding, expected) };
  });
  items.sort((a, b) => a.index - b.index);
  items.forEach((item, position) => {
    if (item.index !== position) {
      throw new LlmError(
        `向量服务返回的条数不符合预期：应有 ${items.length} 条且 index 从 0 连续编号`,
        { hint: "重试一次；若持续出现，检查该服务商是否按请求顺序逐条返回。" },
      );
    }
  });
  return items.map((item) => item.vector);
}

/** 余弦相似度：长度不等抛错；任一为零向量时返回 0（避免除零）。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new LlmError(`向量长度不一致：${a.length} 与 ${b.length}，无法计算相似度`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 校验并返回一份可用的向量服务配置；未配置时抛出可操作的中文错误。 */
function requireEndpoint(settings: LlmSettings): EmbeddingEndpoint {
  if (settings.mode !== "real") {
    throw new LlmError("当前是演示模式，请先在设置里接入自己的模型");
  }
  const endpoint = embeddingEndpoint(settings);
  if (endpoint) return endpoint;
  if (!(settings.embeddingModel ?? "").trim()) {
    throw new LlmError("还没有填写向量模型名", {
      hint: "例如 bge-m3、text-embedding-3-small；留空则命中检索退回关键词匹配。",
    });
  }
  const apiKey = (settings.embeddingApiKey ?? "").trim() || (settings.apiKey ?? "").trim();
  if (!apiKey) {
    throw new LlmError("还没有填写 API Key", { hint: "Key 只保存在本机浏览器，不会上传。" });
  }
  throw new LlmError("还没有填写向量服务地址", {
    hint: "可以与对话服务共用 Base URL，也可以在设置里单独填写。",
  });
}

/** 尽量读出上游错误里的可读信息，失败返回空串。 */
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return (json.error?.message ?? json.message ?? text).slice(0, 240);
  } catch {
    return "";
  }
}

/** 把 HTTP 状态映射成可操作的中文 LlmError。 */
function toLlmError(status: number, detail: string): LlmError {
  const translated = describeLlmStatus(status);
  return new LlmError(detail ? `${translated.message}：${detail}` : translated.message, {
    status,
    hint: translated.hint,
  });
}

/** 发出一次 /embeddings 请求（proxy 走本站代理，direct 由浏览器直连）。 */
async function postEmbeddings(options: {
  settings: LlmSettings;
  endpoint: EmbeddingEndpoint;
  inputs: string[];
  dimensions: boolean;
  signal?: AbortSignal;
}): Promise<Response> {
  const { settings, endpoint, inputs, dimensions, signal } = options;
  const payload = {
    model: endpoint.model,
    input: inputs,
    ...(dimensions ? { dimensions: EMBEDDING_DIM } : {}),
  };
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    if (settings.transport === "direct") {
      return await fetch(`${endpoint.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: requestSignal,
      });
    }
    return await fetch("/api/llm/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey,
        ...payload,
      }),
      signal: requestSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if ((error as Error)?.name === "TimeoutError") {
      throw new LlmError("向量服务响应超时", {
        hint: "网络较慢或服务商限流，稍后重试；也可以换用更小的批量。",
      });
    }
    throw new LlmError("网络请求失败", {
      hint: "浏览器直连可能被跨域（CORS）拦截，试试在设置里切换到「代理模式」。",
    });
  }
}

/** 解析响应 JSON；不是 JSON 时抛中文错误。 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new LlmError("向量服务返回的不是合法 JSON", {
      hint: "确认 Base URL 是否指向 OpenAI 兼容的 /embeddings 接口。",
    });
  }
}

/**
 * 批量生成向量：自动按 EMBEDDING_BATCH 分批，返回顺序与 inputs 一一对应。
 * 每条向量都会校验为 1024 维；模型支持 dimensions 时会请求 1024 维，
 * 若上游 400 且错误提到 dimensions，则去掉该参数重试一次。
 */
export async function embedTexts(options: EmbedTextsOptions): Promise<number[][]> {
  const { settings, inputs, signal } = options;
  const endpoint = requireEndpoint(settings);
  if (inputs.length === 0) return [];

  const vectors: number[][] = [];
  for (let start = 0; start < inputs.length; start += EMBEDDING_BATCH) {
    const batch = inputs.slice(start, start + EMBEDDING_BATCH);
    const requestDimensions = supportsCustomDimensions(endpoint.model);
    let response = await postEmbeddings({
      settings,
      endpoint,
      inputs: batch,
      dimensions: requestDimensions,
      signal,
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      if (requestDimensions && response.status === 400 && /dimensions?/i.test(detail)) {
        response = await postEmbeddings({
          settings,
          endpoint,
          inputs: batch,
          dimensions: false,
          signal,
        });
      } else {
        throw toLlmError(response.status, detail);
      }
    }
    if (!response.ok) {
      throw toLlmError(response.status, await readErrorDetail(response));
    }

    const batchVectors = parseEmbeddingResponse(await readJson(response), EMBEDDING_DIM);
    if (batchVectors.length !== batch.length) {
      throw new LlmError(
        `向量服务返回条数与请求不一致：请求 ${batch.length} 条，返回 ${batchVectors.length} 条`,
        { hint: "重试一次；若持续出现，说明该服务商不支持批量 embedding。" },
      );
    }
    vectors.push(...batchVectors);
  }
  return vectors;
}

/** 生成单条问题的向量（命中检索用）。 */
export async function embedQuery(
  settings: LlmSettings,
  text: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const vectors = await embedTexts({ settings, inputs: [text], signal, kind: "query" });
  const vector = vectors[0];
  if (!vector) {
    throw new LlmError("向量服务没有返回问题向量", {
      hint: "重试一次；若持续出现，检查模型是否支持 /embeddings 接口。",
    });
  }
  return vector;
}

/** 设置页的「测试向量模型」：发一条极短文本，确认地址 / Key / 模型可用。 */
export async function testEmbedding(
  settings: LlmSettings,
): Promise<{ model: string; dimensions: number }> {
  const endpoint = requireEndpoint(settings);
  const vectors = await embedTexts({ settings, inputs: ["向量连接测试"], kind: "query" });
  const vector = vectors[0];
  if (!vector) {
    throw new LlmError("向量服务没有返回测试结果", {
      hint: "确认模型支持 /embeddings 接口，稍后重试。",
    });
  }
  return { model: endpoint.model, dimensions: vector.length };
}
