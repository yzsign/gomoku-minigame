/**
 * 微信小游戏入口：界面状态机、绘制、触摸、联机与人机流程
 */

var gomoku = require('./gomoku.js');
var render = require('./render.js');
var themes = require('./themes.js');
var doodles = require('./doodles.js');
var roomApi = require('./roomApi.js');
var authApi = require('./authApi.js');
var defaultAvatars = require('./defaultAvatars.js');
var ratingTitle = require('./ratingTitle.js');

/** 落子短音效（audio/stone.wav） */
var placeStoneAudio = null;
function playPlaceStoneSound() {
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
    return;
  }
  try {
    if (!placeStoneAudio) {
      placeStoneAudio = wx.createInnerAudioContext();
      placeStoneAudio.src = 'audio/stone.wav';
      placeStoneAudio.volume = 0.88;
    } else {
      placeStoneAudio.stop();
    }
    placeStoneAudio.play();
  } catch (e) {}
}

/** 首页画布战绩卡片（替代 wx.showModal） */
var ratingCardVisible = false;
var ratingCardData = null;
var ratingFetchInFlight = false;

/** 每日签到：服务端 wxcloudrun-gomoku（POST /api/me/checkin）+ 画布弹窗 */
var CHECKIN_DAILY_POINTS = 10;
var checkinStateCache = null;
var checkinModalVisible = false;
var checkinModalData = null;

/** 是否已处理过「首次资料」询问（含用户点暂不） */
var PROFILE_PROMPT_STORAGE_KEY = 'gomoku_profile_prompt_done';
/** 授权后写入，棋盘左下角展示「我」的昵称 */
var LOCAL_NICKNAME_KEY = 'gomoku_local_nickname';
/** 避免每帧 draw 调用 getStorageSync（同步 IO 易卡顿） */
var myDisplayNameCache = null;

function persistLocalNickname(userInfo) {
  if (userInfo) {
    defaultAvatars.setGenderFromUserInfo(userInfo);
  }
  if (!userInfo || !userInfo.nickName) {
    return;
  }
  var trimmed = String(userInfo.nickName).trim();
  myDisplayNameCache = trimmed || '我';
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(LOCAL_NICKNAME_KEY, trimmed);
    }
  } catch (e) {}
}

function getMyDisplayName() {
  if (myDisplayNameCache !== null) {
    return myDisplayNameCache;
  }
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var n = wx.getStorageSync(LOCAL_NICKNAME_KEY);
      if (n && String(n).trim()) {
        myDisplayNameCache = String(n).trim();
        return myDisplayNameCache;
      }
    }
  } catch (e2) {}
  myDisplayNameCache = '我';
  return '我';
}

function getOpponentDisplayName() {
  if (isPvpOnline && onlineOppNickname) {
    return onlineOppNickname;
  }
  if (isPvpOnline) {
    return '对手';
  }
  if (isPvpLocal) {
    return '对方';
  }
  if (isRandomMatch) {
    return randomOpponentName || '对手';
  }
  return '电脑';
}

/** 与 render.drawBoard 中棋盘外接矩形一致 */
function getBoardOuterRect(layout) {
  var cell = layout.cell;
  var n = layout.size;
  var bx = layout.originX - cell * 0.5;
  var by = layout.originY - cell * 0.5;
  var bw = n * cell;
  return { bx: bx, by: by, bw: bw, bh: bw };
}

function truncateNameToWidth(ctx, text, maxW) {
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
function computeBoardNameLabelLayout(layout) {
  var r = getBoardOuterRect(layout);
  var pad = Math.max(8, layout.cell * 0.22);
  var outerGap = Math.max(10, layout.cell * 0.34);
  var maxW = r.bw * 0.48;
  var fontPx = Math.max(
    15,
    Math.min(20, Math.round(14 + layout.cell * 0.22))
  );
  var avR = Math.max(17, Math.min(30, Math.round(layout.cell * 0.46)));
  var myImg = getMyAvatarImageForUi();
  var oppImg =
    isPvpOnline &&
    onlineOppAvatarImg &&
    onlineOppAvatarImg.width &&
    onlineOppAvatarImg.height
      ? onlineOppAvatarImg
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

function drawBoardNameLabels(ctx, layout, th) {
  var L = computeBoardNameLabelLayout(layout);
  var oppName = getOpponentDisplayName();
  var myName = getMyDisplayName();
  ctx.save();
  ctx.font =
    'bold ' +
    L.fontPx +
    'px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title || th.subtitle;
  oppName = truncateNameToWidth(
    ctx,
    oppName,
    Math.max(40, L.maxW - (L.hasOppAv ? L.avR * 2 + 6 : 0))
  );
  myName = truncateNameToWidth(
    ctx,
    myName,
    Math.max(40, L.maxW - (L.hasMyAv ? L.avR * 2 + 6 : 0))
  );
  /** 对手：棋盘右上角外侧；无网络图时用服务端性别或「与本人相反」默认 */
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(oppName, snapPx(L.oppNameRightX), snapPx(L.oppCy));
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
  ctx.fillText(myName, snapPx(L.myTextX), snapPx(L.myCy));
  ctx.restore();
}

function hitCircleAvatar(clientX, clientY, cx, cy, r) {
  var dx = clientX - cx;
  var dy = clientY - cy;
  var hitR = r + 10;
  return dx * dx + dy * dy <= hitR * hitR;
}

/**
 * 对局中点击棋盘旁头像区域：返回 'my' | 'opp' | null（仅「我」可点开天梯弹层）
 */
function hitWhichGameBoardNameAvatar(clientX, clientY) {
  if (screen !== 'game') {
    return null;
  }
  var L = computeBoardNameLabelLayout(layout);
  if (L.hasMyAv && hitCircleAvatar(clientX, clientY, L.myCx, L.myCy, L.avR)) {
    return 'my';
  }
  if (L.hasOppAv && hitCircleAvatar(clientX, clientY, L.oppCx, L.oppCy, L.avR)) {
    return 'opp';
  }
  return null;
}

/**
 * 首次进入：系统弹窗询问是否授权昵称与头像（无页面内自定义按钮）。
 * 授权走 wx.getUserProfile；若因手势限制失败，则降级为一次性全屏透明授权层（仍无可见按钮）。
 */
function maybeFirstVisitProfileModal() {
  if (typeof wx === 'undefined') {
    return;
  }
  try {
    if (wx.getStorageSync(PROFILE_PROMPT_STORAGE_KEY) === '1') {
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
            wx.setStorageSync(PROFILE_PROMPT_STORAGE_KEY, '1');
          } catch (e1) {}
          return;
        }
        if (typeof wx.getUserProfile !== 'function') {
          tryOneShotInvisibleUserInfoButton();
          return;
        }
        wx.getUserProfile({
          desc: '用于展示昵称与头像',
          success: function (up) {
            if (up && up.userInfo) {
              persistLocalNickname(up.userInfo);
              authApi.silentLogin(up.userInfo, function (ok) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({
                    title: ok ? '资料已保存' : '保存失败',
                    icon: ok ? 'success' : 'none'
                  });
                }
                draw();
              });
            }
            try {
              wx.setStorageSync(PROFILE_PROMPT_STORAGE_KEY, '1');
            } catch (e2) {}
          },
          fail: function () {
            tryOneShotInvisibleUserInfoButton();
          }
        });
      }
    });
  }, 450);
}

/** 降级：全屏透明原生层，用户点一下屏幕完成授权（无可见按钮文案） */
function tryOneShotInvisibleUserInfoButton() {
  if (typeof wx === 'undefined' || typeof wx.createUserInfoButton !== 'function') {
    try {
      wx.setStorageSync(PROFILE_PROMPT_STORAGE_KEY, '1');
    } catch (e3) {}
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '当前环境无法授权', icon: 'none' });
    }
    return;
  }
  syncCanvasWithWindow();
  var w = W;
  var h = H;
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
      persistLocalNickname(userInfo);
      authApi.silentLogin(userInfo, function (ok) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({
            title: ok ? '资料已保存' : '保存失败',
            icon: ok ? 'success' : 'none'
          });
        }
        draw();
      });
    }
    try {
      btn.destroy();
    } catch (e4) {}
    try {
      wx.setStorageSync(PROFILE_PROMPT_STORAGE_KEY, '1');
    } catch (e5) {}
  });
}

themes.setTuanMoeUnlockedFromServer(false);
if (typeof themes.setCheckinStreakFromServer === 'function') {
  themes.setCheckinStreakFromServer(0);
}
themes.setPieceSkinUnlockedIdsFromServer([]);
var themeId = themes.loadSavedThemeId();
var pieceSkinId = themes.loadSavedPieceSkinId();

/** 首页「棋子换肤」弹窗：居中缩放 + 遮罩 */
var pieceSkinModalVisible = false;
var pieceSkinModalAnim = 0;
var pieceSkinModalAnimRafId = null;
/** 分页与当前选中（catalog 全局下标） */
var pieceSkinModalPage = 0;
var pieceSkinModalPendingIdx = 0;
var pieceSkinRedeemInFlight = false;

/** 棋子换肤：设计稿基准宽度 rpx（304×0.8×1.1） */
var PIECE_SKIN_CARD_W_RPX = 304 * 0.88;
/** 棋子换肤：通用正文字体栈 */
var PIECE_SKIN_FONT_UI =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

/** 风格切换气泡文案（空则不绘制） */
var themeBubbleText = '';
var themeBubbleAlpha = 1;
var themeBubbleRafId = null;

/** 首页侧滑菜单是否打开 */
var homeDrawerOpen = false;
/** 首页三主按钮按下态：'random' | 'pvp' | 'pve' | null（松手在同类按钮上才触发逻辑） */
var homePressedButton = null;
/** 首页底部 Dock 按下列：0～3 或 null（与 hitHomeBottomNav 一致） */
var homePressedDockCol = null;

/** 历史战绩页：本机最近对局 + 滚动 */
var MATCH_HISTORY_STORAGE_KEY = 'gomoku_match_history_v1';
var PEAK_ELO_STORAGE_KEY = 'gomoku_peak_elo_v1';
var matchHistoryList = [];
var historyStatsSnapshot = null;
var historyScrollY = 0;
var historyFilterTab = 0;
var historyScrollTouchId = null;
var historyScrollLastY = 0;
var historyPeakEloCached = 0;
/** GET /api/me/game-history 返回的 items；与本地人机记录合并展示 */
var historyServerItems = [];

function historyListRowHeightRpx() {
  return rpx(112);
}

function historyListRowGapRpx() {
  return rpx(16);
}

function loadPeakEloFromStorage() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) {
      historyPeakEloCached = 0;
      return;
    }
    var v = wx.getStorageSync(PEAK_ELO_STORAGE_KEY);
    var n = Number(v);
    historyPeakEloCached = !isNaN(n) && n > 0 ? Math.floor(n) : 0;
  } catch (e) {
    historyPeakEloCached = 0;
  }
}

function savePeakEloIfHigher(elo) {
  if (typeof elo !== 'number' || isNaN(elo)) {
    return;
  }
  loadPeakEloFromStorage();
  var e = Math.floor(elo);
  if (e > historyPeakEloCached) {
    historyPeakEloCached = e;
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(PEAK_ELO_STORAGE_KEY, String(historyPeakEloCached));
      }
    } catch (e2) {}
  }
}

function loadMatchHistoryList() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) {
      matchHistoryList = [];
      return;
    }
    var raw = wx.getStorageSync(MATCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      matchHistoryList = [];
      return;
    }
    var arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    matchHistoryList = Array.isArray(arr) ? arr : [];
  } catch (e) {
    matchHistoryList = [];
  }
}

function persistMatchHistoryList() {
  try {
    if (typeof wx === 'undefined' || !wx.setStorageSync) {
      return;
    }
    var cap = matchHistoryList.slice(0, 100);
    wx.setStorageSync(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(cap));
    matchHistoryList = cap;
  } catch (e) {}
}

function appendMatchHistoryRecord(entry) {
  loadMatchHistoryList();
  matchHistoryList.unshift(entry);
  if (matchHistoryList.length > 100) {
    matchHistoryList.length = 100;
  }
  persistMatchHistoryList();
}

function formatHistoryDateTime(ts) {
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

function mapServerHistoryItem(it) {
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
  return {
    t: typeof it.endedAt === 'number' ? it.endedAt : 0,
    res: res,
    opp: String(it.opponentNickname != null ? it.opponentNickname : '对手'),
    steps: typeof it.totalSteps === 'number' ? it.totalSteps : 0,
    mode: 'server',
    gameId: it.gameId,
    opponentBot: !!it.opponentBot,
    oppAvatarUrl: av,
    oppGender: og
  };
}

/** 历史列表对手网络头像缓存：url → Image | false（失败）| 'loading' */
var historyOppAvatarImgCache = {};

function getOrLoadHistoryOpponentAvatar(url) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    return null;
  }
  var cached = historyOppAvatarImgCache[url];
  if (cached && cached.width && cached.height) {
    return cached;
  }
  if (cached === false) {
    return null;
  }
  if (cached === 'loading') {
    return null;
  }
  historyOppAvatarImgCache[url] = 'loading';
  var img = wx.createImage();
  img.onload = function () {
    historyOppAvatarImgCache[url] = img;
    if (screen === 'history') {
      try {
        draw();
      } catch (e) {}
    }
  };
  img.onerror = function () {
    historyOppAvatarImgCache[url] = false;
    if (screen === 'history') {
      try {
        draw();
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
function resolveHistoryRowAvatarImage(rec) {
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
  var net = getOrLoadHistoryOpponentAvatar(url.trim());
  if (net && net.width && net.height) {
    return net;
  }
  return def;
}

/**
 * 服务端已结算联机 + 本机人机（mode===pve），按时间倒序。
 */
function getDisplayMatchHistoryList() {
  var fromServer = [];
  var i;
  if (historyServerItems && historyServerItems.length) {
    for (i = 0; i < historyServerItems.length; i++) {
      fromServer.push(mapServerHistoryItem(historyServerItems[i]));
    }
  }
  var pveLocal = [];
  for (i = 0; i < matchHistoryList.length; i++) {
    var e = matchHistoryList[i];
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

function getFilteredMatchHistory() {
  var list = getDisplayMatchHistoryList();
  if (historyFilterTab === 1) {
    return list.filter(function (x) {
      return x && x.res === 'win';
    });
  }
  if (historyFilterTab === 2) {
    return list.filter(function (x) {
      return x && x.res === 'lose';
    });
  }
  return list.slice();
}

/** 首页顶栏积分：null 表示尚未从 /api/me/rating 同步 */
var homeRatingEloCache = null;

function getCurrentTheme() {
  return themes.getTheme(themeId);
}

/**
 * 为已合并的棋子主题挂上贴图资源（若当前皮肤需要且已加载）。
 */
function enrichPieceSkinTheme(theme, skinId) {
  if (skinId === 'tuan_moe') {
    if (
      tuanMoePieceBlackImg &&
      tuanMoePieceBlackImg.width &&
      tuanMoePieceWhiteImg &&
      tuanMoePieceWhiteImg.width
    ) {
      theme.pieceTextureBlackImg = tuanMoePieceBlackImg;
      theme.pieceTextureWhiteImg = tuanMoePieceWhiteImg;
    }
    return theme;
  }
  if (skinId === 'qingtao_libai') {
    if (
      qingtaoLibaiPieceBlackImg &&
      qingtaoLibaiPieceBlackImg.width &&
      qingtaoLibaiPieceWhiteImg &&
      qingtaoLibaiPieceWhiteImg.width
    ) {
      theme.pieceTextureBlackImg = qingtaoLibaiPieceBlackImg;
      theme.pieceTextureWhiteImg = qingtaoLibaiPieceWhiteImg;
    }
    return theme;
  }
  return theme;
}

/**
 * 绘制棋子用：在基底主题上套用棋子皮肤（与界面风格独立）。
 * 对局页基底为檀木盘时仍用 classic 作合并基底。
 */
function getThemeForPieces(baseTheme) {
  var t = themes.applyPieceSkin(baseTheme, pieceSkinId);
  return enrichPieceSkinTheme(t, pieceSkinId);
}

/**
 * 随机匹配页、联机随机/好友对局内固定檀木界面色；首页与棋谱等仍跟随后台所选主题。
 */
function getUiTheme() {
  if (screen === 'matching') {
    return themes.getTheme('classic');
  }
  if (screen === 'history') {
    return getCurrentTheme();
  }
  if (screen === 'game' && (isPvpOnline || isRandomMatch)) {
    return themes.getTheme('classic');
  }
  return getCurrentTheme();
}

var SIZE = gomoku.SIZE;
var BLACK = gomoku.BLACK;
var WHITE = gomoku.WHITE;

var canvas = wx.createCanvas();
var ctx = canvas.getContext('2d');

/** 与布局、安全区、DPR 等一致；窗口变化时需刷新 */
var sys = {};
var W = 375;
var H = 667;
var DPR = 2;

/**
 * 按当前窗口与 pixelRatio 设置画布物理像素与 ctx 变换。
 * 触摸坐标仍为逻辑像素，与 W/H 一致；安全区、状态栏等随 sys 更新。
 */
function syncCanvasWithWindow() {
  try {
    sys = wx.getSystemInfoSync() || {};
  } catch (e1) {
    sys = {};
  }
  W = sys.windowWidth || 375;
  H = sys.windowHeight || 667;
  if (W < 1) {
    W = 375;
  }
  if (H < 1) {
    H = 667;
  }
  DPR = sys.pixelRatio;
  if (DPR == null || DPR < 1 || DPR !== DPR) {
    DPR = 2;
  }
  /* 上限略放宽：高倍屏（如 3.5x）不再压到 3，提高清晰度；过高会占内存 */
  if (DPR > 4) {
    DPR = 4;
  }
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  render.setCanvasDpr(DPR);
  if (typeof ctx.imageSmoothingEnabled !== 'undefined') {
    ctx.imageSmoothingEnabled = true;
  }
  if (typeof ctx.imageSmoothingQuality !== 'undefined') {
    ctx.imageSmoothingQuality = 'high';
  }
}

syncCanvasWithWindow();
render.preloadQinghuaPattern();
render.preloadInkLotusPattern();

/** 与物理像素对齐，供非 render.drawText 的 fillText 使用 */
function snapPx(x) {
  return render.snapLogical(x);
}

/* ---------- 界面与对局状态 ---------- */

/** 'home' | 'pve_color' | 'matching' | 'game' | 'history' | 'replay' */
var screen = 'home';

/** 对局结束：在棋盘页上以半透明弹层展示（不再切全屏 result） */
var showResultOverlay = false;

/** 联机：对方已重置开新局，本端仍显示上一局结算直至用户点「再来一局/返回首页」 */
var onlineResultOverlaySticky = false;

/** 分出胜负：先高亮五连连线，约 2s 后再弹出结算 */
var WIN_REVEAL_DELAY_MS = 2000;
var winningLineCells = null;
var winRevealTimerId = null;

/**
 * 对局结束页：pve_win | pve_lose | pve_draw | pvp_* | online_win | online_lose
 */
var resultKind = '';

/** 人机：玩家执子 gomoku.BLACK | gomoku.WHITE */
var pveHumanColor = BLACK;

/**
 * 人机连珠：固定启用 RIF 式开局（开局库），无交换执棋流程。
 */

/** 人机难度展示文案（与 Worker 搜索强度对应） */
var PVE_DIFF_LABEL = '巅峰';

function pveAiColor() {
  return pveHumanColor === BLACK ? WHITE : BLACK;
}

/** 是否由「随机匹配」进入的人机局（用于文案） */
var isRandomMatch = false;
/** 联机白方为数据库人机（随机匹配超时接入） */
var onlineOpponentIsBot = false;

/** 同桌好友对战：双方在同一设备轮流落子（无需服务端） */
var isPvpLocal = false;

/** 联机好友对战（Spring Boot WebSocket） */
var isPvpOnline = false;
var onlineRoomId = '';
var onlineToken = '';
/** 本客户端执子 gomoku.BLACK | gomoku.WHITE，与服务器 STATE.yourColor 一致 */
var pvpOnlineYourColor = BLACK;
var onlineBlackConnected = false;
var onlineWhiteConnected = false;
/** 对方曾在线后断开，用于状态栏「对方已离开房间」 */
var onlineOpponentLeft = false;
var socketTask = null;
/** WebSocket 已 onOpen，可 send；断线后为 false，用于重连提示与拦截落子 */
var onlineWsConnected = false;
var onlineReconnectTimer = null;
var onlineReconnectAttempt = 0;
var ONLINE_RECONNECT_BASE_MS = 800;
var ONLINE_RECONNECT_MAX_MS = 30000;
/** 当前 WS 代数，用于忽略 closeSocketOnly 触发的旧连接 onClose */
var onlineSocketConnectGen = 0;
/** 是否曾成功 onOpen（用于区分首连与断线重连文案） */
var onlineWsEverOpened = false;
/** 避免冷启动与 onShow 各处理一次同一邀请 */
var onlineInviteConsumed = false;
/** 本局是否已请求 POST /api/games/settle（防重复；新局由 applyOnlineState 置 false） */
var onlineSettleSent = false;
/** 与 WS STATE.matchRound 一致：首局 1，再来一局后递增，用于结算上报 */
var onlineMatchRound = 1;

/** 联机：从盘面差分同步的终局手顺（悔棋会缩短），用于结算 moves 与回放 */
var onlineMoveHistory = [];
/** POST /api/games/settle 返回的 gameId，棋谱可事后拉取 */
var lastSettledGameId = null;
/** screen === 'replay'：棋谱数据与当前展示步数（0 表示空盘） */
var replayMoves = [];
var replayStep = 0;
var replayAutoTimerId = null;

/** 联机对手：服务端头像与昵称（与占位默认图区分） */
var onlineOppAvatarImg = null;
var onlineOppNickname = '';
var onlineOppProfileRoomId = '';
var onlineOppProfileFetched = false;
var onlineOppFetchInFlight = false;

/** 本人：服务端 avatarUrl 加载的网络图（首页与棋盘共用） */
var myNetworkAvatarImg = null;
var myProfileAvatarFetched = false;

/** 首页：images/ui 下 PNG，失败时回退矢量线稿 */
var homeDockCheckinImg = null;
var homeDockRankImg = null;
var homeDockHistoryImg = null;
var homeDockSkinImg = null;
/** 「团团萌肤」棋子贴图（UI/棋子 同步至 images/pieces） */
var tuanMoePieceBlackImg = null;
var tuanMoePieceWhiteImg = null;
/** 「青萄荔白」fruit1 / fruit2 */
var qingtaoLibaiPieceBlackImg = null;
var qingtaoLibaiPieceWhiteImg = null;
var homeMascotImg = null;
/** 横向雪碧图（分包 `subpackages/res-mascot/images/ui/home-mascot-sheet.png`） */
var homeMascotSheetImg = null;
/**
 * 雪碧图横向帧数（与分包内 home-mascot-sheet.png 一致；由 video_to_mascot_assets 导出）
 */
var MASCOT_SHEET_FRAME_COUNT = 41;
var MASCOT_SHEET_FPS = 8;
/** 修改首页 PNG 或路径时递增，避免热重载仍认为「已加载」而跳过 */
var HOME_UI_ASSETS_REV = 23;
/** 吉祥物资源所在分包（见 game.json）；wx.loadSubpackage 成功后再加载大图 */
var HOME_SUBPACKAGE_NAME = 'res-mascot';
/** 分包内吉祥物路径前缀；失败时回退主包 images/ui/ */
var MASCOT_SUBPKG_PREFIX = 'subpackages/res-mascot/images/ui/';
var homeUiAssetsAppliedRev = -1;
var homeUiAssetsLoadInFlight = false;

/** 随机匹配到的假对手昵称 */
var randomOpponentName = '';

var matchingTimer = null;
var matchingAnimTimer = null;
var matchingDots = 0;
/** 首页吉祥物雪碧图逐帧：仅多帧且雪碧图已加载时定时 redraw */
var homeMascotAnimTimer = null;
/** 随机匹配：已为房主创建房间并等待真人对手（超时则人机） */
var randomMatchHostWaiting = false;
/** 房主首次 POST /match/random 的 blackToken：仅用于 cancel / fallback-bot；连 WS 须用 paired.yourToken */
var randomMatchHostCancelToken = '';
/** 房主轮询 GET /match/random/paired 直到 guestJoined */
var randomMatchPairedPollTimer = null;
var RANDOM_MATCH_TIMEOUT_MS = 5000;
var RANDOM_MATCH_PAIRED_POLL_MS = 400;

var FAKE_OPPONENT_NAMES = [
  '棋手甲',
  '棋手乙',
  '路人王',
  '云游子',
  '青松客',
  '夜行侠'
];
var board = gomoku.createBoard();
var current = BLACK;
var gameOver = false;
var winner = null;
var lastMsg = '';

/** 对手上一手坐标（人机=AI、同桌=对方、联机=对方）；仅游戏盘绘制 */
var lastOpponentMove = null;

/** Worker 人机：强棋力在子线程算，主线程不卡；失败时回退 gomoku.aiMove */
var aiWorkerInstance = null;
var aiWorkerSeq = 0;
var aiMoveGeneration = 0;

/** 人机：走子栈（悔棋用） */
var pveMoveHistory = [];

/** 同桌：走子栈；localUndoRequest 含 requesterColor、pendingPops(1|2) */
var localMoveHistory = [];
var localUndoRequest = null;

/** 联机：服务端 undoPending / undoRequesterColor */
var onlineUndoPending = false;
var onlineUndoRequesterColor = null;

/* ---------- 联机：WebSocket 与房间 ---------- */

function closeSocketOnly() {
  if (socketTask) {
    try {
      socketTask.close({});
    } catch (e1) {}
    socketTask = null;
  }
  onlineWsConnected = false;
}

function clearOnlineReconnectTimer() {
  if (onlineReconnectTimer) {
    clearTimeout(onlineReconnectTimer);
    onlineReconnectTimer = null;
  }
}

/** 联机对局/匹配等待中是否应保持 roomId+token 并允许自动重连 */
function shouldAutoReconnectOnline() {
  if (!onlineRoomId || !onlineToken) {
    return false;
  }
  if (screen === 'game') {
    return true;
  }
  if (screen === 'matching' && randomMatchHostWaiting) {
    return true;
  }
  return false;
}

function scheduleOnlineReconnect(immediate) {
  clearOnlineReconnectTimer();
  if (!shouldAutoReconnectOnline()) {
    return;
  }
  var delay;
  if (immediate) {
    delay = 0;
  } else {
    delay = Math.min(
      ONLINE_RECONNECT_BASE_MS * Math.pow(2, onlineReconnectAttempt),
      ONLINE_RECONNECT_MAX_MS
    );
  }
  onlineReconnectTimer = setTimeout(function () {
    onlineReconnectTimer = null;
    if (!shouldAutoReconnectOnline()) {
      return;
    }
    onlineReconnectAttempt++;
    startOnlineSocket();
  }, delay);
}

function handleOnlineSocketDead() {
  socketTask = null;
  onlineWsConnected = false;
  if (shouldAutoReconnectOnline()) {
    scheduleOnlineReconnect(false);
    draw();
  }
}

function disconnectOnline() {
  clearOnlineReconnectTimer();
  onlineReconnectAttempt = 0;
  onlineSocketConnectGen++;
  onlineWsEverOpened = false;
  onlineResultOverlaySticky = false;
  onlineOpponentLeft = false;
  closeSocketOnly();
  stopReplayAuto();
  onlineMoveHistory = [];
  lastSettledGameId = null;
  isPvpOnline = false;
  onlineRoomId = '';
  onlineToken = '';
  pvpOnlineYourColor = BLACK;
  onlineBlackConnected = false;
  onlineWhiteConnected = false;
  onlineOpponentIsBot = false;
  onlineUndoPending = false;
  onlineUndoRequesterColor = null;
  onlineSettleSent = false;
  onlineMatchRound = 1;
  randomMatchHostCancelToken = '';
  clearOnlineOpponentProfile();
  if (screen === 'replay') {
    screen = 'game';
    showResultOverlay = false;
  }
}

function clearOnlineOpponentProfile() {
  onlineOppAvatarImg = null;
  onlineOppNickname = '';
  onlineOppProfileRoomId = '';
  onlineOppProfileFetched = false;
  onlineOppFetchInFlight = false;
  defaultAvatars.setOpponentGenderFromServer(null);
}

/** GET /api/me/rating 等返回的 gender 同步到默认头像逻辑（users.gender） */
function applyMyGenderFromRatingPayload(d) {
  if (d && typeof d.gender === 'number' && d.gender >= 0 && d.gender <= 2) {
    defaultAvatars.setMyGenderFromServer(d.gender);
  }
}

function loadMyNetworkAvatar(url) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  var img = wx.createImage();
  img.onload = function () {
    myNetworkAvatarImg = img;
    draw();
  };
  img.onerror = function () {
    myNetworkAvatarImg = null;
    draw();
  };
  img.src = url;
}

function loadOnlineOpponentAvatar(url) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  var src = url;
  if (src.indexOf('local:') === 0) {
    src = src.slice('local:'.length);
  }
  var img = wx.createImage();
  img.onload = function () {
    onlineOppAvatarImg = img;
    draw();
  };
  img.onerror = function () {
    onlineOppAvatarImg = null;
    draw();
  };
  img.src = src;
}

function applyOnlineOpponentProfilePayload(d) {
  if (!d) {
    return;
  }
  if (typeof d.nickname === 'string' && d.nickname.trim()) {
    onlineOppNickname = d.nickname.trim();
  } else {
    onlineOppNickname = '';
  }
  if (typeof d.gender === 'number' && d.gender >= 0 && d.gender <= 2) {
    defaultAvatars.setOpponentGenderFromServer(d.gender);
  } else {
    defaultAvatars.setOpponentGenderFromServer(null);
  }
  if (typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
    loadOnlineOpponentAvatar(d.avatarUrl.trim());
  } else {
    onlineOppAvatarImg = null;
    draw();
  }
}

/** 双方已入座后拉取对手公开资料，使棋盘头像与对端资料一致 */
function tryFetchOnlineOpponentProfile() {
  if (!isPvpOnline || !onlineRoomId || !authApi.getSessionToken()) {
    return;
  }
  if (!onlineBlackConnected || !onlineWhiteConnected) {
    return;
  }
  if (onlineOppFetchInFlight) {
    return;
  }
  if (onlineOppProfileRoomId === onlineRoomId && onlineOppProfileFetched) {
    return;
  }
  onlineOppFetchInFlight = true;
  wx.request(
    Object.assign(roomApi.roomOpponentRatingOptions(onlineRoomId), {
      success: function (res) {
        onlineOppFetchInFlight = false;
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
        onlineOppProfileRoomId = onlineRoomId;
        onlineOppProfileFetched = true;
        applyOnlineOpponentProfilePayload(d);
      },
      fail: function () {
        onlineOppFetchInFlight = false;
      }
    })
  );
}

function tryFetchMyProfileAvatar() {
  if (myProfileAvatarFetched || !authApi.getSessionToken()) {
    return;
  }
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
      success: function (res) {
        if (res.statusCode !== 200 || !res.data) {
          return;
        }
        myProfileAvatarFetched = true;
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (e2) {
            return;
          }
        }
        if (d && typeof d.eloScore === 'number' && !isNaN(d.eloScore)) {
          homeRatingEloCache = d.eloScore;
        }
        syncCheckinStateFromServerPayload(d);
        applyMyGenderFromRatingPayload(d);
        if (d && typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
          loadMyNetworkAvatar(d.avatarUrl.trim());
        }
        draw();
      },
      fail: function () {}
    })
  );
}

