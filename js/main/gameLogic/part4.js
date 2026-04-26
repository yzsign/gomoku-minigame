/**
 * Auto-split from gameLogic.js (part 4)
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

app.hitResultButton = function(clientX, clientY) {
  var rl = app.getResultOverlayLayout();
  var halfH = rl.primaryH * 0.5 + 14;
  if (rl.showRematchRespond) {
    var halfRw = rl.rematchBtnW * 0.5 + 8;
    if (
      Math.abs(clientX - rl.rematchAcceptCx) <= halfRw &&
      Math.abs(clientY - rl.primaryCy) <= halfH
    ) {
      return 'rematch_accept';
    }
    if (
      Math.abs(clientX - rl.rematchDeclineCx) <= halfRw &&
      Math.abs(clientY - rl.primaryCy) <= halfH
    ) {
      return 'rematch_decline';
    }
  } else if (!rl.showRematchInviteHint) {
    var halfPw = rl.primaryW * 0.5 + 14;
    if (
      Math.abs(clientX - rl.primaryCx) <= halfPw &&
      Math.abs(clientY - rl.primaryCy) <= halfH
    ) {
      return 'rematch_same';
    }
  }
  var nDock = rl.hasReplayDock ? 3 : 2;
  var colW = app.W / nDock;
  var dockTop = rl.dockCy - rl.dockH * 0.48;
  var dockBot = rl.dockCy + rl.dockH * 0.48;
  if (clientY >= dockTop && clientY <= dockBot) {
    var col = Math.floor(clientX / colW);
    if (col < 0) {
      col = 0;
    }
    if (col >= nDock) {
      col = nDock - 1;
    }
    if (nDock === 3) {
      if (col === 0) {
        return 'home';
      }
      if (col === 1) {
        return 'replay';
      }
      return app.isPvpOnline ? 'rematch_new' : 'rematch_same';
    }
    if (col === 0) {
      return 'home';
    }
    return app.isPvpOnline ? 'rematch_new' : 'rematch_same';
  }
  return null;
}

app.buildBoardFromMoves = function(moves, step) {
  var b = gomoku.createBoard();
  var k;
  var n = Math.min(step, moves.length);
  for (k = 0; k < n; k++) {
    var mv = moves[k];
    if (!mv) {
      continue;
    }
    b[mv.r][mv.c] = mv.color;
  }
  return b;
}

/** 当前回放步的棋盘是否已有棋子（未点「下一步」时步数为 0，盘面为空，复盘应置灰） */
app.replayBoardHasAnyStone = function(board) {
  if (!board) {
    return false;
  }
  var i;
  var j;
  for (i = 0; i < app.SIZE; i++) {
    for (j = 0; j < app.SIZE; j++) {
      if (board[i][j] !== gomoku.EMPTY) {
        return true;
      }
    }
  }
  return false;
};

app.clearReplayControlPress = function() {
  app.replayControlPressedId = null;
  app.replayTouchIdentifier = null;
}

app.enterReplayScreen = function(movesArr, blackPieceSkinId, whitePieceSkinId, sourceGameId) {
  app.stopReplayAuto();
  app.clearReplayControlPress();
  app.replayMoves = movesArr || [];
  app.replayStep = 0;
  var gid =
    sourceGameId != null && sourceGameId !== ''
      ? Number(sourceGameId)
      : NaN;
  app.replaySourceGameId = !isNaN(gid) && gid > 0 ? gid : null;
  if (arguments.length >= 2) {
    app.applyReplayPieceSkinsFromOptional(blackPieceSkinId, whitePieceSkinId);
  } else {
    app.replayBlackPieceSkinId = null;
    app.replayWhitePieceSkinId = null;
  }
  app.screen = 'replay';
  app.showResultOverlay = false;
  if (typeof app.stopResultTuanPointsAnim === 'function') {
    app.stopResultTuanPointsAnim();
  }
  app.draw();
}

app.exitReplayScreen = function() {
  app.stopReplayAuto();
  app.clearReplayControlPress();
  app.replayBlackPieceSkinId = null;
  app.replayWhitePieceSkinId = null;
  app.replaySourceGameId = null;
  app.screen = 'game';
  app.showResultOverlay = true;
  app.draw();
}

app.openHistoryReplayOverlay = function(movesArr, blackPieceSkinId, whitePieceSkinId, sourceGameId) {
  app.stopReplayAuto();
  app.clearReplayControlPress();
  app.stopHistoryMomentum();
  app.replayMoves = movesArr || [];
  app.replayStep = 0;
  var gidO =
    sourceGameId != null && sourceGameId !== ''
      ? Number(sourceGameId)
      : NaN;
  app.replaySourceGameId = !isNaN(gidO) && gidO > 0 ? gidO : null;
  if (arguments.length >= 2) {
    app.applyReplayPieceSkinsFromOptional(blackPieceSkinId, whitePieceSkinId);
  } else {
    app.replayBlackPieceSkinId = null;
    app.replayWhitePieceSkinId = null;
  }
  app.historyReplayOverlayVisible = true;
  app.draw();
}

app.closeHistoryReplayOverlay = function() {
  app.stopReplayAuto();
  app.clearReplayControlPress();
  app.replayBlackPieceSkinId = null;
  app.replayWhitePieceSkinId = null;
  app.replaySourceGameId = null;
  app.historyReplayOverlayVisible = false;
  app.draw();
}

/**
 * 棋谱控制条：全屏回放页与战绩弹层共用。
 */
app.onReplayControlHit = function(rc) {
  if (rc == null) {
    return;
  }
  if (rc === 'close') {
    if (app.historyReplayOverlayVisible) {
      app.closeHistoryReplayOverlay();
    } else {
      app.exitReplayScreen();
    }
    return;
  }
  if (rc === 'study') {
    var studyBoard = app.buildBoardFromMoves(
      app.replayMoves || [],
      app.replayStep
    );
    if (!app.replayBoardHasAnyStone(studyBoard)) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        var studyHasMoves = app.replayMoves && app.replayMoves.length > 0;
        wx.showToast({
          title: studyHasMoves
            ? '请先点「下一步」浏览棋局'
            : '暂无棋谱',
          icon: 'none'
        });
      }
      return;
    }
    app.enterReplayStudyFromCurrentStep();
    return;
  }
  if (rc === 'prev' && app.replayStep > 0) {
    app.replayStep--;
    app.draw();
    return;
  }
  if (rc === 'next' && app.replayStep < app.replayMoves.length) {
    app.replayStep++;
    app.playPlaceStoneSound();
    app.draw();
    return;
  }
  if (rc === 'auto') {
    if (app.replayAutoTimerId != null) {
      app.stopReplayAuto();
    } else if (app.replayMoves.length > 0) {
      if (app.replayStep >= app.replayMoves.length) {
        app.replayStep = 0;
      }
      app.replayAutoTimerId = setInterval(function () {
        if (app.replayStep >= app.replayMoves.length) {
          app.stopReplayAuto();
          app.draw();
          return;
        }
        app.replayStep++;
        app.playPlaceStoneSound();
        app.draw();
      }, 600);
    }
    app.draw();
  }
}

app.tryReplayByRoomFallback = function() {
  if (!app.onlineRoomId) {
    wx.showToast({ title: '加载失败', icon: 'none' });
    return;
  }
  wx.showLoading({ title: '加载棋谱…', mask: true });
  wx.request(
    Object.assign(
      roomApi.gameReplayByRoomOptions(app.onlineRoomId, app.onlineMatchRound),
      {
        success: function (res) {
          wx.hideLoading();
          if (res.statusCode === 200 && res.data && res.data.moves) {
            var gidR =
              res.data.gameId != null ? Number(res.data.gameId) : NaN;
            app.enterReplayScreen(
              res.data.moves,
              res.data.blackPieceSkinId,
              res.data.whitePieceSkinId,
              !isNaN(gidR) && gidR > 0 ? gidR : null
            );
          } else {
            wx.showToast({ title: '暂无棋谱', icon: 'none' });
          }
        },
        fail: function () {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    )
  );
}

app.openReplayFromResult = function() {
  if (app.isDailyPuzzle && app.dailyPuzzleMoves && app.dailyPuzzleMoves.length > 0) {
    var dm = [];
    var di;
    for (di = 0; di < app.dailyPuzzleMoves.length; di++) {
      dm.push(app.dailyPuzzleMoves[di]);
    }
    app.enterReplayScreen(dm, null, null, null);
    return;
  }
  if (app.onlineMoveHistory.length > 0) {
    var copy = [];
    var i;
    for (i = 0; i < app.onlineMoveHistory.length; i++) {
      copy.push(app.onlineMoveHistory[i]);
    }
    app.enterReplayScreen(
      copy,
      app.onlineBlackPieceSkinId,
      app.onlineWhitePieceSkinId,
      null
    );
    return;
  }
  if (app.lastSettledGameId) {
    wx.showLoading({ title: '加载棋谱…', mask: true });
    wx.request(
      Object.assign(roomApi.gameReplayByIdOptions(app.lastSettledGameId), {
        success: function (res) {
          wx.hideLoading();
          if (res.statusCode === 200 && res.data) {
            var gidF =
              res.data.gameId != null ? Number(res.data.gameId) : NaN;
            var gidUse =
              !isNaN(gidF) && gidF > 0
                ? gidF
                : app.lastSettledGameId != null
                  ? Number(app.lastSettledGameId)
                  : null;
            app.enterReplayScreen(
              res.data.moves || [],
              res.data.blackPieceSkinId,
              res.data.whitePieceSkinId,
              gidUse
            );
          } else {
            app.tryReplayByRoomFallback();
          }
        },
        fail: function () {
          wx.hideLoading();
          app.tryReplayByRoomFallback();
        }
      })
    );
    return;
  }
  app.tryReplayByRoomFallback();
}

/**
 * 棋谱回放底栏药丸中心 Y（相对 layout.bottomY）。
 * 在原先 rpx(112) 基础上再上移约 20 逻辑像素（rpx(40) 在 375 宽屏约 20px）。
 */
app.getReplayControlsButtonY = function() {
  return app.layout.bottomY - app.rpx(112) - app.rpx(40);
};

/** 上一步 / 下一步：以屏宽中心对称，中心距=药丸宽，两钮边缘相贴无间隙 */
app.getReplayNavPrevCx = function() {
  var w = app.REPLAY_CTRL_PILL_W || 82;
  return app.W / 2 - w / 2;
};

app.getReplayNavNextCx = function() {
  var w = app.REPLAY_CTRL_PILL_W || 82;
  return app.W / 2 + w / 2;
};

app.replaySideToMoveAfterStep = function(step) {
  var moves = app.replayMoves || [];
  var st = step | 0;
  if (st < moves.length && moves[st]) {
    return moves[st].color;
  }
  if (moves.length === 0) {
    return app.BLACK;
  }
  var last = moves[moves.length - 1];
  return typeof app.oppositeColor === 'function'
    ? app.oppositeColor(last.color)
    : last.color === app.BLACK
      ? app.WHITE
      : app.BLACK;
};

app.enterReplayStudyFromCurrentStep = function() {
  if (!app.replayMoves || app.replayMoves.length === 0) {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: '暂无棋谱', icon: 'none' });
    }
    return;
  }
  var board = app.buildBoardFromMoves(app.replayMoves, app.replayStep);
  if (!app.replayBoardHasAnyStone(board)) {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: '请先点「下一步」浏览棋局', icon: 'none' });
    }
    return;
  }
  var sideToMove = app.replaySideToMoveAfterStep(app.replayStep);
  var stepN = app.replayStep;
  var fb = app.replayBlackPieceSkinId;
  var fw = app.replayWhitePieceSkinId;
  var gid = app.replaySourceGameId;
  var movesPayload = [];
  var mi;
  for (mi = 0; mi < app.replayMoves.length; mi++) {
    var m = app.replayMoves[mi];
    movesPayload.push({ r: m.r, c: m.c, color: m.color });
  }
  var boardPayload = [];
  var br;
  var bc;
  for (br = 0; br < app.SIZE; br++) {
    boardPayload[br] = board[br].slice();
  }

  function proceedToStudy() {
    app.stopReplayAuto();
    app.clearReplayControlPress();
    if (app.historyReplayOverlayVisible) {
      app.closeHistoryReplayOverlay();
    } else if (app.screen === 'replay') {
      app.replayBlackPieceSkinId = null;
      app.replayWhitePieceSkinId = null;
      app.replaySourceGameId = null;
      app.screen = 'game';
    }
    if (typeof app.startLocalReplayStudyPuzzle === 'function') {
      app.startLocalReplayStudyPuzzle(board, sideToMove);
    }
  }

  if (!authApi.getSessionToken || !authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '未登录，仅本地练习', icon: 'none' });
    }
    proceedToStudy();
    return;
  }

  var putBody = {
    moves: movesPayload,
    replayStep: stepN,
    board: boardPayload,
    sideToMove: sideToMove,
    blackPieceSkinId: fb,
    whitePieceSkinId: fw
  };
  if (gid != null && gid > 0) {
    putBody.sourceGameId = gid;
  }

  wx.request(
    Object.assign(roomApi.meReplayStudyPutOptions(putBody), {
      success: function(res) {
        if (res.statusCode !== 200 && res.statusCode !== 204) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: '云端存档失败 ' + (res.statusCode || ''),
              icon: 'none'
            });
          }
        }
        proceedToStudy();
      },
      fail: function() {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误，仅本地练习', icon: 'none' });
        }
        proceedToStudy();
      }
    })
  );
};

/**
 * 「复盘」药丸中心 Y：与底栏四键拉开间距（药丸高约 36）。
 */
app.getReplayStudyButtonY = function() {
  return app.getReplayControlsButtonY() - 54;
};

/** 全屏/弹层棋谱：「复盘」药丸点击区域（与绘制位置一致，与是否可点无关）。 */
app.hitReplayStudyButtonZone = function(clientX, clientY) {
  var studyY = app.getReplayStudyButtonY();
  return (
    Math.abs(clientX - app.W / 2) <= 72 &&
    Math.abs(clientY - studyY) <= 22
  );
};

