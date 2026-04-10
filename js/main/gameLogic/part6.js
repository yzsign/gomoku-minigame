/**
 * Auto-split from gameLogic.js (part 6)
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

  authApi.onSilentLoginComplete(function (loginOk, payload) {
    if (!loginOk || !payload) {
      return;
    }
    if (payload.admin === true) {
      app.userIsAdmin = true;
    } else if (payload.admin === false) {
      app.userIsAdmin = false;
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  });

app.setupShareMessage = function() {
  if (typeof wx.onShareAppMessage === 'function') {
    wx.onShareAppMessage(function () {
      if (app.isPvpOnline && app.onlineRoomId && app.pvpOnlineYourColor === app.BLACK) {
        return {
          title: '五子棋 房号 ' + app.onlineRoomId,
          query: 'roomId=' + app.onlineRoomId + '&online=1'
        };
      }
      return {
        title: '来一局团团五子棋吧！',
        query: 'from=invite'
      };
    });
  }
}
app.setupShareMessage();

try {
  var launchOpt = wx.getLaunchOptionsSync && wx.getLaunchOptionsSync();
  if (launchOpt && launchOpt.query) {
    var lq = launchOpt.query;
    if (String(lq.online) === '1' && lq.roomId) {
      app.tryLaunchOnlineInvite(lq);
    } else if (String(lq.from) === 'invite') {
      app.startPvpLocal();
    }
  }
} catch (launchErr) {}

if (typeof wx.onWindowResize === 'function') {
  wx.onWindowResize(function () {
    app.syncCanvasWithWindow();
    app.draw();
  });
}

defaultAvatars.preloadAll(function () {
  app.loadHomeUiAssets();
  app.draw();
});

app.draw();
app.maybeFirstVisitProfileModal();

/** 首屏再调一次：避免仅依赖 onShow 时，部分环境下首帧未触发或注册晚于首次 onShow */
authApi.silentLogin();
setTimeout(function () {
  app.tryFetchMyProfileAvatar();
}, 600);

/** ---------- 管理员：残局编辑（openid 白名单，见 js/adminConfig.js 与 GOMOKU_ADMIN_OPENIDS） ---------- */

function adminPuzzleSafeBottomPx() {
  if (
    app.sys &&
    app.sys.safeArea &&
    typeof app.sys.safeArea.bottom === 'number'
  ) {
    return Math.max(0, app.H - app.sys.safeArea.bottom);
  }
  return 0;
}

app.getAdminPuzzleFooterLayout = function() {
  var sb = adminPuzzleSafeBottomPx();
  var pad = app.rpx(20);
  var btnH = app.rpx(64);
  var gap = app.rpx(12);
  var y0 = app.H - sb - btnH * 4 - gap * 3 - pad;
  var fullW = app.W - pad * 2;
  var half = (fullW - gap) * 0.5;
  return {
    yBack: y0,
    yRow2: y0 + btnH + gap,
    yRow3: y0 + (btnH + gap) * 2,
    yPub: y0 + (btnH + gap) * 3,
    btnH: btnH,
    pad: pad,
    halfW: half,
    fullW: fullW,
    gap: gap
  };
};

app.enterAdminPuzzleScreen = function() {
  app.screen = 'admin_puzzle';
  app.adminDraftBoard = gomoku.createBoard();
  app.board = app.adminDraftBoard;
  if (!app.adminPuzzleTitle) {
    app.adminPuzzleTitle = '新残局';
  }
  app.adminPuzzleSideToMove = app.adminPuzzleSideToMove || app.BLACK;
  app.adminPuzzleScheduleDate =
    typeof app.getLocalCalendarYmd === 'function'
      ? app.getLocalCalendarYmd()
      : '';
  app.adminPuzzleSaving = false;
  app.draw();
};

app.exitAdminPuzzleScreen = function() {
  app.screen = 'home';
  app.adminDraftBoard = null;
  app.board = gomoku.createBoard();
  app.adminPuzzleSaving = false;
  app.draw();
};

