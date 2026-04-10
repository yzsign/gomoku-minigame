# -*- coding: utf-8 -*-
"""
生成对局底栏青瓷单色线稿 PNG（同一描边色 #3a5862、线宽、圆角端点）。
输出到 images/ui/game-bar-*-celadon.png（当前主包未加载；需接入主题时再 bind）。
依赖：Pillow
  python scripts/gen_celadon_game_bar_png.py
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

# 与 themes.js 青瓷 subtitle 一致
STROKE = (58, 86, 98, 255)
SIZE = 256
W = 7  # 统一线宽（逻辑像素，画布内）
M = 32  # 边距


def _thick_line(
    draw: ImageDraw.ImageDraw,
    xy: list[tuple[float, float]],
    fill: tuple[int, int, int, int],
    width: int,
) -> None:
    draw.line(xy, fill=fill, width=width, joint="curve")


def draw_home(im: Image.Image) -> None:
    d = ImageDraw.Draw(im)
    cx, cy = SIZE // 2, SIZE // 2
    roof_w, roof_h = 100, 52
    body_w, body_h = 110, 72
    # 屋顶 △
    top = (cx, cy - 38)
    left = (cx - roof_w // 2, cy + 2)
    right = (cx + roof_w // 2, cy + 2)
    d.polygon([top, left, right], outline=STROKE, width=W)
    # 房身
    x0 = cx - body_w // 2
    y0 = cy + 2
    x1 = cx + body_w // 2
    y1 = y0 + body_h
    d.rounded_rectangle([x0, y0, x1, y1], radius=6, outline=STROKE, width=W)
    # 门
    dw, dh = 36, 44
    d.rounded_rectangle(
        [cx - dw // 2, y1 - dh - 10, cx + dw // 2, y1 - 6],
        radius=4,
        outline=STROKE,
        width=W,
    )


def draw_undo(im: Image.Image) -> None:
    d = ImageDraw.Draw(im)
    cx, cy = SIZE // 2, SIZE // 2
    # 逆时针弧（左上象限的弓形）
    bbox = [cx - 58, cy - 52, cx + 58, cy + 44]
    d.arc(bbox, start=200, end=430, fill=STROKE, width=W)
    # 箭头
    ax, ay = cx - 52, cy - 8
    _thick_line(d, [(ax + 22, ay - 18), (ax, ay), (ax + 18, ay + 20)], STROKE, W)


def draw_draw(im: Image.Image) -> None:
    """和棋：两手交握简化线稿（对称弧线 + 中间连结）。"""
    d = ImageDraw.Draw(im)
    cx, cy = SIZE // 2, SIZE // 2
    # 左掌外轮廓
    bbox_l = [cx - 92, cy - 38, cx - 8, cy + 58]
    d.arc(bbox_l, start=20, end=200, fill=STROKE, width=W)
    # 右掌外轮廓
    bbox_r = [cx + 8, cy - 38, cx + 92, cy + 58]
    d.arc(bbox_r, start=-20, end=160, fill=STROKE, width=W)
    # 中间交握小弧
    d.arc([cx - 36, cy - 8, cx + 36, cy + 48], start=200, end=340, fill=STROKE, width=W)


def draw_resign(im: Image.Image) -> None:
    d = ImageDraw.Draw(im)
    cx, cy = SIZE // 2, SIZE // 2
    pole_x = cx - 48
    # 旗杆
    _thick_line(
        d,
        [(pole_x, cy - 72), (pole_x, cy + 68)],
        STROKE,
        W,
    )
    # 三角旗（向右飘）
    flag = [
        (pole_x + 4, cy - 70),
        (pole_x + 88, cy - 42),
        (pole_x + 4, cy - 14),
    ]
    d.polygon(flag, outline=STROKE, width=W)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "images" / "ui"
    out_dir.mkdir(parents=True, exist_ok=True)

    specs = [
        ("game-bar-home-celadon.png", draw_home),
        ("game-bar-undo-celadon.png", draw_undo),
        ("game-bar-draw-celadon.png", draw_draw),
        ("game-bar-resign-celadon.png", draw_resign),
    ]

    for name, fn in specs:
        im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        fn(im)
        path = out_dir / name
        im.save(path, "PNG")
        print("wrote", path)


if __name__ == "__main__":
    main()