app.hitReplayControl = function(clientX, clientY) {
  var btnY = app.getReplayControlsButtonY();
  var halfW = 46;
  var halfH = 24;
  if (app.hitReplayStudyButtonZone(clientX, clientY)) {
    return 'study';
  }
  var list = [
    { id: 'close', x: app.W * 0.18 },
    { id: 'prev', x: app.getReplayNavPrevCx() },
    { id: 'next', x: app.getReplayNavNextCx() },
    { id: 'auto', x: app.W * 0.82 }
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

/** 棋盘与棋谱控制条（全屏回放与战绩弹层共用，不含背景） */
app.drawReplayBoardLayer = function() {
  var th = app.getCurrentTheme();
  doodles.drawGameBoardCornerClouds(
    app.ctx,
    app.W,
    app.H,
    app.layout,
    app.sys.statusBarHeight || 0
  );
  render.drawBoard(app.ctx, app.layout, th);
  var rb = app.buildBoardFromMoves(app.replayMoves, app.replayStep);
  var rp = app.getReplayPiecePairThemes(th);
  render.drawPieces(app.ctx, rb, app.layout, rp.black, rp.white);
  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  app.ctx.shadowBlur = 6;
  app.ctx.shadowOffsetY = 1;
  var insetTop =
    app.layout && app.layout.insetTop != null
      ? app.layout.insetTop
      : typeof app.getGameScreenInsetTop === 'function'
        ? app.getGameScreenInsetTop()
        : Math.max(
            app.sys.statusBarHeight || 24,
            app.sys.safeArea && app.sys.safeArea.top != null
              ? app.sys.safeArea.top
              : 0
          );
  var replayTitleFs = 17;
  var titleCy = insetTop + replayTitleFs * 0.45;
  render.drawText(
    app.ctx,
    '团团五子棋',
    app.W / 2,
    titleCy,
    replayTitleFs,
    th.title
  );
  app.ctx.restore();
  var total = app.replayMoves.length;
  var btnY = app.getReplayControlsButtonY();
  var studyY = app.getReplayStudyButtonY();
  var studyOn = app.replayBoardHasAnyStone(rb);
  app.drawReplayToolbarButton('复盘', app.W / 2, studyY, studyOn, 'study');
  app.drawReplayToolbarButton('关闭', app.W * 0.18, btnY, true, 'close');
  app.drawReplayStepIconButton(
    app.getReplayNavPrevCx(),
    btnY,
    true,
    app.replayStep > 0,
    'prev'
  );
  app.drawReplayStepIconButton(
    app.getReplayNavNextCx(),
    btnY,
    false,
    app.replayStep < total,
    'next'
  );
  var autoOn = app.replayAutoTimerId != null;
  app.drawReplayToolbarButton(
    autoOn ? '暂停' : '自动',
    app.W * 0.82,
    btnY,
    total > 0,
    'auto'
  );
  app.drawThemeChrome(th);
}

app.drawReplay = function() {
  app.fillAmbientBackground();
  app.layout = app.computeLayout();
  app.drawReplayBoardLayer();
}

/** 战绩页：半透明遮罩 + 棋谱层（仍停留在 screen===history） */
app.drawHistoryReplayOverlay = function() {
  app.ctx.save();
  app.ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  app.ctx.fillRect(0, 0, app.W, app.H);
  app.ctx.restore();
  app.layout = app.computeLayout();
  app.drawReplayBoardLayer();
}

/* ---------- 绘制：各界面 ---------- */

app.stopHomeMascotAnimLoop = function() {
  if (app.homeMascotAnimTimer != null) {
    clearInterval(app.homeMascotAnimTimer);
    app.homeMascotAnimTimer = null;
  }
}

/** 仅雪碧图多帧时需要定时刷新；静态 PNG / 矢量吉祥物不启定时器 */
app.ensureHomeMascotAnimLoop = function() {
  if (
    app.screen !== 'home' ||
    app.ratingCardVisible ||
    app.checkinModalVisible ||
    app.pieceSkinModalVisible
  ) {
    app.stopHomeMascotAnimLoop();
    return;
  }
  var frames = app.MASCOT_SHEET_FRAME_COUNT || 0;
  if (frames <= 1) {
    app.stopHomeMascotAnimLoop();
    return;
  }
  var sheet = app.homeMascotSheetImg;
  if (!sheet || !sheet.width) {
    app.stopHomeMascotAnimLoop();
    return;
  }
  if (app.homeMascotAnimTimer != null) {
    return;
  }
  var interval = Math.max(
    28,
    Math.round(1000 / Math.max(1, app.MASCOT_SHEET_FPS))
  );
  app.homeMascotAnimTimer = setInterval(function () {
    if (
      app.screen !== 'home' ||
      app.ratingCardVisible ||
      app.checkinModalVisible ||
      app.pieceSkinModalVisible
    ) {
      app.stopHomeMascotAnimLoop();
      return;
    }
    app.draw();
  }, interval);
}

/** 管理员：顶栏下方左侧小按钮（图标），点击打开侧栏 */
app.getHomeDrawerTabLayout = function() {
  if (!app.userIsAdmin || app.screen !== 'home' || app.homeDrawerOpen) {
    return null;
  }
  var nav = app.getHomeNavBarLayout();
  var leftInset =
    app.sys.safeArea && app.sys.safeArea.left != null
      ? app.sys.safeArea.left
      : 0;
  var w = app.rpx(56);
  var h = app.rpx(56);
  var gap = app.rpx(12);
  var cx = leftInset + w * 0.5;
  var cy = nav.navBottom + gap + h * 0.5;
  return { cx: cx, cy: cy, w: w, h: h, leftInset: leftInset, navBottom: nav.navBottom };
};

/** 侧栏按钮：三道横线（汉堡图标） */
app.drawHomeDrawerTabIcon = function(cx, cy, color) {
  var lineW = app.rpx(22);
  var gap = app.rpx(6);
  var lw = Math.max(2, app.rpx(3));
  app.ctx.save();
  app.ctx.strokeStyle = color;
  app.ctx.lineWidth = lw;
  app.ctx.lineCap = 'round';
  var j;
  for (j = -1; j <= 1; j++) {
    app.ctx.beginPath();
    app.ctx.moveTo(cx - lineW * 0.5, cy + j * gap);
    app.ctx.lineTo(cx + lineW * 0.5, cy + j * gap);
    app.ctx.stroke();
  }
  app.ctx.restore();
};

app.drawHomeDrawerTab = function(th) {
  var L = app.getHomeDrawerTabLayout();
  if (!L) {
    return;
  }
  var leftInset = L.leftInset != null ? L.leftInset : 0;
  var cx0 = leftInset + L.w * 0.5;
  var cy0 = L.cy;
  var bw = L.w;
  var bh = L.h;
  var x0 = cx0 - bw / 2;
  var y0 = cy0 - bh / 2;
  var rr = app.rpx(14);
  var baseHex = th.btnGhostFill;
  var rgb = app.homePillHexToRgb(baseHex);
  var fillStyle;
  if (rgb) {
    var c0 = app.homePillMixRgb(rgb, 0.38, { r: 255, g: 255, b: 255 });
    var c1 = app.homePillMixRgb(rgb, 0.06, { r: 0, g: 0, b: 0 });
    var lg = app.ctx.createLinearGradient(x0, y0, x0, y0 + bh);
    lg.addColorStop(0, app.homePillRgbCss(c0));
    lg.addColorStop(1, app.homePillRgbCss(c1));
    fillStyle = lg;
  } else {
    fillStyle = baseHex;
  }
  app.ctx.save();
  if (app.homeDrawerTabPressed) {
    app.ctx.translate(cx0, cy0);
    app.ctx.scale(0.982, 0.982);
    app.ctx.translate(-cx0, -cy0);
    app.ctx.translate(0, app.rpx(2));
  }
  var blurBase = app.homeDrawerTabPressed
    ? Math.max(app.rpx(4), app.rpx(10) * 0.55)
    : app.rpx(10);
  var offY = app.homeDrawerTabPressed ? app.rpx(4) * 0.45 : app.rpx(4);
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.07)';
  app.ctx.shadowBlur = blurBase;
  app.ctx.shadowOffsetX = 0;
  app.ctx.shadowOffsetY = offY;
  app.ctx.fillStyle = fillStyle;
  app.roundRect(x0, y0, bw, bh, rr);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.save();
  app.roundRect(x0, y0, bw, bh, rr);
  app.ctx.clip();
  var gh = bh * 0.52;
  var gl = app.ctx.createLinearGradient(x0, y0, x0, y0 + gh);
  gl.addColorStop(0, 'rgba(255,255,255,0.5)');
  gl.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  app.ctx.fillStyle = gl;
  app.ctx.fillRect(x0, y0, bw, gh);
  app.ctx.restore();
  app.ctx.strokeStyle = th.btnGhostStroke;
  app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
  app.roundRect(x0, y0, bw, bh, rr);
  app.ctx.stroke();
  app.drawHomeDrawerTabIcon(cx0, cy0, th.btnGhostText);
  if (app.homeDrawerTabPressed) {
    app.ctx.save();
    app.roundRect(x0, y0, bw, bh, rr);
    app.ctx.clip();
    app.ctx.fillStyle = 'rgba(0, 0, 0, 0.11)';
    app.ctx.fillRect(x0, y0, bw, bh);
    app.ctx.restore();
  }
  app.ctx.restore();
};

app.hitHomeDrawerTab = function(clientX, clientY) {
  var L = app.getHomeDrawerTabLayout();
  if (!L) {
    return false;
  }
  var li = L.leftInset != null ? L.leftInset : 0;
  return (
    clientX >= li - app.rpx(6) &&
    clientX <= li + L.w + app.rpx(6) &&
    Math.abs(clientY - L.cy) <= L.h * 0.5 + app.rpx(8)
  );
};

app.drawHomeContentBelowPieceSkinModal = function() {
  var th = app.getCurrentTheme();
  app.fillHomeBackground(th);

  var hl = app.getHomeLayout();

  var mascotBox = app.rpx(200);
  var hasMascotMedia = app.hasHomeMascotMediaLoaded(mascotBox);
  if (hasMascotMedia) {
    app.ctx.save();
    app.ctx.globalAlpha = 1;
    var halo = app.ctx.createRadialGradient(
      hl.mascotCx,
      hl.mascotCy,
      0,
      hl.mascotCx,
      hl.mascotCy,
      app.rpx(150)
    );
    if (th.id === 'mint') {
      halo.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      halo.addColorStop(0.45, 'rgba(175, 232, 236, 0.26)');
      halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else if (th.id === 'ink') {
      halo.addColorStop(0, 'rgba(255, 252, 245, 0.42)');
      halo.addColorStop(0.5, 'rgba(255, 220, 185, 0.14)');
      halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
      halo.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      halo.addColorStop(0.5, 'rgba(255, 218, 190, 0.18)');
      halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }
    app.ctx.fillStyle = halo;
    app.ctx.fillRect(
      hl.mascotCx - app.rpx(200),
      hl.mascotCy - app.rpx(130),
      app.rpx(400),
      app.rpx(260)
    );
    app.ctx.restore();
  }

  app.drawHomeMascotAsset(hl.mascotCx, hl.mascotCy, mascotBox);

  app.drawHomeReferencePill(
    hl.cx,
    hl.yRandom,
    hl.btnW,
    hl.btnH,
    '随机匹配',
    'random',
    th,
    app.homePressedButton === 'random'
  );
  app.drawHomeReferencePill(
    hl.cx,
    hl.yFriend,
    hl.btnW,
    hl.btnH,
    '好友对战',
    'friend',
    th,
    app.homePressedButton === 'pvp'
  );
  app.drawHomeReferencePill(
    hl.cxPve,
    hl.yPvePair,
    hl.halfBtnW,
    hl.btnH,
    '人机对战',
    'pve',
    th,
    app.homePressedButton === 'pve'
  );
  app.drawHomeReferencePill(
    hl.cxDaily,
    hl.yPvePair,
    hl.halfBtnW,
    hl.btnH,
    '对局复盘',
    'daily',
    th,
    app.homePressedButton === 'daily'
  );

  app.drawHomeBottomDock(hl, th);
  app.drawHomeCopyrightBar(hl, th);
  app.drawHomeDrawer(th);
  app.drawHomeNavBar(th);
  app.drawHomeDrawerTab(th);
  app.drawThemeChrome(th);
  app.drawRatingCardOverlay(th);
  app.drawCheckinModalOverlay(th);
  if (typeof app.drawHomeFriendListFab === 'function') {
    app.drawHomeFriendListFab(th);
  }
}

app.drawHome = function() {
  var th = app.getCurrentTheme();
  app.drawHomeContentBelowPieceSkinModal();
  app.drawPieceSkinModalOverlay(th);
  if (typeof app.drawHomeFriendListOverlay === 'function') {
    app.drawHomeFriendListOverlay(th);
  }
};

app.drawMatching = function() {
  app.fillAmbientBackground();

  var th = app.getUiTheme();
  var M =
    typeof app.getMatchingPageLayout === 'function'
      ? app.getMatchingPageLayout()
      : {
          titleCx: app.W / 2,
          titleCy: app.H * 0.22,
          ySeek: app.H * 0.44,
          cancelCy: app.H * 0.68,
          insetTop: 0
        };
  doodles.drawMatchingDecoration(
    app.ctx,
    app.W,
    app.H,
    M.insetTop != null ? M.insetTop : 0
  );
  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  app.ctx.shadowBlur = 10;
  app.ctx.shadowOffsetY = 2;
  render.drawText(
    app.ctx,
    '随机匹配',
    M.titleCx,
    M.titleCy,
    30,
    th.title
  );
  app.ctx.restore();

  var msg = '正在为你寻找对手';
  var dots = '';
  var d;
  for (d = 0; d < app.matchingDots; d++) {
    dots += '·';
  }
  var ySeek = M.ySeek;
  if (th.pageIndicator && dots) {
    app.ctx.save();
    app.ctx.font =
      '15px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.textBaseline = 'middle';
    var wmsg = app.ctx.measureText(msg).width;
    var wdots = app.ctx.measureText(dots).width;
    var total = wmsg + wdots;
    var startX = M.titleCx - total / 2;
    app.ctx.textAlign = 'left';
    app.ctx.fillStyle = th.subtitle;
    app.ctx.fillText(msg, startX, ySeek);
    app.ctx.fillStyle = th.pageIndicator;
    app.ctx.fillText(dots, startX + wmsg, ySeek);
    app.ctx.restore();
  } else {
    render.drawText(app.ctx, msg + dots, M.titleCx, ySeek, 15, th.subtitle);
  }

  app.ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = th.muted;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(
    '取消',
    app.snapPx(M.titleCx),
    app.snapPx(M.cancelCy)
  );
}

app.getHistoryPageLayout = function() {
  var insetTop = Math.max(
    app.sys.statusBarHeight || 24,
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0
  );
  var padX = app.rpx(28);
  var backCy = insetTop + app.rpx(44);
  var backCx = app.rpx(44);
  var titleCy = backCy;
  var statsTop = titleCy + app.rpx(42);
  var statsH = app.rpx(124);
  var statsW = app.W - padX * 2;
  var statsX = padX;
  var tabY = statsTop + statsH + app.rpx(20);
  var tabH = app.rpx(58);
  var tabW = app.W - padX * 2;
  var listTop = tabY + tabH + app.rpx(18);
  var safeBottom =
    app.sys.safeArea && app.sys.safeArea.bottom != null ? app.sys.safeArea.bottom : app.H;
  var listBottom = safeBottom - app.rpx(12);
  var listH = Math.max(app.rpx(160), listBottom - listTop);
  return {
    insetTop: insetTop,
    padX: padX,
    backCx: backCx,
    backCy: backCy,
    titleCy: titleCy,
    statsX: statsX,
    statsTop: statsTop,
    statsW: statsW,
    statsH: statsH,
    tabX: padX,
    tabY: tabY,
    tabW: tabW,
    tabH: tabH,
    listTop: listTop,
    listBottom: listBottom,
    listH: listH
  };
}

/** 战绩列表可滚动高度（与 drawHistory 一致，含加载态） */
app.getHistoryListScrollMetrics = function() {
  var Lh = app.getHistoryPageLayout();
  var contentH;
  if (app.historyListLoading) {
    contentH = app.rpx(120);
  } else {
    var rows = app.getFilteredMatchHistory();
    var rowH = app.historyListRowHeightRpx();
    var rowGap = app.historyListRowGapRpx();
    contentH =
      rows.length === 0
        ? app.rpx(120)
        : rows.length * (rowH + rowGap) - rowGap + app.rpx(16);
  }
  return {
    contentH: contentH,
    maxScroll: Math.max(0, contentH - Lh.listH)
  };
}

/**
 * 战绩列表右侧滚动条（不进入列表 clip）。
 * 仿微信：仅圆角滑块、无轨道；拖动/惯性或静止后短时显示，静止约 HISTORY_SCROLLBAR_HOLD_MS 后消失。
 * 滑块位置对 historyScrollY 做插值，惯性时更丝滑。
 */
app.drawHistoryListScrollbar = function(L, maxScroll, contentH) {
  if (maxScroll <= 0 || contentH <= 0) {
    return;
  }
  var trackPadT = app.rpx(8);
  var trackPadB = app.rpx(8);
  var trackTop = L.listTop + trackPadT;
  var trackH = L.listH - trackPadT - trackPadB;
  if (trackH < app.rpx(48)) {
    return;
  }
  /** 宽度接近微信侧条（偏细） */
  var barW = app.rpx(5);
  var rCap = barW / 2;
  var inset = app.rpx(6);
  var cx = app.W - L.padX - inset - rCap;

  var viewRatio = L.listH / contentH;
  if (viewRatio > 1) {
    viewRatio = 1;
  }
  var thumbH = Math.max(app.rpx(40), trackH * viewRatio);
  if (thumbH > trackH) {
    thumbH = trackH;
  }
  var travel = Math.max(0, trackH - thumbH);
  var targetP = maxScroll > 0 ? app.historyScrollY / maxScroll : 0;
  if (targetP < 0) {
    targetP = 0;
  }
  if (targetP > 1) {
    targetP = 1;
  }
  var sm = app.historyScrollbarRatioSmooth;
  if (sm == null || typeof sm !== 'number' || isNaN(sm)) {
    sm = targetP;
  } else {
    var k =
      app.historyScrollTouchId != null
        ? 0.88
        : 0.42;
    sm += (targetP - sm) * k;
    if (Math.abs(targetP - sm) < 0.0015) {
      sm = targetP;
    }
  }
  app.historyScrollbarRatioSmooth = sm;
  var thumbTop = trackTop + sm * travel;

  var ctx = app.ctx;
  ctx.save();
  ctx.globalAlpha = 1;
  var thumbFill = 'rgba(0, 0, 0, 0.2)';
  if (typeof app.getUiTheme === 'function' && typeof app.historyPageUiFromTheme === 'function') {
    var thSb = app.getUiTheme();
    var HSb = app.historyPageUiFromTheme(thSb);
    if (HSb && HSb.scrollbar) {
      thumbFill = HSb.scrollbar;
    }
  }
  ctx.fillStyle = thumbFill;
  app.roundRect(cx - rCap, thumbTop, barW, thumbH, rCap);
  ctx.fill();
  ctx.restore();
}

app.clearHistoryScrollbarFadeTimer = function() {
  if (app.historyScrollbarFadeTimerId != null) {
    try {
      clearTimeout(app.historyScrollbarFadeTimerId);
    } catch (eSb) {}
    app.historyScrollbarFadeTimerId = null;
  }
};

/** 列表已静止：约 HISTORY_SCROLLBAR_HOLD_MS 后再 draw，用于去掉滚动条 */
app.scheduleHistoryScrollbarFadeRedraw = function() {
  app.clearHistoryScrollbarFadeTimer();
  if (typeof setTimeout === 'undefined') {
    return;
  }
  var hold =
    app.HISTORY_SCROLLBAR_HOLD_MS != null ? app.HISTORY_SCROLLBAR_HOLD_MS : 1000;
  app.historyScrollbarFadeTimerId = setTimeout(function() {
    app.historyScrollbarFadeTimerId = null;
    if (app.screen === 'history') {
      app.draw();
    }
  }, hold);
};

app.stopHistoryMomentum = function() {
  app.clearHistoryScrollbarFadeTimer();
  if (app.historyMomentumRafId != null) {
    app.themeBubbleCaf(app.historyMomentumRafId);
    app.historyMomentumRafId = null;
  }
  app.historyScrollVel = 0;
  app.historyMomentumLastTs = 0;
}

/** 战绩列表惯性帧：指数减速，触边停住 */
app.tickHistoryScrollMomentum = function() {
  if (app.screen !== 'history' || app.historyListLoading || app.historyTabLoading) {
    app.stopHistoryMomentum();
    return;
  }
  var now = Date.now();
  var dt = Math.min(36, Math.max(5, now - app.historyMomentumLastTs));
  app.historyMomentumLastTs = now;
  var sm = app.getHistoryListScrollMetrics();
  var maxScroll = sm.maxScroll;
  var nextY = app.historyScrollY + app.historyScrollVel * dt;
  if (nextY <= 0) {
    app.historyScrollY = 0;
    app.historyScrollVel = 0;
  } else if (nextY >= maxScroll) {
    app.historyScrollY = maxScroll;
    app.historyScrollVel = 0;
  } else {
    app.historyScrollY = nextY;
  }
  app.historyScrollVel *= Math.exp(-dt / 240);
  if (typeof app.maybeFetchHistoryAppend === 'function') {
    app.maybeFetchHistoryAppend();
  }
  app.draw();
  if (Math.abs(app.historyScrollVel) < 0.014) {
    app.stopHistoryMomentum();
    app.scheduleHistoryScrollbarFadeRedraw();
    return;
  }
  app.historyMomentumRafId = app.themeBubbleRaf(app.tickHistoryScrollMomentum);
}

app.hitHistoryInteract = function(clientX, clientY) {
  var L = app.getHistoryPageLayout();
  if (
    Math.abs(clientX - L.backCx) <= app.rpx(40) &&
    Math.abs(clientY - L.backCy) <= app.rpx(40)
  ) {
    return 'back';
  }
  if (
    clientX >= L.tabX &&
    clientX <= L.tabX + L.tabW &&
    clientY >= L.tabY &&
    clientY <= L.tabY + L.tabH
  ) {
    var rel = (clientX - L.tabX) / L.tabW;
    var ti = Math.floor(rel * 3);
    if (ti < 0) {
      ti = 0;
    }
    if (ti > 2) {
      ti = 2;
    }
    return 'tab' + ti;
  }
  return null;
}

app.hitHistoryListZone = function(clientX, clientY) {
  var L = app.getHistoryPageLayout();
  return (
    clientX >= L.padX &&
    clientX <= app.W - L.padX &&
    clientY >= L.listTop &&
    clientY <= L.listBottom
  );
}

/** 命中某行对手头像圆内则返回 opponentUserId，否则 null（仅服务端联机行且 id>0） */
app.hitHistoryRowOpponentAvatar = function(clientX, clientY) {
  if (app.historyListLoading) {
    return null;
  }
  var L = app.getHistoryPageLayout();
  if (
    clientX < L.padX ||
    clientX > app.W - L.padX ||
    clientY < L.listTop ||
    clientY > L.listBottom
  ) {
    return null;
  }
  var rows = app.getFilteredMatchHistory();
  var rowH = app.historyListRowHeightRpx();
  var rowGap = app.historyListRowGapRpx();
  var innerPad = app.rpx(24);
  var avR = app.rpx(24);
  var yBase = L.listTop - app.historyScrollY;
  var ri;
  for (ri = 0; ri < rows.length; ri++) {
    var rec = rows[ri];
    var ry = yBase + ri * (rowH + rowGap);
    if (ry + rowH < L.listTop - 2 || ry > L.listBottom + 2) {
      continue;
    }
    var line1Y = ry + rowH * 0.5;
    var avCx = L.padX + innerPad + avR;
    var avCy = line1Y;
    var dx = clientX - avCx;
    var dy = clientY - avCy;
    var hitR = avR + app.rpx(28);
    if (dx * dx + dy * dy <= hitR * hitR) {
      if (rec.mode === 'server' && rec.oppUserId > 0) {
        return rec.oppUserId;
      }
      return null;
    }
  }
  return null;
}

/**
 * 战绩行右侧回放图标命中（仅服务端行且含有效 gameId 时绘制/可点）。
 */
app.hitHistoryRowReplayIcon = function(clientX, clientY) {
  if (app.historyListLoading) {
    return null;
  }
  var L = app.getHistoryPageLayout();
  if (
    clientX < L.padX ||
    clientX > app.W - L.padX ||
    clientY < L.listTop ||
    clientY > L.listBottom
  ) {
    return null;
  }
  var rows = app.getFilteredMatchHistory();
  var rowH = app.historyListRowHeightRpx();
  var rowGap = app.historyListRowGapRpx();
  var innerPad = app.rpx(24);
  var rw = app.W - L.padX * 2;
  var rx = L.padX;
  var yBase = L.listTop - app.historyScrollY;
  var visR = app.rpx(20);
  var hitExtra = app.rpx(14);
  var hitR = visR + hitExtra;
  var ri;
  for (ri = 0; ri < rows.length; ri++) {
    var rec = rows[ri];
    if (!rec || rec.mode !== 'server') {
      continue;
    }
    var gid = rec.gameId;
    var gidN =
      typeof gid === 'number' && !isNaN(gid)
        ? gid
        : parseInt(String(gid != null ? gid : ''), 10);
    if (!gidN || gidN <= 0) {
      continue;
    }
    var ry = yBase + ri * (rowH + rowGap);
    if (ry + rowH < L.listTop - 2 || ry > L.listBottom + 2) {
      continue;
    }
    var line1Y = ry + rowH * 0.5;
    var replayCx = rx + rw - innerPad - visR;
    var dx = clientX - replayCx;
    var dy = clientY - line1Y;
    if (dx * dx + dy * dy <= hitR * hitR) {
      return rec;
    }
  }
  return null;
}

app.openHistoryReplayForRecord = function(rec) {
  if (!rec || rec.mode !== 'server') {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '暂无棋谱', icon: 'none' });
    }
    return;
  }
  var gid = rec.gameId;
  var gidN =
    typeof gid === 'number' && !isNaN(gid)
      ? gid
      : parseInt(String(gid != null ? gid : ''), 10);
  if (!gidN || gidN <= 0) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '暂无棋谱', icon: 'none' });
    }
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
    return;
  }
  if (typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载棋谱…', mask: true });
  }
  wx.request(
    Object.assign(roomApi.gameReplayByIdOptions(gidN), {
      success: function (res) {
        if (typeof wx.hideLoading === 'function') {
          try {
            wx.hideLoading();
          } catch (eH) {}
        }
        if (res.statusCode === 200 && res.data && res.data.moves) {
          var gidH =
            res.data.gameId != null ? Number(res.data.gameId) : gidN;
          app.openHistoryReplayOverlay(
            res.data.moves,
            res.data.blackPieceSkinId,
            res.data.whitePieceSkinId,
            !isNaN(gidH) && gidH > 0 ? gidH : gidN
          );
        } else {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '暂无棋谱', icon: 'none' });
          }
        }
      },
      fail: function () {
        if (typeof wx.hideLoading === 'function') {
          try {
            wx.hideLoading();
          } catch (eH2) {}
        }
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    })
  );
}

