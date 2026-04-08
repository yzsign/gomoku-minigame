"""
将 images/default/boy.png、girl.png 裁剪为仅保留圆形头像区域（方形画布 + 圆外透明）。
圆心与半径由 OpenCV HoughCircles 自动检测。
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "images" / "default"


def detect_avatar_circle(gray: np.ndarray):
    """返回 (cx, cy, r) 或 None。"""
    blur = cv2.medianBlur(gray, 5)
    h, w = blur.shape[:2]
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1,
        minDist=min(h, w),
        param1=80,
        param2=30,
        minRadius=int(h * 0.25),
        maxRadius=int(h * 0.55),
    )
    if circles is None or len(circles[0]) < 1:
        return None
    x, y, r = circles[0][0]
    return float(x), float(y), float(r)


def crop_circle_rgba(bgr: np.ndarray, cx: float, cy: float, r: float) -> Image.Image:
    h, w = bgr.shape[:2]
    side = int(round(2 * r))
    x0 = int(round(cx - side / 2))
    y0 = int(round(cy - side / 2))
    x0 = max(0, min(x0, w - side))
    y0 = max(0, min(y0, h - side))
    if x0 + side > w:
        x0 = w - side
    if y0 + side > h:
        y0 = h - side
    crop_bgr = bgr[y0 : y0 + side, x0 : x0 + side]
    ch, cw = crop_bgr.shape[:2]
    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    arr = np.zeros((ch, cw, 4), dtype=np.uint8)
    arr[:, :, :3] = rgb
    rcx = cx - x0
    rcy = cy - y0
    yy, xx = np.ogrid[:ch, :cw]
    dist = np.sqrt((xx - rcx) ** 2 + (yy - rcy) ** 2)
    edge = 2.0
    alpha = np.clip(r - dist + edge, 0, 255).astype(np.uint8)
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


def process_one(path: Path) -> None:
    im = cv2.imread(str(path))
    if im is None:
        raise SystemExit(f"cannot read {path}")
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    det = detect_avatar_circle(gray)
    h, w = gray.shape[:2]
    if det is None:
        cx, cy, r = w / 2, h / 2, min(w, h) * 0.38
        print(path.name, "fallback circle", cx, cy, r)
    else:
        cx, cy, r = det
        print(path.name, "detected", round(cx, 1), round(cy, 1), round(r, 1))
    out = crop_circle_rgba(im, cx, cy, r)
    tmp = path.parent / (".writing_" + path.name)
    out.save(tmp, format="PNG", optimize=True)
    tmp.replace(path)


def main() -> None:
    for name in ("boy.png", "girl.png"):
        p = DEFAULT_DIR / name
        if not p.exists():
            raise SystemExit(f"missing {p}")
        process_one(p)


if __name__ == "__main__":
    main()
