/**
 * 卡片角标与背景弱装饰（低对比，不抢主界面）
 * kind: 'bear' | 'cloud' | 'sparkle' | 'heart'
 */

/**
 * 卡片右下角装饰（坐标为整张卡片中心 cx,cy 与宽高）
 */
function drawCardCornerDoodle(ctx, kind, cx, cy, bw, bh) {
  if (!kind) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.45;
  var s = Math.min(30, bh * 0.42, bw * 0.14);
  var brX = cx + bw / 2 - 6;
  var brY = cy + bh / 2 - 4;
  if (kind === 'bear') {
    drawMiniBear(ctx, brX, brY, s);
  } else if (kind === 'cloud') {
    drawMiniCloud(ctx, brX, brY, s);
  } else if (kind === 'sparkle') {
    drawMiniSparkle(ctx, brX, brY, s);
  } else if (kind === 'heart') {
    drawMiniHeart(ctx, brX, brY, s);
  }
  ctx.restore();
}

/** 底部偏右为锚点，形象向左上延伸 */
function drawMiniBear(ctx, brX, brY, s) {
  ctx.save();
  var cx = brX - s * 0.48;
  var cy = brY - s * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(150,110,90,0.38)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx - s * 0.22, cy - s * 0.3, s * 0.2, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.22, cy - s * 0.3, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(55,42,35,0.9)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.1, cy - s * 0.04, s * 0.055, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.1, cy - s * 0.04, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(220,160,150,0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.08, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMiniCloud(ctx, brX, brY, s) {
  ctx.save();
  var cx = brX - s * 0.42;
  var cy = brY - s * 0.38;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx - s * 0.28, cy, s * 0.2, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.08, cy - s * 0.14, s * 0.24, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.38, cy, s * 0.21, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.12, cy + s * 0.14, s * 0.2, 0, Math.PI * 2);
  ctx.arc(cx - s * 0.12, cy + s * 0.12, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMiniSparkle(ctx, brX, brY, s) {
  ctx.save();
  var cx = brX - s * 0.42;
  var cy = brY - s * 0.45;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.34);
  ctx.lineTo(cx + s * 0.1, cy - s * 0.04);
  ctx.lineTo(cx + s * 0.3, cy);
  ctx.lineTo(cx + s * 0.1, cy + s * 0.04);
  ctx.lineTo(cx, cy + s * 0.34);
  ctx.lineTo(cx - s * 0.1, cy + s * 0.04);
  ctx.lineTo(cx - s * 0.3, cy);
  ctx.lineTo(cx - s * 0.1, cy - s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMiniHeart(ctx, brX, brY, s) {
  ctx.save();
  var cx = brX - s * 0.42;
  var cy = brY - s * 0.42;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.18);
  ctx.bezierCurveTo(
    cx - s * 0.38,
    cy - s * 0.08,
    cx - s * 0.22,
    cy - s * 0.38,
    cx,
    cy - s * 0.12
  );
  ctx.bezierCurveTo(
    cx + s * 0.22,
    cy - s * 0.38,
    cx + s * 0.38,
    cy - s * 0.08,
    cx,
    cy + s * 0.18
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * 首页左上角飘浮云朵
 * @param {number} [cloudsTop] 云朵区域纵向基准（副标题下方），不传则用 statusBar
 */
function drawHomeTopLeftClouds(ctx, W, H, statusBarPad, cloudsTop) {
  var base =
    cloudsTop != null
      ? cloudsTop
      : Math.max(14, (statusBarPad || 0) + 8);
  var left = 16;
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawMiniCloud(ctx, left + 32, base + 22, 20);
  drawMiniCloud(ctx, left + 56, base + 6, 14);
  ctx.restore();
}

/**
 * 首页右下角飘浮云朵（避开底部安全区）
 * @param {number} [safeBottom] 如 safeArea.bottom
 */
function drawHomeBottomRightClouds(ctx, W, H, safeBottom) {
  var sb = safeBottom || 0;
  var brX = W - 12;
  var brY = H - sb - 36;
  ctx.save();
  ctx.globalAlpha = 0.32;
  drawMiniCloud(ctx, brX, brY, 18);
  drawMiniCloud(ctx, brX - 28, brY - 18, 14);
  ctx.restore();
}

/**
 * 首页中央吉祥物：圆润奶油色团子 + 萌芽 + 简笔手脚（参考稿风格）
 */
function drawHomeHeroMascot(ctx, cx, cy, scale) {
  var s = scale || 1;
  var r = 46 * s;
  ctx.save();
  ctx.shadowColor = 'rgba(42, 34, 26, 0.12)';
  ctx.shadowBlur = 16 * s;
  ctx.shadowOffsetY = 6 * s;
  ctx.fillStyle = '#F7F0E8';
  ctx.strokeStyle = 'rgba(190, 172, 150, 0.32)';
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = '#2A2A2A';
  ctx.beginPath();
  ctx.arc(cx - 14 * s, cy - 6 * s, 4.2 * s, 0, Math.PI * 2);
  ctx.arc(cx + 14 * s, cy - 6 * s, 4.2 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(92, 75, 58, 0.85)';
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 8 * s, 10 * s, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = '#6DAA4A';
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 1 * s);
  ctx.quadraticCurveTo(
    cx + 10 * s,
    cy - r - 18 * s,
    cx + 2 * s,
    cy - r - 26 * s
  );
  ctx.stroke();
  ctx.fillStyle = '#8BC34A';
  ctx.beginPath();
  ctx.arc(cx + 2 * s, cy - r - 26 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(92, 75, 58, 0.5)';
  ctx.lineWidth = 2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy + 8 * s);
  ctx.lineTo(cx - r * 0.75, cy + 22 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.55, cy + 8 * s);
  ctx.lineTo(cx + r * 0.75, cy + 22 * s);
  ctx.stroke();

  ctx.restore();
}

/** 匹配页：极淡弧线角标，不抢中央文案（insetTop 与顶安全区对齐，避免贴刘海） */
function drawMatchingDecoration(ctx, W, H, insetTop) {
  var padTop = typeof insetTop === 'number' && insetTop > 0 ? insetTop : 0;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  var yLeft = Math.max(padTop + 48, 64, H * 0.12 + padTop * 0.35);
  var yRight = Math.max(padTop + 58, 78, H * 0.14 + padTop * 0.35);
  ctx.beginPath();
  ctx.arc(28, yLeft, 36, -Math.PI * 0.15, Math.PI * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W - 28, yRight, 40, Math.PI * 0.45, Math.PI * 1.12);
  ctx.stroke();
  ctx.restore();
}

/**
 * 对局棋盘页：左上、右下各一朵小云角标（画在棋盘与棋子下层）
 * layout 需含 topBar、originX、originY、bottomY
 */
function drawGameBoardCornerClouds(ctx, W, H, layout, statusBarPad) {
  var pad = statusBarPad || 0;
  var topY = Math.max(
    pad + 16,
    Math.min(layout.originY - 20, layout.topBar + 10)
  );
  ctx.save();
  ctx.globalAlpha = 0.28;
  drawMiniCloud(ctx, 36, topY + 16, 18);
  var brX = W - 14;
  var brY = Math.min(layout.bottomY - 58, H - 30);
  drawMiniCloud(ctx, brX, brY, 17);
  ctx.restore();
}

module.exports = {
  drawCardCornerDoodle: drawCardCornerDoodle,
  drawHomeTopLeftClouds: drawHomeTopLeftClouds,
  drawHomeBottomRightClouds: drawHomeBottomRightClouds,
  drawHomeHeroMascot: drawHomeHeroMascot,
  drawMatchingDecoration: drawMatchingDecoration,
  drawGameBoardCornerClouds: drawGameBoardCornerClouds
};
