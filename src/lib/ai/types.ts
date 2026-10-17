/** BYOK 大模型设置与调用契约。Key 只保存在用户本机，不进入数据库。 */

export type LlmMode = "mock" | "real";
export type LlmTransport = "proxy" | "direct";

export interface LlmSettings {
  mode: LlmMode;
  /** proxy：经 /api/llm/chat 转发（规避浏览器 CORS）；direct：浏览器直连服务商。 */
  transport: LlmTransport;
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
}

export interface LlmPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
}

/** OpenAI 兼容服务商快捷配置。 */
export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
  },
  {
    id: "moonshot",
    name: "Kimi / Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    visionModel: "moonshot-v1-8k-vision-preview",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    visionModel: "glm-4v-flash",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-7B-Instruct",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    visionModel: "openai/gpt-4o-mini",
  },
];

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface StreamChatOptions {
  settings: LlmSettings;
  messages: ChatTurn[];
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
}

export class LlmError extends Error {
  readonly status?: number;
  readonly hint?: string;

  constructor(message: string, options: { status?: number; hint?: string } = {}) {
    super(message);
    this.name = "LlmError";
    this.status = options.status;
    this.hint = options.hint;
  }
}

/** 把服务商返回的错误码翻译成可操作的中文提示。 */
export function describeLlmStatus(status: number): { message: string; hint: string } {
  switch (status) {
    case 401:
    case 403:
      return {
        message: "API Key 无效或没有权限",
        hint: "检查 Key 是否填写正确、是否已过期；部分服务商需要先充值/实名。",
      };
    case 404:
      return {
        message: "接口地址或模型名不存在",
        hint: "确认 Base URL 是否包含 /v1 等版本前缀，模型名是否与服务商文档一致。",
      };
    case 429:
      return {
        message: "请求过于频繁或额度不足",
        hint: "稍后再试，或检查账户余额与限流设置。",
      };
    case 400:
      return {
        message: "请求被服务商拒绝",
        hint: "常见原因是模型名不支持该参数，或消息内容过长。",
      };
    default:
      return {
        message: `模型服务返回错误（${status}）`,
        hint: "检查 Base URL 与模型名；若为跨域错误，请切换到「代理模式」。",
      };
  }
}