app.hideHistoryNativeLoading = function() {
  if (typeof wx.hideLoading === 'function') {
    try {
      wx.hideLoading();
    } catch (e1) {}
  }
}

/**
 * 每页条数：按战绩页列表可视高度与行高估算，并限制在服务端上限内。
 */
app.computeHistoryListLimit = function() {
  if (
    typeof app.getHistoryPageLayout !== 'function' ||
    typeof app.historyListRowHeightRpx !== 'function'
  ) {
    return 30;
  }
  var Lh = app.getHistoryPageLayout();
  var rowH = app.historyListRowHeightRpx();
  var rowGap = app.historyListRowGapRpx
    ? app.historyListRowGapRpx()
    : app.rpx(9);
  var unit = rowH + rowGap;
  if (unit < 1) {
    unit = 1;
  }
  /** 可视行数 + 1 行余量（部分行在裁切区时仍触发加载） */
  var n = Math.floor(Lh.listH / unit) + 1;
  if (n < 5) {
    n = 5;
  }
  if (n > 100) {
    n = 100;
  }
  return n;
}

/**
 * 触底或首屏未填满时加载下一页（与 offset=historyServerItems.length 配合）。
 */
app.fetchHistoryListAppend = function() {
  if (!authApi.getSessionToken || !authApi.getSessionToken()) {
    return;
  }
  if (app.historyListLoading || app.historyTabLoading) {
    return;
  }
  if (app.historyListLoadingMore) {
    return;
  }
  if (!app.historyListHasMore) {
    return;
  }
  var rf = null;
  if (app.historyFilterTab === 1) {
    rf = 'WIN';
  } else if (app.historyFilterTab === 2) {
    rf = 'LOSS';
  }
  var limit = app.computeHistoryListLimit();
  var offset = app.historyServerItems.length;
  app.historyListLoadingMore = true;
  app.draw();
  if (typeof wx === 'undefined' || !wx.request) {
    app.historyListLoadingMore = false;
    return;
  }
  wx.request(
    Object.assign(roomApi.meGameHistoryOptions(limit, offset, rf), {
      complete: function() {
        app.historyListLoadingMore = false;
        app.draw();
      },
      success: function(res) {
        if (res.statusCode === 200 && res.data) {
          var body = res.data;
          if (body && typeof body === 'string') {
            try {
              body = JSON.parse(body);
            } catch (eH) {
              body = null;
            }
          }
          if (body && Array.isArray(body.items)) {
            var prev = app.historyServerItems || [];
            app.historyServerItems = prev.concat(body.items);
            if (typeof body.hasMore === 'boolean') {
              app.historyListHasMore = body.hasMore;
            } else {
              app.historyListHasMore = body.items.length >= limit;
            }
            /** 首屏内容仍不足一屏且仍有更多：继续补页 */
            setTimeout(function() {
              if (!app.historyListHasMore || app.screen !== 'history') {
                return;
              }
              var sm = app.getHistoryListScrollMetrics();
              if (sm.maxScroll <= app.rpx(4)) {
                app.fetchHistoryListAppend();
              }
            }, 0);
          }
        }
      },
      fail: function() {}
    })
  );
}

/**
 * 列表滚至底部附近时拉取下一页。
 */
app.maybeFetchHistoryAppend = function() {
  if (app.screen !== 'history') {
    return;
  }
  if (app.historyListLoading || app.historyTabLoading || app.historyListLoadingMore) {
    return;
  }
  if (!app.historyListHasMore) {
    return;
  }
  if (!authApi.getSessionToken || !authApi.getSessionToken()) {
    return;
  }
  var sm = app.getHistoryListScrollMetrics();
  var threshold = app.rpx(100);
  var rem = sm.maxScroll - app.historyScrollY;
  if (rem <= threshold) {
    app.fetchHistoryListAppend();
  }
}

