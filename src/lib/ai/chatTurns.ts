/**
 * 图片提问的消息组装（纯函数，Node 单测可覆盖）。
 *
 * 关键约定：
 * - 有图时**一定**把 image_url 附到 user turn 上，不能静默丢掉；
 * - 请求模型优先用视觉模型，未配置视觉模型时沿用文本模型
 *   （文本模型本身支持视觉时也能用；纯文本模型会由服务商返回错误）；
 * - 历史只取最近 8 轮、每轮截断 1200 字，避免上下文无限膨胀。
 */
import { IMAGE_HINT, SYSTEM_PROMPT } from "./prompt";
import type { ChatContentPart, ChatTurn } from "./types";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestInput {
  question: string;
  /** 已压缩、可发送的图片 dataURL；null 表示本次没有图片。 */
  imageDataUrl: string | null;
  history: ChatHistoryTurn[];
  textModel: string;
  visionModel: string;
}

export interface ChatRequestPlan {
  turns: ChatTurn[];
  /** 本次实际发送的模型名（视觉模型优先，否则文本模型）。 */
  model: string;
  imageAttached: boolean;
  visionModelConfigured: boolean;
}

const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 1200;

export function planChatRequest(input: ChatRequestInput): ChatRequestPlan {
  const imageAttached = Boolean(input.imageDataUrl);
  const visionModel = input.visionModel.trim();
  const visionModelConfigured = visionModel.length > 0;
  const model = imageAttached && visionModelConfigured ? visionModel : input.textModel.trim();

  const history: ChatTurn[] = input.history
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_HISTORY_CHARS),
    }));

  const userContent: string | ChatContentPart[] = imageAttached
    ? [
        { type: "text", text: `${input.question}\n\n${IMAGE_HINT}` },
        { type: "image_url", image_url: { url: input.imageDataUrl! } },
      ]
    : input.question;

  return {
    turns: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userContent },
    ],
    model,
    imageAttached,
    visionModelConfigured,
  };
}
