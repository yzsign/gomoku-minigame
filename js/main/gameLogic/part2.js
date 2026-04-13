/**
 * Auto-split from gameLogic.js (part 2)
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

function copyBoardMatrixForSnapshot(src) {
  if (!src) {
    return null;
  }
  var SIZE = app.SIZE;
  var out = [];
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    out[r] = [];
    for (c = 0; c < SIZE; c++) {
      out[r][c] = src[r][c];
    }
  }
  return out;
}

function cloneDailyPuzzleMovesForSnapshot(moves) {
  if (!moves || !moves.length) {
    return [];
  }
  var out = [];
  var i;
  for (i = 0; i < moves.length; i++) {
    var m = moves[i];
    out.push({ r: m.r, c: m.c, color: m.color });
  }
  return out;
}

/**
 * 创建残局好友房并调起分享后，用户取消分享则恢复邀请前界面（每日残局棋盘或残局管理编辑页）。
 */
app.restoreAfterCancelledPuzzleFriendInvite = function() {
  var snap = app._puzzleFriendInviteSnapshot;
  if (!snap || !snap.kind) {
    return;
  }
  app._puzzleFriendInviteSnapshot = null;
  app._puzzleFriendInviteShareAwaitOnShow = false;
  if (app._puzzleFriendInviteOnShowTimer != null) {
    try {
      clearTimeout(app._puzzleFriendInviteOnShowTimer);
    } catch (ePf) {}
    app._puzzleFriendInviteOnShowTimer = null;
  }
  app.disconnectOnline();
  if (snap.kind === 'daily') {
    app.showResultOverlay = false;
    app.onlineResultOverlaySticky = false;
    app.isPvpOnline = false;
    app.isDailyPuzzle = true;
    app.board = copyBoardMatrixForSnapshot(snap.board);
    app.current = snap.current;
    app.dailyPuzzleMeta = snap.dailyPuzzleMeta
      ? JSON.parse(JSON.stringify(snap.dailyPuzzleMeta))
      : null;
    app.dailyPuzzleMoves = cloneDailyPuzzleMovesForSnapshot(snap.dailyPuzzleMoves);
    app.dailyPuzzleInitialBoard = snap.dailyPuzzleInitialBoard
      ? copyBoardMatrixForSnapshot(snap.dailyPuzzleInitialBoard)
      : null;
    app.dailyPuzzleSideToMoveStart = snap.dailyPuzzleSideToMoveStart;
    app.dailyPuzzleUserColor = snap.dailyPuzzleUserColor;
    app.dailyPuzzleBotGen = (snap.dailyPuzzleBotGen || 0) + 1;
    app.dailyPuzzleSubmitting = false;
    app.dailyPuzzleResultKind = '';
    app.dailyPuzzleSubmitActivityPointsDelta = null;
    app.gameOver = false;
    app.winner = null;
    app.lastOpponentMove = null;
    app.lastMsg = '每日残局';
    app.screen = 'game';
    if (typeof app.refreshDailyPuzzleLastOpponentMove === 'function') {
      app.refreshDailyPuzzleLastOpponentMove();
    }
    if (typeof app.scheduleDailyPuzzleBotIfNeeded === 'function') {
      app.scheduleDailyPuzzleBotIfNeeded();
    }
    app.draw();
    return;
  }
  if (snap.kind === 'admin') {
    app.screen = 'admin_puzzle';
    app.adminPuzzleTitle = snap.adminPuzzleTitle || '新残局';
    app.adminPuzzleSideToMove = snap.adminPuzzleSideToMove || app.BLACK;
    app.adminPuzzleScheduleDate =
      snap.adminPuzzleScheduleDate != null ? snap.adminPuzzleScheduleDate : '';
    app.adminDraftBoard = copyBoardMatrixForSnapshot(snap.board);
    app.board = app.adminDraftBoard;
    app.adminPuzzleSaving = false;
    app.adminPuzzlePublishSwipePx = 0;
    app.adminPuzzlePublishSwipeTouchId = null;
    app.adminPuzzleSchedulePickerOpen = false;
    app.adminPuzzleSchedulePickerData = null;
    app.draw();
  }
};

/**
 * 从分享返回时 wx.onShow 兜底：部分机型 shareAppMessage 取消不触发 fail。
 * 延迟较长以便 success 先清空快照；若此时已有真人好友入座则不恢复。
 */
app.schedulePuzzleFriendInviteOnShowFallback = function() {
  if (!app._puzzleFriendInviteShareAwaitOnShow) {
    return;
  }
  if (!app._puzzleFriendInviteSnapshot) {
    app._puzzleFriendInviteShareAwaitOnShow = false;
    return;
  }
  if (app._puzzleFriendInviteOnShowTimer != null) {
    try {
      clearTimeout(app._puzzleFriendInviteOnShowTimer);
    } catch (eT) {}
    app._puzzleFriendInviteOnShowTimer = null;
  }
  var gen = app._puzzleFriendInviteOnShowFallbackGen || 0;
  app._puzzleFriendInviteOnShowTimer = setTimeout(function() {
    app._puzzleFriendInviteOnShowTimer = null;
    if (!app._puzzleFriendInviteShareAwaitOnShow) {
      return;
    }
    if (gen !== (app._puzzleFriendInviteOnShowFallbackGen || 0)) {
      return;
    }
    if (!app._puzzleFriendInviteSnapshot) {
      app._puzzleFriendInviteShareAwaitOnShow = false;
      return;
    }
    if (
      !app.onlinePuzzleFriendRoom ||
      !app.onlineSpectatorMode ||
      app.gameOver
    ) {
      app._puzzleFriendInviteShareAwaitOnShow = false;
      return;
    }
    if (
      typeof app.hasPuzzleFriendHumanGuest === 'function' &&
      app.hasPuzzleFriendHumanGuest()
    ) {
      app._puzzleFriendInviteShareAwaitOnShow = false;
      return;
    }
    app._puzzleFriendInviteShareAwaitOnShow = false;
    if (typeof app.restoreAfterCancelledPuzzleFriendInvite === 'function') {
      app.restoreAfterCancelledPuzzleFriendInvite();
    }
  }, 1650);
};

function puzzleFriendInviteShareMessageOpts(title, roomId) {
  if (app._puzzleFriendInviteOnShowTimer != null) {
    try {
      clearTimeout(app._puzzleFriendInviteOnShowTimer);
    } catch (eC) {}
    app._puzzleFriendInviteOnShowTimer = null;
  }
  app._puzzleFriendInviteShareAwaitOnShow = true;
  app._puzzleFriendInviteOnShowFallbackGen =
    (app._puzzleFriendInviteOnShowFallbackGen || 0) + 1;
  return {
    title: title,
    query: 'roomId=' + roomId + '&online=1',
    success: function() {
      app._puzzleFriendInviteShareAwaitOnShow = false;
      app._puzzleFriendInviteSnapshot = null;
      if (app._puzzleFriendInviteOnShowTimer != null) {
        try {
          clearTimeout(app._puzzleFriendInviteOnShowTimer);
        } catch (eS) {}
        app._puzzleFriendInviteOnShowTimer = null;
      }
    },
    fail: function() {
      app._puzzleFriendInviteShareAwaitOnShow = false;
      if (app._puzzleFriendInviteOnShowTimer != null) {
        try {
          clearTimeout(app._puzzleFriendInviteOnShowTimer);
        } catch (eF) {}
        app._puzzleFriendInviteOnShowTimer = null;
      }
      if (typeof app.restoreAfterCancelledPuzzleFriendInvite === 'function') {
        app.restoreAfterCancelledPuzzleFriendInvite();
      }
    }
  };
}

app.startOnlineSocket = function() {
  if (!app.onlineRoomId || !app.onlineToken) {
    return;
  }
  app.onlineSocketConnectGen++;
  var myGen = app.onlineSocketConnectGen;
  app.closeSocketOnly();
  app.isPvpOnline = true;
  var wsBase = roomApi.wsUrlFromApiBase();
  var st = authApi.getSessionToken();
  var url =
    wsBase +
    '/ws/gomoku?roomId=' +
    encodeURIComponent(app.onlineRoomId) +
    '&token=' +
    encodeURIComponent(app.onlineToken) +
    '&sessionToken=' +
    encodeURIComponent(st);
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Gomoku] WebSocket URL:', url);
  }
  app.socketTask = wx.connectSocket({
    url: url,
    fail: function () {
      if (myGen !== app.onlineSocketConnectGen) {
        return;
      }
      app.socketTask = null;
      app.onlineWsConnected = false;
      if (app.shouldAutoReconnectOnline()) {
        app.scheduleOnlineReconnect(false);
        app.draw();
        return;
      }
      wx.showToast({ title: '连接失败', icon: 'none' });
      app.disconnectOnline();
      app.screen = 'home';
      app.draw();
    }
  });
  if (!app.socketTask || !app.socketTask.onOpen) {
    return;
  }
  app.socketTask.onOpen(function () {
    if (myGen !== app.onlineSocketConnectGen) {
      return;
    }
    app.onlineWsConnected = true;
    app.onlineWsEverOpened = true;
    app.onlineReconnectAttempt = 0;
    app.clearOnlineReconnectTimer();
    app.draw();
  });
  app.socketTask.onMessage(function (res) {
    if (myGen !== app.onlineSocketConnectGen) {
      return;
    }
    var raw = res.data;
    var data;
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      return;
    }
    if (data.type === 'ERROR') {
      wx.showToast({
        title: data.message || '错误',
        icon: 'none'
      });
      return;
    }
    if (data.type === 'REMATCH_DECLINED') {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '对方拒绝了再来一局', icon: 'none' });
      }
      return;
    }
    if (data.type === 'CHAT') {
      if (typeof app.applyOnlineChatIncoming === 'function') {
        app.applyOnlineChatIncoming(data);
      }
      return;
    }
    if (data.type === 'STATE') {
      app.applyOnlineState(data);
    }
  });
  app.socketTask.onClose(function () {
    if (myGen !== app.onlineSocketConnectGen) {
      return;
    }
    app.handleOnlineSocketDead();
  });
  app.socketTask.onError(function () {
    if (myGen !== app.onlineSocketConnectGen) {
      return;
    }
    app.handleOnlineSocketDead();
  });
}

app.startOnlineAsHost = function() {
  app.homeDrawerOpen = false;
  authApi.ensureSession(function (sessionOk, errHint) {
    if (!sessionOk) {
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      return;
    }
    app.disconnectOnline();
    wx.showLoading({ title: '创建房间…', mask: true });
    wx.request(
      Object.assign(roomApi.roomApiCreateOptions(), {
    success: function (res) {
      wx.hideLoading();
      if ((res.statusCode !== 200 && res.statusCode !== 201) || !res.data) {
        wx.showToast({
          title: '创建失败 ' + (res.statusCode || ''),
          icon: 'none'
        });
        return;
      }
      var d = res.data;
      app.onlineRoomId = d.roomId;
      app.onlineToken = d.blackToken;
      app.onlineSpectatorMode = false;
      app.pvpOnlineYourColor = app.BLACK;
      app.isPvpLocal = false;
      app.isRandomMatch = false;
      app.screen = 'game';
      app.lastOpponentMove = null;
      app.board = gomoku.createBoard();
      app.current = app.BLACK;
      app.gameOver = false;
      app.winner = null;
      app.lastMsg = '等待白方加入…';
      app.startOnlineSocket();
      app.draw();
      if (typeof wx.shareAppMessage === 'function') {
        wx.shareAppMessage({
          title: '五子棋 房号 ' + app.onlineRoomId,
          query: 'roomId=' + app.onlineRoomId + '&online=1'
        });
      } else {
        wx.showToast({
          title: '请点右上角菜单转发给好友',
          icon: 'none'
        });
      }
    },
    fail: function () {
      wx.hideLoading();
      wx.showToast({ title: '网络请求失败', icon: 'none' });
    }
  })
    );
  });
}

