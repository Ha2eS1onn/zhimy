import { describe, expect, it } from "vitest";
import {
  EMBEDDING_BATCH,
  EMBEDDING_DIM,
  HIT_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  embedQuery,
  embedTexts,
  embeddingEndpoint,
  isEmbeddingConfigured,
  normalizeEmbeddingVector,
  parseEmbeddingResponse,
  supportsCustomDimensions,
  testEmbedding,
} from "@/lib/ai/embeddings";
import { LlmError, type LlmSettings } from "@/lib/ai/types";

function createSettings(patch: Partial<LlmSettings> = {}): LlmSettings {
  return {
    mode: "real",
    transport: "proxy",
    baseUrl: "https://api.example.com/v1",
    apiKey: "chat-key",
    model: "chat-model",
    visionModel: "",
    embeddingModel: "bge-m3",
    embeddingBaseUrl: "",
    embeddingApiKey: "",
    ...patch,
  };
}

function createVector(length: number, fill = 0.1): number[] {
  return Array.from({ length }, () => fill);
}

describe("向量常量与配置判定", () => {
  it("维度、批量与命中阈值符合契约", () => {
    expect(EMBEDDING_DIM).toBe(1024);
    expect(EMBEDDING_BATCH).toBe(16);
    expect(HIT_SIMILARITY_THRESHOLD).toBe(0.78);
  });

  it("演示模式不算已配置", () => {
    expect(isEmbeddingConfigured(createSettings({ mode: "mock" }))).toBe(false);
    expect(embeddingEndpoint(createSettings({ mode: "mock" }))).toBeNull();
  });

  it("缺少向量模型名或 Key 时不算已配置", () => {
    expect(isEmbeddingConfigured(createSettings({ embeddingModel: "" }))).toBe(false);
    expect(isEmbeddingConfigured(createSettings({ apiKey: "", embeddingApiKey: "" }))).toBe(false);
    expect(embeddingEndpoint(createSettings({ embeddingModel: "   " }))).toBeNull();
  });

  it("未单独配置时复用对话的 Base URL 与 Key", () => {
    expect(embeddingEndpoint(createSettings())).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "chat-key",
      model: "bge-m3",
    });
  });

  it("独立 Key / Base URL 优先，并去掉尾部斜杠", () => {
    expect(
      embeddingEndpoint(
        createSettings({
          embeddingBaseUrl: "  https://emb.example.com/v1///  ",
          embeddingApiKey: "emb-key",
        }),
      ),
    ).toEqual({
      baseUrl: "https://emb.example.com/v1",
      apiKey: "emb-key",
      model: "bge-m3",
    });
  });

  it("只有独立 Base URL、复用对话 Key 时也生效", () => {
    expect(
      embeddingEndpoint(createSettings({ embeddingBaseUrl: "https://emb.example.com/v1/" })),
    ).toEqual({
      baseUrl: "https://emb.example.com/v1",
      apiKey: "chat-key",
      model: "bge-m3",
    });
  });
});

describe("supportsCustomDimensions", () => {
  it("OpenAI 3 代与 DashScope v3/v4 支持 dimensions", () => {
    for (const model of [
      "text-embedding-3-small",
      "text-embedding-3-large",
      "TEXT-EMBEDDING-3-SMALL",
      "embedding-3",
      "text-embedding-v3",
      "text-embedding-v4",
    ]) {
      expect(supportsCustomDimensions(model), model).toBe(true);
    }
  });

  it("bge-m3、ada-002 等不支持 dimensions", () => {
    for (const model of ["bge-m3", "BAAI/bge-m3", "text-embedding-ada-002", "", "  "]) {
      expect(supportsCustomDimensions(model), model).toBe(false);
    }
  });
});

