# 从 MP4 导出吉祥物：高分辨率去黑底 → 缩放入库 → 写 GIF + 横向雪碧图。
# 依赖: pip install Pillow opencv-python-headless
# 用法: py -3 scripts/video_to_mascot_assets.py [可选: 视频路径]
from __future__ import annotations

import importlib.util
import os
import sys

import cv2
from PIL import Image

# 微信小游戏主包约 4MB 上限；雪碧图体积 ≈ 宽² × 帧数（PNG 压缩后）
# stride 越小越顺滑；须同步略减 OUT_W 以免超包
OUT_W = 155
OUT_H = int(round(1012 * OUT_W / 908))

# 3≈源 24fps 下约 8fps，约 41 帧（比 stride4 更密）
FRAME_STRIDE = 3

# 多帧 GIF 体积大且 Canvas 只显示首帧；只导出雪碧图 + 单帧 PNG 兜底
WRITE_MULTI_FRAME_GIF = False


def load_remove_module():
    base = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base, "remove_gif_black_bg.py")
    spec = importlib.util.spec_from_file_location("remove_gif_black_bg", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    rm = load_remove_module()
    base = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
    root = os.path.join(base, "subpackages", "res-mascot", "images", "ui")
    os.makedirs(root, exist_ok=True)

    video = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.path.join(os.path.dirname(__file__), "..", "..", "UI", "Video 23.mp4")
    )
    video = os.path.normpath(video)
    if not os.path.isfile(video):
        print("missing video", video, file=sys.stderr)
        sys.exit(1)

    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_ms = max(1, int(round(1000.0 / fps)))

    frames_rgba: list[Image.Image] = []
    durations: list[int] = []
    video_frame = 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        if video_frame % FRAME_STRIDE != 0:
            video_frame += 1
            continue
        video_frame += 1
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb).convert("RGBA")
        cut = rm.flood_transparent(pil)
        cut = cut.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
        frames_rgba.append(cut)
        durations.append(frame_ms * FRAME_STRIDE)

    cap.release()
    n = len(frames_rgba)
    if n == 0:
        print("no frames", file=sys.stderr)
        sys.exit(1)

    gif_out = os.path.join(root, "home-mascot.gif")
    if WRITE_MULTI_FRAME_GIF:
        frames_rgba[0].save(
            gif_out,
            save_all=True,
            append_images=frames_rgba[1:],
            duration=durations,
            loop=0,
            disposal=2,
            optimize=False,
        )
        print("wrote", gif_out, "frames", n, "duration_ms", durations[0], "fps", fps)
    else:
        if os.path.isfile(gif_out):
            try:
                os.remove(gif_out)
            except OSError:
                pass
        print("skip multi-frame gif (WRITE_MULTI_FRAME_GIF=False), removed", gif_out)

    png_fallback = os.path.join(root, "home-mascot.png")
    frames_rgba[0].save(png_fallback, "PNG", optimize=True, compress_level=9)
    print("wrote", png_fallback)

    mw = OUT_W
    mh = OUT_H
    sheet = Image.new("RGBA", (mw * n, mh), (0, 0, 0, 0))
    for i, fr in enumerate(frames_rgba):
        sheet.paste(fr, (i * mw, 0), fr)
    sheet_path = os.path.join(root, "home-mascot-sheet.png")
    sheet.save(sheet_path, "PNG", optimize=True, compress_level=9)
    print("wrote", sheet_path, "cell", mw, "x", mh)
    print("main.js: MASCOT_SHEET_FRAME_COUNT =", n)
    eff_fps = 1000.0 / durations[0] if durations else fps
    print("main.js: MASCOT_SHEET_FPS =", round(eff_fps, 2))


if __name__ == "__main__":
    main()
