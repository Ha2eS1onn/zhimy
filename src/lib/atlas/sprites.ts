/** 节点光晕精灵缓存：径向渐变 + 外发光约 2.6 倍，避免每帧重建渐变。 */

const GLOW_FACTOR = 2.6;
const cache = new Map<string, HTMLCanvasElement>();

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createSprite(color: string, radius: number, dpr: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cssSize = Math.ceil(radius * 2 * GLOW_FACTOR);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(cssSize * dpr));
  canvas.height = Math.max(2, Math.ceil(cssSize * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const center = canvas.width / 2;
  // 中心亮 → 主色 → 透明的径向渐变；描边光晕由外圈柔化。
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, canvas.width / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  gradient.addColorStop(0.16, hexToRgba(color, 0.98));
  gradient.addColorStop(0.3, hexToRgba(color, 0.55));
  gradient.addColorStop(0.55, hexToRgba(color, 0.14));
  gradient.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, canvas.width / 2, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** 取（或创建）节点精灵；按颜色 + 0.5px 桶 + dpr 缓存。 */
export function getNodeSprite(color: string, radiusCssPx: number, dpr: number): HTMLCanvasElement | null {
  const bucket = Math.max(2, Math.round(radiusCssPx * 2) / 2);
  const dprBucket = Math.max(1, Math.round(dpr * 2) / 2);
  const key = `${color}|${bucket}|${dprBucket}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const sprite = createSprite(color, bucket, dprBucket);
  if (sprite) cache.set(key, sprite);
  return sprite;
}

/** 绘制尺寸（CSS 像素）——精灵本身带 2.6 倍光晕，需要用更大的画布尺寸绘制。 */
export function spriteDrawSize(radiusCssPx: number): number {
  return Math.ceil(radiusCssPx * 2 * GLOW_FACTOR);
}

export function clearSpriteCache(): void {
  cache.clear();
}