/**
 * 残局管理页：按当前编辑盘面创建好友房，房主旁观，好友执白加入。
 */
app.startPuzzleFriendInvite = function() {
  if (!app.adminDraftBoard) {
    return;
  }
  authApi.ensureSession(function(sessionOk, errHint) {
    if (!sessionOk) {
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      return;
    }
    app.disconnectOnline();
    app._puzzleFriendInviteSnapshot = {
      kind: 'admin',
      board: copyBoardMatrixForSnapshot(app.adminDraftBoard),
      adminPuzzleSideToMove: app.adminPuzzleSideToMove,
      adminPuzzleTitle: app.adminPuzzleTitle,
      adminPuzzleScheduleDate: app.adminPuzzleScheduleDate
    };
    wx.showLoading({ title: '创建房间…', mask: true });
    var board = [];
    var r;
    var c;
    for (r = 0; r < app.SIZE; r++) {
      board[r] = [];
      for (c = 0; c < app.SIZE; c++) {
        board[r][c] = app.adminDraftBoard[r][c];
      }
    }
    wx.request(
      Object.assign(roomApi.mePuzzleFriendRoomOptions(board, app.adminPuzzleSideToMove), {
        success: function(res) {
          wx.hideLoading();
          if ((res.statusCode !== 200 && res.statusCode !== 201) || !res.data) {
            app._puzzleFriendInviteSnapshot = null;
            wx.showToast({
              title: '创建失败 ' + (res.statusCode || ''),
              icon: 'none'
            });
            return;
          }
          var d = res.data;
          app.exitAdminPuzzleScreen();
          app.onlineRoomId = d.roomId;
          /** 须用 spectatorToken 连 WS：服务端仅该 token 视为旁观；用 blackToken 会当作黑方棋手，STATE.spectator=false 会清掉旁观态与残局底栏 */
          app.onlineToken = d.spectatorToken || d.blackToken;
          app.onlineSpectatorMode = true;
          app.onlinePuzzleFriendRoom = true;
          app.pvpOnlineYourColor = app.BLACK;
          app.isPvpLocal = false;
          app.isRandomMatch = false;
          app.isPvpOnline = true;
          app.screen = 'game';
          app.lastOpponentMove = null;
          app.board = gomoku.createBoard();
          app.current = app.BLACK;
          app.gameOver = false;
          app.winner = null;
          app.lastMsg = '等待好友加入…';
          app.startOnlineSocket();
          app.draw();
          if (typeof wx.shareAppMessage === 'function') {
            wx.shareAppMessage(
              puzzleFriendInviteShareMessageOpts(
                '五子棋残局 房号 ' + app.onlineRoomId,
                app.onlineRoomId
              )
            );
          } else {
            app._puzzleFriendInviteSnapshot = null;
            if (typeof wx.showToast === 'function') {
              wx.showToast({
                title: '请点右上角菜单转发给好友',
                icon: 'none'
              });
            }
          }
        },
        fail: function() {
          wx.hideLoading();
          app._puzzleFriendInviteSnapshot = null;
          wx.showToast({ title: '网络请求失败', icon: 'none' });
        }
      })
    );
  });
};

/**
 * 每日残局：按当前盘面与「下一手」创建好友房；房主仅旁观（spectator token），好友执白与人机对局；
 * 好友进房后服务端重置棋盘并启用黑/白人机。
 */
app.startDailyPuzzleFriendInvite = function() {
  if (
    app.isPvpOnline &&
    app.onlineSpectatorMode &&
    app.onlinePuzzleFriendRoom &&
    app.onlineRoomId
  ) {
    if (typeof wx.shareAppMessage === 'function') {
      wx.shareAppMessage(
        puzzleFriendInviteShareMessageOpts(
          '来下这盘残局 · 房号 ' + app.onlineRoomId,
          app.onlineRoomId
        )
      );
    } else if (typeof wx.showToast === 'function') {
      wx.showToast({
        title: '请点右上角菜单转发给好友',
        icon: 'none'
      });
    }
    return;
  }
  if (!app.isDailyPuzzle || !app.board) {
    return;
  }
  if (app.dailyPuzzleSubmitting) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '提交判题中…', icon: 'none' });
    }
    return;
  }
  if (app.gameOver) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '对局已结束', icon: 'none' });
    }
    return;
  }
  authApi.ensureSession(function(sessionOk, errHint) {
    if (!sessionOk) {
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      return;
    }
    if (typeof app.destroyAiWorker === 'function') {
      app.destroyAiWorker();
    }
    app.dailyPuzzleBotGen++;
    app.disconnectOnline();
    app._puzzleFriendInviteSnapshot = {
      kind: 'daily',
      board: copyBoardMatrixForSnapshot(app.board),
      current: app.current,
      dailyPuzzleMeta: app.dailyPuzzleMeta
        ? JSON.parse(JSON.stringify(app.dailyPuzzleMeta))
        : null,
      dailyPuzzleMoves: cloneDailyPuzzleMovesForSnapshot(app.dailyPuzzleMoves),
      dailyPuzzleInitialBoard: app.dailyPuzzleInitialBoard
        ? copyBoardMatrixForSnapshot(app.dailyPuzzleInitialBoard)
        : null,
      dailyPuzzleSideToMoveStart: app.dailyPuzzleSideToMoveStart,
      dailyPuzzleUserColor: app.dailyPuzzleUserColor,
      dailyPuzzleBotGen: app.dailyPuzzleBotGen
    };
    wx.showLoading({ title: '创建房间…', mask: true });
    var board = [];
    var r;
    var c;
    for (r = 0; r < app.SIZE; r++) {
      board[r] = [];
      for (c = 0; c < app.SIZE; c++) {
        board[r][c] = app.board[r][c];
      }
    }
    var sideToMove = app.current;
    wx.request(
      Object.assign(roomApi.mePuzzleFriendRoomOptions(board, sideToMove), {
        success: function(res) {
          wx.hideLoading();
          if ((res.statusCode !== 200 && res.statusCode !== 201) || !res.data) {
            app._puzzleFriendInviteSnapshot = null;
            wx.showToast({
              title: '创建失败 ' + (res.statusCode || ''),
              icon: 'none'
            });
            return;
          }
          var d = res.data;
          app.isDailyPuzzle = false;
          app.dailyPuzzleMeta = null;
          app.dailyPuzzleMoves = [];
          app.dailyPuzzleInitialBoard = null;
          app.dailyPuzzleSubmitting = false;
          app.dailyPuzzleResultKind = '';
          app.dailyPuzzleSubmitActivityPointsDelta = null;
          app.showResultOverlay = false;
          app.onlineResultOverlaySticky = false;
          app.onlineRoomId = d.roomId;
          /** 须用 spectatorToken 连 WS，否则房主被当作黑方棋手，STATE 会覆盖旁观态（见 admin 邀请同源注释） */
          app.onlineToken = d.spectatorToken || d.blackToken;
          app.onlineSpectatorMode = true;
          app.onlinePuzzleFriendRoom = true;
          app.pvpOnlineYourColor = app.BLACK;
          app.isPvpLocal = false;
          app.isRandomMatch = false;
          app.isPvpOnline = true;
          app.screen = 'game';
          app.lastOpponentMove = null;
          app.board = gomoku.createBoard();
          app.current = app.BLACK;
          app.gameOver = false;
          app.winner = null;
          app.lastMsg = '等待好友加入…';
          app.startOnlineSocket();
          app.draw();
          if (typeof wx.shareAppMessage === 'function') {
            wx.shareAppMessage(
              puzzleFriendInviteShareMessageOpts(
                '来下这盘残局 · 房号 ' + app.onlineRoomId,
                app.onlineRoomId
              )
            );
          } else {
            app._puzzleFriendInviteSnapshot = null;
            if (typeof wx.showToast === 'function') {
              wx.showToast({
                title: '请点右上角菜单转发给好友',
                icon: 'none'
              });
            }
          }
        },
        fail: function() {
          wx.hideLoading();
          app._puzzleFriendInviteSnapshot = null;
          wx.showToast({ title: '网络请求失败', icon: 'none' });
        }
      })
    );
  });
};

app.joinOnlineAsGuest = function(roomId) {
  if (!roomId) {
    return;
  }
  app.onlineInviteConsumed = true;
  authApi.ensureSession(function (sessionOk, errHint) {
    if (!sessionOk) {
      app.onlineInviteConsumed = false;
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      return;
    }
    app.disconnectOnline();
    wx.showLoading({ title: '加入房间…', mask: true });
    wx.request(
      Object.assign(roomApi.roomApiJoinOptions(roomId), {
    success: function (res) {
      wx.hideLoading();
        if (res.statusCode !== 200 || !res.data) {
        app.onlineInviteConsumed = false;
        var msg = '无法加入';
        if (res.statusCode === 401) {
          msg = '请先登录';
        } else if (res.statusCode === 404) {
          msg = '房间不存在';
        } else if (res.statusCode === 409) {
          var er = res.data;
          if (typeof er === 'string') {
            try {
              er = JSON.parse(er);
            } catch (eJoinParse) {
              er = null;
            }
          }
          var code = er && er.code;
          if (code === 'SAME_USER') {
            msg =
              (er && er.message && String(er.message).trim()) ||
              '不能使用与房主相同的账号加入';
          } else if (code === 'ROOM_FULL') {
            msg =
              (er && er.message && String(er.message).trim()) || '房间已满';
          } else {
            msg =
              (er && er.message && String(er.message).trim()) || '无法加入';
          }
        } else if (res.statusCode === 503) {
          msg = '暂无人机账号，请稍后重试';
        }
        wx.showToast({ title: msg, icon: 'none' });
        return;
      }
      var d = res.data;
      app.isDailyPuzzle = false;
      app.dailyPuzzleMeta = null;
      app.dailyPuzzleMoves = [];
      app.dailyPuzzleInitialBoard = null;
      app.dailyPuzzleSubmitting = false;
      app.dailyPuzzleResultKind = '';
      app.dailyPuzzleSubmitActivityPointsDelta = null;
      if (typeof app.destroyAiWorker === 'function') {
        app.destroyAiWorker();
      }
      app.dailyPuzzleBotGen = (app.dailyPuzzleBotGen || 0) + 1;
      app.onlineRoomId = roomId;
      var joinTok =
        d.yourToken != null && d.yourToken !== ''
          ? d.yourToken
          : d.blackToken != null && d.blackToken !== ''
            ? d.blackToken
            : d.whiteToken;
      var joinColor;
      if (d.yourColor != null && d.yourColor !== '') {
        joinColor = Number(d.yourColor);
      } else if (joinTok != null && joinTok === d.blackToken) {
        joinColor = app.BLACK;
      } else {
        joinColor = app.WHITE;
      }
      app.onlineToken = joinTok;
      app.onlineSpectatorMode = false;
      app.pvpOnlineYourColor =
        joinColor === app.BLACK ? app.BLACK : app.WHITE;
      app.isPvpLocal = false;
      app.isRandomMatch = false;
      app.screen = 'game';
      app.lastOpponentMove = null;
      app.board = gomoku.createBoard();
      app.current = app.BLACK;
      app.gameOver = false;
      app.winner = null;
      app.lastMsg = '';
      app.startOnlineSocket();
      app.draw();
    },
    fail: function () {
      wx.hideLoading();
      app.onlineInviteConsumed = false;
      wx.showToast({ title: '网络请求失败', icon: 'none' });
    }
  })
    );
  });
}

