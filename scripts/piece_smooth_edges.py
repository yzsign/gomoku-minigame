"""
Legacy: 请改用 piece_optimize_edges.py（预乘 alpha 高斯模糊 + 去溢色）。
若仍调用本脚本，行为与旧版一致。
Soften PNG alpha edges and reduce dark semi-transparent halos (毛边 / 黑边溢出)
from chroma-key flood-fill. Rewrites images/pieces/fruit1.png, fruit2.png.
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageFilter

try:
    import numpy as np
except ImportError:
    np = None  # type: ignore


def _defringe_dark_spill_rgba(arr: "np.ndarray") -> "np.ndarray":
    """Weaken alpha where RGB looks like leftover black matting."""
    r = arr[:, :, 0].astype(np.int32)
    g = arr[:, :, 1].astype(np.int32)
    b = arr[:, :, 2].astype(np.int32)
    a = arr[:, :, 3].astype(np.int32)
    sum_rgb = r + g + b
    # Dark fringe: semi-transparent with very dark RGB (old black bg in AA)
    spill = (sum_rgb < 72) & (a > 12) & (a < 252)
    a2 = np.where(spill, np.maximum(0, (a * 0.35).astype(np.int32)), a)
    arr = arr.copy()
    arr[:, :, 3] = np.clip(a2, 0, 255).astype(np.uint8)
    # Lighten RGB on weak spill so premul edge doesn't read as gray dirt
    weak = (sum_rgb < 110) & (a > 8) & (a < 240) & ~spill
    for c in range(3):
        ch = arr[:, :, c].astype(np.int32)
        ch = np.where(weak, np.minimum(255, ch + ((255 - ch) * 0.12).astype(np.int32)), ch)
        arr[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)
    return arr


def process_png(path: str) -> None:
    im = Image.open(path).convert("RGBA")
    if np is not None:
        arr = np.array(im)
        arr = _defringe_dark_spill_rgba(arr)
        im = Image.fromarray(arr, "RGBA")
    a = im.split()[-1]
    a = a.filter(ImageFilter.GaussianBlur(0.45))
    im.putalpha(a)
    im.save(path, optimize=True)


def main() -> None:
    base = os.path.join(os.path.dirname(__file__), "..", "images", "pieces")
    for name in ("fruit1.png", "fruit2.png"):
        p = os.path.normpath(os.path.join(base, name))
        if not os.path.isfile(p):
            print("skip missing", p)
            continue
        process_png(p)
        print("OK", p)
    ui = os.path.normpath(os.path.join(base, "..", "..", "UI", "棋子"))
    if os.path.isdir(ui):
        for name in ("fruit1.png", "fruit2.png"):
            p = os.path.join(ui, name)
            if os.path.isfile(p):
                process_png(p)
                print("OK", p)


if __name__ == "__main__":
    main()
