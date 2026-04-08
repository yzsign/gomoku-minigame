# -*- coding: utf-8 -*-
"""Split js/main/gameLogic.js into safe chunks under js/main/gameLogic/."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "js" / "main" / "gameLogic.monolith.js"
OUT_DIR = ROOT / "js" / "main" / "gameLogic"
APPROX_LINES = 1650

DEPS_BLOCK = """  var gomoku = deps.gomoku;
  var render = deps.render;
  var themes = deps.themes;
  var doodles = deps.doodles;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;
  var defaultAvatars = deps.defaultAvatars;
  var ratingTitle = deps.ratingTitle;
  var wx = deps.wx;

"""

TOP_ASSIGN = re.compile(r"^app\.\w+\s*=\s*function")


def find_next_boundary(body_lines, from_idx):
    """First line >= from_idx where a new top-level app.* = function starts."""
    n = len(body_lines)
    if from_idx >= n:
        return n
    for j in range(from_idx, n):
        if TOP_ASSIGN.match(body_lines[j]):
            return j
    return n


def main():
    text = SRC.read_text(encoding="utf-8")
    lines = text.splitlines()
    start = 0
    for i, line in enumerate(lines):
        if line.strip() == "var wx = deps.wx;":
            start = i + 1
            break
    while start < len(lines) and not lines[start].strip():
        start += 1
    end = len(lines) - 1
    while end > start and lines[end].strip() != "};":
        end -= 1
    body = lines[start:end]

    split_points = [0]
    i = 0
    while i < len(body):
        nxt_search = i + APPROX_LINES
        if nxt_search >= len(body):
            break
        j = find_next_boundary(body, nxt_search)
        if j <= i:
            break
        split_points.append(j)
        i = j
    if split_points[-1] != len(body):
        split_points.append(len(body))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    parts = []
    for pi in range(len(split_points) - 1):
        lo, hi = split_points[pi], split_points[pi + 1]
        chunk_lines = body[lo:hi]
        if not chunk_lines:
            continue
        name = "part%d.js" % (len(parts) + 1)
        path = OUT_DIR / name
        header = (
            "/**\n * Auto-split from gameLogic.js (part %d)\n */\n"
            "module.exports = function register(app, deps) {\n" % (len(parts) + 1)
            + DEPS_BLOCK
        )
        footer = "\n};\n"
        path.write_text(header + "\n".join(chunk_lines) + footer, encoding="utf-8")
        parts.append(name)
        print("Wrote", path, "lines", len(chunk_lines))

    req = "\n".join("  require('./%s')(app, deps);" % n for n in parts)
    idx = OUT_DIR / "index.js"
    idx.write_text(
        "/**\n * 游戏逻辑分片入口（原 main.js 主体）\n */\n"
        "module.exports = function gameLogic(app, deps) {\n"
        + req
        + "\n};\n",
        encoding="utf-8",
    )
    print("Wrote", idx)
    SRC.unlink()
    print("Removed monolithic", SRC)


if __name__ == "__main__":
    main()
