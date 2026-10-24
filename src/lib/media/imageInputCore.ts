/**
 * 拍题图片的纯逻辑：类型/大小校验与缩略图尺寸计算。
 *
 * 这里不 import 浏览器 API / store，Node 测试环境可以直接引用；
 * 真正的画布缩略图在 ./imageThumbnails.ts，本地缓存见 ./localThumbnailStore.ts。
 */

/** 原图上限：超过后不再读成 dataURL（视觉模型与大图预览都吃不消）。 */
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** 支持的图片格式；刻意排除 SVG（可携带脚本，不适合直接进 <img> / 模型）。 */
export const CHAT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type ChatImageMime = (typeof CHAT_IMAGE_MIME_TYPES)[number];

/** 缩略图最长边；聊天里显示约 320px，详情页来源约 80px，640 足够看清题目。 */
export const THUMBNAIL_MAX_EDGE = 640;

const EXTENSION_MIME: Record<string, ChatImageMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export interface ChatImageLike {
  type: string;
  size: number;
  name?: string;
}

function normalizeMime(type: string): string {
  return type.trim().toLowerCase();
}

function mimeForName(name?: string): ChatImageMime | null {
  if (!name) return null;
  const extension = name.split(".").pop()?.toLowerCase();
  if (!extension) return null;
  return EXTENSION_MIME[extension] ?? null;
}

/**
 * 部分浏览器（尤其从相册/文件管理器选图时）拿不到 `file.type`，
 * 这时按扩展名兜底；但已知的非法 MIME（如 image/svg+xml）不会被扩展名“洗白”。
 */
export function isSupportedChatImageMime(type: string, name?: string): boolean {
  const mime = normalizeMime(type);
  if (mime) return (CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
  return mimeForName(name) !== null;
}

/** 校验选中的图片；合法返回 null，否则返回可以直接展示的中文原因。 */
export function validateChatImage(input: ChatImageLike): string | null {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return "图片为空，请重新选择";
  }
  if (!isSupportedChatImageMime(input.type, input.name)) {
    return "不支持该图片格式，请选择 JPG / PNG / WebP / GIF";
  }
  if (input.size > CHAT_IMAGE_MAX_BYTES) {
    return `图片超过 ${Math.round(CHAT_IMAGE_MAX_BYTES / 1024 / 1024)} MB，请先压缩或截图后再上传`;
  }
  return null;
}

/**
 * 等比缩放尺寸：长边不超过 maxEdge，小图不放大；脏数据返回 1×1 兜底，
 * 让画布至少有一个可绘制尺寸而不是 0 宽高。
 */
export function computeThumbnailSize(
  width: number,
  height: number,
  maxEdge: number = THUMBNAIL_MAX_EDGE,
): { width: number; height: number } {
  const safeMax = Number.isFinite(maxEdge) && maxEdge > 0 ? maxEdge : THUMBNAIL_MAX_EDGE;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }
  const longest = Math.max(width, height);
  if (longest <= safeMax) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = safeMax / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
