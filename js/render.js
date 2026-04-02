var gomoku = require('./gomoku.js');

function pathRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} layout { margin, cell, boardPx, originX, originY }
 * @param {object} theme 主题（themes.js）
 */
function drawBoard(ctx, layout, theme) {
  var cell = layout.cell;
  var ox = layout.originX;
  var oy = layout.originY;
  var n = layout.size;
  var i;
  var b = theme.board;

  var boardW = (n - 1) * cell + cell;
  var boardH = boardW;
  var bx = ox - cell * 0.5;
  var by = oy - cell * 0.5;
  var br = Math.min(22, cell * 0.7);

  var boardGrad = ctx.createLinearGradient(
    ox - cell,
    oy - cell,
    ox + n * cell,
    oy + n * cell
  );
  boardGrad.addColorStop(0, b.g0);
  boardGrad.addColorStop(1, b.g1);

  ctx.save();
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.clip();
  ctx.fillStyle = boardGrad;
  ctx.fillRect(bx, by, boardW, boardH);
  ctx.strokeStyle = b.line;
  /* 略细、略柔，减轻网格「刺眼」感 */
  ctx.lineWidth = Math.max(0.75, cell * 0.038);

  for (i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + i * cell, oy);
    ctx.lineTo(ox + i * cell, oy + (n - 1) * cell);
    ctx.stroke();
  }
  for (i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + i * cell);
    ctx.lineTo(ox + (n - 1) * cell, oy + i * cell);
    ctx.stroke();
  }

  var stars = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
  ctx.fillStyle = b.star;
  for (i = 0; i < stars.length; i++) {
    var sx = stars[i][0];
    var sy = stars[i][1];
    ctx.beginPath();
    /* 星位略小，避免与高饱和线色抢对比 */
    ctx.arc(ox + sx * cell, oy + sy * cell, cell * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} board
 * @param {object} layout
 * @param {object} theme 主题（themes.js）
 */
function drawPieces(ctx, board, layout, theme) {
  var cell = layout.cell;
  var ox = layout.originX;
  var oy = layout.originY;
  var r;
  var c;
  var radius = cell * 0.38;
  var pb = theme.pieces.black;
  var pw = theme.pieces.white;

  for (r = 0; r < layout.size; r++) {
    for (c = 0; c < layout.size; c++) {
      var v = board[r][c];
      if (v === gomoku.EMPTY) continue;
      var cx = ox + c * cell;
      var cy = oy + r * cell;
      var grd = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.2,
        cx,
        cy,
        radius
      );
      if (v === gomoku.BLACK) {
        grd.addColorStop(0, pb.g0);
        grd.addColorStop(1, pb.g1);
      } else {
        grd.addColorStop(0, pw.g0);
        grd.addColorStop(1, pw.g1);
      }
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = v === gomoku.BLACK ? pb.stroke : pw.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/**
 * 标出对手上一手：外环 + 中心实点，配色贴近经典木质棋盘（浅蜜棕 / 深木墨线），与细白环区分明显。
 */
function drawOpponentLastMoveMarker(ctx, layout, theme, r, c, stoneColor) {
  var cell = layout.cell;
  var ox = layout.originX;
  var oy = layout.originY;
  var cx = ox + c * cell;
  var cy = oy + r * cell;
  var pr = cell * 0.38;
  var b = theme && theme.board;
  /** 与 themes.classic.board 一致的浅蜜棕 / 深木墨线 */
  var woodLight = '#e8d4b8';
  var woodDark = '#2a1a0e';
  var woodLightCore = '#f5ebd4';
  var woodDarkCore = '#1a120c';
  if (b && theme.id === 'classic') {
    woodLight = b.g0 || woodLight;
    woodDark = b.line === '#000000' ? '#1a1814' : b.line || woodDark;
    woodLightCore = b.g1 || woodLightCore;
    woodDarkCore = woodDark;
  } else if (b && stoneColor !== gomoku.BLACK) {
    woodDark = lineStrokeForClassicMarker(b.line, woodDark);
    woodDarkCore = woodDark;
  }
  var ringR = pr * 0.56;
  var dotR = pr * 0.2;
  var lw = Math.max(2.2, cell * 0.095);
  ctx.save();
  if (stoneColor === gomoku.BLACK) {
    ctx.shadowColor = 'rgba(255, 235, 200, 0.55)';
    ctx.shadowBlur = Math.max(4, cell * 0.08);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = stoneColor === gomoku.BLACK ? woodLight : woodDark;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fillStyle =
    stoneColor === gomoku.BLACK ? woodLightCore : woodDarkCore;
  ctx.fill();
  ctx.restore();
}

/** 浅色格线不用作白子标记，退回深木棕 */
function lineStrokeForClassicMarker(line, fallback) {
  if (!line || line.length < 4) {
    return fallback;
  }
  var r = parseInt(line.slice(1, 3), 16);
  var g = parseInt(line.slice(3, 5), 16);
  var bl = parseInt(line.slice(5, 7), 16);
  if (r !== r || g !== g || bl !== bl) {
    return fallback;
  }
  if ((r + g + bl) / 3 < 90) {
    return line === '#000000' ? '#1a1814' : line;
  }
  return fallback;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize
 * @param {string} color
 * @param {string} [fontWeight] 'normal' | 'bold'，默认 bold
 */
function drawText(ctx, text, x, y, fontSize, color, fontWeight) {
  var fw = fontWeight === 'normal' ? 'normal' : 'bold';
  ctx.font =
    fw +
    ' ' +
    fontSize +
    'px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = color || '#4a5a59';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

module.exports = {
  drawBoard: drawBoard,
  drawPieces: drawPieces,
  drawOpponentLastMoveMarker: drawOpponentLastMoveMarker,
  drawText: drawText
};
