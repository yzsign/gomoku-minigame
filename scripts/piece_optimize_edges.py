"""
Optimize fruit piece PNG edges: premultiplied-alpha Gaussian blur (removes 毛边 / gray halos),
defringe dark spill, optional alpha refine. Rewrites images/pieces/fruit1.png, fruit2.png.
Requires: numpy, Pillow (no scipy).
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageFilter

SIGMA = 0.7


def _gaussian_kernel1d(sigma: float) -> np.ndarray:
    r = max(1, int(sigma * 3 + 0.5))
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-(x * x) / (2 * sigma * sigma))
    k /= k.sum()
    return k.astype(np.float32)


def _convolve_sep2d(img: np.ndarray, k: np.ndarray) -> np.ndarray:
    """img (H,W) float32; separable reflect-pad convolution."""
    pad = len(k) // 2
    h, w = img.shape
    tmp = np.empty_like(img)
    padded = np.pad(img, ((0, 0), (pad, pad)), mode="reflect")
    for y in range(h):
        tmp[y, :] = np.convolve(padded[y, :], k, mode="valid")
    padded2 = np.pad(tmp, ((pad, pad), (0, 0)), mode="reflect")
    out = np.empty_like(img)
    for x in range(w):
        out[:, x] = np.convolve(padded2[:, x], k, mode="valid")
    return out


def _premult_blur_unpremult(arr: np.ndarray, sigma: float) -> np.ndarray:
    """arr uint8 HxWx4 RGBA. Blur premultiplied color; unpremultiply by blurred alpha."""
    r = arr[:, :, 0].astype(np.float32)
    g = arr[:, :, 1].astype(np.float32)
    b = arr[:, :, 2].astype(np.float32)
    a = arr[:, :, 3].astype(np.float32) / 255.0
    rp = r * a
    gp = g * a
    bp = b * a
    k = _gaussian_kernel1d(sigma)
    brp = _convolve_sep2d(rp, k)
    bgp = _convolve_sep2d(gp, k)
    bbp = _convolve_sep2d(bp, k)
    ba = _convolve_sep2d(a, k)
    eps = 1e-4
    ba = np.maximum(ba, eps)
    r_out = np.clip(brp / ba, 0, 255)
    g_out = np.clip(bgp / ba, 0, 255)
    b_out = np.clip(bbp / ba, 0, 255)
    a_out = np.clip(ba * 255.0, 0, 255)
    return np.stack(
        [r_out, g_out, b_out, a_out], axis=2
    ).astype(np.uint8)


def _defringe_dark(arr: np.ndarray) -> np.ndarray:
    r = arr[:, :, 0].astype(np.int32)
    g = arr[:, :, 1].astype(np.int32)
    b = arr[:, :, 2].astype(np.int32)
    a = arr[:, :, 3].astype(np.int32)
    sum_rgb = r + g + b
    spill = (sum_rgb < 78) & (a > 10) & (a < 252)
    a2 = np.where(spill, np.maximum(0, (a * 0.28).astype(np.int32)), a)
    out = arr.copy()
    out[:, :, 3] = np.clip(a2, 0, 255).astype(np.uint8)
    weak = (sum_rgb < 118) & (a > 6) & (a < 245) & ~spill
    for c in range(3):
        ch = out[:, :, c].astype(np.int32)
        ch = np.where(
            weak,
            np.minimum(255, ch + ((255 - ch) * 0.18).astype(np.int32)),
            ch,
        )
        out[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)
    return out


def _refine_alpha(a: np.ndarray) -> np.ndarray:
    """Light edge contrast on alpha (PIL Gaussian on L)."""
    im = Image.fromarray(a, mode="L")
    im = im.filter(ImageFilter.GaussianBlur(0.35))
    return np.array(im, dtype=np.uint8)


def process_png(path: str) -> None:
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    arr = _defringe_dark(arr)
    arr = _premult_blur_unpremult(arr, SIGMA)
    arr = _defringe_dark(arr)
    a = _refine_alpha(arr[:, :, 3])
    arr = arr.copy()
    arr[:, :, 3] = a
    im = Image.fromarray(arr, "RGBA")
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
