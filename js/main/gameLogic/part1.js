/**
 * Auto-split from gameLogic.js (part 1)
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

/** GET /api/users/rating?userId=；开发者工具缓存旧 roomApi 未带 userRatingByUserIdOptions 时仍可用 */
app.getUserRatingByUserIdRequestOptions = function(userId) {
  if (typeof roomApi.userRatingByUserIdOptions === 'function') {
    return roomApi.userRatingByUserIdOptions(userId);
  }
  var id =
    userId !== undefined && userId !== null ? Number(userId) : 0;
  var tok = authApi.getSessionToken ? authApi.getSessionToken() : '';
  var header = {};
  if (tok) {
    header.Authorization = 'Bearer ' + String(tok);
  }
  return {
    url:
      roomApi.GOMOKU_API_BASE +
      '/api/users/rating?userId=' +
      encodeURIComponent(String(id)),
    method: 'GET',
    header: header
  };
}

/** 落子短音效（audio/stone.wav） */
app.placeStoneAudio = null;
app.playPlaceStoneSound = function() {
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
    return;
  }
  try {
    if (!app.placeStoneAudio) {
      app.placeStoneAudio = wx.createInnerAudioContext();
      app.placeStoneAudio.src = 'audio/stone.wav';
      app.placeStoneAudio.volume = 0.88;
    } else {
      app.placeStoneAudio.stop();
    }
    app.placeStoneAudio.play();
  } catch (e) {}
}

/** 首页画布战绩卡片（替代 wx.showModal） */
app.ratingCardVisible = false;
app.ratingCardData = null;
app.ratingFetchInFlight = false;

/** 每日签到：服务端 wxcloudrun-gomoku（POST /api/me/checkin）+ 画布弹窗 */
app.CHECKIN_DAILY_POINTS = 10;
app.checkinStateCache = null;
app.checkinModalVisible = false;
app.checkinModalData = null;

/** 是否已处理过「首次资料」询问（含用户点暂不） */
app.PROFILE_PROMPT_STORAGE_KEY = 'gomoku_profile_prompt_done';
/** 授权后写入，棋盘左下角展示「我」的昵称 */
app.LOCAL_NICKNAME_KEY = 'gomoku_local_nickname';
/** 避免每帧 draw 调用 getStorageSync（同步 IO 易卡顿） */
app.myDisplayNameCache = null;

app.persistLocalNickname = function(userInfo) {
  if (userInfo) {
    defaultAvatars.setGenderFromUserInfo(userInfo);
  }
  if (!userInfo || !userInfo.nickName) {
    return;
  }
  var trimmed = String(userInfo.nickName).trim();
  app.myDisplayNameCache = trimmed || '我';
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(app.LOCAL_NICKNAME_KEY, trimmed);
    }
  } catch (e) {}
}

app.getMyDisplayName = function() {
  if (app.myDisplayNameCache !== null) {
    return app.myDisplayNameCache;
  }
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var n = wx.getStorageSync(app.LOCAL_NICKNAME_KEY);
      if (n && String(n).trim()) {
        app.myDisplayNameCache = String(n).trim();
        return app.myDisplayNameCache;
      }
    }
  } catch (e2) {}
  app.myDisplayNameCache = '我';
  return '我';
}

app.getOpponentDisplayName = function() {
  if (app.isPvpOnline && app.onlineOppNickname) {
    return app.onlineOppNickname;
  }
  if (app.isPvpOnline) {
    return '对手';
  }
  if (app.isPvpLocal) {
    return '对方';
  }
  if (app.isRandomMatch) {
    return app.randomOpponentName || '对手';
  }
  return '电脑';
}

/** 与 render.drawBoard 中棋盘外接矩形一致 */
app.getBoardOuterRect = function(layout) {
  var cell = layout.cell;
  var n = layout.size;
  var bx = layout.originX - cell * 0.5;
  var by = layout.originY - cell * 0.5;
  var bw = n * cell;
  return { bx: bx, by: by, bw: bw, bh: bw };
}

app.truncateNameToWidth = function(ctx, text, maxW) {
  text = String(text || '');
  if (!text) {
    return '';
  }
  if (ctx.measureText(text).width <= maxW) {
    return text;
  }
  var ellipsis = '…';
  var i = text.length;
  while (
    i > 0 &&
    ctx.measureText(text.slice(0, i) + ellipsis).width > maxW
  ) {
    i--;
  }
  return i > 0 ? text.slice(0, i) + ellipsis : ellipsis;
}

/**
 * 棋盘两侧昵称与头像几何（绘制与点击共用）
 */
app.computeBoardNameLabelLayout = function(layout) {
  var r = app.getBoardOuterRect(layout);
  var pad = Math.max(8, layout.cell * 0.22);
  var outerGap = Math.max(10, layout.cell * 0.34);
  var maxW = r.bw * 0.48;
  var fontPx = Math.max(
    15,
    Math.min(20, Math.round(14 + layout.cell * 0.22))
  );
  var avR = Math.max(17, Math.min(30, Math.round(layout.cell * 0.46)));
  var myImg = app.getMyAvatarImageForUi();
  var oppImg =
    app.isPvpOnline &&
    app.onlineOppAvatarImg &&
    app.onlineOppAvatarImg.width &&
    app.onlineOppAvatarImg.height
      ? app.onlineOppAvatarImg
      : defaultAvatars.getOnlineOpponentDefaultAvatarImage();
  var hasMyAv = myImg && myImg.width && myImg.height;
  var hasOppAv = oppImg && oppImg.width && oppImg.height;
  var myNameExtra = hasMyAv ? avR * 2 + 6 : 0;
  var oppNameExtra = hasOppAv ? avR * 2 + 6 : 0;
  var textTop = r.by + r.bh + outerGap;
  return {
    r: r,
    pad: pad,
    outerGap: outerGap,
    maxW: maxW,
    fontPx: fontPx,
    avR: avR,
    myImg: myImg,
    oppImg: oppImg,
    hasMyAv: hasMyAv,
    hasOppAv: hasOppAv,
    textTop: textTop,
    myTextX: r.bx + pad + myNameExtra,
    myCx: r.bx + pad + avR,
    /** 与本人昵称同一行垂直中线（见 draw 中 textBaseline 'middle'） */
    myCy: textTop + fontPx * 0.5,
    oppNameRightX: r.bx + r.bw - pad - oppNameExtra,
    oppCx: r.bx + r.bw - pad - avR,
    /** 与对手昵称同一行垂直中线（见 draw 中 textBaseline 'middle'） */
    oppCy: r.by - outerGap - fontPx * 0.5
  };
}

