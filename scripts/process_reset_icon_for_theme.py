# -*- coding: utf-8 -*-
"""将 UI/icon/restart2.png 白底抠透明，输出 images/ui/game-bar-reset.png。

源文件更换后重跑：python scripts/process_reset_icon_for_theme.py"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "UI" / "icon" / "restart2.png"
OUT = ROOT / "images" / "ui" / "game-bar-reset.png"
MAX_SIDE = 160
# 近白像素变透明（与 process_game_bar_icons 思路一致，略宽松）
WHITE_LO = 248


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing source: {SRC}")
    im = Image.open(SRC).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= WHITE_LO and g >= WHITE_LO and b >= WHITE_LO:
                px[x, y] = (255, 255, 255, 0)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    m = max(w, h)
    if m > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, optimize=True)
    print("wrote", OUT, im.size)


if __name__ == "__main__":
    main()