/** 分享链接带 roomId：直接进入加入房间（不再展示 canvas「好友邀请你下棋」门闩） */
app.tryLaunchOnlineInvite = function(query) {
  if (app.onlineInviteConsumed || app.isPvpOnline) {
    return;
  }
  if (!query || String(query.online) !== '1' || !query.roomId) {
    return;
  }
  var rid = String(query.roomId);
  app.screen = 'home';
  if (typeof app.draw === 'function') {
    app.draw();
  }
  app.joinOnlineAsGuest(rid);
};

/* ---------- 棋盘布局与菜单几何 ---------- */

/** 对局/回放顶栏：取状态栏与 safeArea.top 较大值，避免标题与局时限落入刘海/灵动岛区域 */
app.getGameScreenInsetTop = function() {
  var sb = app.sys.statusBarHeight || 24;
  var safeTop =
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0;
  return Math.max(sb, safeTop);
};

/**
 * 随机匹配页：主标题 / 寻敌文案 / 取消 相对安全区排布，避免刘海与灵动岛遮挡。
 */
app.getMatchingPageLayout = function() {
  var insetTop = app.getGameScreenInsetTop();
  var safeBottom =
    app.sys.safeArea && app.sys.safeArea.bottom != null
      ? Math.max(0, app.H - app.sys.safeArea.bottom)
      : 0;
  var innerH = app.H - insetTop - safeBottom;
  var titleCy = insetTop + app.rpx(52);
  var ySeek = insetTop + innerH * 0.38;
  if (ySeek < titleCy + app.rpx(80)) {
    ySeek = titleCy + app.rpx(80);
  }
  var cancelCy = app.H - safeBottom - app.rpx(64);
  var titleCx =
    app.sys.safeArea &&
    app.sys.safeArea.width != null &&
    app.sys.safeArea.left != null
      ? app.sys.safeArea.left + app.sys.safeArea.width * 0.5
      : app.W * 0.5;
  return {
    insetTop: insetTop,
    safeBottom: safeBottom,
    innerH: innerH,
    titleCx: titleCx,
    titleCy: titleCy,
    ySeek: ySeek,
    cancelCy: cancelCy
  };
};

app.computeLayout = function() {
  var insetTop = app.getGameScreenInsetTop();
  var toPx = function(n) {
    return (n * app.W) / 750;
  };
  var titleFsApprox = Math.max(14, Math.round(toPx(15)));
  var titleCyApprox = insetTop + titleFsApprox * 0.45;
  /* 联机：主标题下预留一条带，供大号局时限画在棋盘上方 */
  var headerBottom = titleCyApprox + titleFsApprox * 0.48;
  var onlineClockStrip =
    app.isPvpOnline &&
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    app.shouldShowOnlineGameClockUi()
      ? toPx(52)
      : 0;
  var topBar = Math.max(44, headerBottom + toPx(8) + onlineClockStrip);
  /* 残局管理：为「题目标题/排期」横条与棋盘间留白（与 part6 getAdminPuzzleMetaBarLayout 配套） */
  if (app.screen === 'admin_puzzle') {
    topBar += toPx(210);
  }
  var safeBottom = 0;
  if (
    app.sys &&
    app.sys.safeArea &&
    typeof app.sys.safeArea.bottom === 'number'
  ) {
    safeBottom = Math.max(0, app.H - app.sys.safeArea.bottom);
  }
  var barHr = app.GAME_ACTION_BAR_H_RPX != null ? app.GAME_ACTION_BAR_H_RPX : 128;
  var stHr =
    app.GAME_STATUS_CHIP_H_RPX != null ? app.GAME_STATUS_CHIP_H_RPX : 0;
  var barH = toPx(barHr);
  var stH = toPx(stHr);
  /* 棋盘下缘与底栏之间的留白；底栏本身贴 safe area 底边（见 bottomY） */
  var gap = toPx(12);
  var padBottom = toPx(4);
  var bottomReserve = barH + stH + gap + safeBottom + padBottom;
  bottomReserve = Math.min(240, Math.max(barH + stH + safeBottom + gap, bottomReserve));
  var availH = app.H - topBar - bottomReserve;
  var sideMargin = 12;
  var availW = app.W - 2 * sideMargin;
  var maxBoard = Math.min(availW, availH);
  var span = app.SIZE - 1;
  /* 格距取整，交叉点落在逻辑整像素上，格线配合 render 内 +0.5 对齐，减少发糊 */
  var cell = Math.max(1, Math.floor(maxBoard / span));
  var originX = Math.round((app.W - span * cell) / 2);
  var originY = Math.round(topBar + (availH - span * cell) / 2);
  if (app.screen === 'admin_puzzle') {
    originY -= 30;
  }
  var boardPx = span * cell;
  /* 底栏垂直中心：条底对齐 H - safeBottom（刘海/ home 条之上） */
  var bottomY = app.H - safeBottom - barH * 0.5;
  return {
    margin: sideMargin,
    cell: cell,
    boardPx: boardPx,
    originX: originX,
    originY: originY,
    size: app.SIZE,
    topBar: topBar,
    insetTop: insetTop,
    bottomY: bottomY
  };
}

app.layout = app.computeLayout();