app.drawBoardNameLabels = function(ctx, layout, th) {
  var L = app.computeBoardNameLabelLayout(layout);
  var oppName = app.getOpponentDisplayName();
  var myName = app.getMyDisplayName();
  ctx.save();
  ctx.font =
    'bold ' +
    L.fontPx +
    'px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title || th.subtitle;
  oppName = app.truncateNameToWidth(
    ctx,
    oppName,
    Math.max(40, L.maxW - (L.hasOppAv ? L.avR * 2 + 6 : 0))
  );
  myName = app.truncateNameToWidth(
    ctx,
    myName,
    Math.max(40, L.maxW - (L.hasMyAv ? L.avR * 2 + 6 : 0))
  );
  /** 对手：棋盘右上角外侧；无网络图时用服务端性别或「与本人相反」默认 */
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(oppName, app.snapPx(L.oppNameRightX), app.snapPx(L.oppCy));
  if (L.hasOppAv) {
    defaultAvatars.drawCircleAvatar(
      ctx,
      L.oppImg,
      L.oppCx,
      L.oppCy,
      L.avR,
      th
    );
  }
  /** 我：棋盘左下角外侧；无网络图时用服务端 users.gender 对应默认 */
  if (L.hasMyAv) {
    defaultAvatars.drawCircleAvatar(
      ctx,
      L.myImg,
      L.myCx,
      L.myCy,
      L.avR,
      th
    );
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = th.title || th.subtitle;
  ctx.fillText(myName, app.snapPx(L.myTextX), app.snapPx(L.myCy));
  ctx.restore();
}

app.hitCircleAvatar = function(clientX, clientY, cx, cy, r) {
  var dx = clientX - cx;
  var dy = clientY - cy;
  var hitR = r + 10;
  return dx * dx + dy * dy <= hitR * hitR;
}

/**
 * 对局中点击棋盘旁头像区域：返回 'my' | 'opp' | null（仅「我」可点开天梯弹层）
 */
app.hitWhichGameBoardNameAvatar = function(clientX, clientY) {
  if (app.screen !== 'game') {
    return null;
  }
  var L = app.computeBoardNameLabelLayout(app.layout);
  if (L.hasMyAv && app.hitCircleAvatar(clientX, clientY, L.myCx, L.myCy, L.avR)) {
    return 'my';
  }
  if (L.hasOppAv && app.hitCircleAvatar(clientX, clientY, L.oppCx, L.oppCy, L.avR)) {
    return 'opp';
  }
  return null;
}

/**
 * 首次进入：系统弹窗询问是否授权昵称与头像（无页面内自定义按钮）。
 * 授权走 wx.getUserProfile；若因手势限制失败，则降级为一次性全屏透明授权层（仍无可见按钮）。
 */
app.maybeFirstVisitProfileModal = function() {
  if (typeof wx === 'undefined') {
    return;
  }
  try {
    if (wx.getStorageSync(app.PROFILE_PROMPT_STORAGE_KEY) === '1') {
      return;
    }
  } catch (e0) {}
  if (typeof wx.showModal !== 'function') {
    return;
  }
  setTimeout(function () {
    wx.showModal({
      title: '完善资料',
      content: '是否授权微信昵称与头像用于本游戏？（仅询问一次）',
      confirmText: '授权',
      cancelText: '暂不',
      success: function (modalRes) {
        if (!modalRes.confirm) {
          try {
            wx.setStorageSync(app.PROFILE_PROMPT_STORAGE_KEY, '1');
          } catch (e1) {}
          return;
        }
        if (typeof wx.getUserProfile !== 'function') {
          app.tryOneShotInvisibleUserInfoButton();
          return;
        }
        wx.getUserProfile({
          desc: '用于展示昵称与头像',
          success: function (up) {
            if (up && up.userInfo) {
              app.persistLocalNickname(up.userInfo);
              authApi.silentLogin(up.userInfo, function (ok) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({
                    title: ok ? '资料已保存' : '保存失败',
                    icon: ok ? 'success' : 'none'
                  });
                }
                app.draw();
              });
            }
            try {
              wx.setStorageSync(app.PROFILE_PROMPT_STORAGE_KEY, '1');
            } catch (e2) {}
          },
          fail: function () {
            app.tryOneShotInvisibleUserInfoButton();
          }
        });
      }
    });
  }, 450);
}

/** 降级：全屏透明原生层，用户点一下屏幕完成授权（无可见按钮文案） */
app.tryOneShotInvisibleUserInfoButton = function() {
  if (typeof wx === 'undefined' || typeof wx.createUserInfoButton !== 'function') {
    try {
      wx.setStorageSync(app.PROFILE_PROMPT_STORAGE_KEY, '1');
    } catch (e3) {}
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '当前环境无法授权', icon: 'none' });
    }
    return;
  }
  app.syncCanvasWithWindow();
  var w = app.W;
  var h = app.H;
  if (typeof wx.showToast === 'function') {
    wx.showToast({ title: '请轻触屏幕完成授权', icon: 'none' });
  }
  var btn = wx.createUserInfoButton({
    type: 'text',
    text: '',
    withCredentials: false,
    style: {
      left: 0,
      top: 0,
      width: w,
      height: h,
      lineHeight: h,
      backgroundColor: 'rgba(0,0,0,0.01)',
      color: 'transparent',
      textAlign: 'center',
      fontSize: 1,
      borderRadius: 0
    }
  });
  btn.onTap(function (res) {
    var userInfo = res && (res.userInfo || (res.detail && res.detail.userInfo));
    if (userInfo) {
      app.persistLocalNickname(userInfo);
      authApi.silentLogin(userInfo, function (ok) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({
            title: ok ? '资料已保存' : '保存失败',
            icon: ok ? 'success' : 'none'
          });
        }
        app.draw();
      });
    }
    try {
      btn.destroy();
    } catch (e4) {}
    try {
      wx.setStorageSync(app.PROFILE_PROMPT_STORAGE_KEY, '1');
    } catch (e5) {}
  });
}

themes.setTuanMoeUnlockedFromServer(false);
if (typeof themes.setCheckinStreakFromServer === 'function') {
  themes.setCheckinStreakFromServer(0);
}
themes.setPieceSkinUnlockedIdsFromServer([]);
app.themeId = themes.loadSavedThemeId();
app.pieceSkinId = themes.loadSavedPieceSkinId();

/** 首页「棋子换肤」弹窗：居中缩放 + 遮罩 */
app.pieceSkinModalVisible = false;
app.pieceSkinModalAnim = 0;
app.pieceSkinModalAnimRafId = null;
/** 分页与当前选中（catalog 全局下标） */
app.pieceSkinModalPage = 0;
app.pieceSkinModalPendingIdx = 0;
app.pieceSkinRedeemInFlight = false;

/** 棋子换肤：设计稿基准宽度 rpx（304×0.8×1.1） */
app.PIECE_SKIN_CARD_W_RPX = 304 * 0.88;
/** 棋子换肤：通用正文字体栈 */
app.PIECE_SKIN_FONT_UI =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

/** 风格切换气泡文案（空则不绘制） */
app.themeBubbleText = '';
app.themeBubbleAlpha = 1;
app.themeBubbleRafId = null;

/** 首页侧滑菜单是否打开 */
app.homeDrawerOpen = false;
/** 首页三主按钮按下态：'random' | 'pvp' | 'pve' | null（松手在同类按钮上才触发逻辑） */
app.homePressedButton = null;
/** 首页底部 Dock 按下列：0～3 或 null（与 hitHomeBottomNav 一致） */
app.homePressedDockCol = null;

