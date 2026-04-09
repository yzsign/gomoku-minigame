"""
将白底握手图抠成透明 PNG（仅去掉与画布边缘连通的背景白，保留图形内部白色填充）。

用法：
  python scripts/cutout_game_bar_draw.py [源图路径]

默认：images/ui/game-bar-draw-source.png
输出：images/ui/game-bar-draw.png（153×160）
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

try:
    _LANCZOS = Image.Resampling.LANCZOS
except AttributeError:
    _LANCZOS = Image.LANCZOS

OUT_W, OUT_H = 153, 160
PAD = 6


def flood_background_mask(
    rgb: np.ndarray, white_min: int = 245
) -> np.ndarray:
    """True = 与边缘连通的背景（应透明）。内部封闭区域内的白不参与。"""
    h, w, _ = rgb.shape
    r = rgb[:, :, 0]
    g = rgb[:, :, 1]
    b = rgb[:, :, 2]
    is_w = (r >= white_min) & (g >= white_min) & (b >= white_min)
    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def try_seed(i: int, j: int) -> None:
        if 0 <= i < h and 0 <= j < w and is_w[i, j] and not bg[i, j]:
            bg[i, j] = True
            q.append((i, j))

    for j in range(w):
        try_seed(0, j)
        try_seed(h - 1, j)
    for i in range(h):
        try_seed(i, 0)
        try_seed(i, w - 1)

    while q:
        i, j = q.popleft()
        for di, dj in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ni, nj = i + di, j + dj
            if 0 <= ni < h and 0 <= nj < w and is_w[ni, nj] and not bg[ni, nj]:
                bg[ni, nj] = True
                q.append((ni, nj))

    return bg


def rgba_from_mask(rgb: np.ndarray, bg: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = np.where(bg, 0, 255)
    return rgba


def fit_canvas(rgba: np.ndarray, tw: int, th: int, pad: int) -> Image.Image:
    im = Image.fromarray(rgba, mode="RGBA")
    bb = im.getbbox()
    if not bb:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    im = im.crop(bb)
    w, h = im.size
    s = min((tw - 2 * pad) / w, (th - 2 * pad) / h)
    nw = max(1, int(round(w * s)))
    nh = max(1, int(round(h * s)))
    im = im.resize((nw, nh), resample=_LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(im, ((tw - nw) // 2, (th - nh) // 2), im)
    return canvas


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    default_src = root / "images" / "ui" / "game-bar-draw-source.png"
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else default_src
    if not src.is_file():
        print("missing source:", src)
        sys.exit(1)

    out = root / "images" / "ui" / "game-bar-draw.png"
    rgb = np.array(Image.open(src).convert("RGB"))
    bg = flood_background_mask(rgb, white_min=245)
    rgba = rgba_from_mask(rgb, bg)
    img = fit_canvas(rgba, OUT_W, OUT_H, PAD)
    img.save(out)
    print("saved", out, img.size, "from", src)


if __name__ == "__main__":
    main()