app.fillAmbientBackground = function() {
  var th = app.getUiTheme();
  var g;
  if (th.id === 'classic') {
    g = app.ctx.createLinearGradient(0, 0, 0, app.H);
    g.addColorStop(0, '#FFF0E4');
    g.addColorStop(0.38, '#FFF6ED');
    g.addColorStop(1, '#FFFCF9');
  } else {
    g = app.ctx.createLinearGradient(0, 0, app.W, app.H);
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.52, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
  }
  app.ctx.fillStyle = g;
  app.ctx.fillRect(0, 0, app.W, app.H);
  var topLight = app.ctx.createRadialGradient(
    app.W * 0.5,
    -app.H * 0.05,
    0,
    app.W * 0.5,
    app.H * 0.28,
    app.H * 0.95
  );
  if (th.id === 'ink') {
    topLight.addColorStop(0, 'rgba(255, 252, 245, 0.4)');
    topLight.addColorStop(0.42, 'rgba(255, 224, 195, 0.1)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else if (th.id === 'classic') {
    topLight.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    topLight.addColorStop(0.38, 'rgba(255, 214, 180, 0.14)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else if (th.id === 'mint') {
    topLight.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
    topLight.addColorStop(0.4, 'rgba(165, 224, 228, 0.16)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    topLight.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
    topLight.addColorStop(0.45, 'rgba(255, 255, 255, 0.06)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  }
  app.ctx.fillStyle = topLight;
  app.ctx.fillRect(0, 0, app.W, app.H);
  var vignette = app.ctx.createRadialGradient(
    app.W * 0.5,
    app.H * 0.52,
    app.H * 0.12,
    app.W * 0.5,
    app.H * 0.52,
    app.H * 0.92
  );
  if (th.id === 'ink') {
    vignette.addColorStop(0, 'rgba(255, 195, 145, 0)');
    vignette.addColorStop(0.74, 'rgba(175, 125, 88, 0.05)');
    vignette.addColorStop(1, 'rgba(115, 78, 52, 0.08)');
  } else if (th.id === 'classic') {
    vignette.addColorStop(0, 'rgba(255, 140, 80, 0)');
    vignette.addColorStop(0.78, 'rgba(200, 120, 70, 0.03)');
    vignette.addColorStop(1, 'rgba(160, 90, 50, 0.05)');
  } else if (th.id === 'mint') {
    vignette.addColorStop(0, 'rgba(70, 185, 195, 0)');
    vignette.addColorStop(0.74, 'rgba(28, 95, 108, 0.04)');
    vignette.addColorStop(1, 'rgba(14, 58, 68, 0.07)');
  } else {
    vignette.addColorStop(0, 'rgba(20, 18, 28, 0)');
    vignette.addColorStop(0.72, 'rgba(18, 16, 24, 0.04)');
    vignette.addColorStop(1, 'rgba(12, 10, 18, 0.09)');
  }
  app.ctx.fillStyle = vignette;
  app.ctx.fillRect(0, 0, app.W, app.H);
}

/**
 * 首页底：纵向渐变（与 750 稿一致，避免对角线渐变把暖色「冲灰」）+ 顶光 + 轻收边。
 * 檀木：暖杏米渐变 + 轻暖色脚光；青瓷/水墨仍用主题 bg。
 */
app.fillHomeBackground = function(th) {
  if (!th) {
    th = app.getCurrentTheme();
  }
  var g = app.ctx.createLinearGradient(0, 0, 0, app.H);
  if (th.id === 'classic') {
    g.addColorStop(0, '#FFF0E4');
    g.addColorStop(0.38, '#FFF6ED');
    g.addColorStop(1, '#FFFCF9');
  } else {
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.42, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
  }
  app.ctx.fillStyle = g;
  app.ctx.fillRect(0, 0, app.W, app.H);
  var topLight = app.ctx.createRadialGradient(
    app.W * 0.5,
    -app.H * 0.06,
    0,
    app.W * 0.5,
    app.H * 0.3,
    app.H * 0.92
  );
  if (th.id === 'ink') {
    topLight.addColorStop(0, 'rgba(255, 252, 245, 0.42)');
    topLight.addColorStop(0.4, 'rgba(255, 230, 200, 0.12)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else if (th.id === 'mint') {
    topLight.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    topLight.addColorStop(0.36, 'rgba(172, 228, 232, 0.18)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else if (th.id === 'classic') {
    topLight.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
    topLight.addColorStop(0.4, 'rgba(255, 210, 175, 0.16)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    topLight.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    topLight.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
    topLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  }
  app.ctx.fillStyle = topLight;
  app.ctx.fillRect(0, 0, app.W, app.H);
  var vignette = app.ctx.createRadialGradient(
    app.W * 0.5,
    app.H * 0.55,
    app.H * 0.1,
    app.W * 0.5,
    app.H * 0.55,
    app.H * 0.95
  );
  if (th.id === 'ink') {
    vignette.addColorStop(0, 'rgba(255, 200, 150, 0)');
    vignette.addColorStop(0.72, 'rgba(180, 130, 90, 0.05)');
    vignette.addColorStop(1, 'rgba(120, 80, 55, 0.08)');
  } else if (th.id === 'classic') {
    vignette.addColorStop(0, 'rgba(255, 150, 100, 0)');
    vignette.addColorStop(0.76, 'rgba(210, 130, 80, 0.04)');
    vignette.addColorStop(1, 'rgba(170, 95, 55, 0.07)');
  } else if (th.id === 'mint') {
    vignette.addColorStop(0, 'rgba(70, 185, 195, 0)');
    vignette.addColorStop(0.74, 'rgba(28, 95, 108, 0.04)');
    vignette.addColorStop(1, 'rgba(14, 58, 68, 0.07)');
  } else {
    vignette.addColorStop(0, 'rgba(24, 20, 18, 0)');
    vignette.addColorStop(0.72, 'rgba(20, 18, 22, 0.035)');
    vignette.addColorStop(1, 'rgba(14, 12, 16, 0.08)');
  }
  app.ctx.fillStyle = vignette;
  app.ctx.fillRect(0, 0, app.W, app.H);
  if (th.id === 'mint') {
    var footM = app.ctx.createLinearGradient(0, app.H * 0.65, 0, app.H);
    footM.addColorStop(0, 'rgba(255, 255, 255, 0)');
    footM.addColorStop(1, 'rgba(148, 212, 218, 0.26)');
    app.ctx.fillStyle = footM;
    app.ctx.fillRect(0, 0, app.W, app.H);
  } else if (th.id === 'ink') {
    var footI = app.ctx.createLinearGradient(0, app.H * 0.64, 0, app.H);
    footI.addColorStop(0, 'rgba(255, 255, 255, 0)');
    footI.addColorStop(1, 'rgba(200, 150, 110, 0.08)');
    app.ctx.fillStyle = footI;
    app.ctx.fillRect(0, 0, app.W, app.H);
  } else if (th.id === 'classic') {
    var footC = app.ctx.createLinearGradient(0, app.H * 0.62, 0, app.H);
    footC.addColorStop(0, 'rgba(255, 255, 255, 0)');
    footC.addColorStop(1, 'rgba(255, 185, 140, 0.1)');
    app.ctx.fillStyle = footC;
    app.ctx.fillRect(0, 0, app.W, app.H);
  }
}

/** 首页左上角：围棋阴阳意象小标 */
app.drawHomeAppLogo = function(cx, cy, r) {
  app.ctx.save();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  app.ctx.fillStyle = '#FFFFFF';
  app.ctx.fill();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5);
  app.ctx.lineTo(cx, cy);
  app.ctx.closePath();
  app.ctx.fillStyle = '#1A1A1A';
  app.ctx.fill();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy - r / 2, r / 2, 0, Math.PI * 2);
  app.ctx.fillStyle = '#1A1A1A';
  app.ctx.fill();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy + r / 2, r / 2, 0, Math.PI * 2);
  app.ctx.fillStyle = '#FAFAFA';
  app.ctx.fill();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy - r / 2, r / 6, 0, Math.PI * 2);
  app.ctx.fillStyle = '#FAFAFA';
  app.ctx.fill();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy + r / 2, r / 6, 0, Math.PI * 2);
  app.ctx.fillStyle = '#1A1A1A';
  app.ctx.fill();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  app.ctx.strokeStyle = '#3E3A34';
  app.ctx.lineWidth = 1.2;
  app.ctx.stroke();
  app.ctx.restore();
}

/** 首页主标题区（无顶栏时兜底；顶栏以 getHomeNavBarLayout 为准） */
app.getHomeTextLayout = function() {
  var sb = app.sys.statusBarHeight || 24;
  var safeTop =
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var titleY = insetTop + 11;
  return { titleY: titleY, insetTop: insetTop };
}

/**
 * 首页顶栏：高 120rpx；左内边距 30rpx + 头像；中间标题「团团五子棋」
 */
app.getHomeNavBarLayout = function() {
  var sb = app.sys.statusBarHeight || 24;
  var safeTop =
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var safeLeft =
    app.sys.safeArea && app.sys.safeArea.left != null ? app.sys.safeArea.left : 0;
  var navH = app.rpx(120);
  var navTop = insetTop;
  var navBottom = navTop + navH;
  var padX = app.rpx(30);
  var avatarR = app.rpx(48);
  var avatarCy = navTop + navH / 2;
  var avatarCx = safeLeft + padX + avatarR;
  return {
    navTop: navTop,
    navH: navH,
    navBottom: navBottom,
    insetTop: insetTop,
    safeLeft: safeLeft,
    padX: padX,
    avatarR: avatarR,
    avatarCx: avatarCx,
    avatarCy: avatarCy
  };
}

/**
 * 首页顶栏头像：有网络图时为阴影 + 圆图 + 白边；否则与棋盘相同按性别默认（本地图或 女/男 占位）
 */
app.drawHomeHeaderAvatar = function(ctx, img, cx, cy, r, th) {
  var dx = Math.round(cx - r);
  var dy = Math.round(cy - r);
  var dw = Math.round(r * 2);
  var rcx = dx + dw * 0.5;
  var rcy = dy + dw * 0.5;
  var rr = dw * 0.5;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = Math.max(4, r * 0.25);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  if (img && img.width && img.height) {
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
    ctx.clip();
    var sw = Math.min(img.width, img.height);
    var sx = (img.width - sw) / 2;
    var sy = (img.height - sw) / 2;
    ctx.drawImage(img, sx, sy, sw, sw, dx, dy, dw, dw);
    ctx.restore();
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    /** 与棋盘侧一致：无网络头像且本地默认图未就绪时按性别占位（女/男） */
    ctx.restore();
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    defaultAvatars.drawCircleAvatar(ctx, img, cx, cy, r, th);
  }
  ctx.restore();
}

/**
 * 侧滑抽屉：宽度 = 原屏宽 1/3 再减 1/3（即屏宽 2/9）；高度 = 原屏高 1/3 再减 1/2（即屏高 1/6）；
 * 面板在头像/顶栏下方，右侧与下方为蒙层。
 */
app.getHomeDrawerLayout = function() {
  var nav = app.getHomeNavBarLayout();
  var panelW = (app.W / 3) * (2 / 3);
  var panelTop = nav.navBottom;
  var panelH = (app.H / 3) / 2;
  return {
    panelW: panelW,
    panelTop: panelTop,
    panelH: panelH,
    navBottom: nav.navBottom
  };
}

/** 将整图等比缩放入边长 box 的正方形，居中于 (cx, cy)；成功返回 true */
app.drawHomeUiImageContain = function(img, cx, cy, box) {
  if (!img || !img.width || !img.height || !(box > 0)) {
    return false;
  }
  var iw = img.width;
  var ih = img.height;
  var scale = Math.min(box / iw, box / ih);
  var dw = iw * scale;
  var dh = ih * scale;
  var x0 = cx - dw * 0.5;
  var y0 = cy - dh * 0.5;
  app.ctx.drawImage(img, app.snapPx(x0), app.snapPx(y0), dw, dh);
  return true;
}

/** 雪碧图或静态吉祥物图是否已就绪（与 drawHomeMascotAsset 判定一致） */
app.hasHomeMascotMediaLoaded = function(box) {
  if (!(box > 0)) {
    return false;
  }
  var sheet = app.homeMascotSheetImg;
  var n = app.MASCOT_SHEET_FRAME_COUNT;
  if (sheet && sheet.width > 0 && sheet.height > 0 && n >= 1) {
    var fw = sheet.width / n;
    if (fw > 0) {
      return true;
    }
  }
  return !!(app.homeMascotImg && app.homeMascotImg.width && app.homeMascotImg.height);
}

/**
 * 首页吉祥物：优先雪碧图逐帧；否则静态 GIF（多为首帧）或 PNG。
 * 均未加载成功则不绘制（无矢量兜底图）。
 */
app.drawHomeMascotAsset = function(cx, cy, box) {
  var sheet = app.homeMascotSheetImg;
  var n = app.MASCOT_SHEET_FRAME_COUNT;
  if (
    sheet &&
    sheet.width > 0 &&
    sheet.height > 0 &&
    n >= 1 &&
    box > 0
  ) {
    var iw = sheet.width;
    var ih = sheet.height;
    var fw = iw / n;
    if (fw > 0 && ih > 0) {
      var frame =
        n > 1
          ? Math.floor(
              (Date.now() / (1000 / Math.max(1, app.MASCOT_SHEET_FPS))) % n
            )
          : 0;
      var sx = frame * fw;
      var scale = Math.min(box / fw, box / ih);
      var dw = fw * scale;
      var dh = ih * scale;
      var x0 = cx - dw * 0.5;
      var y0 = cy - dh * 0.5;
      app.ctx.drawImage(
        sheet,
        sx,
        0,
        fw,
        ih,
        app.snapPx(x0),
        app.snapPx(y0),
        dw,
        dh
      );
      return true;
    }
  }
  return app.drawHomeUiImageContain(app.homeMascotImg, cx, cy, box);
}

app.loadHomeUiAssets = function() {
  if (typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  if (app.homeUiAssetsAppliedRev === app.HOME_UI_ASSETS_REV) {
    return;
  }
  if (app.homeUiAssetsLoadInFlight) {
    return;
  }
  app.homeUiAssetsLoadInFlight = true;
  app.homeDockCheckinImg = null;
  app.homeDockRankImg = null;
  app.homeDockHistoryImg = null;
  app.homeDockSkinImg = null;
  app.shopThemeMintBoardImg = null;
  app.shopThemeInkBoardImg = null;
  app.tuanMoePieceBlackImg = null;
  app.tuanMoePieceWhiteImg = null;
  app.qingtaoLibaiPieceBlackImg = null;
  app.qingtaoLibaiPieceWhiteImg = null;
  app.homeMascotImg = null;
  app.homeMascotSheetImg = null;
  app.gameBarHomeImg = null;
  app.gameBarUndoImg = null;
  app.gameBarResetImg = null;
  app.gameBarInviteImg = null;
  app.gameBarDrawImg = null;
  app.gameBarResignImg = null;

  var loadPhase = 1;
  var remaining = 16;
  function oneDone() {
    remaining--;
    if (remaining > 0) {
      return;
    }
    if (loadPhase === 1) {
      /** 首批 UI 图（含对局底栏 game-bar-*.png）已就绪；勿等吉祥物分包再 draw，否则会长期显示矢量占位 */
      app.draw();
      startMascotAssetsAfterSubpackage();
      return;
    }
    app.homeUiAssetsAppliedRev = app.HOME_UI_ASSETS_REV;
    app.homeUiAssetsLoadInFlight = false;
    app.draw();
  }
  /** 包内路径部分机型需带前导 / 或 ./，失败则换一条 */
  function homeUiPathCandidates(rel) {
    var a = rel.indexOf('/') === 0 ? rel.slice(1) : '/' + rel;
    var out = [rel, a];
    if (rel.indexOf('./') !== 0) {
      out.push('./' + rel);
    }
    return out;
  }
  function bind(rel, assign) {
    var paths = homeUiPathCandidates(rel);
    function tryIdx(idx) {
      if (idx >= paths.length) {
        assign(null);
        oneDone();
        return;
      }
      var img = wx.createImage();
      img.onload = function () {
        assign(img);
        oneDone();
      };
      img.onerror = function () {
        tryIdx(idx + 1);
      };
      img.src = paths[idx];
    }
    tryIdx(0);
  }
  /** 按顺序尝试多个资源（如先 GIF 再 PNG）；小游戏 Canvas 对 GIF 通常只显示首帧，真动画靠雪碧图 */
  function bindFirstMatch(rels, assign) {
    var ri = 0;
    function nextRel() {
      if (ri >= rels.length) {
        assign(null);
        oneDone();
        return;
      }
      var paths = homeUiPathCandidates(rels[ri]);
      var pi = 0;
      function tryPath() {
        if (pi >= paths.length) {
          ri++;
          nextRel();
          return;
        }
        var img = wx.createImage();
        img.onload = function () {
          assign(img);
          oneDone();
        };
        img.onerror = function () {
          pi++;
          tryPath();
        };
        img.src = paths[pi];
      }
      tryPath();
    }
    nextRel();
  }

  function loadMascotWithPrefix(prefix) {
    loadPhase = 2;
    remaining = 2;
    bindFirstMatch(
      [prefix + 'home-mascot.png', prefix + 'home-mascot.gif'],
      function (im) {
        app.homeMascotImg = im;
      }
    );
    bind(prefix + 'home-mascot-sheet.png', function (im) {
      app.homeMascotSheetImg = im;
    });
  }

  function startMascotAssetsAfterSubpackage() {
    if (typeof wx.loadSubpackage === 'function') {
      wx.loadSubpackage({
        name: app.HOME_SUBPACKAGE_NAME,
        success: function () {
          loadMascotWithPrefix(app.MASCOT_SUBPKG_PREFIX);
        },
        fail: function () {
          loadMascotWithPrefix('images/ui/');
        }
      });
    } else {
      loadMascotWithPrefix(app.MASCOT_SUBPKG_PREFIX);
    }
  }

  bind('images/ui/home-dock-checkin.png', function (im) {
    app.homeDockCheckinImg = im;
  });
  bind('images/ui/home-dock-rank.png', function (im) {
    app.homeDockRankImg = im;
  });
  bind('images/ui/home-dock-history.png', function (im) {
    app.homeDockHistoryImg = im;
  });
  bind('images/ui/home-dock-skin.png', function (im) {
    app.homeDockSkinImg = im;
  });
  bind('images/ui/shop-celadon-board.png', function (im) {
    app.shopThemeMintBoardImg = im;
  });
  bind('images/ui/shop-ink-board.png', function (im) {
    app.shopThemeInkBoardImg = im;
  });
  bind('images/pieces/tuan-black.png', function (im) {
    app.tuanMoePieceBlackImg = im;
  });
  bind('images/pieces/tuan-white.png', function (im) {
    app.tuanMoePieceWhiteImg = im;
  });
  bind('images/pieces/fruit1.png', function (im) {
    app.qingtaoLibaiPieceBlackImg = im;
  });
  bind('images/pieces/fruit2.png', function (im) {
    app.qingtaoLibaiPieceWhiteImg = im;
  });
  bind('images/ui/game-bar-home.png', function (im) {
    app.gameBarHomeImg = im;
  });
  bind('images/ui/game-bar-undo.png', function (im) {
    app.gameBarUndoImg = im;
  });
  bind('images/ui/game-bar-reset.png', function (im) {
    app.gameBarResetImg = im;
  });
  bind('images/ui/game-bar-invitation.png', function (im) {
    app.gameBarInviteImg = im;
  });
  bind('images/ui/game-bar-draw.png', function (im) {
    app.gameBarDrawImg = im;
  });
  bind('images/ui/game-bar-resign.png', function (im) {
    app.gameBarResignImg = im;
  });
}

app.drawHomeNavBar = function(th) {
  var L = app.getHomeNavBarLayout();
  app.ctx.save();
  var img = app.getMyAvatarImageForUi();
  app.drawHomeHeaderAvatar(app.ctx, img, L.avatarCx, L.avatarCy, L.avatarR, th);
  var navTitleFs = Math.max(1, Math.round(app.rpx(34)));
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    '700 ' +
    navTitleFs +
    'px -apple-system, "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = th.title;
  var titleCx = app.W * 0.5;
  if (
    app.sys.safeArea &&
    app.sys.safeArea.width != null &&
    app.sys.safeArea.left != null
  ) {
    titleCx = app.sys.safeArea.left + app.sys.safeArea.width * 0.5;
  }
  app.ctx.fillText('团团五子棋', app.snapPx(titleCx), app.snapPx(L.avatarCy));
  app.ctx.strokeStyle =
    th.id === 'ink' ? 'rgba(42, 38, 34, 0.12)' : 'rgba(0, 0, 0, 0.06)';
  app.ctx.lineWidth = 1;
  app.ctx.beginPath();
  app.ctx.moveTo(0, app.snapPx(L.navBottom));
  app.ctx.lineTo(app.snapPx(app.W), app.snapPx(L.navBottom));
  app.ctx.stroke();
  app.ctx.restore();
}

/**
 * 侧栏仅管理员可见，且只有「残局管理」（左缘侧滑或点头像下方图标打开）。
 */
app.getHomeDrawerRows = function() {
  if (!app.userIsAdmin) {
    return [];
  }
  return [{ label: '残局管理', kind: 'admin_puzzle' }];
}

/**
 * 侧栏列表行几何（与绘制一致，供 hit 使用）
 * @param {number} rowIndex
 */
app.getHomeDrawerRowLayout = function(rowIndex) {
  var D = app.getHomeDrawerLayout();
  var rowPadTop = app.rpx(12);
  var rowGap = app.rpx(6);
  var rowH = app.rpx(52);
  var padX = app.rpx(10);
  var idx = rowIndex | 0;
  var y0 = D.panelTop + rowPadTop + idx * (rowH + rowGap);
  var pw = D.panelW;
  var x0 = padX;
  var w = pw - padX * 2;
  return {
    x0: x0,
    y0: y0,
    w: w,
    h: rowH,
    rr: app.rpx(12),
    glyphCx: padX + app.rpx(20),
    glyphCy: y0 + rowH * 0.5,
    textX: padX + app.rpx(42),
    textCy: y0 + rowH * 0.5,
    chevronX: pw - padX - app.rpx(12)
  };
};

/** 侧栏「残局」示意：圆角方框 + 十字分割线 */
app.drawHomeDrawerPuzzleGlyph = function(cx, cy, color, size) {
  var half = size * 0.38;
  app.ctx.save();
  app.ctx.strokeStyle = color;
  app.ctx.lineWidth = Math.max(1.2, size * 0.09);
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  app.roundRect(cx - half, cy - half, half * 2, half * 2, size * 0.14);
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.moveTo(cx, cy - half);
  app.ctx.lineTo(cx, cy + half);
  app.ctx.moveTo(cx - half, cy);
  app.ctx.lineTo(cx + half, cy);
  app.ctx.stroke();
  app.ctx.restore();
};

/** 侧栏列表行右侧 › */
app.drawHomeDrawerRowChevron = function(cx, cy, color, size) {
  var d = (size && size > 0 ? size : app.rpx(18)) * 0.42;
  app.ctx.save();
  app.ctx.strokeStyle = color;
  app.ctx.lineWidth = Math.max(1.5, app.rpx(2.5));
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  app.ctx.beginPath();
  app.ctx.moveTo(cx - d * 0.45, cy - d);
  app.ctx.lineTo(cx + d * 0.35, cy);
  app.ctx.lineTo(cx - d * 0.45, cy + d);
  app.ctx.stroke();
  app.ctx.restore();
};

app.drawHomeDrawer = function(th) {
  if (!app.homeDrawerOpen) {
    return;
  }
  var nav = app.getHomeNavBarLayout();
  var D = app.getHomeDrawerLayout();
  var pw = D.panelW;
  var pt = D.panelTop;
  var ph = D.panelH;
  var pr = app.rpx(14);
  app.ctx.save();
  app.ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  app.ctx.fillRect(0, nav.navBottom, app.W, app.H - nav.navBottom);
  /** 与首页「随机匹配」幽灵按钮同源：btnGhostFill 渐变 + 顶光 + 描边 */
  var baseHex = th.btnGhostFill;
  var rgb = app.homePillHexToRgb(baseHex);
  var fillStyle;
  if (rgb) {
    var c0 = app.homePillMixRgb(rgb, 0.38, { r: 255, g: 255, b: 255 });
    var c1 = app.homePillMixRgb(rgb, 0.06, { r: 0, g: 0, b: 0 });
    var lg = app.ctx.createLinearGradient(0, pt, 0, pt + ph);
    lg.addColorStop(0, app.homePillRgbCss(c0));
    lg.addColorStop(1, app.homePillRgbCss(c1));
    fillStyle = lg;
  } else {
    fillStyle = baseHex;
  }
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.07)';
  app.ctx.shadowBlur = app.rpx(10);
  app.ctx.shadowOffsetX = 0;
  app.ctx.shadowOffsetY = app.rpx(4);
  app.ctx.fillStyle = fillStyle;
  app.roundRect(0, pt, pw, ph, pr);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.save();
  app.roundRect(0, pt, pw, ph, pr);
  app.ctx.clip();
  var gh = ph * 0.48;
  var gl = app.ctx.createLinearGradient(0, pt, 0, pt + gh);
  gl.addColorStop(0, 'rgba(255,255,255,0.5)');
  gl.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  app.ctx.fillStyle = gl;
  app.ctx.fillRect(0, pt, pw, gh);
  app.ctx.restore();
  app.ctx.strokeStyle = th.btnGhostStroke;
  app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
  app.roundRect(0, pt, pw, ph, pr);
  app.ctx.stroke();

  var rows = app.getHomeDrawerRows();
  var glyphSize = app.rpx(30);
  var chevColor = th.subtitle;
  var i;
  for (i = 0; i < rows.length; i++) {
    var L = app.getHomeDrawerRowLayout(i);
    var baseRgb = app.homePillHexToRgb(th.btnGhostFill);
    app.ctx.save();
    if (baseRgb) {
      var cBg = app.homePillMixRgb(baseRgb, 0.22, { r: 255, g: 255, b: 255 });
      app.ctx.fillStyle = app.homePillRgbCss(cBg);
    } else {
      app.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    }
    app.roundRect(L.x0, L.y0, L.w, L.h, L.rr);
    app.ctx.fill();
    app.ctx.strokeStyle = th.btnGhostStroke;
    app.ctx.globalAlpha = 0.42;
    app.ctx.lineWidth = Math.max(1, app.rpx(1));
    app.roundRect(L.x0, L.y0, L.w, L.h, L.rr);
    app.ctx.stroke();
    app.ctx.globalAlpha = 1;
    app.ctx.restore();
    app.drawHomeDrawerPuzzleGlyph(
      L.glyphCx,
      L.glyphCy,
      th.btnGhostText,
      glyphSize
    );
    app.ctx.textAlign = 'left';
    app.ctx.textBaseline = 'middle';
    app.ctx.font =
      '600 ' +
      app.rpx(27) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.fillStyle = th.title;
    app.ctx.fillText(
      rows[i].label,
      app.snapPx(L.textX),
      app.snapPx(L.textCy)
    );
    app.drawHomeDrawerRowChevron(L.chevronX, L.textCy, chevColor, app.rpx(20));
  }
  app.ctx.restore();
}

app.hitHomeNavIcon = function(clientX, clientY) {
  if (app.screen !== 'home') {
    return null;
  }
  var L = app.getHomeNavBarLayout();
  if (clientY < L.navTop || clientY > L.navBottom) {
    return null;
  }
  if (app.hitCircleAvatar(clientX, clientY, L.avatarCx, L.avatarCy, L.avatarR)) {
    return 'avatar';
  }
  return null;
}

app.hitHomeDrawerBackdrop = function(clientX, clientY) {
  if (!app.homeDrawerOpen) {
    return false;
  }
  var D = app.getHomeDrawerLayout();
  if (
    clientX >= 0 &&
    clientX <= D.panelW &&
    clientY >= D.panelTop &&
    clientY <= D.panelTop + D.panelH
  ) {
    return false;
  }
  return true;
}

app.hitHomeDrawerRow = function(clientX, clientY) {
  if (!app.homeDrawerOpen) {
    return null;
  }
  var D = app.getHomeDrawerLayout();
  if (clientY < D.panelTop + 6 || clientY > D.panelTop + D.panelH - 6) {
    return null;
  }
  var rows = app.getHomeDrawerRows();
  var n = rows.length;
  if (n === 0) {
    return null;
  }
  var i;
  for (i = 0; i < n; i++) {
    var L = app.getHomeDrawerRowLayout(i);
    if (
      clientX >= L.x0 &&
      clientX <= L.x0 + L.w &&
      clientY >= L.y0 &&
      clientY <= L.y0 + L.h
    ) {
      return i;
    }
  }
  return null;
}

/** 设计稿宽度 750rpx（微信标准）→ 当前逻辑像素 */
app.rpx = function(n) {
  return (n * app.W) / 750;
}

/** #RRGGBB → {r,g,b}，失败返回 null */
app.homePillHexToRgb = function(hex) {
  if (typeof hex !== 'string' || hex.charAt(0) !== '#') {
    return null;
  }
  var h = hex.slice(1);
  if (h.length !== 6) {
    return null;
  }
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }
  return { r: r, g: g, b: b };
}

app.homePillMixRgb = function(c, t, target) {
  return {
    r: Math.round(c.r + (target.r - c.r) * t),
    g: Math.round(c.g + (target.g - c.g) * t),
    b: Math.round(c.b + (target.b - c.b) * t)
  };
}

app.homePillRgbCss = function(c) {
  return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
}

/**
 * 首页三主按钮：纵向微渐变 + 顶光高光；随机为描边浅底，好友/人机为实色（人机对比更强）
 * @param {boolean} [pressed] 按下态：略缩小下移 + 遮罩
 */
app.drawHomeReferencePill = function(cx, cy, bw, bh, label, pillKind, th, pressed) {
  var x0 = cx - bw / 2;
  var y0 = cy - bh / 2;
  var rr = bh / 2;
  var baseHex = null;
  var fg;
  var stroke = null;
  var shadowCol;
  var topLift;
  var botDepth;

  if (pillKind === 'friend') {
    baseHex = th.homeFriend != null ? th.homeFriend : th.homeCards[1];
    fg = '#FFFFFF';
    shadowCol = th.btnShadow;
    topLift = 0.2;
    botDepth = 0.14;
  } else if (pillKind === 'pve') {
    baseHex = th.homePve != null ? th.homePve : th.homeCards[0];
    fg = '#FFFFFF';
    shadowCol = th.btnShadow;
    topLift = 0.14;
    botDepth = 0.26;
  } else {
    baseHex = th.btnGhostFill;
    fg = th.btnGhostText;
    stroke = th.btnGhostStroke;
    shadowCol = 'rgba(0, 0, 0, 0.07)';
    topLift = 0.38;
    botDepth = 0.06;
  }

  var rgb = app.homePillHexToRgb(baseHex);
  var fillStyle;
  if (rgb) {
    var c0 = app.homePillMixRgb(rgb, topLift, { r: 255, g: 255, b: 255 });
    var c1 = app.homePillMixRgb(rgb, botDepth, { r: 0, g: 0, b: 0 });
    var lg = app.ctx.createLinearGradient(x0, y0, x0, y0 + bh);
    lg.addColorStop(0, app.homePillRgbCss(c0));
    lg.addColorStop(1, app.homePillRgbCss(c1));
    fillStyle = lg;
  } else {
    fillStyle = baseHex;
  }

  app.ctx.save();
  if (pressed) {
    app.ctx.translate(cx, cy);
    app.ctx.scale(0.982, 0.982);
    app.ctx.translate(-cx, -cy);
    app.ctx.translate(0, app.rpx(2));
  }
  var blurBase = pillKind === 'random' ? app.rpx(10) : app.rpx(14);
  var offY = app.rpx(pillKind === 'pve' ? 5 : 4);
  if (pressed) {
    blurBase = Math.max(app.rpx(4), blurBase * 0.55);
    offY *= 0.45;
  }
  app.ctx.shadowColor = shadowCol;
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
  var gh = bh * (pillKind === 'random' ? 0.52 : 0.48);
  var gl = app.ctx.createLinearGradient(x0, y0, x0, y0 + gh);
  if (pillKind === 'random') {
    gl.addColorStop(0, 'rgba(255,255,255,0.5)');
    gl.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    gl.addColorStop(0, 'rgba(255,255,255,0.26)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
  }
  app.ctx.fillStyle = gl;
  app.ctx.fillRect(x0, y0, bw, gh);
  app.ctx.restore();

  if (stroke) {
    app.ctx.strokeStyle = stroke;
    app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
    app.roundRect(x0, y0, bw, bh, rr);
    app.ctx.stroke();
  } else {
    app.ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    app.ctx.lineWidth = Math.max(1, app.rpx(1));
    app.roundRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1, rr - 0.5);
    app.ctx.stroke();
  }

  app.ctx.font =
    '600 ' +
    app.rpx(36) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = fg;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(label, app.snapPx(cx), app.snapPx(cy));
  if (pressed) {
    app.ctx.save();
    app.roundRect(x0, y0, bw, bh, rr);
    app.ctx.clip();
    app.ctx.fillStyle = 'rgba(0, 0, 0, 0.11)';
    app.ctx.fillRect(x0, y0, bw, bh);
    app.ctx.restore();
  }
  app.ctx.restore();
}

/** 顶栏扬声器（线框），size 为 48rpx 量级边长 */
app.drawHomeSpeakerGlyph = function(cx, cy, color, size) {
  var s = size && size > 0 ? size / 16 : 1;
  app.ctx.save();
  app.ctx.strokeStyle = color;
  app.ctx.lineWidth = Math.max(1.2, 1.65 * s * 0.85);
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  app.ctx.beginPath();
  app.ctx.moveTo(cx - 8 * s, cy - 5 * s);
  app.ctx.lineTo(cx + 1 * s, cy - 6.5 * s);
  app.ctx.lineTo(cx + 1 * s, cy + 6.5 * s);
  app.ctx.lineTo(cx - 8 * s, cy + 5 * s);
  app.ctx.closePath();
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.arc(cx + 5.5 * s, cy, 5.5 * s, -0.55, 0.55);
  app.ctx.stroke();
  app.ctx.restore();
}

/**
 * 顶栏设置：8 齿圆滑齿轮线稿 + 中心圆孔（#5C4B3A，适配约 32×32 点击区）
 * 用 r = r0 + amp*cos(8θ) 生成圆滑外齿廓
 */
app.drawHomeSettingsGlyph = function(cx, cy, color, size) {
  var s = size && size > 0 ? size / 16 : 1;
  app.ctx.save();
  app.ctx.strokeStyle = color;
  app.ctx.lineWidth = Math.max(1.1, 1.6 * s * 0.85);
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  var r0 = 7.6 * s;
  var amp = 2.75 * s;
  var n = 56;
  var i;
  app.ctx.beginPath();
  for (i = 0; i <= n; i++) {
    var t = (i / n) * Math.PI * 2;
    var r = r0 + amp * Math.cos(8 * t);
    var x = cx + Math.cos(t) * r;
    var y = cy + Math.sin(t) * r;
    if (i === 0) {
      app.ctx.moveTo(x, y);
    } else {
      app.ctx.lineTo(x, y);
    }
  }
  app.ctx.closePath();
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, 3.85 * s, 0, Math.PI * 2);
  app.ctx.stroke();
  app.ctx.restore();
}

/** 每日签到：圆角矩形底座 + 顶部地图钉 + 钉头内菱形（线稿） */
app.drawHomeDockIconCheckin = function(cx, cy, s, stroke) {
  app.ctx.save();
  app.ctx.strokeStyle = stroke;
  app.ctx.fillStyle = stroke;
  app.ctx.lineWidth = 1.4;
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  var w = s * 1.75;
  var bodyTop = cy + s * 0.15;
  var bodyH = s * 1.35;
  var rr = s * 0.22;
  var pinCy = cy - s * 0.55;
  var pinR = s * 0.32;
  app.roundRect(cx - w / 2, bodyTop, w, bodyH, rr);
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.arc(cx, pinCy, pinR, 0, Math.PI * 2);
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.moveTo(cx - w / 2 + 1.2, bodyTop);
  app.ctx.lineTo(cx - pinR * 0.85, pinCy + pinR * 0.35);
  app.ctx.lineTo(cx + pinR * 0.85, pinCy + pinR * 0.35);
  app.ctx.lineTo(cx + w / 2 - 1.2, bodyTop);
  app.ctx.stroke();
  var d = s * 0.12;
  app.ctx.beginPath();
  app.ctx.moveTo(cx, pinCy - d);
  app.ctx.lineTo(cx + d, pinCy);
  app.ctx.lineTo(cx, pinCy + d);
  app.ctx.lineTo(cx - d, pinCy);
  app.ctx.closePath();
  app.ctx.fill();
  app.ctx.restore();
}

app.drawHomeDockIconRank = function(cx, cy, s, stroke) {
  app.ctx.save();
  app.ctx.strokeStyle = stroke;
  app.ctx.lineWidth = 1.35;
  var i;
  var n = 8;
  app.ctx.beginPath();
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 - Math.PI / 2;
    var rad = i % 2 === 0 ? s * 0.82 : s * 0.42;
    var px = cx + Math.cos(a) * rad;
    var py = cy + Math.sin(a) * rad;
    if (i === 0) {
      app.ctx.moveTo(px, py);
    } else {
      app.ctx.lineTo(px, py);
    }
  }
  app.ctx.closePath();
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
  app.ctx.stroke();
  app.ctx.restore();
}