/** 我的战绩页：本机最近对局 + 滚动 */
app.MATCH_HISTORY_STORAGE_KEY = 'gomoku_match_history_v1';
app.PEAK_ELO_STORAGE_KEY = 'gomoku_peak_elo_v1';
app.matchHistoryList = [];
app.historyStatsSnapshot = null;
app.historyScrollY = 0;
app.historyFilterTab = 0;
app.historyScrollTouchId = null;
app.historyScrollLastY = 0;
app.historyListTouchStartX = 0;
app.historyListTouchStartY = 0;
app.historyPeakEloCached = 0;
/** GET /api/me/game-history 返回的 items；与本地人机记录合并展示 */
app.historyServerItems = [];
/** 已登录时拉取 rating + game-history 完成前为 true，列表区显示加载态 */
app.historyListLoading = false;
/** 开始请求服务端战绩的时间戳，用于最短展示加载动画，避免一闪而过 */
app.historyLoadStartTs = 0;

app.historyListRowHeightRpx = function() {
  return app.rpx(112);
}

app.historyListRowGapRpx = function() {
  return app.rpx(16);
}

app.loadPeakEloFromStorage = function() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) {
      app.historyPeakEloCached = 0;
      return;
    }
    var v = wx.getStorageSync(app.PEAK_ELO_STORAGE_KEY);
    var n = Number(v);
    app.historyPeakEloCached = !isNaN(n) && n > 0 ? Math.floor(n) : 0;
  } catch (e) {
    app.historyPeakEloCached = 0;
  }
}

app.savePeakEloIfHigher = function(elo) {
  if (typeof elo !== 'number' || isNaN(elo)) {
    return;
  }
  app.loadPeakEloFromStorage();
  var e = Math.floor(elo);
  if (e > app.historyPeakEloCached) {
    app.historyPeakEloCached = e;
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(app.PEAK_ELO_STORAGE_KEY, String(app.historyPeakEloCached));
      }
    } catch (e2) {}
  }
}

app.loadMatchHistoryList = function() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) {
      app.matchHistoryList = [];
      return;
    }
    var raw = wx.getStorageSync(app.MATCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      app.matchHistoryList = [];
      return;
    }
    var arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    app.matchHistoryList = Array.isArray(arr) ? arr : [];
  } catch (e) {
    app.matchHistoryList = [];
  }
}

app.persistMatchHistoryList = function() {
  try {
    if (typeof wx === 'undefined' || !wx.setStorageSync) {
      return;
    }
    var cap = app.matchHistoryList.slice(0, 100);
    wx.setStorageSync(app.MATCH_HISTORY_STORAGE_KEY, JSON.stringify(cap));
    app.matchHistoryList = cap;
  } catch (e) {}
}

app.appendMatchHistoryRecord = function(entry) {
  app.loadMatchHistoryList();
  app.matchHistoryList.unshift(entry);
  if (app.matchHistoryList.length > 100) {
    app.matchHistoryList.length = 100;
  }
  app.persistMatchHistoryList();
}

app.formatHistoryDateTime = function(ts) {
  var d = new Date(ts);
  var y = d.getFullYear();
  var mo = d.getMonth() + 1;
  var day = d.getDate();
  var hh = d.getHours();
  var mm = d.getMinutes();
  return (
    y +
    '-' +
    (mo < 10 ? '0' : '') +
    mo +
    '-' +
    (day < 10 ? '0' : '') +
    day +
    ' ' +
    (hh < 10 ? '0' : '') +
    hh +
    ':' +
    (mm < 10 ? '0' : '') +
    mm
  );
}

app.mapServerHistoryItem = function(it) {
  var mr = String(it.myResult || '').toUpperCase();
  var res = 'draw';
  if (mr === 'WIN') {
    res = 'win';
  } else if (mr === 'LOSS') {
    res = 'lose';
  }
  var av = '';
  if (typeof it.opponentAvatarUrl === 'string' && it.opponentAvatarUrl.trim()) {
    av = it.opponentAvatarUrl.trim();
  }
  var og = null;
  if (typeof it.opponentGender === 'number') {
    og = it.opponentGender;
  }
  var ouid = 0;
  if (typeof it.opponentUserId === 'number' && !isNaN(it.opponentUserId)) {
    ouid = Math.floor(it.opponentUserId);
  } else if (it.opponentUserId != null) {
    var sid = String(it.opponentUserId).trim();
    if (/^\d+$/.test(sid)) {
      ouid = parseInt(sid, 10);
    }
  }
  return {
    t: typeof it.endedAt === 'number' ? it.endedAt : 0,
    res: res,
    opp: String(it.opponentNickname != null ? it.opponentNickname : '对手'),
    steps: typeof it.totalSteps === 'number' ? it.totalSteps : 0,
    mode: 'server',
    gameId: it.gameId,
    opponentBot: !!it.opponentBot,
    oppAvatarUrl: av,
    oppGender: og,
    oppUserId: ouid
  };
}

/** 历史列表对手网络头像缓存：url → Image | false（失败）| 'loading' */
app.historyOppAvatarImgCache = {};

app.getOrLoadHistoryOpponentAvatar = function(url) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    return null;
  }
  var cached = app.historyOppAvatarImgCache[url];
  if (cached && cached.width && cached.height) {
    return cached;
  }
  if (cached === false) {
    return null;
  }
  if (cached === 'loading') {
    return null;
  }
  app.historyOppAvatarImgCache[url] = 'loading';
  var img = wx.createImage();
  img.onload = function () {
    app.historyOppAvatarImgCache[url] = img;
    if (app.screen === 'history') {
      try {
        app.draw();
      } catch (e) {}
    }
  };
  img.onerror = function () {
    app.historyOppAvatarImgCache[url] = false;
    if (app.screen === 'history') {
      try {
        app.draw();
      } catch (e) {}
    }
  };
  var src = url.indexOf('local:') === 0 ? url.slice('local:'.length) : url;
  img.src = src;
  return null;
}

/**
 * 历史行头像：仅在网络图已成功解码时使用；无 URL、人机、PVE、加载中或失败时用默认头像。
 * 服务端联机：有 opponentGender（微信 0/1/2）时用其选默认图（含人机库内随机性别），未知按男；无该字段时回退本人默认。
 */
app.resolveHistoryRowAvatarImage = function(rec) {
  function defaultForRow() {
    if (rec && rec.mode === 'server' && typeof rec.oppGender === 'number') {
      return defaultAvatars.getImageForWeChatGender(rec.oppGender);
    }
    return defaultAvatars.getMyAvatarImage();
  }
  if (!rec) {
    return defaultAvatars.getMyAvatarImage();
  }
  var def = defaultForRow();
  if (rec.mode === 'pve') {
    return def;
  }
  if (rec.mode !== 'server') {
    return def;
  }
  var url = rec.oppAvatarUrl;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return def;
  }
  var net = app.getOrLoadHistoryOpponentAvatar(url.trim());
  if (net && net.width && net.height) {
    return net;
  }
  return def;
}

/**
 * 服务端已结算联机 + 本机人机（mode===pve），按时间倒序。
 */