/**
 * 按当前 historyFilterTab 请求 /api/me/game-history（全部不传 result，胜利/失败传 WIN|LOSS）。
 */
app.fetchHistoryListForCurrentFilter = function() {
  if (!authApi.getSessionToken || !authApi.getSessionToken()) {
    app.historyTabLoading = false;
    app.draw();
    return;
  }
  var rf = null;
  if (app.historyFilterTab === 1) {
    rf = 'WIN';
  } else if (app.historyFilterTab === 2) {
    rf = 'LOSS';
  }
  app.historyTabLoading = true;
  app.historyListHasMore = false;
  app.draw();
  if (typeof wx === 'undefined' || !wx.request) {
    app.historyTabLoading = false;
    app.draw();
    return;
  }
  var limit = app.computeHistoryListLimit();
  wx.request(
    Object.assign(roomApi.meGameHistoryOptions(limit, 0, rf), {
      complete: function() {
        app.historyTabLoading = false;
        app.draw();
      },
      success: function(res) {
        app.historyServerItems = [];
        if (res.statusCode === 200 && res.data) {
          var body = res.data;
          if (body && typeof body === 'string') {
            try {
              body = JSON.parse(body);
            } catch (eH) {
              body = null;
            }
          }
          if (body && Array.isArray(body.items)) {
            app.historyServerItems = body.items;
            if (typeof body.hasMore === 'boolean') {
              app.historyListHasMore = body.hasMore;
            } else {
              app.historyListHasMore = body.items.length >= limit;
            }
            setTimeout(function() {
              if (!app.historyListHasMore || app.screen !== 'history') {
                return;
              }
              var sm = app.getHistoryListScrollMetrics();
              if (sm.maxScroll <= app.rpx(4)) {
                app.fetchHistoryListAppend();
              }
            }, 0);
          }
        }
      },
      fail: function() {
        app.historyServerItems = [];
        app.historyListHasMore = false;
      }
    })
  );
}

app.openHistoryScreen = function() {
  app.historyReplayOverlayVisible = false;
  app.stopReplayAuto();
  app.clearReplayControlPress();
  app.historyReplayTouchRec = null;
  app.historyReplayTouchId = null;
  app.stopHistoryMomentum();
  app.historyScrollbarLastScrollTs = 0;
  app.historyScrollY = 0;
  app.historyFilterTab = 0;
  app.loadMatchHistoryList();
  app.loadPeakEloFromStorage();
  app.historyStatsSnapshot = null;
  app.historyServerItems = [];
  app.historyListHasMore = false;
  app.historyListLoadingMore = false;
  app.screen = 'history';
  app.historyLoadStartTs = 0;
  var hadToken = !!authApi.getSessionToken();
  app.historyListLoading = hadToken;
  if (hadToken && typeof wx.showLoading === 'function') {
    try {
      wx.showLoading({ title: '加载中…', mask: true });
    } catch (e0) {}
  }
  app.draw();
  authApi.ensureSession(function (sessOk) {
    if (!sessOk || !authApi.getSessionToken()) {
      app.historyListLoading = false;
      app.hideHistoryNativeLoading();
      app.draw();
      return;
    }
    app.historyListLoading = true;
    app.historyLoadStartTs = Date.now();
    if (typeof wx.showLoading === 'function') {
      try {
        wx.showLoading({ title: '加载中…', mask: true });
      } catch (eShow) {}
    }
    app.draw();
    var pending = 2;
    /** 最短展示加载态时间（仅避免闪一下）；过大会拖慢体感 */
    var minLoadDisplayMs = 120;
    function doneFetch() {
      pending--;
      if (pending > 0) {
        return;
      }
      var finish = function () {
        app.historyListLoading = false;
        app.hideHistoryNativeLoading();
        app.draw();
      };
      var elapsed = app.historyLoadStartTs ? Date.now() - app.historyLoadStartTs : minLoadDisplayMs;
      if (elapsed < minLoadDisplayMs) {
        setTimeout(finish, minLoadDisplayMs - elapsed);
      } else {
        finish();
      }
    }
    wx.request(
      Object.assign(roomApi.meRatingOptions(), {
        complete: function () {
          doneFetch();
        },
        success: function (res) {
          if (res.statusCode === 200 && res.data) {
            var d = res.data;
            if (d && typeof d === 'string') {
              try {
                d = JSON.parse(d);
              } catch (eParse) {
                d = null;
              }
            }
            if (d) {
              app.syncCheckinStateFromServerPayload(d);
              app.applyMyGenderFromRatingPayload(d);
              var elo = typeof d.eloScore === 'number' ? d.eloScore : 0;
              app.savePeakEloIfHigher(elo);
              var total = typeof d.totalGames === 'number' ? d.totalGames : 0;
              var win = typeof d.winCount === 'number' ? d.winCount : 0;
              var winPct =
                total <= 0
                  ? '—'
                  : String(Math.round((win * 1000) / total) / 10) + '%';
              var peakE = app.historyPeakEloCached > 0 ? app.historyPeakEloCached : elo;
              var peakRt = ratingTitle.getRankAndTitleByElo(peakE);
              app.historyStatsSnapshot = {
                totalGames: total,
                winPct: winPct,
                peakRankLabel: peakRt.rankLabel
              };
            }
          }
        },
        fail: function () {}
      })
    );
    var lim0 = app.computeHistoryListLimit();
    wx.request(
      Object.assign(roomApi.meGameHistoryOptions(lim0, 0), {
        complete: function () {
          doneFetch();
        },
        success: function (res) {
          app.historyServerItems = [];
          app.historyListHasMore = false;
          if (res.statusCode === 200 && res.data) {
            var body = res.data;
            if (body && typeof body === 'string') {
              try {
                body = JSON.parse(body);
              } catch (eH) {
                body = null;
              }
            }
            if (body && Array.isArray(body.items)) {
              app.historyServerItems = body.items;
              if (typeof body.hasMore === 'boolean') {
                app.historyListHasMore = body.hasMore;
              } else {
                app.historyListHasMore = body.items.length >= lim0;
              }
              setTimeout(function () {
                if (!app.historyListHasMore || app.screen !== 'history') {
                  return;
                }
                var sm0 = app.getHistoryListScrollMetrics();
                if (sm0.maxScroll <= app.rpx(4)) {
                  app.fetchHistoryListAppend();
                }
              }, 0);
            }
          }
        },
        fail: function () {
          app.historyServerItems = [];
          app.historyListHasMore = false;
        }
      })
    );
  });
}

/**
 * 首页「对局复盘」：拉取云端存档后进入独立全屏页 {@link #drawReviewHubScreen}。
 */
app.openGameReviewEntry = function() {
  authApi.ensureSession(function(sessOk) {
    if (!sessOk || !authApi.getSessionToken()) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '请先登录', icon: 'none' });
      }
      return;
    }
    if (typeof wx.showLoading === 'function') {
      wx.showLoading({ title: '加载…', mask: true });
    }
    wx.request(
      Object.assign(roomApi.meReplayStudyGetOptions(), {
        complete: function() {
          if (typeof wx.hideLoading === 'function') {
            try {
              wx.hideLoading();
            } catch (eL) {}
          }
        },
        success: function(res) {
          var d = res.data;
          if (res.statusCode === 401) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '请先登录', icon: 'none' });
            }
            return;
          }
          if (res.statusCode !== 200 || !d) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '加载失败', icon: 'none' });
            }
            return;
          }
          app.reviewHubData = d;
          app.screen = 'review_hub';
          app.draw();
        },
        fail: function() {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        }
      })
    );
  });
};

/**
 * 与 {@link #getPveColorLayout} 同一套纵向比例：标题 0.18、副标题 0.26、主卡片 0.40 / 0.52、返回 0.66；
 * 三颗主按钮时第三颗与第二颗间距同黑白间距，返回略下移以免与卡片重叠。
 */
app.getReviewHubLayout = function() {
  var cl = app.getPveColorLayout();
  var hasData = !!(app.reviewHubData && app.reviewHubData.hasData);
  var step = cl.yWhite - cl.yBlack;
  var yThird = cl.yWhite + step;
  return {
    btnW: cl.btnW,
    btnH: cl.btnH,
    cx: cl.cx,
    hasData: hasData,
    yContinue: hasData ? cl.yBlack : null,
    yHistory: hasData ? cl.yWhite : cl.yBlack,
    yClear: hasData ? yThird : null,
    backY: hasData ? app.H * 0.72 : cl.backY
  };
};

app.hitReviewHubButton = function(clientX, clientY) {
  var L = app.getReviewHubLayout();
  var bw = L.btnW / 2 + 12;
  var bh = L.btnH / 2 + 12;
  if (
    Math.abs(clientX - L.cx) <= 90 &&
    Math.abs(clientY - L.backY) <= 24
  ) {
    return 'back';
  }
  if (L.hasData && L.yContinue != null) {
    if (
      Math.abs(clientX - L.cx) <= bw &&
      Math.abs(clientY - L.yContinue) <= bh
    ) {
      return 'continue';
    }
  }
  if (Math.abs(clientX - L.cx) <= bw && Math.abs(clientY - L.yHistory) <= bh) {
    return 'history';
  }
  if (L.hasData && L.yClear != null) {
    if (
      Math.abs(clientX - L.cx) <= bw &&
      Math.abs(clientY - L.yClear) <= bh
    ) {
      return 'clear';
    }
  }
  return null;
};

app.handleReviewHubTouchStart = function(clientX, clientY) {
  var h = app.hitReviewHubButton(clientX, clientY);
  if (h === 'back') {
    app.reviewHubData = null;
    app.screen = 'home';
    app.draw();
    return;
  }
  if (h === 'continue' && app.reviewHubData && app.reviewHubData.hasData) {
    var dCont = app.reviewHubData;
    app.reviewHubData = null;
    app.screen = 'home';
    if (typeof app.startLocalReplayStudyPuzzle === 'function') {
      app.startLocalReplayStudyPuzzle(dCont.board, dCont.sideToMove);
    }
    return;
  }
  if (h === 'history') {
    app.reviewHubData = null;
    app.openHistoryScreen();
    return;
  }
  if (h === 'clear' && app.reviewHubData && app.reviewHubData.hasData) {
    wx.request(
      Object.assign(roomApi.meReplayStudyDeleteOptions(), {
        success: function(resDel) {
          if (resDel.statusCode === 204 || resDel.statusCode === 200) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '已清除', icon: 'none' });
            }
            if (app.reviewHubData) {
              app.reviewHubData.hasData = false;
            }
            app.draw();
          } else if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        },
        fail: function() {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        }
      })
    );
  }
};

app.drawReviewHubScreen = function() {
  app.fillAmbientBackground();

  var L = app.getReviewHubLayout();
  var th = app.getCurrentTheme();
  var cards = th.homeCards || ['#5a7a8c', '#8b6b7a'];
  var card0 = cards[0];
  var card1 = cards.length > 1 ? cards[1] : card0;

  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  app.ctx.shadowBlur = 10;
  app.ctx.shadowOffsetY = 2;
  render.drawText(app.ctx, '对局复盘', app.W / 2, app.H * 0.18, 30, th.title);
  app.ctx.restore();

  var subMsg = L.hasData
    ? '已保存最近一次从棋谱载入的练习局面'
    : '暂无云端存档，可从战绩载入棋谱';
  render.drawText(app.ctx, subMsg, app.W / 2, app.H * 0.26, 15, th.subtitle);

  if (L.hasData && L.yContinue != null) {
    app.drawMacaronCard(
      '继续上次复盘',
      L.cx,
      L.yContinue,
      L.btnW,
      L.btnH,
      card0,
      false,
      'bear'
    );
  }
  app.drawMacaronCard(
    '从战绩选择棋谱',
    L.cx,
    L.yHistory,
    L.btnW,
    L.btnH,
    L.hasData ? card1 : card0,
    false,
    L.hasData ? 'heart' : 'bear'
  );
  if (L.hasData && L.yClear != null) {
    var clearFill =
      cards.length > 2 ? cards[2] : 'rgba(120, 110, 100, 0.92)';
    app.drawMacaronCard(
      '清除云端复盘存档',
      L.cx,
      L.yClear,
      L.btnW,
      L.btnH,
      clearFill,
      false,
      null
    );
  }

  app.ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = th.muted;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('返回', app.snapPx(L.cx), app.snapPx(L.backY));
  app.drawThemeChrome(th);
};

/**
 * 我的战绩：羊皮纸叠层、统计卡、筛选胶囊、对局列表（随当前界面风格）
 */
