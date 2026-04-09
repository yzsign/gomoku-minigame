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
          if (er && er.code === 'SAME_USER') {
            msg = '不能用同一账号加入';
          } else {
            msg = '房间已满';
          }
        }
        wx.showToast({ title: msg, icon: 'none' });
        return;
      }
      var d = res.data;
      app.onlineRoomId = roomId;
      app.onlineToken = d.whiteToken;
      app.pvpOnlineYourColor = app.WHITE;
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

app.tryLaunchOnlineInvite = function(query) {
  if (app.onlineInviteConsumed || app.isPvpOnline) {
    return;
  }
  if (!query || String(query.online) !== '1' || !query.roomId) {
    return;
  }
  app.joinOnlineAsGuest(String(query.roomId));
}

/* ---------- 棋盘布局与菜单几何 ---------- */

app.computeLayout = function() {
  var topBar = Math.max(44, app.sys.statusBarHeight + 8);
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
  var toPx = function(n) {
    return (n * app.W) / 750;
  };
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
    topLight.addColorStop(0.4, 'rgba(170, 230, 238, 0.18)');
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
    vignette.addColorStop(0, 'rgba(80, 200, 210, 0)');
    vignette.addColorStop(0.74, 'rgba(30, 110, 125, 0.04)');
    vignette.addColorStop(1, 'rgba(15, 70, 88, 0.07)');
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
    topLight.addColorStop(0.36, 'rgba(180, 235, 240, 0.2)');
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
    vignette.addColorStop(0, 'rgba(80, 200, 210, 0)');
    vignette.addColorStop(0.74, 'rgba(30, 110, 125, 0.04)');
    vignette.addColorStop(1, 'rgba(15, 70, 88, 0.07)');
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
    footM.addColorStop(1, 'rgba(160, 220, 228, 0.28)');
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
  var navH = app.rpx(120);
  var navTop = insetTop;
  var navBottom = navTop + navH;
  var padX = app.rpx(30);
  var avatarR = app.rpx(48);
  var avatarCy = navTop + navH / 2;
  var avatarCx = padX + avatarR;
  return {
    navTop: navTop,
    navH: navH,
    navBottom: navBottom,
    insetTop: insetTop,
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

/** 侧滑抽屉：自左侧滑出，右侧为蒙层 */
app.getHomeDrawerLayout = function() {
  var panelW = Math.min(app.W * 0.78, app.rpx(560));
  return { panelW: panelW };
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
  app.gameBarDrawImg = null;
  app.gameBarResignImg = null;

  var loadPhase = 1;
  var remaining = 14;
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
      [prefix + 'home-mascot.gif', prefix + 'home-mascot.png'],
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

/** 多于一种界面风格时显示侧栏「界面风格」；当前仅檀木则不显示 */
app.homeDrawerShowsThemeRow = function() {
  return themes.getThemeIdsForCycling().length > 1;
}

app.getHomeDrawerMenuItems = function() {
  return app.homeDrawerShowsThemeRow()
    ? ['界面风格', '棋子皮肤', '游戏反馈', '关于团团五子棋']
    : ['棋子皮肤', '游戏反馈', '关于团团五子棋'];
}

app.drawHomeDrawer = function(th) {
  if (!app.homeDrawerOpen) {
    return;
  }
  var D = app.getHomeDrawerLayout();
  var insetTop = Math.max(
    app.sys.statusBarHeight || 24,
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0
  );
  var pw = D.panelW;
  app.ctx.save();
  app.ctx.fillStyle = '#ffffff';
  app.ctx.fillRect(0, 0, pw, app.H);
  app.ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  app.ctx.fillRect(pw, 0, app.W - pw, app.H);
  app.ctx.strokeStyle = '#E5E5E5';
  app.ctx.lineWidth = Math.max(1, app.rpx(1));
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(pw), 0);
  app.ctx.lineTo(app.snapPx(pw), app.H);
  app.ctx.stroke();

  app.ctx.textAlign = 'left';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    'bold ' +
    app.rpx(34) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = th.title;
  app.ctx.fillText('菜单', app.snapPx(app.rpx(28)), app.snapPx(insetTop + app.rpx(52)));

  var rowY = insetTop + app.rpx(110);
  var rowH = app.rpx(96);
  var items = app.getHomeDrawerMenuItems();
  var i;
  app.ctx.font =
    app.rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = '#333333';
  for (i = 0; i < items.length; i++) {
    var ry = rowY + i * rowH;
    app.ctx.fillText(items[i], app.snapPx(app.rpx(28)), app.snapPx(ry));
  }
  app.ctx.strokeStyle = '#F0F0F0';
  app.ctx.lineWidth = Math.max(1, app.rpx(1));
  for (i = 0; i < items.length - 1; i++) {
    app.ctx.beginPath();
    app.ctx.moveTo(app.rpx(20), rowY + rowH * (i + 0.55));
    app.ctx.lineTo(pw - app.rpx(16), rowY + rowH * (i + 0.55));
    app.ctx.stroke();
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
  return clientX > D.panelW;
}

app.hitHomeDrawerRow = function(clientX, clientY) {
  if (!app.homeDrawerOpen) {
    return null;
  }
  var D = app.getHomeDrawerLayout();
  if (clientX < 10 || clientX > D.panelW - 10) {
    return null;
  }
  var insetTop = Math.max(
    app.sys.statusBarHeight || 24,
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0
  );
  var rowY = insetTop + app.rpx(110);
  var rowH = app.rpx(96);
  var n = app.getHomeDrawerMenuItems().length;
  var i;
  for (i = 0; i < n; i++) {
    var ry = rowY + i * rowH;
    if (
      clientY >= ry - rowH * 0.48 &&
      clientY <= ry + rowH * 0.48
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
    dockFill = 'rgba(225, 246, 248, 0.9)';
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
    '对战排行',
    '我的战绩',
    '杂货铺'
  ];
  var innerW = app.W - padH * 2;
  var colW = innerW / 4;
  var baseX = padH;
  var iconBox = app.rpx(78);
  var iconY = y0 + app.rpx(34) + iconBox / 2;
  var s = iconBox * 0.14;
  var colMidY = y0 + h * 0.42;
  var i;
  for (i = 0; i < 4; i++) {
    var cxi = baseX + colW * i + colW / 2;
    var pressed = app.homePressedDockCol === i;
    var stroke = pressed ? th.title : th.subtitle;
    app.ctx.save();
    if (pressed) {
      app.ctx.translate(cxi, colMidY);
      app.ctx.scale(0.96, 0.96);
      app.ctx.translate(-cxi, -colMidY);
      app.ctx.translate(0, app.rpx(2));
    }
    if (i === 0) {
      if (!app.drawHomeUiImageContain(app.homeDockCheckinImg, cxi, iconY, iconBox)) {
        app.drawHomeDockIconCheckin(cxi, iconY, s, stroke);
      }
    } else if (i === 1) {
      if (!app.drawHomeUiImageContain(app.homeDockRankImg, cxi, iconY, iconBox)) {
        app.drawHomeDockIconRank(cxi, iconY, s, stroke);
      }
    } else if (i === 2) {
      if (!app.drawHomeUiImageContain(app.homeDockHistoryImg, cxi, iconY, iconBox)) {
        app.drawHomeDockIconHistory(cxi, iconY, s, stroke);
      }
    } else {
      if (!app.drawHomeUiImageContain(app.homeDockSkinImg, cxi, iconY, iconBox)) {
        app.drawHomeDockIconSkin(cxi, iconY, s, stroke);
      }
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
      app.snapPx(iconY + iconBox / 2 + app.rpx(20))
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
  var cx = app.W / 2;
  var btnW = app.rpx(668);
  var btnH = app.rpx(116);
  var btnGap = app.rpx(36);
  var ipGap = app.rpx(40);
  var ipBlockH = app.rpx(232);
  var ipTop = nav.navBottom + ipGap;
  var mascotCy = ipTop + ipBlockH * 0.5;
  var mascotScale = app.rpx(140) / 92;
  var btnTopGap = app.rpx(48);
  var yRandom = ipTop + ipBlockH + btnTopGap + btnH / 2;
  var yFriend = yRandom + btnH / 2 + btnGap + btnH / 2;
  var yPve = yFriend + btnH / 2 + btnGap + btnH / 2;
  var dockTopFromFlow = yPve + btnH / 2 + app.rpx(28) + app.rpx(36);
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
    yPve: yPve,
    bottomNavTop: dockTop,
    bottomNavH: bottomNavH,
    footerY: footerY,
    mainBottom: mainBottom,
    dockPadH: dockPadH
  };
}

app.getRatingCardLayout = function() {
  var w = Math.min(app.W - 48, 300);
  var h = 212;
  var cx = app.W / 2;
  var cy = app.H * 0.42;
  return { cx: cx, cy: cy, w: w, h: h, r: 18 };
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
      ? 'rgba(21, 61, 82, 0.1)'
      : id === 'ink'
      ? 'rgba(36, 32, 24, 0.08)'
      : 'rgba(92, 71, 56, 0.1)';
  var cardStroke =
    id === 'ink'
      ? 'rgba(255, 255, 255, 0.65)'
      : 'rgba(255, 255, 255, 0.88)';
  var primaryDis =
    id === 'mint'
      ? 'rgba(95, 122, 144, 0.48)'
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

};