app.getDisplayMatchHistoryList = function() {
  var fromServer = [];
  var i;
  if (app.historyServerItems && app.historyServerItems.length) {
    for (i = 0; i < app.historyServerItems.length; i++) {
      fromServer.push(app.mapServerHistoryItem(app.historyServerItems[i]));
    }
  }
  var pveLocal = [];
  for (i = 0; i < app.matchHistoryList.length; i++) {
    var e = app.matchHistoryList[i];
    if (e && e.mode === 'pve') {
      pveLocal.push(e);
    }
  }
  var merged = fromServer.concat(pveLocal);
  merged.sort(function (a, b) {
    return (b.t || 0) - (a.t || 0);
  });
  return merged;
}

app.getFilteredMatchHistory = function() {
  var list = app.getDisplayMatchHistoryList();
  if (app.historyFilterTab === 1) {
    return list.filter(function (x) {
      return x && x.res === 'win';
    });
  }
  if (app.historyFilterTab === 2) {
    return list.filter(function (x) {
      return x && x.res === 'lose';
    });
  }
  return list.slice();
}

/** 首页顶栏积分：null 表示尚未从 /api/me/rating 同步 */
app.homeRatingEloCache = null;

app.getCurrentTheme = function() {
  return themes.getTheme(app.themeId);
}

/**
 * 为已合并的棋子主题挂上贴图资源（若当前皮肤需要且已加载）。
 */
app.enrichPieceSkinTheme = function(theme, skinId) {
  if (skinId === 'tuan_moe') {
    if (
      app.tuanMoePieceBlackImg &&
      app.tuanMoePieceBlackImg.width &&
      app.tuanMoePieceWhiteImg &&
      app.tuanMoePieceWhiteImg.width
    ) {
      theme.pieceTextureBlackImg = app.tuanMoePieceBlackImg;
      theme.pieceTextureWhiteImg = app.tuanMoePieceWhiteImg;
    }
    return theme;
  }
  if (skinId === 'qingtao_libai') {
    if (
      app.qingtaoLibaiPieceBlackImg &&
      app.qingtaoLibaiPieceBlackImg.width &&
      app.qingtaoLibaiPieceWhiteImg &&
      app.qingtaoLibaiPieceWhiteImg.width
    ) {
      theme.pieceTextureBlackImg = app.qingtaoLibaiPieceBlackImg;
      theme.pieceTextureWhiteImg = app.qingtaoLibaiPieceWhiteImg;
    }
    return theme;
  }
  return theme;
}

/**
 * 绘制棋子用：在基底主题上套用棋子皮肤（与界面风格独立）。
 * 对局页基底为檀木盘时仍用 classic 作合并基底。
 */
app.getThemeForPieces = function(baseTheme) {
  var t = themes.applyPieceSkin(baseTheme, app.pieceSkinId);
  return app.enrichPieceSkinTheme(t, app.pieceSkinId);
}

/**
 * 随机匹配页、联机随机/好友对局内固定檀木界面色；首页与棋谱等仍跟随后台所选主题。
 */
app.getUiTheme = function() {
  if (app.screen === 'matching') {
    return themes.getTheme('classic');
  }
  if (app.screen === 'history') {
    return app.getCurrentTheme();
  }
  if (app.screen === 'game' && (app.isPvpOnline || app.isRandomMatch)) {
    return themes.getTheme('classic');
  }
  return app.getCurrentTheme();
}

app.SIZE = gomoku.SIZE;
app.BLACK = gomoku.BLACK;
app.WHITE = gomoku.WHITE;

app.canvas = wx.createCanvas();
app.ctx = app.canvas.getContext('2d');

/** 与布局、安全区、app.DPR 等一致；窗口变化时需刷新 */
app.sys = {};
app.W = 375;
app.H = 667;
app.DPR = 2;

/**
 * 按当前窗口与 pixelRatio 设置画布物理像素与 app.ctx 变换。
 * 触摸坐标仍为逻辑像素，与 app.W/app.H 一致；安全区、状态栏等随 app.sys 更新。
 */
app.syncCanvasWithWindow = function() {
  try {
    app.sys = wx.getSystemInfoSync() || {};
  } catch (e1) {
    app.sys = {};
  }
  app.W = app.sys.windowWidth || 375;
  app.H = app.sys.windowHeight || 667;
  if (app.W < 1) {
    app.W = 375;
  }
  if (app.H < 1) {
    app.H = 667;
  }
  app.DPR = app.sys.pixelRatio;
  if (app.DPR == null || app.DPR < 1 || app.DPR !== app.DPR) {
    app.DPR = 2;
  }
  /* 上限略放宽：高倍屏（如 3.5x）不再压到 3，提高清晰度；过高会占内存 */
  if (app.DPR > 4) {
    app.DPR = 4;
  }
  app.canvas.width = Math.round(app.W * app.DPR);
  app.canvas.height = Math.round(app.H * app.DPR);
  app.ctx.setTransform(app.DPR, 0, 0, app.DPR, 0, 0);
  render.setCanvasDpr(app.DPR);
  if (typeof app.ctx.imageSmoothingEnabled !== 'undefined') {
    app.ctx.imageSmoothingEnabled = true;
  }
  if (typeof app.ctx.imageSmoothingQuality !== 'undefined') {
    app.ctx.imageSmoothingQuality = 'high';
  }
}

app.syncCanvasWithWindow();
render.preloadQinghuaPattern();
render.preloadInkLotusPattern();

/** 与物理像素对齐，供非 render.drawText 的 fillText 使用 */
app.snapPx = function(x) {
  return render.snapLogical(x);
}

/* ---------- 界面与对局状态 ---------- */

/** 'home' | 'pve_color' | 'matching' | 'game' | 'history' | 'replay' */
app.screen = 'home';

/** 对局结束：在棋盘页上以半透明弹层展示（不再切全屏 result） */
app.showResultOverlay = false;

/** 联机：对方已重置开新局，本端仍显示上一局结算直至用户点「再来一局/返回首页」 */
app.onlineResultOverlaySticky = false;

/** 分出胜负：先高亮五连连线，约 2s 后再弹出结算 */
app.WIN_REVEAL_DELAY_MS = 2000;
app.winningLineCells = null;
app.winRevealTimerId = null;

/**
 * 对局结束页：pve_win | pve_lose | pve_draw | pvp_* | online_win | online_lose
 */
app.resultKind = '';

/** 人机：玩家执子 gomoku.BLACK | gomoku.WHITE */
app.pveHumanColor = app.BLACK;

/**
 * 人机连珠：固定启用 RIF 式开局（开局库），无交换执棋流程。
 */

/** 人机难度展示文案（与 Worker 搜索强度对应） */
app.PVE_DIFF_LABEL = '巅峰';

app.pveAiColor = function() {
  return app.pveHumanColor === app.BLACK ? app.WHITE : app.BLACK;
}

/** 是否由「随机匹配」进入的人机局（用于文案） */
app.isRandomMatch = false;
/** 联机白方为数据库人机（随机匹配超时接入） */
app.onlineOpponentIsBot = false;

/** 同桌好友对战：双方在同一设备轮流落子（无需服务端） */
app.isPvpLocal = false;