app.drawHistory = function() {
  app.fillAmbientBackground();
  var th = app.getUiTheme();
  var H =
    typeof app.historyPageUiFromTheme === 'function'
      ? app.historyPageUiFromTheme(th)
      : null;
  var L = app.getHistoryPageLayout();
  var accentBrown =
    H && H.tabActive ? H.tabActive : th.homeFriend != null ? th.homeFriend : '#7b5e3f';
  var tabBg =
    H && H.tabBg ? H.tabBg : 'rgba(255, 252, 246, 0.97)';
  var ink = th.title;
  var sub = th.subtitle;
  var muted = th.muted;
  var winGold = H && H.win ? H.win : '#a67c3d';
  var loseRose = H && H.lose ? H.lose : '#b06060';
  var drawTint = H && H.draw ? H.draw : sub;

  app.ctx.save();
  app.ctx.fillStyle = H ? H.parchmentTint : '#fdf5e6';
  app.ctx.globalAlpha = H ? 1 : 0.32;
  app.ctx.fillRect(0, 0, app.W, app.H);
  app.ctx.globalAlpha = 1;
  app.ctx.restore();

  app.ctx.save();
  app.ctx.strokeStyle = sub;
  app.ctx.lineWidth = Math.max(1.2, app.rpx(2));
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  var bx = L.backCx - app.rpx(8);
  var by = L.backCy;
  app.ctx.beginPath();
  app.ctx.moveTo(bx + app.rpx(10), by - app.rpx(12));
  app.ctx.lineTo(bx - app.rpx(2), by);
  app.ctx.lineTo(bx + app.rpx(10), by + app.rpx(12));
  app.ctx.stroke();
  app.ctx.restore();

  app.ctx.save();
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    '700 ' +
    app.rpx(34) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ink;
  var titleCx = app.W * 0.5;
  if (
    app.sys.safeArea &&
    app.sys.safeArea.width != null &&
    app.sys.safeArea.left != null
  ) {
    titleCx = app.sys.safeArea.left + app.sys.safeArea.width * 0.5;
  }
  app.ctx.fillText('我的战绩', app.snapPx(titleCx), app.snapPx(L.titleCy));
  app.ctx.restore();

  var sx = L.statsX;
  var sy = L.statsTop;
  var sw = L.statsW;
  var sh = L.statsH;
  var sr = app.rpx(20);
  app.ctx.save();
  app.ctx.shadowColor = H ? H.statShadow : 'rgba(60, 48, 38, 0.08)';
  app.ctx.shadowBlur = app.rpx(10);
  app.ctx.shadowOffsetY = app.rpx(3);
  var statG = app.ctx.createLinearGradient(sx, sy, sx, sy + sh);
  statG.addColorStop(0, H ? H.statG0 : '#fff9f0');
  statG.addColorStop(1, H ? H.statG1 : '#fff3e4');
  app.ctx.fillStyle = statG;
  app.roundRect(sx, sy, sw, sh, sr);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.strokeStyle = H ? H.statStroke : 'rgba(92, 75, 58, 0.14)';
  app.ctx.lineWidth = Math.max(1, app.rpx(1));
  app.roundRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, sr - 0.5);
  app.ctx.stroke();

  var totalStr = '—';
  var winStr = '—';
  var peakStr = '—';
  if (app.historyStatsSnapshot) {
    totalStr = String(app.historyStatsSnapshot.totalGames);
    winStr = app.historyStatsSnapshot.winPct;
    peakStr = app.historyStatsSnapshot.peakRankLabel;
  }
  var col1 = sx + sw / 6;
  var col2 = sx + sw / 2;
  var col3 = sx + (5 * sw) / 6;
  var labY = sy + sh * 0.34;
  var valY = sy + sh * 0.66;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    app.rpx(22) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = muted;
  app.ctx.fillText('总场次', app.snapPx(col1), app.snapPx(labY));
  app.ctx.fillText('胜率', app.snapPx(col2), app.snapPx(labY));
  app.ctx.fillText('最高段位', app.snapPx(col3), app.snapPx(labY));
  app.ctx.font =
    '600 ' +
    app.rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ink;
  app.ctx.fillText(totalStr, app.snapPx(col1), app.snapPx(valY));
  app.ctx.fillText(winStr, app.snapPx(col2), app.snapPx(valY));
  var peakFs = app.rpx(30);
  var peakMaxW = sw / 3 - app.rpx(20);
  var peakFace =
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  while (peakFs >= app.rpx(20)) {
    app.ctx.font = '600 ' + peakFs + peakFace;
    if (app.ctx.measureText(peakStr).width <= peakMaxW) {
      break;
    }
    peakFs -= 1;
  }
  app.ctx.fillText(peakStr, app.snapPx(col3), app.snapPx(valY));

  var divTop = sy + sh * 0.2;
  var divBot = sy + sh * 0.8;
  app.ctx.strokeStyle = H ? H.statDivider : 'rgba(92, 75, 58, 0.12)';
  app.ctx.lineWidth = 1;
  var dx;
  for (dx = 1; dx <= 2; dx++) {
    app.ctx.beginPath();
    app.ctx.moveTo(sx + (dx * sw) / 3 - 0.5, divTop);
    app.ctx.lineTo(sx + (dx * sw) / 3 - 0.5, divBot);
    app.ctx.stroke();
  }
  app.ctx.restore();

  var tx = L.tabX;
  var ty = L.tabY;
  var tw = L.tabW;
  var thh = L.tabH;
  var tr = thh / 2;
  var tabAreaW = tw;
  app.ctx.save();
  app.ctx.fillStyle = tabBg;
  app.roundRect(tx, ty, tw, thh, tr);
  app.ctx.fill();
  app.ctx.strokeStyle = H ? H.tabBorder : 'rgba(92, 75, 58, 0.1)';
  app.ctx.lineWidth = 1;
  app.roundRect(tx + 0.5, ty + 0.5, tw - 1, thh - 1, tr - 0.5);
  app.ctx.stroke();
  app.ctx.save();
  app.roundRect(tx, ty, tw, thh, tr);
  app.ctx.clip();
  var tabSheen = app.ctx.createLinearGradient(tx, ty, tx, ty + thh * 0.55);
  tabSheen.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  tabSheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
  tabSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  app.ctx.fillStyle = tabSheen;
  app.ctx.fillRect(tx, ty, tw, thh);
  app.ctx.restore();

  var labels = ['全部', '胜利', '失败'];
  var slotW = tabAreaW / 3;
  var phPad = app.rpx(5);
  var pvPad = app.rpx(6);
  var ti;
  for (ti = 0; ti < 3; ti++) {
    var tcx = tx + (ti + 0.5) * slotW;
    var slotL = tx + ti * slotW;
    var active = app.historyFilterTab === ti;
    if (active) {
      var pillX = slotL + phPad;
      var pillY = ty + pvPad;
      var pillW = slotW - phPad * 2;
      var pillH = thh - pvPad * 2;
      var pr = pillH / 2;
      app.ctx.save();
      app.ctx.fillStyle = H && H.tabActive ? H.tabActive : accentBrown;
      app.ctx.globalAlpha = 0.22;
      app.roundRect(pillX, pillY, pillW, pillH, pr);
      app.ctx.fill();
      app.ctx.globalAlpha = 0.45;
      app.ctx.strokeStyle = H && H.tabActive ? H.tabActive : accentBrown;
      app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
      app.roundRect(pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1, pr - 0.5);
      app.ctx.stroke();
      app.ctx.restore();
    }
    app.ctx.font =
      '600 ' +
      app.rpx(28) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.fillStyle = active
      ? H && H.tabTextActive
        ? H.tabTextActive
        : accentBrown
      : sub;
    app.ctx.globalAlpha = active ? 1 : 0.78;
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(labels[ti], app.snapPx(tcx), app.snapPx(ty + thh * 0.5));
    app.ctx.globalAlpha = 1;
  }

  app.ctx.restore();

  var rows = app.getFilteredMatchHistory();
  var rowH = app.historyListRowHeightRpx();
  var rowGap = app.historyListRowGapRpx();
  var innerPad = app.rpx(24);
  var cardR = app.rpx(18);
  var scrollM = app.getHistoryListScrollMetrics();
  var contentH = scrollM.contentH;
  var maxScroll = scrollM.maxScroll;
  if (app.historyScrollY > maxScroll) {
    app.historyScrollY = maxScroll;
  }
  if (app.historyScrollY < 0) {
    app.historyScrollY = 0;
  }

  app.ctx.save();
  app.ctx.beginPath();
  app.ctx.rect(L.padX, L.listTop, app.W - L.padX * 2, L.listH);
  app.ctx.clip();

  var yBase = L.listTop - app.historyScrollY;
  if (app.historyListLoading || app.historyTabLoading) {
    var lx = L.padX;
    var lw = app.W - L.padX * 2;
    var lh = L.listH;
    var ly = L.listTop;
    app.ctx.fillStyle = H ? H.loadVeil : 'rgba(55, 42, 32, 0.22)';
    app.ctx.fillRect(lx, ly, lw, lh);
    app.ctx.fillStyle = H ? H.loadPanel : 'rgba(255, 252, 248, 0.88)';
    app.ctx.fillRect(lx, ly, lw, lh);
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.font =
      '600 ' +
      app.rpx(30) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.fillStyle = H ? H.loadTitle : 'rgba(62, 48, 36, 0.92)';
    app.ctx.fillText(
      '加载中…',
      app.snapPx(app.W * 0.5),
      app.snapPx(ly + lh * 0.44)
    );
    app.ctx.font =
      app.rpx(22) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.fillStyle = H ? H.loadSub : 'rgba(92, 78, 68, 0.72)';
    app.ctx.fillText(
      '正在同步服务端战绩',
      app.snapPx(app.W * 0.5),
      app.snapPx(ly + lh * 0.58)
    );
  } else if (rows.length === 0) {
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.font =
      app.rpx(26) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.fillStyle = muted;
    app.ctx.fillText(
      '暂无对局记录',
      app.snapPx(app.W * 0.5),
      app.snapPx(L.listTop + L.listH * 0.38)
    );
    app.ctx.font = app.rpx(22) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.fillStyle = H ? H.emptySub : 'rgba(92, 78, 68, 0.55)';
    app.ctx.globalAlpha = H ? 0.72 : 1;
    app.ctx.fillText(
      '完成联机或人机对局后将显示在此',
      app.snapPx(app.W * 0.5),
      app.snapPx(L.listTop + L.listH * 0.55)
    );
    app.ctx.globalAlpha = 1;
  } else {
    var ri;
    for (ri = 0; ri < rows.length; ri++) {
      var rec = rows[ri];
      var ry = yBase + ri * (rowH + rowGap);
      if (ry > L.listBottom + rowH) {
        break;
      }
      if (ry + rowH < L.listTop - 8) {
        continue;
      }
      var rx = L.padX;
      var rw = app.W - L.padX * 2;
      app.ctx.save();
      app.ctx.shadowColor = H ? H.rowShadow : 'rgba(32, 26, 20, 0.08)';
      app.ctx.shadowBlur = app.rpx(6);
      app.ctx.shadowOffsetY = app.rpx(2);
      app.ctx.shadowOffsetX = 0;
      /** 列表行：淡阴影 + 上下两色微渐变，减轻「厚卡片」立体感 */
      var cardFill = app.ctx.createLinearGradient(rx, ry, rx, ry + rowH);
      if (H) {
        cardFill.addColorStop(0, H.rowG0);
        cardFill.addColorStop(1, H.rowG2);
      } else {
        cardFill.addColorStop(0, 'rgba(255, 254, 251, 1)');
        cardFill.addColorStop(1, 'rgba(246, 240, 232, 0.98)');
      }
      app.ctx.fillStyle = cardFill;
      app.roundRect(rx, ry, rw, rowH, cardR);
      app.ctx.fill();
      app.ctx.shadowBlur = 0;
      app.ctx.shadowOffsetY = 0;
      app.ctx.strokeStyle = H ? H.rowStroke : 'rgba(92, 75, 58, 0.11)';
      app.ctx.lineWidth = Math.max(1, app.rpx(1));
      app.roundRect(rx + 0.5, ry + 0.5, rw - 1, rowH - 1, cardR - 0.5);
      app.ctx.stroke();
      app.ctx.save();
      app.roundRect(rx, ry, rw, rowH, cardR);
      app.ctx.clip();
      var rowSheen = app.ctx.createLinearGradient(rx, ry, rx, ry + rowH * 0.38);
      rowSheen.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      rowSheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.03)');
      rowSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
      app.ctx.fillStyle = rowSheen;
      app.ctx.fillRect(rx, ry, rw, rowH * 0.38);
      var rowFoot = app.ctx.createLinearGradient(rx, ry + rowH * 0.58, rx, ry + rowH);
      rowFoot.addColorStop(0, 'rgba(72, 56, 40, 0)');
      rowFoot.addColorStop(1, H ? H.rowFoot1 : 'rgba(72, 56, 40, 0.028)');
      app.ctx.fillStyle = rowFoot;
      app.ctx.fillRect(rx, ry, rw, rowH);
      app.ctx.restore();

      var timeStr = app.formatHistoryDateTime(rec.t);
      var line1Y = ry + rowH * 0.5;
      var innerW = rw - innerPad * 2;
      /** 左约 28% / 中约 44% / 右约 28%，时间在中间列水平居中 */
      var midColCenterX = rx + innerPad + innerW * 0.5;
      var avR = app.rpx(24);
      var avCx = rx + innerPad + avR;
      var avCy = line1Y;
      defaultAvatars.drawCircleAvatar(
        app.ctx,
        app.resolveHistoryRowAvatarImage(rec),
        avCx,
        avCy,
        avR,
        th
      );

      var nickLeftX = rx + innerPad + avR * 2 + app.rpx(10);
      var nickMaxW = Math.max(
        app.rpx(56),
        midColCenterX - nickLeftX - app.rpx(10)
      );
      app.ctx.textBaseline = 'middle';
      app.ctx.font =
        '600 ' +
        app.rpx(29) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.textAlign = 'left';
      app.ctx.fillStyle = ink;
      var oppStr = app.truncateNameToWidth(
        app.ctx,
        String(rec.opp || '对手'),
        nickMaxW
      );
      app.ctx.fillText(oppStr, app.snapPx(nickLeftX), app.snapPx(line1Y));

      app.ctx.textAlign = 'center';
      app.ctx.fillStyle = muted;
      var twMax = innerW * 0.42;
      var timeDraw = timeStr;
      app.ctx.font =
        app.rpx(20) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      if (app.ctx.measureText(timeDraw).width > twMax) {
        app.ctx.font =
          app.rpx(18) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      }
      if (app.ctx.measureText(timeDraw).width > twMax) {
        timeDraw = app.truncateNameToWidth(app.ctx, timeStr, twMax);
      }
      app.ctx.fillText(timeDraw, app.snapPx(midColCenterX), app.snapPx(line1Y));

      var gidRaw = rec.gameId;
      var gidNum =
        typeof gidRaw === 'number' && !isNaN(gidRaw)
          ? gidRaw
          : parseInt(String(gidRaw != null ? gidRaw : ''), 10);
      var showReplayIcon =
        rec.mode === 'server' && !isNaN(gidNum) && gidNum > 0;
      var visRIcon = app.rpx(20);
      var replayCx = rx + rw - innerPad - visRIcon;
      var resTipX = rx + rw - innerPad;
      if (showReplayIcon) {
        resTipX = replayCx - visRIcon - app.rpx(8);
      }

      var resBase =
        rec.res === 'win' ? '胜利' : rec.res === 'lose' ? '失败' : '和棋';
      var resStr =
        typeof rec.steps === 'number'
          ? resBase + '（' + String(rec.steps) + '手）'
          : resBase;
      var resCol =
        rec.res === 'win'
          ? winGold
          : rec.res === 'lose'
            ? loseRose
            : drawTint;
      app.ctx.textAlign = 'right';
      app.ctx.font =
        '600 ' +
        app.rpx(27) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.fillStyle = resCol;
      var resDraw = resStr;
      var resMaxW = Math.min(
        innerW * 0.3,
        Math.max(app.rpx(36), resTipX - midColCenterX - app.rpx(12))
      );
      if (app.ctx.measureText(resDraw).width > resMaxW) {
        resDraw = app.truncateNameToWidth(app.ctx, resStr, resMaxW);
      }
      app.ctx.fillText(resDraw, app.snapPx(resTipX), app.snapPx(line1Y));

      if (showReplayIcon) {
        app.ctx.save();
        app.ctx.fillStyle = H ? H.replayBg : 'rgba(123, 94, 63, 0.14)';
        app.ctx.beginPath();
        app.ctx.arc(replayCx, line1Y, visRIcon, 0, Math.PI * 2);
        app.ctx.fill();
        app.ctx.strokeStyle = H ? H.replayStroke : 'rgba(123, 94, 63, 0.38)';
        app.ctx.lineWidth = Math.max(1, app.rpx(1));
        app.ctx.stroke();
        var triS = app.rpx(10);
        app.ctx.fillStyle = H && H.replayTri ? H.replayTri : accentBrown;
        app.ctx.globalAlpha = 0.92;
        app.ctx.beginPath();
        app.ctx.moveTo(replayCx - triS * 0.35, line1Y - triS * 0.55);
        app.ctx.lineTo(replayCx - triS * 0.35, line1Y + triS * 0.55);
        app.ctx.lineTo(replayCx + triS * 0.68, line1Y);
        app.ctx.closePath();
        app.ctx.fill();
        app.ctx.restore();
      }

      app.ctx.restore();
    }
  }
  app.ctx.restore();

  var listScrolling =
    app.historyScrollTouchId != null || app.historyMomentumRafId != null;
  if (listScrolling) {
    app.historyScrollbarLastScrollTs = Date.now();
    app.clearHistoryScrollbarFadeTimer();
  }
  var holdMs =
    app.HISTORY_SCROLLBAR_HOLD_MS != null ? app.HISTORY_SCROLLBAR_HOLD_MS : 1000;
  var fadeHold =
    app.historyScrollbarLastScrollTs > 0 &&
    Date.now() - app.historyScrollbarLastScrollTs < holdMs;
  if (
    !app.historyListLoading &&
    !app.historyTabLoading &&
    rows.length > 0 &&
    maxScroll > 0 &&
    (listScrolling || fadeHold)
  ) {
    app.drawHistoryListScrollbar(L, maxScroll, contentH);
  } else {
    app.historyScrollbarRatioSmooth = null;
  }

  app.drawThemeChrome(th);
  app.drawRatingCardOverlay(th);
}

