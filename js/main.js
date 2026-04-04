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

/** 首页画布战绩卡片（替代 wx.showModal） */
var ratingCardVisible = false;
var ratingCardData = null;
var ratingFetchInFlight = false;

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
      : defaultAvatars.getOpponentAvatarImage();
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
  /** 对手：棋盘右上角外侧；右侧为与「我」性别相反的默认头像 */
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(oppName, L.oppNameRightX, L.oppCy);
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
  /** 我：棋盘左下角外侧；左侧为默认头像（女/男） */
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
  ctx.fillText(myName, L.myTextX, L.myCy);
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

var themeId = themes.loadSavedThemeId();

/** 风格切换气泡文案（空则不绘制） */
var themeBubbleText = '';
var themeBubbleAlpha = 1;
var themeBubbleRafId = null;

function getCurrentTheme() {
  return themes.getTheme(themeId);
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
  if (DPR > 3) {
    DPR = 3;
  }
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (typeof ctx.imageSmoothingEnabled !== 'undefined') {
    ctx.imageSmoothingEnabled = true;
  }
  if (typeof ctx.imageSmoothingQuality !== 'undefined') {
    ctx.imageSmoothingQuality = 'high';
  }
}

syncCanvasWithWindow();

/* ---------- 界面与对局状态 ---------- */

/** 'home' | 'pve_color' | 'matching' | 'game' */
var screen = 'home';

/** 对局结束：在棋盘页上以半透明弹层展示（不再切全屏 result） */
var showResultOverlay = false;

/** 联机：对方已重置开新局，本端仍显示上一局结算直至用户点「再来一局/返回首页」 */
var onlineResultOverlaySticky = false;

/** 对方胜：先高亮五连连线，约 2s 后再弹出结算 */
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

/** 联机对手：服务端头像与昵称（与占位默认图区分） */
var onlineOppAvatarImg = null;
var onlineOppNickname = '';
var onlineOppProfileRoomId = '';
var onlineOppProfileFetched = false;
var onlineOppFetchInFlight = false;

/** 本人：服务端 avatarUrl 加载的网络图（首页与棋盘共用） */
var myNetworkAvatarImg = null;
var myProfileAvatarFetched = false;

/** 随机匹配到的假对手昵称 */
var randomOpponentName = '';

var matchingTimer = null;
var matchingAnimTimer = null;
var matchingDots = 0;
/** 随机匹配：已为房主创建房间并等待真人对手（超时则人机） */
var randomMatchHostWaiting = false;
var RANDOM_MATCH_TIMEOUT_MS = 5000;

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

/** 同桌：走子栈；localUndoRequest 非空表示待对方同意悔棋 */
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
  clearOnlineOpponentProfile();
}

function clearOnlineOpponentProfile() {
  onlineOppAvatarImg = null;
  onlineOppNickname = '';
  onlineOppProfileRoomId = '';
  onlineOppProfileFetched = false;
  onlineOppFetchInFlight = false;
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
        if (d && typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
          loadMyNetworkAvatar(d.avatarUrl.trim());
        }
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
  }
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
  localUndoRequest = { requesterColor: oppositeColor(current) };
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
  applyLocalUndoPops();
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

/** 是否走「连线 → 延迟 → 结算」：对方胜（人机 AI、联机对手、同桌任一方胜） */
function isOpponentWinForReveal(winnerColor) {
  if (isPvpLocal) {
    return true;
  }
  if (isPvpOnline) {
    return winnerColor !== pvpOnlineYourColor;
  }
  return winnerColor === pveAiColor();
}