/** 联机好友对战（Spring Boot WebSocket） */
app.isPvpOnline = false;
app.onlineRoomId = '';
app.onlineToken = '';
/** 本客户端执子 gomoku.BLACK | gomoku.WHITE，与服务器 STATE.yourColor 一致 */
app.pvpOnlineYourColor = app.BLACK;
app.onlineBlackConnected = false;
app.onlineWhiteConnected = false;
/** 对方曾在线后断开，用于状态栏「对方已离开房间」 */
app.onlineOpponentLeft = false;
app.socketTask = null;
/** WebSocket 已 onOpen，可 send；断线后为 false，用于重连提示与拦截落子 */
app.onlineWsConnected = false;
app.onlineReconnectTimer = null;
app.onlineReconnectAttempt = 0;
app.ONLINE_RECONNECT_BASE_MS = 800;
app.ONLINE_RECONNECT_MAX_MS = 30000;
/** 当前 WS 代数，用于忽略 closeSocketOnly 触发的旧连接 onClose */
app.onlineSocketConnectGen = 0;
/** 是否曾成功 onOpen（用于区分首连与断线重连文案） */
app.onlineWsEverOpened = false;
/** 避免冷启动与 onShow 各处理一次同一邀请 */
app.onlineInviteConsumed = false;
/** 本局是否已请求 POST /api/games/settle（防重复；新局由 applyOnlineState 置 false） */
app.onlineSettleSent = false;
/** 与 WS STATE.matchRound 一致：首局 1，再来一局后递增，用于结算上报 */
app.onlineMatchRound = 1;

/** 联机：从盘面差分同步的终局手顺（悔棋会缩短），用于结算 moves 与回放 */
app.onlineMoveHistory = [];
/** POST /api/games/settle 返回的 gameId，棋谱可事后拉取 */
app.lastSettledGameId = null;
/** app.screen === 'replay'：棋谱数据与当前展示步数（0 表示空盘） */
app.replayMoves = [];
app.replayStep = 0;
app.replayAutoTimerId = null;
/** 棋谱回放底栏药丸宽度（与 drawButton 一致；相邻箭头按钮中心距=此值则边缘相贴） */
app.REPLAY_CTRL_PILL_W = 82;
/** 战绩页：在当前页面上以遮罩弹出棋谱回放（不切换 screen） */
app.historyReplayOverlayVisible = false;
/** 战绩列表：在回放图标上按下时的行记录与 touch identifier */
app.historyReplayTouchRec = null;
app.historyReplayTouchId = null;
/** 棋谱回放底栏：'close'|'prev'|'next'|'auto'，按下未抬起时用于点击态绘制 */
app.replayControlPressedId = null;
app.replayTouchIdentifier = null;

/** 联机对手：服务端头像与昵称（与占位默认图区分） */
app.onlineOppAvatarImg = null;
app.onlineOppNickname = '';
app.onlineOppProfileRoomId = '';
app.onlineOppProfileFetched = false;
app.onlineOppFetchInFlight = false;

/** 本人：服务端 avatarUrl 加载的网络图（首页与棋盘共用） */
app.myNetworkAvatarImg = null;
app.myProfileAvatarFetched = false;

/** 首页：images/ui 下 PNG，失败时回退矢量线稿 */
app.homeDockCheckinImg = null;
app.homeDockRankImg = null;
app.homeDockHistoryImg = null;
app.homeDockSkinImg = null;
/** 「团团萌肤」棋子贴图（UI/棋子 同步至 images/pieces） */
app.tuanMoePieceBlackImg = null;
app.tuanMoePieceWhiteImg = null;
/** 「青萄荔白」fruit1 / fruit2 */
app.qingtaoLibaiPieceBlackImg = null;
app.qingtaoLibaiPieceWhiteImg = null;
app.homeMascotImg = null;
/** 横向雪碧图（分包 `subpackages/res-mascot/images/ui/home-mascot-sheet.png`） */
app.homeMascotSheetImg = null;
/**
 * 雪碧图横向帧数（与分包内 home-mascot-sheet.png 一致；由 video_to_mascot_assets 导出）
 */
app.MASCOT_SHEET_FRAME_COUNT = 41;
app.MASCOT_SHEET_FPS = 8;
/** 修改首页 PNG 或路径时递增，避免热重载仍认为「已加载」而跳过 */
app.HOME_UI_ASSETS_REV = 23;
/** 吉祥物资源所在分包（见 game.json）；wx.loadSubpackage 成功后再加载大图 */
app.HOME_SUBPACKAGE_NAME = 'res-mascot';
/** 分包内吉祥物路径前缀；失败时回退主包 images/ui/ */
app.MASCOT_SUBPKG_PREFIX = 'subpackages/res-mascot/images/ui/';
app.homeUiAssetsAppliedRev = -1;
app.homeUiAssetsLoadInFlight = false;

/** 随机匹配到的假对手昵称 */
app.randomOpponentName = '';

app.matchingTimer = null;
app.matchingAnimTimer = null;
app.matchingDots = 0;
/** 首页吉祥物雪碧图逐帧：仅多帧且雪碧图已加载时定时 redraw */
app.homeMascotAnimTimer = null;
/** 随机匹配：已为房主创建房间并等待真人对手（超时则人机） */
app.randomMatchHostWaiting = false;
/** 房主首次 POST /match/random 的 blackToken：仅用于 cancel / fallback-bot；连 WS 须用 paired.yourToken */
app.randomMatchHostCancelToken = '';
/** 房主轮询 GET /match/random/paired 直到 guestJoined */
app.randomMatchPairedPollTimer = null;
app.RANDOM_MATCH_TIMEOUT_MS = 5000;
app.RANDOM_MATCH_PAIRED_POLL_MS = 400;

app.FAKE_OPPONENT_NAMES = [
  '棋手甲',
  '棋手乙',
  '路人王',
  '云游子',
  '青松客',
  '夜行侠'
];
app.board = gomoku.createBoard();
app.current = app.BLACK;
app.gameOver = false;
app.winner = null;
app.lastMsg = '';

/** 对手上一手坐标（人机=AI、同桌=对方、联机=对方）；仅游戏盘绘制 */
app.lastOpponentMove = null;

/** Worker 人机：强棋力在子线程算，主线程不卡；失败时回退 gomoku.aiMove */
app.aiWorkerInstance = null;
app.aiWorkerSeq = 0;
app.aiMoveGeneration = 0;

/** 人机：走子栈（悔棋用） */
app.pveMoveHistory = [];

/** 同桌：走子栈；app.localUndoRequest 含 requesterColor、pendingPops(1|2) */
app.localMoveHistory = [];
app.localUndoRequest = null;

/** 联机：服务端 undoPending / undoRequesterColor */
app.onlineUndoPending = false;
app.onlineUndoRequesterColor = null;

/* ---------- 联机：WebSocket 与房间 ---------- */

app.closeSocketOnly = function() {
  if (app.socketTask) {
    try {
      app.socketTask.close({});
    } catch (e1) {}
    app.socketTask = null;
  }
  app.onlineWsConnected = false;
}

app.clearOnlineReconnectTimer = function() {
  if (app.onlineReconnectTimer) {
    clearTimeout(app.onlineReconnectTimer);
    app.onlineReconnectTimer = null;
  }
}

