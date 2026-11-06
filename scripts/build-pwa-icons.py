#!/usr/bin/env python3
"""生成 PWA 图标（一次性脚本，CI 不跑）。

用法（Windows，使用 DSH 自带 Python 环境里的 Pillow）：
    python scripts/build-pwa-icons.py

产物：
    public/icons/icon-192.png        manifest any 192
    public/icons/icon-512.png        manifest any 512
    public/icons/maskable-512.png    manifest maskable（内容收进中心 72%）
    src/app/icon.png                 Next favicon 源（512）
    src/app/apple-icon.png           iOS 主屏图标 180
    src/app/favicon.ico              16/32/48 简版（去阴影与笔迹）

视觉沿用 minty-paper：薄荷墙底 + 奶油纸卡片 + 墨绿「知」+ 橙色马克笔下划线 + 零模糊硬投影。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WALL = "#e9f2ee"
PAPER = "#fafaf3"
LINE = "#c6d6cc"
SHADOW = "#a9bdb1"
GREEN = "#256b47"
ORANGE = "#e4572e"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in (FONT_BOLD, "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("找不到中文字体（msyhbd.ttc / msyh.ttc / simhei.ttf）")


def draw_icon(size: int, *, inset: bool, compact: bool) -> Image.Image:
    img = Image.new("RGB", (size, size), WALL)
    draw = ImageDraw.Draw(img)

    card_ratio = 0.72 if compact else 0.62
    card = round(size * card_ratio)
    left = (size - card) // 2
    top = (size - card) // 2
    radius = round(size * (0.18 if compact else 0.15))
    border = max(1, round(size * (0.012 if compact else 0.0055)))

    # 零模糊硬投影：只有一层向下偏移的实心圆角矩形（与 CSS box-shadow 0 Npx 0 一致）。
    if not compact:
        offset = round(size * 0.024)
        draw.rounded_rectangle(
            (left, top + offset, left + card, top + card + offset),
            radius=radius,
            fill=SHADOW,
        )
    draw.rounded_rectangle(
        (left, top, left + card, top + card),
        radius=radius,
        fill=PAPER,
        outline=LINE,
        width=border,
    )

    glyph_ratio = 0.46 if compact else 0.40
    font = load_font(round(size * glyph_ratio))
    text = "知"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_cy = size / 2 - (0 if compact else size * 0.03)
    text_x = size / 2 - text_w / 2 - bbox[0]
    text_y = text_cy - text_h / 2 - bbox[1]
    draw.text((text_x, text_y), text, font=font, fill=GREEN)

    if not compact:
        # 橙色马克笔下划线：水平居中、rotate(-2deg)，单独图层旋转后贴回。
        mark_w = round(size * 0.23)
        mark_h = max(2, round(size * 0.024))
        pad = max(4, round(size * 0.03))
        layer = Image.new("RGBA", (mark_w + pad * 2, mark_h + pad * 2), (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle(
            (pad, pad, pad + mark_w, pad + mark_h), radius=mark_h, fill=ORANGE
        )
        layer = layer.rotate(-2, resample=Image.BICUBIC, expand=False, center=(layer.width / 2, layer.height / 2))
        # 贴在字形下方约 5.5% 处，而不是按卡片底部定位：换字号时笔迹不会飘走。
        mark_cy = text_cy + text_h / 2 + size * 0.055
        img.paste(layer, (round(size / 2 - layer.width / 2), round(mark_cy - layer.height / 2)), layer)

    if inset:
        # maskable：安卓安全区是中心直径 80% 的圆，内容压到 80% 即可，别缩太小。
        inner = round(size * 0.80)
        scaled = img.resize((inner, inner), Image.LANCZOS)
        canvas = Image.new("RGB", (size, size), WALL)
        canvas.paste(scaled, ((size - inner) // 2, (size - inner) // 2))
        return canvas
    return img


def main() -> None:
    icons_dir = ROOT / "public" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    app_dir = ROOT / "src" / "app"

    targets = [
        (icons_dir / "icon-192.png", 192, False, False),
        (icons_dir / "icon-512.png", 512, False, False),
        (icons_dir / "maskable-512.png", 512, True, False),
        (app_dir / "icon.png", 512, False, False),
        (app_dir / "apple-icon.png", 180, False, False),
    ]
    for path, size, inset, compact in targets:
        image = draw_icon(size, inset=inset, compact=compact)
        image.save(path, "PNG", optimize=True)
        print(f"{path.relative_to(ROOT)}  {size}x{size}  {path.stat().st_size // 1024} KB")

    # favicon 用简版（去阴影与笔迹），从 48px 源降采样出 16/32/48 三个尺寸。
    # 必须存 RGBA：Next 构建时解码 ICO 内嵌 PNG，RGB 会报 “PNG is not in RGBA format”。
    favicon = draw_icon(48, inset=False, compact=True).convert("RGBA")
    favicon.save(app_dir / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"{(app_dir / 'favicon.ico').relative_to(ROOT)}  16/32/48  ico")


if __name__ == "__main__":
    main()
