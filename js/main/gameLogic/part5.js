/**
 * Auto-split from gameLogic.js (part 5)
 */
module.exports = function register(app, deps) {
  var gomoku = deps.gomoku;
  var render = deps.render;
  var themes = deps.themes;
  var doodles = deps.doodles;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;
  var defaultAvatars = deps.defaultAvatars;
  var ratingTitle = deps.ratingTitle;
  var wx = deps.wx;

app.drawPieceSkinModalOneCard = function(rx, ry, rw, rh, entry, gidx, baseClassic) {
  var focused = gidx === app.pieceSkinModalPendingIdx;
  var rr = app.rpx(18);
  var cardPad = app.rpx(18);
  var midX = rx + rw / 2;
  var titleFont = app.rpx(28);
  var statusFont = app.rpx(22);
  var gapStoneTitle = app.rpx(10);
  var titleLineH = app.rpx(32);
  var isPointsRedeem =
    entry &&
    entry.rowStatus === 'points' &&
    entry.costPoints &&
    entry.costPoints > 0;
  var statusReserve = isPointsRedeem ? app.rpx(40) : app.rpx(38);
  var innerTop = ry + cardPad;
  var innerBottom = ry + rh - cardPad;
  var statusBandTop = innerBottom - statusReserve;
  var contentBottom = statusBandTop;
  var cyRegion = (innerTop + contentBottom) / 2;
  var clusterShift = (gapStoneTitle + titleLineH) / 2;

  app.ctx.save();
  if (focused) {
    app.ctx.shadowColor = 'rgba(224, 124, 46, 0.28)';
    app.ctx.shadowBlur = app.rpx(14);
    app.ctx.shadowOffsetY = app.rpx(5);
  }
  var bgGrad = app.ctx.createLinearGradient(rx, ry, rx, ry + rh);
  bgGrad.addColorStop(0, '#fffefb');
  bgGrad.addColorStop(1, '#f5f1eb');
  app.ctx.fillStyle = bgGrad;
  app.roundRect(rx, ry, rw, rh, rr);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.strokeStyle = focused ? '#e07c2e' : 'rgba(200, 188, 172, 0.85)';
  app.ctx.lineWidth = focused ? app.rpx(2.25) : app.rpx(1.25);
  app.roundRect(rx, ry, rw, rh, rr);
  app.ctx.stroke();
  app.ctx.restore();

  var pr = app.rpx(21);
  if (entry.id === 'tuan_moe' || entry.id === 'qingtao_libai') {
    pr = app.rpx(26);
  }
  var gapBw = app.rpx(18);
  var cyPv = cyRegion - clusterShift;
  var nameY = cyPv + pr + gapStoneTitle + titleLineH / 2;
  var centerDist = 2 * pr + gapBw;
  var statusY = innerBottom - app.rpx(13);

  /** 未解锁也绘制真实棋子预览（贴图/渐变），便于「看见皮肤长什么样」；锁定态略降低不透明度 */
  var skinMeta = entry.id && themes.PIECE_SKINS[entry.id];
  if (skinMeta && !skinMeta.followTheme) {
    var pTh = app.enrichPieceSkinTheme(
      themes.applyPieceSkin(baseClassic, entry.id),
      entry.id
    );
    var pb = pTh.pieces.black;
    var pw = pTh.pieces.white;
    app.ctx.save();
    if (entry.locked) {
      app.ctx.globalAlpha = 0.78;
    }
    render.drawStonePiece(
      app.ctx,
      midX - centerDist / 2,
      cyPv,
      pr,
      true,
      pb,
      pw,
      pTh
    );
    render.drawStonePiece(
      app.ctx,
      midX + centerDist / 2,
      cyPv,
      pr,
      false,
      pb,
      pw,
      pTh
    );
    app.ctx.restore();
  } else {
    app.drawPieceSkinModalPlaceholderPieces(midX, cyPv, pr);
  }

  app.ctx.font = '500 ' + titleFont + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = '#3d342c';
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(
    themes.getPieceSkinCatalogLabel(entry),
    app.snapPx(midX),
    app.snapPx(nameY)
  );

  app.ctx.strokeStyle = 'rgba(92, 75, 58, 0.1)';
  app.ctx.lineWidth = app.rpx(1);
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(rx + cardPad), app.snapPx(statusBandTop));
  app.ctx.lineTo(app.snapPx(rx + rw - cardPad), app.snapPx(statusBandTop));
  app.ctx.stroke();

  if (isPointsRedeem) {
    var rowMidY = innerBottom - app.rpx(20);
    var btnH = app.rpx(26);
    var btnW = app.rpx(76);
    var btnL = rx + rw - cardPad - btnW;
    var btnTop = rowMidY - btnH / 2;
    var gapBeforeBtn = app.rpx(8);
    var pointsSlotLeft = rx + cardPad;
    var pointsSlotRight = btnL - gapBeforeBtn;
    var pointsTextCx = (pointsSlotLeft + pointsSlotRight) / 2;
    app.ctx.font = app.rpx(18) + 'px ' + app.PIECE_SKIN_FONT_UI;
    app.ctx.fillStyle = '#b08040';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      entry.costPoints + '积分',
      app.snapPx(pointsTextCx),
      app.snapPx(rowMidY)
    );
    var gBtn = app.ctx.createLinearGradient(btnL, btnTop, btnL, btnTop + btnH);
    gBtn.addColorStop(0, '#f0a030');
    gBtn.addColorStop(1, '#d97820');
    app.ctx.fillStyle = gBtn;
    app.roundRect(btnL, btnTop, btnW, btnH, app.rpx(6));
    app.ctx.fill();
    app.ctx.strokeStyle = 'rgba(180, 120, 40, 0.35)';
    app.ctx.lineWidth = app.rpx(1);
    app.roundRect(btnL, btnTop, btnW, btnH, app.rpx(6));
    app.ctx.stroke();
    app.ctx.font = '600 ' + app.rpx(18) + 'px ' + app.PIECE_SKIN_FONT_UI;
    app.ctx.fillStyle = '#fffef9';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      '兑换',
      app.snapPx(btnL + btnW / 2),
      app.snapPx(rowMidY)
    );
  } else {
    var st = app.pieceSkinModalCardStatusStyle(entry);
    var statusLine = st && st.text != null ? String(st.text) : '';
    app.ctx.font = statusFont + 'px ' + app.PIECE_SKIN_FONT_UI;
    app.ctx.fillStyle = st && st.fill ? st.fill : '#8a7a68';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    if (statusLine) {
      app.ctx.fillText(statusLine, app.snapPx(midX), app.snapPx(statusY));
    }
  }
}