app.drawAdminPuzzleScreen = function() {
  app.fillAmbientBackground();
  app.layout = app.computeLayout();
  var boardTh = app.getCurrentTheme();
  var pieceUnified = app.getThemeForPieces(boardTh);
  doodles.drawGameBoardCornerClouds(
    app.ctx,
    app.W,
    app.H,
    app.layout,
    app.sys.statusBarHeight || 0
  );
  render.drawBoard(app.ctx, app.layout, boardTh);
  render.drawPieces(
    app.ctx,
    app.adminDraftBoard,
    app.layout,
    pieceUnified,
    pieceUnified
  );

  var th = app.getUiTheme();
  var insetTop =
    typeof app.getGameScreenInsetTop === 'function'
      ? app.getGameScreenInsetTop()
      : Math.max(
          app.sys.statusBarHeight || 24,
          app.sys.safeArea && app.sys.safeArea.top != null
            ? app.sys.safeArea.top
            : 0
        );
  var titleFs = Math.max(16, Math.round(app.rpx(32)));
  app.ctx.save();
  render.drawText(
    app.ctx,
    '残局管理',
    app.W / 2,
    insetTop + titleFs * 0.6,
    titleFs,
    th.title
  );
  var subFs = Math.max(12, Math.round(app.rpx(24)));
  render.drawText(
    app.ctx,
    '点格循环空·黑·白 · 底部保存',
    app.W / 2,
    insetTop + titleFs * 1.15,
    subFs,
    th.subtitle != null ? th.subtitle : th.muted
  );
  app.ctx.restore();

  var L = app.getAdminPuzzleFooterLayout();
  var pad = L.pad;
  function drawMiniBtn(cx, cy, bw, bh, label, pressed) {
    app.ctx.save();
    app.ctx.fillStyle = pressed
      ? 'rgba(0,0,0,0.12)'
      : 'rgba(255,255,255,0.92)';
    app.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, app.rpx(12));
    app.ctx.fill();
    app.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    app.ctx.lineWidth = 1;
    app.ctx.stroke();
    render.drawText(app.ctx, label, cx, cy, app.rpx(26), th.title);
    app.ctx.restore();
  }
  var xL = pad + L.halfW * 0.5;
  var xR = app.W - pad - L.halfW * 0.5;
  drawMiniBtn(xL, L.yBack + L.btnH * 0.5, L.halfW, L.btnH, '返回', false);
  drawMiniBtn(xR, L.yBack + L.btnH * 0.5, L.halfW, L.btnH, '清空', false);
  var sideBlackOn = app.adminPuzzleSideToMove === app.BLACK;
  var sideWhiteOn = app.adminPuzzleSideToMove === app.WHITE;
  drawMiniBtn(
    xL,
    L.yRow2 + L.btnH * 0.5,
    L.halfW,
    L.btnH,
    '下一手黑',
    sideBlackOn
  );
  drawMiniBtn(
    xR,
    L.yRow2 + L.btnH * 0.5,
    L.halfW,
    L.btnH,
    '下一手白',
    sideWhiteOn
  );
  var yMeta = L.yRow3 + L.btnH * 0.5;
  render.drawText(
    app.ctx,
    app.adminPuzzleTitle || '新残局',
    app.W / 2,
    yMeta,
    app.rpx(22),
    th.title
  );
  render.drawText(
    app.ctx,
    '排期 ' + (app.adminPuzzleScheduleDate || '-'),
    app.W / 2,
    yMeta + app.rpx(30),
    app.rpx(20),
    th.muted
  );
  var pubY = L.yPub + L.btnH * 0.5;
  app.ctx.save();
  app.ctx.fillStyle = app.adminPuzzleSaving
    ? 'rgba(0,0,0,0.15)'
    : 'rgba(76, 175, 80, 0.95)';
  app.roundRect(pad, pubY - L.btnH * 0.5, L.fullW, L.btnH, app.rpx(12));
  app.ctx.fill();
  render.drawText(
    app.ctx,
    app.adminPuzzleSaving ? '提交中…' : '发布到题库并绑定排期',
    app.W / 2,
    pubY,
    app.rpx(28),
    '#FFFFFF'
  );
  app.ctx.restore();
};

app.hitAdminPuzzleUi = function(clientX, clientY) {
  var L = app.getAdminPuzzleFooterLayout();
  var pad = L.pad;
  var half = L.halfW;
  var xL = pad + half * 0.5;
  var xR = app.W - pad - half * 0.5;
  function inBtn(cx, cy, bw, bh) {
    return (
      Math.abs(clientX - cx) <= bw * 0.5 + 4 &&
      Math.abs(clientY - cy) <= bh * 0.5 + 6
    );
  }
  if (inBtn(xL, L.yBack + L.btnH * 0.5, half, L.btnH)) {
    return 'back';
  }
  if (inBtn(xR, L.yBack + L.btnH * 0.5, half, L.btnH)) {
    return 'clear';
  }
  if (inBtn(xL, L.yRow2 + L.btnH * 0.5, half, L.btnH)) {
    return 'side_black';
  }
  if (inBtn(xR, L.yRow2 + L.btnH * 0.5, half, L.btnH)) {
    return 'side_white';
  }
  var pubY = L.yPub + L.btnH * 0.5;
  if (
    clientX >= pad &&
    clientX <= pad + L.fullW &&
    clientY >= pubY - L.btnH * 0.5 - 4 &&
    clientY <= pubY + L.btnH * 0.5 + 4
  ) {
    return 'publish';
  }
  var metaY = L.yRow3 + L.btnH * 0.5;
  if (
    Math.abs(clientX - app.W * 0.5) <= app.W * 0.42 &&
    clientY >= metaY - app.rpx(28) &&
    clientY <= metaY + app.rpx(38)
  ) {
    return 'edit_meta';
  }
  return null;
};