app.drawHomeDockIconHistory = function(cx, cy, s, stroke) {
  app.ctx.save();
  app.ctx.strokeStyle = stroke;
  app.ctx.lineWidth = 1.35;
  app.roundRect(cx - s * 0.88, cy - s, s * 1.76, s * 1.92, s * 0.18);
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.moveTo(cx - s * 0.88, cy - s * 0.15);
  app.ctx.lineTo(cx, cy - s * 0.75);
  app.ctx.lineTo(cx + s * 0.88, cy - s * 0.15);
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.moveTo(cx - s * 0.38, cy + s * 0.15);
  app.ctx.lineTo(cx + s * 0.38, cy + s * 0.15);
  app.ctx.stroke();
  app.ctx.restore();
}

app.drawHomeDockIconSkin = function(cx, cy, s, stroke) {
  app.ctx.save();
  app.ctx.strokeStyle = stroke;
  app.ctx.lineWidth = 1.45;
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, s * 0.72, 0, Math.PI * 2);
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.arc(cx - s * 0.2, cy - s * 0.2, s * 0.34, 0, Math.PI * 2);
  app.ctx.stroke();
  app.ctx.restore();
}

app.drawHomeBottomDock = function(hl, th) {
  var y0 = hl.bottomNavTop;
  var h = hl.bottomNavH;
  var padH = hl.dockPadH != null ? hl.dockPadH : app.rpx(52);
  app.ctx.save();
  var dockFill;
  if (th.id === 'mint') {
    /** 与 mint.bg 底部 #f1f7f5 一体，避免底栏色块跳脱 */
    dockFill = 'rgba(241, 247, 245, 0.94)';
  } else if (th.id === 'ink') {
    dockFill = 'rgba(255, 248, 238, 0.82)';
  } else {
    dockFill = 'rgba(255, 236, 218, 0.93)';
  }
  app.ctx.fillStyle = dockFill;
  app.ctx.fillRect(0, y0, app.W, app.H - y0);
  var topLine = app.ctx.createLinearGradient(0, y0, app.W, y0);
  if (th.id === 'ink') {
    topLine.addColorStop(0, 'rgba(42, 38, 34, 0)');
    topLine.addColorStop(0.5, 'rgba(42, 38, 34, 0.14)');
    topLine.addColorStop(1, 'rgba(42, 38, 34, 0)');
  } else if (th.id === 'mint') {
    topLine.addColorStop(0, 'rgba(28, 58, 70, 0)');
    topLine.addColorStop(0.5, 'rgba(28, 58, 70, 0.1)');
    topLine.addColorStop(1, 'rgba(28, 58, 70, 0)');
  } else {
    topLine.addColorStop(0, 'rgba(90, 72, 58, 0)');
    topLine.addColorStop(0.5, 'rgba(90, 72, 58, 0.12)');
    topLine.addColorStop(1, 'rgba(90, 72, 58, 0)');
  }
  app.ctx.strokeStyle = topLine;
  app.ctx.lineWidth = 1;
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(padH + app.rpx(4)), app.snapPx(y0 + 0.5));
  app.ctx.lineTo(app.snapPx(app.W - padH - app.rpx(4)), app.snapPx(y0 + 0.5));
  app.ctx.stroke();
  var labels = [
    app.isHomeCheckinDoneToday() ? '今日已签' : '每日签到',
    '我的战绩',
    '杂货铺'
  ];
  var innerW = app.W - padH * 2;
  var colW = innerW / 3;
  var baseX = padH;
  var iconBox = app.rpx(78);
  var iconY = y0 + app.rpx(34) + iconBox / 2;
  var s = iconBox * 0.14;
  /** 文案基线与图标中心的中点，作按下缩放轴心（勿用整块底栏 colMidY，否则与图标行错位） */
  var labelCy = iconY + iconBox / 2 + app.rpx(20);
  var dockPivotY = (iconY + labelCy) * 0.5;
  var i;
  /** 三格对应原四格资源列 0、2、3（已去掉对战排行列） */
  var dockImgs = [
    app.homeDockCheckinImg,
    app.homeDockHistoryImg,
    app.homeDockSkinImg
  ];
  var dockDrawVec = [
    app.drawHomeDockIconCheckin,
    app.drawHomeDockIconHistory,
    app.drawHomeDockIconSkin
  ];
  for (i = 0; i < 3; i++) {
    var cxi = baseX + colW * i + colW / 2;
    var pressed = app.homePressedDockCol === i;
    var stroke = pressed ? th.title : th.subtitle;
    app.ctx.save();
    if (pressed) {
      app.ctx.translate(cxi, dockPivotY);
      app.ctx.scale(0.96, 0.96);
      app.ctx.translate(-cxi, -dockPivotY);
      app.ctx.translate(0, app.rpx(2));
    }
    if (!app.drawHomeUiImageContain(dockImgs[i], cxi, iconY, iconBox)) {
      dockDrawVec[i](cxi, iconY, s, stroke);
    }
    app.ctx.font =
      app.rpx(24) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillStyle = pressed ? th.title : th.subtitle;
    app.ctx.globalAlpha = 1;
    app.ctx.fillText(
      labels[i],
      app.snapPx(cxi),
      app.snapPx(labelCy)
    );
    app.ctx.restore();
    if (pressed) {
      app.ctx.save();
      var rx = baseX + colW * i + app.rpx(6);
      var ry = y0 + app.rpx(8);
      var rw = colW - app.rpx(12);
      var rh = h - app.rpx(32);
      var rcr = app.rpx(14);
      app.roundRect(rx, ry, rw, rh, rcr);
      app.ctx.clip();
      app.ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
      app.ctx.fillRect(rx, ry, rw, rh);
      app.ctx.restore();
    }
  }
  app.ctx.restore();
}

