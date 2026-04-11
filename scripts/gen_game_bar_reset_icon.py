"""Generate game-bar-reset.png: 与悔棋同构（弧 + 折线箭头 + 线宽），另加弧起点小空圈表示「初始」。

线色与 handshake 素材一致 #8e66c6；无填色块，与离开/悔棋线稿风格统一。"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

try:
    _LANCZOS = Image.Resampling.LANCZOS
except AttributeError:
    _LANCZOS = Image.LANCZOS

# 与 scripts/gen_game_bar_draw_icon.py 紫一致；celadon undo 为单色描边同语汇
PURPLE = (0x8E, 0x66, 0xC6, 255)

W, H = 153, 160
SCALE = 2

# 与 gen_celadon_game_bar_png.py draw_undo 同一套几何（256 逻辑坐标系）
REF = 256.0
# 在上一版加粗基础上再 ×5（逻辑线宽）；弧几何略收，避免超粗笔画裁切
BASE_STROKE = 9.5
STROKE_X = 5.0
CEL_W = BASE_STROKE * STROKE_X
GEO_MUL = 0.88


def _thick_line(
    draw: ImageDraw.ImageDraw,
    xy: list[tuple[float, float]],
    fill: tuple[int, int, int, int],
    width: int,
) -> None:
    draw.line(xy, fill=fill, width=width, joint="curve")


def _ellipse_point(bbox: list[float], angle_deg: float) -> tuple[float, float]:
    cx = (bbox[0] + bbox[2]) * 0.5
    cy = (bbox[1] + bbox[3]) * 0.5
    rx = (bbox[2] - bbox[0]) * 0.5
    ry = (bbox[3] - bbox[1]) * 0.5
    rad = math.radians(angle_deg)
    return cx + rx * math.cos(rad), cy - ry * math.sin(rad)


def build_reset() -> Image.Image:
    w0, h0 = W * SCALE, H * SCALE
    im = Image.new("RGBA", (w0, h0), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    sf = min(w0 / REF, h0 / REF)
    cx = w0 * 0.5
    cy = h0 * 0.5

    g = GEO_MUL
    bbox = [
        cx - 58 * sf * g,
        cy - 52 * sf * g,
        cx + 58 * sf * g,
        cy + 44 * sf * g,
    ]
    rx = 58 * sf * g
    lw = max(10, int(round(CEL_W * sf)))
    # 在椭圆内尽量用满目标线宽（约为上一版 ~11px 的 5 倍）
    lw = min(lw, max(14, int(rx * 0.96)))
    # 与悔棋同弧同箭头
    d.arc(bbox, start=200, end=430, fill=PURPLE, width=lw)
    ax = cx - 52 * sf * g
    ay = cy - 8 * sf * g
    arr = [
        (ax + 22 * sf * g, ay - 18 * sf * g),
        (ax, ay),
        (ax + 18 * sf * g, ay + 20 * sf * g),
    ]
    _thick_line(d, arr, PURPLE, lw)

    # 弧起点（200°）外侧小空圈：「初始」标记，线宽略细于主弧以免抢戏
    sx, sy = _ellipse_point(bbox, 200.0)
    cxb = (bbox[0] + bbox[2]) * 0.5
    cyb = (bbox[1] + bbox[3]) * 0.5
    vx, vy = sx - cxb, sy - cyb
    vln = math.hypot(vx, vy) or 1.0
    vx, vy = vx / vln, vy / vln
    ring_r = 7.8 * sf * g * 1.05
    off = lw * 0.38 + ring_r * 0.32
    rcx = sx + vx * off
    rcy = sy + vy * off
    ring_w = max(6, int(round(lw * 0.72)))
    d.ellipse(
        [
            rcx - ring_r,
            rcy - ring_r,
            rcx + ring_r,
            rcy + ring_r,
        ],
        outline=PURPLE,
        width=ring_w,
    )

    return im.resize((W, H), resample=_LANCZOS)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "images" / "ui"
    out_dir.mkdir(parents=True, exist_ok=True)
    img = build_reset()
    path = out_dir / "game-bar-reset.png"
    img.save(path)
    print("saved", path, img.size)


if __name__ == "__main__":
    main()