describe("normalizeEmbeddingVector", () => {
  it("接受有限数值数组并保持内容", () => {
    expect(normalizeEmbeddingVector([0.1, -0.2, 0], 3)).toEqual([0.1, -0.2, 0]);
    expect(normalizeEmbeddingVector(createVector(EMBEDDING_DIM))).toHaveLength(EMBEDDING_DIM);
  });

  it("非数组、含非法数值时抛中文 LlmError", () => {
    expect(() => normalizeEmbeddingVector("not-array")).toThrow(LlmError);
    expect(() => normalizeEmbeddingVector(null)).toThrow(LlmError);
    expect(() => normalizeEmbeddingVector([0.1, Number.NaN, 0.3], 3)).toThrow(LlmError);
    expect(() => normalizeEmbeddingVector([0.1, Number.POSITIVE_INFINITY], 2)).toThrow(LlmError);
    expect(() => normalizeEmbeddingVector([0.1, "0.2"], 2)).toThrow(LlmError);
    expect(() => normalizeEmbeddingVector([0.1, 0.2, 0.3], 2)).toThrow(/维度不匹配/);
  });

  it("维度错误时提示实际维度与目标维度", () => {
    try {
      normalizeEmbeddingVector(createVector(1536));
      throw new Error("应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).message).toContain("1536");
      expect((error as LlmError).message).toContain("1024");
      expect((error as LlmError).hint ?? "").toContain("dimensions");
    }
  });
});

describe("parseEmbeddingResponse", () => {
  it("按 index 排序后与输入顺序一一对应", () => {
    const vectors = parseEmbeddingResponse(
      {
        data: [
          { index: 1, embedding: createVector(4, 0.2) },
          { index: 0, embedding: createVector(4, 0.1) },
        ],
      },
      4,
    );
    expect(vectors).toHaveLength(2);
    expect(vectors[0]![0]).toBeCloseTo(0.1);
    expect(vectors[1]![0]).toBeCloseTo(0.2);
  });

  it("缺少 index 时按数组顺序兜底", () => {
    const vectors = parseEmbeddingResponse(
      { data: [{ embedding: createVector(3, 0.1) }, { embedding: createVector(3, 0.2) }] },
      3,
    );
    expect(vectors[0]![0]).toBeCloseTo(0.1);
    expect(vectors[1]![0]).toBeCloseTo(0.2);
  });

  it("条数不符（index 不连续）时抛错", () => {
    expect(() =>
      parseEmbeddingResponse(
        { data: [{ index: 0, embedding: createVector(3) }, { index: 2, embedding: createVector(3) }] },
        3,
      ),
    ).toThrow(/条数不符合预期/);
    expect(() => parseEmbeddingResponse({ data: [] }, 3)).toThrow(LlmError);
    expect(() => parseEmbeddingResponse({}, 3)).toThrow(LlmError);
  });

  it("维度不符时抛错", () => {
    expect(() => parseEmbeddingResponse({ data: [{ index: 0, embedding: createVector(2) }] }, 3)).toThrow(
      /维度不匹配/,
    );
  });
});

describe("cosineSimilarity", () => {
  it("相同向量为 1、正交为 0、反向为 -1", () => {
    const vector = [1, 2, 3];
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([-1, 0], [1, 0])).toBeCloseTo(-1, 10);
  });

  it("零向量返回 0", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("长度不一致时抛错", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(LlmError);
  });
});

describe("命中阈值边界", () => {
  it("≥0.78 命中，<0.78 不命中", () => {
    expect(0.78 >= HIT_SIMILARITY_THRESHOLD).toBe(true);
    expect(0.7801 >= HIT_SIMILARITY_THRESHOLD).toBe(true);
    expect(0.7799 >= HIT_SIMILARITY_THRESHOLD).toBe(false);
    expect(0.5 >= HIT_SIMILARITY_THRESHOLD).toBe(false);
  });
});

describe("embedTexts / embedQuery / testEmbedding 的未配置短路", () => {
  it("演示模式下不发请求，直接抛 LlmError", async () => {
    const settings = createSettings({ mode: "mock" });
    await expect(embedTexts({ settings, inputs: ["你好"] })).rejects.toBeInstanceOf(LlmError);
    await expect(embedQuery(settings, "你好")).rejects.toBeInstanceOf(LlmError);
    await expect(testEmbedding(settings)).rejects.toBeInstanceOf(LlmError);
  });

  it("缺少 Key 时不发请求，错误可操作", async () => {
    const settings = createSettings({ apiKey: "", embeddingApiKey: "" });
    await expect(embedTexts({ settings, inputs: ["你好"] })).rejects.toThrow(/API Key/);
  });

  it("空输入返回空数组", async () => {
    await expect(embedTexts({ settings: createSettings(), inputs: [] })).resolves.toEqual([]);
  });
});