app.drawPieceSkinModalOverlay = function(th) {
  if (!app.pieceSkinModalVisible) {
    return;
  }
  var L = app.getPieceSkinModalLayout();
  var e = app.easeOutCubicModal(app.pieceSkinModalAnim);
  var sc = 0.86 + 0.14 * e;
  var cream = '#f9f5ec';
  var x = L.x0;
  var y = L.y0;
  var pad = L.pad != null ? L.pad : L.innerPad;
  var cat = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var baseClassic = themes.getTheme('classic');

  app.ctx.save();
  app.ctx.fillStyle = 'rgba(0,0,0,' + 0.5 * e + ')';
  app.ctx.fillRect(0, 0, app.W, app.H);

  app.ctx.translate(L.cx, L.cy);
  app.ctx.scale(sc, sc);
  app.ctx.translate(-L.cx, -L.cy);

  app.ctx.shadowColor = 'rgba(0,0,0,0.2)';
  app.ctx.shadowBlur = app.rpx(28);
  app.ctx.shadowOffsetY = app.rpx(10);
  app.ctx.fillStyle = cream;
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;

  var cr = L.closeR;
  var closeCx = x + L.w - pad - cr / 2;
  var closeCy = y + pad + cr / 2;
  app.ctx.font = 'bold ' + app.rpx(34) + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = 'rgba(92,75,58,0.38)';
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('×', app.snapPx(closeCx), app.snapPx(closeCy));

  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font = '600 ' + app.rpx(34) + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = '#4a3d32';
  app.ctx.fillText('棋子换肤', app.snapPx(L.cx), app.snapPx(L.titleCy));

  app.ctx.font = app.rpx(26) + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = '#7d6a56';
  app.ctx.fillText(
    '当前穿戴：' + app.getCurrentPieceSkinWearTitle(),
    app.snapPx(L.cx),
    app.snapPx(L.currentCy)
  );

  var sepY = L.gridY0 - app.rpx(10);
  app.ctx.strokeStyle = 'rgba(92, 75, 58, 0.12)';
  app.ctx.lineWidth = app.rpx(1);
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(x + pad), app.snapPx(sepY));
  app.ctx.lineTo(app.snapPx(x + L.w - pad), app.snapPx(sepY));
  app.ctx.stroke();

  var start = app.pieceSkinModalPage * per;
  var row;
  var col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 2; col++) {
      var slot = row * 2 + col;
      var gidx = start + slot;
      if (gidx >= cat.length) {
        continue;
      }
      var gx = L.gridX0 + col * (L.cellW + L.cellGapX);
      var gy = L.gridY0 + row * (L.cellH + L.cellGapY);
      app.drawPieceSkinModalOneCard(
        gx,
        gy,
        L.cellW,
        L.cellH,
        cat[gidx],
        gidx,
        baseClassic
      );
    }
  }

  app.ctx.restore();
}

app.draw = function() {
  if (app.screen !== 'home') {
    app.stopHomeMascotAnimLoop();
    app.checkinModalVisible = false;
    app.checkinModalData = null;
  }
  if (app.screen === 'home') {
    app.drawHome();
    app.ensureHomeMascotAnimLoop();
    return;
  }
  if (app.screen === 'history') {
    app.drawHistory();
    if (app.historyReplayOverlayVisible) {
      app.drawHistoryReplayOverlay();
    }
    return;
  }
  if (app.screen === 'pve_color') {
    app.drawPveColorSelect();
    return;
  }
  if (app.screen === 'matching') {
    app.drawMatching();
    return;
  }
  if (app.screen === 'replay') {
    app.drawReplay();
    return;
  }

  app.fillAmbientBackground();

  app.layout = app.computeLayout();
  var th = app.getUiTheme();
  /** 对局棋盘固定檀木（classic），与界面风格切换无关 */
  var boardTh = themes.getTheme('classic');
  var pieceTh = app.getThemeForPieces(boardTh);
  doodles.drawGameBoardCornerClouds(
    app.ctx,
    app.W,
    app.H,
    app.layout,
    app.sys.statusBarHeight || 0
  );
  render.drawBoard(app.ctx, app.layout, boardTh);
  render.drawPieces(app.ctx, app.board, app.layout, pieceTh);
  if (app.shouldShowOpponentLastMoveMarker()) {
    var lr = app.lastOpponentMove.r;
    var lc = app.lastOpponentMove.c;
    render.drawOpponentLastMoveMarker(
      app.ctx,
      app.layout,
      boardTh,
      lr,
      lc,
      app.board[lr][lc],
      pieceTh
    );
  }
  if (app.winningLineCells && app.winningLineCells.length >= 1) {
    render.drawWinningLine(app.ctx, app.layout, app.winningLineCells, pieceTh, app.board);
  }

  app.drawBoardNameLabels(app.ctx, app.layout, th);

  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  app.ctx.shadowBlur = 6;
  app.ctx.shadowOffsetY = 1;
  render.drawText(
    app.ctx,
    '团团五子棋',
    app.W / 2,
    app.layout.topBar * 0.45,
    17,
    th.title
  );
  app.ctx.restore();

  var status = app.lastMsg;
  if (app.isPvpOnline) {
    var sideName = app.pvpOnlineYourColor === app.BLACK ? '黑' : '白';
    if (!app.onlineWsConnected) {
      status = app.onlineWsEverOpened
        ? '连接中断，正在重连…'
        : '正在连接服务器…';
    } else if (app.onlineOpponentLeft) {
      status = '对方已离开房间';
    } else if (!app.onlineBlackConnected || !app.onlineWhiteConnected) {
      status =
        app.pvpOnlineYourColor === app.BLACK && app.onlineRoomId
          ? '等待白方加入 · 房号 ' + app.onlineRoomId
          : '等待连接…';
    } else if (app.gameOver) {
      status = '对局结束';
    } else if (
      app.onlineUndoPending &&
      app.onlineUndoRequesterColor != null
    ) {
      var urOn = app.onlineUndoRequesterColor === app.BLACK ? '黑' : '白';
      if (app.pvpOnlineYourColor === app.onlineUndoRequesterColor) {
        status = '已申请悔棋，等待对方回应';
      } else {
        status = '对方申请悔棋（' + urOn + '方），请选同意或拒绝';
      }
    } else if (app.current === app.pvpOnlineYourColor) {
      status = '轮到你（' + sideName + '）';
    } else {
      status = '对方思考中…';
    }
  } else if (app.isPvpLocal) {
    if (app.localUndoRequest) {
      var urL = app.localUndoRequest.requesterColor === app.BLACK ? '黑' : '白';
      status = urL + '方申请悔棋，请对方选同意或拒绝';
    } else {
      status =
        (app.current === app.BLACK ? '黑方' : '白方') +
        '下棋（面对面轮流）';
    }
  } else if (!status) {
    if (app.current === app.pveHumanColor) {
      status =
        '轮到你（' + (app.pveHumanColor === app.BLACK ? '黑' : '白') + '）';
    } else {
      if (app.isRandomMatch) {
        status =
          '「' +
          app.randomOpponentName +
          '」思考中（' +
          app.PVE_DIFF_LABEL +
          '）…';
      } else {
        status =
          (app.pveAiColor() === app.BLACK ? '黑' : '白') +
          '棋（' +
          app.PVE_DIFF_LABEL +
          '）思考…';
      }
    }
  }
  if (app.isPvpOnline || app.isPvpLocal) {
    render.drawText(
      app.ctx,
      status,
      app.W / 2,
      app.layout.bottomY - 50,
      15,
      th.status
    );
  }

  var btnY = app.layout.bottomY;
  var undoLabel = '悔棋';
  var undoActive = !app.gameOver;
  if (undoActive && app.isPvpOnline) {
    if (app.onlineUndoPending) {
      if (app.pvpOnlineYourColor === app.onlineUndoRequesterColor) {
        undoLabel = '撤销申请';
      } else {
        undoActive = false;
      }
    } else if (app.countStonesOnBoard(app.board) === 0) {
      undoActive = false;
    }
  } else if (undoActive && app.isPvpLocal) {
    if (app.localUndoRequest) {
      undoLabel = '撤销申请';
    } else if (app.localMoveHistory.length === 0) {
      undoActive = false;
    }
  } else if (undoActive && !app.isPvpLocal && !app.isPvpOnline) {
    if (app.pveMoveHistory.length === 0) {
      undoActive = false;
    }
  }

  app.drawButton('返回首页', app.W * 0.18, btnY, false);
  app.drawButton(undoLabel, app.W * 0.5, btnY, undoActive);
  app.drawButton('重新开始', app.W * 0.82, btnY, false);

  if (app.showUndoRespondRow()) {
    var urY = btnY - 40;
    app.drawButton('同意', app.W * 0.35, urY, true);
    app.drawButton('拒绝', app.W * 0.65, urY, true);
  }

  app.drawThemeChrome(th);

  if (
    app.showResultOverlay &&
    (app.gameOver || app.onlineResultOverlaySticky)
  ) {
    app.drawResultOverlay();
  }

  app.drawRatingCardOverlay(th);
}

