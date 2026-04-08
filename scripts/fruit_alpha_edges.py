"""
Remove solid black (or dark) background from fruit piece PNGs by flood-filling
from image edges. Interior dark details stay if not connected to the border.
"""
from __future__ import annotations

import sys
from collections import deque

from PIL import Image


def flood_edge_dark_to_transparent(
    path: str, out_path: str, rgb_sum_max: int = 52
) -> None:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    vis = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def dark(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        return r + g + b <= rgb_sum_max

    def push(x: int, y: int) -> None:
        if x < 0 or x >= w or y < 0 or y >= h or vis[y][x]:
            return
        if not dark(x, y):
            return
        vis[y][x] = True
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if nx < 0 or nx >= w or ny < 0 or ny >= h or vis[ny][nx]:
                continue
            if dark(nx, ny):
                vis[ny][nx] = True
                q.append((nx, ny))

    im.save(out_path, optimize=True)


def main() -> None:
    if len(sys.argv) < 2:
        base = "d:/work/gomoku-minigame/images/pieces"
        for name in ("fruit1.png", "fruit2.png"):
            p = f"{base}/{name}"
            flood_edge_dark_to_transparent(p, p)
            print("OK", p)
        return
    inp = sys.argv[1]
    outp = sys.argv[2] if len(sys.argv) > 2 else inp
    flood_edge_dark_to_transparent(inp, outp)
    print("OK", outp)


if __name__ == "__main__":
    main()