app.drawHomeCopyrightBar = function(hl, th) {
  app.ctx.save();
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    app.rpx(21) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = th.muted;
  app.ctx.globalAlpha = th.id === 'classic' ? 1 : 0.72;
  app.ctx.fillText('© 团团五子棋', app.snapPx(app.W / 2), app.snapPx(hl.footerY));
  app.ctx.globalAlpha = 1;
  app.ctx.restore();
}

/**
 * 主内容区（750rpx 稿）：IP → 主按钮 → 底部功能区 + 版权。
 * 功能区与版权整体贴安全区底部；主按钮略收紧间距、底部 Dock 略加高以平衡标签行。
 */
app.getHomeLayout = function() {
  var nav = app.getHomeNavBarLayout();
  var cx =
    app.sys.safeArea &&
    app.sys.safeArea.width != null &&
    app.sys.safeArea.left != null
      ? app.sys.safeArea.left + app.sys.safeArea.width * 0.5
      : app.W / 2;
  var btnW = app.rpx(668);
  var btnH = app.rpx(116);
  var btnGap = app.rpx(36);
  var ipGap = app.rpx(40);
  var ipBlockH = app.rpx(232);
  var ipTop = nav.navBottom + ipGap;
  var mascotCy = ipTop + ipBlockH * 0.5;
  var mascotScale = app.rpx(140) / 92;
  var btnTopGap = app.rpx(48);
  /** 人机 + 每日残局并排一行，避免第四颗全宽主按钮把 Dock/吉祥物顶出屏外 */
  var btnPairGap = app.rpx(20);
  var halfBtnW = (btnW - btnPairGap) * 0.5;
  var yRandom = ipTop + ipBlockH + btnTopGap + btnH / 2;
  var yFriend = yRandom + btnH / 2 + btnGap + btnH / 2;
  var yPvePair = yFriend + btnH / 2 + btnGap + btnH / 2;
  var cxPve = cx - btnW * 0.25 - btnPairGap * 0.25;
  var cxDaily = cx + btnW * 0.25 + btnPairGap * 0.25;
  var dockTopFromFlow = yPvePair + btnH / 2 + app.rpx(28) + app.rpx(36);
  var bottomNavH = app.rpx(216);
  var footerGap = app.rpx(14);
  var copyrightHalf = app.rpx(13);
  var safeYBottom =
    app.sys.safeArea && app.sys.safeArea.bottom != null ? app.sys.safeArea.bottom : app.H;
  var footerPadBottom = app.rpx(22);
  var footerYFromSafe = safeYBottom - footerPadBottom;
  var dockTopFromBottom =
    footerYFromSafe - bottomNavH - footerGap - copyrightHalf;
  var dockTop = Math.max(dockTopFromFlow, dockTopFromBottom);
  var footerY = dockTop + bottomNavH + footerGap + copyrightHalf;
  var mainBottom = dockTop - 2;
  var dockPadH = app.rpx(52);

  return {
    cx: cx,
    btnW: btnW,
    btnH: btnH,
    gap: btnGap,
    mascotCx: cx,
    mascotCy: mascotCy,
    mascotScale: mascotScale,
    yRandom: yRandom,
    yFriend: yFriend,
    yPvePair: yPvePair,
    cxPve: cxPve,
    cxDaily: cxDaily,
    halfBtnW: halfBtnW,
    btnPairGap: btnPairGap,
    bottomNavTop: dockTop,
    bottomNavH: bottomNavH,
    footerY: footerY,
    mainBottom: mainBottom,
    dockPadH: dockPadH
  };
}

