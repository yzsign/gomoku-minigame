"""
和棋底栏图标 — 粗黑描边插画。
左右相对两个 D 形半圆（平边朝内相贴），中间叠握合色带 + 外侧拇指球。

输出：images/ui/game-bar-draw.png（153×160）
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

try:
    _BICUBIC = Image.Resampling.BICUBIC
    _LANCZOS = Image.Resampling.LANCZOS
except AttributeError:
    _BICUBIC = Image.BICUBIC
    _LANCZOS = Image.LANCZOS

OUTLINE = (22, 18, 20, 255)
SKIN = (252, 228, 212, 255)
CLASP = (175, 128, 98, 255)
CUFF = (186, 222, 255, 255)
HIGHLIGHT = (255, 255, 255, 235)

W, H = 153, 160
S = 2


def left_d_mitten(cx: float, cy: float, r: float, n: int = 26) -> list[tuple[float, float]]:
    """左 D：左半圆 + 右侧竖直直径（掌心朝右）。"""
    pts = []
    for i in range(n + 1):
        ang = math.pi / 2 + (math.pi * i) / n
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return pts


def right_d_mitten(cx: float, cy: float, r: float, n: int = 26) -> list[tuple[float, float]]:
    """右 D：右半圆 + 左侧竖直直径（掌心朝左）。"""
    pts = []
    for i in range(n + 1):
        ang = -math.pi / 2 + (math.pi * i) / n
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return pts


def donut_ellipse(
    d: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    fill: tuple[int, int, int, int],
    stroke: tuple[int, int, int, int],
    sw: float,
) -> None:
    x0, y0, x1, y1 = box
    d.ellipse([x0 - sw, y0 - sw, x1 + sw, y1 + sw], fill=stroke)
    d.ellipse([x0, y0, x1, y1], fill=fill)


def donut_roundrect(
    d: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    r: float,
    fill: tuple[int, int, int, int],
    stroke: tuple[int, int, int, int],
    sw: float,
) -> None:
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 - sw, y0 - sw, x1 + sw, y1 + sw], radius=r + sw, fill=stroke)
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill)


def layer_stroked_roundrect(
    rw: int, rh: int, rr: int, sw: int, fill: tuple, stroke: tuple
) -> Image.Image:
    pad = sw + 12
    im = Image.new("RGBA", (rw + pad * 2, rh + pad * 2), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    x0, y0 = pad, pad
    x1, y1 = pad + rw, pad + rh
    donut_roundrect(dr, (x0, y0, x1, y1), rr, fill, stroke, sw)
    return im


def paste_center(dest: Image.Image, src: Image.Image, cx: float, cy: float) -> None:
    w, h = src.size
    dest.alpha_composite(src, (int(round(cx - w / 2)), int(round(cy - h / 2))))


def build_handshake() -> Image.Image:
    sw = max(3, int(3.2 * S))
    w0, h0 = W * S, H * S
    img = Image.new("RGBA", (w0, h0), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    r = 47 * S
    cx_l = w0 * 0.40
    cx_r = w0 * 0.60
    cy = h0 * 0.48

    pl = left_d_mitten(cx_l, cy, r)
    pr = right_d_mitten(cx_r, cy, r)

    try:
        d.polygon(pl, fill=SKIN, outline=OUTLINE, width=int(sw))
        d.polygon(pr, fill=SKIN, outline=OUTLINE, width=int(sw))
    except TypeError:
        d.polygon(pl, fill=SKIN, outline=OUTLINE)
        d.polygon(pr, fill=SKIN, outline=OUTLINE)

    mid_w, mid_h = 20 * S, 50 * S
    donut_ellipse(
        d,
        [
            w0 / 2 - mid_w / 2,
            cy - mid_h / 2,
            w0 / 2 + mid_w / 2,
            cy + mid_h / 2,
        ],
        CLASP,
        OUTLINE,
        max(2.0, sw * 0.75),
    )

    th = 18 * S
    donut_ellipse(
        d,
        [
            cx_l - r - 3 * S,
            cy - r * 1.12,
            cx_l - r + 15 * S,
            cy - r * 1.12 + th,
        ],
        SKIN,
        OUTLINE,
        sw,
    )
    donut_ellipse(
        d,
        [
            cx_r + r - 15 * S,
            cy - r * 1.12,
            cx_r + r + 3 * S,
            cy - r * 1.12 + th,
        ],
        SKIN,
        OUTLINE,
        sw,
    )

    cuff = layer_stroked_roundrect(34 * S, 11 * S, 5 * S, sw, CUFF, OUTLINE)
    c1 = cuff.rotate(16, expand=True, resample=_BICUBIC)
    c2 = cuff.rotate(-16, expand=True, resample=_BICUBIC)
    paste_center(img, c1, w0 * 0.22, h0 - 22 * S)
    paste_center(img, c2, w0 * 0.78, h0 - 22 * S)

    try:
        d.arc(
            [cx_l - r * 0.35, cy - r * 1.2, cx_l + r * 0.2, cy - r * 0.45],
            165,
            255,
            fill=HIGHLIGHT,
            width=max(2, S * 2),
        )
        d.arc(
            [cx_r - r * 0.2, cy - r * 1.2, cx_r + r * 0.35, cy - r * 0.45],
            285,
            355,
            fill=HIGHLIGHT,
            width=max(2, S * 2),
        )
    except TypeError:
        pass

    return img.resize((W, H), resample=_LANCZOS)


def main() -> None:
    img = build_handshake()
    root = Path(__file__).resolve().parents[1]
    out = root / "images" / "ui" / "game-bar-draw.png"
    img.save(out)
    print("saved", out, img.size)


if __name__ == "__main__":
    main()
