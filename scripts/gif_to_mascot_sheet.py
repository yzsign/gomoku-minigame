# 从 images/ui/home-mascot.gif 生成 home-mascot-sheet.png，并打印帧数（请同步 main.js 中 MASCOT_SHEET_FRAME_COUNT）
# 依赖: pip install Pillow
from PIL import Image, ImageSequence
import os

def main():
    root = os.path.join(os.path.dirname(__file__), "..", "images", "ui")
    root = os.path.normpath(root)
    gif = os.path.join(root, "home-mascot.gif")
    out = os.path.join(root, "home-mascot-sheet.png")
    im = Image.open(gif)
    frames = [f.convert("RGBA") for f in ImageSequence.Iterator(im)]
    n = len(frames)
    mw = max(f.width for f in frames)
    mh = max(f.height for f in frames)
    sheet = Image.new("RGBA", (mw * n, mh), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        x = i * mw + (mw - fr.width) // 2
        y = (mh - fr.height) // 2
        sheet.paste(fr, (x, y), fr)
    sheet.save(out, "PNG")
    print("frames", n, "cell", mw, "x", mh, "->", out)


if __name__ == "__main__":
    main()