/** 联机对局/匹配等待中是否应保持 roomId+token 并允许自动重连 */
app.shouldAutoReconnectOnline = function() {
  if (!app.onlineRoomId || !app.onlineToken) {
    return false;
  }
  if (app.screen === 'game') {
    return true;
  }
  if (app.screen === 'matching' && app.randomMatchHostWaiting) {
    return true;
  }
  return false;
}

app.scheduleOnlineReconnect = function(immediate) {
  app.clearOnlineReconnectTimer();
  if (!app.shouldAutoReconnectOnline()) {
    return;
  }
  var delay;
  if (immediate) {
    delay = 0;
  } else {
    delay = Math.min(
      app.ONLINE_RECONNECT_BASE_MS * Math.pow(2, app.onlineReconnectAttempt),
      app.ONLINE_RECONNECT_MAX_MS
    );
  }
  app.onlineReconnectTimer = setTimeout(function () {
    app.onlineReconnectTimer = null;
    if (!app.shouldAutoReconnectOnline()) {
      return;
    }
    app.onlineReconnectAttempt++;
    app.startOnlineSocket();
  }, delay);
}

app.handleOnlineSocketDead = function() {
  app.socketTask = null;
  app.onlineWsConnected = false;
  if (app.shouldAutoReconnectOnline()) {
    app.scheduleOnlineReconnect(false);
    app.draw();
  }
}

app.disconnectOnline = function() {
  app.clearOnlineReconnectTimer();
  app.onlineReconnectAttempt = 0;
  app.onlineSocketConnectGen++;
  app.onlineWsEverOpened = false;
  app.onlineResultOverlaySticky = false;
  app.onlineOpponentLeft = false;
  app.closeSocketOnly();
  app.stopReplayAuto();
  app.onlineMoveHistory = [];
  app.lastSettledGameId = null;
  app.isPvpOnline = false;
  app.onlineRoomId = '';
  app.onlineToken = '';
  app.pvpOnlineYourColor = app.BLACK;
  app.onlineBlackConnected = false;
  app.onlineWhiteConnected = false;
  app.onlineOpponentIsBot = false;
  app.onlineUndoPending = false;
  app.onlineUndoRequesterColor = null;
  app.onlineSettleSent = false;
  app.onlineMatchRound = 1;
  app.randomMatchHostCancelToken = '';
  app.clearOnlineOpponentProfile();
  if (app.historyReplayOverlayVisible) {
    app.historyReplayOverlayVisible = false;
  }
  app.replayControlPressedId = null;
  app.replayTouchIdentifier = null;
  if (app.screen === 'replay') {
    app.screen = 'game';
    app.showResultOverlay = false;
  }
}

app.clearOnlineOpponentProfile = function() {
  app.onlineOppAvatarImg = null;
  app.onlineOppNickname = '';
  app.onlineOppProfileRoomId = '';
  app.onlineOppProfileFetched = false;
  app.onlineOppFetchInFlight = false;
  defaultAvatars.setOpponentGenderFromServer(null);
}

/** GET /api/me/rating 等返回的 gender 同步到默认头像逻辑（users.gender） */
app.applyMyGenderFromRatingPayload = function(d) {
  if (d && typeof d.gender === 'number' && d.gender >= 0 && d.gender <= 2) {
    defaultAvatars.setMyGenderFromServer(d.gender);
  }
}

app.loadMyNetworkAvatar = function(url) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  var img = wx.createImage();
  img.onload = function () {
    app.myNetworkAvatarImg = img;
    app.draw();
  };
  img.onerror = function () {
    app.myNetworkAvatarImg = null;
    app.draw();
  };
  img.src = url;
}

app.loadOnlineOpponentAvatar = function(url) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  var src = url;
  if (src.indexOf('local:') === 0) {
    src = src.slice('local:'.length);
  }
  var img = wx.createImage();
  img.onload = function () {
    app.onlineOppAvatarImg = img;
    app.draw();
  };
  img.onerror = function () {
    app.onlineOppAvatarImg = null;
    app.draw();
  };
  img.src = src;
}

app.applyOnlineOpponentProfilePayload = function(d) {
  if (!d) {
    return;
  }
  if (typeof d.nickname === 'string' && d.nickname.trim()) {
    app.onlineOppNickname = d.nickname.trim();
  } else {
    app.onlineOppNickname = '';
  }
  if (typeof d.gender === 'number' && d.gender >= 0 && d.gender <= 2) {
    defaultAvatars.setOpponentGenderFromServer(d.gender);
  } else {
    defaultAvatars.setOpponentGenderFromServer(null);
  }
  if (typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
    app.loadOnlineOpponentAvatar(d.avatarUrl.trim());
  } else {
    app.onlineOppAvatarImg = null;
    app.draw();
  }
}

/** 双方已入座后拉取对手公开资料，使棋盘头像与对端资料一致 */
app.tryFetchOnlineOpponentProfile = function() {
  if (!app.isPvpOnline || !app.onlineRoomId || !authApi.getSessionToken()) {
    return;
  }
  if (!app.onlineBlackConnected || !app.onlineWhiteConnected) {
    return;
  }
  if (app.onlineOppFetchInFlight) {
    return;
  }
  if (app.onlineOppProfileRoomId === app.onlineRoomId && app.onlineOppProfileFetched) {
    return;
  }
  app.onlineOppFetchInFlight = true;
  wx.request(
    Object.assign(roomApi.roomOpponentRatingOptions(app.onlineRoomId), {
      success: function (res) {
        app.onlineOppFetchInFlight = false;
        if (res.statusCode !== 200 || !res.data) {
          return;
        }
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (e1) {
            return;
          }
        }
        if (!d) {
          return;
        }
        app.onlineOppProfileRoomId = app.onlineRoomId;
        app.onlineOppProfileFetched = true;
        app.applyOnlineOpponentProfilePayload(d);
      },
      fail: function () {
        app.onlineOppFetchInFlight = false;
      }
    })
  );
}

app.tryFetchMyProfileAvatar = function() {
  if (app.myProfileAvatarFetched || !authApi.getSessionToken()) {
    return;
  }
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
      success: function (res) {
        if (res.statusCode !== 200 || !res.data) {
          return;
        }
        app.myProfileAvatarFetched = true;
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (e2) {
            return;
          }
        }
        if (d && typeof d.eloScore === 'number' && !isNaN(d.eloScore)) {
          app.homeRatingEloCache = d.eloScore;
        }
        app.syncCheckinStateFromServerPayload(d);
        app.applyMyGenderFromRatingPayload(d);
        if (d && typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
          app.loadMyNetworkAvatar(d.avatarUrl.trim());
        }
        app.draw();
      },
      fail: function () {}
    })
  );
}

app.getMyAvatarImageForUi = function() {
  if (
    app.myNetworkAvatarImg &&
    app.myNetworkAvatarImg.width &&
    app.myNetworkAvatarImg.height
  ) {
    return app.myNetworkAvatarImg;
  }
  return defaultAvatars.getMyAvatarImage();
}

app.onlineSocketCanSend = function() {
  return (
    app.socketTask &&
    typeof app.socketTask.send === 'function' &&
    app.onlineWsConnected
  );
}

app.copyBoardFromServer = function(b) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < b.length; i++) {
    out[i] = [];
    for (j = 0; j < b[i].length; j++) {
      out[i][j] = b[i][j];
    }
  }
  return out;
}