app.getRatingCardLayout = function() {
  var w = Math.min(app.W - 48, 300);
  var extra =
    app.ratingCardVisible &&
    app.ratingCardData &&
    app.ratingCardData.showSyncProfileBtn
      ? app.rpx(52)
      : 0;
  var h = 212 + extra;
  var cx = app.W / 2;
  var cy = app.H * 0.42;
  return { cx: cx, cy: cy, w: w, h: h, r: 18 };
}

/** 信息看板底部「同步头像昵称」按钮几何（与 drawRatingCardOverlay 一致） */
app.getRatingCardSyncProfileLayout = function() {
  if (!app.ratingCardData || !app.ratingCardData.showSyncProfileBtn) {
    return null;
  }
  var L = app.getRatingCardLayout();
  var x = L.cx - L.w / 2;
  var y = L.cy - L.h / 2;
  var btnW = L.w - app.rpx(28);
  var btnH = app.rpx(40);
  var pad = app.rpx(14);
  var btnTop = y + L.h - pad - btnH;
  return {
    left: x + pad,
    top: btnTop,
    w: btnW,
    h: btnH,
    cx: x + pad + btnW * 0.5,
    cy: btnTop + btnH * 0.5
  };
}

app.hitRatingCardSyncProfile = function(clientX, clientY) {
  var B = app.getRatingCardSyncProfileLayout();
  if (!B) {
    return false;
  }
  return (
    clientX >= B.left &&
    clientX <= B.left + B.w &&
    clientY >= B.top &&
    clientY <= B.top + B.h
  );
}

app.hitRatingCardInside = function(x, y) {
  var L = app.getRatingCardLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  return x >= x0 && x <= x0 + L.w && y >= y0 && y <= y0 + L.h;
}

app.hitRatingCardClose = function(x, y) {
  var L = app.getRatingCardLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  var cr = app.rpx(36);
  var padClose = app.rpx(32);
  var cx = x0 + L.w - padClose - cr / 2;
  var cy = y0 + padClose + cr / 2;
  return Math.abs(x - cx) <= cr * 0.72 && Math.abs(y - cy) <= cr * 0.72;
}

app.getLocalCalendarYmd = function() {
  var d = new Date();
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return (
    y +
    '-' +
    (m < 10 ? '0' : '') +
    m +
    '-' +
    (day < 10 ? '0' : '') +
    day
  );
}

/**
 * 从 GET /api/me/rating 或 POST /api/me/checkin 的 JSON 同步签到与团团萌肤解锁（不写本地签到键）。
 * @param {object} d
 */
