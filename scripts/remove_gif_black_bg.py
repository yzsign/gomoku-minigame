# 去除与画布边缘连通的近黑背景（适合团子类居中图），再导出透明 GIF + 雪碧图。
# 依赖: pip install Pillow
from __future__ import annotations

import os
import sys
from collections import deque

from PIL import Image, ImageSequence

def is_seed_bg(r: int, g: int, b: int, seed_max: int = 22) -> bool:
    """仅用于从四边入队：过宽会把角色边缘暗线当背景。"""
    return r + g + b < seed_max


def is_expand_bg(r: int, g: int, b: int, expand_max: int = 34) -> bool:
    """
    泛洪扩展条件：须略严于常见抗锯齿过渡（例如 sum≈39 的像素），
    否则会与底部黑边连通，误删与背景同色的角色轮廓/脚部线条。
    """
    return r + g + b < expand_max


def neighbor_bright_sum(
    px, x: int, y: int, w: int, h: int, bright_min: int = 78
) -> bool:
    """8 邻域是否存在「身体/浅色」像素（用于保留与背景同色的纯黑描边、手脚）。"""
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if nx < 0 or nx >= w or ny < 0 or ny >= h:
                continue
            r, g, b = px[nx, ny][:3]
            if r + g + b >= bright_min:
                return True
    return False


def flood_transparent(
    rgba: Image.Image, seed_max: int = 22, expand_max: int = 34
) -> Image.Image:
    w, h = rgba.size
    orig = rgba.copy()
    px = orig.load()
    vis = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def push_seed(x: int, y: int) -> None:
        if x < 0 or x >= w or y < 0 or y >= h or vis[y][x]:
            return
        r, g, b, _ = px[x, y]
        if not is_seed_bg(r, g, b, seed_max):
            return
        vis[y][x] = True
        q.append((x, y))

    def push_expand(x: int, y: int) -> None:
        if x < 0 or x >= w or y < 0 or y >= h or vis[y][x]:
            return
        r, g, b, _ = px[x, y]
        if not is_expand_bg(r, g, b, expand_max):
            return
        vis[y][x] = True
        q.append((x, y))

    for x in range(w):
        push_seed(x, 0)
        push_seed(x, h - 1)
    for y in range(h):
        push_seed(0, y)
        push_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            push_expand(x + dx, y + dy)

    out = rgba.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not vis[y][x]:
                continue
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # 与浅色身体相邻的深色线稿（含纯黑脚/眼）：勿当背景抠掉
            if r + g + b < 55 and neighbor_bright_sum(px, x, y, w, h, 78):
                continue
            op[x, y] = (0, 0, 0, 0)
    return out


def main() -> None:
    root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "images", "ui"))
    gif_path = os.path.join(root, "home-mascot.gif")
    if not os.path.isfile(gif_path):
        print("missing", gif_path, file=sys.stderr)
        sys.exit(1)

    im = Image.open(gif_path)
    durations: list[int] = []
    frames_rgba: list[Image.Image] = []
    for fr in ImageSequence.Iterator(im):
        durations.append(int(fr.info.get("duration", 100)))
        frames_rgba.append(flood_transparent(fr.convert("RGBA")))

    n = len(frames_rgba)
    if n == 0:
        sys.exit(1)

    # 覆盖原 GIF（RGBA 序列；Pillow 会量化调色板）
    gif_out = os.path.join(root, "home-mascot.gif")
    frames_rgba[0].save(
        gif_out,
        save_all=True,
        append_images=frames_rgba[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print("wrote", gif_out, "frames", n)

    # 雪碧图
    mw = max(f.width for f in frames_rgba)
    mh = max(f.height for f in frames_rgba)
    sheet = Image.new("RGBA", (mw * n, mh), (0, 0, 0, 0))
    for i, fr in enumerate(frames_rgba):
        x = i * mw + (mw - fr.width) // 2
        y = (mh - fr.height) // 2
        sheet.paste(fr, (x, y), fr)
    sheet_path = os.path.join(root, "home-mascot-sheet.png")
    sheet.save(sheet_path, "PNG")
    print("wrote", sheet_path, "cell", mw, "x", mh)


if __name__ == "__main__":
    main()