function finishGameWithWin(r, c, winnerColor) {
  gameOver = true;
  winner = winnerColor;
  if (!isOpponentWinForReveal(winnerColor)) {
    clearWinRevealTimer();
    winningLineCells = null;
    openResult();
    return;
  }
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

function applyOnlineState(data) {
  if (!data || data.type !== 'STATE') {
    return;
  }
  var prevBlack = onlineBlackConnected;
  var prevWhite = onlineWhiteConnected;
  var wasOver = gameOver;
  var prevBoard = copyBoardFromServer(board);
  board = copyBoardFromServer(data.board);
  current = data.current;
  gameOver = data.gameOver;
  if (!gameOver) {
    onlineSettleSent = false;
  }
  if (data.winner === undefined || data.winner === null) {
    winner = null;
  } else {
    winner = data.winner;
  }
  pvpOnlineYourColor = data.yourColor;
  onlineBlackConnected = !!data.blackConnected;
  onlineWhiteConnected = !!data.whiteConnected;
  if (data.whiteIsBot !== undefined && data.whiteIsBot !== null) {
    onlineOpponentIsBot = !!data.whiteIsBot;
  }
  if (isPvpOnline && (screen === 'game' || screen === 'matching')) {
    var yc = data.yourColor;
    var oppWas = yc === BLACK ? prevWhite : prevBlack;
    var oppNow = yc === BLACK ? onlineWhiteConnected : onlineBlackConnected;
    if (oppNow) {
      onlineOpponentLeft = false;
    } else if (oppWas && !oppNow) {
      onlineOpponentLeft = true;
    }
  }
  if (randomMatchHostWaiting && screen === 'matching' && data.whiteConnected) {
    randomMatchHostWaiting = false;
    cancelMatchingTimers();
    screen = 'game';
  }
  onlineUndoPending = !!data.undoPending;
  if (data.undoRequesterColor === undefined || data.undoRequesterColor === null) {
    onlineUndoRequesterColor = null;
  } else {
    onlineUndoRequesterColor = data.undoRequesterColor;
  }
  lastMsg = '';
  syncLastOpponentMoveOnline(prevBoard, board, data.yourColor);

  if (gameOver && !wasOver) {
    screen = 'game';
    if (winner != null && isOpponentWinForReveal(winner)) {
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
  var boardPx = Math.min(availW, availH);
  var cell = boardPx / (SIZE - 1);
  var originX = (W - (SIZE - 1) * cell) / 2;
  var originY = topBar + (availH - (SIZE - 1) * cell) / 2;
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

function fillCuteBackground() {
  var th = getCurrentTheme();
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.bg[0]);
  g.addColorStop(0.5, th.bg[1]);
  g.addColorStop(1, th.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  var rg = ctx.createRadialGradient(
    W * 0.5,
    H * 0.08,
    0,
    W * 0.5,
    H * 0.35,
    H * 0.85
  );
  rg.addColorStop(0, 'rgba(255, 248, 240, 0.45)');
  rg.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

/** 首页主标题：置顶 */
function getHomeTextLayout() {
  var sb = sys.statusBarHeight || 24;
  var safeTop =
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var titleY = insetTop + 11;
  return { titleY: titleY, insetTop: insetTop };
}

/** 主按钮区：首卡与主标题留白 */
function getHomeLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 56;
  var cx = W / 2;
  var tl = getHomeTextLayout();
  var step = Math.min(H * 0.108, 84);
  var y1 = Math.max(H * 0.27, tl.titleY + 58 + btnH / 2);
  return {
    btnW: btnW,
    btnH: btnH,
    cx: cx,
    y1: y1,
    y2: y1 + step,
    y3: y1 + step * 2
  };
}

/** 首页左上角默认头像（点击可查看天梯与胜率；性别来自授权资料） */
function getHomeAvatarLayout() {
  var sb = sys.statusBarHeight || 24;
  var safeTop =
    sys.safeArea && sys.safeArea.top != null ? sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var avR = 30;
  var padL = 12;
  var cx = padL + avR;
  var cy = insetTop + 10 + avR;
  return { cx: cx, cy: cy, r: avR };
}

function hitHomeAvatar(clientX, clientY) {
  if (screen !== 'home') {
    return false;
  }
  var L = getHomeAvatarLayout();
  var dx = clientX - L.cx;
  var dy = clientY - L.cy;
  return dx * dx + dy * dy <= (L.r + 10) * (L.r + 10);
}

function getRatingCardLayout() {
  var w = Math.min(W - 48, 300);
  var h = 228;
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
  var y0 = L.cy - L.h / 2;
  var btnW = 128;
  var btnH = 36;
  var btnX = L.cx - btnW / 2;
  var btnY = y0 + L.h - 52;
  return x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH;
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

  var titleBlock = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (d.cardTitle) {
    ctx.font =
      'bold 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = th.title;
    ctx.fillText(d.cardTitle, L.cx, y + 14);
    titleBlock += 26;
  }
  if (d.nicknameLine) {
    ctx.font = '12px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = th.muted;
    ctx.fillText(d.nicknameLine, L.cx, y + 14 + titleBlock);
    titleBlock += 18;
  }

  var btnTop = y + L.h - 52;
  var gapAboveBtn = 14;
  var availH = btnTop - gapAboveBtn - y - titleBlock;
  var contentBlockH = 67;
  var rowTop = y + titleBlock + (availH - contentBlockH) / 2;
  if (rowTop < y + 10 + titleBlock) {
    rowTop = y + 10 + titleBlock;
  }
  var colL = x + L.w / 6;
  var colM = x + L.w / 2;
  var colR = x + (5 * L.w) / 6;

  ctx.font = '12px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.fillText('得分', colL, rowTop);
  ctx.fillText('胜率', colM, rowTop);
  ctx.fillText('称号', colR, rowTop);

  ctx.font = 'bold 20px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title;
  ctx.fillText(String(d.elo), colL, rowTop + 20);
  ctx.fillText(d.winPctDisplay, colM, rowTop + 20);
  ctx.font = 'bold 18px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillText(d.titleName, colR, rowTop + 20);

  var statY = rowTop + 56;
  ctx.font = '11px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  if (!d.noGames && d.total > 0) {
    ctx.fillText('胜 ' + d.win + ' · 共 ' + d.total + ' 局', L.cx, statY);
  } else {
    ctx.fillText('暂无对局', L.cx, statY);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + L.w / 3 - 0.5, rowTop + 6);
  ctx.lineTo(x + L.w / 3 - 0.5, rowTop + 48);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + (2 * L.w) / 3 - 0.5, rowTop + 6);
  ctx.lineTo(x + (2 * L.w) / 3 - 0.5, rowTop + 48);
  ctx.stroke();

  var btnW = 128;
  var btnH = 36;
  var btnX = L.cx - btnW / 2;
  var btnY = y + L.h - 52;
  ctx.fillStyle = th.homeCards && th.homeCards[0] ? th.homeCards[0] : '#FFB6C1';
  roundRect(btnX, btnY, btnW, btnH, btnH / 2);
  ctx.fill();
  ctx.font = '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText('知道了', L.cx, btnY + btnH / 2);

  ctx.restore();
}

/**
 * 将 /api/me/rating 或 /api/rooms/opponent-rating 的 JSON 填入战绩卡片
 * opts: { cardTitle, nicknameLine, usePayloadNickname }
 */
function fillRatingCardFromApiData(d, opts) {
  opts = opts || {};
  var cardTitle = opts.cardTitle || '';
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
  ratingCardData = {
    cardTitle: cardTitle,
    nicknameLine: nicknameLine,
    elo: elo,
    titleName: rt.titleName,
    winPctDisplay: winPctDisplay,
    win: win,
    total: total,
    noGames: noGames
  };
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

function drawHomeTopLeftAvatar(th) {
  var L = getHomeAvatarLayout();
  var img = getMyAvatarImageForUi();
  defaultAvatars.drawCircleAvatar(ctx, img, L.cx, L.cy, L.r, th);
}

/** 各页右上角「风格」：下移避开微信胶囊 / 菜单按钮 */
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
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.5;
  roundRect(L.cx - L.w / 2, L.cy - L.h / 2, L.w, L.h, L.r);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font =
    'bold 14px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.btnGhostText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('风格', L.cx, L.cy);
}

/** 风格名称气泡：在「风格」按钮左侧，配色随当前主题；themeBubbleAlpha 控制渐隐 */
function drawThemeBubble(th) {
  if (!themeBubbleText || themeBubbleAlpha <= 0) {
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
  ctx.fillText(themeBubbleText, x + bw / 2, L.cy);
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

/** 当前界面是否绘制了「风格」入口（与气泡动画、点击区域一致） */
function themeScreenShowsStyleEntry() {
  return (
    screen === 'home' ||
    screen === 'pve_color' ||
    screen === 'matching' ||
    screen === 'game'
  );
}

function drawThemeChrome(th) {
  drawThemeBubble(th);
  drawThemeEntry(th);
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
  if (onlineWhiteConnected) {
    randomMatchHostWaiting = false;
    cancelMatchingTimers();
    screen = 'game';
    draw();
    return;
  }
  wx.request(
    Object.assign(
      roomApi.roomApiRandomMatchFallbackOptions(onlineRoomId, onlineToken),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            randomMatchHostWaiting = false;
            cancelMatchingTimers();
            screen = 'game';
            draw();
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
          onlineToken = d.whiteToken;
          pvpOnlineYourColor = WHITE;
          isPvpLocal = false;
          isRandomMatch = false;
          randomMatchHostWaiting = false;
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
          onlineToken = d.blackToken;
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
          startOnlineSocket();
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
  if (randomMatchHostWaiting && onlineRoomId && onlineToken) {
    wx.request(roomApi.roomApiRandomMatchCancelOptions(onlineRoomId, onlineToken));
  }
  randomMatchHostWaiting = false;
  disconnectOnline();
  screen = 'home';
  draw();
}

function backToHome() {
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
  onlineSettleSent = true;
  wx.request(
    Object.assign(
      roomApi.gameSettleOptions({
        roomId: onlineRoomId,
        outcome: outcome,
        totalSteps: steps
      }),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            return;
          }
          if (res.statusCode !== 200) {
            onlineSettleSent = false;
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
  screen = 'game';
  draw();
}

/** 棋盘页结算弹层：卡片与按钮位置（与 drawResultOverlay / hitResultButton 一致） */
function getResultOverlayLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 54;
  var cardW = Math.min(W - 40, 360);
  var cardH = Math.min(300, Math.max(260, H * 0.38));
  var cardX = (W - cardW) / 2;
  var cardY = Math.max((sys.statusBarHeight || 0) + 24, H * 0.22);
  return {
    btnW: btnW,
    btnH: btnH,
    cx: W / 2,
    cardX: cardX,
    cardY: cardY,
    cardW: cardW,
    cardH: cardH,
    yTitle: cardY + 50,
    ySub: cardY + 102,
    yAgain: cardY + 162,
    yHome: cardY + 228
  };
}

function drawResultOverlay() {
  var th = getCurrentTheme();
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

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
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
  ctx.fillText('返回首页', ly.cx, ly.yHome);
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
  if (
    Math.abs(clientX - rl.cx) <= bw &&
    Math.abs(clientY - rl.yHome) <= bh
  ) {
    return 'home';
  }
  return null;
}

/* ---------- 绘制：各界面 ---------- */

function drawHome() {
  fillCuteBackground();

  var tl = getHomeTextLayout();
  var hl = getHomeLayout();
  var th = getCurrentTheme();
  render.drawText(ctx, '团团五子棋', W / 2, tl.titleY, 22, th.title);

  doodles.drawHomeTopLeftClouds(
    ctx,
    W,
    H,
    sys.statusBarHeight || 0,
    tl.titleY + 22
  );
  drawHomeTopLeftAvatar(th);
  var safeBottom =
    sys.safeArea && sys.safeArea.bottom != null ? sys.safeArea.bottom : 0;
  doodles.drawHomeBottomRightClouds(ctx, W, H, safeBottom);

  drawMacaronCard(
    '随机匹配',
    hl.cx,
    hl.y1,
    hl.btnW,
    hl.btnH,
    th.homeCards[0],
    false,
    'bear'
  );
  drawMacaronCard(
    '好友对战',
    hl.cx,
    hl.y2,
    hl.btnW,
    hl.btnH,
    th.homeCards[1],
    false,
    'cloud'
  );
  drawMacaronCard(
    '人机对战',
    hl.cx,
    hl.y3,
    hl.btnW,
    hl.btnH,
    th.homeCards[2],
    false,
    'sparkle'
  );
  drawThemeChrome(th);
  drawRatingCardOverlay(th);
}

function drawMatching() {
  fillCuteBackground();

  var th = getCurrentTheme();
  doodles.drawMatchingDecoration(ctx, W, H);
  render.drawText(ctx, '随机匹配', W / 2, H * 0.22, 28, th.title);

  var dots = '';
  var d;
  for (d = 0; d < matchingDots; d++) {
    dots += '·';
  }
  render.drawText(
    ctx,
    '正在为你寻找对手' + dots,
    W / 2,
    H * 0.44,
    15,
    th.subtitle
  );

  ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('取消', W / 2, H * 0.68);
  drawThemeChrome(th);
}

function drawPveColorSelect() {
  fillCuteBackground();

  var cl = getPveColorLayout();
  var th = getCurrentTheme();
  render.drawText(ctx, '人机对战', W / 2, H * 0.18, 28, th.title);
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
  ctx.fillText('返回', cl.cx, cl.backY);
  drawThemeChrome(th);
}

/**
 * 马卡龙大圆角卡片；doodleKind 为小插画类型（右下角），有插画时标题左对齐
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
  var r = Math.min(28, bh * 0.45);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
  roundRect(cx - bw / 2 + 2, cy - bh / 2 + 4, bw, bh, r);
  ctx.fill();
  ctx.fillStyle = fillHex;
  roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 1.5;
  roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
  ctx.stroke();
  if (isSelected) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 3;
    roundRect(cx - bw / 2 - 3, cy - bh / 2 - 3, bw + 6, bh + 6, r + 2);
    ctx.stroke();
  }
  ctx.font =
    'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  if (doodleKind) {
    ctx.textAlign = 'left';
    ctx.fillText(label, cx - bw / 2 + 18, cy);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy);
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

function draw() {
  if (screen === 'home') {
    drawHome();
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

  fillCuteBackground();

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
  render.drawPieces(ctx, board, layout, th);
  if (lastOpponentMove) {
    var lr = lastOpponentMove.r;
    var lc = lastOpponentMove.c;
    if (
      lr >= 0 &&
      lr < SIZE &&
      lc >= 0 &&
      lc < SIZE &&
      board[lr][lc] !== gomoku.EMPTY
    ) {
      render.drawOpponentLastMoveMarker(
        ctx,
        layout,
        th,
        lr,
        lc,
        board[lr][lc]
      );
    }
  }
  if (winningLineCells && winningLineCells.length >= 1) {
    render.drawWinningLine(ctx, layout, winningLineCells);
  }

  drawBoardNameLabels(ctx, layout, th);

  render.drawText(
    ctx,
    '团团五子棋',
    W / 2,
    layout.topBar * 0.45,
    16,
    th.title
  );

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
  var th = getCurrentTheme();
  var bw = 82;
  var bh = 34;
  var r = 17;
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
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
  ctx.fillText(label, cx, cy);
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

function hitHomeButton(clientX, clientY) {
  var hl = getHomeLayout();
  var bw = hl.btnW / 2 + 12;
  var bh = hl.btnH / 2 + 12;
  if (
    Math.abs(clientX - hl.cx) <= bw &&
    Math.abs(clientY - hl.y1) <= bh
  ) {
    return 'random';
  }
  if (
    Math.abs(clientX - hl.cx) <= bw &&
    Math.abs(clientY - hl.y2) <= bh
  ) {
    return 'pvp';
  }
  if (
    Math.abs(clientX - hl.cx) <= bw &&
    Math.abs(clientY - hl.y3) <= bh
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

wx.onTouchStart(function (e) {
  var t = e.touches[0];
  var x = t.clientX;
  var y = t.clientY;

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

  if (screen === 'home' && hitHomeAvatar(x, y)) {
    showMyRatingModal();
    return;
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

  if (themeScreenShowsStyleEntry() && hitThemeEntry(x, y)) {
    cycleThemeNext();
    return;
  }

  if (screen === 'home') {
    var homeBtn = hitHomeButton(x, y);
    if (homeBtn === 'pvp') {
      startOnlineAsHost();
      return;
    }
    if (homeBtn === 'pve') {
      screen = 'pve_color';
      draw();
      return;
    }
    if (homeBtn === 'random') {
      startRandomMatch();
      return;
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
  draw();
});

draw();
maybeFirstVisitProfileModal();

/** 首屏再调一次：避免仅依赖 onShow 时，部分环境下首帧未触发或注册晚于首次 onShow */
authApi.silentLogin();
setTimeout(function () {
  tryFetchMyProfileAvatar();
}, 600);