function getMyAvatarImageForUi() {
  if (
    myNetworkAvatarImg &&
    myNetworkAvatarImg.width &&
    myNetworkAvatarImg.height
  ) {
    return myNetworkAvatarImg;
  }
  return defaultAvatars.getMyAvatarImage();
}

function onlineSocketCanSend() {
  return (
    socketTask &&
    typeof socketTask.send === 'function' &&
    onlineWsConnected
  );
}

function copyBoardFromServer(b) {
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

function boardIsEmpty(b) {
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (b[r][c] !== gomoku.EMPTY) {
        return false;
      }
    }
  }
  return true;
}

/** 联机同步：找出新落的一子（该方颜色），用于定位五连 */
function findSingleNewStoneOfColor(prevBoard, newBoard, color) {
  var list = [];
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
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
function syncLastOpponentMoveOnline(prevBoard, newBoard, yourColor) {
  var opp = yourColor === BLACK ? WHITE : BLACK;
  var additions = [];
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (prevBoard[r][c] === gomoku.EMPTY && newBoard[r][c] === opp) {
        additions.push({ r: r, c: c });
      }
    }
  }
  if (additions.length === 1) {
    lastOpponentMove = additions[0];
  } else if (boardIsEmpty(newBoard)) {
    lastOpponentMove = null;
  } else {
    /** 无新增对方棋子（例如己方落子、悔棋等）：清除对手上一手标记 */
    lastOpponentMove = null;
  }
}

/**
 * 仅在「当前轮到己方且标记落在对方棋子上」时绘制对手上一手标记；
 * 己方下完后轮到对方时不再显示，避免对方棋子上的标记残留。
 */
function shouldShowOpponentLastMoveMarker() {
  if (!lastOpponentMove) {
    return false;
  }
  var lr = lastOpponentMove.r;
  var lc = lastOpponentMove.c;
  if (
    lr < 0 ||
    lr >= SIZE ||
    lc < 0 ||
    lc >= SIZE ||
    board[lr][lc] === gomoku.EMPTY
  ) {
    return false;
  }
  var stoneColor = board[lr][lc];
  if (isPvpOnline) {
    return (
      current === pvpOnlineYourColor &&
      stoneColor === oppositeColor(pvpOnlineYourColor)
    );
  }
  if (isPvpLocal) {
    return stoneColor === oppositeColor(current);
  }
  return current === pveHumanColor && stoneColor === pveAiColor();
}

function oppositeColor(c) {
  return c === BLACK ? WHITE : BLACK;
}

function countStonesOnBoard(b) {
  var n = 0;
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
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
function recordMatchHistoryFromGameEnd() {
  if (!gameOver || isPvpOnline) {
    return;
  }
  var rk = resultKind;
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
  var steps = countStonesOnBoard(board);
  var opp = String(getOpponentDisplayName() || '对手');
  appendMatchHistoryRecord({
    t: Date.now(),
    res: res,
    opp: opp,
    steps: steps,
    mode: 'pve'
  });
}

function stopReplayAuto() {
  if (replayAutoTimerId != null) {
    clearInterval(replayAutoTimerId);
    replayAutoTimerId = null;
  }
}

/**
 * 根据前后盘面维护联机手顺（与服务器 move 栈一致：多子为新增，少子为悔棋）。
 */
function syncOnlineMoveHistory(prevBoard, nextBoard) {
  if (!prevBoard || !nextBoard) {
    return;
  }
  var nc = countStonesOnBoard(nextBoard);
  if (nc === 0) {
    onlineMoveHistory = [];
    return;
  }
  var pc = countStonesOnBoard(prevBoard);
  if (nc > pc) {
    var r;
    var c;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (prevBoard[r][c] === gomoku.EMPTY && nextBoard[r][c] !== gomoku.EMPTY) {
          onlineMoveHistory.push({
            r: r,
            c: c,
            color: nextBoard[r][c]
          });
        }
      }
    }
  } else if (nc < pc) {
    while (onlineMoveHistory.length > nc) {
      onlineMoveHistory.pop();
    }
  }
}

function syncCurrentFromBoard() {
  var n = countStonesOnBoard(board);
  if (n === 0) {
    current = BLACK;
  } else {
    current = n % 2 === 1 ? WHITE : BLACK;
  }
}

function refreshPveLastOpponent() {
  var ai = pveAiColor();
  var i;
  lastOpponentMove = null;
  for (i = pveMoveHistory.length - 1; i >= 0; i--) {
    if (pveMoveHistory[i].color === ai) {
      lastOpponentMove = {
        r: pveMoveHistory[i].r,
        c: pveMoveHistory[i].c
      };
      return;
    }
  }
}

function refreshLocalLastOpponent() {
  if (localMoveHistory.length === 0) {
    lastOpponentMove = null;
    return;
  }
  var last = localMoveHistory[localMoveHistory.length - 1];
  lastOpponentMove = { r: last.r, c: last.c };
}