app.syncCheckinStateFromServerPayload = function(d) {
  if (!d || typeof d !== 'object') {
    return;
  }
  if (typeof d.tuanMoeUnlocked === 'boolean') {
    themes.setTuanMoeUnlockedFromServer(d.tuanMoeUnlocked);
  }
  if (Array.isArray(d.pieceSkinUnlockedIds)) {
    themes.setPieceSkinUnlockedIdsFromServer(d.pieceSkinUnlockedIds);
  }
  var tClamp = themes.clampThemeIdToUnlocked(app.themeId);
  if (tClamp !== app.themeId) {
    app.themeId = tClamp;
    themes.saveThemeId(tClamp);
  }
  var hist = {};
  if (Array.isArray(d.checkinHistory)) {
    var hi;
    for (hi = 0; hi < d.checkinHistory.length; hi++) {
      var ky = d.checkinHistory[hi];
      if (ky) {
        hist[String(ky)] = true;
      }
    }
  }
  var streak = 0;
  if (typeof d.checkinStreak === 'number' && !isNaN(d.checkinStreak)) {
    streak = d.checkinStreak;
  } else if (typeof d.streak === 'number' && !isNaN(d.streak)) {
    streak = d.streak;
  }
  var pts = 0;
  if (typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)) {
    pts = d.activityPoints;
  } else if (typeof d.totalPoints === 'number' && !isNaN(d.totalPoints)) {
    pts = d.totalPoints;
  }
  var lastYmd = d.checkinLastYmd != null ? String(d.checkinLastYmd) : '';
  var streakClamped = Math.max(0, streak);
  if (typeof themes.setCheckinStreakFromServer === 'function') {
    themes.setCheckinStreakFromServer(streakClamped);
  }
  app.checkinStateCache = {
    lastYmd: lastYmd,
    streak: streakClamped,
    tuanPoints: Math.max(0, pts),
    historySet: hist
  };
  if (typeof d.eloScore === 'number' && !isNaN(d.eloScore)) {
    app.savePeakEloIfHigher(d.eloScore);
  }
  if (typeof d.pieceSkinId === 'string' && d.pieceSkinId.trim()) {
    var psid = d.pieceSkinId.trim();
    themes.applyPieceSkinIdFromServer(psid);
    app.pieceSkinId = psid;
  }
  if (typeof d.themeId === 'string' && d.themeId.trim()) {
    var thid = d.themeId.trim();
    themes.applyThemeIdFromServer(thid);
    app.themeId = themes.clampThemeIdToUnlocked(thid);
  }
}

/**
 * POST /api/me/piece-skins/redeem 成功后合并积分与解锁列表。
 * @param {object} d
 */
app.mergePieceSkinRedeemResponseToCache = function(d) {
  if (!d || typeof d !== 'object') {
    return;
  }
  if (typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)) {
    var ap = Math.max(0, Math.floor(d.activityPoints));
    if (app.checkinStateCache) {
      app.checkinStateCache.tuanPoints = ap;
    }
  }
  if (Array.isArray(d.pieceSkinUnlockedIds)) {
    themes.setPieceSkinUnlockedIdsFromServer(d.pieceSkinUnlockedIds);
  }
  var tClamp2 = themes.clampThemeIdToUnlocked(app.themeId);
  if (tClamp2 !== app.themeId) {
    app.themeId = tClamp2;
    themes.saveThemeId(tClamp2);
  }
}

/**
 * 已登录时拉取 GET /api/me/rating，同步团团萌肤解锁与签到缓存（杂货铺弹窗等依赖）。
 * @param {function()} onDone 无论成功失败都会调用
 */
app.syncMeRatingIfAuthed = function(onDone) {
  if (typeof onDone !== 'function') {
    return;
  }
  if (!authApi.getSessionToken()) {
    onDone();
    return;
  }
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
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
            if (typeof d.eloScore === 'number' && !isNaN(d.eloScore)) {
              app.homeRatingEloCache = d.eloScore;
            }
          }
        }
        onDone();
      },
      fail: function () {
        onDone();
      }
    })
  );
}

/** 佩戴成功后写入 users.piece_skin_id（失败不影响本地已保存） */
app.syncPieceSkinSelectionToServerIfAuthed = function(skinId) {
  if (!skinId || !authApi.getSessionToken()) {
    return;
  }
  wx.request(
    Object.assign(roomApi.mePieceSkinSelectOptions(skinId), {
      success: function () {},
      fail: function () {}
    })
  );
}

/** 棋盘主题装备写入 user_equipped_cosmetics.THEME（失败不影响本地已保存） */
app.syncThemeToServerIfAuthed = function(themeId) {
  if (!themeId || !authApi.getSessionToken()) {
    return;
  }
  wx.request(
    Object.assign(roomApi.meEquipOptions('THEME', themeId), {
      success: function () {},
      fail: function () {}
    })
  );
}

app.getCheckinState = function() {
  if (!app.checkinStateCache) {
    app.checkinStateCache = {
      lastYmd: '',
      streak: 0,
      tuanPoints: 0,
      historySet: {}
    };
  }
  return app.checkinStateCache;
}

app.isHomeCheckinDoneToday = function() {
  var s = app.getCheckinState();
  return s.lastYmd === app.getLocalCalendarYmd();
}

app.formatCheckinYmdKey = function(y, mo, day) {
  return (
    y +
    '-' +
    (mo < 10 ? '0' : '') +
    mo +
    '-' +
    (day < 10 ? '0' : '') +
    day
  );
}

/**
 * 签到弹窗配色：跟随当前界面主题（bg / homeCards / result / app.board）
 */
app.checkinModalThemePalette = function(th) {
  var bg = th.bg || ['#f2f2f2', '#ececec', '#e6e6e6'];
  var hc = th.homeCards || [th.btnPrimary, th.btnPrimary, th.btnPrimary];
  var h0 = hc[0];
  var h1 = hc[1] || h0;
  var h2 = hc[2] || h1;
  var res = th.result || {};
  var defEnd = res.defaultEnd || bg[2] || '#ffffff';
  var shellBot = bg[2] || bg[1] || bg[0];
  var winTitle =
    res.win && res.win.title ? res.win.title : h0;
  var id = th.id || 'classic';
  var weekBar =
    id === 'mint'
      ? 'rgba(20, 57, 66, 0.1)'
      : id === 'ink'
      ? 'rgba(36, 32, 24, 0.08)'
      : 'rgba(92, 71, 56, 0.1)';
  var cardStroke =
    id === 'ink' || id === 'mint'
      ? 'rgba(255, 255, 255, 0.65)'
      : 'rgba(255, 255, 255, 0.88)';
  var primaryDis =
    id === 'mint'
      ? 'rgba(92, 118, 128, 0.48)'
      : id === 'ink'
      ? 'rgba(133, 122, 112, 0.45)'
      : 'rgba(148, 136, 120, 0.48)';
  return {
    shellTop: bg[0],
    shellMid: bg[1],
    shellBot: shellBot,
    innerCard: defEnd,
    innerCardShade: shellBot,
    cardStroke: cardStroke,
    weekBar: weekBar,
    weekLabel: th.title,
    dayNumStrong: th.title,
    dayMuted: th.muted,
    signedCellBg: winTitle,
    signedCellText: '#ffffff',
    todayRing: th.btnPrimary,
    boardLine: th.board.line,
    navAccent: th.btnPrimary,
    titleFill: th.title,
    titleStroke: th.subtitle,
    closeXStroke: th.title,
    primary0: h0,
    primary1: h1,
    primary2: h2,
    primaryShine: 'rgba(255,255,255,0.42)',
    primaryDisabled: primaryDis,
    primaryDisabledText: 'rgba(255,255,255,0.95)',
    modalShadow: th.btnShadow || 'rgba(0,0,0,0.18)',
    arrowFillHi: 'rgba(255,255,255,0.88)',
    arrowFillLo: 'rgba(255,255,255,0.42)'
  };
}

app.getCheckinModalLayout = function() {
  var topPad = app.rpx(10);
  var headerBandH = app.rpx(88);
  var innerAfterHead = app.rpx(14);
  var calInnerPad = app.rpx(16);
  var monthNavH = app.rpx(50);
  var weekH = app.rpx(38);
  var cell = app.rpx(48);
  var rowGap = app.rpx(6);
  var gridH = 6 * cell + 5 * rowGap;
  var calCardH = calInnerPad * 2 + monthNavH + weekH + gridH;
  var gapCalPrimary = app.rpx(18);
  var primaryBtnH = app.rpx(58);
  var bottomPad = app.rpx(24);
  var w = Math.min(app.W - app.rpx(22), app.rpx(704));
  var innerH =
    topPad +
    headerBandH +
    innerAfterHead +
    calCardH +
    gapCalPrimary +
    primaryBtnH +
    bottomPad;
  var h = innerH;
  var cx = app.W / 2;
  var cy = app.H * 0.47;
  var rOuter = app.rpx(28);
  var x0 = cx - w / 2;
  var y0 = cy - h / 2;
  var calLeft = x0 + app.rpx(16);
  var calW = w - app.rpx(32);
  var calTop = y0 + topPad + headerBandH + innerAfterHead;
  var monthNavY = calTop + calInnerPad;
  var navMidY = monthNavY + monthNavH * 0.5;
  var leftAx = calLeft + calInnerPad + app.rpx(38);
  var rightAx = calLeft + calW - calInnerPad - app.rpx(38);
  var hitR = app.rpx(28);
  var primaryBtnW = w - app.rpx(48);
  var primaryY = calTop + calCardH + gapCalPrimary;
  var headCloseCx = x0 + w - app.rpx(34);
  var headCloseCy = y0 + topPad + headerBandH * 0.5;
  return {
    cx: cx,
    cy: cy,
    w: w,
    h: h,
    r: rOuter,
    x0: x0,
    y0: y0,
    topPad: topPad,
    headerBandH: headerBandH,
    calLeft: calLeft,
    calW: calW,
    calTop: calTop,
    calCardH: calCardH,
    calInnerPad: calInnerPad,
    monthNavH: monthNavH,
    weekH: weekH,
    cell: cell,
    rowGap: rowGap,
    gridH: gridH,
    primaryY: primaryY,
    primaryBtnH: primaryBtnH,
    primaryBtnW: primaryBtnW,
    headCloseCx: headCloseCx,
    headCloseCy: headCloseCy,
    monthNavY: monthNavY,
    prevMonthHit: {
      x: leftAx - hitR,
      y: navMidY - hitR,
      w: hitR * 2,
      h: hitR * 2
    },
    nextMonthHit: {
      x: rightAx - hitR,
      y: navMidY - hitR,
      w: hitR * 2,
      h: hitR * 2
    }
  };
}

app.fetchOnlineChatHistory = function() {};

app.applyOnlineChatIncoming = function(data) {
  if (!data || data.id == null) {
    return;
  }
  var id = Number(data.id);
  var i;
  for (i = 0; i < app.onlineChatMessages.length; i++) {
    if (Number(app.onlineChatMessages[i].id) === id) {
      return;
    }
  }
  app.onlineChatMessages.push({
    id: id,
    senderUserId: data.senderUserId,
    senderColor: data.senderColor,
    kind: data.kind,
    text: data.text,
    createdAt: data.createdAt
  });
  if (typeof app.applyOnlineChatAvatarBubble === 'function') {
    app.applyOnlineChatAvatarBubble(data);
  }
  if (app.onlineChatMessages.length > 400) {
    app.onlineChatMessages.splice(0, app.onlineChatMessages.length - 400);
  }
  if (typeof app.draw === 'function') {
    app.draw();
  }
};

app.sendOnlineChat = function(kind, text) {
  if (
    !app.socketTask ||
    typeof app.socketTask.send !== 'function' ||
    !app.onlineWsConnected ||
    app.onlineSpectatorMode
  ) {
    return;
  }
  try {
    app.socketTask.send({
      data: JSON.stringify({
        type: 'CHAT_SEND',
        kind: kind,
        text: text != null ? String(text) : ''
      })
    });
  } catch (e1) {}
};

};
