/** 扁平纸感节点精灵：纸面圆片 + 1px 墨线 + 硬偏移影，无渐变、无光晕。 */

const SPRITE_PADDING = 7;
const SHADOW_OFFSET = 3;
const cache = new Map<string, HTMLCanvasElement>();

function spritePalette(theme: "light" | "dark") {
  return theme === "light"
    ? { paper: "#fafaf3", ink: "#22303e", shadow: "rgba(34, 48, 62, 0.28)" }
    : { paper: "#1b2d34", ink: "#eef4eb", shadow: "rgba(0, 0, 0, 0.55)" };
}

function createSprite(
  color: string,
  radius: number,
  dpr: number,
  theme: "light" | "dark",
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cssSize = Math.ceil((radius + SPRITE_PADDING) * 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(cssSize * dpr));
  canvas.height = Math.max(2, Math.ceil(cssSize * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const palette = spritePalette(theme);
  const center = cssSize / 2;

  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.arc(center, center + SHADOW_OFFSET, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center, center, Math.max(1.5, radius * 0.34), 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** 取（或创建）节点精灵；按颜色 + 0.5px 桶 + dpr + 主题缓存。 */
export function getNodeSprite(
  color: string,
  radiusCssPx: number,
  dpr: number,
  theme: "light" | "dark" = "dark",
): HTMLCanvasElement | null {
  const bucket = Math.max(2, Math.round(radiusCssPx * 2) / 2);
  const dprBucket = Math.max(1, Math.round(dpr * 2) / 2);
  const key = `${theme}|${color}|${bucket}|${dprBucket}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const sprite = createSprite(color, bucket, dprBucket, theme);
  if (sprite) cache.set(key, sprite);
  return sprite;
}

/** 绘制尺寸（CSS 像素）——精灵包含硬偏移影与安全留白。 */
export function spriteDrawSize(radiusCssPx: number): number {
  return Math.ceil((radiusCssPx + SPRITE_PADDING) * 2);
}

export function clearSpriteCache(): void {
  cache.clear();
}