app.boardIsEmpty = function(b) {
  var r;
  var c;
  for (r = 0; r < app.SIZE; r++) {
    for (c = 0; c < app.SIZE; c++) {
      if (b[r][c] !== gomoku.EMPTY) {
        return false;
      }
    }
  }
  return true;
}

/** 联机同步：找出新落的一子（该方颜色），用于定位五连 */
app.findSingleNewStoneOfColor = function(prevBoard, newBoard, color) {
  var list = [];
  var r;
  var c;
  for (r = 0; r < app.SIZE; r++) {
    for (c = 0; c < app.SIZE; c++) {
      if (prevBoard[r][c] === gomoku.EMPTY && newBoard[r][c] === color) {
        list.push({ r: r, c: c });
      }
    }
  }
  if (list.length === 0) {
    return null;
  }
  return list.length === 1 ? list[0] : list[list.length - 1];
}

/** 根据前后盘面差分，更新「对方」新增的唯一一子（联机） */
app.syncLastOpponentMoveOnline = function(prevBoard, newBoard, yourColor) {
  var opp = yourColor === app.BLACK ? app.WHITE : app.BLACK;
  var additions = [];
  var r;
  var c;
  for (r = 0; r < app.SIZE; r++) {
    for (c = 0; c < app.SIZE; c++) {
      if (prevBoard[r][c] === gomoku.EMPTY && newBoard[r][c] === opp) {
        additions.push({ r: r, c: c });
      }
    }
  }
  if (additions.length === 1) {
    app.lastOpponentMove = additions[0];
  } else if (app.boardIsEmpty(newBoard)) {
    app.lastOpponentMove = null;
  } else {
    /** 无新增对方棋子（例如己方落子、悔棋等）：清除对手上一手标记 */
    app.lastOpponentMove = null;
  }
}

/**
 * 仅在「当前轮到己方且标记落在对方棋子上」时绘制对手上一手标记；
 * 己方下完后轮到对方时不再显示，避免对方棋子上的标记残留。
 */
app.shouldShowOpponentLastMoveMarker = function() {
  if (!app.lastOpponentMove) {
    return false;
  }
  var lr = app.lastOpponentMove.r;
  var lc = app.lastOpponentMove.c;
  if (
    lr < 0 ||
    lr >= app.SIZE ||
    lc < 0 ||
    lc >= app.SIZE ||
    app.board[lr][lc] === gomoku.EMPTY
  ) {
    return false;
  }
  var stoneColor = app.board[lr][lc];
  if (app.isPvpOnline) {
    return (
      app.current === app.pvpOnlineYourColor &&
      stoneColor === app.oppositeColor(app.pvpOnlineYourColor)
    );
  }
  if (app.isPvpLocal) {
    return stoneColor === app.oppositeColor(app.current);
  }
  return app.current === app.pveHumanColor && stoneColor === app.pveAiColor();
}

app.oppositeColor = function(c) {
  return c === app.BLACK ? app.WHITE : app.BLACK;
}

app.countStonesOnBoard = function(b) {
  var n = 0;
  var r;
  var c;
  for (r = 0; r < app.SIZE; r++) {
    for (c = 0; c < app.SIZE; c++) {
      if (b[r][c] !== gomoku.EMPTY) {
        n++;
      }
    }
  }
  return n;
}

/**
 * 终局后写入本机历史：仅人机/同桌（联机战绩由服务端 /api/me/game-history 提供）。
 */
app.recordMatchHistoryFromGameEnd = function() {
  if (!app.gameOver || app.isPvpOnline) {
    return;
  }
  var rk = app.resultKind;
  var res = null;
  if (rk === 'pve_win') {
    res = 'win';
  } else if (rk === 'pve_lose') {
    res = 'lose';
  } else if (rk === 'pvp_draw' || rk === 'pve_draw') {
    res = 'draw';
  } else {
    return;
  }
  var steps = app.countStonesOnBoard(app.board);
  var opp = String(app.getOpponentDisplayName() || '对手');
  app.appendMatchHistoryRecord({
    t: Date.now(),
    res: res,
    opp: opp,
    steps: steps,
    mode: 'pve'
  });
}

app.stopReplayAuto = function() {
  if (app.replayAutoTimerId != null) {
    clearInterval(app.replayAutoTimerId);
    app.replayAutoTimerId = null;
  }
}

/**
 * 根据前后盘面维护联机手顺（与服务器 move 栈一致：多子为新增，少子为悔棋）。
 */
app.syncOnlineMoveHistory = function(prevBoard, nextBoard) {
  if (!prevBoard || !nextBoard) {
    return;
  }
  var nc = app.countStonesOnBoard(nextBoard);
  if (nc === 0) {
    app.onlineMoveHistory = [];
    return;
  }
  var pc = app.countStonesOnBoard(prevBoard);
  if (nc > pc) {
    var r;
    var c;
    for (r = 0; r < app.SIZE; r++) {
      for (c = 0; c < app.SIZE; c++) {
        if (prevBoard[r][c] === gomoku.EMPTY && nextBoard[r][c] !== gomoku.EMPTY) {
          app.onlineMoveHistory.push({
            r: r,
            c: c,
            color: nextBoard[r][c]
          });
        }
      }
    }
  } else if (nc < pc) {
    while (app.onlineMoveHistory.length > nc) {
      app.onlineMoveHistory.pop();
    }
  }
}

app.syncCurrentFromBoard = function() {
  var n = app.countStonesOnBoard(app.board);
  if (n === 0) {
    app.current = app.BLACK;
  } else {
    app.current = n % 2 === 1 ? app.WHITE : app.BLACK;
  }
}

app.refreshPveLastOpponent = function() {
  var ai = app.pveAiColor();
  var i;
  app.lastOpponentMove = null;
  for (i = app.pveMoveHistory.length - 1; i >= 0; i--) {
    if (app.pveMoveHistory[i].color === ai) {
      app.lastOpponentMove = {
        r: app.pveMoveHistory[i].r,
        c: app.pveMoveHistory[i].c
      };
      return;
    }
  }
}

app.refreshLocalLastOpponent = function() {
  if (app.localMoveHistory.length === 0) {
    app.lastOpponentMove = null;
    return;
  }
  var last = app.localMoveHistory[app.localMoveHistory.length - 1];
  app.lastOpponentMove = { r: last.r, c: last.c };
}