app.drawPveColorSelect = function() {
  app.fillAmbientBackground();

  var cl = app.getPveColorLayout();
  var th = app.getCurrentTheme();
  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  app.ctx.shadowBlur = 10;
  app.ctx.shadowOffsetY = 2;
  render.drawText(app.ctx, '人机对战', app.W / 2, app.H * 0.18, 30, th.title);
  app.ctx.restore();
  render.drawText(app.ctx, '选择执子', app.W / 2, app.H * 0.26, 15, th.subtitle);

  app.drawMacaronCard(
    '黑棋（先手）',
    cl.cx,
    cl.yBlack,
    cl.btnW,
    cl.btnH,
    th.homeCards[0],
    false,
    'bear'
  );
  app.drawMacaronCard(
    '白棋（后手）',
    cl.cx,
    cl.yWhite,
    cl.btnW,
    cl.btnH,
    th.homeCards[1],
    false,
    'heart'
  );

  app.ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = th.muted;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('返回', app.snapPx(cl.cx), app.snapPx(cl.backY));
  app.drawThemeChrome(th);
}

/**
 * 首页好友对战 / 人机对战：双卡并排（750rpx 稿）
 */
app.drawHomePvpPvePairRow = function(friendX0, friendY0, pveX0, pveY0, cw, ch) {
  app.drawHomePvpPveCard(friendX0, friendY0, cw, ch, '👥', '好友对战', '邀请微信好友');
  app.drawHomePvpPveCard(pveX0, pveY0, cw, ch, '🤖', '人机对战', '简单/中等/困难');
}

app.drawHomePvpPveCard = function(x0, y0, w, h, icon, title, subtitle) {
  var rr = app.rpx(24);
  var lw = Math.max(1, app.rpx(2));
  app.ctx.save();
  app.ctx.fillStyle = '#ffffff';
  app.roundRect(x0, y0, w, h, rr);
  app.ctx.fill();
  app.ctx.strokeStyle = '#E0E0E0';
  app.ctx.lineWidth = lw;
  app.roundRect(x0, y0, w, h, rr);
  app.ctx.stroke();

  var cx = x0 + w / 2;
  var padTop = app.rpx(24);
  var y = y0 + padTop;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'top';
  app.ctx.font =
    app.rpx(48) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = '#333333';
  app.ctx.fillText(icon, app.snapPx(cx), app.snapPx(y));
  y += app.rpx(48) + app.rpx(12);
  app.ctx.font =
    'bold ' +
    app.rpx(32) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = '#222222';
  app.ctx.fillText(title, app.snapPx(cx), app.snapPx(y));
  y += app.rpx(32) + app.rpx(8);
  app.ctx.font =
    app.rpx(26) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = '#999999';
  app.ctx.fillText(subtitle, app.snapPx(cx), app.snapPx(y));
  app.ctx.restore();
}

/**
 * 首页「随机匹配」主按钮：绿渐变 + 双行文案（750rpx 稿）
 */
app.drawRandomMatchPrimaryCard = function(cx, cy, bw, bh) {
  var x0 = cx - bw / 2;
  var y0 = cy - bh / 2;
  var rr = app.rpx(32);
  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  app.ctx.shadowBlur = app.rpx(24);
  app.ctx.shadowOffsetX = 0;
  app.ctx.shadowOffsetY = app.rpx(12);
  var bg = app.ctx.createLinearGradient(x0, y0, x0, y0 + bh);
  bg.addColorStop(0, '#4CAF50');
  bg.addColorStop(1, '#2E7D32');
  app.ctx.fillStyle = bg;
  app.roundRect(x0, y0, bw, bh, rr);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;

  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'top';
  var yText = y0 + app.rpx(60);
  app.ctx.font =
    'bold ' +
    app.rpx(48) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = '#ffffff';
  app.ctx.fillText('🎲 随机匹配（推荐）', app.snapPx(cx), app.snapPx(yText));
  app.ctx.font =
    app.rpx(28) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  app.ctx.fillText(
    '找到旗鼓相当的对手',
    app.snapPx(cx),
    app.snapPx(yText + app.rpx(48) + app.rpx(20))
  );
  app.ctx.restore();
}

/**
 * 主操作卡片：深色底 + 顶光渐变 + 投影；doodleKind 为右下角弱装饰
 */
app.drawMacaronCard = function(
  label,
  cx,
  cy,
  bw,
  bh,
  fillHex,
  isSelected,
  doodleKind
) {
  var r = Math.min(26, bh * 0.42);
  var x0 = cx - bw / 2;
  var y0 = cy - bh / 2;
  app.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  app.roundRect(x0 + 2, y0 + 5, bw, bh, r);
  app.ctx.fill();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  app.ctx.shadowBlur = 18;
  app.ctx.shadowOffsetY = 6;
  app.ctx.fillStyle = fillHex;
  app.roundRect(x0, y0, bw, bh, r);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  var sheen = app.ctx.createLinearGradient(x0, y0, x0 + bw, y0 + bh);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
  app.ctx.fillStyle = sheen;
  app.roundRect(x0, y0, bw, bh, r);
  app.ctx.fill();
  app.ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  app.ctx.lineWidth = 1.2;
  app.roundRect(x0, y0, bw, bh, r);
  app.ctx.stroke();
  if (isSelected) {
    app.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    app.ctx.lineWidth = 2.5;
    app.roundRect(x0 - 3, y0 - 3, bw + 6, bh + 6, r + 2);
    app.ctx.stroke();
  }
  app.ctx.font =
    'bold 18px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = '#ffffff';
  app.ctx.textBaseline = 'middle';
  app.ctx.textAlign = 'center';
  app.ctx.fillText(label, app.snapPx(cx), app.snapPx(cy));
  if (doodleKind) {
    doodles.drawCardCornerDoodle(app.ctx, doodleKind, cx, cy, bw, bh);
  }
}

/** 「风格」按钮：按已解锁主题顺序循环切换 */
app.cycleThemeNext = function() {
  var ids = themes.getThemeIdsForCycling();
  var i = ids.indexOf(app.themeId);
  if (i < 0) {
    i = 0;
  }
  var next = ids[(i + 1) % ids.length];
  app.themeId = next;
  themes.saveThemeId(next);
  app.syncThemeToServerIfAuthed(next);
  app.themeBubbleText = themes.getTheme(next).name;
  app.startThemeBubbleFadeAnim();
  app.draw();
}

/**
 * 用 orderItemCodes（服务端顺序）将当前穿戴映射为全局下标与页；无则回退本地 getPieceSkinCatalog 顺序。
 */
app.syncPieceSkinModalSelectionFromCurrent = function() {
  var per = themes.PIECE_SKINS_PER_PAGE;
  var keyFromId =
    typeof themes.shopOrderItemCodeFromClientId === 'function'
      ? themes.shopOrderItemCodeFromClientId
      : function (iid) {
          return iid;
        };
  var order = app.shopCatalogOrderItemCodes;
  if (order && order.length) {
    var kSkin = keyFromId(app.pieceSkinId);
    var kTheme = app.themeId;
    var idxSkin = order.indexOf(kSkin);
    var idxTh = kTheme ? order.indexOf(kTheme) : -1;
    var pick = idxSkin >= 0 ? idxSkin : idxTh >= 0 ? idxTh : 0;
    app.pieceSkinModalPendingIdx = pick;
    app.pieceSkinModalPage = Math.floor(pick / per);
    if (typeof app.refreshPieceSkinModalPendingEntry === 'function') {
      app.refreshPieceSkinModalPendingEntry();
    }
    return;
  }
  var cat = themes.getPieceSkinCatalog();
  var pi = -1;
  var ti = -1;
  var i;
  for (i = 0; i < cat.length; i++) {
    var e = cat[i];
    if (!e) {
      continue;
    }
    if (themes.getShopCategory(e) === themes.SHOP_CATEGORY_THEME && e.id === app.themeId) {
      ti = i;
    } else if (
      themes.getShopCategory(e) === themes.SHOP_CATEGORY_PIECE_SKIN &&
      e.id === app.pieceSkinId
    ) {
      pi = i;
    }
  }
  var pick2 = pi >= 0 ? pi : ti >= 0 ? ti : 0;
  app.pieceSkinModalPendingIdx = pick2;
  app.pieceSkinModalPage = Math.floor(pick2 / per);
  if (typeof app.refreshPieceSkinModalPendingEntry === 'function') {
    app.refreshPieceSkinModalPendingEntry();
  }
}

app.refreshPieceSkinModalPendingEntry = function() {
  var g = app.pieceSkinModalPendingIdx;
  if (g < 0) {
    app.pieceSkinModalPendingEntry = null;
    return;
  }
  if (app.shopCatalogServerPaged && app.shopCatalogPageEntries) {
    var st = app.pieceSkinModalPage * themes.PIECE_SKINS_PER_PAGE;
    var loc = g - st;
    if (loc >= 0 && loc < app.shopCatalogPageEntries.length) {
      app.pieceSkinModalPendingEntry = app.shopCatalogPageEntries[loc];
    } else {
      app.pieceSkinModalPendingEntry = null;
    }
    return;
  }
  var c = themes.getPieceSkinCatalog();
  app.pieceSkinModalPendingEntry = c[g] || null;
}

app.getShopCatalogItemTotal = function() {
  if (app.shopCatalogServerPaged && app.shopCatalogTotal > 0) {
    return app.shopCatalogTotal;
  }
  return themes.getPieceSkinCatalog().length;
}

app.getPieceSkinModalPageEntries = function() {
  if (app.shopCatalogServerPaged && app.shopCatalogPageEntries) {
    return app.shopCatalogPageEntries;
  }
  var full = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var p = app.pieceSkinModalPage;
  return full.slice(p * per, p * per + per);
}

/** 当前「页内」在 shopCatalogPageEntries 中的偏移得到 entry（gIdx 为全局下标） */
app.getCatalogEntryAtGlobalIndex = function(gIdx) {
  if (gIdx < 0) {
    return null;
  }
  if (app.shopCatalogServerPaged && app.shopCatalogPageEntries) {
    var st = app.pieceSkinModalPage * themes.PIECE_SKINS_PER_PAGE;
    var loc = gIdx - st;
    if (loc >= 0 && loc < app.shopCatalogPageEntries.length) {
      return app.shopCatalogPageEntries[loc];
    }
    return null;
  }
  var c = themes.getPieceSkinCatalog();
  return c[gIdx] || null;
}

/**
 * 拉取杂货铺一页（与 pieceSkinModalPage 一致由调用方维护；本函数不修改页码）。
 * @param {number} page 从 0 起
 * @param {function(boolean?)} onDone err 为 true 表示失败
 */
app.fetchShopCatalogForModalPage = function(page, onDone) {
  var per = themes.PIECE_SKINS_PER_PAGE;
  if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
    if (onDone) {
      onDone(true);
    }
    return;
  }
  wx.request(
    Object.assign(roomApi.meShopCatalogPageOptions(page, per), {
      success: function(res) {
        if (res.statusCode !== 200 || !res.data) {
          if (onDone) {
            onDone(true);
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
        if (!d || !Array.isArray(d.items) || typeof d.total !== 'number') {
          if (onDone) {
            onDone(true);
          }
          return;
        }
        var orderCodes = d.orderItemCodes;
        if (Array.isArray(orderCodes) && orderCodes.length) {
          app.shopCatalogOrderItemCodes = orderCodes;
        }
        app.shopCatalogTotal = d.total;
        app.shopCatalogServerPaged = true;
        var rows = d.items;
        var ents = [];
        var ri;
        for (ri = 0; ri < rows.length; ri++) {
          var ent =
            typeof themes.catalogEntryFromShopItemDto === 'function'
              ? themes.catalogEntryFromShopItemDto(rows[ri])
              : null;
          if (ent) {
            ents.push(ent);
          }
        }
        app.shopCatalogPageEntries = ents;
        if (typeof app.refreshPieceSkinModalPendingEntry === 'function') {
          app.refreshPieceSkinModalPendingEntry();
        }
        if (onDone) {
          onDone(false);
        }
      },
      fail: function() {
        if (onDone) {
          onDone(true);
        }
      }
    })
  );
}

app.ensureShopConsumableDaggerPreview = function() {
  if (
    app.shopConsumableDaggerPreviewImg &&
    app.shopConsumableDaggerPreviewImg.width
  ) {
    return;
  }
  if (typeof app.ensureAvatarBoardSkillImage !== 'function') {
    return;
  }
  app.ensureAvatarBoardSkillImage('images/skill/q-dagger.png', function(img) {
    if (img && img.width) {
      app.shopConsumableDaggerPreviewImg = img;
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  });
};

app.ensureShopConsumableLovePreview = function() {
  if (
    app.shopConsumableLovePreviewImg &&
    app.shopConsumableLovePreviewImg.width
  ) {
    return;
  }
  if (typeof app.ensureAvatarBoardSkillImage !== 'function') {
    return;
  }
  app.ensureAvatarBoardSkillImage('images/skill/w-love.png', function(img) {
    if (img && img.width) {
      app.shopConsumableLovePreviewImg = img;
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  });
};

app.openPieceSkinModal = function() {
  if (app.pieceSkinModalVisible) {
    return;
  }
  app.pieceShopGridTouchArmed = false;
  app.pieceSkinWearDblIdx = -1;
  app.pieceSkinModalPendingEntry = null;
  app.stopPieceSkinModalAnim();
  if (typeof wx !== 'undefined' && typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载中…', mask: true });
  }
  function openModalContinue() {
    app.syncMeRatingIfAuthed(function() {
      if (typeof app.ensureShopConsumableDaggerPreview === 'function') {
        app.ensureShopConsumableDaggerPreview();
      }
      if (typeof app.ensureShopConsumableLovePreview === 'function') {
        app.ensureShopConsumableLovePreview();
      }
      app.pieceSkinModalVisible = true;
      app.pieceSkinModalAnim = 0;
      app.runPieceSkinModalOpenAnim();
      app.draw();
    });
  }
  function afterFirstPage(err) {
    if (typeof wx !== 'undefined' && typeof wx.hideLoading === 'function') {
      wx.hideLoading();
    }
    if (err) {
      app.shopCatalogServerPaged = false;
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '使用本地商品目录', icon: 'none' });
      }
    }
    app.syncPieceSkinModalSelectionFromCurrent();
    var tp = app.pieceSkinModalPage;
    if (app.shopCatalogServerPaged && tp > 0) {
      if (typeof wx !== 'undefined' && typeof wx.showLoading === 'function') {
        wx.showLoading({ title: '加载中…', mask: true });
      }
      app.fetchShopCatalogForModalPage(tp, function(e2) {
        if (typeof wx !== 'undefined' && typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        if (e2) {
          if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
            wx.showToast({ title: '该页加载失败', icon: 'none' });
          }
        }
        openModalContinue();
      });
    } else {
      openModalContinue();
    }
  }
  app.fetchShopCatalogForModalPage(0, afterFirstPage);
}

