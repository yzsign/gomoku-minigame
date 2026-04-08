# 柔化吉祥物 GIF / 雪碧图线条：超采样抗锯齿 + 轻微 USM，减轻毛糙与锯齿感。
# 不改变逻辑分辨率；依赖 Pillow。
# 用法: py -3 scripts/refine_mascot_gif.py
from __future__ import annotations

import os
import sys

from PIL import Image, ImageFilter, ImageSequence

# 超采样倍数：2 较快；3 更顺滑但处理更慢、中间图更大
SUPERSAMPLE = 2

# 超采样后、缩小前极轻模糊，柔化硬边（仅作用于已放大图，减轻锯齿；半径过大易糊）
PRE_DOWN_BLUR = 0.35

# 缩小后 UnsharpMask：略提边缘清晰度，抵消柔化发虚
USM_RADIUS = 0.75
USM_PERCENT = 115
USM_THRESHOLD = 1


def refine_frame_rgba(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    if w < 2 or h < 2:
        return im
    s = SUPERSAMPLE
    up = im.resize((w * s, h * s), Image.Resampling.LANCZOS)
    if PRE_DOWN_BLUR > 0:
        up = up.filter(ImageFilter.GaussianBlur(radius=PRE_DOWN_BLUR))
    out = up.resize((w, h), Image.Resampling.LANCZOS)
    out = out.filter(
        ImageFilter.UnsharpMask(
            radius=USM_RADIUS, percent=USM_PERCENT, threshold=USM_THRESHOLD
        )
    )
    return out


def main() -> None:
    root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "images", "ui"))
    gif_path = os.path.join(root, "home-mascot.gif")
    if not os.path.isfile(gif_path):
        print("missing", gif_path, file=sys.stderr)
        sys.exit(1)

    im = Image.open(gif_path)
    durations: list[int] = []
    frames: list[Image.Image] = []
    for fr in ImageSequence.Iterator(im):
        durations.append(int(fr.info.get("duration", 100)))
        frames.append(refine_frame_rgba(fr))

    n = len(frames)
    if n == 0:
        sys.exit(1)

    gif_out = os.path.join(root, "home-mascot.gif")
    frames[0].save(
        gif_out,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print("wrote", gif_out, "frames", n)

    mw = max(f.width for f in frames)
    mh = max(f.height for f in frames)
    sheet = Image.new("RGBA", (mw * n, mh), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        x = i * mw + (mw - fr.width) // 2
        y = (mh - fr.height) // 2
        sheet.paste(fr, (x, y), fr)
    sheet_path = os.path.join(root, "home-mascot-sheet.png")
    sheet.save(sheet_path, "PNG")
    print("wrote", sheet_path, "cell", mw, "x", mh)


if __name__ == "__main__":
    main()