app.drawButton = function(label, cx, cy, active) {
  var th = app.getUiTheme();
  var bw = 82;
  var bh = 34;
  var r = 17;
  app.ctx.shadowColor = active ? th.btnShadow : 'rgba(0,0,0,0.08)';
  app.ctx.shadowBlur = active ? 12 : 8;
  app.ctx.shadowOffsetY = active ? 3 : 2;
  app.ctx.fillStyle = active ? th.btnPrimary : 'rgba(255,255,255,0.88)';
  app.ctx.strokeStyle = active
    ? 'rgba(255,255,255,0.45)'
    : th.btnGhostStroke;
  app.ctx.lineWidth = 1.5;
  app.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
  app.ctx.fill();
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.font =
    '13px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = active ? '#ffffff' : th.btnGhostText;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(label, app.snapPx(cx), app.snapPx(cy));
}

/**
 * 棋谱回放底栏药丸：渐变光泽 + 描边（与对局页 drawButton 区分，仅回放条使用）。
 */
app.drawReplayToolbarPill = function(cx, cy, bw, bh, active, pressed) {
  var th = app.getUiTheme();
  var r = Math.min(bh / 2, 18);
  var x = cx - bw / 2;
  var y = cy - bh / 2;
  var ctx = app.ctx;

  ctx.save();
  ctx.shadowColor = active ? th.btnShadow : 'rgba(42, 36, 30, 0.1)';
  ctx.shadowBlur = active ? 16 : 11;
  ctx.shadowOffsetY = active ? 4 : 2;
  ctx.fillStyle = active ? th.btnPrimary : th.btnGhostFill;
  app.roundRect(x, y, bw, bh, r);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  app.roundRect(x, y, bw, bh, r);
  ctx.clip();
  if (active) {
    var gloss = ctx.createLinearGradient(x, y, x, y + bh);
    gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
    gloss.addColorStop(0.42, 'rgba(255,255,255,0.08)');
    gloss.addColorStop(0.72, 'rgba(0,0,0,0)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x, y, bw, bh);
  } else {
    var gi = ctx.createLinearGradient(x, y, x, y + bh);
    gi.addColorStop(0, 'rgba(255,255,255,0.65)');
    gi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gi;
    ctx.fillRect(x, y, bw, bh);
  }
  ctx.restore();

  ctx.strokeStyle = active
    ? 'rgba(255,255,255,0.48)'
    : th.btnGhostStroke;
  ctx.lineWidth = 1.25;
  app.roundRect(x + 0.2, y + 0.2, bw - 0.4, bh - 0.4, Math.max(0, r - 0.2));
  ctx.stroke();

  if (pressed) {
    ctx.save();
    app.roundRect(x, y, bw, bh, r);
    ctx.clip();
    ctx.fillStyle = active ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y, bw, bh);
    ctx.restore();
  }

  ctx.restore();
}

/** 棋谱回放：文字按钮（关闭 / 自动 / 暂停） */
app.drawReplayToolbarButton = function(label, cx, cy, active, controlId) {
  var bw = app.REPLAY_CTRL_PILL_W != null ? app.REPLAY_CTRL_PILL_W : 82;
  var bh = 36;
  var pressed =
    controlId != null && app.replayControlPressedId === controlId;
  app.drawReplayToolbarPill(cx, cy, bw, bh, active, pressed);
  var th = app.getUiTheme();
  app.ctx.font =
    '600 13px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = active ? '#fffefb' : th.btnGhostText;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(label, app.snapPx(cx), app.snapPx(cy));
}

/**
 * 棋谱回放：上一步 / 下一步，与回放条药丸同风格，中间为单折线箭头。
 */
app.drawReplayStepIconButton = function(cx, cy, toPrev, active, controlId) {
  var th = app.getUiTheme();
  var bw = app.REPLAY_CTRL_PILL_W != null ? app.REPLAY_CTRL_PILL_W : 82;
  var bh = 36;
  var pressed =
    controlId != null && app.replayControlPressedId === controlId;
  app.drawReplayToolbarPill(cx, cy, bw, bh, active, pressed);
  var fg = active ? '#fffefb' : th.btnGhostText;
  app.ctx.strokeStyle = fg;
  if (active) {
    app.ctx.shadowColor = 'rgba(0,0,0,0.2)';
    app.ctx.shadowBlur = 2;
    app.ctx.shadowOffsetY = 1;
  }
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  app.ctx.lineWidth = Math.max(2.2, app.rpx(2.8));
  var u = app.rpx(12);
  app.ctx.beginPath();
  if (toPrev) {
    app.ctx.moveTo(cx + u * 0.38, cy - u * 0.58);
    app.ctx.lineTo(cx - u * 0.42, cy);
    app.ctx.lineTo(cx + u * 0.38, cy + u * 0.58);
  } else {
    app.ctx.moveTo(cx - u * 0.38, cy - u * 0.58);
    app.ctx.lineTo(cx + u * 0.42, cy);
    app.ctx.lineTo(cx - u * 0.38, cy + u * 0.58);
  }
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
}

app.roundRect = function(x, y, w, h, r) {
  app.ctx.beginPath();
  app.ctx.moveTo(x + r, y);
  app.ctx.arcTo(x + w, y, x + w, y + h, r);
  app.ctx.arcTo(x + w, y + h, x, y + h, r);
  app.ctx.arcTo(x, y + h, x, y, r);
  app.ctx.arcTo(x, y, x + w, y, r);
  app.ctx.closePath();
}

