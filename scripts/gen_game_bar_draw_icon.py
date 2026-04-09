"""Generate game-bar-draw.png: handshake — 双掌斜向交叠 + 外侧拇指小块，紫框珊瑚芯（同悔棋）。"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

try:
    _BICUBIC = Image.Resampling.BICUBIC
    _LANCZOS = Image.Resampling.LANCZOS
except AttributeError:
    _BICUBIC = Image.BICUBIC
    _LANCZOS = Image.LANCZOS

PURPLE = (0x8E, 0x66, 0xC6, 255)
CORAL = (0xFF, 0x84, 0x69, 255)

W, H = 153, 160
SCALE = 2


def ellipse_hand(ew: int, eh: int, inset: int) -> Image.Image:
    """双层椭圆：外紫内珊瑚，模拟手掌块面。"""
    pad = 8
    im = Image.new("RGBA", (ew + pad * 2, eh + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0 = pad, pad
    x1, y1 = pad + ew, pad + eh
    d.ellipse([x0, y0, x1, y1], fill=PURPLE)
    d.ellipse(
        [x0 + inset, y0 + inset, x1 - inset, y1 - inset],
        fill=CORAL,
    )
    return im


def paste_center(dest: Image.Image, src: Image.Image, cx: float, cy: float) -> None:
    w, h = src.size
    dest.alpha_composite(src, (int(round(cx - w / 2)), int(round(cy - h / 2))))


def build_handshake(supersample: int) -> Image.Image:
    w0, h0 = W * supersample, H * supersample
    img = Image.new("RGBA", (w0, h0), (0, 0, 0, 0))

    ew = 44 * supersample
    eh = 56 * supersample
    ins = 5 * supersample

    left = ellipse_hand(ew, eh, ins).rotate(32, expand=True, resample=_BICUBIC)
    right = ellipse_hand(ew, eh, ins).rotate(-32, expand=True, resample=_BICUBIC)

    cx, cy = w0 / 2, h0 / 2 + 2 * supersample
    # 左右掌斜向中心交叠（略收紧，更像握在一起）
    paste_center(img, left, cx - 20 * supersample, cy)
    paste_center(img, right, cx + 20 * supersample, cy)

    # 外侧拇指：小椭圆，增强「手」的语义（避免像蝴蝶结）
    tw, th = 15 * supersample, 19 * supersample
    tins = 3 * supersample
    l_thumb = ellipse_hand(tw, th, tins).rotate(48, expand=True, resample=_BICUBIC)
    r_thumb = ellipse_hand(tw, th, tins).rotate(-48, expand=True, resample=_BICUBIC)
    paste_center(img, l_thumb, cx - 36 * supersample, cy - 14 * supersample)
    paste_center(img, r_thumb, cx + 36 * supersample, cy - 14 * supersample)

    if supersample > 1:
        img = img.resize((W, H), resample=_LANCZOS)
    return img


def main() -> None:
    img = build_handshake(SCALE)
    root = Path(__file__).resolve().parents[1]
    out = root / "images" / "ui" / "game-bar-draw.png"
    img.save(out)
    print("saved", out, img.size)


if __name__ == "__main__":
    main()
