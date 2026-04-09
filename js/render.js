var gomoku = require('./gomoku.js');

/** 与 main 中 ctx.setTransform(dpr) 一致，用于文字/坐标对齐到物理像素，减轻发糊 */
var canvasDpr = 2;

function setCanvasDpr(d) {
  canvasDpr = d > 0 && d === d ? d : 2;
}

function snapLogical(x) {
  return Math.round(x * canvasDpr) / canvasDpr;
}

var DEFAULT_PIECE_BOARD_RADIUS_CELL = 0.38;

/** 棋盘棋子半径（格宽比例）；皮肤可覆盖 pieceBoardRadiusCell */
function boardPieceRadius(cell, pieceTheme) {
  var k = DEFAULT_PIECE_BOARD_RADIUS_CELL;
  if (
    pieceTheme &&
    typeof pieceTheme.pieceBoardRadiusCell === 'number' &&
    pieceTheme.pieceBoardRadiusCell > 0
  ) {
    k = pieceTheme.pieceBoardRadiusCell;
  }
  return cell * k;
}

/**
 * 贴图质心相对画布中心的偏移（× pr × pieceTextureDrawScale），用于蓝环/胜线与果子对齐。
 * themes.opponentLastMoveMarker.markerCenterOffsetXMulBlack 等为 2*(centroid/w - 0.5)。
 */
function getPieceTextureVisualCenterOffset(theme, stoneColor, pr) {
  var m = theme && theme.opponentLastMoveMarker;
  if (!m) {
    return { dx: 0, dy: 0 };
  }
  var ts =
    theme &&
    typeof theme.pieceTextureDrawScale === 'number' &&
    theme.pieceTextureDrawScale > 0
      ? theme.pieceTextureDrawScale
      : 1;
  var isB = stoneColor === gomoku.BLACK;
  var mx = isB ? m.markerCenterOffsetXMulBlack : m.markerCenterOffsetXMulWhite;
  var my = isB ? m.markerCenterOffsetYMulBlack : m.markerCenterOffsetYMulWhite;
  if (typeof mx !== 'number') {
    mx = 0;
  }
  if (typeof my !== 'number') {
    my = 0;
  }
  return { dx: mx * pr * ts, dy: my * pr * ts };
}

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
 * 檀木主题：蜜棕径向光、细横纹、左上内阴影、右下厚边、左上高光（整体偏深木色）
 */
function fillClassicWoodPlank(ctx, bx, by, boardW, boardH) {
  var cx = bx + boardW * 0.5;
  var cy = by + boardH * 0.5;
  var rad = Math.max(boardW, boardH) * 0.78;
  var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  rg.addColorStop(0, '#e8dcc8');
  rg.addColorStop(0.35, '#d4c0a0');
  rg.addColorStop(0.68, '#bca078');
  rg.addColorStop(1, '#9d7a50');
  ctx.fillStyle = rg;
  ctx.fillRect(bx, by, boardW, boardH);

  ctx.strokeStyle = 'rgba(90, 68, 44, 0.085)';
  ctx.lineWidth = 1;
  var gy;
  for (gy = by + 2; gy < by + boardH; gy += 4) {
    ctx.beginPath();
    ctx.moveTo(bx, gy + 0.5);
    ctx.lineTo(bx + boardW, gy + 0.5);
    ctx.stroke();
  }

  var ins = Math.max(6, Math.min(boardW, boardH) * 0.048);
  var gt = ctx.createLinearGradient(0, by, 0, by + ins);
  gt.addColorStop(0, 'rgba(35, 26, 16, 0.15)');
  gt.addColorStop(1, 'rgba(35, 26, 16, 0)');
  ctx.fillStyle = gt;
  ctx.fillRect(bx, by, boardW, ins);

  var gl = ctx.createLinearGradient(bx, 0, bx + ins, 0);
  gl.addColorStop(0, 'rgba(28, 20, 12, 0.12)');
  gl.addColorStop(1, 'rgba(28, 20, 12, 0)');
  ctx.fillStyle = gl;
  ctx.fillRect(bx, by, ins, boardH);

  var hl = Math.max(20, boardW * 0.14);
  var hlg = ctx.createLinearGradient(bx, by, bx + hl, by + hl);
  hlg.addColorStop(0, 'rgba(255, 250, 238, 0.22)');
  hlg.addColorStop(1, 'rgba(255, 250, 238, 0)');
  ctx.fillStyle = hlg;
  ctx.fillRect(bx, by, boardW * 0.55, boardH * 0.55);

  var bevel = Math.max(5, boardW * 0.022);
  var rgr = ctx.createLinearGradient(bx + boardW - bevel, 0, bx + boardW, 0);
  rgr.addColorStop(0, 'rgba(45, 30, 18, 0)');
  rgr.addColorStop(0.45, 'rgba(55, 38, 24, 0.26)');
  rgr.addColorStop(1, 'rgba(32, 22, 14, 0.55)');
  ctx.fillStyle = rgr;
  ctx.fillRect(bx + boardW - bevel, by, bevel, boardH);

  var bgr = ctx.createLinearGradient(0, by + boardH - bevel, 0, by + boardH);
  bgr.addColorStop(0, 'rgba(40, 28, 18, 0)');
  bgr.addColorStop(0.5, 'rgba(44, 30, 20, 0.2)');
  bgr.addColorStop(1, 'rgba(28, 18, 12, 0.5)');
  ctx.fillStyle = bgr;
  ctx.fillRect(bx, by + boardH - bevel, boardW, bevel);
}