app.hitHomeBottomNav = function(clientX, clientY) {
  var hl = app.getHomeLayout();
  if (
    clientY < hl.bottomNavTop ||
    clientY > hl.bottomNavTop + hl.bottomNavH
  ) {
    return null;
  }
  var pad = hl.dockPadH != null ? hl.dockPadH : app.rpx(52);
  if (clientX < pad || clientX > app.W - pad) {
    return null;
  }
  var innerW = app.W - pad * 2;
  var colW = innerW / 4;
  var col = Math.floor((clientX - pad) / colW);
  if (col < 0 || col > 3) {
    return null;
  }
  return col;
}

app.hitHomeButton = function(clientX, clientY) {
  var hl = app.getHomeLayout();
  var nav = app.getHomeNavBarLayout();
  if (clientY < nav.navBottom || clientY > hl.mainBottom + 8) {
    return null;
  }
  var halfW = hl.btnW / 2 + 4;
  var halfH = hl.btnH / 2 + 6;
  if (
    Math.abs(clientX - hl.cx) <= halfW &&
    Math.abs(clientY - hl.yRandom) <= halfH
  ) {
    return 'random';
  }
  if (
    Math.abs(clientX - hl.cx) <= halfW &&
    Math.abs(clientY - hl.yFriend) <= halfH
  ) {
    return 'pvp';
  }
  if (
    Math.abs(clientX - hl.cx) <= halfW &&
    Math.abs(clientY - hl.yPve) <= halfH
  ) {
    return 'pve';
  }
  return null;
}

app.hitMatchingCancel = function(clientX, clientY) {
  return Math.abs(clientX - app.W / 2) <= 100 && Math.abs(clientY - app.H * 0.68) <= 28;
}

app.hitPveColorButton = function(clientX, clientY) {
  var cl = app.getPveColorLayout();
  var bw = cl.btnW / 2 + 12;
  var bh = cl.btnH / 2 + 12;
  if (
    Math.abs(clientX - cl.cx) <= bw &&
    Math.abs(clientY - cl.yBlack) <= bh
  ) {
    return 'black';
  }
  if (
    Math.abs(clientX - cl.cx) <= bw &&
    Math.abs(clientY - cl.yWhite) <= bh
  ) {
    return 'white';
  }
  if (Math.abs(clientX - cl.cx) <= 90 && Math.abs(clientY - cl.backY) <= 24) {
    return 'back';
  }
  return null;
}

app.hitGameButton = function(clientX, clientY) {
  var btnY = app.layout.bottomY;
  var halfW = 36;
  var halfH = 22;
  var list = [
    { id: 'back', x: app.W * 0.18 },
    { id: 'undo', x: app.W * 0.5 },
    { id: 'reset', x: app.W * 0.82 }
  ];
  var i;
  for (i = 0; i < list.length; i++) {
    var b = list[i];
    if (
      Math.abs(clientX - b.x) <= halfW &&
      Math.abs(clientY - btnY) <= halfH
    ) {
      return b.id;
    }
  }
  return null;
}

app.hitUndoRespondRow = function(clientX, clientY) {
  if (!app.showUndoRespondRow()) {
    return null;
  }
  var urY = app.layout.bottomY - 40;
  var halfW = 44;
  var halfH = 20;
  if (
    Math.abs(clientX - app.W * 0.35) <= halfW &&
    Math.abs(clientY - urY) <= halfH
  ) {
    return 'accept';
  }
  if (
    Math.abs(clientX - app.W * 0.65) <= halfW &&
    Math.abs(clientY - urY) <= halfH
  ) {
    return 'reject';
  }
  return null;
}

app.handleUndoButtonTap = function() {
  if (app.gameOver) {
    return;
  }
  if (app.isPvpOnline) {
    if (app.onlineUndoPending) {
      if (app.pvpOnlineYourColor === app.onlineUndoRequesterColor) {
        app.sendOnlineUndo('UNDO_CANCEL');
      }
      return;
    }
    app.sendOnlineUndo('UNDO_REQUEST');
    return;
  }
  if (app.isPvpLocal) {
    if (app.localUndoRequest) {
      app.execLocalUndoCancel();
      return;
    }
    app.tryLocalUndoRequest();
    return;
  }
  app.execPveUndo();
}

app.onBoard = function(clientX, clientY) {
  var cell = app.layout.cell;
  var ox = app.layout.originX;
  var oy = app.layout.originY;
  var max = (app.SIZE - 1) * cell;
  var pad = cell * 0.45;
  return (
    clientX >= ox - pad &&
    clientX <= ox + max + pad &&
    clientY >= oy - pad &&
    clientY <= oy + max + pad
  );
}

app.firstEmptyCellForBoard = function() {
  var i;
  var j;
  for (i = 0; i < app.SIZE; i++) {
    for (j = 0; j < app.SIZE; j++) {
      if (app.board[i][j] === gomoku.EMPTY) {
        return { r: i, c: j };
      }
    }
  }
  return null;
}

app.copyBoardForAiWorker = function(b) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < app.SIZE; i++) {
    out[i] = [];
    for (j = 0; j < app.SIZE; j++) {
      out[i][j] = b[i][j];
    }
  }
  return out;
}

app.destroyAiWorker = function() {
  if (!app.aiWorkerInstance) {
    return;
  }
  try {
    app.aiWorkerInstance.terminate();
  } catch (e1) {}
  app.aiWorkerInstance = null;
}

app.ensureAiWorker = function() {
  if (app.aiWorkerInstance) {
    return true;
  }
  if (typeof wx === 'undefined' || typeof wx.createWorker !== 'function') {
    return false;
  }
  try {
    app.aiWorkerInstance = wx.createWorker('workers/index.js');
    app.aiWorkerInstance.onMessage(function (res) {
      if (!res || res.type !== 'AI_MOVE_RESULT') {
        return;
      }
      if (res.gen !== app.aiMoveGeneration) {
        return;
      }
      if (res.seq !== app.aiWorkerSeq) {
        return;
      }
      if (app.gameOver || app.isPvpLocal || app.isPvpOnline) {
        return;
      }
      if (app.current !== app.pveAiColor()) {
        return;
      }
      if (app.screen !== 'game') {
        return;
      }
      var mv = res.move;
      if (res.err) {
        console.error('worker ai', res.err);
      }
      if (!mv) {
        mv = app.firstEmptyCellForBoard();
        if (!mv) {
          app.gameOver = true;
          app.winner = null;
          app.openResult();
          app.draw();
          return;
        }
      }
      app.applyAiMoveResult(mv);
    });
    if (typeof app.aiWorkerInstance.onProcessKilled === 'function') {
      app.aiWorkerInstance.onProcessKilled(function () {
        app.aiWorkerInstance = null;
      });
    }
    return true;
  } catch (e) {
    app.aiWorkerInstance = null;
    return false;
  }
}

app.applyAiMoveResult = function(mv) {
  var ai = app.pveAiColor();
  app.board[mv.r][mv.c] = ai;
  app.pveMoveHistory.push({ r: mv.r, c: mv.c, color: ai });
  app.lastOpponentMove = { r: mv.r, c: mv.c };
  if (gomoku.checkWin(app.board, mv.r, mv.c, ai)) {
    app.finishGameWithWin(mv.r, mv.c, ai);
    return;
  }
  if (gomoku.isBoardFull(app.board)) {
    app.gameOver = true;
    app.winner = null;
    app.openResult();
    return;
  }
  app.current = app.pveHumanColor;
  app.draw();
}

