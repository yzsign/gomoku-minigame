# -*- coding: utf-8 -*-
"""将黑底素材抠透明并统一尺寸，写入 images/ui/game-bar-*.png"""
from __future__ import print_function

import os
import sys

import numpy as np
from PIL import Image


def remove_black_bg(rgba, black_thresh=38, edge_soft=18):
    """去掉近黑色背景；暗部边缘做软过渡，避免锯齿。"""
    rgb = rgba[:, :, :3].astype(np.float64)
    a = rgba[:, :, 3].astype(np.float64)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # 离「纯黑」的距离（取 max 通道作为亮度代理）
    mx = np.maximum(np.maximum(r, g), b)
    # mx 小 = 背景黑
    t0 = float(black_thresh)
    t1 = t0 + edge_soft
    factor = np.clip((mx - t0) / max(t1 - t0, 1e-6), 0.0, 1.0)
    factor = factor * factor  # 略压暗部过渡
    new_a = a * factor
    return np.dstack([rgb, new_a])


def crop_and_fit(im_rgba, max_side=160):
    """裁剪到非透明外接矩形，再按比例缩放到 max_side。"""
    im = Image.fromarray(np.clip(im_rgba, 0, 255).astype(np.uint8), "RGBA")
    bbox = im.getbbox()
    if bbox:
        pad = max(1, int(round(min(im.size) * 0.02)))
        x0, y0, x1, y1 = bbox
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(im.width, x1 + pad)
        y1 = min(im.height, y1 + pad)
        im = im.crop((x0, y0, x1, y1))
    w, h = im.size
    if max(w, h) > max_side:
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return im


def process_one(src_path, out_path, max_side=160):
    im = Image.open(src_path).convert("RGBA")
    arr = np.array(im)
    arr2 = remove_black_bg(arr)
    final = crop_and_fit(arr2, max_side=max_side)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    final.save(out_path, optimize=True)
    print(out_path, final.size, os.path.getsize(out_path), "bytes")


def main():
    """
    从「黑底截图」生成 game-bar-*.png。源图放在 images/ui/ 下，文件名见 mapping；
    或通过环境变量 GOMOKU_GAME_BAR_ICON_SRC 指定目录（默认 images/ui）。
    """
    here = os.path.dirname(os.path.abspath(__file__))
    base = os.environ.get("GOMOKU_GAME_BAR_ICON_SRC") or os.path.join(
        here, "..", "images", "ui"
    )
    base = os.path.abspath(base)
    mapping = [
        ("game-bar-home-src.png", "game-bar-home.png"),
        ("game-bar-undo-src.png", "game-bar-undo.png"),
        ("game-bar-resign-src.png", "game-bar-resign.png"),
    ]
    out_dir = os.path.join(os.path.dirname(__file__), "..", "images", "ui")
    max_side = 160
    if len(sys.argv) >= 2:
        max_side = int(sys.argv[1])

    for rel, name in mapping:
        src = os.path.join(base, rel)
        if not os.path.isfile(src):
            print("Missing:", src, file=sys.stderr)
            sys.exit(1)
        process_one(src, os.path.join(out_dir, name), max_side=max_side)


if __name__ == "__main__":
    main()
