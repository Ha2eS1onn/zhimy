/**
 * 浏览器侧图片预处理：一次解码，同时产出
 * 1. 本地缓存用的缩略图（640px / JPEG 0.72）；
 * 2. 发给视觉模型的压缩图（1600px / JPEG 0.82，仍超限时降到 1280px）。
 *
 * 原图不会被持久化；压图是为了让 base64 请求体留在代理与 Vercel 的
 * 4.5 MB 限制以内，同时保留题目文字的清晰度。
 */
import { computeThumbnailSize, THUMBNAIL_MAX_EDGE } from "./imageInputCore";

/** JPEG 质量；640px + 0.72 通常 20–80 KB，200 条约 4–16 MB。 */
export const THUMBNAIL_QUALITY = 0.72;

/** 视觉模型输入的最长边与质量；1600px 对拍题文字足够。 */
export const VISION_MAX_EDGE = 1600;
export const VISION_QUALITY = 0.82;
/** dataURL 字符数上限（约 2.5 MB 二进制）；代理侧还会再兜底。 */
export const VISION_MAX_DATA_URL_LENGTH = 3_500_000;

export interface ChatImageDataUrls {
  thumbnail: string | null;
  vision: string | null;
}

/** 一次解码生成缩略图与视觉输入图；失败返回两个 null，不抛错。 */
export async function createChatImageDataUrls(file: File): Promise<ChatImageDataUrls> {
  if (typeof document === "undefined") return { thumbnail: null, vision: null };

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    const thumbnail = drawToDataUrl(
      image,
      sourceWidth,
      sourceHeight,
      THUMBNAIL_MAX_EDGE,
      THUMBNAIL_QUALITY,
    );

    let vision = drawToDataUrl(
      image,
      sourceWidth,
      sourceHeight,
      VISION_MAX_EDGE,
      VISION_QUALITY,
    );
    if (vision && vision.length > VISION_MAX_DATA_URL_LENGTH) {
      // 极端大的照片再降一档，确保经代理转发不会撞上请求体上限。
      vision = drawToDataUrl(image, sourceWidth, sourceHeight, 1280, 0.72);
      if (vision && vision.length > VISION_MAX_DATA_URL_LENGTH) vision = null;
    }

    return { thumbnail, vision };
  } catch {
    return { thumbnail: null, vision: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawToDataUrl(
  image: HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
  quality: number,
): string | null {
  try {
    const { width, height } = computeThumbnailSize(sourceWidth, sourceHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    // 透明 PNG 转 JPEG 会变黑底，先铺白底，保证题目截图可读。
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.startsWith("data:image/") ? dataUrl : null;
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败"));
    image.src = src;
  });
}