app.openingOptionsForAi = function() {
  return { rif: true };
}

app.runAiMove = function() {
  if (app.gameOver || app.isPvpLocal || app.isPvpOnline) {
    return;
  }
  var ai = app.pveAiColor();
  if (app.current !== ai) {
    return;
  }
  if (app.ensureAiWorker()) {
    app.aiWorkerSeq++;
    app.aiWorkerInstance.postMessage({
      type: 'AI_MOVE',
      seq: app.aiWorkerSeq,
      gen: app.aiMoveGeneration,
      board: app.copyBoardForAiWorker(app.board),
      aiColor: ai,
      openingOptions: app.openingOptionsForAi()
    });
    return;
  }
  var mv;
  try {
    mv = gomoku.aiMove(app.board, ai, app.openingOptionsForAi());
  } catch (err) {
    console.error('aiMove', err);
    mv = null;
  }
  if (!mv) {
    mv = app.firstEmptyCellForBoard();
    if (!mv) {
      app.gameOver = true;
      app.winner = null;
      app.openResult();
      app.draw();
      return;
    }
  }
  app.applyAiMoveResult(mv);
}

app.tryPlace = function(r, c) {
  if (app.gameOver) return;
  if (app.localUndoRequest) {
    return;
  }
  if (app.isPvpOnline && app.onlineUndoPending) {
    return;
  }
  if (app.isPvpOnline) {
    if (app.current !== app.pvpOnlineYourColor) {
      return;
    }
    if (app.board[r][c] !== gomoku.EMPTY) {
      return;
    }
    if (app.onlineSocketCanSend()) {
      app.lastOpponentMove = null;
      app.socketTask.send({
        data: JSON.stringify({ type: 'MOVE', r: r, c: c })
      });
    } else {
      wx.showToast({ title: '网络未连接', icon: 'none' });
    }
    return;
  }
  if (app.board[r][c] !== gomoku.EMPTY) return;

  var placedColor = app.current;
  app.board[r][c] = placedColor;
  app.playPlaceStoneSound();
  if (app.isPvpLocal) {
    app.localMoveHistory.push({ r: r, c: c, color: placedColor });
    app.lastOpponentMove = { r: r, c: c };
  } else if (!app.isPvpOnline) {
    app.pveMoveHistory.push({ r: r, c: c, color: placedColor });
    app.lastOpponentMove = null;
  }
  if (gomoku.checkWin(app.board, r, c, app.current)) {
    app.finishGameWithWin(r, c, app.current);
    return;
  }

  if (gomoku.isBoardFull(app.board)) {
    app.gameOver = true;
    app.winner = null;
    app.openResult();
    return;
  }

  app.current = app.current === app.BLACK ? app.WHITE : app.BLACK;
  app.lastMsg = '';
  app.draw();

  if (
    !app.isPvpLocal &&
    !app.gameOver &&
    app.current === app.pveAiColor()
  ) {
    setTimeout(function () {
      app.runAiMove();
    }, 200);
  }
}

/* ---------- 触摸与生命周期 ---------- */

app.lastTouchDownX = 0;
app.lastTouchDownY = 0;