app.closePieceSkinModal = function() {
  if (!app.pieceSkinModalVisible) {
    return;
  }
  app.pieceShopGridTouchArmed = false;
  app.pieceSkinModalPendingEntry = null;
  app.pieceSkinWearDblIdx = -1;
  app.shopCatalogServerPaged = false;
  app.shopCatalogPageEntries = [];
  app.shopCatalogOrderItemCodes = [];
  app.shopCatalogTotal = 0;
  app.runPieceSkinModalCloseAnim();
}

app.stopPieceSkinModalAnim = function() {
  if (app.pieceSkinModalAnimRafId != null) {
    app.themeBubbleCaf(app.pieceSkinModalAnimRafId);
    app.pieceSkinModalAnimRafId = null;
  }
}

app.easeOutCubicModal = function(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** 与 easeOutCubic 成对：关闭为打开的时间逆（anim = start * easeOutCubic(1-u) = start * (1-u³)） */
app.easeInCubicModal = function(t) {
  return t * t * t;
}

app.PIECE_SKIN_MODAL_ANIM_MS = 300;

app.runPieceSkinModalOpenAnim = function() {
  app.stopPieceSkinModalAnim();
  var t0 = Date.now();
  var dur = app.PIECE_SKIN_MODAL_ANIM_MS;
  function frame() {
    if (!app.pieceSkinModalVisible) {
      app.pieceSkinModalAnimRafId = null;
      return;
    }
    var u = Math.min(1, (Date.now() - t0) / dur);
    app.pieceSkinModalAnim = app.easeOutCubicModal(u);
    try {
      app.draw();
    } catch (err) {
      try {
        console.error('pieceSkinModalOpen draw', err);
      } catch (e2) {}
    }
    if (u < 1) {
      app.pieceSkinModalAnimRafId = app.themeBubbleRaf(frame);
    } else {
      app.pieceSkinModalAnim = 1;
      app.pieceSkinModalAnimRafId = null;
    }
  }
  app.pieceSkinModalAnimRafId = app.themeBubbleRaf(frame);
}

app.runPieceSkinModalCloseAnim = function() {
  app.stopPieceSkinModalAnim();
  var t0 = Date.now();
  var dur = app.PIECE_SKIN_MODAL_ANIM_MS;
  var start = app.pieceSkinModalAnim;
  function frame() {
    if (!app.pieceSkinModalVisible) {
      app.pieceSkinModalAnimRafId = null;
      return;
    }
    var u = Math.min(1, (Date.now() - t0) / dur);
    /** 与打开对称：打开 anim=easeOut(u)；关闭 anim=start*(1-u³)=start*easeOut(1-u) */
    if (u >= 1) {
      app.pieceSkinModalAnim = 0;
      app.pieceSkinModalVisible = false;
      app.pieceSkinModalAnimRafId = null;
      try {
        app.draw();
      } catch (err) {
        try {
          console.error('pieceSkinModalClose draw', err);
        } catch (e2) {}
      }
      return;
    }
    app.pieceSkinModalAnim = start * (1 - app.easeInCubicModal(u));
    try {
      app.draw();
    } catch (err) {
      try {
        console.error('pieceSkinModalClose draw', err);
      } catch (e2) {}
    }
    app.pieceSkinModalAnimRafId = app.themeBubbleRaf(frame);
  }
  app.pieceSkinModalAnimRafId = app.themeBubbleRaf(frame);
}

app.getPieceSkinModalLayout = function() {
  var pad = app.rpx(32);
  var w = Math.min(app.W - app.rpx(32), app.rpx(696));
  var cellW = app.rpx(app.PIECE_SKIN_CARD_W_RPX);
  var cellH = app.rpx(220);
  var cellGapX = app.rpx(24);
  var cellGapY = app.rpx(32);
  var gridCols = 2;
  var gridRows = 3;
  var gridBlockW = cellW * gridCols + cellGapX * (gridCols - 1);
  var gridH = cellH * gridRows + cellGapY * (gridRows - 1);
  var pageDotsH = app.rpx(44);
  /** 标题区 + 与网格间距 */
  var headerBlock = app.rpx(88);
  var h = pad + headerBlock + gridH + pageDotsH + pad;
  var cx = app.W / 2;
  var cy = app.H * 0.5;
  var x0 = cx - w / 2;
  var y0 = cy - h / 2;
  var gridInnerW = w - pad * 2;
  var gridX0 = x0 + pad + (gridInnerW - gridBlockW) / 2;
  var gridY0 = y0 + pad + headerBlock;
  var titleCy = y0 + pad + app.rpx(24);
  var pageDotR = app.rpx(6);
  var pageDotGap = app.rpx(10);
  var pageDotsCy = gridY0 + gridH + app.rpx(22);
  var totalItems =
    typeof app.getShopCatalogItemTotal === 'function'
      ? app.getShopCatalogItemTotal()
      : themes.getPieceSkinCatalog().length;
  var pageCount = Math.max(
    1,
    Math.ceil(totalItems / themes.PIECE_SKINS_PER_PAGE)
  );
  return {
    cx: cx,
    cy: cy,
    w: w,
    h: h,
    x0: x0,
    y0: y0,
    r: app.rpx(24),
    innerPad: pad,
    pad: pad,
    titleCy: titleCy,
    gridX0: gridX0,
    gridY0: gridY0,
    cellW: cellW,
    cellH: cellH,
    cellGapX: cellGapX,
    cellGapY: cellGapY,
    gridCols: gridCols,
    gridRows: gridRows,
    gridH: gridH,
    pageCount: pageCount,
    pageDotsCy: pageDotsCy,
    pageDotR: pageDotR,
    pageDotGap: pageDotGap,
    closeR: app.rpx(36)
  };
}

/** 弹窗内逻辑坐标（抵消缩放变换，便于命中测试） */
app.pieceSkinModalTouchToLogical = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var sc = 0.86 + 0.14 * app.easeOutCubicModal(app.pieceSkinModalAnim);
  return {
    x: L.cx + (tx - L.cx) / sc,
    y: L.cy + (ty - L.cy) / sc
  };
}

app.innerPadForPieceSkinClose = function(L) {
  return L.pad != null ? L.pad : L.innerPad != null ? L.innerPad : app.rpx(32);
}

app.hitPieceSkinModalClose = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var p = app.pieceSkinModalTouchToLogical(tx, ty);
  var cr = L.closeR;
  var cx = L.x0 + L.w - app.innerPadForPieceSkinClose(L) - cr / 2;
  var cy = L.y0 + app.innerPadForPieceSkinClose(L) + cr / 2;
  return Math.abs(p.x - cx) <= cr * 0.72 && Math.abs(p.y - cy) <= cr * 0.72;
}

app.hitPieceSkinModalPanel = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var p = app.pieceSkinModalTouchToLogical(tx, ty);
  return (
    p.x >= L.x0 &&
    p.x <= L.x0 + L.w &&
    p.y >= L.y0 &&
    p.y <= L.y0 + L.h
  );
}

/** 当前页商品区外接矩形（逻辑坐标，用于滑动翻页命中） */
app.hitPieceSkinModalGridContentArea = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var p = app.pieceSkinModalTouchToLogical(tx, ty);
  var gc = L.gridCols != null ? L.gridCols : 2;
  var gr = L.gridRows != null ? L.gridRows : 3;
  var bw =
    L.cellW * gc + (gc > 0 ? L.cellGapX * (gc - 1) : 0);
  var bh =
    L.cellH * gr + (gr > 0 ? L.cellGapY * (gr - 1) : 0);
  return (
    p.x >= L.gridX0 &&
    p.x <= L.gridX0 + bw &&
    p.y >= L.gridY0 &&
    p.y <= L.gridY0 + bh
  );
}

/** 底部分页点：左起第 n 页，未命中返回 -1 */
app.hitPieceSkinModalPageDotIndex = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var pc = L.pageCount;
  if (pc <= 1) {
    return -1;
  }
  var p = app.pieceSkinModalTouchToLogical(tx, ty);
  var r = L.pageDotR != null ? L.pageDotR : app.rpx(6);
  var gap = L.pageDotGap != null ? L.pageDotGap : app.rpx(10);
  var cy =
    L.pageDotsCy != null
      ? L.pageDotsCy
      : L.gridY0 +
        (L.gridH != null
          ? L.gridH
          : L.cellH * (L.gridRows != null ? L.gridRows : 3) +
            L.cellGapY * ((L.gridRows != null ? L.gridRows : 3) - 1)) +
        app.rpx(22);
  var totalW = pc * (2 * r) + (pc - 1) * gap;
  var startX = L.cx - totalW / 2 + r;
  var hitR = r + app.rpx(10);
  var di;
  for (di = 0; di < pc; di++) {
    var dcx = startX + di * (2 * r + gap);
    var dx = p.x - dcx;
    var dy = p.y - cy;
    if (dx * dx + dy * dy <= hitR * hitR) {
      return di;
    }
  }
  return -1;
}

app.hitPieceSkinModalGridCatalogIndex = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var p = app.pieceSkinModalTouchToLogical(tx, ty);
  var per = themes.PIECE_SKINS_PER_PAGE;
  var start = app.pieceSkinModalPage * per;
  var tot =
    typeof app.getShopCatalogItemTotal === 'function'
      ? app.getShopCatalogItemTotal()
      : themes.getPieceSkinCatalog().length;
  var gc = L.gridCols != null ? L.gridCols : 2;
  var gr = L.gridRows != null ? L.gridRows : 3;
  var row;
  var col;
  for (row = 0; row < gr; row++) {
    for (col = 0; col < gc; col++) {
      var slot = row * gc + col;
      var gx =
        L.gridX0 + col * (L.cellW + L.cellGapX);
      var gy = L.gridY0 + row * (L.cellH + L.cellGapY);
      if (
        p.x >= gx &&
        p.x <= gx + L.cellW &&
        p.y >= gy &&
        p.y <= gy + L.cellH
      ) {
        var gIdx = start + slot;
        if (gIdx >= tot) {
          return -1;
        }
        return gIdx;
      }
    }
  }
  return -1;
}

/**
 * 积分兑换卡底部「兑换」按钮区域（逻辑坐标，与 drawPieceSkinModalOneCard 一致）
 */
app.pieceSkinModalPointsRedeemButtonRect = function(gx, gy, cellW, cellH) {
  var cardPad = app.rpx(18);
  var innerBottom = gy + cellH - cardPad;
  var rowMidY = innerBottom - app.rpx(20);
  var btnH = app.rpx(26);
  var btnW = app.rpx(76);
  var btnLeft = gx + cellW - cardPad - btnW;
  var btnTop = rowMidY - btnH / 2;
  return { x0: btnLeft, y0: btnTop, w: btnW, h: btnH };
}

/** @returns {number} 命中则返回 catalog 下标，否则 -1 */
app.hitPieceSkinModalRedeemButton = function(tx, ty) {
  var L = app.getPieceSkinModalLayout();
  var p = app.pieceSkinModalTouchToLogical(tx, ty);
  var per = themes.PIECE_SKINS_PER_PAGE;
  var start = app.pieceSkinModalPage * per;
  var tot =
    typeof app.getShopCatalogItemTotal === 'function'
      ? app.getShopCatalogItemTotal()
      : themes.getPieceSkinCatalog().length;
  var gc = L.gridCols != null ? L.gridCols : 2;
  var gr = L.gridRows != null ? L.gridRows : 3;
  var row;
  var col;
  for (row = 0; row < gr; row++) {
    for (col = 0; col < gc; col++) {
      var slot = row * gc + col;
      var gx = L.gridX0 + col * (L.cellW + L.cellGapX);
      var gy = L.gridY0 + row * (L.cellH + L.cellGapY);
      var gIdx = start + slot;
      if (gIdx >= tot) {
        continue;
      }
      var ent =
        typeof app.getCatalogEntryAtGlobalIndex === 'function'
          ? app.getCatalogEntryAtGlobalIndex(gIdx)
          : themes.getPieceSkinCatalog()[gIdx];
      if (
        !ent ||
        ent.rowStatus !== 'points' ||
        !ent.costPoints ||
        ent.costPoints <= 0
      ) {
        continue;
      }
      var r = app.pieceSkinModalPointsRedeemButtonRect(gx, gy, L.cellW, L.cellH);
      if (
        p.x >= r.x0 &&
        p.x <= r.x0 + r.w &&
        p.y >= r.y0 &&
        p.y <= r.y0 + r.h
      ) {
        return gIdx;
      }
    }
  }
  return -1;
}

/**
 * 杂货铺 touchEnd：分页点、左/右滑翻页、点选/兑换/双击穿戴。
 * @returns {boolean} 已处理则 true（应阻止其它 home 逻辑）
 */