/**
 * 从水墨图缩略采样上下区主色，供棋盘先铺底（仿画纸配色）
 */
function sampleInkPaperColors(img) {
  try {
    if (typeof wx === 'undefined' || !wx.createCanvas || !img.width) {
      return null;
    }
    var cvs = wx.createCanvas();
    var sw = 40;
    var sh = 40;
    cvs.width = sw;
    cvs.height = sh;
    var c2 = cvs.getContext('2d');
    if (!c2 || !c2.getImageData) {
      return null;
    }
    c2.drawImage(img, 0, 0, sw, sh);
    var data = c2.getImageData(0, 0, sw, sh).data;
    function avgRows(y0, y1) {
      var r = 0;
      var g = 0;
      var b = 0;
      var n = 0;
      var y;
      var x;
      for (y = y0; y < y1; y++) {
        for (x = 0; x < sw; x++) {
          var i = (y * sw + x) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
      }
      if (n < 1) {
        return null;
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    }
    var h3 = Math.floor(sh / 3);
    var top = avgRows(0, h3);
    var bot = avgRows(2 * h3, sh);
    if (!top || !bot) {
      return null;
    }
    return { top: top, bottom: bot };
  } catch (e) {
    return null;
  }
}

/**
 * 黑底抠图：近黑背景变透明（软边）
 */
function buildBlackKeyForeground(img) {
  if (typeof wx === 'undefined' || !wx.createCanvas || !img.width) {
    return null;
  }
  var maxDim = 560;
  var w = img.width;
  var h = img.height;
  var scale = Math.min(1, maxDim / Math.max(w, h));
  var nw = Math.max(1, Math.floor(w * scale));
  var nh = Math.max(1, Math.floor(h * scale));
  var cvs = wx.createCanvas();
  cvs.width = nw;
  cvs.height = nh;
  var c2 = cvs.getContext('2d');
  if (!c2 || !c2.getImageData) {
    return null;
  }
  c2.drawImage(img, 0, 0, nw, nh);
  var data = c2.getImageData(0, 0, nw, nh);
  var d = data.data;
  var sum0 = 22;
  var sum1 = 52;
  var i;
  var r;
  var g;
  var b;
  var sum;
  var a;
  var t;
  for (i = 0; i < d.length; i += 4) {
    r = d[i];
    g = d[i + 1];
    b = d[i + 2];
    sum = r + g + b;
    if (sum <= sum0) {
      a = 0;
    } else if (sum >= sum1) {
      a = 1;
    } else {
      t = (sum - sum0) / (sum1 - sum0);
      a = t * t;
    }
    d[i + 3] = Math.round(d[i + 3] * a);
  }
  c2.putImageData(data, 0, 0);
  return cvs;
}

/**
 * 水墨棋盘：宣纸渐变底 + 右下角叠放莲荷（黑底抠透明）
 */
function fillInkWashBoard(ctx, bx, by, boardW, boardH, br, cell) {
  if (inkPaperBgSample && inkPaperBgSample.top && inkPaperBgSample.bottom) {
    var tp = inkPaperBgSample.top;
    var bp = inkPaperBgSample.bottom;
    var bg = ctx.createLinearGradient(bx, by, bx, by + boardH);
    bg.addColorStop(
      0,
      'rgb(' + tp[0] + ',' + tp[1] + ',' + tp[2] + ')'
    );
    bg.addColorStop(
      1,
      'rgb(' + bp[0] + ',' + bp[1] + ',' + bp[2] + ')'
    );
    ctx.fillStyle = bg;
  } else {
    ctx.fillStyle = '#f0ebe3';
  }
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.fill();

  /* 必须只用抠图后的 canvas：若回退为未处理原图，纯黑底会整块盖住盘面与格线 */
  var fg = inkLotusFgCanvas;
  if (!fg || !fg.width || !fg.height) {
    return;
  }
  var srcW = fg.width;
  var srcH = fg.height;
  var scaleContain = Math.min(boardW / srcW, boardH / srcH);
  var c = typeof cell === 'number' && cell > 0 ? cell : boardW / 16;
  /* 较旧版 ~0.72 提高：约 0.92～1.0，使竖幅莲荷在方格盘上更显大 */
  var shrink = Math.max(0.92, Math.min(1.0, 0.94 + (c / boardW) * 0.12));
  var scale = scaleContain * shrink;
  var dw = srcW * scale;
  var dh = srcH * scale;
  var inset = Math.max(4, Math.min(br * 0.85, (typeof cell === 'number' && cell > 0 ? cell : boardW / 16) * 0.35));
  var insetX = inset;
  /* 底边再收紧，莲荷更贴近棋盘下沿（可略被圆角裁切） */
  var insetY = Math.max(0, inset - Math.max(16, c * 0.28));
  var dx = bx + boardW - dw - insetX;
  var dy = by + boardH - dh - insetY;
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.drawImage(fg, dx, dy, dw, dh);
  ctx.restore();
}

/** 青瓷内区：优先 images/qinghua-floral.png 贴图；无则程序青花地纹 */
var qinghuaPatternImg = null;
var qinghuaPatternLoadAttempted = false;

function preloadQinghuaPattern() {
  if (qinghuaPatternLoadAttempted) {
    return;
  }
  qinghuaPatternLoadAttempted = true;
  if (typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  var img = wx.createImage();
  img.onload = function() {
    qinghuaPatternImg = img;
  };
  img.onerror = function() {
    qinghuaPatternImg = null;
  };
  img.src = 'images/qinghua-floral.png';
}

var inkLotusLoadAttempted = false;
/** 自 images/ink-lotus-bg.png 采样的上下纸色 [r,g,b]，供棋盘渐变底 */
var inkPaperBgSample = null;
/** 莲荷前景原图（images/ink-lotus-fg.png） */
var inkLotusImg = null;
/** 黑底抠图后的 canvas */
var inkLotusFgCanvas = null;

function preloadInkLotusPattern() {
  if (inkLotusLoadAttempted) {
    return;
  }
  inkLotusLoadAttempted = true;
  if (typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  var bgForSample = wx.createImage();
  bgForSample.onload = function() {
    inkPaperBgSample = sampleInkPaperColors(bgForSample);
  };
  bgForSample.onerror = function() {
    inkPaperBgSample = null;
  };
  bgForSample.src = 'images/ink-lotus-bg.png';

  var fg = wx.createImage();
  fg.onload = function() {
    inkLotusImg = fg;
    try {
      inkLotusFgCanvas = buildBlackKeyForeground(fg);
    } catch (e1) {
      inkLotusFgCanvas = null;
    }
  };
  fg.onerror = function() {
    inkLotusImg = null;
    inkLotusFgCanvas = null;
  };
  fg.src = 'images/ink-lotus-fg.png';
}

/**
 * 青瓷内区：青花贴图 + multiply
 */
function drawQinghuaInnerPattern(ctx, ibx, iby, ibw, ibh) {
  var img = qinghuaPatternImg;
  if (!img || !img.width || !img.height) {
    return;
  }
  var iw = img.width;
  var ih = img.height;
  var scale = Math.max(ibw / iw, ibh / ih);
  var dw = iw * scale;
  var dh = ih * scale;
  var dx = ibx + (ibw - dw) * 0.5;
  var dy = iby + (ibh - dh) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.24;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/**
 * 无 qinghua-floral.png 时的程序青花地纹（缠枝小花 + 角饰 + 水纹）
 */
function drawQinghuaProceduralFallback(ctx, ibx, iby, ibw, ibh, cell) {
  var u = Math.min(ibw, ibh);
  var ink = 'rgba(28, 58, 108, 0.12)';
  var inkSoft = 'rgba(28, 58, 108, 0.075)';
  var inkFill = 'rgba(28, 58, 108, 0.055)';
  var lw = Math.max(0.55, cell * 0.02);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  var inset = u * 0.032;
  var ix = ibx + inset;
  var iy = iby + inset;
  var iw = ibw - 2 * inset;
  var ih = ibh - 2 * inset;
  ctx.strokeStyle = inkSoft;
  ctx.lineWidth = lw * 0.55;
  ctx.strokeRect(ix, iy, iw, ih);
  ctx.lineWidth = lw * 0.35;
  ctx.strokeRect(ix + inset * 0.55, iy + inset * 0.55, iw - inset * 1.1, ih - inset * 1.1);

  function floret(px, py, r) {
    var k;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.5, r * 0.14);
    for (k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((k * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.18, -r * 0.42, 0, -r * 0.72);
      ctx.quadraticCurveTo(-r * 0.18, -r * 0.42, 0, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = inkFill;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  function cornerCurl(cx, cy, s, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.65, s * 0.065);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 0.42, s * 0.02, s * 0.62, s * 0.32, s * 0.48, s * 0.55);
    ctx.bezierCurveTo(s * 0.28, s * 0.68, s * 0.05, s * 0.48, 0, s * 0.22);
    ctx.bezierCurveTo(-s * 0.08, s * 0.08, s * 0.12, -s * 0.02, 0, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = inkFill;
    ctx.beginPath();
    ctx.arc(s * 0.22, s * 0.2, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  var cs = u * 0.1;
  var cp = u * 0.045;
  cornerCurl(ibx + cp, iby + cp, cs, 0);
  cornerCurl(ibx + ibw - cp, iby + cp, cs, Math.PI * 0.5);
  cornerCurl(ibx + ibw - cp, iby + ibh - cp, cs, Math.PI);
  cornerCurl(ibx + cp, iby + ibh - cp, cs, Math.PI * 1.5);

  var rf = Math.max(cell * 0.14, u * 0.045);
  var gx;
  var gy;
  for (gx = 0; gx < 3; gx++) {
    for (gy = 0; gy < 3; gy++) {
      floret(
        ibx + ibw * (0.2 + gx * 0.3),
        iby + ibh * (0.2 + gy * 0.3),
        rf
      );
    }
  }

  ctx.strokeStyle = 'rgba(28, 58, 108, 0.07)';
  ctx.lineWidth = lw * 0.45;
  var w;
  for (w = 0; w < 3; w++) {
    var y0 = iy + ih * 0.88 + w * (ih * 0.028);
    ctx.beginPath();
    ctx.moveTo(ix + iw * 0.08, y0);
    var t;
    for (t = 0; t <= 10; t++) {
      var tx = ix + iw * (0.08 + (t / 10) * 0.84);
      var wave = Math.sin(t * 0.85) * (ih * 0.012);
      ctx.lineTo(tx, y0 + wave);
    }
    ctx.stroke();
  }
}

/**
 * 青瓷：钴蓝框 + 卷草纹 + 内区乳白釉 + 青花贴图（可选）
 */
function fillCeladonPorcelainBoard(ctx, bx, by, boardW, boardH, br, cell) {
  var frameInset = cell * 0.38;
  var ibx = bx + frameInset;
  var iby = by + frameInset;
  var ibw = boardW - 2 * frameInset;
  var ibh = boardH - 2 * frameInset;
  var brInner = Math.max(5, br - frameInset * 0.5);
  var pat = 'rgba(255,255,255,0.3)';

  /* 外框：左上受光略亮、右下偏沉，做出厚度 */
  var fg = ctx.createLinearGradient(bx, by, bx + boardW * 1.05, by + boardH * 1.05);
  fg.addColorStop(0, '#3d72a8');
  fg.addColorStop(0.38, '#2e5c90');
  fg.addColorStop(0.72, '#264d7c');
  fg.addColorStop(1, '#1f3f68');
  ctx.fillStyle = fg;
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.fill();

  /* 框顶/左内沿高光，右下略暗，加强立边 */
  var glow = Math.max(3, frameInset * 0.35);
  var gg = ctx.createLinearGradient(ibx, iby, ibx - glow, iby - glow);
  gg.addColorStop(0, 'rgba(255,255,255,0.16)');
  gg.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  gg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gg;
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.fill();
  var fgSh = ctx.createLinearGradient(
    bx + boardW,
    by + boardH,
    bx + boardW * 0.55,
    by + boardH * 0.55
  );
  fgSh.addColorStop(0, 'rgba(10, 25, 55, 0.22)');
  fgSh.addColorStop(0.5, 'rgba(10, 25, 55, 0.06)');
  fgSh.addColorStop(1, 'rgba(10, 25, 55, 0)');
  ctx.fillStyle = fgSh;
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.fill();

  /* 卷草纹：沿四边带状区域重复弧线 */
  var wave = Math.max(10, cell * 0.72);
  var amp = Math.max(2.2, frameInset * 0.22);
  ctx.strokeStyle = pat;
  ctx.lineWidth = Math.max(1.1, cell * 0.038);
  ctx.lineCap = 'round';
  var x;
  var y;
  var mid;
  for (x = bx + wave * 0.2; x < bx + boardW - wave * 0.3; x += wave) {
    mid = by + frameInset * 0.52;
    ctx.beginPath();
    ctx.moveTo(x, mid);
    ctx.bezierCurveTo(
      x + wave * 0.28,
      mid - amp,
      x + wave * 0.72,
      mid + amp,
      x + wave,
      mid
    );
    ctx.stroke();
  }
  for (x = bx + wave * 0.2; x < bx + boardW - wave * 0.3; x += wave) {
    mid = by + boardH - frameInset * 0.52;
    ctx.beginPath();
    ctx.moveTo(x, mid);
    ctx.bezierCurveTo(
      x + wave * 0.28,
      mid - amp,
      x + wave * 0.72,
      mid + amp,
      x + wave,
      mid
    );
    ctx.stroke();
  }
  for (y = by + wave * 0.2; y < by + boardH - wave * 0.3; y += wave) {
    mid = bx + frameInset * 0.52;
    ctx.beginPath();
    ctx.moveTo(mid, y);
    ctx.bezierCurveTo(
      mid - amp,
      y + wave * 0.28,
      mid + amp,
      y + wave * 0.72,
      mid,
      y + wave
    );
    ctx.stroke();
  }
  for (y = by + wave * 0.2; y < by + boardH - wave * 0.3; y += wave) {
    mid = bx + boardW - frameInset * 0.52;
    ctx.beginPath();
    ctx.moveTo(mid, y);
    ctx.bezierCurveTo(
      mid - amp,
      y + wave * 0.28,
      mid + amp,
      y + wave * 0.72,
      mid,
      y + wave
    );
    ctx.stroke();
  }

  ctx.save();
  pathRoundRect(ctx, ibx, iby, ibw, ibh, brInner);
  ctx.clip();
  var cx = ibx + ibw * 0.5;
  var cy = iby + ibh * 0.42;
  var rad = Math.max(ibw, ibh) * 0.72;
  var pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  /* 乳白釉整体偏淡；中心略亮、边缘略沉，呈浅碟形 */
  pg.addColorStop(0, '#f4f8fc');
  pg.addColorStop(0.38, '#eef4fa');
  pg.addColorStop(0.72, '#e4ecf6');
  pg.addColorStop(1, '#d8e2ee');
  ctx.fillStyle = pg;
  ctx.fillRect(ibx, iby, ibw, ibh);
  if (qinghuaPatternImg && qinghuaPatternImg.width && qinghuaPatternImg.height) {
    drawQinghuaInnerPattern(ctx, ibx, iby, ibw, ibh);
  } else {
    drawQinghuaProceduralFallback(ctx, ibx, iby, ibw, ibh, cell);
  }
  /* 左上柔光、右下薄阴，釉面微凸立体感 */
  var hl = ctx.createLinearGradient(ibx, iby, ibx + ibw * 0.42, iby + ibh * 0.42);
  hl.addColorStop(0, 'rgba(255,255,255,0.34)');
  hl.addColorStop(0.28, 'rgba(255,255,255,0.1)');
  hl.addColorStop(0.55, 'rgba(255,255,255,0)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(ibx, iby, ibw, ibh);
  var amb = ctx.createLinearGradient(
    ibx + ibw,
    iby + ibh,
    ibx + ibw * 0.38,
    iby + ibh * 0.38
  );
  amb.addColorStop(0, 'rgba(28, 48, 82, 0.1)');
  amb.addColorStop(0.4, 'rgba(28, 48, 82, 0.035)');
  amb.addColorStop(1, 'rgba(28, 48, 82, 0)');
  ctx.fillStyle = amb;
  ctx.fillRect(ibx, iby, ibw, ibh);
  /* 内沿一圈浅凹槽感 */
  ctx.strokeStyle = 'rgba(25, 45, 78, 0.14)';
  ctx.lineWidth = 1;
  pathRoundRect(ctx, ibx + 0.5, iby + 0.5, ibw - 1, ibh - 1, Math.max(3, brInner - 0.5));
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} layout { margin, cell, boardPx, originX, originY }
 * @param {object} theme 主题（themes.js）
 */
function drawBoard(ctx, layout, theme) {
  var cell = layout.cell;
  var ox = snapLogical(layout.originX);
  var oy = snapLogical(layout.originY);
  var n = layout.size;
  var i;
  var b = theme.board;

  var boardW = (n - 1) * cell + cell;
  var boardH = boardW;
  var bx = snapLogical(ox - cell * 0.5);
  var by = snapLogical(oy - cell * 0.5);
  var br = snapLogical(Math.min(22, cell * 0.7));

  ctx.save();
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.clip();
  if (theme.id === 'classic') {
    fillClassicWoodPlank(ctx, bx, by, boardW, boardH);
  } else if (theme.id === 'mint') {
    fillCeladonPorcelainBoard(ctx, bx, by, boardW, boardH, br, cell);
  } else if (theme.id === 'ink') {
    fillInkWashBoard(ctx, bx, by, boardW, boardH, br, cell);
  } else {
    var boardGrad = ctx.createLinearGradient(
      ox - cell,
      oy - cell,
      ox + n * cell,
      oy + n * cell
    );
    boardGrad.addColorStop(0, b.g0);
    boardGrad.addColorStop(1, b.g1);
    ctx.fillStyle = boardGrad;
    ctx.fillRect(bx, by, boardW, boardH);
  }
  ctx.strokeStyle = b.line;
  /* 竖线 x+0.5、横线 y+0.5；檀木可用 gridLineWidth 略加粗 */
  var gridLw =
    typeof b.gridLineWidth === 'number' && b.gridLineWidth > 0
      ? b.gridLineWidth
      : 1;
  ctx.lineWidth = gridLw;
  var span = (n - 1) * cell;
  for (i = 0; i < n; i++) {
    var vx = ox + i * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(vx, oy);
    ctx.lineTo(vx, oy + span);
    ctx.stroke();
  }
  for (i = 0; i < n; i++) {
    var hy = oy + i * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(ox, hy);
    ctx.lineTo(ox + span, hy);
    ctx.stroke();
  }

  var stars = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
  ctx.fillStyle = b.star;
  for (i = 0; i < stars.length; i++) {
    var sx = stars[i][0];
    var sy = stars[i][1];
    ctx.beginPath();
    /* 星位略小，避免与高饱和线色抢对比 */
    ctx.arc(
      snapLogical(ox + sx * cell),
      snapLogical(oy + sy * cell),
      cell * 0.1,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  pathRoundRect(ctx, bx, by, boardW, boardH, br);
  ctx.strokeStyle =
    theme.id === 'classic'
      ? 'rgba(72, 54, 38, 0.48)'
      : theme.id === 'mint'
        ? 'rgba(32, 58, 98, 0.32)'
        : theme.id === 'ink'
          ? 'rgba(42, 38, 34, 0.3)'
          : 'rgba(0, 0, 0, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * 接触影：径向渐变 + 扁椭圆，边缘自然淡出（光源左上，影落右下）
 */
function drawStoneDropShadow(ctx, cx, cy, radius, isBlack) {
  var a0 = isBlack ? 0.32 : 0.16;
  ctx.save();
  ctx.translate(cx + radius * 0.06, cy + radius * 0.11);
  ctx.scale(1.06, 0.46);
  var g = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,' + (a0 * 0.85) + ')');
  g.addColorStop(0.45, 'rgba(0,0,0,' + (a0 * 0.38) + ')');
  g.addColorStop(0.78, 'rgba(0,0,0,' + (a0 * 0.12) + ')');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 单颗棋子：统一左上主光；体积用多段径向 + 柔和高光 + 白子背光暗部（避免死白/镜面点）
 * @param {object} [theme] 青瓷主题略加强镜面高光
 */
function drawStonePiece(ctx, cx, cy, radius, isBlack, pb, pw, theme) {
  var texDual = isBlack
    ? theme && theme.pieceTextureBlackImg
    : theme && theme.pieceTextureWhiteImg;
  if (texDual && texDual.width) {
    drawStoneDropShadow(ctx, cx, cy, radius, isBlack);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    var texScale = 1;
    if (
      theme &&
      typeof theme.pieceTextureDrawScale === 'number' &&
      theme.pieceTextureDrawScale > 0
    ) {
      texScale = theme.pieceTextureDrawScale;
    }
    var dr = radius * texScale;
    if (typeof ctx.imageSmoothingEnabled !== 'undefined') {
      ctx.imageSmoothingEnabled = true;
    }
    if (typeof ctx.imageSmoothingQuality !== 'undefined') {
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(
      texDual,
      0,
      0,
      texDual.width,
      texDual.height,
      cx - dr,
      cy - dr,
      dr * 2,
      dr * 2
    );
    ctx.restore();
    return;
  }

  var tex = theme && theme.pieceTextureImg;
  var uv = theme && theme.textureUV;
  if (tex && tex.width && uv) {
    var part = isBlack ? uv.black : uv.white;
    if (part && part.w > 0 && part.h > 0) {
      drawStoneDropShadow(ctx, cx, cy, radius, isBlack);
      var iw = tex.width;
      var ih = tex.height;
      var sx = part.x * iw;
      var sy = part.y * ih;
      var sw = part.w * iw;
      var shp = part.h * ih;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        tex,
        sx,
        sy,
        sw,
        shp,
        cx - radius,
        cy - radius,
        radius * 2,
        radius * 2
      );
      ctx.restore();
      return;
    }
  }

  var sh = theme && theme.stoneShading;
  var porcelain =
    theme && (sh === 'mint' || (!sh && theme.id === 'mint'));
  var inkMatte = theme && (sh === 'ink' || (!sh && theme.id === 'ink'));
  drawStoneDropShadow(ctx, cx, cy, radius, isBlack);

  var lx = cx - radius * 0.36;
  var ly = cy - radius * 0.34;
  var ax = cx + radius * 0.12;
  var ay = cy + radius * 0.14;
  var grd = ctx.createRadialGradient(
    lx,
    ly,
    Math.max(0.8, radius * 0.18),
    ax,
    ay,
    radius * 1.02
  );
  var gmb = pb.gm || pb.g1;
  var gmw = pw.gm || pw.g1;
  if (isBlack) {
    grd.addColorStop(0, pb.g0);
    grd.addColorStop(0.32, gmb);
    grd.addColorStop(0.58, pb.g1);
    grd.addColorStop(0.88, pb.g1);
    grd.addColorStop(1, pb.g1);
  } else {
    grd.addColorStop(0, pw.g0);
    grd.addColorStop(0.22, pw.g0);
    grd.addColorStop(0.48, gmw);
    grd.addColorStop(0.78, pw.g1);
    grd.addColorStop(1, pw.g1);
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  var gl = ctx.createRadialGradient(
    cx - radius * 0.26,
    cy - radius * 0.26,
    radius * 0.08,
    cx - radius * 0.08,
    cy - radius * 0.08,
    radius * 0.88
  );
  if (isBlack) {
    gl.addColorStop(0, 'rgba(210, 220, 232, 0.2)');
    gl.addColorStop(0.22, 'rgba(150, 158, 168, 0.1)');
    gl.addColorStop(0.5, 'rgba(60, 62, 68, 0.04)');
    gl.addColorStop(0.82, 'rgba(0, 0, 0, 0)');
    gl.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    gl.addColorStop(0.18, 'rgba(255, 255, 255, 0.22)');
    gl.addColorStop(0.45, 'rgba(255, 255, 255, 0.06)');
    gl.addColorStop(0.75, 'rgba(255, 255, 255, 0)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
  }
  ctx.fillStyle = gl;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  if (isBlack && !inkMatte) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx - radius * 0.32, cy - radius * 0.3);
    ctx.scale(1, 0.72);
    var spec = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * (porcelain ? 0.24 : 0.28));
    spec.addColorStop(0, porcelain ? 'rgba(255, 255, 255, 0.52)' : 'rgba(255, 255, 255, 0.22)');
    spec.addColorStop(0.45, porcelain ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.06)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (isBlack && inkMatte) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx - radius * 0.28, cy - radius * 0.26);
    ctx.scale(1, 0.75);
    var specInk = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.32);
    specInk.addColorStop(0, 'rgba(200, 198, 196, 0.14)');
    specInk.addColorStop(0.5, 'rgba(120, 118, 116, 0.05)');
    specInk.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = specInk;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (!isBlack) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    var shade = ctx.createRadialGradient(
      cx + radius * 0.08,
      cy + radius * 0.1,
      radius * 0.15,
      cx + radius * 0.32,
      cy + radius * 0.36,
      radius * 0.95
    );
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(
      0.78,
      inkMatte
        ? 'rgba(55, 52, 48, 0.12)'
        : porcelain
          ? 'rgba(40, 48, 58, 0.14)'
          : 'rgba(35, 32, 30, 0.1)'
    );
    shade.addColorStop(
      1,
      inkMatte
        ? 'rgba(48, 46, 42, 0.16)'
        : porcelain
          ? 'rgba(32, 40, 52, 0.2)'
          : 'rgba(28, 26, 24, 0.14)'
    );
    ctx.fillStyle = shade;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isBlack ? pb.stroke : pw.stroke;
  ctx.lineWidth = isBlack ? 1.05 : 1;
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} board
 * @param {object} layout
 * @param {object} themeBlack 黑子用主题（含贴图/渐变）
 * @param {object} [themeWhite] 白子用；省略或与 themeBlack 相同时即本地单机/旧逻辑
 */
function drawPieces(ctx, board, layout, themeBlack, themeWhite) {
  var tw = themeWhite != null ? themeWhite : themeBlack;
  var cell = layout.cell;
  var ox = snapLogical(layout.originX);
  var oy = snapLogical(layout.originY);
  var r;
  var c;
  for (r = 0; r < layout.size; r++) {
    for (c = 0; c < layout.size; c++) {
      var v = board[r][c];
      if (v === gomoku.EMPTY) continue;
      var cx = snapLogical(ox + c * cell);
      var cy = snapLogical(oy + r * cell);
      var isBlack = v === gomoku.BLACK;
      var th = isBlack ? themeBlack : tw;
      var radius = boardPieceRadius(cell, th);
      var pb = th.pieces.black;
      var pw = th.pieces.white;
      drawStonePiece(ctx, cx, cy, radius, isBlack, pb, pw, th);
    }
  }
}

/**
 * 标出对手上一手：蓝色单环（无中心点）；环半径/线宽随 pr 与皮肤 opponentLastMoveMarker 适配。
 */
function drawOpponentLastMoveMarker(ctx, layout, theme, r, c, stoneColor, pieceTheme) {
  var cell = layout.cell;
  var ox = snapLogical(layout.originX);
  var oy = snapLogical(layout.originY);
  var cx0 = snapLogical(ox + c * cell);
  var cy0 = snapLogical(oy + r * cell);
  var pr = boardPieceRadius(cell, pieceTheme);
  var off = getPieceTextureVisualCenterOffset(pieceTheme, stoneColor, pr);
  var cx = snapLogical(cx0 + off.dx);
  var cy = snapLogical(cy0 + off.dy);
  var m = pieceTheme && pieceTheme.opponentLastMoveMarker;
  var ringMulBase =
    m && typeof m.ringRadiusMul === 'number' ? m.ringRadiusMul : 0.9;
  var ringMul =
    stoneColor === gomoku.BLACK
      ? m && typeof m.ringRadiusMulBlack === 'number'
        ? m.ringRadiusMulBlack
        : ringMulBase
      : m && typeof m.ringRadiusMulWhite === 'number'
        ? m.ringRadiusMulWhite
        : ringMulBase;
  var ringR = pr * ringMul;
  var lwPr = m && typeof m.lineWidthPr === 'number' ? m.lineWidthPr : 0.14;
  var lw = Math.max(2, pr * lwPr, cell * 0.065);
  var strokeBlack = m && m.blackStroke ? m.blackStroke : '#7fd4ff';
  var strokeWhite = m && m.whiteStroke ? m.whiteStroke : '#1a7eea';
  var shBlack = m && m.shadowBlack ? m.shadowBlack : 'rgba(100, 190, 255, 0.5)';
  var shWhite = m && m.shadowWhite ? m.shadowWhite : 'rgba(25, 120, 220, 0.38)';
  ctx.save();
  if (stoneColor === gomoku.BLACK) {
    ctx.shadowColor = shBlack;
    ctx.shadowBlur =
      m && typeof m.shadowBlurBlackPr === 'number'
        ? Math.max(1, pr * m.shadowBlurBlackPr)
        : Math.max(3, pr * 0.16);
  } else {
    ctx.shadowColor = shWhite;
    ctx.shadowBlur =
      m && typeof m.shadowBlurWhitePr === 'number'
        ? Math.max(1, pr * m.shadowBlurWhitePr)
        : Math.max(2, pr * 0.1);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = stoneColor === gomoku.BLACK ? strokeBlack : strokeWhite;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

/**
 * 连成五子高亮：每个胜子外围一圈橙金色柔光晕（与棋子半径一致参考 drawPieces）
 * @param {Array<{r:number,c:number}>} cells 一般为 5 点
 * @param {object} themeBlack
 * @param {object} [themeWhite] 省略则与单机相同主题
 */
function drawWinningLine(ctx, layout, cells, themeBlack, themeWhite, board) {
  if (!cells || cells.length < 1) {
    return;
  }
  var tw = themeWhite != null ? themeWhite : themeBlack;
  var cell = layout.cell;
  var ox = snapLogical(layout.originX);
  var oy = snapLogical(layout.originY);
  var i;
  for (i = 0; i < cells.length; i++) {
    var rr = cells[i].r;
    var cc = cells[i].c;
    var bv = board ? board[rr][cc] : gomoku.EMPTY;
    var pieceTheme =
      bv === gomoku.BLACK ? themeBlack : bv === gomoku.WHITE ? tw : themeBlack;
    /** 与 drawPieces 中棋子半径一致 */
    var pr = boardPieceRadius(cell, pieceTheme);
    var w = pieceTheme && pieceTheme.winningLineHighlight;
    var glowOutMul =
      w && typeof w.glowOuterMul === 'number' ? w.glowOuterMul : 1.62;
    var gInnerMul =
      w && typeof w.glowGradientInnerMul === 'number'
        ? w.glowGradientInnerMul
        : 0.92;
    var ringPriMul =
      w && typeof w.ringPrimaryMul === 'number' ? w.ringPrimaryMul : 1.14;
    var ringSecMul =
      w && typeof w.ringSecondaryMul === 'number' ? w.ringSecondaryMul : 1.06;
    var lw1 =
      w && typeof w.primaryLineWidthPr === 'number'
        ? Math.max(1.6, pr * w.primaryLineWidthPr, cell * 0.045)
        : Math.max(2.4, cell * 0.075);
    var lw2 =
      w && typeof w.secondaryLineWidthPr === 'number'
        ? Math.max(1, pr * w.secondaryLineWidthPr, cell * 0.028)
        : Math.max(1.2, cell * 0.038);
    var shBlur =
      w && typeof w.primaryShadowBlurPr === 'number'
        ? Math.max(4, pr * w.primaryShadowBlurPr)
        : Math.max(12, cell * 0.16);
    var cx0 = snapLogical(ox + cc * cell);
    var cy0 = snapLogical(oy + rr * cell);
    var cx = cx0;
    var cy = cy0;
    if (board && pieceTheme) {
      if (bv === gomoku.BLACK || bv === gomoku.WHITE) {
        var woff = getPieceTextureVisualCenterOffset(pieceTheme, bv, pr);
        cx = snapLogical(cx0 + woff.dx);
        cy = snapLogical(cy0 + woff.dy);
      }
    }
    ctx.save();
    /* 外圈柔光：自棋子边缘向外衰减（皮肤可缩小 glowOutMul 避免五子糊成带） */
    var rGlowOut = pr * glowOutMul;
    var g = ctx.createRadialGradient(
      cx,
      cy,
      pr * gInnerMul,
      cx,
      cy,
      rGlowOut
    );
    g.addColorStop(0, 'rgba(255, 195, 85, 0)');
    g.addColorStop(0.22, 'rgba(255, 175, 55, 0.42)');
    g.addColorStop(0.48, 'rgba(255, 150, 42, 0.58)');
    g.addColorStop(0.72, 'rgba(255, 125, 35, 0.38)');
    g.addColorStop(1, 'rgba(255, 95, 28, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, rGlowOut, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    /* 高亮环：默认略大于 pr；贴图肤用小于 1 的倍率贴近角色轮廓 */
    ctx.beginPath();
    ctx.arc(cx, cy, pr * ringPriMul, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 225, 130, 0.88)';
    ctx.lineWidth = lw1;
    ctx.shadowColor = 'rgba(255, 155, 55, 0.95)';
    ctx.shadowBlur = shBlur;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(cx, cy, pr * ringSecMul, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 200, 95, 0.5)';
    ctx.lineWidth = lw2;
    ctx.stroke();
    ctx.restore();
  }
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
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = color || '#4a5a59';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, snapLogical(x), snapLogical(y));
}

module.exports = {
  setCanvasDpr: setCanvasDpr,
  snapLogical: snapLogical,
  preloadQinghuaPattern: preloadQinghuaPattern,
  preloadInkLotusPattern: preloadInkLotusPattern,
  drawBoard: drawBoard,
  drawPieces: drawPieces,
  drawStonePiece: drawStonePiece,
  drawOpponentLastMoveMarker: drawOpponentLastMoveMarker,
  drawWinningLine: drawWinningLine,
  drawText: drawText
};