wx.onTouchStart(function (e) {
  var t = e.touches[0];
  var x = t.clientX;
  var y = t.clientY;
  app.lastTouchDownX = x;
  app.lastTouchDownY = y;

  if (app.screen === 'history') {
    if (app.ratingCardVisible) {
      if (app.hitRatingCardClose(x, y)) {
        app.ratingCardVisible = false;
        app.ratingCardData = null;
        app.draw();
        return;
      }
      if (!app.hitRatingCardInside(x, y)) {
        app.ratingCardVisible = false;
        app.ratingCardData = null;
        app.draw();
        return;
      }
      return;
    }
    if (app.historyReplayOverlayVisible) {
      app.layout = app.computeLayout();
      var rcH = app.hitReplayControl(x, y);
      if (rcH != null) {
        app.replayControlPressedId = rcH;
        app.replayTouchIdentifier = e.touches[0].identifier;
      } else {
        app.replayControlPressedId = null;
        app.replayTouchIdentifier = null;
      }
      app.draw();
      return;
    }
    var hi = app.hitHistoryInteract(x, y);
    if (hi === 'back') {
      app.historyListLoading = false;
      app.hideHistoryNativeLoading();
      app.historyReplayTouchRec = null;
      app.historyReplayTouchId = null;
      app.stopHistoryMomentum();
      app.screen = 'home';
      app.historyScrollTouchId = null;
      app.draw();
      return;
    }
    if (typeof hi === 'string' && hi.indexOf('tab') === 0) {
      var tn = parseInt(hi.slice(3), 10);
      if (!isNaN(tn) && tn >= 0 && tn <= 2) {
        app.historyFilterTab = tn;
        app.stopHistoryMomentum();
        app.historyScrollY = 0;
        app.draw();
        app.fetchHistoryListForCurrentFilter();
      }
      return;
    }
    var hRec = app.hitHistoryRowReplayIcon(x, y);
    if (hRec && e.touches && e.touches[0]) {
      app.historyReplayTouchRec = hRec;
      app.historyReplayTouchId = e.touches[0].identifier;
      app.historyListTouchStartX = x;
      app.historyListTouchStartY = y;
      return;
    }
    if (e.touches && e.touches[0] && app.hitHistoryListZone(x, y)) {
      app.stopHistoryMomentum();
      app.historyScrollTouchId = e.touches[0].identifier;
      app.historyScrollLastY = y;
      app.historyScrollLastTs = Date.now();
      app.historyScrollVel = 0;
      app.historyListTouchStartX = x;
      app.historyListTouchStartY = y;
    }
    return;
  }

  if (
    (app.screen === 'home' || app.screen === 'game') &&
    app.ratingCardVisible
  ) {
    if (app.hitRatingCardClose(x, y)) {
      app.ratingCardVisible = false;
      app.ratingCardData = null;
      app.draw();
      return;
    }
    if (!app.hitRatingCardInside(x, y)) {
      app.ratingCardVisible = false;
      app.ratingCardData = null;
      app.draw();
      return;
    }
    return;
  }

  if (app.screen === 'home' && app.checkinModalVisible) {
    if (app.hitCheckinModalHeaderClose(x, y)) {
      app.checkinModalVisible = false;
      app.checkinModalData = null;
      app.draw();
      return;
    }
    if (app.hitCheckinModalPrimaryBtn(x, y)) {
      if (!app.isHomeCheckinDoneToday()) {
        if (!authApi.getSessionToken()) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        wx.request(
          Object.assign(roomApi.meCheckinOptions(), {
            success: function (res) {
              var d = res.data;
              if (d && typeof d === 'string') {
                try {
                  d = JSON.parse(d);
                } catch (pe) {
                  d = null;
                }
              }
              if (res.statusCode === 401) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: '请先登录', icon: 'none' });
                }
                return;
              }
              if (res.statusCode !== 200 || !d) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: '签到失败', icon: 'none' });
                }
                return;
              }
              app.syncCheckinStateFromServerPayload(d);
              if (app.checkinModalData) {
                app.checkinModalData.streak = app.getCheckinState().streak;
                app.checkinModalData.rewardPoints =
                  d.ok && !d.alreadySigned
                    ? d.rewardPoints
                    : app.CHECKIN_DAILY_POINTS;
                app.checkinModalData.totalPoints = app.getCheckinState().tuanPoints;
                app.checkinModalData.justSigned = !!(d.ok && !d.alreadySigned);
              }
              if (typeof wx.showToast === 'function') {
                if (d.alreadySigned) {
                  wx.showToast({ title: '今日已签到', icon: 'none' });
                } else if (d.ok) {
                  var msg = '签到成功 +' + d.rewardPoints + ' 积分';
                  if (d.newlyUnlockedTuanMoe) {
                    msg += '，「团团萌肤」已解锁';
                  }
                  wx.showToast({ title: msg, icon: 'none' });
                } else {
                  wx.showToast({ title: '签到失败', icon: 'none' });
                }
              }
              app.draw();
            },
            fail: function () {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '网络错误', icon: 'none' });
              }
            }
          })
        );
      }
      return;
    }
    if (
      app.hitCheckinModalPrevMonth(x, y) &&
      app.checkinModalData &&
      app.checkinModalCanGoPrevMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth
      )
    ) {
      var pM = app.checkinModalShiftMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth,
        -1
      );
      app.checkinModalData.viewYear = pM.y;
      app.checkinModalData.viewMonth = pM.m;
      app.draw();
      return;
    }
    if (
      app.hitCheckinModalNextMonth(x, y) &&
      app.checkinModalData &&
      app.checkinModalCanGoNextMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth
      )
    ) {
      var nM = app.checkinModalShiftMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth,
        1
      );
      app.checkinModalData.viewYear = nM.y;
      app.checkinModalData.viewMonth = nM.m;
      app.draw();
      return;
    }
    if (
      app.hitCheckinModalPrevMonth(x, y) ||
      app.hitCheckinModalNextMonth(x, y)
    ) {
      return;
    }
    if (!app.hitCheckinModalInside(x, y)) {
      app.checkinModalVisible = false;
      app.checkinModalData = null;
      app.draw();
      return;
    }
    return;
  }

  if (app.screen === 'home' && app.pieceSkinModalVisible) {
    if (app.hitPieceSkinModalClose(x, y)) {
      app.closePieceSkinModal();
      return;
    }
    var redeemHit = app.hitPieceSkinModalRedeemButton(x, y);
    if (redeemHit >= 0) {
      app.pieceSkinModalPendingIdx = redeemHit;
      app.redeemPieceSkinWithPoints();
      return;
    }
    var cg = app.hitPieceSkinModalGridCatalogIndex(x, y);
    if (cg >= 0) {
      app.pieceSkinModalPendingIdx = cg;
      var catPick = themes.getPieceSkinCatalog();
      var entPick = catPick[cg];
      if (
        entPick &&
        entPick.rowStatus === 'points' &&
        entPick.costPoints &&
        entPick.costPoints > 0
      ) {
        app.draw();
        return;
      }
      app.applyPieceSkinWear();
      return;
    }
    if (!app.hitPieceSkinModalPanel(x, y)) {
      app.closePieceSkinModal();
      return;
    }
    return;
  }

  if (app.screen === 'home' && app.homeDrawerOpen) {
    if (app.hitHomeDrawerBackdrop(x, y)) {
      app.homeDrawerOpen = false;
      app.draw();
      return;
    }
    var dr = app.hitHomeDrawerRow(x, y);
    if (dr === null) {
      return;
    }
    if (app.homeDrawerShowsThemeRow()) {
      if (dr === 0) {
        app.cycleThemeNext();
        app.homeDrawerOpen = false;
        app.draw();
        return;
      }
      if (dr === 1) {
        app.homeDrawerOpen = false;
        app.openPieceSkinModal();
        app.draw();
        return;
      }
      if (dr === 2) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '敬请期待', icon: 'none' });
        }
        app.homeDrawerOpen = false;
        app.draw();
        return;
      }
      if (dr === 3) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '团团五子棋', icon: 'none' });
        }
        app.homeDrawerOpen = false;
        app.draw();
        return;
      }
    } else {
      if (dr === 0) {
        app.homeDrawerOpen = false;
        app.openPieceSkinModal();
        app.draw();
        return;
      }
      if (dr === 1) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '敬请期待', icon: 'none' });
        }
        app.homeDrawerOpen = false;
        app.draw();
        return;
      }
      if (dr === 2) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '团团五子棋', icon: 'none' });
        }
        app.homeDrawerOpen = false;
        app.draw();
        return;
      }
    }
    return;
  }

  if (app.screen === 'home') {
    var navHit = app.hitHomeNavIcon(x, y);
    if (navHit === 'avatar') {
      app.showMyRatingModal();
      return;
    }
    var dockHit = app.hitHomeBottomNav(x, y);
    if (dockHit !== null) {
      app.homePressedButton = null;
      app.homePressedDockCol = dockHit;
      app.draw();
      return;
    }
  }

  var boardAv =
    app.screen === 'replay' ||
    (app.screen === 'history' && app.historyReplayOverlayVisible)
      ? null
      : app.hitWhichGameBoardNameAvatar(x, y);
  if (boardAv === 'my') {
    app.showMyRatingModal();
    return;
  }
  if (boardAv === 'opp') {
    if (app.isPvpOnline && app.onlineRoomId) {
      app.showOpponentRatingModal();
    } else if (app.isPvpLocal) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '本局无对方账号', icon: 'none' });
      }
    } else {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '人机对战无对手天梯', icon: 'none' });
      }
    }
    return;
  }

  if (
    app.screen !== 'home' &&
    app.themeScreenShowsStyleEntry() &&
    app.hitThemeEntry(x, y)
  ) {
    app.cycleThemeNext();
    return;
  }

  if (app.screen === 'home') {
    var homeBtn = app.hitHomeButton(x, y);
    if (homeBtn !== null) {
      app.homePressedDockCol = null;
      app.homePressedButton = homeBtn;
      app.draw();
      return;
    }
    if (app.homePressedButton || app.homePressedDockCol !== null) {
      app.homePressedButton = null;
      app.homePressedDockCol = null;
      app.draw();
    }
    return;
  }

  if (app.screen === 'matching') {
    if (app.hitMatchingCancel(x, y)) {
      app.cancelMatching();
    }
    return;
  }

  if (app.screen === 'pve_color') {
    var colorBtn = app.hitPveColorButton(x, y);
    if (colorBtn === 'black') {
      app.startPve(app.BLACK);
      return;
    }
    if (colorBtn === 'white') {
      app.startPve(app.WHITE);
      return;
    }
    if (colorBtn === 'back') {
      app.backToHome();
      return;
    }
    return;
  }

  if (app.screen === 'replay') {
    app.layout = app.computeLayout();
    var rcR = app.hitReplayControl(x, y);
    if (rcR != null) {
      app.replayControlPressedId = rcR;
      app.replayTouchIdentifier = e.touches[0].identifier;
    } else {
      app.replayControlPressedId = null;
      app.replayTouchIdentifier = null;
    }
    app.draw();
    return;
  }

  if (
    app.screen === 'game' &&
    app.showResultOverlay &&
    (app.gameOver || app.onlineResultOverlaySticky)
  ) {
    var rb = app.hitResultButton(x, y);
    if (rb === 'again') {
      app.resetGame();
      return;
    }
    if (rb === 'replay') {
      app.openReplayFromResult();
      return;
    }
    if (rb === 'home') {
      app.backToHome();
      return;
    }
    return;
  }

  var urBtn = app.hitUndoRespondRow(x, y);
  if (urBtn === 'accept') {
    if (app.isPvpLocal) {
      app.execLocalUndoAccept();
    } else if (app.isPvpOnline) {
      app.sendOnlineUndo('UNDO_ACCEPT');
    }
    return;
  }
  if (urBtn === 'reject') {
    if (app.isPvpLocal) {
      app.execLocalUndoReject();
    } else if (app.isPvpOnline) {
      app.sendOnlineUndo('UNDO_REJECT');
    }
    return;
  }

  var gbtn = app.hitGameButton(x, y);
  if (gbtn === 'back') {
    app.backToHome();
    return;
  }
  if (gbtn === 'undo') {
    app.handleUndoButtonTap();
    return;
  }
  if (gbtn === 'reset') {
    if (app.isPvpOnline) {
      if (app.gameOver) {
        app.resetGame();
      } else {
        wx.showToast({ title: '对局中无法重开', icon: 'none' });
      }
      return;
    }
    app.resetGame();
    return;
  }

  if (!app.onBoard(x, y)) return;
  if (app.isPvpOnline) {
    if (app.current !== app.pvpOnlineYourColor) {
      return;
    }
  } else if (!app.isPvpLocal && app.current !== app.pveHumanColor) {
    return;
  }

  var cell = app.pixelToCell(x, y);
  if (!cell) return;
  app.tryPlace(cell.r, cell.c);
});

