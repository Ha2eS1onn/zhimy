#!/usr/bin/env python3
"""生成 Android 图标（复用 scripts/build-pwa-icons.py 的绘制逻辑）。

用法：python scripts/build-android-icons.py
产物：android-app/android/app/src/main/res/mipmap-*/ic_launcher*.png
（adaptive 的 XML 与背景色在 res/mipmap-anydpi-v26/、res/values/colors.xml，手写维护）
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android-app" / "android" / "app" / "src" / "main" / "res"

_spec = importlib.util.spec_from_file_location("pwa_icons", ROOT / "scripts" / "build-pwa-icons.py")
pwa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pwa)

# launcher 图标与 PWA 图标同一套视觉；密度对应 Android 的 48dp / 108dp 基准。
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def main() -> None:
    for density, size in LEGACY.items():
        directory = RES / f"mipmap-{density}"
        directory.mkdir(parents=True, exist_ok=True)
        icon = pwa.draw_icon(size, compact=False)
        icon.save(directory / "ic_launcher.png", "PNG", optimize=True)
        icon.save(directory / "ic_launcher_round.png", "PNG", optimize=True)
        print(f"mipmap-{density}/ic_launcher.png  {size}x{size}")

    for density, size in FOREGROUND.items():
        directory = RES / f"mipmap-{density}"
        directory.mkdir(parents=True, exist_ok=True)
        # 透明底 + 卡片收进中心 66dp 安全区（0.56 * 108dp ≈ 60dp）。
        foreground = pwa.draw_icon(size, background=None, card_ratio=0.56, glyph_ratio=0.36)
        foreground.save(directory / "ic_launcher_foreground.png", "PNG", optimize=True)
        print(f"mipmap-{density}/ic_launcher_foreground.png  {size}x{size}")


if __name__ == "__main__":
    main()