app.handleAdminPuzzleTouchEnd = function(clientX, clientY) {
  var ui = app.hitAdminPuzzleUi(clientX, clientY);
  if (ui === 'back') {
    app.exitAdminPuzzleScreen();
    return;
  }
  if (ui === 'clear') {
    var r;
    var c;
    for (r = 0; r < app.SIZE; r++) {
      for (c = 0; c < app.SIZE; c++) {
        app.adminDraftBoard[r][c] = gomoku.EMPTY;
      }
    }
    app.draw();
    return;
  }
  if (ui === 'side_black') {
    app.adminPuzzleSideToMove = app.BLACK;
    app.draw();
    return;
  }
  if (ui === 'side_white') {
    app.adminPuzzleSideToMove = app.WHITE;
    app.draw();
    return;
  }
  if (ui === 'edit_meta') {
    if (typeof wx.showModal !== 'function') {
      return;
    }
    var canEdit = !wx.canIUse || wx.canIUse('showModal.object.editable');
    if (canEdit) {
      wx.showModal({
        title: '题目标题',
        editable: true,
        placeholderText: app.adminPuzzleTitle || '新残局',
        success: function (res) {
          if (res.confirm && res.content) {
            app.adminPuzzleTitle = String(res.content).trim() || app.adminPuzzleTitle;
          }
          wx.showModal({
            title: '排期日期',
            editable: true,
            placeholderText:
              app.adminPuzzleScheduleDate ||
              (typeof app.getLocalCalendarYmd === 'function'
                ? app.getLocalCalendarYmd()
                : ''),
            success: function (res2) {
              if (res2.confirm && res2.content) {
                app.adminPuzzleScheduleDate = String(res2.content).trim();
              }
              app.draw();
            }
          });
        }
      });
    } else {
      wx.showModal({
        title: '排期',
        content: '将把排期设为今日',
        success: function (res) {
          if (res.confirm && typeof app.getLocalCalendarYmd === 'function') {
            app.adminPuzzleScheduleDate = app.getLocalCalendarYmd();
            app.draw();
          }
        }
      });
    }
    return;
  }
  if (ui === 'publish') {
    app.submitAdminDailyPuzzle();
    return;
  }
  if (!app.onBoard(clientX, clientY)) {
    return;
  }
  var cell = app.pixelToCell(clientX, clientY);
  if (!cell) {
    return;
  }
  var v = app.adminDraftBoard[cell.r][cell.c];
  var next = v === gomoku.EMPTY ? app.BLACK : v === app.BLACK ? app.WHITE : gomoku.EMPTY;
  app.adminDraftBoard[cell.r][cell.c] = next;
  if (typeof app.playPlaceStoneSound === 'function') {
    app.playPlaceStoneSound();
  }
  app.draw();
};

app.submitAdminDailyPuzzle = function() {
  if (app.adminPuzzleSaving) {
    return;
  }
  authApi.ensureSession(function (ok) {
    if (!ok || !authApi.getSessionToken()) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '请先登录', icon: 'none' });
      }
      return;
    }
    var i;
    var j;
    var grid = [];
    for (i = 0; i < app.SIZE; i++) {
      grid[i] = [];
      for (j = 0; j < app.SIZE; j++) {
        grid[i][j] = app.adminDraftBoard[i][j];
      }
    }
    var body = {
      title: app.adminPuzzleTitle || '新残局',
      difficulty: 3,
      boardSize: 15,
      board: grid,
      sideToMove: app.adminPuzzleSideToMove,
      goal: 'WIN',
      status: 1
    };
    if (app.adminPuzzleScheduleDate) {
      body.scheduleDate = app.adminPuzzleScheduleDate;
    }
    app.adminPuzzleSaving = true;
    app.draw();
    wx.request(
      Object.assign(roomApi.adminDailyPuzzleCreateOptions(body), {
        success: function (res) {
          app.adminPuzzleSaving = false;
          app.draw();
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (e1) {
              d = null;
            }
          }
          if (res.statusCode === 200 && d && d.id != null) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '已发布 id=' + d.id, icon: 'none' });
            }
            app.exitAdminPuzzleScreen();
            return;
          }
          var msg =
            d && d.message
              ? d.message
              : '发布失败 ' + (res.statusCode || '');
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: msg.slice(0, 18), icon: 'none' });
          }
        },
        fail: function () {
          app.adminPuzzleSaving = false;
          app.draw();
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        }
      })
    );
  });
};

function fetchAdminStatusFromServer() {
  authApi.ensureSession(function (ok) {
    if (!ok || !authApi.getSessionToken()) {
      return;
    }
    wx.request(
      Object.assign(roomApi.meAdminStatusOptions(), {
        success: function (res) {
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (e2) {
              d = null;
            }
          }
          if (res.statusCode === 200 && d && typeof d.admin === 'boolean') {
            app.userIsAdmin = d.admin === true;
          }
          app.draw();
        }
      })
    );
  });
}

app.refreshAdminStatus = fetchAdminStatusFromServer;
[600, 2000, 4500].forEach(function (ms) {
  setTimeout(fetchAdminStatusFromServer, ms);
});
};