if (typeof wx.onTouchMove === 'function') {
  wx.onTouchMove(function (e) {
    if (
      app.screen === 'replay' ||
      (app.screen === 'history' && app.historyReplayOverlayVisible)
    ) {
      if (
        app.replayControlPressedId != null &&
        e.touches &&
        e.touches.length
      ) {
        var tm;
        for (tm = 0; tm < e.touches.length; tm++) {
          if (
            app.replayTouchIdentifier != null &&
            e.touches[tm].identifier === app.replayTouchIdentifier
          ) {
            app.layout = app.computeLayout();
            var curHit = app.hitReplayControl(
              e.touches[tm].clientX,
              e.touches[tm].clientY
            );
            if (curHit !== app.replayControlPressedId) {
              app.replayControlPressedId = null;
              app.replayTouchIdentifier = null;
              app.draw();
            }
            break;
          }
        }
      }
      return;
    }
    if (app.screen !== 'history' || app.historyScrollTouchId == null) {
      return;
    }
    var touches = e.touches;
    if (!touches || !touches.length) {
      return;
    }
    var t = null;
    var i;
    for (i = 0; i < touches.length; i++) {
      if (touches[i].identifier == app.historyScrollTouchId) {
        t = touches[i];
        break;
      }
    }
    if (!t) {
      return;
    }
    var dy = t.clientY - app.historyScrollLastY;
    app.historyScrollLastY = t.clientY;
    var now = Date.now();
    var dtMove = Math.max(5, now - app.historyScrollLastTs);
    app.historyScrollLastTs = now;
    var instVel = -dy / dtMove;
    app.historyScrollVel = app.historyScrollVel * 0.62 + instVel * 0.38;
    app.historyScrollY -= dy;
    var sm = app.getHistoryListScrollMetrics();
    var maxScroll = sm.maxScroll;
    if (app.historyScrollY > maxScroll) {
      app.historyScrollY = maxScroll;
    }
    if (app.historyScrollY < 0) {
      app.historyScrollY = 0;
    }
    app.draw();
  });
}