app.execPveUndo = function() {
  if (app.gameOver || app.isPvpLocal || app.isPvpOnline) {
    return;
  }
  if (app.pveMoveHistory.length === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  /** 人机：轮到 AI 时只撤己方最后一手；轮到己方时可撤两手（撤回上一回合人机各一手） */
  if (app.current === app.pveAiColor()) {
    app.aiMoveGeneration++;
    var hm = app.pveMoveHistory.pop();
    app.board[hm.r][hm.c] = gomoku.EMPTY;
    app.current = app.pveHumanColor;
    app.refreshPveLastOpponent();
    app.draw();
    return;
  }
  var pops = app.pveMoveHistory.length >= 2 ? 2 : 1;
  var i;
  for (i = 0; i < pops; i++) {
    var m = app.pveMoveHistory.pop();
    app.board[m.r][m.c] = gomoku.EMPTY;
  }
  app.syncCurrentFromBoard();
  app.refreshPveLastOpponent();
  if (app.current === app.pveAiColor()) {
    setTimeout(function () {
      app.runAiMove();
    }, 200);
  }
  app.draw();
}

app.tryLocalUndoRequest = function() {
  if (app.gameOver || !app.isPvpLocal || app.localMoveHistory.length === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  if (app.localUndoRequest) {
    return;
  }
  var n = app.localMoveHistory.length;
  var last = app.localMoveHistory[n - 1];
  var pendingPops = 0;
  var requesterColor;
  if (last.color === app.oppositeColor(app.current)) {
    pendingPops = 1;
    requesterColor = last.color;
  } else if (n >= 2) {
    var secondLast = app.localMoveHistory[n - 2];
    if (last.color !== app.current && secondLast.color === app.current) {
      pendingPops = 2;
      requesterColor = app.current;
    }
  }
  if (pendingPops === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  app.localUndoRequest = { requesterColor: requesterColor, pendingPops: pendingPops };
  app.draw();
}

app.applyLocalUndoPops = function() {
  if (app.localMoveHistory.length === 0) {
    return;
  }
  var m = app.localMoveHistory.pop();
  app.board[m.r][m.c] = gomoku.EMPTY;
  app.syncCurrentFromBoard();
  app.refreshLocalLastOpponent();
}

app.execLocalUndoAccept = function() {
  if (!app.localUndoRequest) {
    return;
  }
  var pops = app.localUndoRequest.pendingPops || 1;
  var i;
  for (i = 0; i < pops; i++) {
    app.applyLocalUndoPops();
  }
  app.localUndoRequest = null;
  app.draw();
}

app.execLocalUndoReject = function() {
  app.localUndoRequest = null;
  app.draw();
}

app.execLocalUndoCancel = function() {
  app.localUndoRequest = null;
  app.draw();
}

app.sendOnlineUndo = function(msgType) {
  if (!app.onlineSocketCanSend()) {
    wx.showToast({ title: '网络未连接', icon: 'none' });
    return;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: msgType })
  });
}

/** 联机：仅对方（非申请人）可点同意/拒绝；同桌：同屏显示，由轮到应的一方操作 */
app.showUndoRespondRow = function() {
  if (app.localUndoRequest) {
    return true;
  }
  if (
    app.isPvpOnline &&
    app.onlineUndoPending &&
    app.onlineUndoRequesterColor != null &&
    app.pvpOnlineYourColor !== app.onlineUndoRequesterColor
  ) {
    return true;
  }
  return false;
}

app.clearWinRevealTimer = function() {
  if (app.winRevealTimerId != null) {
    clearTimeout(app.winRevealTimerId);
    app.winRevealTimerId = null;
  }
}

app.finishGameWithWin = function(r, c, winnerColor) {
  app.gameOver = true;
  app.winner = winnerColor;
  var line = gomoku.getWinningLineCells(app.board, r, c, winnerColor);
  if (!line || line.length < 2) {
    app.winningLineCells = null;
    app.openResult();
    return;
  }
  app.winningLineCells = line;
  app.showResultOverlay = false;
  app.clearWinRevealTimer();
  app.winRevealTimerId = setTimeout(function () {
    app.winRevealTimerId = null;
    app.winningLineCells = null;
    app.openResult();
  }, app.WIN_REVEAL_DELAY_MS);
  app.draw();
}

/**
 * WebSocket STATE 里部分字段在个别环境下会变成字符串，与 app.BLACK/app.WHITE 数字比较会失败，
 * 导致一直显示「对方思考中」、无法落子。
 */
app.normalizeOnlineStoneInt = function(v, fallback) {
  if (v === undefined || v === null) {
    return fallback;
  }
  var n = Number(v);
  return isNaN(n) ? fallback : n;
}

app.applyOnlineState = function(data) {
  if (!data || data.type !== 'STATE') {
    return;
  }
  var prevBlack = app.onlineBlackConnected;
  var prevWhite = app.onlineWhiteConnected;
  var wasOver = app.gameOver;
  var prevBoard = app.copyBoardFromServer(app.board);
  app.board = app.copyBoardFromServer(data.board);
  if (app.countStonesOnBoard(app.board) === app.countStonesOnBoard(prevBoard) + 1) {
    app.playPlaceStoneSound();
  }
  app.syncOnlineMoveHistory(prevBoard, app.board);
  app.current = app.normalizeOnlineStoneInt(data.current, app.BLACK);
  app.gameOver = !!data.gameOver;
  if (!app.gameOver) {
    app.onlineSettleSent = false;
  }
  if (data.matchRound !== undefined && data.matchRound !== null) {
    var mr = Number(data.matchRound);
    if (!isNaN(mr) && mr >= 1) {
      app.onlineMatchRound = mr;
    }
  }
  if (data.winner === undefined || data.winner === null) {
    app.winner = null;
  } else {
    app.winner = app.normalizeOnlineStoneInt(data.winner, null);
  }
  app.pvpOnlineYourColor = app.normalizeOnlineStoneInt(data.yourColor, app.BLACK);
  app.onlineBlackConnected = !!data.blackConnected;
  app.onlineWhiteConnected = !!data.whiteConnected;
  if (data.whiteIsBot !== undefined && data.whiteIsBot !== null) {
    app.onlineOpponentIsBot = !!data.whiteIsBot;
  }
  if (app.isPvpOnline && (app.screen === 'game' || app.screen === 'matching')) {
    var yc = app.pvpOnlineYourColor;
    var oppWas = yc === app.BLACK ? prevWhite : prevBlack;
    var oppNow = yc === app.BLACK ? app.onlineWhiteConnected : app.onlineBlackConnected;
    if (oppNow) {
      app.onlineOpponentLeft = false;
    } else if (oppWas && !oppNow) {
      app.onlineOpponentLeft = true;
    }
  }
  app.onlineUndoPending = !!data.undoPending;
  if (data.undoRequesterColor === undefined || data.undoRequesterColor === null) {
    app.onlineUndoRequesterColor = null;
  } else {
    app.onlineUndoRequesterColor = app.normalizeOnlineStoneInt(
      data.undoRequesterColor,
      null
    );
  }
  app.lastMsg = '';
  app.syncLastOpponentMoveOnline(prevBoard, app.board, app.pvpOnlineYourColor);

  if (app.gameOver && !wasOver) {
    app.screen = 'game';
    if (app.winner != null) {
      var wm = app.findSingleNewStoneOfColor(prevBoard, app.board, app.winner);
      if (
        wm &&
        gomoku.checkWin(app.board, wm.r, wm.c, app.winner)
      ) {
        app.finishGameWithWin(wm.r, wm.c, app.winner);
      } else {
        app.openResult();
      }
      return;
    }
    app.openResult();
    return;
  }
  if (!app.gameOver && wasOver) {
    app.screen = 'game';
    if (app.showResultOverlay) {
      app.onlineResultOverlaySticky = true;
    } else {
      app.clearWinRevealTimer();
      app.winningLineCells = null;
    }
  }
  app.tryFetchOnlineOpponentProfile();
  app.draw();
}

};