app.handlePieceSkinModalTouchEnd = function(t) {
  if (!t || !app.pieceSkinModalVisible) {
    return false;
  }
  var ex = t.clientX;
  var ey = t.clientY;
  var dotI = app.hitPieceSkinModalPageDotIndex(ex, ey);
  if (dotI >= 0) {
    var L0 = app.getPieceSkinModalLayout();
    if (app.pieceSkinModalPage !== dotI && dotI < L0.pageCount) {
      app.pieceSkinModalPage = dotI;
      if (app.shopCatalogServerPaged && typeof app.fetchShopCatalogForModalPage === 'function') {
        app.fetchShopCatalogForModalPage(dotI, function(errDot) {
          if (errDot && typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
            wx.showToast({ title: '加载失败', icon: 'none' });
          }
          try {
            app.draw();
          } catch (err0) {
            try {
              console.error('handlePieceSkinModalTouchEnd page dot', err0);
            } catch (e0) {}
          }
        });
      } else {
        try {
          app.draw();
        } catch (err0b) {
          try {
            console.error('handlePieceSkinModalTouchEnd page dot', err0b);
          } catch (e0b) {}
        }
      }
    }
    app.pieceShopGridTouchArmed = false;
    return true;
  }
  var wasArmed = app.pieceShopGridTouchArmed;
  app.pieceShopGridTouchArmed = false;
  var L = app.getPieceSkinModalLayout();
  var slop = app.rpx(56);
  if (wasArmed) {
    var dx = ex - app.pieceShopGridTouchX;
    var dy = ey - app.pieceShopGridTouchY;
    var minSwipe = app.rpx(36);
    if (
      L.pageCount > 1 &&
      Math.abs(dx) > minSwipe &&
      Math.abs(dx) > Math.abs(dy) * 0.65
    ) {
      if (dx < 0) {
        app.pieceSkinModalPage = Math.min(
          L.pageCount - 1,
          app.pieceSkinModalPage + 1
        );
      } else {
        app.pieceSkinModalPage = Math.max(0, app.pieceSkinModalPage - 1);
      }
      var np = app.pieceSkinModalPage;
      if (app.shopCatalogServerPaged && typeof app.fetchShopCatalogForModalPage === 'function') {
        app.fetchShopCatalogForModalPage(np, function(errSw) {
          if (errSw && typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
            wx.showToast({ title: '加载失败', icon: 'none' });
          }
          try {
            app.draw();
          } catch (err) {
            try {
              console.error('handlePieceSkinModalTouchEnd page swipe', err);
            } catch (e1) {}
          }
        });
      } else {
        try {
          app.draw();
        } catch (err2) {
          try {
            console.error('handlePieceSkinModalTouchEnd page swipe', err2);
          } catch (e1b) {}
        }
      }
      return true;
    }
    if (dx * dx + dy * dy > slop * slop) {
      return true;
    }
  }
  if (!wasArmed) {
    return false;
  }
  var redeemHit = app.hitPieceSkinModalRedeemButton(ex, ey);
  if (redeemHit >= 0) {
    app.pieceSkinModalPendingIdx = redeemHit;
    app.pieceSkinModalPendingEntry =
      typeof app.getCatalogEntryAtGlobalIndex === 'function'
        ? app.getCatalogEntryAtGlobalIndex(redeemHit)
        : null;
    app.redeemPieceSkinWithPoints();
    return true;
  }
  var cg = app.hitPieceSkinModalGridCatalogIndex(ex, ey);
  if (cg >= 0) {
    app.pieceSkinModalPendingIdx = cg;
    var entPick =
      typeof app.getCatalogEntryAtGlobalIndex === 'function'
        ? app.getCatalogEntryAtGlobalIndex(cg)
        : themes.getPieceSkinCatalog()[cg];
    app.pieceSkinModalPendingEntry = entPick || null;
    if (
      entPick &&
      entPick.rowStatus === 'points' &&
      entPick.costPoints &&
      entPick.costPoints > 0 &&
      themes.getShopCategory(entPick) !== themes.SHOP_CATEGORY_CONSUMABLE
    ) {
      try {
        app.draw();
      } catch (err2) {
        try {
          console.error('handlePieceSkinModalTouchEnd points card', err2);
        } catch (e2) {}
      }
      return true;
    }
    var now = Date.now();
    var dblMs =
      app.PIECE_SKIN_WEAR_DBL_MS != null ? app.PIECE_SKIN_WEAR_DBL_MS : 450;
    if (
      app.pieceSkinWearDblIdx === cg &&
      now - app.pieceSkinWearDblAt <= dblMs
    ) {
      app.pieceSkinWearDblIdx = -1;
      app.applyPieceSkinWear();
      return true;
    }
    app.pieceSkinWearDblIdx = cg;
    app.pieceSkinWearDblAt = now;
    try {
      app.draw();
    } catch (err3) {
      try {
        console.error('handlePieceSkinModalTouchEnd select', err3);
      } catch (e3) {}
    }
    return true;
  }
  return false;
}

/** @returns {{ text: string, fill: string }} */
app.pieceSkinModalCardStatusStyle = function(entry, th) {
  var muted =
    th && th.muted
      ? th.muted
      : '#8a7a68';
  if (!entry) {
    return { text: '', fill: muted };
  }
  if (entry.rowStatus === 'owned') {
    var ownFill =
      th && th.id === 'mint'
        ? th.btnPrimary
        : th && th.id === 'ink'
          ? '#4a7a5c'
          : '#2a9d4f';
    return { text: '已拥有', fill: ownFill };
  }
  if (entry.rowStatus === 'locked') {
    var lockFill = th && th.muted ? th.muted : '#909090';
    if (entry.unlockHint) {
      return { text: entry.unlockHint, fill: lockFill };
    }
    return { text: '未解锁', fill: lockFill };
  }
  if (entry.rowStatus === 'points' && entry.costPoints) {
    var pt =
      th && typeof app.shopModalUiFromTheme === 'function'
        ? app.shopModalUiFromTheme(th).pointsCost
        : '#c77b28';
    return { text: '', fill: pt };
  }
  return { text: '敬请期待', fill: muted };
}

/**
 * 仅由积分卡「兑换」按钮触发；点选格子其它区域不会调用本函数。
 */
app.redeemPieceSkinWithPoints = function() {
  var entry = app.pieceSkinModalPendingEntry;
  if (!entry) {
    var cat = themes.getPieceSkinCatalog();
    entry = cat[app.pieceSkinModalPendingIdx];
  }
  if (!entry) {
    return;
  }
  if (
    entry.rowStatus !== 'points' ||
    !entry.costPoints ||
    entry.costPoints <= 0
  ) {
    return;
  }
  if (themes.getShopCategory(entry) === themes.SHOP_CATEGORY_CONSUMABLE) {
    var redeemDagger = entry.consumableKind === 'dagger' || entry.id === 'dagger_skill';
    var redeemLove = entry.consumableKind === 'love' || entry.id === 'love_skill';
    if (!redeemDagger && !redeemLove) {
      return;
    }
    if (!authApi.getSessionToken()) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '请先登录', icon: 'none' });
      }
      app.draw();
      return;
    }
    if (app.pieceSkinRedeemInFlight) {
      return;
    }
    var redeemKind = redeemDagger ? 'dagger' : 'love';
    app.pieceSkinRedeemInFlight = true;
    wx.request(
      Object.assign(roomApi.meConsumableRedeemOptions(redeemKind), {
        success: function(res) {
          app.pieceSkinRedeemInFlight = false;
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (eParse) {
              d = null;
            }
          }
          if (res.statusCode === 401) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '请先登录', icon: 'none' });
            }
            app.draw();
            return;
          }
          if (res.statusCode === 200 && d) {
            if (typeof app.mergeConsumableMutationToCache === 'function') {
              app.mergeConsumableMutationToCache(d);
            }
            if (redeemDagger) {
              if (typeof themes.saveBoardSkillId === 'function') {
                themes.saveBoardSkillId('dagger');
              }
              if (typeof app.syncBoardSkillToServerIfAuthed === 'function') {
                app.syncBoardSkillToServerIfAuthed(true);
              }
            } else {
              if (typeof themes.saveLoveBoardSkillId === 'function') {
                themes.saveLoveBoardSkillId('love');
              }
              if (typeof app.syncBoardSkillLoveToServerIfAuthed === 'function') {
                app.syncBoardSkillLoveToServerIfAuthed(true);
              }
            }
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '兑换成功，已自动装备', icon: 'none' });
            }
            app.draw();
            return;
          }
          var msg = '兑换失败';
          if (res.statusCode === 409 && d && d.code === 'INSUFFICIENT_POINTS') {
            msg = '积分不足';
          } else if (res.statusCode === 400 && d && d.code === 'INVALID_KIND') {
            msg = '无法兑换';
          }
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: msg, icon: 'none' });
          }
          app.draw();
        },
        fail: function() {
          app.pieceSkinRedeemInFlight = false;
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
          app.draw();
        }
      })
    );
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
    app.draw();
    return;
  }
  if (app.pieceSkinRedeemInFlight) {
    return;
  }
  app.pieceSkinRedeemInFlight = true;
  wx.request(
    Object.assign(roomApi.mePieceSkinRedeemOptions(entry.id), {
      success: function (res) {
        app.pieceSkinRedeemInFlight = false;
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (eParse) {
            d = null;
          }
        }
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          app.draw();
          return;
        }
        if (res.statusCode === 200 && d) {
          app.mergePieceSkinRedeemResponseToCache(d);
          if (themes.getShopCategory(entry) === themes.SHOP_CATEGORY_THEME) {
            app.themeId = entry.id;
            themes.saveThemeId(entry.id);
            app.syncThemeToServerIfAuthed(entry.id);
          } else {
            app.pieceSkinId = entry.id;
            themes.savePieceSkinId(entry.id);
            app.syncPieceSkinSelectionToServerIfAuthed(entry.id);
          }
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: d.alreadyOwned ? '已拥有该皮肤' : '兑换成功',
              icon: 'none'
            });
          }
          app.draw();
          return;
        }
        var msg = '兑换失败';
        if (res.statusCode === 409 && d && d.code === 'INSUFFICIENT_POINTS') {
          msg = '积分不足';
        } else if (res.statusCode === 400 && d && d.code === 'INVALID_SKIN') {
          msg = '无法兑换';
        }
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: msg, icon: 'none' });
        }
        app.draw();
      },
      fail: function () {
        app.pieceSkinRedeemInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
        app.draw();
      }
    })
  );
}

/** 佩戴已拥有皮肤或棋盘主题，或对未解锁项提示；积分兑换请用 redeemPieceSkinWithPoints（仅按钮） */
app.applyPieceSkinWear = function() {
  var entry = app.pieceSkinModalPendingEntry;
  if (!entry) {
    var cat = themes.getPieceSkinCatalog();
    entry = cat[app.pieceSkinModalPendingIdx];
  }
  if (!entry) {
    return;
  }
  if (themes.getShopCategory(entry) === themes.SHOP_CATEGORY_CONSUMABLE) {
    var wearDagger = entry.consumableKind === 'dagger' || entry.id === 'dagger_skill';
    var wearLove = entry.consumableKind === 'love' || entry.id === 'love_skill';
    if (wearDagger) {
      if (typeof themes.saveBoardSkillId !== 'function') {
        return;
      }
      var wasEq =
        typeof themes.isDaggerSkillEquipped === 'function' &&
        themes.isDaggerSkillEquipped();
      themes.saveBoardSkillId(wasEq ? null : 'dagger');
      if (typeof app.syncBoardSkillToServerIfAuthed === 'function') {
        app.syncBoardSkillToServerIfAuthed(!wasEq);
      }
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: wasEq ? '已卸下短剑' : '已装备短剑，对局中可使用',
          icon: 'none'
        });
      }
      app.draw();
      return;
    }
    if (wearLove) {
      if (typeof themes.saveLoveBoardSkillId !== 'function') {
        return;
      }
      var wasEqL =
        typeof themes.isLoveSkillEquipped === 'function' &&
        themes.isLoveSkillEquipped();
      themes.saveLoveBoardSkillId(wasEqL ? null : 'love');
      if (typeof app.syncBoardSkillLoveToServerIfAuthed === 'function') {
        app.syncBoardSkillLoveToServerIfAuthed(!wasEqL);
      }
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: wasEqL ? '已卸下爱心' : '已装备爱心，对局中可使用',
          icon: 'none'
        });
      }
      app.draw();
      return;
    }
    return;
  }
  if (entry.rowStatus === 'points' && entry.costPoints && entry.costPoints > 0) {
    return;
  }
  if (entry.rowStatus === 'locked' || !entry.id) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({
        title: entry.unlockHint || '未解锁',
        icon: 'none'
      });
    }
    app.draw();
    return;
  }
  /** 已装备同一项时：再次双击取消装备（主题→檀木，棋子→基础黑白） */
  var shopTheme = themes.getShopCategory(entry) === themes.SHOP_CATEGORY_THEME;
  var alreadyEquipped = shopTheme
    ? app.themeId === entry.id
    : app.pieceSkinId === entry.id;
  if (alreadyEquipped) {
    if (shopTheme) {
      app.themeId = 'classic';
      themes.saveThemeId('classic');
      app.syncThemeToServerIfAuthed('classic');
    } else {
      app.pieceSkinId = 'basic';
      themes.savePieceSkinId('basic');
      app.syncPieceSkinSelectionToServerIfAuthed('basic');
    }
    app.draw();
    return;
  }
  if (shopTheme) {
    app.themeId = entry.id;
    themes.saveThemeId(entry.id);
    app.syncThemeToServerIfAuthed(entry.id);
    app.draw();
    return;
  }
  app.pieceSkinId = entry.id;
  themes.savePieceSkinId(entry.id);
  app.syncPieceSkinSelectionToServerIfAuthed(entry.id);
  app.draw();
}

/** 杂货铺：棋盘主题卡片的迷你盘面预览 */
app.drawPieceSkinModalThemeBoardPreview = function(cx, cy, bw, bh, th) {
  if (!th || !th.board) {
    return;
  }
  var b = th.board;
  var x0 = cx - bw / 2;
  var y0 = cy - bh / 2;
  var g = app.ctx.createLinearGradient(x0, y0, x0 + bw, y0 + bh);
  g.addColorStop(0, b.g0);
  g.addColorStop(1, b.g1);
  app.ctx.save();
  app.ctx.fillStyle = g;
  var br = app.rpx(10);
  app.roundRect(x0, y0, bw, bh, br);
  app.ctx.fill();
  app.ctx.strokeStyle = b.line;
  app.ctx.lineWidth = app.rpx(1.1);
  app.ctx.globalAlpha = 0.75;
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(x0 + br * 0.8), app.snapPx(cy));
  app.ctx.lineTo(app.snapPx(x0 + bw - br * 0.8), app.snapPx(cy));
  app.ctx.moveTo(app.snapPx(cx), app.snapPx(y0 + br * 0.8));
  app.ctx.lineTo(app.snapPx(cx), app.snapPx(y0 + bh - br * 0.8));
  app.ctx.stroke();
  app.ctx.globalAlpha = 1;
  app.ctx.fillStyle = b.star;
  app.ctx.beginPath();
  app.ctx.arc(
    app.snapPx(cx),
    app.snapPx(cy),
    app.rpx(3),
    0,
    Math.PI * 2
  );
  app.ctx.fill();
  app.ctx.restore();
};

app.drawPieceSkinModalPlaceholderPieces = function(midX, cy, pr) {
  var d = pr * 2;
  var gap = app.rpx(20);
  var cxB = midX - (d + gap) / 2 + pr;
  var cxW = midX + (d + gap) / 2 - pr;
  app.ctx.fillStyle = '#2c2620';
  app.ctx.beginPath();
  app.ctx.arc(cxB, cy, pr, 0, Math.PI * 2);
  app.ctx.fill();
  app.ctx.fillStyle = '#faf9f7';
  app.ctx.beginPath();
  app.ctx.arc(cxW, cy, pr, 0, Math.PI * 2);
  app.ctx.fill();
  app.ctx.strokeStyle = 'rgba(140, 128, 112, 0.45)';
  app.ctx.lineWidth = app.rpx(1.5);
  app.ctx.beginPath();
  app.ctx.arc(cxW, cy, pr, 0, Math.PI * 2);
  app.ctx.stroke();
}

};
