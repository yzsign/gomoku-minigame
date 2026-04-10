# -*- coding: utf-8 -*-
"""抠出图标主体：去掉外圈米色 + 圆角卡片底色，输出透明 PNG（认输按钮）。"""
from __future__ import print_function

import os
import sys

import cv2
import numpy as np
from PIL import Image


def union_corner_flood_fills(bgr, lo=26, up=26):
    """从四角泛洪，合并为「与边缘连通」的背景蒙版（BGR）。"""
    h, w = bgr.shape[:2]
    total = np.zeros((h, w), dtype=np.uint8)
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        work = bgr.copy()
        mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
        lo_diff = (lo, lo, lo)
        up_diff = (up, up, up)
        flags = (
            cv2.FLOODFILL_FIXED_RANGE
            | cv2.FLOODFILL_MASK_ONLY
            | (255 << 8)
            | 4
        )
        cv2.floodFill(
            work,
            mask,
            (sx, sy),
            (0, 0, 0),
            loDiff=lo_diff,
            upDiff=up_diff,
            flags=flags,
        )
        total = np.maximum(total, mask[1:-1, 1:-1])
    return total > 0


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: python cutout_flag_icon.py <source.png> [out.png]",
            file=sys.stderr,
        )
        sys.exit(1)
    src = sys.argv[1]
    out = (
        sys.argv[2]
        if len(sys.argv) >= 3
        else os.path.join(os.path.dirname(__file__), "..", "images", "ui", "game-bar-resign.png")
    )

    if not os.path.isfile(src):
        print("Source not found:", src, file=sys.stderr)
        sys.exit(1)

    im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    if im is None:
        print("Failed to read:", src, file=sys.stderr)
        sys.exit(1)

    if im.shape[2] == 4:
        bgr_cv = im[:, :, :3]
        old_a = im[:, :, 3]
    else:
        bgr_cv = im
        old_a = np.ones(bgr_cv.shape[:2], dtype=np.uint8) * 255

    bg = union_corner_flood_fills(bgr_cv, lo=28, up=28)
    kernel = np.ones((3, 3), np.uint8)
    bg = cv2.dilate(bg.astype(np.uint8), kernel, iterations=1).astype(bool)

    alpha = np.where(bg, 0, old_a).astype(np.float32)
    alpha_u8 = np.clip(alpha, 0, 255).astype(np.uint8)
    alpha_u8 = cv2.GaussianBlur(alpha_u8, (0, 0), 0.6)
    alpha_u8 = np.where(alpha_u8 < 8, 0, alpha_u8)
    alpha_u8 = np.where(alpha_u8 > 248, 255, alpha_u8)

    bgr = cv2.cvtColor(bgr_cv, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([bgr, alpha_u8])

    final = Image.fromarray(rgba, "RGBA")
    bbox = final.getbbox()
    if bbox:
        pad = max(2, int(round(min(final.size) * 0.03)))
        x0, y0, x1, y1 = bbox
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(final.width, x1 + pad)
        y1 = min(final.height, y1 + pad)
        final = final.crop((x0, y0, x1, y1))

    # 底栏约 rpx(30) 显示，缩小以控制包体（保持透明）
    max_side = 160
    if max(final.size) > max_side:
        final.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    final.save(out, optimize=True)
    print("Wrote", out, final.size)


if __name__ == "__main__":
    main()
