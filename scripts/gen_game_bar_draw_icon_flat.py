"""
和棋底栏图标 — 扁平亮青色：左实心掌 + 右线框掌，四指横条自内侧伸向中央交错（参考常见「和棋」符号）。

输出：images/ui/game-bar-draw.png（153×160，透明底）
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

try:
    _BICUBIC = Image.Resampling.BICUBIC
    _LANCZOS = Image.Resampling.LANCZOS
except AttributeError:
    _BICUBIC = Image.BICUBIC
    _LANCZOS = Image.LANCZOS

CYAN = (0, 191, 214, 255)
TRANSPARENT = (0, 0, 0, 0)

W, H = 153, 160
S = 2


def build_handshake() -> Image.Image:
    sw = max(3, int(3.5 * S))
    lw, lh = 220 * S, 200 * S
    im = Image.new("RGBA", (lw, lh), TRANSPARENT)
    d = ImageDraw.Draw(im)

    # 局部坐标：左掌在左，中线约在 x≈110*S
    ox, oy = 28 * S, 48 * S

    # 1) 右掌线框（先画，在后层）
    palm_r = (ox + 118 * S, oy + 18 * S, ox + 168 * S, oy + 88 * S)
    try:
        d.rounded_rectangle(palm_r, radius=12 * S, outline=CYAN, width=sw)
    except TypeError:
        d.rounded_rectangle(palm_r, radius=12 * S, outline=CYAN)

    # 2) 左掌实心
    palm_l = (ox + 8 * S, oy + 22 * S, ox + 58 * S, oy + 88 * S)
    d.rounded_rectangle(palm_l, radius=12 * S, fill=CYAN)

    # 3) 左手指：四根横条，从掌右缘伸向中央（叠在右线框之上）
    fy0 = oy + 26 * S
    fh = 7 * S
    fg = 5 * S
    for i in range(4):
        y = fy0 + i * (fh + fg)
        d.rounded_rectangle(
            [ox + 52 * S, y, ox + 108 * S, y + fh],
            radius=4 * S,
            fill=CYAN,
        )

    # 4) 右手指：四根横条，从内侧向左伸出，压在左掌之上（参考「交错」）
    for i in range(4):
        y = fy0 + i * (fh + fg)
        d.rounded_rectangle(
            [ox + 62 * S, y, ox + 122 * S, y + fh],
            radius=4 * S,
            fill=CYAN,
        )

    # 整体倾斜约 40°
    im = im.rotate(-40, resample=_BICUBIC, expand=True)

    out = Image.new("RGBA", (W * S, H * S), TRANSPARENT)
    sw_im, sh_im = im.size
    px = (W * S - sw_im) // 2
    py = (H * S - sh_im) // 2
    out.alpha_composite(im, (px, py))

    return out.resize((W, H), resample=_LANCZOS)


def main() -> None:
    img = build_handshake()
    root = Path(__file__).resolve().parents[1]
    out = root / "images" / "ui" / "game-bar-draw.png"
    img.save(out)
    print("saved (flat cyan)", out, img.size)


if __name__ == "__main__":
    main()