function execPveUndo() {
  if (gameOver || isPvpLocal || isPvpOnline) {
    return;
  }
  if (pveMoveHistory.length === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  /** 人机：轮到 AI 时只撤己方最后一手；轮到己方时可撤两手（撤回上一回合人机各一手） */
  if (current === pveAiColor()) {
    aiMoveGeneration++;
    var hm = pveMoveHistory.pop();
    board[hm.r][hm.c] = gomoku.EMPTY;
    current = pveHumanColor;
    refreshPveLastOpponent();
    draw();
    return;
  }
  var pops = pveMoveHistory.length >= 2 ? 2 : 1;
  var i;
  for (i = 0; i < pops; i++) {
    var m = pveMoveHistory.pop();
    board[m.r][m.c] = gomoku.EMPTY;
  }
  syncCurrentFromBoard();
  refreshPveLastOpponent();
  if (current === pveAiColor()) {
    setTimeout(function () {
      runAiMove();
    }, 200);
  }
  draw();
}

function tryLocalUndoRequest() {
  if (gameOver || !isPvpLocal || localMoveHistory.length === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  if (localUndoRequest) {
    return;
  }
  var n = localMoveHistory.length;
  var last = localMoveHistory[n - 1];
  var pendingPops = 0;
  var requesterColor;
  if (last.color === oppositeColor(current)) {
    pendingPops = 1;
    requesterColor = last.color;
  } else if (n >= 2) {
    var secondLast = localMoveHistory[n - 2];
    if (last.color !== current && secondLast.color === current) {
      pendingPops = 2;
      requesterColor = current;
    }
  }
  if (pendingPops === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  localUndoRequest = { requesterColor: requesterColor, pendingPops: pendingPops };
  draw();
}

function applyLocalUndoPops() {
  if (localMoveHistory.length === 0) {
    return;
  }
  var m = localMoveHistory.pop();
  board[m.r][m.c] = gomoku.EMPTY;
  syncCurrentFromBoard();
  refreshLocalLastOpponent();
}

function execLocalUndoAccept() {
  if (!localUndoRequest) {
    return;
  }
  var pops = localUndoRequest.pendingPops || 1;
  var i;
  for (i = 0; i < pops; i++) {
    applyLocalUndoPops();
  }
  localUndoRequest = null;
  draw();
}

function execLocalUndoReject() {
  localUndoRequest = null;
  draw();
}

function execLocalUndoCancel() {
  localUndoRequest = null;
  draw();
}

function sendOnlineUndo(msgType) {
  if (!onlineSocketCanSend()) {
    wx.showToast({ title: '网络未连接', icon: 'none' });
    return;
  }
  socketTask.send({
    data: JSON.stringify({ type: msgType })
  });
}

/** 联机：仅对方（非申请人）可点同意/拒绝；同桌：同屏显示，由轮到应的一方操作 */
function showUndoRespondRow() {
  if (localUndoRequest) {
    return true;
  }
  if (
    isPvpOnline &&
    onlineUndoPending &&
    onlineUndoRequesterColor != null &&
    pvpOnlineYourColor !== onlineUndoRequesterColor
  ) {
    return true;
  }
  return false;
}

function clearWinRevealTimer() {
  if (winRevealTimerId != null) {
    clearTimeout(winRevealTimerId);
    winRevealTimerId = null;
  }
}

function finishGameWithWin(r, c, winnerColor) {
  gameOver = true;
  winner = winnerColor;
  var line = gomoku.getWinningLineCells(board, r, c, winnerColor);
  if (!line || line.length < 2) {
    winningLineCells = null;
    openResult();
    return;
  }
  winningLineCells = line;
  showResultOverlay = false;
  clearWinRevealTimer();
  winRevealTimerId = setTimeout(function () {
    winRevealTimerId = null;
    winningLineCells = null;
    openResult();
  }, WIN_REVEAL_DELAY_MS);
  draw();
}

/**
 * WebSocket STATE 里部分字段在个别环境下会变成字符串，与 BLACK/WHITE 数字比较会失败，
 * 导致一直显示「对方思考中」、无法落子。
 */
function normalizeOnlineStoneInt(v, fallback) {
  if (v === undefined || v === null) {
    return fallback;
  }
  var n = Number(v);
  return isNaN(n) ? fallback : n;
}

function applyOnlineState(data) {
  if (!data || data.type !== 'STATE') {
    return;
  }
  var prevBlack = onlineBlackConnected;
  var prevWhite = onlineWhiteConnected;
  var wasOver = gameOver;
  var prevBoard = copyBoardFromServer(board);
  board = copyBoardFromServer(data.board);
  if (countStonesOnBoard(board) === countStonesOnBoard(prevBoard) + 1) {
    playPlaceStoneSound();
  }
  syncOnlineMoveHistory(prevBoard, board);
  current = normalizeOnlineStoneInt(data.current, BLACK);
  gameOver = !!data.gameOver;
  if (!gameOver) {
    onlineSettleSent = false;
  }
  if (data.matchRound !== undefined && data.matchRound !== null) {
    var mr = Number(data.matchRound);
    if (!isNaN(mr) && mr >= 1) {
      onlineMatchRound = mr;
    }
  }
  if (data.winner === undefined || data.winner === null) {
    winner = null;
  } else {
    winner = normalizeOnlineStoneInt(data.winner, null);
  }
  pvpOnlineYourColor = normalizeOnlineStoneInt(data.yourColor, BLACK);
  onlineBlackConnected = !!data.blackConnected;
  onlineWhiteConnected = !!data.whiteConnected;
  if (data.whiteIsBot !== undefined && data.whiteIsBot !== null) {
    onlineOpponentIsBot = !!data.whiteIsBot;
  }
  if (isPvpOnline && (screen === 'game' || screen === 'matching')) {
    var yc = pvpOnlineYourColor;
    var oppWas = yc === BLACK ? prevWhite : prevBlack;
    var oppNow = yc === BLACK ? onlineWhiteConnected : onlineBlackConnected;
    if (oppNow) {
      onlineOpponentLeft = false;
    } else if (oppWas && !oppNow) {
      onlineOpponentLeft = true;
    }
  }
  onlineUndoPending = !!data.undoPending;
  if (data.undoRequesterColor === undefined || data.undoRequesterColor === null) {
    onlineUndoRequesterColor = null;
  } else {
    onlineUndoRequesterColor = normalizeOnlineStoneInt(
      data.undoRequesterColor,
      null
    );
  }
  lastMsg = '';
  syncLastOpponentMoveOnline(prevBoard, board, pvpOnlineYourColor);

  if (gameOver && !wasOver) {
    screen = 'game';
    if (winner != null) {
      var wm = findSingleNewStoneOfColor(prevBoard, board, winner);
      if (
        wm &&
        gomoku.checkWin(board, wm.r, wm.c, winner)
      ) {
        finishGameWithWin(wm.r, wm.c, winner);
      } else {
        openResult();
      }
      return;
    }
    openResult();
    return;
  }
  if (!gameOver && wasOver) {
    screen = 'game';
    if (showResultOverlay) {
      onlineResultOverlaySticky = true;
    } else {
      clearWinRevealTimer();
      winningLineCells = null;
    }
  }
  tryFetchOnlineOpponentProfile();
  draw();
}

function startOnlineSocket() {
  if (!onlineRoomId || !onlineToken) {
    return;
  }
  onlineSocketConnectGen++;
  var myGen = onlineSocketConnectGen;
  closeSocketOnly();
  isPvpOnline = true;
  var wsBase = roomApi.wsUrlFromApiBase();
  var st = authApi.getSessionToken();
  var url =
    wsBase +
    '/ws/gomoku?roomId=' +
    encodeURIComponent(onlineRoomId) +
    '&token=' +
    encodeURIComponent(onlineToken) +
    '&sessionToken=' +
    encodeURIComponent(st);
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Gomoku] WebSocket URL:', url);
  }
  socketTask = wx.connectSocket({
    url: url,
    fail: function () {
      if (myGen !== onlineSocketConnectGen) {
        return;
      }
      socketTask = null;
      onlineWsConnected = false;
      if (shouldAutoReconnectOnline()) {
        scheduleOnlineReconnect(false);
        draw();
        return;
      }
      wx.showToast({ title: '连接失败', icon: 'none' });
      disconnectOnline();
      screen = 'home';
      draw();
    }
  });
  if (!socketTask || !socketTask.onOpen) {
    return;
  }
  socketTask.onOpen(function () {
    if (myGen !== onlineSocketConnectGen) {
      return;
    }
    onlineWsConnected = true;
    onlineWsEverOpened = true;
    onlineReconnectAttempt = 0;
    clearOnlineReconnectTimer();
    draw();
  });
  socketTask.onMessage(function (res) {
    if (myGen !== onlineSocketConnectGen) {
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
    if (data.type === 'STATE') {
      applyOnlineState(data);
    }
  });
  socketTask.onClose(function () {
    if (myGen !== onlineSocketConnectGen) {
      return;
    }
    handleOnlineSocketDead();
  });
  socketTask.onError(function () {
    if (myGen !== onlineSocketConnectGen) {
      return;
    }
    handleOnlineSocketDead();
  });
}

function startOnlineAsHost() {
  homeDrawerOpen = false;
  authApi.ensureSession(function (sessionOk, errHint) {
    if (!sessionOk) {
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      return;
    }
    disconnectOnline();
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
      onlineRoomId = d.roomId;
      onlineToken = d.blackToken;
      pvpOnlineYourColor = BLACK;
      isPvpLocal = false;
      isRandomMatch = false;
      screen = 'game';
      lastOpponentMove = null;
      board = gomoku.createBoard();
      current = BLACK;
      gameOver = false;
      winner = null;
      lastMsg = '等待白方加入…';
      startOnlineSocket();
      draw();
      if (typeof wx.shareAppMessage === 'function') {
        wx.shareAppMessage({
          title: '五子棋 房号 ' + onlineRoomId,
          query: 'roomId=' + onlineRoomId + '&online=1'
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

function joinOnlineAsGuest(roomId) {
  if (!roomId) {
    return;
  }
  onlineInviteConsumed = true;
  authApi.ensureSession(function (sessionOk, errHint) {
    if (!sessionOk) {
      onlineInviteConsumed = false;
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      return;
    }
    disconnectOnline();
    wx.showLoading({ title: '加入房间…', mask: true });
    wx.request(
      Object.assign(roomApi.roomApiJoinOptions(roomId), {
    success: function (res) {
      wx.hideLoading();
        if (res.statusCode !== 200 || !res.data) {
        onlineInviteConsumed = false;
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
      onlineRoomId = roomId;
      onlineToken = d.whiteToken;
      pvpOnlineYourColor = WHITE;
      isPvpLocal = false;
      isRandomMatch = false;
      screen = 'game';
      lastOpponentMove = null;
      board = gomoku.createBoard();
      current = BLACK;
      gameOver = false;
      winner = null;
      lastMsg = '';
      startOnlineSocket();
      draw();
    },
    fail: function () {
      wx.hideLoading();
      onlineInviteConsumed = false;
      wx.showToast({ title: '网络请求失败', icon: 'none' });
    }
  })
    );
  });
}

function tryLaunchOnlineInvite(query) {
  if (onlineInviteConsumed || isPvpOnline) {
    return;
  }
  if (!query || String(query.online) !== '1' || !query.roomId) {
    return;
  }
  joinOnlineAsGuest(String(query.roomId));
}

/* ---------- 棋盘布局与菜单几何 ---------- */

function computeLayout() {
  var topBar = Math.max(44, sys.statusBarHeight + 8);
  var bottomReserve = 120;
  var availH = H - topBar - bottomReserve;
  var availW = W - 24;
  var maxBoard = Math.min(availW, availH);
  var span = SIZE - 1;
  /* 格距取整，交叉点落在逻辑整像素上，格线配合 render 内 +0.5 对齐，减少发糊 */
  var cell = Math.max(1, Math.floor(maxBoard / span));
  var originX = Math.round((W - span * cell) / 2);
  var originY = Math.round(topBar + (availH - span * cell) / 2);
  var boardPx = span * cell;
  return {
    margin: 12,
    cell: cell,
    boardPx: boardPx,
    originX: originX,
    originY: originY,
    size: SIZE,
    topBar: topBar,
    bottomY: H - bottomReserve + 20
  };
}

var layout = computeLayout();

function fillAmbientBackground() {
  var th = getUiTheme();
  var g;
  if (th.id === 'classic') {
    g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#FFF0E4');
    g.addColorStop(0.38, '#FFF6ED');
    g.addColorStop(1, '#FFFCF9');
  } else {
    g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.52, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  var topLight = ctx.createRadialGradient(
    W * 0.5,
    -H * 0.05,
    0,
    W * 0.5,
    H * 0.28,
    H * 0.95
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
  ctx.fillStyle = topLight;
  ctx.fillRect(0, 0, W, H);
  var vignette = ctx.createRadialGradient(
    W * 0.5,
    H * 0.52,
    H * 0.12,
    W * 0.5,
    H * 0.52,
    H * 0.92
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
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

/**
 * 首页底：纵向渐变（与 750 稿一致，避免对角线渐变把暖色「冲灰」）+ 顶光 + 轻收边。
 * 檀木：暖杏米渐变 + 轻暖色脚光；青瓷/水墨仍用主题 bg。
 */
function fillHomeBackground(th) {
  if (!th) {
    th = getCurrentTheme();
  }
  var g = ctx.createLinearGradient(0, 0, 0, H);
  if (th.id === 'classic') {
    g.addColorStop(0, '#FFF0E4');
    g.addColorStop(0.38, '#FFF6ED');
    g.addColorStop(1, '#FFFCF9');
  } else {
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.42, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  var topLight = ctx.createRadialGradient(
    W * 0.5,
    -H * 0.06,
    0,
    W * 0.5,
    H * 0.3,
    H * 0.92
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
  ctx.fillStyle = topLight;
  ctx.fillRect(0, 0, W, H);
  var vignette = ctx.createRadialGradient(
    W * 0.5,
    H * 0.55,
    H * 0.1,
    W * 0.5,
    H * 0.55,
    H * 0.95
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
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  if (th.id === 'mint') {
    var footM = ctx.createLinearGradient(0, H * 0.65, 0, H);
    footM.addColorStop(0, 'rgba(255, 255, 255, 0)');
    footM.addColorStop(1, 'rgba(160, 220, 228, 0.28)');
    ctx.fillStyle = footM;
    ctx.fillRect(0, 0, W, H);
  } else if (th.id === 'ink') {
    var footI = ctx.createLinearGradient(0, H * 0.64, 0, H);
    footI.addColorStop(0, 'rgba(255, 255, 255, 0)');
    footI.addColorStop(1, 'rgba(200, 150, 110, 0.08)');
    ctx.fillStyle = footI;
    ctx.fillRect(0, 0, W, H);
  } else if (th.id === 'classic') {
    var footC = ctx.createLinearGradient(0, H * 0.62, 0, H);
    footC.addColorStop(0, 'rgba(255, 255, 255, 0)');
    footC.addColorStop(1, 'rgba(255, 185, 140, 0.1)');
    ctx.fillStyle = footC;
    ctx.fillRect(0, 0, W, H);
  }
}

/** 首页左上角：围棋阴阳意象小标 */
function drawHomeAppLogo(cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = '#1A1A1A';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r / 2, r / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A1A';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r / 2, r / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#FAFAFA';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r / 2, r / 6, 0, Math.PI * 2);
  ctx.fillStyle = '#FAFAFA';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r / 2, r / 6, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A1A';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#3E3A34';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** 首页主标题区（无顶栏时兜底；顶栏以 getHomeNavBarLayout 为准） */
function getHomeTextLayout() {
  var sb = sys.statusBarHeight || 24;
  var safeTop =
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var titleY = insetTop + 11;
  return { titleY: titleY, insetTop: insetTop };
}

/**
 * 首页顶栏：高 120rpx；左内边距 30rpx + 头像；中间标题「团团五子棋」
 */
function getHomeNavBarLayout() {
  var sb = sys.statusBarHeight || 24;
  var safeTop =
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var navH = rpx(120);
  var navTop = insetTop;
  var navBottom = navTop + navH;
  var padX = rpx(30);
  var avatarR = rpx(48);
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
function drawHomeHeaderAvatar(ctx, img, cx, cy, r, th) {
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
function getHomeDrawerLayout() {
  var panelW = Math.min(W * 0.78, rpx(560));
  return { panelW: panelW };
}

/** 将整图等比缩放入边长 box 的正方形，居中于 (cx, cy)；成功返回 true */
function drawHomeUiImageContain(img, cx, cy, box) {
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
  ctx.drawImage(img, snapPx(x0), snapPx(y0), dw, dh);
  return true;
}

/** 雪碧图或静态吉祥物图是否已就绪（与 drawHomeMascotAsset 判定一致） */
function hasHomeMascotMediaLoaded(box) {
  if (!(box > 0)) {
    return false;
  }
  var sheet = homeMascotSheetImg;
  var n = MASCOT_SHEET_FRAME_COUNT;
  if (sheet && sheet.width > 0 && sheet.height > 0 && n >= 1) {
    var fw = sheet.width / n;
    if (fw > 0) {
      return true;
    }
  }
  return !!(homeMascotImg && homeMascotImg.width && homeMascotImg.height);
}

/**
 * 首页吉祥物：优先雪碧图逐帧；否则静态 GIF（多为首帧）或 PNG。
 * 均未加载成功则不绘制（无矢量兜底图）。
 */
function drawHomeMascotAsset(cx, cy, box) {
  var sheet = homeMascotSheetImg;
  var n = MASCOT_SHEET_FRAME_COUNT;
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
              (Date.now() / (1000 / Math.max(1, MASCOT_SHEET_FPS))) % n
            )
          : 0;
      var sx = frame * fw;
      var scale = Math.min(box / fw, box / ih);
      var dw = fw * scale;
      var dh = ih * scale;
      var x0 = cx - dw * 0.5;
      var y0 = cy - dh * 0.5;
      ctx.drawImage(
        sheet,
        sx,
        0,
        fw,
        ih,
        snapPx(x0),
        snapPx(y0),
        dw,
        dh
      );
      return true;
    }
  }
  return drawHomeUiImageContain(homeMascotImg, cx, cy, box);
}

function loadHomeUiAssets() {
  if (typeof wx === 'undefined' || !wx.createImage) {
    return;
  }
  if (homeUiAssetsAppliedRev === HOME_UI_ASSETS_REV) {
    return;
  }
  if (homeUiAssetsLoadInFlight) {
    return;
  }
  homeUiAssetsLoadInFlight = true;
  homeDockCheckinImg = null;
  homeDockRankImg = null;
  homeDockHistoryImg = null;
  homeDockSkinImg = null;
  tuanMoePieceBlackImg = null;
  tuanMoePieceWhiteImg = null;
  qingtaoLibaiPieceBlackImg = null;
  qingtaoLibaiPieceWhiteImg = null;
  homeMascotImg = null;
  homeMascotSheetImg = null;

  var loadPhase = 1;
  var remaining = 8;
  function oneDone() {
    remaining--;
    if (remaining > 0) {
      return;
    }
    if (loadPhase === 1) {
      startMascotAssetsAfterSubpackage();
      return;
    }
    homeUiAssetsAppliedRev = HOME_UI_ASSETS_REV;
    homeUiAssetsLoadInFlight = false;
    draw();
  }
  /** 包内路径部分机型需带前导 /，失败则换一条 */
  function homeUiPathCandidates(rel) {
    return [rel, rel.indexOf('/') === 0 ? rel.slice(1) : '/' + rel];
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
        homeMascotImg = im;
      }
    );
    bind(prefix + 'home-mascot-sheet.png', function (im) {
      homeMascotSheetImg = im;
    });
  }

  function startMascotAssetsAfterSubpackage() {
    if (typeof wx.loadSubpackage === 'function') {
      wx.loadSubpackage({
        name: HOME_SUBPACKAGE_NAME,
        success: function () {
          loadMascotWithPrefix(MASCOT_SUBPKG_PREFIX);
        },
        fail: function () {
          loadMascotWithPrefix('images/ui/');
        }
      });
    } else {
      loadMascotWithPrefix(MASCOT_SUBPKG_PREFIX);
    }
  }

  bind('images/ui/home-dock-checkin.png', function (im) {
    homeDockCheckinImg = im;
  });
  bind('images/ui/home-dock-rank.png', function (im) {
    homeDockRankImg = im;
  });
  bind('images/ui/home-dock-history.png', function (im) {
    homeDockHistoryImg = im;
  });
  bind('images/ui/home-dock-skin.png', function (im) {
    homeDockSkinImg = im;
  });
  bind('images/pieces/tuan-black.png', function (im) {
    tuanMoePieceBlackImg = im;
  });
  bind('images/pieces/tuan-white.png', function (im) {
    tuanMoePieceWhiteImg = im;
  });
  bind('images/pieces/fruit1.png', function (im) {
    qingtaoLibaiPieceBlackImg = im;
  });
  bind('images/pieces/fruit2.png', function (im) {
    qingtaoLibaiPieceWhiteImg = im;
  });
}

function drawHomeNavBar(th) {
  var L = getHomeNavBarLayout();
  ctx.save();
  var img = getMyAvatarImageForUi();
  drawHomeHeaderAvatar(ctx, img, L.avatarCx, L.avatarCy, L.avatarR, th);
  var navTitleFs = Math.max(1, Math.round(rpx(34)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '700 ' +
    navTitleFs +
    'px -apple-system, "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = th.title;
  var titleCx = W * 0.5;
  if (
    sys.safeArea &&
    sys.safeArea.width != null &&
    sys.safeArea.left != null
  ) {
    titleCx = sys.safeArea.left + sys.safeArea.width * 0.5;
  }
  ctx.fillText('团团五子棋', snapPx(titleCx), snapPx(L.avatarCy));
  ctx.strokeStyle =
    th.id === 'ink' ? 'rgba(42, 38, 34, 0.12)' : 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, snapPx(L.navBottom));
  ctx.lineTo(snapPx(W), snapPx(L.navBottom));
  ctx.stroke();
  ctx.restore();
}

/** 多于一种界面风格时显示侧栏「界面风格」；当前仅檀木则不显示 */
function homeDrawerShowsThemeRow() {
  return themes.THEME_IDS.length > 1;
}

function getHomeDrawerMenuItems() {
  return homeDrawerShowsThemeRow()
    ? ['界面风格', '棋子皮肤', '游戏反馈', '关于团团五子棋']
    : ['棋子皮肤', '游戏反馈', '关于团团五子棋'];
}

function drawHomeDrawer(th) {
  if (!homeDrawerOpen) {
    return;
  }
  var D = getHomeDrawerLayout();
  var insetTop = Math.max(
    sys.statusBarHeight || 24,
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0
  );
  var pw = D.panelW;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, H);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(pw, 0, W - pw, H);
  ctx.strokeStyle = '#E5E5E5';
  ctx.lineWidth = Math.max(1, rpx(1));
  ctx.beginPath();
  ctx.moveTo(snapPx(pw), 0);
  ctx.lineTo(snapPx(pw), H);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font =
    'bold ' +
    rpx(34) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = th.title;
  ctx.fillText('菜单', snapPx(rpx(28)), snapPx(insetTop + rpx(52)));

  var rowY = insetTop + rpx(110);
  var rowH = rpx(96);
  var items = getHomeDrawerMenuItems();
  var i;
  ctx.font =
    rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#333333';
  for (i = 0; i < items.length; i++) {
    var ry = rowY + i * rowH;
    ctx.fillText(items[i], snapPx(rpx(28)), snapPx(ry));
  }
  ctx.strokeStyle = '#F0F0F0';
  ctx.lineWidth = Math.max(1, rpx(1));
  for (i = 0; i < items.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(rpx(20), rowY + rowH * (i + 0.55));
    ctx.lineTo(pw - rpx(16), rowY + rowH * (i + 0.55));
    ctx.stroke();
  }
  ctx.restore();
}

function hitHomeNavIcon(clientX, clientY) {
  if (screen !== 'home') {
    return null;
  }
  var L = getHomeNavBarLayout();
  if (clientY < L.navTop || clientY > L.navBottom) {
    return null;
  }
  if (hitCircleAvatar(clientX, clientY, L.avatarCx, L.avatarCy, L.avatarR)) {
    return 'avatar';
  }
  return null;
}

function hitHomeDrawerBackdrop(clientX, clientY) {
  if (!homeDrawerOpen) {
    return false;
  }
  var D = getHomeDrawerLayout();
  return clientX > D.panelW;
}

function hitHomeDrawerRow(clientX, clientY) {
  if (!homeDrawerOpen) {
    return null;
  }
  var D = getHomeDrawerLayout();
  if (clientX < 10 || clientX > D.panelW - 10) {
    return null;
  }
  var insetTop = Math.max(
    sys.statusBarHeight || 24,
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0
  );
  var rowY = insetTop + rpx(110);
  var rowH = rpx(96);
  var n = getHomeDrawerMenuItems().length;
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
function rpx(n) {
  return (n * W) / 750;
}

/** #RRGGBB → {r,g,b}，失败返回 null */
function homePillHexToRgb(hex) {
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

function homePillMixRgb(c, t, target) {
  return {
    r: Math.round(c.r + (target.r - c.r) * t),
    g: Math.round(c.g + (target.g - c.g) * t),
    b: Math.round(c.b + (target.b - c.b) * t)
  };
}

function homePillRgbCss(c) {
  return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
}

/**
 * 首页三主按钮：纵向微渐变 + 顶光高光；随机为描边浅底，好友/人机为实色（人机对比更强）
 * @param {boolean} [pressed] 按下态：略缩小下移 + 遮罩
 */
function drawHomeReferencePill(cx, cy, bw, bh, label, pillKind, th, pressed) {
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

  var rgb = homePillHexToRgb(baseHex);
  var fillStyle;
  if (rgb) {
    var c0 = homePillMixRgb(rgb, topLift, { r: 255, g: 255, b: 255 });
    var c1 = homePillMixRgb(rgb, botDepth, { r: 0, g: 0, b: 0 });
    var lg = ctx.createLinearGradient(x0, y0, x0, y0 + bh);
    lg.addColorStop(0, homePillRgbCss(c0));
    lg.addColorStop(1, homePillRgbCss(c1));
    fillStyle = lg;
  } else {
    fillStyle = baseHex;
  }

  ctx.save();
  if (pressed) {
    ctx.translate(cx, cy);
    ctx.scale(0.982, 0.982);
    ctx.translate(-cx, -cy);
    ctx.translate(0, rpx(2));
  }
  var blurBase = pillKind === 'random' ? rpx(10) : rpx(14);
  var offY = rpx(pillKind === 'pve' ? 5 : 4);
  if (pressed) {
    blurBase = Math.max(rpx(4), blurBase * 0.55);
    offY *= 0.45;
  }
  ctx.shadowColor = shadowCol;
  ctx.shadowBlur = blurBase;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = offY;
  ctx.fillStyle = fillStyle;
  roundRect(x0, y0, bw, bh, rr);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  roundRect(x0, y0, bw, bh, rr);
  ctx.clip();
  var gh = bh * (pillKind === 'random' ? 0.52 : 0.48);
  var gl = ctx.createLinearGradient(x0, y0, x0, y0 + gh);
  if (pillKind === 'random') {
    gl.addColorStop(0, 'rgba(255,255,255,0.5)');
    gl.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    gl.addColorStop(0, 'rgba(255,255,255,0.26)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = gl;
  ctx.fillRect(x0, y0, bw, gh);
  ctx.restore();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, rpx(1.5));
    roundRect(x0, y0, bw, bh, rr);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = Math.max(1, rpx(1));
    roundRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1, rr - 0.5);
    ctx.stroke();
  }

  ctx.font =
    '600 ' +
    rpx(36) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, snapPx(cx), snapPx(cy));
  if (pressed) {
    ctx.save();
    roundRect(x0, y0, bw, bh, rr);
    ctx.clip();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.11)';
    ctx.fillRect(x0, y0, bw, bh);
    ctx.restore();
  }
  ctx.restore();
}

/** 顶栏扬声器（线框），size 为 48rpx 量级边长 */
function drawHomeSpeakerGlyph(cx, cy, color, size) {
  var s = size && size > 0 ? size / 16 : 1;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, 1.65 * s * 0.85);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 8 * s, cy - 5 * s);
  ctx.lineTo(cx + 1 * s, cy - 6.5 * s);
  ctx.lineTo(cx + 1 * s, cy + 6.5 * s);
  ctx.lineTo(cx - 8 * s, cy + 5 * s);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 5.5 * s, cy, 5.5 * s, -0.55, 0.55);
  ctx.stroke();
  ctx.restore();
}

/**
 * 顶栏设置：8 齿圆滑齿轮线稿 + 中心圆孔（#5C4B3A，适配约 32×32 点击区）
 * 用 r = r0 + amp*cos(8θ) 生成圆滑外齿廓
 */
function drawHomeSettingsGlyph(cx, cy, color, size) {
  var s = size && size > 0 ? size / 16 : 1;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.1, 1.6 * s * 0.85);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var r0 = 7.6 * s;
  var amp = 2.75 * s;
  var n = 56;
  var i;
  ctx.beginPath();
  for (i = 0; i <= n; i++) {
    var t = (i / n) * Math.PI * 2;
    var r = r0 + amp * Math.cos(8 * t);
    var x = cx + Math.cos(t) * r;
    var y = cy + Math.sin(t) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3.85 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 每日签到：圆角矩形底座 + 顶部地图钉 + 钉头内菱形（线稿） */
function drawHomeDockIconCheckin(cx, cy, s, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var w = s * 1.75;
  var bodyTop = cy + s * 0.15;
  var bodyH = s * 1.35;
  var rr = s * 0.22;
  var pinCy = cy - s * 0.55;
  var pinR = s * 0.32;
  roundRect(cx - w / 2, bodyTop, w, bodyH, rr);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, pinCy, pinR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 1.2, bodyTop);
  ctx.lineTo(cx - pinR * 0.85, pinCy + pinR * 0.35);
  ctx.lineTo(cx + pinR * 0.85, pinCy + pinR * 0.35);
  ctx.lineTo(cx + w / 2 - 1.2, bodyTop);
  ctx.stroke();
  var d = s * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx, pinCy - d);
  ctx.lineTo(cx + d, pinCy);
  ctx.lineTo(cx, pinCy + d);
  ctx.lineTo(cx - d, pinCy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHomeDockIconRank(cx, cy, s, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.35;
  var i;
  var n = 8;
  ctx.beginPath();
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 - Math.PI / 2;
    var rad = i % 2 === 0 ? s * 0.82 : s * 0.42;
    var px = cx + Math.cos(a) * rad;
    var py = cy + Math.sin(a) * rad;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHomeDockIconHistory(cx, cy, s, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.35;
  roundRect(cx - s * 0.88, cy - s, s * 1.76, s * 1.92, s * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.88, cy - s * 0.15);
  ctx.lineTo(cx, cy - s * 0.75);
  ctx.lineTo(cx + s * 0.88, cy - s * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy + s * 0.15);
  ctx.lineTo(cx + s * 0.38, cy + s * 0.15);
  ctx.stroke();
  ctx.restore();
}

function drawHomeDockIconSkin(cx, cy, s, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - s * 0.2, cy - s * 0.2, s * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHomeBottomDock(hl, th) {
  var y0 = hl.bottomNavTop;
  var h = hl.bottomNavH;
  var padH = hl.dockPadH != null ? hl.dockPadH : rpx(52);
  ctx.save();
  var dockFill;
  if (th.id === 'mint') {
    dockFill = 'rgba(225, 246, 248, 0.9)';
  } else if (th.id === 'ink') {
    dockFill = 'rgba(255, 248, 238, 0.82)';
  } else {
    dockFill = 'rgba(255, 236, 218, 0.93)';
  }
  ctx.fillStyle = dockFill;
  ctx.fillRect(0, y0, W, H - y0);
  var topLine = ctx.createLinearGradient(0, y0, W, y0);
  if (th.id === 'ink') {
    topLine.addColorStop(0, 'rgba(42, 38, 34, 0)');
    topLine.addColorStop(0.5, 'rgba(42, 38, 34, 0.14)');
    topLine.addColorStop(1, 'rgba(42, 38, 34, 0)');
  } else {
    topLine.addColorStop(0, 'rgba(90, 72, 58, 0)');
    topLine.addColorStop(0.5, 'rgba(90, 72, 58, 0.12)');
    topLine.addColorStop(1, 'rgba(90, 72, 58, 0)');
  }
  ctx.strokeStyle = topLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(snapPx(padH + rpx(4)), snapPx(y0 + 0.5));
  ctx.lineTo(snapPx(W - padH - rpx(4)), snapPx(y0 + 0.5));
  ctx.stroke();
  var labels = [
    isHomeCheckinDoneToday() ? '今日已签' : '每日签到',
    '对战排行',
    '历史战绩',
    '棋子换肤'
  ];
  var innerW = W - padH * 2;
  var colW = innerW / 4;
  var baseX = padH;
  var iconBox = rpx(78);
  var iconY = y0 + rpx(34) + iconBox / 2;
  var s = iconBox * 0.14;
  var colMidY = y0 + h * 0.42;
  var i;
  for (i = 0; i < 4; i++) {
    var cxi = baseX + colW * i + colW / 2;
    var pressed = homePressedDockCol === i;
    var stroke = pressed ? th.title : th.subtitle;
    ctx.save();
    if (pressed) {
      ctx.translate(cxi, colMidY);
      ctx.scale(0.96, 0.96);
      ctx.translate(-cxi, -colMidY);
      ctx.translate(0, rpx(2));
    }
    if (i === 0) {
      if (!drawHomeUiImageContain(homeDockCheckinImg, cxi, iconY, iconBox)) {
        drawHomeDockIconCheckin(cxi, iconY, s, stroke);
      }
    } else if (i === 1) {
      if (!drawHomeUiImageContain(homeDockRankImg, cxi, iconY, iconBox)) {
        drawHomeDockIconRank(cxi, iconY, s, stroke);
      }
    } else if (i === 2) {
      if (!drawHomeUiImageContain(homeDockHistoryImg, cxi, iconY, iconBox)) {
        drawHomeDockIconHistory(cxi, iconY, s, stroke);
      }
    } else {
      if (!drawHomeUiImageContain(homeDockSkinImg, cxi, iconY, iconBox)) {
        drawHomeDockIconSkin(cxi, iconY, s, stroke);
      }
    }
    ctx.font =
      rpx(24) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pressed ? th.title : th.subtitle;
    ctx.globalAlpha = 1;
    ctx.fillText(
      labels[i],
      snapPx(cxi),
      snapPx(iconY + iconBox / 2 + rpx(20))
    );
    ctx.restore();
    if (pressed) {
      ctx.save();
      var rx = baseX + colW * i + rpx(6);
      var ry = y0 + rpx(8);
      var rw = colW - rpx(12);
      var rh = h - rpx(32);
      var rcr = rpx(14);
      roundRect(rx, ry, rw, rh, rcr);
      ctx.clip();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawHomeCopyrightBar(hl, th) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    rpx(21) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.globalAlpha = th.id === 'classic' ? 1 : 0.72;
  ctx.fillText('© 团团五子棋', snapPx(W / 2), snapPx(hl.footerY));
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * 主内容区（750rpx 稿）：IP → 主按钮 → 底部功能区 + 版权。
 * 功能区与版权整体贴安全区底部；主按钮略收紧间距、底部 Dock 略加高以平衡标签行。
 */
function getHomeLayout() {
  var nav = getHomeNavBarLayout();
  var cx = W / 2;
  var btnW = rpx(668);
  var btnH = rpx(116);
  var btnGap = rpx(36);
  var ipGap = rpx(40);
  var ipBlockH = rpx(232);
  var ipTop = nav.navBottom + ipGap;
  var mascotCy = ipTop + ipBlockH * 0.5;
  var mascotScale = rpx(140) / 92;
  var btnTopGap = rpx(48);
  var yRandom = ipTop + ipBlockH + btnTopGap + btnH / 2;
  var yFriend = yRandom + btnH / 2 + btnGap + btnH / 2;
  var yPve = yFriend + btnH / 2 + btnGap + btnH / 2;
  var dockTopFromFlow = yPve + btnH / 2 + rpx(28) + rpx(36);
  var bottomNavH = rpx(216);
  var footerGap = rpx(14);
  var copyrightHalf = rpx(13);
  var safeYBottom =
    sys.safeArea && sys.safeArea.bottom != null ? sys.safeArea.bottom : H;
  var footerPadBottom = rpx(22);
  var footerYFromSafe = safeYBottom - footerPadBottom;
  var dockTopFromBottom =
    footerYFromSafe - bottomNavH - footerGap - copyrightHalf;
  var dockTop = Math.max(dockTopFromFlow, dockTopFromBottom);
  var footerY = dockTop + bottomNavH + footerGap + copyrightHalf;
  var mainBottom = dockTop - 2;
  var dockPadH = rpx(52);

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

function getRatingCardLayout() {
  var w = Math.min(W - 48, 300);
  var h = 212;
  var cx = W / 2;
  var cy = H * 0.42;
  return { cx: cx, cy: cy, w: w, h: h, r: 18 };
}

function hitRatingCardInside(x, y) {
  var L = getRatingCardLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  return x >= x0 && x <= x0 + L.w && y >= y0 && y <= y0 + L.h;
}

function hitRatingCardClose(x, y) {
  var L = getRatingCardLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  var cr = rpx(36);
  var padClose = rpx(32);
  var cx = x0 + L.w - padClose - cr / 2;
  var cy = y0 + padClose + cr / 2;
  return Math.abs(x - cx) <= cr * 0.72 && Math.abs(y - cy) <= cr * 0.72;
}

function getLocalCalendarYmd() {
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
function syncCheckinStateFromServerPayload(d) {
  if (!d || typeof d !== 'object') {
    return;
  }
  if (typeof d.tuanMoeUnlocked === 'boolean') {
    themes.setTuanMoeUnlockedFromServer(d.tuanMoeUnlocked);
  }
  if (Array.isArray(d.pieceSkinUnlockedIds)) {
    themes.setPieceSkinUnlockedIdsFromServer(d.pieceSkinUnlockedIds);
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
  checkinStateCache = {
    lastYmd: lastYmd,
    streak: streakClamped,
    tuanPoints: Math.max(0, pts),
    historySet: hist
  };
  if (typeof d.eloScore === 'number' && !isNaN(d.eloScore)) {
    savePeakEloIfHigher(d.eloScore);
  }
}

/**
 * POST /api/me/piece-skins/redeem 成功后合并积分与解锁列表。
 * @param {object} d
 */
function mergePieceSkinRedeemResponseToCache(d) {
  if (!d || typeof d !== 'object') {
    return;
  }
  if (typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)) {
    var ap = Math.max(0, Math.floor(d.activityPoints));
    if (checkinStateCache) {
      checkinStateCache.tuanPoints = ap;
    }
  }
  if (Array.isArray(d.pieceSkinUnlockedIds)) {
    themes.setPieceSkinUnlockedIdsFromServer(d.pieceSkinUnlockedIds);
  }
}

/**
 * 已登录时拉取 GET /api/me/rating，同步团团萌肤解锁与签到缓存（换肤弹窗等依赖）。
 * @param {function()} onDone 无论成功失败都会调用
 */
function syncMeRatingIfAuthed(onDone) {
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
            syncCheckinStateFromServerPayload(d);
            applyMyGenderFromRatingPayload(d);
            if (typeof d.eloScore === 'number' && !isNaN(d.eloScore)) {
              homeRatingEloCache = d.eloScore;
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

function getCheckinState() {
  if (!checkinStateCache) {
    checkinStateCache = {
      lastYmd: '',
      streak: 0,
      tuanPoints: 0,
      historySet: {}
    };
  }
  return checkinStateCache;
}

function isHomeCheckinDoneToday() {
  var s = getCheckinState();
  return s.lastYmd === getLocalCalendarYmd();
}

function formatCheckinYmdKey(y, mo, day) {
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
 * 签到弹窗配色：跟随当前界面主题（bg / homeCards / result / board）
 */
function checkinModalThemePalette(th) {
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

function getCheckinModalLayout() {
  var topPad = rpx(8);
  var headerBandH = rpx(80);
  var innerAfterHead = rpx(12);
  var calInnerPad = rpx(12);
  var monthNavH = rpx(42);
  var weekH = rpx(30);
  var cell = rpx(36);
  var rowGap = rpx(4);
  var gridH = 6 * cell + 5 * rowGap;
  var calCardH = calInnerPad * 2 + monthNavH + weekH + gridH;
  var gapCalPrimary = rpx(16);
  var primaryBtnH = rpx(52);
  var bottomPad = rpx(20);
  var w = Math.min(W - rpx(28), rpx(618));
  var innerH =
    topPad +
    headerBandH +
    innerAfterHead +
    calCardH +
    gapCalPrimary +
    primaryBtnH +
    bottomPad;
  var h = innerH;
  var cx = W / 2;
  var cy = H * 0.47;
  var rOuter = rpx(28);
  var x0 = cx - w / 2;
  var y0 = cy - h / 2;
  var calLeft = x0 + rpx(20);
  var calW = w - rpx(40);
  var calTop = y0 + topPad + headerBandH + innerAfterHead;
  var monthNavY = calTop + calInnerPad;
  var navMidY = monthNavY + monthNavH * 0.5;
  var leftAx = calLeft + calInnerPad + rpx(36);
  var rightAx = calLeft + calW - calInnerPad - rpx(36);
  var hitR = rpx(26);
  var primaryBtnW = w - rpx(48);
  var primaryY = calTop + calCardH + gapCalPrimary;
  var headCloseCx = x0 + w - rpx(34);
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

function checkinModalShiftMonth(vy, vm, delta) {
  vm += delta;
  while (vm < 1) {
    vm += 12;
    vy--;
  }
  while (vm > 12) {
    vm -= 12;
    vy++;
  }
  return { y: vy, m: vm };
}

/** 可浏览：最近 12 个月至当月（不含未来） */
function checkinModalMonthInRange(vy, vm) {
  if (vm < 1 || vm > 12) {
    return false;
  }
  var now = new Date();
  var ty = now.getFullYear();
  var tm = now.getMonth() + 1;
  var cur = ty * 12 + (tm - 1);
  var min = cur - 11;
  var t = vy * 12 + (vm - 1);
  return t >= min && t <= cur;
}

function checkinModalCanGoNextMonth(viewYear, viewMonth) {
  var n = checkinModalShiftMonth(viewYear, viewMonth, 1);
  return checkinModalMonthInRange(n.y, n.m);
}

function checkinModalCanGoPrevMonth(viewYear, viewMonth) {
  var p = checkinModalShiftMonth(viewYear, viewMonth, -1);
  return checkinModalMonthInRange(p.y, p.m);
}

function hitCheckinModalInside(x, y) {
  var L = getCheckinModalLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  return x >= x0 && x <= x0 + L.w && y >= y0 && y <= y0 + L.h;
}

function hitCheckinModalHeaderClose(x, y) {
  var L = getCheckinModalLayout();
  var rr = rpx(22);
  var cx = L.headCloseCx;
  var cy = L.headCloseCy;
  return (
    Math.abs(x - cx) <= rr && Math.abs(y - cy) <= rr
  );
}

function hitCheckinModalPrimaryBtn(x, y) {
  var L = getCheckinModalLayout();
  var bx = L.cx - L.primaryBtnW / 2;
  return (
    x >= bx &&
    x <= bx + L.primaryBtnW &&
    y >= L.primaryY &&
    y <= L.primaryY + L.primaryBtnH
  );
}

function hitCheckinModalPrevMonth(x, y) {
  var L = getCheckinModalLayout();
  var h = L.prevMonthHit;
  return (
    x >= h.x &&
    x <= h.x + h.w &&
    y >= h.y &&
    y <= h.y + h.h
  );
}

function hitCheckinModalNextMonth(x, y) {
  var L = getCheckinModalLayout();
  var h = L.nextMonthHit;
  return (
    x >= h.x &&
    x <= h.x + h.w &&
    y >= h.y &&
    y <= h.y + h.h
  );
}

/** 签到月历：左右切换箭头（圆底 + 折线） */
function drawCheckinMonthArrow(cx, cy, dir, ref, enabled) {
  var rr = rpx(18);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.fillStyle = enabled ? ref.arrowFillHi : ref.arrowFillLo;
  ctx.fill();
  if (enabled) {
    ctx.strokeStyle = ref.boardLine;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = enabled ? ref.navAccent : ref.dayMuted;
  ctx.lineWidth = rpx(2.25);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var s = rpx(7);
  ctx.beginPath();
  if (dir < 0) {
    ctx.moveTo(cx + s * 0.25, cy - s * 0.75);
    ctx.lineTo(cx - s * 0.45, cy);
    ctx.lineTo(cx + s * 0.25, cy + s * 0.75);
  } else {
    ctx.moveTo(cx - s * 0.25, cy - s * 0.75);
    ctx.lineTo(cx + s * 0.45, cy);
    ctx.lineTo(cx - s * 0.25, cy + s * 0.75);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCheckinCalendarMonth(th, L, d, ref) {
  var viewYear = d.viewYear;
  var viewMonth = d.viewMonth;
  var stCal = getCheckinState();
  var historySet = (stCal && stCal.historySet) || {};
  var now = new Date();
  var ty = now.getFullYear();
  var tm = now.getMonth() + 1;
  var td = now.getDate();

  var navTop = L.calTop + L.calInnerPad;
  var navMidY = navTop + L.monthNavH * 0.5;
  var canPrev = checkinModalCanGoPrevMonth(viewYear, viewMonth);
  var canNext = checkinModalCanGoNextMonth(viewYear, viewMonth);
  var leftAx = L.calLeft + L.calInnerPad + rpx(36);
  var rightAx = L.calLeft + L.calW - L.calInnerPad - rpx(36);
  drawCheckinMonthArrow(leftAx, navMidY, -1, ref, canPrev);
  drawCheckinMonthArrow(rightAx, navMidY, 1, ref, canNext);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '600 ' +
    rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = ref.dayNumStrong;
  ctx.fillText(
    viewYear + '年 ' + viewMonth + ' 月',
    snapPx(L.cx),
    snapPx(navMidY)
  );

  var weekTop = navTop + L.monthNavH;
  ctx.fillStyle = ref.weekBar;
  roundRect(
    L.calLeft + L.calInnerPad,
    weekTop,
    L.calW - L.calInnerPad * 2,
    L.weekH,
    rpx(8)
  );
  ctx.fill();

  var labels = ['日', '一', '二', '三', '四', '五', '六'];
  ctx.font =
    '600 ' +
    rpx(21) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = ref.weekLabel;
  ctx.textBaseline = 'middle';
  var gridTotalW = 7 * L.cell + 6 * L.rowGap;
  var gridLeft = L.cx - gridTotalW / 2;
  var c;
  for (c = 0; c < 7; c++) {
    var tcx = gridLeft + c * (L.cell + L.rowGap) + L.cell / 2;
    ctx.textAlign = 'center';
    ctx.fillText(
      labels[c],
      snapPx(tcx),
      snapPx(weekTop + L.weekH * 0.5)
    );
  }

  var first = new Date(viewYear, viewMonth - 1, 1);
  var firstSun0 = first.getDay();
  var dim = new Date(viewYear, viewMonth, 0).getDate();
  var gridTop = weekTop + L.weekH + rpx(8);
  var slotW = L.cell;
  var slotH = L.cell - rpx(1);
  var cellR = rpx(5);
  var dayNum = 1;
  var i;
  for (i = 0; i < 42; i++) {
    var row = Math.floor(i / 7);
    var col = i % 7;
    var cxCell = gridLeft + col * (L.cell + L.rowGap) + L.cell / 2;
    var cyCell = gridTop + row * (L.cell + L.rowGap) + L.cell / 2;
    var bx0 = cxCell - slotW * 0.48;
    var by0 = cyCell - slotH * 0.48;
    var bw = slotW * 0.96;
    var bh = slotH * 0.96;

    if (i < firstSun0 || dayNum > dim) {
      continue;
    }

    var isFuture =
      viewYear > ty ||
      (viewYear === ty && viewMonth > tm) ||
      (viewYear === ty && viewMonth === tm && dayNum > td);
    var key = formatCheckinYmdKey(viewYear, viewMonth, dayNum);
    var signed = !!historySet[key];
    var isToday =
      viewYear === ty && viewMonth === tm && dayNum === td;

    ctx.save();
    if (signed) {
      ctx.fillStyle = ref.signedCellBg;
      roundRect(bx0, by0, bw, bh, cellR);
      ctx.fill();
      ctx.fillStyle = ref.signedCellText;
      ctx.font =
        '600 ' +
        rpx(24) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(dayNum), snapPx(cxCell), snapPx(cyCell));
    } else {
      ctx.fillStyle = isFuture ? ref.dayMuted : ref.dayNumStrong;
      ctx.font =
        '600 ' +
        rpx(24) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = isFuture ? 0.45 : 1;
      ctx.fillText(String(dayNum), snapPx(cxCell), snapPx(cyCell));
      ctx.globalAlpha = 1;
    }
    if (isToday) {
      ctx.strokeStyle = ref.todayRing;
      ctx.lineWidth = rpx(2.5);
      roundRect(bx0 - rpx(1), by0 - rpx(1), bw + rpx(2), bh + rpx(2), cellR + rpx(1));
      ctx.stroke();
    }
    ctx.restore();

    dayNum++;
  }
}

function drawCheckinModalOverlay(th) {
  if (!checkinModalVisible || !checkinModalData || screen !== 'home') {
    return;
  }
  var d = checkinModalData;
  if (!d.viewYear || !d.viewMonth) {
    var fixD = new Date();
    d.viewYear = fixD.getFullYear();
    d.viewMonth = fixD.getMonth() + 1;
  }
  var L = getCheckinModalLayout();
  var ref = checkinModalThemePalette(th);
  var themeId = th.id || 'classic';
  var x = L.cx - L.w / 2;
  var y = L.cy - L.h / 2;
  var doneToday = isHomeCheckinDoneToday();

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = ref.modalShadow;
  ctx.shadowBlur = rpx(40);
  ctx.shadowOffsetY = rpx(14);
  var shellG = ctx.createLinearGradient(x, y, x, y + L.h);
  shellG.addColorStop(0, ref.shellTop);
  shellG.addColorStop(0.45, ref.shellMid);
  shellG.addColorStop(1, ref.shellBot);
  ctx.fillStyle = shellG;
  roundRect(x, y, L.w, L.h, L.r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle =
    themeId === 'ink'
      ? 'rgba(255, 248, 240, 0.4)'
      : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = rpx(2);
  roundRect(x, y, L.w, L.h, L.r);
  ctx.stroke();

  var titleCy = y + L.topPad + L.headerBandH * 0.5;
  var titleFs = Math.max(1, Math.round(rpx(32)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '700 ' +
    titleFs +
    'px -apple-system, "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = ref.titleFill;
  ctx.fillText('团团每日签到', snapPx(L.cx), snapPx(titleCy));

  var hx = L.headCloseCx;
  var hy = L.headCloseCy;
  ctx.lineWidth = rpx(2.5);
  ctx.strokeStyle = ref.closeXStroke;
  ctx.lineCap = 'round';
  var cs = rpx(9);
  ctx.beginPath();
  ctx.moveTo(hx - cs, hy - cs);
  ctx.lineTo(hx + cs, hy + cs);
  ctx.moveTo(hx + cs, hy - cs);
  ctx.lineTo(hx - cs, hy + cs);
  ctx.stroke();

  var cardG = ctx.createLinearGradient(
    L.calLeft,
    L.calTop,
    L.calLeft,
    L.calTop + L.calCardH
  );
  cardG.addColorStop(0, ref.innerCard);
  cardG.addColorStop(1, ref.innerCardShade);
  ctx.fillStyle = cardG;
  roundRect(L.calLeft, L.calTop, L.calW, L.calCardH, rpx(18));
  ctx.fill();
  ctx.strokeStyle = ref.cardStroke;
  ctx.lineWidth = 1.25;
  roundRect(L.calLeft, L.calTop, L.calW, L.calCardH, rpx(18));
  ctx.stroke();

  drawCheckinCalendarMonth(th, L, d, ref);

  var px0 = L.cx - L.primaryBtnW / 2;
  var py0 = L.primaryY;
  ctx.shadowColor = ref.modalShadow;
  ctx.shadowBlur = rpx(14);
  ctx.shadowOffsetY = rpx(6);
  var pGrad = ctx.createLinearGradient(px0, py0, px0, py0 + L.primaryBtnH);
  pGrad.addColorStop(0, ref.primary0);
  pGrad.addColorStop(0.5, ref.primary1);
  pGrad.addColorStop(1, ref.primary2);
  ctx.fillStyle = doneToday ? ref.primaryDisabled : pGrad;
  roundRect(px0, py0, L.primaryBtnW, L.primaryBtnH, L.primaryBtnH * 0.5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (!doneToday) {
    var shine = ctx.createLinearGradient(px0, py0, px0, py0 + L.primaryBtnH);
    shine.addColorStop(0, ref.primaryShine);
    shine.addColorStop(0.45, 'rgba(255,255,255,0)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    roundRect(px0, py0, L.primaryBtnW, L.primaryBtnH * 0.42, L.primaryBtnH * 0.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    roundRect(px0, py0, L.primaryBtnW, L.primaryBtnH, L.primaryBtnH * 0.5);
    ctx.stroke();
  }
  ctx.font =
    '600 ' +
    rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = doneToday ? ref.primaryDisabledText : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    doneToday ? '今日已签' : '今日签到',
    snapPx(L.cx),
    snapPx(py0 + L.primaryBtnH * 0.5)
  );

  ctx.restore();
}

function drawRatingCardOverlay(th) {
  if (!ratingCardVisible || !ratingCardData) {
    return;
  }
  var d = ratingCardData;
  var L = getRatingCardLayout();
  var x = L.cx - L.w / 2;
  var y = L.cy - L.h / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(x, y, L.w, L.h, L.r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  roundRect(x, y, L.w, L.h, L.r);
  ctx.stroke();

  var apVal =
    typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)
      ? Math.max(0, Math.floor(d.activityPoints))
      : 0;

  var crClose = rpx(36);
  var padClose = rpx(32);
  var closeCx = x + L.w - padClose - crClose / 2;
  var closeCy = y + padClose + crClose / 2;

  var titleBlock = 0;
  var titleCx = L.cx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (d.cardTitle) {
    ctx.font =
      'bold 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = th.title;
    ctx.fillText(d.cardTitle, snapPx(titleCx), snapPx(closeCy));
    titleBlock = closeCy - y + 12;
  }
  if (d.nicknameLine) {
    ctx.font = '12px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = th.muted;
    var nickCy = d.cardTitle ? closeCy + 18 : closeCy;
    ctx.fillText(d.nicknameLine, snapPx(titleCx), snapPx(nickCy));
    titleBlock = nickCy - y + 10;
  }

  var contentBottomPad = 18;
  var gapAboveContent = 14;
  var availH =
    y + L.h - contentBottomPad - gapAboveContent - y - titleBlock;
  var row1H = 28;
  var sectGap = 9;
  var threeColInnerH = 48;
  var contentBlockH = row1H + sectGap * 2 + threeColInnerH;
  var rowTop = y + titleBlock + (availH - contentBlockH) / 2;
  if (rowTop < y + 10 + titleBlock) {
    rowTop = y + 10 + titleBlock;
  }
  /** 横线分隔团团积分与三列统计；首行标签与分数左排 */
  var accent =
    th.homeCards && th.homeCards[0] ? String(th.homeCards[0]) : '#6b4a38';
  var padX = 16;
  var lineX0 = x + 14;
  var lineX1 = x + L.w - 14;

  function drawRatingCardHLine(yLine) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(snapPx(lineX0), snapPx(yLine));
    ctx.lineTo(snapPx(lineX1), snapPx(yLine));
    ctx.stroke();
  }

  var r1Mid = rowTop + row1H * 0.5;
  var labelX = x + padX;
  var gapLabelToPoints = 10;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = accent;
  var tuanLabelW = ctx.measureText('团团积分').width;
  ctx.fillText('团团积分', snapPx(labelX), snapPx(r1Mid));
  ctx.font = 'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title;
  ctx.fillText(
    String(apVal),
    snapPx(labelX + tuanLabelW + gapLabelToPoints),
    snapPx(r1Mid)
  );

  var line1Y = rowTop + row1H + sectGap;
  drawRatingCardHLine(line1Y);

  var threeTop = line1Y + sectGap;
  var c1 = x + L.w / 6;
  var c2 = x + L.w / 2;
  var c3 = x + (5 * L.w) / 6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '12px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.fillText('得分', snapPx(c1), snapPx(threeTop));
  ctx.fillText('胜率', snapPx(c2), snapPx(threeTop));
  ctx.fillText('称号', snapPx(c3), snapPx(threeTop));

  ctx.font = 'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title;
  ctx.fillText(String(d.elo), snapPx(c1), snapPx(threeTop + 20));
  ctx.fillText(d.winPctDisplay, snapPx(c2), snapPx(threeTop + 20));
  ctx.font = 'bold 15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillText(d.titleName, snapPx(c3), snapPx(threeTop + 20));

  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  var divTop = threeTop + 6;
  var divBot = threeTop + 42;
  for (var dx = 1; dx <= 2; dx++) {
    ctx.beginPath();
    ctx.moveTo(x + (dx * L.w) / 3 - 0.5, divTop);
    ctx.lineTo(x + (dx * L.w) / 3 - 0.5, divBot);
    ctx.stroke();
  }

  ctx.font = 'bold ' + rpx(34) + 'px ' + PIECE_SKIN_FONT_UI;
  ctx.fillStyle = 'rgba(92,75,58,0.38)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', snapPx(closeCx), snapPx(closeCy));

  ctx.restore();
}

/**
 * 将 /api/me/rating 或 /api/rooms/opponent-rating 的 JSON 填入战绩卡片
 * opts: { cardTitle（默认「信息看板」）, nicknameLine, usePayloadNickname }
 */
function fillRatingCardFromApiData(d, opts) {
  opts = opts || {};
  var cardTitle =
    (opts.cardTitle && String(opts.cardTitle).trim()) || '信息看板';
  var nicknameLine = opts.nicknameLine;
  if (nicknameLine === undefined) {
    if (opts.usePayloadNickname) {
      nicknameLine =
        typeof d.nickname === 'string' && d.nickname.trim()
          ? d.nickname.trim()
          : '';
    } else {
      nicknameLine = '';
    }
  }
  var elo = typeof d.eloScore === 'number' ? d.eloScore : 0;
  savePeakEloIfHigher(elo);
  var total = typeof d.totalGames === 'number' ? d.totalGames : 0;
  var win = typeof d.winCount === 'number' ? d.winCount : 0;
  var rt = ratingTitle.getRankAndTitleByElo(elo);
  var winPctDisplay;
  var noGames = total <= 0;
  if (noGames) {
    winPctDisplay = '—';
  } else {
    var pct = Math.round((win * 1000) / total) / 10;
    winPctDisplay = pct + '%';
  }
  var ap =
    typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)
      ? Math.max(0, Math.floor(d.activityPoints))
      : 0;
  ratingCardData = {
    cardTitle: cardTitle,
    nicknameLine: nicknameLine,
    elo: elo,
    titleName: rt.titleName,
    winPctDisplay: winPctDisplay,
    win: win,
    total: total,
    noGames: noGames,
    activityPoints: ap
  };
  homeRatingEloCache = elo;
}

/** 拉取天梯数据并在画布上展示战绩卡片（依赖已登录 sessionToken） */
function showMyRatingModal() {
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  if (ratingFetchInFlight) {
    return;
  }
  ratingFetchInFlight = true;
  if (typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载中…', mask: true });
  }
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
      success: function (res) {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        ratingFetchInFlight = false;
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '获取失败', icon: 'none' });
          }
          return;
        }
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (pe) {
            d = null;
          }
        }
        if (!d) {
          return;
        }
        syncCheckinStateFromServerPayload(d);
        applyMyGenderFromRatingPayload(d);
        if (typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
          loadMyNetworkAvatar(d.avatarUrl.trim());
        }
        fillRatingCardFromApiData(d, {});
        ratingCardVisible = true;
        draw();
      },
      fail: function () {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        ratingFetchInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    })
  );
}

/** 联机对局中：拉取当前房间对手的公开天梯 */
function showOpponentRatingModal() {
  if (!isPvpOnline || !onlineRoomId) {
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  if (ratingFetchInFlight) {
    return;
  }
  ratingFetchInFlight = true;
  if (typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载中…', mask: true });
  }
  wx.request(
    Object.assign(roomApi.roomOpponentRatingOptions(onlineRoomId), {
      success: function (res) {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        ratingFetchInFlight = false;
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode === 404 || res.statusCode === 403) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: res.statusCode === 403 ? '无法查看' : '暂无对手数据',
              icon: 'none'
            });
          }
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '获取失败', icon: 'none' });
          }
          return;
        }
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (pe2) {
            d = null;
          }
        }
        if (!d) {
          return;
        }
        applyOnlineOpponentProfilePayload(d);
        fillRatingCardFromApiData(d, {
          cardTitle: '对手战绩',
          usePayloadNickname: true
        });
        ratingCardVisible = true;
        draw();
      },
      fail: function () {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        ratingFetchInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    })
  );
}

/** 各页右上角「风格」：胶囊下按钮（首页改从侧栏「界面风格」切换） */
function getThemeEntryLayout() {
  var sb = sys.statusBarHeight || 24;
  var safeTop =
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var belowCapsule = 38;
  var topPad = insetTop + belowCapsule;
  var w = 60;
  var h = 32;
  var padR = 12;
  var cx = W - padR - w / 2;
  var cy = topPad + h / 2;
  return { cx: cx, cy: cy, w: w, h: h, r: 16 };
}

function drawThemeEntry(th) {
  var L = getThemeEntryLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  var glass = ctx.createLinearGradient(x0, y0, x0 + L.w, y0 + L.h);
  glass.addColorStop(0, 'rgba(255,255,255,0.92)');
  glass.addColorStop(1, 'rgba(255,255,255,0.72)');
  ctx.fillStyle = glass;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.2;
  roundRect(x0, y0, L.w, L.h, L.r);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font =
    'bold 14px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('风格', snapPx(L.cx), snapPx(L.cy));
}

/** 风格名称气泡：在「风格」按钮左侧，配色随当前主题；themeBubbleAlpha 控制渐隐 */
function drawThemeBubble(th) {
  if (!themeBubbleText || themeBubbleAlpha <= 0) {
    return;
  }
  if (screen === 'home') {
    return;
  }
  if (!themeScreenShowsStyleEntry()) {
    return;
  }
  var L = getThemeEntryLayout();
  var padX = 12;
  ctx.font =
    '14px "PingFang SC","Hiragino Sans GB",sans-serif';
  var tw = ctx.measureText(themeBubbleText).width;
  var bw = Math.ceil(tw + padX * 2);
  var bh = 34;
  var gap = 8;
  var tail = 8;
  var btnLeft = L.cx - L.w / 2;
  var bubbleRight = btnLeft - gap;
  var x = bubbleRight - bw - tail;
  if (x < 10) {
    x = 10;
    bw = Math.max(60, bubbleRight - tail - x);
  }
  var y = L.cy - bh / 2;

  ctx.save();
  ctx.globalAlpha = themeBubbleAlpha;
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = th.btnGhostFill;
  ctx.strokeStyle = th.btnPrimaryStroke;
  ctx.lineWidth = 1.5;
  roundRect(x, y, bw, bh, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + bw, y + bh * 0.32);
  ctx.lineTo(x + bw + tail, L.cy);
  ctx.lineTo(x + bw, y + bh * 0.68);
  ctx.closePath();
  ctx.fillStyle = th.btnGhostFill;
  ctx.fill();
  ctx.strokeStyle = th.btnPrimaryStroke;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = th.title;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(themeBubbleText, snapPx(x + bw / 2), snapPx(L.cy));
  ctx.restore();
}

function themeBubbleRaf(fn) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(fn);
  }
  if (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function') {
    return wx.requestAnimationFrame(fn);
  }
  return setTimeout(fn, 16);
}

function themeBubbleCaf(id) {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
  } else if (typeof wx !== 'undefined' && typeof wx.cancelAnimationFrame === 'function') {
    wx.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

function stopThemeBubbleAnim() {
  if (themeBubbleRafId != null) {
    themeBubbleCaf(themeBubbleRafId);
    themeBubbleRafId = null;
  }
}

/** 停留后线性淡出，结束时清空文案 */
function startThemeBubbleFadeAnim() {
  stopThemeBubbleAnim();
  themeBubbleAlpha = 1;
  var holdMs = 400;
  var fadeMs = 600;
  var t0 = Date.now();
  function frame() {
    if (!themeScreenShowsStyleEntry() || !themeBubbleText) {
      themeBubbleText = '';
      themeBubbleAlpha = 1;
      themeBubbleRafId = null;
      draw();
      return;
    }
    var e = Date.now() - t0;
    if (e < holdMs) {
      themeBubbleAlpha = 1;
    } else if (e < holdMs + fadeMs) {
      themeBubbleAlpha = 1 - (e - holdMs) / fadeMs;
    } else {
      themeBubbleText = '';
      themeBubbleAlpha = 1;
      themeBubbleRafId = null;
      draw();
      return;
    }
    draw();
    themeBubbleRafId = themeBubbleRaf(frame);
  }
  themeBubbleRafId = themeBubbleRaf(frame);
}

/**
 * 是否参与「风格」气泡/点击逻辑；右上角胶囊仅在非首页且此处为 true 时绘制。
 * 回放页不显示风格按钮（棋盘固定檀木，与界面主题切换无关）。
 */
function themeScreenShowsStyleEntry() {
  return screen === 'home';
}

function drawThemeChrome(th) {
  drawThemeBubble(th);
  if (screen !== 'home' && themeScreenShowsStyleEntry()) {
    drawThemeEntry(th);
  }
}

function hitThemeEntry(clientX, clientY) {
  var L = getThemeEntryLayout();
  return (
    Math.abs(clientX - L.cx) <= L.w / 2 + 10 &&
    Math.abs(clientY - L.cy) <= L.h / 2 + 10
  );
}

function getPveColorLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 54;
  var cx = W / 2;
  return {
    btnW: btnW,
    btnH: btnH,
    cx: cx,
    yBlack: H * 0.4,
    yWhite: H * 0.52,
    backY: H * 0.66
  };
}

function pixelToCell(clientX, clientY) {
  var cell = layout.cell;
  var ox = layout.originX;
  var oy = layout.originY;
  var c = Math.round((clientX - ox) / cell);
  var r = Math.round((clientY - oy) / cell);
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  return { r: r, c: c };
}

function resetGame() {
  showResultOverlay = false;
  onlineResultOverlaySticky = false;
  clearWinRevealTimer();
  winningLineCells = null;
  lastOpponentMove = null;
  if (isPvpOnline) {
    screen = 'game';
    if (gameOver && onlineSocketCanSend()) {
      socketTask.send({
        data: JSON.stringify({ type: 'RESET' })
      });
    }
    draw();
    return;
  }
  if (!isPvpLocal) {
    aiMoveGeneration++;
  }
  pveMoveHistory = [];
  localMoveHistory = [];
  localUndoRequest = null;
  screen = 'game';
  board = gomoku.createBoard();
  current = BLACK;
  gameOver = false;
  winner = null;
  if (isPvpLocal) {
    lastMsg = '';
    draw();
    return;
  }
  lastMsg = '';
  draw();
  if (!gameOver && current === pveAiColor()) {
    setTimeout(function () {
      runAiMove();
    }, 220);
  }
}

/* ---------- 对局流程：人机、随机匹配、本地/结算 ---------- */

function startPve(humanColor) {
  disconnectOnline();
  isPvpLocal = false;
  isRandomMatch = false;
  pveHumanColor = humanColor === undefined ? BLACK : humanColor;
  screen = 'game';
  resetGame();
}

function cancelMatchingTimers() {
  if (matchingTimer) {
    clearTimeout(matchingTimer);
    matchingTimer = null;
  }
  if (matchingAnimTimer) {
    clearInterval(matchingAnimTimer);
    matchingAnimTimer = null;
  }
  if (randomMatchPairedPollTimer) {
    clearInterval(randomMatchPairedPollTimer);
    randomMatchPairedPollTimer = null;
  }
}

/** 房主：轮询 paired，对手加入后拿 yourToken 再连 WS（与随机先后手一致） */
function pollRandomMatchPairedOnce() {
  if (!randomMatchHostWaiting || screen !== 'matching' || !onlineRoomId) {
    return;
  }
  wx.request(
    Object.assign(roomApi.roomApiRandomMatchPairedOptions(onlineRoomId), {
      success: function (res) {
        if (!randomMatchHostWaiting || screen !== 'matching') {
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          return;
        }
        var p = res.data;
        if (!p.guestJoined) {
          return;
        }
        if (!p.yourToken) {
          return;
        }
        cancelMatchingTimers();
        onlineToken = p.yourToken;
        pvpOnlineYourColor = p.yourColor === 'WHITE' ? WHITE : BLACK;
        randomMatchHostCancelToken = '';
        randomMatchHostWaiting = false;
        isPvpLocal = false;
        isRandomMatch = false;
        screen = 'game';
        lastOpponentMove = null;
        board = gomoku.createBoard();
        current = BLACK;
        gameOver = false;
        winner = null;
        lastMsg = '';
        startOnlineSocket();
        draw();
      },
      fail: function () {}
    })
  );
}

function finishRandomMatch() {
  cancelMatchingTimers();
  randomMatchHostWaiting = false;
  disconnectOnline();
  isPvpLocal = false;
  randomOpponentName =
    FAKE_OPPONENT_NAMES[
      Math.floor(Math.random() * FAKE_OPPONENT_NAMES.length)
    ];
  pveHumanColor = Math.random() < 0.5 ? BLACK : WHITE;
  isRandomMatch = true;
  screen = 'game';
  resetGame();
}

function onRandomMatchHostTimeout() {
  if (!randomMatchHostWaiting) {
    return;
  }
  wx.request(
    Object.assign(
      roomApi.roomApiRandomMatchFallbackOptions(
        onlineRoomId,
        randomMatchHostCancelToken
      ),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            /* 已有白方：paired 轮询应很快成功；兜底再拉一次 */
            pollRandomMatchPairedOnce();
            return;
          }
          if (res.statusCode === 200) {
            randomMatchHostWaiting = false;
            cancelMatchingTimers();
            isRandomMatch = true;
            onlineOpponentIsBot = true;
            onlineOppProfileFetched = false;
            onlineOppProfileRoomId = '';
            screen = 'game';
            onlineToken = randomMatchHostCancelToken;
            randomMatchHostCancelToken = '';
            pvpOnlineYourColor = BLACK;
            closeSocketOnly();
            startOnlineSocket();
            draw();
            return;
          }
          if (res.statusCode === 503) {
            wx.showToast({ title: '暂无人机，已切换本地人机', icon: 'none' });
          }
          randomMatchHostWaiting = false;
          cancelMatchingTimers();
          finishRandomMatch();
        },
        fail: function () {
          randomMatchHostWaiting = false;
          cancelMatchingTimers();
          finishRandomMatch();
        }
      }
    )
  );
}

function startRandomMatch() {
  homeDrawerOpen = false;
  cancelMatchingTimers();
  randomMatchHostWaiting = false;
  authApi.ensureSession(function (sessionOk, errHint) {
    if (!sessionOk) {
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      screen = 'home';
      draw();
      return;
    }
    disconnectOnline();
    matchingDots = 0;
    screen = 'matching';
    matchingAnimTimer = setInterval(function () {
      matchingDots = (matchingDots + 1) % 4;
      if (screen === 'matching') {
        draw();
      }
    }, 400);
    draw();
    wx.request(
      Object.assign(roomApi.roomApiRandomMatchOptions(), {
      success: function (res) {
        if (screen !== 'matching') {
          return;
        }
        if ((res.statusCode !== 200 && res.statusCode !== 201) || !res.data) {
          wx.showToast({
            title: '匹配服务不可用',
            icon: 'none'
          });
          cancelMatchingTimers();
          disconnectOnline();
          randomMatchHostWaiting = false;
          screen = 'home';
          draw();
          return;
        }
        var d = res.data;
        var role = d.role;
        if (role === 'guest') {
          cancelMatchingTimers();
          onlineRoomId = d.roomId;
          if (d.yourColor === 'BLACK') {
            onlineToken = d.blackToken;
            pvpOnlineYourColor = BLACK;
          } else if (d.yourColor === 'WHITE') {
            onlineToken = d.whiteToken;
            pvpOnlineYourColor = WHITE;
          } else {
            onlineToken = d.whiteToken;
            pvpOnlineYourColor = WHITE;
          }
          isPvpLocal = false;
          isRandomMatch = false;
          randomMatchHostWaiting = false;
          randomMatchHostCancelToken = '';
          screen = 'game';
          lastOpponentMove = null;
          board = gomoku.createBoard();
          current = BLACK;
          gameOver = false;
          winner = null;
          lastMsg = '';
          startOnlineSocket();
          draw();
          return;
        }
        if (role === 'host') {
          onlineRoomId = d.roomId;
          onlineToken = '';
          randomMatchHostCancelToken = d.blackToken || '';
          pvpOnlineYourColor = BLACK;
          isPvpLocal = false;
          isRandomMatch = false;
          randomMatchHostWaiting = true;
          lastOpponentMove = null;
          board = gomoku.createBoard();
          current = BLACK;
          gameOver = false;
          winner = null;
          lastMsg = '';
          pollRandomMatchPairedOnce();
          randomMatchPairedPollTimer = setInterval(
            pollRandomMatchPairedOnce,
            RANDOM_MATCH_PAIRED_POLL_MS
          );
          matchingTimer = setTimeout(function () {
            matchingTimer = null;
            onRandomMatchHostTimeout();
          }, RANDOM_MATCH_TIMEOUT_MS);
          draw();
          return;
        }
        wx.showToast({ title: '匹配数据异常', icon: 'none' });
        cancelMatchingTimers();
        disconnectOnline();
        randomMatchHostWaiting = false;
        screen = 'home';
        draw();
      },
      fail: function () {
        if (screen !== 'matching') {
          return;
        }
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        cancelMatchingTimers();
        disconnectOnline();
        randomMatchHostWaiting = false;
        screen = 'home';
        draw();
      }
    })
    );
  });
}

function cancelMatching() {
  cancelMatchingTimers();
  if (randomMatchHostWaiting && onlineRoomId && randomMatchHostCancelToken) {
    wx.request(
      roomApi.roomApiRandomMatchCancelOptions(
        onlineRoomId,
        randomMatchHostCancelToken
      )
    );
  }
  randomMatchHostWaiting = false;
  randomMatchHostCancelToken = '';
  disconnectOnline();
  homeDrawerOpen = false;
  homePressedButton = null;
  homePressedDockCol = null;
  screen = 'home';
  draw();
}

function backToHome() {
  stopReplayAuto();
  onlineMoveHistory = [];
  lastSettledGameId = null;
  showResultOverlay = false;
  onlineResultOverlaySticky = false;
  clearWinRevealTimer();
  winningLineCells = null;
  destroyAiWorker();
  lastOpponentMove = null;
  pveMoveHistory = [];
  localMoveHistory = [];
  localUndoRequest = null;
  onlineUndoPending = false;
  onlineUndoRequesterColor = null;
  cancelMatchingTimers();
  randomMatchHostWaiting = false;
  disconnectOnline();
  isRandomMatch = false;
  isPvpLocal = false;
  onlineInviteConsumed = false;
  homeDrawerOpen = false;
  homePressedButton = null;
  homePressedDockCol = null;
  screen = 'home';
  draw();
}

function startPvpLocal() {
  lastOpponentMove = null;
  showResultOverlay = false;
  onlineResultOverlaySticky = false;
  clearWinRevealTimer();
  winningLineCells = null;
  disconnectOnline();
  isRandomMatch = false;
  isPvpLocal = true;
  screen = 'game';
  board = gomoku.createBoard();
  current = BLACK;
  gameOver = false;
  winner = null;
  lastMsg = '';
  draw();
}

/**
 * 联机终局后上报结算，服务端写入 game 记录并更新 elo（须已登录）。
 * 双方都会调用，先成功者结算，另一方可能收到 409 已结算。
 */
function maybeRequestOnlineGameSettle() {
  if (!isPvpOnline || !onlineRoomId || onlineSettleSent) {
    return;
  }
  if (!authApi.getSessionToken()) {
    return;
  }
  var steps = countStonesOnBoard(board);
  if (steps < 0 || steps > 256) {
    return;
  }
  var outcome;
  if (winner === null) {
    outcome = 'DRAW';
  } else if (winner === BLACK) {
    outcome = 'BLACK_WIN';
  } else {
    outcome = 'WHITE_WIN';
  }
  var movesPayload = [];
  var mi;
  for (mi = 0; mi < onlineMoveHistory.length; mi++) {
    movesPayload.push(onlineMoveHistory[mi]);
  }
  var settleBody = {
    roomId: onlineRoomId,
    matchRound: onlineMatchRound,
    outcome: outcome,
    totalSteps: steps
  };
  if (movesPayload.length === steps) {
    settleBody.moves = movesPayload;
  }
  onlineSettleSent = true;
  wx.request(
    Object.assign(
      roomApi.gameSettleOptions(settleBody),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            return;
          }
          if (res.statusCode !== 200) {
            onlineSettleSent = false;
            return;
          }
          var d = res.data;
          if (d && d.gameId !== undefined && d.gameId !== null) {
            var gid = Number(d.gameId);
            if (!isNaN(gid)) {
              lastSettledGameId = gid;
            }
          }
        },
        fail: function () {
          onlineSettleSent = false;
        }
      }
    )
  );
}

function openResult() {
  if (!gameOver) {
    return;
  }
  clearWinRevealTimer();
  winningLineCells = null;
  if (isPvpOnline) {
    maybeRequestOnlineGameSettle();
    if (winner === null) {
      resultKind = 'pvp_draw';
    } else if (winner === pvpOnlineYourColor) {
      resultKind = 'online_win';
    } else {
      resultKind = 'online_lose';
    }
  } else if (isPvpLocal) {
    if (winner === null) {
      resultKind = 'pvp_draw';
    } else if (winner === BLACK) {
      resultKind = 'pvp_black_win';
    } else {
      resultKind = 'pvp_white_win';
    }
  } else if (winner === null) {
    resultKind = 'pve_draw';
  } else {
    resultKind = winner === pveHumanColor ? 'pve_win' : 'pve_lose';
  }
  onlineResultOverlaySticky = false;
  showResultOverlay = true;
  recordMatchHistoryFromGameEnd();
  screen = 'game';
  draw();
}

function canShowOnlineReplayButton() {
  return isPvpOnline && !!onlineRoomId;
}

/** 棋盘页结算弹层：卡片与按钮位置（与 drawResultOverlay / hitResultButton 一致） */
function getResultOverlayLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 54;
  var cardW = Math.min(W - 40, 360);
  var threeBtn = canShowOnlineReplayButton();
  var cardH = threeBtn
    ? Math.min(380, Math.max(300, H * 0.42))
    : Math.min(300, Math.max(260, H * 0.38));
  var cardX = (W - cardW) / 2;
  var cardY = Math.max((sys.statusBarHeight || 0) + 20, H * 0.16);
  var yTitle = cardY + 46;
  var ySub = cardY + 96;
  var yAgain = cardY + 148;
  var yReplay = cardY + 214;
  var yHome = cardY + 280;
  if (!threeBtn) {
    yAgain = cardY + 162;
    yHome = cardY + 228;
  }
  return {
    btnW: btnW,
    btnH: btnH,
    cx: W / 2,
    cardX: cardX,
    cardY: cardY,
    cardW: cardW,
    cardH: cardH,
    yTitle: yTitle,
    ySub: ySub,
    yAgain: yAgain,
    yReplay: yReplay,
    yHome: yHome,
    threeBtn: threeBtn
  };
}

function drawResultOverlay() {
  var th = getUiTheme();
  var rs = th.result;
  var bg = rs.defaultEnd;
  var titleColor = th.title;
  var title = '';
  var sub = '';
  switch (resultKind) {
    case 'pve_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '胜利';
      sub = '恭喜战胜对手';
      break;
    case 'pve_lose':
      bg = rs.lose.bg;
      titleColor = rs.lose.title;
      title = '失败';
      sub = '再接再厉';
      break;
    case 'pve_draw':
      bg = rs.draw.bg;
      titleColor = rs.draw.title;
      title = '平局';
      sub = '难分高下';
      break;
    case 'pvp_black_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '黑方胜利';
      sub = '好友对战';
      break;
    case 'pvp_white_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '白方胜利';
      sub = '好友对战';
      break;
    case 'pvp_draw':
      bg = rs.draw.bg;
      titleColor = rs.draw.title;
      title = '平局';
      sub = '好友对战';
      break;
    case 'online_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '胜利';
      sub = '联机对战';
      break;
    case 'online_lose':
      bg = rs.lose.bg;
      titleColor = rs.lose.title;
      title = '失败';
      sub = '联机对战';
      break;
    default:
      title = '对局结束';
      sub = '';
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.fillRect(0, 0, W, H);

  var ly = getResultOverlayLayout();
  var rg = ctx.createLinearGradient(
    0,
    ly.cardY,
    0,
    ly.cardY + ly.cardH
  );
  rg.addColorStop(0, bg);
  rg.addColorStop(1, rs.defaultEnd);
  var cr = Math.min(26, ly.cardH * 0.12);
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = rg;
  roundRect(ly.cardX, ly.cardY, ly.cardW, ly.cardH, cr);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  render.drawText(ctx, title, ly.cx, ly.yTitle, 36, titleColor);
  if (sub) {
    render.drawText(ctx, sub, ly.cx, ly.ySub, 16, rs.sub, 'normal');
  }

  drawMacaronCard(
    '再来一局',
    ly.cx,
    ly.yAgain,
    ly.btnW,
    ly.btnH,
    th.homeCards[0],
    false,
    'bear'
  );

  if (ly.threeBtn) {
    drawMacaronCard(
      '本局回放',
      ly.cx,
      ly.yReplay,
      ly.btnW,
      ly.btnH,
      th.homeCards[1],
      false,
      'cloud'
    );
  }

  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = rs.secondaryFill;
  ctx.strokeStyle = rs.secondaryStroke;
  ctx.lineWidth = 1.5;
  roundRect(
    ly.cx - ly.btnW / 2,
    ly.yHome - ly.btnH / 2,
    ly.btnW,
    ly.btnH,
    22
  );
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font =
    'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = rs.secondaryText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('返回首页', snapPx(ly.cx), snapPx(ly.yHome));
  drawThemeChrome(th);
}

function hitResultButton(clientX, clientY) {
  var rl = getResultOverlayLayout();
  var bw = rl.btnW / 2 + 12;
  var bh = rl.btnH / 2 + 12;
  if (
    Math.abs(clientX - rl.cx) <= bw &&
    Math.abs(clientY - rl.yAgain) <= bh
  ) {
    return 'again';
  }
  if (rl.threeBtn) {
    if (
      Math.abs(clientX - rl.cx) <= bw &&
      Math.abs(clientY - rl.yReplay) <= bh
    ) {
      return 'replay';
    }
  }
  if (
    Math.abs(clientX - rl.cx) <= bw &&
    Math.abs(clientY - rl.yHome) <= bh
  ) {
    return 'home';
  }
  return null;
}

function buildBoardFromMoves(moves, step) {
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

function enterReplayScreen(movesArr) {
  stopReplayAuto();
  replayMoves = movesArr || [];
  replayStep = 0;
  screen = 'replay';
  showResultOverlay = false;
  draw();
}

function exitReplayScreen() {
  stopReplayAuto();
  screen = 'game';
  showResultOverlay = true;
  draw();
}

function tryReplayByRoomFallback() {
  if (!onlineRoomId) {
    wx.showToast({ title: '加载失败', icon: 'none' });
    return;
  }
  wx.showLoading({ title: '加载棋谱…', mask: true });
  wx.request(
    Object.assign(
      roomApi.gameReplayByRoomOptions(onlineRoomId, onlineMatchRound),
      {
        success: function (res) {
          wx.hideLoading();
          if (res.statusCode === 200 && res.data && res.data.moves) {
            enterReplayScreen(res.data.moves);
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

function openReplayFromResult() {
  if (onlineMoveHistory.length > 0) {
    var copy = [];
    var i;
    for (i = 0; i < onlineMoveHistory.length; i++) {
      copy.push(onlineMoveHistory[i]);
    }
    enterReplayScreen(copy);
    return;
  }
  if (lastSettledGameId) {
    wx.showLoading({ title: '加载棋谱…', mask: true });
    wx.request(
      Object.assign(roomApi.gameReplayByIdOptions(lastSettledGameId), {
        success: function (res) {
          wx.hideLoading();
          if (res.statusCode === 200 && res.data) {
            enterReplayScreen(res.data.moves || []);
          } else {
            tryReplayByRoomFallback();
          }
        },
        fail: function () {
          wx.hideLoading();
          tryReplayByRoomFallback();
        }
      })
    );
    return;
  }
  tryReplayByRoomFallback();
}

function hitReplayControl(clientX, clientY) {
  var btnY = layout.bottomY;
  var halfW = 46;
  var halfH = 22;
  var list = [
    { id: 'close', x: W * 0.18 },
    { id: 'prev', x: W * 0.38 },
    { id: 'next', x: W * 0.62 },
    { id: 'auto', x: W * 0.82 }
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

function drawReplay() {
  fillAmbientBackground();
  layout = computeLayout();
  var th = getCurrentTheme();
  doodles.drawGameBoardCornerClouds(
    ctx,
    W,
    H,
    layout,
    sys.statusBarHeight || 0
  );
  render.drawBoard(ctx, layout, th);
  var rb = buildBoardFromMoves(replayMoves, replayStep);
  render.drawPieces(ctx, rb, layout, getThemeForPieces(th));
  drawBoardNameLabels(ctx, layout, th);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  render.drawText(
    ctx,
    '团团五子棋',
    W / 2,
    layout.topBar * 0.45,
    17,
    th.title
  );
  ctx.restore();
  var total = replayMoves.length;
  render.drawText(
    ctx,
    '棋谱回放 · ' + replayStep + ' / ' + total,
    W / 2,
    layout.bottomY - 50,
    15,
    th.status
  );
  var btnY = layout.bottomY;
  drawButton('关闭', W * 0.18, btnY, true);
  drawButton('上一步', W * 0.38, btnY, replayStep > 0);
  drawButton('下一步', W * 0.62, btnY, replayStep < total);
  var autoOn = replayAutoTimerId != null;
  drawButton(autoOn ? '暂停' : '自动', W * 0.82, btnY, total > 0);
  drawThemeChrome(th);
}

/* ---------- 绘制：各界面 ---------- */

function stopHomeMascotAnimLoop() {
  if (homeMascotAnimTimer != null) {
    clearInterval(homeMascotAnimTimer);
    homeMascotAnimTimer = null;
  }
}

/** 仅雪碧图多帧时需要定时刷新；静态 PNG / 矢量吉祥物不启定时器 */
function ensureHomeMascotAnimLoop() {
  if (
    screen !== 'home' ||
    ratingCardVisible ||
    checkinModalVisible ||
    pieceSkinModalVisible
  ) {
    stopHomeMascotAnimLoop();
    return;
  }
  var frames = MASCOT_SHEET_FRAME_COUNT || 0;
  if (frames <= 1) {
    stopHomeMascotAnimLoop();
    return;
  }
  var sheet = homeMascotSheetImg;
  if (!sheet || !sheet.width) {
    stopHomeMascotAnimLoop();
    return;
  }
  if (homeMascotAnimTimer != null) {
    return;
  }
  var interval = Math.max(
    28,
    Math.round(1000 / Math.max(1, MASCOT_SHEET_FPS))
  );
  homeMascotAnimTimer = setInterval(function () {
    if (
      screen !== 'home' ||
      ratingCardVisible ||
      checkinModalVisible ||
      pieceSkinModalVisible
    ) {
      stopHomeMascotAnimLoop();
      return;
    }
    draw();
  }, interval);
}

function drawHomeContentBelowPieceSkinModal() {
  var th = getCurrentTheme();
  fillHomeBackground(th);

  var hl = getHomeLayout();

  var mascotBox = rpx(200);
  var hasMascotMedia = hasHomeMascotMediaLoaded(mascotBox);
  if (hasMascotMedia) {
    ctx.save();
    ctx.globalAlpha = 1;
    var halo = ctx.createRadialGradient(
      hl.mascotCx,
      hl.mascotCy,
      0,
      hl.mascotCx,
      hl.mascotCy,
      rpx(150)
    );
    if (th.id === 'mint') {
      halo.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      halo.addColorStop(0.45, 'rgba(190, 240, 245, 0.28)');
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
    ctx.fillStyle = halo;
    ctx.fillRect(
      hl.mascotCx - rpx(200),
      hl.mascotCy - rpx(130),
      rpx(400),
      rpx(260)
    );
    ctx.restore();
  }

  drawHomeMascotAsset(hl.mascotCx, hl.mascotCy, mascotBox);

  drawHomeReferencePill(
    hl.cx,
    hl.yRandom,
    hl.btnW,
    hl.btnH,
    '随机匹配',
    'random',
    th,
    homePressedButton === 'random'
  );
  drawHomeReferencePill(
    hl.cx,
    hl.yFriend,
    hl.btnW,
    hl.btnH,
    '好友对战',
    'friend',
    th,
    homePressedButton === 'pvp'
  );
  drawHomeReferencePill(
    hl.cx,
    hl.yPve,
    hl.btnW,
    hl.btnH,
    '人机对战',
    'pve',
    th,
    homePressedButton === 'pve'
  );

  drawHomeBottomDock(hl, th);
  drawHomeCopyrightBar(hl, th);
  drawHomeDrawer(th);
  drawHomeNavBar(th);
  drawThemeChrome(th);
  drawRatingCardOverlay(th);
  drawCheckinModalOverlay(th);
}

function drawHome() {
  var th = getCurrentTheme();
  drawHomeContentBelowPieceSkinModal();
  drawPieceSkinModalOverlay(th);
}

function drawMatching() {
  fillAmbientBackground();

  var th = getUiTheme();
  doodles.drawMatchingDecoration(ctx, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  render.drawText(ctx, '随机匹配', W / 2, H * 0.22, 30, th.title);
  ctx.restore();

  var msg = '正在为你寻找对手';
  var dots = '';
  var d;
  for (d = 0; d < matchingDots; d++) {
    dots += '·';
  }
  var ySeek = H * 0.44;
  if (th.pageIndicator && dots) {
    ctx.save();
    ctx.font =
      '15px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.textBaseline = 'middle';
    var wmsg = ctx.measureText(msg).width;
    var wdots = ctx.measureText(dots).width;
    var total = wmsg + wdots;
    var startX = W / 2 - total / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = th.subtitle;
    ctx.fillText(msg, startX, ySeek);
    ctx.fillStyle = th.pageIndicator;
    ctx.fillText(dots, startX + wmsg, ySeek);
    ctx.restore();
  } else {
    render.drawText(ctx, msg + dots, W / 2, ySeek, 15, th.subtitle);
  }

  ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('取消', snapPx(W / 2), snapPx(H * 0.68));
}

function getHistoryPageLayout() {
  var insetTop = Math.max(
    sys.statusBarHeight || 24,
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0
  );
  var padX = rpx(28);
  var backCy = insetTop + rpx(44);
  var backCx = rpx(44);
  var titleCy = backCy;
  var statsTop = titleCy + rpx(42);
  var statsH = rpx(124);
  var statsW = W - padX * 2;
  var statsX = padX;
  var tabY = statsTop + statsH + rpx(20);
  var tabH = rpx(58);
  var tabW = W - padX * 2;
  var listTop = tabY + tabH + rpx(18);
  var safeBottom =
    sys.safeArea && sys.safeArea.bottom != null ? sys.safeArea.bottom : H;
  var listBottom = safeBottom - rpx(12);
  var listH = Math.max(rpx(160), listBottom - listTop);
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

function hitHistoryInteract(clientX, clientY) {
  var L = getHistoryPageLayout();
  if (
    Math.abs(clientX - L.backCx) <= rpx(40) &&
    Math.abs(clientY - L.backCy) <= rpx(40)
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

function hitHistoryListZone(clientX, clientY) {
  var L = getHistoryPageLayout();
  return (
    clientX >= L.padX &&
    clientX <= W - L.padX &&
    clientY >= L.listTop &&
    clientY <= L.listBottom
  );
}

function openHistoryScreen() {
  historyScrollY = 0;
  historyFilterTab = 0;
  loadMatchHistoryList();
  loadPeakEloFromStorage();
  historyStatsSnapshot = null;
  historyServerItems = [];
  screen = 'history';
  draw();
  authApi.ensureSession(function (sessOk) {
    if (!sessOk || !authApi.getSessionToken()) {
      draw();
      return;
    }
    var pending = 2;
    function doneFetch() {
      pending--;
      if (pending <= 0) {
        draw();
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
              syncCheckinStateFromServerPayload(d);
              applyMyGenderFromRatingPayload(d);
              var elo = typeof d.eloScore === 'number' ? d.eloScore : 0;
              savePeakEloIfHigher(elo);
              var total = typeof d.totalGames === 'number' ? d.totalGames : 0;
              var win = typeof d.winCount === 'number' ? d.winCount : 0;
              var winPct =
                total <= 0
                  ? '—'
                  : String(Math.round((win * 1000) / total) / 10) + '%';
              var peakE = historyPeakEloCached > 0 ? historyPeakEloCached : elo;
              var peakRt = ratingTitle.getRankAndTitleByElo(peakE);
              historyStatsSnapshot = {
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
    wx.request(
      Object.assign(roomApi.meGameHistoryOptions(50, 0), {
        complete: function () {
          doneFetch();
        },
        success: function (res) {
          historyServerItems = [];
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
              historyServerItems = body.items;
            }
          }
        },
        fail: function () {
          historyServerItems = [];
        }
      })
    );
  });
}

/**
 * 历史战绩：暖色羊皮纸、统计卡、筛选胶囊、对局列表（与首页「檀木」系协调）
 */
function drawHistory() {
  fillAmbientBackground();
  var th = getUiTheme();
  var L = getHistoryPageLayout();
  var parchment = '#FDF5E6';
  var cardFill0 = '#FFF9F0';
  var cardFill1 = '#FFF3E4';
  var accentBrown = th.homeFriend != null ? th.homeFriend : '#7B5E3F';
  var tabBg = 'rgba(255, 252, 246, 0.97)';
  var ink = th.title;
  var sub = th.subtitle;
  var muted = th.muted;
  var winGold = '#A67C3D';
  var loseRose = '#B06060';

  ctx.save();
  ctx.fillStyle = parchment;
  ctx.globalAlpha = 0.32;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = sub;
  ctx.lineWidth = Math.max(1.2, rpx(2));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var bx = L.backCx - rpx(8);
  var by = L.backCy;
  ctx.beginPath();
  ctx.moveTo(bx + rpx(10), by - rpx(12));
  ctx.lineTo(bx - rpx(2), by);
  ctx.lineTo(bx + rpx(10), by + rpx(12));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '700 ' +
    rpx(34) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = ink;
  var titleCx = W * 0.5;
  if (
    sys.safeArea &&
    sys.safeArea.width != null &&
    sys.safeArea.left != null
  ) {
    titleCx = sys.safeArea.left + sys.safeArea.width * 0.5;
  }
  ctx.fillText('五子棋历史战绩', snapPx(titleCx), snapPx(L.titleCy));
  ctx.restore();

  var sx = L.statsX;
  var sy = L.statsTop;
  var sw = L.statsW;
  var sh = L.statsH;
  var sr = rpx(20);
  ctx.save();
  ctx.shadowColor = 'rgba(60, 48, 38, 0.12)';
  ctx.shadowBlur = rpx(18);
  ctx.shadowOffsetY = rpx(6);
  var statG = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  statG.addColorStop(0, cardFill0);
  statG.addColorStop(1, cardFill1);
  ctx.fillStyle = statG;
  roundRect(sx, sy, sw, sh, sr);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(92, 75, 58, 0.14)';
  ctx.lineWidth = Math.max(1, rpx(1));
  roundRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, sr - 0.5);
  ctx.stroke();

  var totalStr = '—';
  var winStr = '—';
  var peakStr = '—';
  if (historyStatsSnapshot) {
    totalStr = String(historyStatsSnapshot.totalGames);
    winStr = historyStatsSnapshot.winPct;
    peakStr = historyStatsSnapshot.peakRankLabel;
  }
  var col1 = sx + sw / 6;
  var col2 = sx + sw / 2;
  var col3 = sx + (5 * sw) / 6;
  var labY = sy + sh * 0.34;
  var valY = sy + sh * 0.66;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    rpx(22) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('总场次', snapPx(col1), snapPx(labY));
  ctx.fillText('胜率', snapPx(col2), snapPx(labY));
  ctx.fillText('最高段位', snapPx(col3), snapPx(labY));
  ctx.font =
    '600 ' +
    rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = ink;
  ctx.fillText(totalStr, snapPx(col1), snapPx(valY));
  ctx.fillText(winStr, snapPx(col2), snapPx(valY));
  var peakFs = rpx(30);
  var peakMaxW = sw / 3 - rpx(20);
  var peakFace =
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  while (peakFs >= rpx(20)) {
    ctx.font = '600 ' + peakFs + peakFace;
    if (ctx.measureText(peakStr).width <= peakMaxW) {
      break;
    }
    peakFs -= 1;
  }
  ctx.fillText(peakStr, snapPx(col3), snapPx(valY));

  var divTop = sy + sh * 0.2;
  var divBot = sy + sh * 0.8;
  ctx.strokeStyle = 'rgba(92, 75, 58, 0.12)';
  ctx.lineWidth = 1;
  var dx;
  for (dx = 1; dx <= 2; dx++) {
    ctx.beginPath();
    ctx.moveTo(sx + (dx * sw) / 3 - 0.5, divTop);
    ctx.lineTo(sx + (dx * sw) / 3 - 0.5, divBot);
    ctx.stroke();
  }
  ctx.restore();

  var tx = L.tabX;
  var ty = L.tabY;
  var tw = L.tabW;
  var thh = L.tabH;
  var tr = thh / 2;
  var tabAreaW = tw;
  ctx.save();
  ctx.fillStyle = tabBg;
  roundRect(tx, ty, tw, thh, tr);
  ctx.fill();
  ctx.strokeStyle = 'rgba(92, 75, 58, 0.1)';
  ctx.lineWidth = 1;
  roundRect(tx + 0.5, ty + 0.5, tw - 1, thh - 1, tr - 0.5);
  ctx.stroke();
  ctx.save();
  roundRect(tx, ty, tw, thh, tr);
  ctx.clip();
  var tabSheen = ctx.createLinearGradient(tx, ty, tx, ty + thh * 0.55);
  tabSheen.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  tabSheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
  tabSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = tabSheen;
  ctx.fillRect(tx, ty, tw, thh);
  ctx.restore();

  var labels = ['全部', '胜利', '失败'];
  var slotW = tabAreaW / 3;
  var phPad = rpx(5);
  var pvPad = rpx(6);
  var ti;
  for (ti = 0; ti < 3; ti++) {
    var tcx = tx + (ti + 0.5) * slotW;
    var slotL = tx + ti * slotW;
    var active = historyFilterTab === ti;
    if (active) {
      var pillX = slotL + phPad;
      var pillY = ty + pvPad;
      var pillW = slotW - phPad * 2;
      var pillH = thh - pvPad * 2;
      var pr = pillH / 2;
      ctx.save();
      ctx.fillStyle = accentBrown;
      ctx.globalAlpha = 0.22;
      roundRect(pillX, pillY, pillW, pillH, pr);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = accentBrown;
      ctx.lineWidth = Math.max(1, rpx(1.5));
      roundRect(pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1, pr - 0.5);
      ctx.stroke();
      ctx.restore();
    }
    ctx.font =
      '600 ' +
      rpx(28) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = active ? accentBrown : sub;
    ctx.globalAlpha = active ? 1 : 0.78;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[ti], snapPx(tcx), snapPx(ty + thh * 0.5));
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  var rows = getFilteredMatchHistory();
  var rowH = historyListRowHeightRpx();
  var rowGap = historyListRowGapRpx();
  var innerPad = rpx(24);
  var cardR = rpx(18);
  var contentH =
    rows.length === 0
      ? rpx(120)
      : rows.length * (rowH + rowGap) - rowGap + rpx(16);
  var maxScroll = Math.max(0, contentH - L.listH);
  if (historyScrollY > maxScroll) {
    historyScrollY = maxScroll;
  }
  if (historyScrollY < 0) {
    historyScrollY = 0;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(L.padX, L.listTop, W - L.padX * 2, L.listH);
  ctx.clip();

  var yBase = L.listTop - historyScrollY + rpx(8);
  if (rows.length === 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      rpx(26) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(
      '暂无对局记录',
      snapPx(W * 0.5),
      snapPx(L.listTop + L.listH * 0.38)
    );
    ctx.font = rpx(22) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = 'rgba(92, 78, 68, 0.55)';
    ctx.fillText(
      '完成联机或人机对局后将显示在此',
      snapPx(W * 0.5),
      snapPx(L.listTop + L.listH * 0.55)
    );
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
      var rw = W - L.padX * 2;
      ctx.save();
      ctx.shadowColor = 'rgba(60, 48, 38, 0.1)';
      ctx.shadowBlur = rpx(14);
      ctx.shadowOffsetY = rpx(5);
      var cardFill = ctx.createLinearGradient(rx, ry, rx, ry + rowH);
      cardFill.addColorStop(0, 'rgba(255, 252, 248, 0.99)');
      cardFill.addColorStop(1, 'rgba(255, 248, 238, 0.98)');
      ctx.fillStyle = cardFill;
      roundRect(rx, ry, rw, rowH, cardR);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(92, 75, 58, 0.09)';
      ctx.lineWidth = 1;
      roundRect(rx + 0.5, ry + 0.5, rw - 1, rowH - 1, cardR - 0.5);
      ctx.stroke();
      ctx.save();
      roundRect(rx, ry, rw, rowH, cardR);
      ctx.clip();
      var rowSheen = ctx.createLinearGradient(rx, ry, rx, ry + rowH * 0.55);
      rowSheen.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      rowSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = rowSheen;
      ctx.fillRect(rx, ry, rw, rowH * 0.5);
      ctx.restore();

      var timeStr = formatHistoryDateTime(rec.t);
      var line1Y = ry + rowH * 0.5;
      var innerW = rw - innerPad * 2;
      /** 左约 28% / 中约 44% / 右约 28%，时间在中间列水平居中 */
      var midColCenterX = rx + innerPad + innerW * 0.5;
      var avR = rpx(24);
      var avCx = rx + innerPad + avR;
      var avCy = line1Y;
      defaultAvatars.drawCircleAvatar(
        ctx,
        resolveHistoryRowAvatarImage(rec),
        avCx,
        avCy,
        avR,
        th
      );

      var nickLeftX = rx + innerPad + avR * 2 + rpx(10);
      var nickMaxW = Math.max(
        rpx(56),
        midColCenterX - nickLeftX - rpx(10)
      );
      ctx.textBaseline = 'middle';
      ctx.font =
        '600 ' +
        rpx(29) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      var oppStr = truncateNameToWidth(
        ctx,
        String(rec.opp || '对手'),
        nickMaxW
      );
      ctx.fillText(oppStr, snapPx(nickLeftX), snapPx(line1Y));

      ctx.textAlign = 'center';
      ctx.fillStyle = muted;
      var twMax = innerW * 0.42;
      var timeDraw = timeStr;
      ctx.font =
        rpx(20) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      if (ctx.measureText(timeDraw).width > twMax) {
        ctx.font =
          rpx(18) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      }
      if (ctx.measureText(timeDraw).width > twMax) {
        timeDraw = truncateNameToWidth(ctx, timeStr, twMax);
      }
      ctx.fillText(timeDraw, snapPx(midColCenterX), snapPx(line1Y));

      var resBase =
        rec.res === 'win' ? '胜利' : rec.res === 'lose' ? '失败' : '和棋';
      var resStr =
        typeof rec.steps === 'number'
          ? resBase + '（' + String(rec.steps) + '手）'
          : resBase;
      var resCol =
        rec.res === 'win' ? winGold : rec.res === 'lose' ? loseRose : sub;
      ctx.textAlign = 'right';
      ctx.font =
        '600 ' +
        rpx(27) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      ctx.fillStyle = resCol;
      var resDraw = resStr;
      var resMaxW = innerW * 0.3;
      if (ctx.measureText(resDraw).width > resMaxW) {
        resDraw = truncateNameToWidth(ctx, resStr, resMaxW);
      }
      ctx.fillText(resDraw, snapPx(rx + rw - innerPad), snapPx(line1Y));
      ctx.restore();
    }
  }
  ctx.restore();

  drawThemeChrome(th);
}

function drawPveColorSelect() {
  fillAmbientBackground();

  var cl = getPveColorLayout();
  var th = getCurrentTheme();
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  render.drawText(ctx, '人机对战', W / 2, H * 0.18, 30, th.title);
  ctx.restore();
  render.drawText(ctx, '选择执子', W / 2, H * 0.26, 15, th.subtitle);

  drawMacaronCard(
    '黑棋（先手）',
    cl.cx,
    cl.yBlack,
    cl.btnW,
    cl.btnH,
    th.homeCards[0],
    false,
    'bear'
  );
  drawMacaronCard(
    '白棋（后手）',
    cl.cx,
    cl.yWhite,
    cl.btnW,
    cl.btnH,
    th.homeCards[1],
    false,
    'heart'
  );

  ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('返回', snapPx(cl.cx), snapPx(cl.backY));
  drawThemeChrome(th);
}

/**
 * 首页好友对战 / 人机对战：双卡并排（750rpx 稿）
 */
function drawHomePvpPvePairRow(friendX0, friendY0, pveX0, pveY0, cw, ch) {
  drawHomePvpPveCard(friendX0, friendY0, cw, ch, '👥', '好友对战', '邀请微信好友');
  drawHomePvpPveCard(pveX0, pveY0, cw, ch, '🤖', '人机对战', '简单/中等/困难');
}

function drawHomePvpPveCard(x0, y0, w, h, icon, title, subtitle) {
  var rr = rpx(24);
  var lw = Math.max(1, rpx(2));
  ctx.save();
  ctx.fillStyle = '#ffffff';
  roundRect(x0, y0, w, h, rr);
  ctx.fill();
  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth = lw;
  roundRect(x0, y0, w, h, rr);
  ctx.stroke();

  var cx = x0 + w / 2;
  var padTop = rpx(24);
  var y = y0 + padTop;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font =
    rpx(48) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#333333';
  ctx.fillText(icon, snapPx(cx), snapPx(y));
  y += rpx(48) + rpx(12);
  ctx.font =
    'bold ' +
    rpx(32) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#222222';
  ctx.fillText(title, snapPx(cx), snapPx(y));
  y += rpx(32) + rpx(8);
  ctx.font =
    rpx(26) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#999999';
  ctx.fillText(subtitle, snapPx(cx), snapPx(y));
  ctx.restore();
}

/**
 * 首页「随机匹配」主按钮：绿渐变 + 双行文案（750rpx 稿）
 */
function drawRandomMatchPrimaryCard(cx, cy, bw, bh) {
  var x0 = cx - bw / 2;
  var y0 = cy - bh / 2;
  var rr = rpx(32);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = rpx(24);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = rpx(12);
  var bg = ctx.createLinearGradient(x0, y0, x0, y0 + bh);
  bg.addColorStop(0, '#4CAF50');
  bg.addColorStop(1, '#2E7D32');
  ctx.fillStyle = bg;
  roundRect(x0, y0, bw, bh, rr);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var yText = y0 + rpx(60);
  ctx.font =
    'bold ' +
    rpx(48) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('🎲 随机匹配（推荐）', snapPx(cx), snapPx(yText));
  ctx.font =
    rpx(28) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText(
    '找到旗鼓相当的对手',
    snapPx(cx),
    snapPx(yText + rpx(48) + rpx(20))
  );
  ctx.restore();
}

/**
 * 主操作卡片：深色底 + 顶光渐变 + 投影；doodleKind 为右下角弱装饰
 */
function drawMacaronCard(
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  roundRect(x0 + 2, y0 + 5, bw, bh, r);
  ctx.fill();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = fillHex;
  roundRect(x0, y0, bw, bh, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  var sheen = ctx.createLinearGradient(x0, y0, x0 + bw, y0 + bh);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
  ctx.fillStyle = sheen;
  roundRect(x0, y0, bw, bh, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1.2;
  roundRect(x0, y0, bw, bh, r);
  ctx.stroke();
  if (isSelected) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    roundRect(x0 - 3, y0 - 3, bw + 6, bh + 6, r + 2);
    ctx.stroke();
  }
  ctx.font =
    'bold 18px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  if (doodleKind) {
    ctx.textAlign = 'left';
    ctx.fillText(label, snapPx(x0 + 18), snapPx(cy));
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(label, snapPx(cx), snapPx(cy));
  }
  if (doodleKind) {
    doodles.drawCardCornerDoodle(ctx, doodleKind, cx, cy, bw, bh);
  }
}

/** 「风格」按钮：按 THEME_IDS 顺序循环切换 */
function cycleThemeNext() {
  var ids = themes.THEME_IDS;
  var i = ids.indexOf(themeId);
  if (i < 0) {
    i = 0;
  }
  var next = ids[(i + 1) % ids.length];
  themeId = next;
  themes.saveThemeId(next);
  themeBubbleText = themes.getTheme(next).name;
  startThemeBubbleFadeAnim();
  draw();
}

function syncPieceSkinModalSelectionFromCurrent() {
  var cat = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var i;
  for (i = 0; i < cat.length; i++) {
    if (cat[i].id === pieceSkinId) {
      pieceSkinModalPendingIdx = i;
      pieceSkinModalPage = Math.floor(i / per);
      return;
    }
  }
  pieceSkinModalPendingIdx = 0;
  pieceSkinModalPage = 0;
}

function openPieceSkinModal() {
  if (pieceSkinModalVisible) {
    return;
  }
  stopPieceSkinModalAnim();
  syncPieceSkinModalSelectionFromCurrent();
  syncMeRatingIfAuthed(function () {
    pieceSkinModalVisible = true;
    pieceSkinModalAnim = 0;
    runPieceSkinModalOpenAnim();
    draw();
  });
}

function closePieceSkinModal() {
  if (!pieceSkinModalVisible) {
    return;
  }
  runPieceSkinModalCloseAnim();
}

function stopPieceSkinModalAnim() {
  if (pieceSkinModalAnimRafId != null) {
    themeBubbleCaf(pieceSkinModalAnimRafId);
    pieceSkinModalAnimRafId = null;
  }
}

function easeOutCubicModal(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** 与 easeOutCubic 成对：关闭为打开的时间逆（anim = start * easeOutCubic(1-u) = start * (1-u³)） */
function easeInCubicModal(t) {
  return t * t * t;
}

var PIECE_SKIN_MODAL_ANIM_MS = 300;

function runPieceSkinModalOpenAnim() {
  stopPieceSkinModalAnim();
  var t0 = Date.now();
  var dur = PIECE_SKIN_MODAL_ANIM_MS;
  function frame() {
    if (!pieceSkinModalVisible) {
      pieceSkinModalAnimRafId = null;
      return;
    }
    var u = Math.min(1, (Date.now() - t0) / dur);
    pieceSkinModalAnim = easeOutCubicModal(u);
    try {
      draw();
    } catch (err) {
      try {
        console.error('pieceSkinModalOpen draw', err);
      } catch (e2) {}
    }
    if (u < 1) {
      pieceSkinModalAnimRafId = themeBubbleRaf(frame);
    } else {
      pieceSkinModalAnim = 1;
      pieceSkinModalAnimRafId = null;
    }
  }
  pieceSkinModalAnimRafId = themeBubbleRaf(frame);
}

function runPieceSkinModalCloseAnim() {
  stopPieceSkinModalAnim();
  var t0 = Date.now();
  var dur = PIECE_SKIN_MODAL_ANIM_MS;
  var start = pieceSkinModalAnim;
  function frame() {
    if (!pieceSkinModalVisible) {
      pieceSkinModalAnimRafId = null;
      return;
    }
    var u = Math.min(1, (Date.now() - t0) / dur);
    /** 与打开对称：打开 anim=easeOut(u)；关闭 anim=start*(1-u³)=start*easeOut(1-u) */
    if (u >= 1) {
      pieceSkinModalAnim = 0;
      pieceSkinModalVisible = false;
      pieceSkinModalAnimRafId = null;
      try {
        draw();
      } catch (err) {
        try {
          console.error('pieceSkinModalClose draw', err);
        } catch (e2) {}
      }
      return;
    }
    pieceSkinModalAnim = start * (1 - easeInCubicModal(u));
    try {
      draw();
    } catch (err) {
      try {
        console.error('pieceSkinModalClose draw', err);
      } catch (e2) {}
    }
    pieceSkinModalAnimRafId = themeBubbleRaf(frame);
  }
  pieceSkinModalAnimRafId = themeBubbleRaf(frame);
}

function getPieceSkinModalLayout() {
  var pad = rpx(32);
  var w = Math.min(W - rpx(32), rpx(696));
  var cellW = rpx(PIECE_SKIN_CARD_W_RPX);
  var cellH = rpx(220);
  var cellGapX = rpx(24);
  var cellGapY = rpx(32);
  var gridBlockW = cellW * 2 + cellGapX;
  var gridH = cellH * 2 + cellGapY;
  /** 标题 + margin16 + 当前穿戴 + margin40 */
  var headerBlock = rpx(128);
  var h = pad + headerBlock + gridH + pad;
  var cx = W / 2;
  var cy = H * 0.5;
  var x0 = cx - w / 2;
  var y0 = cy - h / 2;
  var gridInnerW = w - pad * 2;
  var gridX0 = x0 + pad + (gridInnerW - gridBlockW) / 2;
  var gridY0 = y0 + pad + headerBlock;
  var titleCy = y0 + pad + rpx(24);
  var currentCy = titleCy + rpx(50);
  var cat = themes.getPieceSkinCatalog();
  var pageCount = Math.max(
    1,
    Math.ceil(cat.length / themes.PIECE_SKINS_PER_PAGE)
  );
  return {
    cx: cx,
    cy: cy,
    w: w,
    h: h,
    x0: x0,
    y0: y0,
    r: rpx(24),
    innerPad: pad,
    pad: pad,
    titleCy: titleCy,
    currentCy: currentCy,
    gridX0: gridX0,
    gridY0: gridY0,
    cellW: cellW,
    cellH: cellH,
    cellGapX: cellGapX,
    cellGapY: cellGapY,
    pageCount: pageCount,
    closeR: rpx(36)
  };
}

/** 弹窗内逻辑坐标（抵消缩放变换，便于命中测试） */
function pieceSkinModalTouchToLogical(tx, ty) {
  var L = getPieceSkinModalLayout();
  var sc = 0.86 + 0.14 * easeOutCubicModal(pieceSkinModalAnim);
  return {
    x: L.cx + (tx - L.cx) / sc,
    y: L.cy + (ty - L.cy) / sc
  };
}

function innerPadForPieceSkinClose(L) {
  return L.pad != null ? L.pad : L.innerPad != null ? L.innerPad : rpx(32);
}

function hitPieceSkinModalClose(tx, ty) {
  var L = getPieceSkinModalLayout();
  var p = pieceSkinModalTouchToLogical(tx, ty);
  var cr = L.closeR;
  var cx = L.x0 + L.w - innerPadForPieceSkinClose(L) - cr / 2;
  var cy = L.y0 + innerPadForPieceSkinClose(L) + cr / 2;
  return Math.abs(p.x - cx) <= cr * 0.72 && Math.abs(p.y - cy) <= cr * 0.72;
}

function hitPieceSkinModalPanel(tx, ty) {
  var L = getPieceSkinModalLayout();
  var p = pieceSkinModalTouchToLogical(tx, ty);
  return (
    p.x >= L.x0 &&
    p.x <= L.x0 + L.w &&
    p.y >= L.y0 &&
    p.y <= L.y0 + L.h
  );
}

function hitPieceSkinModalGridCatalogIndex(tx, ty) {
  var L = getPieceSkinModalLayout();
  var p = pieceSkinModalTouchToLogical(tx, ty);
  var cat = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var start = pieceSkinModalPage * per;
  var row;
  var col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 2; col++) {
      var slot = row * 2 + col;
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
        if (gIdx >= cat.length) {
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
function pieceSkinModalPointsRedeemButtonRect(gx, gy, cellW, cellH) {
  var cardPad = rpx(18);
  var innerBottom = gy + cellH - cardPad;
  var rowMidY = innerBottom - rpx(20);
  var btnH = rpx(26);
  var btnW = rpx(76);
  var btnLeft = gx + cellW - cardPad - btnW;
  var btnTop = rowMidY - btnH / 2;
  return { x0: btnLeft, y0: btnTop, w: btnW, h: btnH };
}

/** @returns {number} 命中则返回 catalog 下标，否则 -1 */
function hitPieceSkinModalRedeemButton(tx, ty) {
  var L = getPieceSkinModalLayout();
  var p = pieceSkinModalTouchToLogical(tx, ty);
  var cat = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var start = pieceSkinModalPage * per;
  var row;
  var col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 2; col++) {
      var slot = row * 2 + col;
      var gx = L.gridX0 + col * (L.cellW + L.cellGapX);
      var gy = L.gridY0 + row * (L.cellH + L.cellGapY);
      var gIdx = start + slot;
      if (gIdx >= cat.length) {
        continue;
      }
      var ent = cat[gIdx];
      if (
        !ent ||
        ent.rowStatus !== 'points' ||
        !ent.costPoints ||
        ent.costPoints <= 0
      ) {
        continue;
      }
      var r = pieceSkinModalPointsRedeemButtonRect(gx, gy, L.cellW, L.cellH);
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

function getCurrentPieceSkinWearTitle() {
  var meta = themes.PIECE_SKINS[pieceSkinId];
  if (meta && meta.name) {
    return meta.name;
  }
  return '随界面';
}

/** @returns {{ text: string, fill: string }} */
function pieceSkinModalCardStatusStyle(entry) {
  if (!entry) {
    return { text: '', fill: '#8a7a68' };
  }
  if (entry.rowStatus === 'owned') {
    return { text: '已拥有', fill: '#2a9d4f' };
  }
  if (entry.rowStatus === 'locked') {
    if (entry.unlockHint) {
      return { text: entry.unlockHint, fill: '#909090' };
    }
    return { text: '未解锁', fill: '#909090' };
  }
  if (entry.rowStatus === 'points' && entry.costPoints) {
    return { text: '', fill: '#c77b28' };
  }
  return { text: '敬请期待', fill: '#8a7a68' };
}

/**
 * 仅由积分卡「兑换」按钮触发；点选格子其它区域不会调用本函数。
 */
function redeemPieceSkinWithPoints() {
  var cat = themes.getPieceSkinCatalog();
  var entry = cat[pieceSkinModalPendingIdx];
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
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
    draw();
    return;
  }
  if (pieceSkinRedeemInFlight) {
    return;
  }
  pieceSkinRedeemInFlight = true;
  wx.request(
    Object.assign(roomApi.mePieceSkinRedeemOptions(entry.id), {
      success: function (res) {
        pieceSkinRedeemInFlight = false;
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
          draw();
          return;
        }
        if (res.statusCode === 200 && d) {
          mergePieceSkinRedeemResponseToCache(d);
          pieceSkinId = entry.id;
          themes.savePieceSkinId(entry.id);
          closePieceSkinModal();
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: d.alreadyOwned ? '已拥有该皮肤' : '兑换成功',
              icon: 'none'
            });
          }
          draw();
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
        draw();
      },
      fail: function () {
        pieceSkinRedeemInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
        draw();
      }
    })
  );
}

/** 佩戴已拥有皮肤，或对未解锁项提示；积分兑换请用 redeemPieceSkinWithPoints（仅按钮） */
function applyPieceSkinWear() {
  var cat = themes.getPieceSkinCatalog();
  var entry = cat[pieceSkinModalPendingIdx];
  if (!entry) {
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
    draw();
    return;
  }
  pieceSkinId = entry.id;
  themes.savePieceSkinId(entry.id);
  closePieceSkinModal();
}

function drawPieceSkinModalPlaceholderPieces(midX, cy, pr) {
  var d = pr * 2;
  var gap = rpx(20);
  var cxB = midX - (d + gap) / 2 + pr;
  var cxW = midX + (d + gap) / 2 - pr;
  ctx.fillStyle = '#2c2620';
  ctx.beginPath();
  ctx.arc(cxB, cy, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#faf9f7';
  ctx.beginPath();
  ctx.arc(cxW, cy, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 128, 112, 0.45)';
  ctx.lineWidth = rpx(1.5);
  ctx.beginPath();
  ctx.arc(cxW, cy, pr, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPieceSkinModalOneCard(rx, ry, rw, rh, entry, gidx, baseClassic) {
  var focused = gidx === pieceSkinModalPendingIdx;
  var rr = rpx(18);
  var cardPad = rpx(18);
  var midX = rx + rw / 2;
  var titleFont = rpx(28);
  var statusFont = rpx(22);
  var gapStoneTitle = rpx(10);
  var titleLineH = rpx(32);
  var isPointsRedeem =
    entry &&
    entry.rowStatus === 'points' &&
    entry.costPoints &&
    entry.costPoints > 0;
  var statusReserve = isPointsRedeem ? rpx(40) : rpx(38);
  var innerTop = ry + cardPad;
  var innerBottom = ry + rh - cardPad;
  var statusBandTop = innerBottom - statusReserve;
  var contentBottom = statusBandTop;
  var cyRegion = (innerTop + contentBottom) / 2;
  var clusterShift = (gapStoneTitle + titleLineH) / 2;

  ctx.save();
  if (focused) {
    ctx.shadowColor = 'rgba(224, 124, 46, 0.28)';
    ctx.shadowBlur = rpx(14);
    ctx.shadowOffsetY = rpx(5);
  }
  var bgGrad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
  bgGrad.addColorStop(0, '#fffefb');
  bgGrad.addColorStop(1, '#f5f1eb');
  ctx.fillStyle = bgGrad;
  roundRect(rx, ry, rw, rh, rr);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = focused ? '#e07c2e' : 'rgba(200, 188, 172, 0.85)';
  ctx.lineWidth = focused ? rpx(2.25) : rpx(1.25);
  roundRect(rx, ry, rw, rh, rr);
  ctx.stroke();
  ctx.restore();

  var pr = rpx(21);
  if (entry.id === 'tuan_moe' || entry.id === 'qingtao_libai') {
    pr = rpx(26);
  }
  var gapBw = rpx(18);
  var cyPv = cyRegion - clusterShift;
  var nameY = cyPv + pr + gapStoneTitle + titleLineH / 2;
  var centerDist = 2 * pr + gapBw;
  var statusY = innerBottom - rpx(13);

  /** 未解锁也绘制真实棋子预览（贴图/渐变），便于「看见皮肤长什么样」；锁定态略降低不透明度 */
  var skinMeta = entry.id && themes.PIECE_SKINS[entry.id];
  if (skinMeta && !skinMeta.followTheme) {
    var pTh = enrichPieceSkinTheme(
      themes.applyPieceSkin(baseClassic, entry.id),
      entry.id
    );
    var pb = pTh.pieces.black;
    var pw = pTh.pieces.white;
    ctx.save();
    if (entry.locked) {
      ctx.globalAlpha = 0.78;
    }
    render.drawStonePiece(
      ctx,
      midX - centerDist / 2,
      cyPv,
      pr,
      true,
      pb,
      pw,
      pTh
    );
    render.drawStonePiece(
      ctx,
      midX + centerDist / 2,
      cyPv,
      pr,
      false,
      pb,
      pw,
      pTh
    );
    ctx.restore();
  } else {
    drawPieceSkinModalPlaceholderPieces(midX, cyPv, pr);
  }

  ctx.font = '500 ' + titleFont + 'px ' + PIECE_SKIN_FONT_UI;
  ctx.fillStyle = '#3d342c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    themes.getPieceSkinCatalogLabel(entry),
    snapPx(midX),
    snapPx(nameY)
  );

  ctx.strokeStyle = 'rgba(92, 75, 58, 0.1)';
  ctx.lineWidth = rpx(1);
  ctx.beginPath();
  ctx.moveTo(snapPx(rx + cardPad), snapPx(statusBandTop));
  ctx.lineTo(snapPx(rx + rw - cardPad), snapPx(statusBandTop));
  ctx.stroke();

  if (isPointsRedeem) {
    var rowMidY = innerBottom - rpx(20);
    var btnH = rpx(26);
    var btnW = rpx(76);
    var btnL = rx + rw - cardPad - btnW;
    var btnTop = rowMidY - btnH / 2;
    var gapBeforeBtn = rpx(8);
    var pointsSlotLeft = rx + cardPad;
    var pointsSlotRight = btnL - gapBeforeBtn;
    var pointsTextCx = (pointsSlotLeft + pointsSlotRight) / 2;
    ctx.font = rpx(18) + 'px ' + PIECE_SKIN_FONT_UI;
    ctx.fillStyle = '#b08040';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      entry.costPoints + '积分',
      snapPx(pointsTextCx),
      snapPx(rowMidY)
    );
    var gBtn = ctx.createLinearGradient(btnL, btnTop, btnL, btnTop + btnH);
    gBtn.addColorStop(0, '#f0a030');
    gBtn.addColorStop(1, '#d97820');
    ctx.fillStyle = gBtn;
    roundRect(btnL, btnTop, btnW, btnH, rpx(6));
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 120, 40, 0.35)';
    ctx.lineWidth = rpx(1);
    roundRect(btnL, btnTop, btnW, btnH, rpx(6));
    ctx.stroke();
    ctx.font = '600 ' + rpx(18) + 'px ' + PIECE_SKIN_FONT_UI;
    ctx.fillStyle = '#fffef9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      '兑换',
      snapPx(btnL + btnW / 2),
      snapPx(rowMidY)
    );
  } else {
    var st = pieceSkinModalCardStatusStyle(entry);
    var statusLine = st && st.text != null ? String(st.text) : '';
    ctx.font = statusFont + 'px ' + PIECE_SKIN_FONT_UI;
    ctx.fillStyle = st && st.fill ? st.fill : '#8a7a68';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (statusLine) {
      ctx.fillText(statusLine, snapPx(midX), snapPx(statusY));
    }
  }
}

function drawPieceSkinModalOverlay(th) {
  if (!pieceSkinModalVisible) {
    return;
  }
  var L = getPieceSkinModalLayout();
  var e = easeOutCubicModal(pieceSkinModalAnim);
  var sc = 0.86 + 0.14 * e;
  var cream = '#f9f5ec';
  var x = L.x0;
  var y = L.y0;
  var pad = L.pad != null ? L.pad : L.innerPad;
  var cat = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var baseClassic = themes.getTheme('classic');

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + 0.5 * e + ')';
  ctx.fillRect(0, 0, W, H);

  ctx.translate(L.cx, L.cy);
  ctx.scale(sc, sc);
  ctx.translate(-L.cx, -L.cy);

  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = rpx(28);
  ctx.shadowOffsetY = rpx(10);
  ctx.fillStyle = cream;
  roundRect(x, y, L.w, L.h, L.r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  var cr = L.closeR;
  var closeCx = x + L.w - pad - cr / 2;
  var closeCy = y + pad + cr / 2;
  ctx.font = 'bold ' + rpx(34) + 'px ' + PIECE_SKIN_FONT_UI;
  ctx.fillStyle = 'rgba(92,75,58,0.38)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', snapPx(closeCx), snapPx(closeCy));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 ' + rpx(34) + 'px ' + PIECE_SKIN_FONT_UI;
  ctx.fillStyle = '#4a3d32';
  ctx.fillText('棋子换肤', snapPx(L.cx), snapPx(L.titleCy));

  ctx.font = rpx(26) + 'px ' + PIECE_SKIN_FONT_UI;
  ctx.fillStyle = '#7d6a56';
  ctx.fillText(
    '当前穿戴：' + getCurrentPieceSkinWearTitle(),
    snapPx(L.cx),
    snapPx(L.currentCy)
  );

  var sepY = L.gridY0 - rpx(10);
  ctx.strokeStyle = 'rgba(92, 75, 58, 0.12)';
  ctx.lineWidth = rpx(1);
  ctx.beginPath();
  ctx.moveTo(snapPx(x + pad), snapPx(sepY));
  ctx.lineTo(snapPx(x + L.w - pad), snapPx(sepY));
  ctx.stroke();

  var start = pieceSkinModalPage * per;
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
      drawPieceSkinModalOneCard(
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

  ctx.restore();
}

function draw() {
  if (screen !== 'home') {
    stopHomeMascotAnimLoop();
    checkinModalVisible = false;
    checkinModalData = null;
  }
  if (screen === 'home') {
    drawHome();
    ensureHomeMascotAnimLoop();
    return;
  }
  if (screen === 'history') {
    drawHistory();
    return;
  }
  if (screen === 'pve_color') {
    drawPveColorSelect();
    return;
  }
  if (screen === 'matching') {
    drawMatching();
    return;
  }
  if (screen === 'replay') {
    drawReplay();
    return;
  }

  fillAmbientBackground();

  layout = computeLayout();
  var th = getUiTheme();
  /** 对局棋盘固定檀木（classic），与界面风格切换无关 */
  var boardTh = themes.getTheme('classic');
  var pieceTh = getThemeForPieces(boardTh);
  doodles.drawGameBoardCornerClouds(
    ctx,
    W,
    H,
    layout,
    sys.statusBarHeight || 0
  );
  render.drawBoard(ctx, layout, boardTh);
  render.drawPieces(ctx, board, layout, pieceTh);
  if (shouldShowOpponentLastMoveMarker()) {
    var lr = lastOpponentMove.r;
    var lc = lastOpponentMove.c;
    render.drawOpponentLastMoveMarker(
      ctx,
      layout,
      boardTh,
      lr,
      lc,
      board[lr][lc],
      pieceTh
    );
  }
  if (winningLineCells && winningLineCells.length >= 1) {
    render.drawWinningLine(ctx, layout, winningLineCells, pieceTh, board);
  }

  drawBoardNameLabels(ctx, layout, th);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  render.drawText(
    ctx,
    '团团五子棋',
    W / 2,
    layout.topBar * 0.45,
    17,
    th.title
  );
  ctx.restore();

  var status = lastMsg;
  if (isPvpOnline) {
    var sideName = pvpOnlineYourColor === BLACK ? '黑' : '白';
    if (!onlineWsConnected) {
      status = onlineWsEverOpened
        ? '连接中断，正在重连…'
        : '正在连接服务器…';
    } else if (onlineOpponentLeft) {
      status = '对方已离开房间';
    } else if (!onlineBlackConnected || !onlineWhiteConnected) {
      status =
        pvpOnlineYourColor === BLACK && onlineRoomId
          ? '等待白方加入 · 房号 ' + onlineRoomId
          : '等待连接…';
    } else if (gameOver) {
      status = '对局结束';
    } else if (
      onlineUndoPending &&
      onlineUndoRequesterColor != null
    ) {
      var urOn = onlineUndoRequesterColor === BLACK ? '黑' : '白';
      if (pvpOnlineYourColor === onlineUndoRequesterColor) {
        status = '已申请悔棋，等待对方回应';
      } else {
        status = '对方申请悔棋（' + urOn + '方），请选同意或拒绝';
      }
    } else if (current === pvpOnlineYourColor) {
      status = '轮到你（' + sideName + '）';
    } else {
      status = '对方思考中…';
    }
  } else if (isPvpLocal) {
    if (localUndoRequest) {
      var urL = localUndoRequest.requesterColor === BLACK ? '黑' : '白';
      status = urL + '方申请悔棋，请对方选同意或拒绝';
    } else {
      status =
        (current === BLACK ? '黑方' : '白方') +
        '下棋（面对面轮流）';
    }
  } else if (!status) {
    if (current === pveHumanColor) {
      status =
        '轮到你（' + (pveHumanColor === BLACK ? '黑' : '白') + '）';
    } else {
      if (isRandomMatch) {
        status =
          '「' +
          randomOpponentName +
          '」思考中（' +
          PVE_DIFF_LABEL +
          '）…';
      } else {
        status =
          (pveAiColor() === BLACK ? '黑' : '白') +
          '棋（' +
          PVE_DIFF_LABEL +
          '）思考…';
      }
    }
  }
  if (isPvpOnline || isPvpLocal) {
    render.drawText(
      ctx,
      status,
      W / 2,
      layout.bottomY - 50,
      15,
      th.status
    );
  }

  var btnY = layout.bottomY;
  var undoLabel = '悔棋';
  var undoActive = !gameOver;
  if (undoActive && isPvpOnline) {
    if (onlineUndoPending) {
      if (pvpOnlineYourColor === onlineUndoRequesterColor) {
        undoLabel = '撤销申请';
      } else {
        undoActive = false;
      }
    } else if (countStonesOnBoard(board) === 0) {
      undoActive = false;
    }
  } else if (undoActive && isPvpLocal) {
    if (localUndoRequest) {
      undoLabel = '撤销申请';
    } else if (localMoveHistory.length === 0) {
      undoActive = false;
    }
  } else if (undoActive && !isPvpLocal && !isPvpOnline) {
    if (pveMoveHistory.length === 0) {
      undoActive = false;
    }
  }

  drawButton('返回首页', W * 0.18, btnY, false);
  drawButton(undoLabel, W * 0.5, btnY, undoActive);
  drawButton('重新开始', W * 0.82, btnY, false);

  if (showUndoRespondRow()) {
    var urY = btnY - 40;
    drawButton('同意', W * 0.35, urY, true);
    drawButton('拒绝', W * 0.65, urY, true);
  }

  drawThemeChrome(th);

  if (
    showResultOverlay &&
    (gameOver || onlineResultOverlaySticky)
  ) {
    drawResultOverlay();
  }

  drawRatingCardOverlay(th);
}

function drawButton(label, cx, cy, active) {
  var th = getUiTheme();
  var bw = 82;
  var bh = 34;
  var r = 17;
  ctx.shadowColor = active ? th.btnShadow : 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = active ? 12 : 8;
  ctx.shadowOffsetY = active ? 3 : 2;
  ctx.fillStyle = active ? th.btnPrimary : 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = active
    ? 'rgba(255,255,255,0.45)'
    : th.btnGhostStroke;
  ctx.lineWidth = 1.5;
  roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font =
    '13px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = active ? '#ffffff' : th.btnGhostText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, snapPx(cx), snapPx(cy));
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hitHomeBottomNav(clientX, clientY) {
  var hl = getHomeLayout();
  if (
    clientY < hl.bottomNavTop ||
    clientY > hl.bottomNavTop + hl.bottomNavH
  ) {
    return null;
  }
  var pad = hl.dockPadH != null ? hl.dockPadH : rpx(52);
  if (clientX < pad || clientX > W - pad) {
    return null;
  }
  var innerW = W - pad * 2;
  var colW = innerW / 4;
  var col = Math.floor((clientX - pad) / colW);
  if (col < 0 || col > 3) {
    return null;
  }
  return col;
}

function hitHomeButton(clientX, clientY) {
  var hl = getHomeLayout();
  var nav = getHomeNavBarLayout();
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

function hitMatchingCancel(clientX, clientY) {
  return Math.abs(clientX - W / 2) <= 100 && Math.abs(clientY - H * 0.68) <= 28;
}

function hitPveColorButton(clientX, clientY) {
  var cl = getPveColorLayout();
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

function hitGameButton(clientX, clientY) {
  var btnY = layout.bottomY;
  var halfW = 36;
  var halfH = 22;
  var list = [
    { id: 'back', x: W * 0.18 },
    { id: 'undo', x: W * 0.5 },
    { id: 'reset', x: W * 0.82 }
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

function hitUndoRespondRow(clientX, clientY) {
  if (!showUndoRespondRow()) {
    return null;
  }
  var urY = layout.bottomY - 40;
  var halfW = 44;
  var halfH = 20;
  if (
    Math.abs(clientX - W * 0.35) <= halfW &&
    Math.abs(clientY - urY) <= halfH
  ) {
    return 'accept';
  }
  if (
    Math.abs(clientX - W * 0.65) <= halfW &&
    Math.abs(clientY - urY) <= halfH
  ) {
    return 'reject';
  }
  return null;
}

function handleUndoButtonTap() {
  if (gameOver) {
    return;
  }
  if (isPvpOnline) {
    if (onlineUndoPending) {
      if (pvpOnlineYourColor === onlineUndoRequesterColor) {
        sendOnlineUndo('UNDO_CANCEL');
      }
      return;
    }
    sendOnlineUndo('UNDO_REQUEST');
    return;
  }
  if (isPvpLocal) {
    if (localUndoRequest) {
      execLocalUndoCancel();
      return;
    }
    tryLocalUndoRequest();
    return;
  }
  execPveUndo();
}

function onBoard(clientX, clientY) {
  var cell = layout.cell;
  var ox = layout.originX;
  var oy = layout.originY;
  var max = (SIZE - 1) * cell;
  var pad = cell * 0.45;
  return (
    clientX >= ox - pad &&
    clientX <= ox + max + pad &&
    clientY >= oy - pad &&
    clientY <= oy + max + pad
  );
}

function firstEmptyCellForBoard() {
  var i;
  var j;
  for (i = 0; i < SIZE; i++) {
    for (j = 0; j < SIZE; j++) {
      if (board[i][j] === gomoku.EMPTY) {
        return { r: i, c: j };
      }
    }
  }
  return null;
}

function copyBoardForAiWorker(b) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < SIZE; i++) {
    out[i] = [];
    for (j = 0; j < SIZE; j++) {
      out[i][j] = b[i][j];
    }
  }
  return out;
}

function destroyAiWorker() {
  if (!aiWorkerInstance) {
    return;
  }
  try {
    aiWorkerInstance.terminate();
  } catch (e1) {}
  aiWorkerInstance = null;
}

function ensureAiWorker() {
  if (aiWorkerInstance) {
    return true;
  }
  if (typeof wx === 'undefined' || typeof wx.createWorker !== 'function') {
    return false;
  }
  try {
    aiWorkerInstance = wx.createWorker('workers/index.js');
    aiWorkerInstance.onMessage(function (res) {
      if (!res || res.type !== 'AI_MOVE_RESULT') {
        return;
      }
      if (res.gen !== aiMoveGeneration) {
        return;
      }
      if (res.seq !== aiWorkerSeq) {
        return;
      }
      if (gameOver || isPvpLocal || isPvpOnline) {
        return;
      }
      if (current !== pveAiColor()) {
        return;
      }
      if (screen !== 'game') {
        return;
      }
      var mv = res.move;
      if (res.err) {
        console.error('worker ai', res.err);
      }
      if (!mv) {
        mv = firstEmptyCellForBoard();
        if (!mv) {
          gameOver = true;
          winner = null;
          openResult();
          draw();
          return;
        }
      }
      applyAiMoveResult(mv);
    });
    if (typeof aiWorkerInstance.onProcessKilled === 'function') {
      aiWorkerInstance.onProcessKilled(function () {
        aiWorkerInstance = null;
      });
    }
    return true;
  } catch (e) {
    aiWorkerInstance = null;
    return false;
  }
}

function applyAiMoveResult(mv) {
  var ai = pveAiColor();
  board[mv.r][mv.c] = ai;
  pveMoveHistory.push({ r: mv.r, c: mv.c, color: ai });
  lastOpponentMove = { r: mv.r, c: mv.c };
  if (gomoku.checkWin(board, mv.r, mv.c, ai)) {
    finishGameWithWin(mv.r, mv.c, ai);
    return;
  }
  if (gomoku.isBoardFull(board)) {
    gameOver = true;
    winner = null;
    openResult();
    return;
  }
  current = pveHumanColor;
  draw();
}

function openingOptionsForAi() {
  return { rif: true };
}

function runAiMove() {
  if (gameOver || isPvpLocal || isPvpOnline) {
    return;
  }
  var ai = pveAiColor();
  if (current !== ai) {
    return;
  }
  if (ensureAiWorker()) {
    aiWorkerSeq++;
    aiWorkerInstance.postMessage({
      type: 'AI_MOVE',
      seq: aiWorkerSeq,
      gen: aiMoveGeneration,
      board: copyBoardForAiWorker(board),
      aiColor: ai,
      openingOptions: openingOptionsForAi()
    });
    return;
  }
  var mv;
  try {
    mv = gomoku.aiMove(board, ai, openingOptionsForAi());
  } catch (err) {
    console.error('aiMove', err);
    mv = null;
  }
  if (!mv) {
    mv = firstEmptyCellForBoard();
    if (!mv) {
      gameOver = true;
      winner = null;
      openResult();
      draw();
      return;
    }
  }
  applyAiMoveResult(mv);
}

function tryPlace(r, c) {
  if (gameOver) return;
  if (localUndoRequest) {
    return;
  }
  if (isPvpOnline && onlineUndoPending) {
    return;
  }
  if (isPvpOnline) {
    if (current !== pvpOnlineYourColor) {
      return;
    }
    if (board[r][c] !== gomoku.EMPTY) {
      return;
    }
    if (onlineSocketCanSend()) {
      lastOpponentMove = null;
      socketTask.send({
        data: JSON.stringify({ type: 'MOVE', r: r, c: c })
      });
    } else {
      wx.showToast({ title: '网络未连接', icon: 'none' });
    }
    return;
  }
  if (board[r][c] !== gomoku.EMPTY) return;

  var placedColor = current;
  board[r][c] = placedColor;
  playPlaceStoneSound();
  if (isPvpLocal) {
    localMoveHistory.push({ r: r, c: c, color: placedColor });
    lastOpponentMove = { r: r, c: c };
  } else if (!isPvpOnline) {
    pveMoveHistory.push({ r: r, c: c, color: placedColor });
    lastOpponentMove = null;
  }
  if (gomoku.checkWin(board, r, c, current)) {
    finishGameWithWin(r, c, current);
    return;
  }

  if (gomoku.isBoardFull(board)) {
    gameOver = true;
    winner = null;
    openResult();
    return;
  }

  current = current === BLACK ? WHITE : BLACK;
  lastMsg = '';
  draw();

  if (
    !isPvpLocal &&
    !gameOver &&
    current === pveAiColor()
  ) {
    setTimeout(function () {
      runAiMove();
    }, 200);
  }
}

/* ---------- 触摸与生命周期 ---------- */

var lastTouchDownX = 0;
var lastTouchDownY = 0;

wx.onTouchStart(function (e) {
  var t = e.touches[0];
  var x = t.clientX;
  var y = t.clientY;
  lastTouchDownX = x;
  lastTouchDownY = y;

  if (screen === 'history') {
    var hi = hitHistoryInteract(x, y);
    if (hi === 'back') {
      screen = 'home';
      historyScrollTouchId = null;
      draw();
      return;
    }
    if (typeof hi === 'string' && hi.indexOf('tab') === 0) {
      var tn = parseInt(hi.slice(3), 10);
      if (!isNaN(tn) && tn >= 0 && tn <= 2) {
        historyFilterTab = tn;
        historyScrollY = 0;
        draw();
      }
      return;
    }
    if (e.touches && e.touches[0] && hitHistoryListZone(x, y)) {
      historyScrollTouchId = e.touches[0].identifier;
      historyScrollLastY = y;
    }
    return;
  }

  if (
    (screen === 'home' || screen === 'game') &&
    ratingCardVisible
  ) {
    if (hitRatingCardClose(x, y)) {
      ratingCardVisible = false;
      ratingCardData = null;
      draw();
      return;
    }
    if (!hitRatingCardInside(x, y)) {
      ratingCardVisible = false;
      ratingCardData = null;
      draw();
      return;
    }
    return;
  }

  if (screen === 'home' && checkinModalVisible) {
    if (hitCheckinModalHeaderClose(x, y)) {
      checkinModalVisible = false;
      checkinModalData = null;
      draw();
      return;
    }
    if (hitCheckinModalPrimaryBtn(x, y)) {
      if (!isHomeCheckinDoneToday()) {
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
              syncCheckinStateFromServerPayload(d);
              if (checkinModalData) {
                checkinModalData.streak = getCheckinState().streak;
                checkinModalData.rewardPoints =
                  d.ok && !d.alreadySigned
                    ? d.rewardPoints
                    : CHECKIN_DAILY_POINTS;
                checkinModalData.totalPoints = getCheckinState().tuanPoints;
                checkinModalData.justSigned = !!(d.ok && !d.alreadySigned);
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
              draw();
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
      hitCheckinModalPrevMonth(x, y) &&
      checkinModalData &&
      checkinModalCanGoPrevMonth(
        checkinModalData.viewYear,
        checkinModalData.viewMonth
      )
    ) {
      var pM = checkinModalShiftMonth(
        checkinModalData.viewYear,
        checkinModalData.viewMonth,
        -1
      );
      checkinModalData.viewYear = pM.y;
      checkinModalData.viewMonth = pM.m;
      draw();
      return;
    }
    if (
      hitCheckinModalNextMonth(x, y) &&
      checkinModalData &&
      checkinModalCanGoNextMonth(
        checkinModalData.viewYear,
        checkinModalData.viewMonth
      )
    ) {
      var nM = checkinModalShiftMonth(
        checkinModalData.viewYear,
        checkinModalData.viewMonth,
        1
      );
      checkinModalData.viewYear = nM.y;
      checkinModalData.viewMonth = nM.m;
      draw();
      return;
    }
    if (
      hitCheckinModalPrevMonth(x, y) ||
      hitCheckinModalNextMonth(x, y)
    ) {
      return;
    }
    if (!hitCheckinModalInside(x, y)) {
      checkinModalVisible = false;
      checkinModalData = null;
      draw();
      return;
    }
    return;
  }

  if (screen === 'home' && pieceSkinModalVisible) {
    if (hitPieceSkinModalClose(x, y)) {
      closePieceSkinModal();
      return;
    }
    var redeemHit = hitPieceSkinModalRedeemButton(x, y);
    if (redeemHit >= 0) {
      pieceSkinModalPendingIdx = redeemHit;
      redeemPieceSkinWithPoints();
      return;
    }
    var cg = hitPieceSkinModalGridCatalogIndex(x, y);
    if (cg >= 0) {
      pieceSkinModalPendingIdx = cg;
      var catPick = themes.getPieceSkinCatalog();
      var entPick = catPick[cg];
      if (
        entPick &&
        entPick.rowStatus === 'points' &&
        entPick.costPoints &&
        entPick.costPoints > 0
      ) {
        draw();
        return;
      }
      applyPieceSkinWear();
      return;
    }
    if (!hitPieceSkinModalPanel(x, y)) {
      closePieceSkinModal();
      return;
    }
    return;
  }

  if (screen === 'home' && homeDrawerOpen) {
    if (hitHomeDrawerBackdrop(x, y)) {
      homeDrawerOpen = false;
      draw();
      return;
    }
    var dr = hitHomeDrawerRow(x, y);
    if (dr === null) {
      return;
    }
    if (homeDrawerShowsThemeRow()) {
      if (dr === 0) {
        cycleThemeNext();
        homeDrawerOpen = false;
        draw();
        return;
      }
      if (dr === 1) {
        homeDrawerOpen = false;
        openPieceSkinModal();
        draw();
        return;
      }
      if (dr === 2) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '敬请期待', icon: 'none' });
        }
        homeDrawerOpen = false;
        draw();
        return;
      }
      if (dr === 3) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '团团五子棋', icon: 'none' });
        }
        homeDrawerOpen = false;
        draw();
        return;
      }
    } else {
      if (dr === 0) {
        homeDrawerOpen = false;
        openPieceSkinModal();
        draw();
        return;
      }
      if (dr === 1) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '敬请期待', icon: 'none' });
        }
        homeDrawerOpen = false;
        draw();
        return;
      }
      if (dr === 2) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '团团五子棋', icon: 'none' });
        }
        homeDrawerOpen = false;
        draw();
        return;
      }
    }
    return;
  }

  if (screen === 'home') {
    var navHit = hitHomeNavIcon(x, y);
    if (navHit === 'avatar') {
      showMyRatingModal();
      return;
    }
    var dockHit = hitHomeBottomNav(x, y);
    if (dockHit !== null) {
      homePressedButton = null;
      homePressedDockCol = dockHit;
      draw();
      return;
    }
  }

  var boardAv = hitWhichGameBoardNameAvatar(x, y);
  if (boardAv === 'my') {
    showMyRatingModal();
    return;
  }
  if (boardAv === 'opp') {
    if (isPvpOnline && onlineRoomId) {
      showOpponentRatingModal();
    } else if (isPvpLocal) {
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
    screen !== 'home' &&
    themeScreenShowsStyleEntry() &&
    hitThemeEntry(x, y)
  ) {
    cycleThemeNext();
    return;
  }

  if (screen === 'home') {
    var homeBtn = hitHomeButton(x, y);
    if (homeBtn !== null) {
      homePressedDockCol = null;
      homePressedButton = homeBtn;
      draw();
      return;
    }
    if (homePressedButton || homePressedDockCol !== null) {
      homePressedButton = null;
      homePressedDockCol = null;
      draw();
    }
    return;
  }

  if (screen === 'matching') {
    if (hitMatchingCancel(x, y)) {
      cancelMatching();
    }
    return;
  }

  if (screen === 'pve_color') {
    var colorBtn = hitPveColorButton(x, y);
    if (colorBtn === 'black') {
      startPve(BLACK);
      return;
    }
    if (colorBtn === 'white') {
      startPve(WHITE);
      return;
    }
    if (colorBtn === 'back') {
      backToHome();
      return;
    }
    return;
  }

  if (screen === 'replay') {
    var rc = hitReplayControl(x, y);
    if (rc === 'close') {
      exitReplayScreen();
      return;
    }
    if (rc === 'prev' && replayStep > 0) {
      replayStep--;
      draw();
      return;
    }
    if (rc === 'next' && replayStep < replayMoves.length) {
      replayStep++;
      playPlaceStoneSound();
      draw();
      return;
    }
    if (rc === 'auto') {
      if (replayAutoTimerId != null) {
        stopReplayAuto();
      } else if (replayMoves.length > 0) {
        if (replayStep >= replayMoves.length) {
          replayStep = 0;
        }
        replayAutoTimerId = setInterval(function () {
          if (replayStep >= replayMoves.length) {
            stopReplayAuto();
            draw();
            return;
          }
          replayStep++;
          playPlaceStoneSound();
          draw();
        }, 600);
      }
      draw();
      return;
    }
    return;
  }

  if (
    screen === 'game' &&
    showResultOverlay &&
    (gameOver || onlineResultOverlaySticky)
  ) {
    var rb = hitResultButton(x, y);
    if (rb === 'again') {
      resetGame();
      return;
    }
    if (rb === 'replay') {
      openReplayFromResult();
      return;
    }
    if (rb === 'home') {
      backToHome();
      return;
    }
    return;
  }

  var urBtn = hitUndoRespondRow(x, y);
  if (urBtn === 'accept') {
    if (isPvpLocal) {
      execLocalUndoAccept();
    } else if (isPvpOnline) {
      sendOnlineUndo('UNDO_ACCEPT');
    }
    return;
  }
  if (urBtn === 'reject') {
    if (isPvpLocal) {
      execLocalUndoReject();
    } else if (isPvpOnline) {
      sendOnlineUndo('UNDO_REJECT');
    }
    return;
  }

  var gbtn = hitGameButton(x, y);
  if (gbtn === 'back') {
    backToHome();
    return;
  }
  if (gbtn === 'undo') {
    handleUndoButtonTap();
    return;
  }
  if (gbtn === 'reset') {
    if (isPvpOnline) {
      if (gameOver) {
        resetGame();
      } else {
        wx.showToast({ title: '对局中无法重开', icon: 'none' });
      }
      return;
    }
    resetGame();
    return;
  }

  if (!onBoard(x, y)) return;
  if (isPvpOnline) {
    if (current !== pvpOnlineYourColor) {
      return;
    }
  } else if (!isPvpLocal && current !== pveHumanColor) {
    return;
  }

  var cell = pixelToCell(x, y);
  if (!cell) return;
  tryPlace(cell.r, cell.c);
});

if (typeof wx.onTouchMove === 'function') {
  wx.onTouchMove(function (e) {
    if (screen !== 'history' || historyScrollTouchId == null) {
      return;
    }
    var touches = e.touches;
    if (!touches || !touches.length) {
      return;
    }
    var t = null;
    var i;
    for (i = 0; i < touches.length; i++) {
      if (touches[i].identifier === historyScrollTouchId) {
        t = touches[i];
        break;
      }
    }
    if (!t) {
      return;
    }
    var dy = t.clientY - historyScrollLastY;
    historyScrollLastY = t.clientY;
    historyScrollY -= dy;
    var Lh = getHistoryPageLayout();
    var rows = getFilteredMatchHistory();
    var rowH = historyListRowHeightRpx();
    var rowGap = historyListRowGapRpx();
    var contentH =
      rows.length === 0
        ? rpx(120)
        : rows.length * (rowH + rowGap) - rowGap + rpx(16);
    var maxScroll = Math.max(0, contentH - Lh.listH);
    if (historyScrollY > maxScroll) {
      historyScrollY = maxScroll;
    }
    if (historyScrollY < 0) {
      historyScrollY = 0;
    }
    draw();
  });
}

if (typeof wx.onTouchEnd === 'function') {
  wx.onTouchEnd(function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (
      screen === 'history' &&
      historyScrollTouchId !== null &&
      t &&
      t.identifier === historyScrollTouchId
    ) {
      historyScrollTouchId = null;
    }
    if (screen === 'home' && homePressedButton) {
      if (
        !t ||
        homeDrawerOpen ||
        ratingCardVisible ||
        checkinModalVisible ||
        pieceSkinModalVisible
      ) {
        homePressedButton = null;
        draw();
        return;
      } else {
        var xRel = t.clientX;
        var yRel = t.clientY;
        var endHit = hitHomeButton(xRel, yRel);
        var pb = homePressedButton;
        homePressedButton = null;
        draw();
        if (endHit === pb) {
          if (pb === 'pvp') {
            startOnlineAsHost();
            return;
          }
          if (pb === 'pve') {
            homeDrawerOpen = false;
            screen = 'pve_color';
            draw();
            return;
          }
          if (pb === 'random') {
            startRandomMatch();
            return;
          }
        }
        return;
      }
    } else if (screen === 'home' && homePressedDockCol !== null) {
      if (
        !t ||
        homeDrawerOpen ||
        ratingCardVisible ||
        checkinModalVisible ||
        pieceSkinModalVisible
      ) {
        homePressedDockCol = null;
        draw();
        return;
      }
      var endDock = hitHomeBottomNav(t.clientX, t.clientY);
      var pdc = homePressedDockCol;
      homePressedDockCol = null;
      draw();
      if (endDock === pdc) {
        if (pdc === 3) {
          openPieceSkinModal();
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
                  syncCheckinStateFromServerPayload(d);
                  applyMyGenderFromRatingPayload(d);
                  var calNow = new Date();
                  var calY = calNow.getFullYear();
                  var calM = calNow.getMonth() + 1;
                  var stOpen = getCheckinState();
                  checkinModalData = {
                    streak: stOpen.streak,
                    rewardPoints: CHECKIN_DAILY_POINTS,
                    totalPoints: stOpen.tuanPoints,
                    justSigned: false,
                    viewYear: calY,
                    viewMonth: calM
                  };
                  checkinModalVisible = true;
                  draw();
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
          openHistoryScreen();
          return;
        }
        if (pdc === 1 && typeof wx.showToast === 'function') {
          wx.showToast({ title: '对战排行 敬请期待', icon: 'none' });
        }
      }
      return;
    } else if (homePressedButton) {
      homePressedButton = null;
      draw();
    } else if (homePressedDockCol !== null) {
      homePressedDockCol = null;
      draw();
    }
    if (
      !t ||
      screen !== 'home' ||
      homeDrawerOpen ||
      ratingCardVisible ||
      checkinModalVisible ||
      pieceSkinModalVisible
    ) {
      return;
    }
    var nav = getHomeNavBarLayout();
    if (
      lastTouchDownY < nav.navTop ||
      lastTouchDownY > nav.navBottom
    ) {
      return;
    }
    var x1 = t.clientX;
    var y1 = t.clientY;
    var dx = x1 - lastTouchDownX;
    var dy = y1 - lastTouchDownY;
    var edge = rpx(28);
    if (
      lastTouchDownX < edge &&
      dx > rpx(56) &&
      Math.abs(dy) < rpx(72)
    ) {
      homeDrawerOpen = true;
      draw();
    }
  });
}

if (typeof wx.onTouchCancel === 'function') {
  wx.onTouchCancel(function () {
    if (screen === 'history') {
      historyScrollTouchId = null;
    }
    if (homePressedButton || homePressedDockCol !== null) {
      homePressedButton = null;
      homePressedDockCol = null;
      draw();
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
    loadHomeUiAssets();
    setTimeout(function () {
      tryFetchMyProfileAvatar();
    }, 500);
    if (res && res.query && String(res.query.online) === '1' && res.query.roomId) {
      tryLaunchOnlineInvite(res.query);
    }
    if (shouldAutoReconnectOnline() && !onlineWsConnected) {
      clearOnlineReconnectTimer();
      scheduleOnlineReconnect(true);
    }
  });
} else {
  authApi.silentLogin();
}

if (typeof wx.onNetworkStatusChange === 'function') {
  wx.onNetworkStatusChange(function (res) {
    if (
      res.isConnected &&
      shouldAutoReconnectOnline() &&
      !onlineWsConnected
    ) {
      clearOnlineReconnectTimer();
      scheduleOnlineReconnect(true);
    }
  });
}

function setupShareMessage() {
  if (typeof wx.onShareAppMessage === 'function') {
    wx.onShareAppMessage(function () {
      if (isPvpOnline && onlineRoomId && pvpOnlineYourColor === BLACK) {
        return {
          title: '五子棋 房号 ' + onlineRoomId,
          query: 'roomId=' + onlineRoomId + '&online=1'
        };
      }
      return {
        title: '来一局团团五子棋吧！',
        query: 'from=invite'
      };
    });
  }
}
setupShareMessage();

try {
  var launchOpt = wx.getLaunchOptionsSync && wx.getLaunchOptionsSync();
  if (launchOpt && launchOpt.query) {
    var lq = launchOpt.query;
    if (String(lq.online) === '1' && lq.roomId) {
      tryLaunchOnlineInvite(lq);
    } else if (String(lq.from) === 'invite') {
      startPvpLocal();
    }
  }
} catch (launchErr) {}

if (typeof wx.onWindowResize === 'function') {
  wx.onWindowResize(function () {
    syncCanvasWithWindow();
    draw();
  });
}

defaultAvatars.preloadAll(function () {
  loadHomeUiAssets();
  draw();
});

draw();
maybeFirstVisitProfileModal();

/** 首屏再调一次：避免仅依赖 onShow 时，部分环境下首帧未触发或注册晚于首次 onShow */
authApi.silentLogin();
setTimeout(function () {
  tryFetchMyProfileAvatar();
}, 600);