if (typeof wx.onTouchEnd === 'function') {
  wx.onTouchEnd(function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (
      e.changedTouches &&
      (app.screen === 'replay' ||
        (app.screen === 'history' && app.historyReplayOverlayVisible))
    ) {
      var rpe;
      var matchedReplayEnd = null;
      if (app.replayTouchIdentifier != null) {
        for (rpe = 0; rpe < e.changedTouches.length; rpe++) {
          if (e.changedTouches[rpe].identifier === app.replayTouchIdentifier) {
            matchedReplayEnd = e.changedTouches[rpe];
            break;
          }
        }
      }
      var savedReplayId = app.replayControlPressedId;
      app.replayControlPressedId = null;
      app.replayTouchIdentifier = null;
      if (savedReplayId != null && matchedReplayEnd) {
        app.layout = app.computeLayout();
        var endReplayHit = app.hitReplayControl(
          matchedReplayEnd.clientX,
          matchedReplayEnd.clientY
        );
        if (endReplayHit === savedReplayId) {
          app.onReplayControlHit(savedReplayId);
        } else {
          app.draw();
        }
      } else if (savedReplayId != null) {
        app.draw();
      }
    }
    if (app.screen === 'history' && app.historyReplayTouchId != null && e.changedTouches) {
      var hrTouch = null;
      var hrej;
      for (hrej = 0; hrej < e.changedTouches.length; hrej++) {
        if (e.changedTouches[hrej].identifier == app.historyReplayTouchId) {
          hrTouch = e.changedTouches[hrej];
          break;
        }
      }
      if (hrTouch) {
        var tapSlopHr = app.rpx(56);
        var hdx = hrTouch.clientX - app.historyListTouchStartX;
        var hdy = hrTouch.clientY - app.historyListTouchStartY;
        if (
          hdx * hdx + hdy * hdy <= tapSlopHr * tapSlopHr &&
          app.historyReplayTouchRec
        ) {
          app.openHistoryReplayForRecord(app.historyReplayTouchRec);
        }
      }
      app.historyReplayTouchRec = null;
      app.historyReplayTouchId = null;
    }
    var teHist = null;
    if (app.screen === 'history' && app.historyScrollTouchId != null && e.changedTouches) {
      var hi;
      for (hi = 0; hi < e.changedTouches.length; hi++) {
        if (e.changedTouches[hi].identifier == app.historyScrollTouchId) {
          teHist = e.changedTouches[hi];
          break;
        }
      }
    }
    if (teHist) {
      var tapSlop = app.rpx(56);
      var tdx = teHist.clientX - app.historyListTouchStartX;
      var tdy = teHist.clientY - app.historyListTouchStartY;
      if (tdx * tdx + tdy * tdy <= tapSlop * tapSlop) {
        var tapUid = app.hitHistoryRowOpponentAvatar(
          app.historyListTouchStartX,
          app.historyListTouchStartY
        );
        if (tapUid != null && tapUid > 0) {
          app.showHistoryOpponentRatingModal(tapUid);
        }
      }
      app.historyScrollTouchId = null;
      var vmin = 0.055;
      if (Math.abs(app.historyScrollVel) >= vmin) {
        app.historyMomentumLastTs = Date.now();
        if (app.historyMomentumRafId == null) {
          app.historyMomentumRafId = app.themeBubbleRaf(
            app.tickHistoryScrollMomentum
          );
        }
      } else {
        app.historyScrollVel = 0;
      }
    }
    if (app.screen === 'home' && app.homePressedButton) {
      if (
        !t ||
        app.homeDrawerOpen ||
        app.ratingCardVisible ||
        app.checkinModalVisible ||
        app.pieceSkinModalVisible
      ) {
        app.homePressedButton = null;
        app.draw();
        return;
      } else {
        var xRel = t.clientX;
        var yRel = t.clientY;
        var endHit = app.hitHomeButton(xRel, yRel);
        var pb = app.homePressedButton;
        app.homePressedButton = null;
        app.draw();
        if (endHit === pb) {
          if (pb === 'pvp') {
            app.startOnlineAsHost();
            return;
          }
          if (pb === 'pve') {
            app.homeDrawerOpen = false;
            app.screen = 'pve_color';
            app.draw();
            return;
          }
          if (pb === 'random') {
            app.startRandomMatch();
            return;
          }
        }
        return;
      }
    } else if (app.screen === 'home' && app.homePressedDockCol !== null) {
      if (
        !t ||
        app.homeDrawerOpen ||
        app.ratingCardVisible ||
        app.checkinModalVisible ||
        app.pieceSkinModalVisible
      ) {
        app.homePressedDockCol = null;
        app.draw();
        return;
      }
      var endDock = app.hitHomeBottomNav(t.clientX, t.clientY);
      var pdc = app.homePressedDockCol;
      app.homePressedDockCol = null;
      app.draw();
      if (endDock === pdc) {
        if (pdc === 3) {
          app.openPieceSkinModal();
          return;
        }
        if (pdc === 0) {
          authApi.ensureSession(function (sessOk) {
            if (!sessOk || !authApi.getSessionToken()) {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '请先登录后再签到', icon: 'none' });
              }
              return;
            }
            if (typeof wx.showLoading === 'function') {
              wx.showLoading({ title: '加载中…', mask: true });
            }
            wx.request(
              Object.assign(roomApi.meRatingOptions(), {
                success: function (res) {
                  if (typeof wx.hideLoading === 'function') {
                    wx.hideLoading();
                  }
                  if (res.statusCode === 401 || res.statusCode !== 200 || !res.data) {
                    if (typeof wx.showToast === 'function') {
                      wx.showToast({
                        title:
                          res.statusCode === 401 ? '请先登录' : '加载失败',
                        icon: 'none'
                      });
                    }
                    return;
                  }
                  var d = res.data;
                  if (d && typeof d === 'string') {
                    try {
                      d = JSON.parse(d);
                    } catch (eParse) {
                      d = null;
                    }
                  }
                  if (!d) {
                    return;
                  }
                  app.syncCheckinStateFromServerPayload(d);
                  app.applyMyGenderFromRatingPayload(d);
                  var calNow = new Date();
                  var calY = calNow.getFullYear();
                  var calM = calNow.getMonth() + 1;
                  var stOpen = app.getCheckinState();
                  app.checkinModalData = {
                    streak: stOpen.streak,
                    rewardPoints: app.CHECKIN_DAILY_POINTS,
                    totalPoints: stOpen.tuanPoints,
                    justSigned: false,
                    viewYear: calY,
                    viewMonth: calM
                  };
                  app.checkinModalVisible = true;
                  app.draw();
                },
                fail: function () {
                  if (typeof wx.hideLoading === 'function') {
                    wx.hideLoading();
                  }
                  if (typeof wx.showToast === 'function') {
                    wx.showToast({ title: '网络错误', icon: 'none' });
                  }
                }
              })
            );
          });
          return;
        }
        if (pdc === 2) {
          app.openHistoryScreen();
          return;
        }
        if (pdc === 1 && typeof wx.showToast === 'function') {
          wx.showToast({ title: '对战排行 敬请期待', icon: 'none' });
        }
      }
      return;
    } else if (app.homePressedButton) {
      app.homePressedButton = null;
      app.draw();
    } else if (app.homePressedDockCol !== null) {
      app.homePressedDockCol = null;
      app.draw();
    }
    if (
      !t ||
      app.screen !== 'home' ||
      app.homeDrawerOpen ||
      app.ratingCardVisible ||
      app.checkinModalVisible ||
      app.pieceSkinModalVisible
    ) {
      return;
    }
    var nav = app.getHomeNavBarLayout();
    if (
      app.lastTouchDownY < nav.navTop ||
      app.lastTouchDownY > nav.navBottom
    ) {
      return;
    }
    var x1 = t.clientX;
    var y1 = t.clientY;
    var dx = x1 - app.lastTouchDownX;
    var dy = y1 - app.lastTouchDownY;
    var edge = app.rpx(28);
    if (
      app.lastTouchDownX < edge &&
      dx > app.rpx(56) &&
      Math.abs(dy) < app.rpx(72)
    ) {
      app.homeDrawerOpen = true;
      app.draw();
    }
  });
}

if (typeof wx.onTouchCancel === 'function') {
  wx.onTouchCancel(function () {
    if (app.screen === 'history') {
      app.historyScrollTouchId = null;
      app.stopHistoryMomentum();
    }
    if (app.replayControlPressedId != null || app.replayTouchIdentifier != null) {
      app.replayControlPressedId = null;
      app.replayTouchIdentifier = null;
      app.draw();
    }
    if (app.homePressedButton || app.homePressedDockCol !== null) {
      app.homePressedButton = null;
      app.homePressedDockCol = null;
      app.draw();
    }
  });
}

wx.onError(function (err) {
  console.error('game error', err);
});

if (typeof wx.showShareMenu === 'function') {
  wx.showShareMenu({
    withShareTicket: true
  });
}

if (typeof wx.onShow === 'function') {
  wx.onShow(function (res) {
    /** 每次进入小程序（冷启动或从后台切回）：无用户则插入，有则更新 last_login_at */
    authApi.silentLogin();
    app.loadHomeUiAssets();
    setTimeout(function () {
      app.tryFetchMyProfileAvatar();
    }, 500);
    if (res && res.query && String(res.query.online) === '1' && res.query.roomId) {
      app.tryLaunchOnlineInvite(res.query);
    }
    if (app.shouldAutoReconnectOnline() && !app.onlineWsConnected) {
      app.clearOnlineReconnectTimer();
      app.scheduleOnlineReconnect(true);
    }
  });
} else {
  authApi.silentLogin();
}

if (typeof wx.onNetworkStatusChange === 'function') {
  wx.onNetworkStatusChange(function (res) {
    if (
      res.isConnected &&
      app.shouldAutoReconnectOnline() &&
      !app.onlineWsConnected
    ) {
      app.clearOnlineReconnectTimer();
      app.scheduleOnlineReconnect(true);
    }
  });
}

};
