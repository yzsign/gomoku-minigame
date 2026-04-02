/**
 * 微信小游戏入口：界面状态机、绘制、触摸、联机与人机流程
 */

var gomoku = require('./gomoku.js');
var render = require('./render.js');
var themes = require('./themes.js');
var doodles = require('./doodles.js');
var roomApi = require('./roomApi.js');
var authApi = require('./authApi.js');

/** 是否已处理过「首次资料」询问（含用户点暂不） */
var PROFILE_PROMPT_STORAGE_KEY = 'gomoku_profile_prompt_done';

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
              authApi.silentLogin(up.userInfo, function (ok) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({
                    title: ok ? '资料已保存' : '保存失败',
                    icon: ok ? 'success' : 'none'
                  });
                }
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
      authApi.silentLogin(userInfo, function (ok) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({
            title: ok ? '资料已保存' : '保存失败',
            icon: ok ? 'success' : 'none'
          });
        }
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

/** 'home' | 'pvp_select' | 'pve_color' | 'matching' | 'game' | 'result' */
var screen = 'home';

/**
 * 对局结束页：pve_win | pve_lose | pve_draw | pvp_* | online_win | online_lose
 */
var resultKind = '';

/** 人机：玩家执子 gomoku.BLACK | gomoku.WHITE */
var pveHumanColor = BLACK;

/** 人机难度展示文案（引擎侧固定为困难） */
var PVE_DIFF_LABEL = '困难';

function pveAiColor() {
  return pveHumanColor === BLACK ? WHITE : BLACK;
}

/** 是否由「随机匹配」进入的人机局（用于文案） */
var isRandomMatch = false;

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
var socketTask = null;
/** 避免冷启动与 onShow 各处理一次同一邀请 */
var onlineInviteConsumed = false;

/** 调起转发后，等用户从微信返回小游戏时再开局 */
var pendingFriendWaitAfterShare = false;

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
}

function disconnectOnline() {
  closeSocketOnly();
  isPvpOnline = false;
  onlineRoomId = '';
  onlineToken = '';
  pvpOnlineYourColor = BLACK;
  onlineBlackConnected = false;
  onlineWhiteConnected = false;
  onlineUndoPending = false;
  onlineUndoRequesterColor = null;
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
  var pops = localMoveHistory.length >= 2 ? 2 : 1;
  var i;
  for (i = 0; i < pops; i++) {
    var m = localMoveHistory.pop();
    board[m.r][m.c] = gomoku.EMPTY;
  }
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
  if (!socketTask || typeof socketTask.send !== 'function') {
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

function applyOnlineState(data) {
  if (!data || data.type !== 'STATE') {
    return;
  }
  var wasOver = gameOver;
  var prevBoard = copyBoardFromServer(board);
  board = copyBoardFromServer(data.board);
  current = data.current;
  gameOver = data.gameOver;
  if (data.winner === undefined || data.winner === null) {
    winner = null;
  } else {
    winner = data.winner;
  }
  pvpOnlineYourColor = data.yourColor;
  onlineBlackConnected = !!data.blackConnected;
  onlineWhiteConnected = !!data.whiteConnected;
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
    openResult();
    return;
  }
  if (!gameOver && wasOver) {
    screen = 'game';
  }
  draw();
}

function startOnlineSocket() {
  if (!onlineRoomId || !onlineToken) {
    return;
  }
  closeSocketOnly();
  isPvpOnline = true;
  var wsBase = roomApi.wsUrlFromApiBase();
  var url =
    wsBase +
    '/ws/gomoku?roomId=' +
    encodeURIComponent(onlineRoomId) +
    '&token=' +
    encodeURIComponent(onlineToken);
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Gomoku] WebSocket URL:', url);
  }
  socketTask = wx.connectSocket({
    url: url,
    fail: function () {
      wx.showToast({ title: '连接失败', icon: 'none' });
      disconnectOnline();
      screen = 'home';
      draw();
    }
  });
  if (!socketTask || !socketTask.onOpen) {
    return;
  }
  socketTask.onOpen(function () {});
  socketTask.onMessage(function (res) {
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
    if (isPvpOnline && screen === 'game') {
      wx.showToast({ title: '连接已断开', icon: 'none' });
    }
  });
  socketTask.onError(function () {
    wx.showToast({ title: '网络异常', icon: 'none' });
  });
}

function startOnlineAsHost() {
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
    },
    fail: function () {
      wx.hideLoading();
      wx.showToast({ title: '网络请求失败', icon: 'none' });
    }
  })
  );
}

function joinOnlineAsGuest(roomId) {
  if (!roomId) {
    return;
  }
  onlineInviteConsumed = true;
  disconnectOnline();
  wx.showLoading({ title: '加入房间…', mask: true });
  wx.request(
    Object.assign(roomApi.roomApiJoinOptions(roomId), {
    success: function (res) {
      wx.hideLoading();
      if (res.statusCode !== 200 || !res.data) {
        onlineInviteConsumed = false;
        var msg = '无法加入';
        if (res.statusCode === 404) {
          msg = '房间不存在';
        } else if (res.statusCode === 409) {
          msg = '房间已满';
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

function tryManualJoinRoom() {
  if (typeof wx.showModal !== 'function') {
    wx.showToast({ title: '请从邀请卡片进入', icon: 'none' });
    return;
  }
  wx.showModal({
    title: '加入联机房间',
    editable: true,
    placeholderText: '输入房号',
    success: function (r) {
      if (!r.confirm) {
        return;
      }
      var id = (r.content || '').trim();
      if (!id) {
        wx.showToast({ title: '房号为空', icon: 'none' });
        return;
      }
      joinOnlineAsGuest(id);
    }
  });
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
    screen === 'pvp_select' ||
    screen === 'pve_color' ||
    screen === 'matching' ||
    screen === 'result' ||
    screen === 'game'
  );
}

function drawThemeChrome(th) {
  drawThemeEntry(th);
  drawThemeBubble(th);
}

function hitThemeEntry(clientX, clientY) {
  var L = getThemeEntryLayout();
  return (
    Math.abs(clientX - L.cx) <= L.w / 2 + 10 &&
    Math.abs(clientY - L.cy) <= L.h / 2 + 10
  );
}

function getPvpLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 48;
  var cx = W / 2;
  var step = Math.min(H * 0.076, 54);
  var y0 = H * 0.28;
  return {
    btnW: btnW,
    btnH: btnH,
    cx: cx,
    yOnline: y0,
    yJoin: y0 + step,
    yLocal: y0 + step * 2,
    yShare: y0 + step * 3,
    backY: H * 0.82
  };
}

function getPveColorLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 54;
  var cx = W / 2;
  return {
    btnW: btnW,
    btnH: btnH,
    cx: cx,
    yBlack: H * 0.40,
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
  lastOpponentMove = null;
  if (isPvpOnline) {
    screen = 'game';
    if (socketTask && gameOver) {
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
  var sideLabel = pveHumanColor === BLACK ? '黑' : '白';
  if (isRandomMatch) {
    lastMsg =
      '「' +
      randomOpponentName +
      '」·' +
      PVE_DIFF_LABEL +
      '·你执' +
      sideLabel +
      (pveHumanColor === BLACK ? '先行' : '后行');
  } else {
    lastMsg =
      '人机（' +
      PVE_DIFF_LABEL +
      '）你执' +
      sideLabel +
      (pveHumanColor === BLACK ? '先行' : '后行');
  }
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
      roomApi.roomApiRandomMatchCancelOptions(onlineRoomId, onlineToken),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            randomMatchHostWaiting = false;
            cancelMatchingTimers();
            screen = 'game';
            draw();
            return;
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
  pendingFriendWaitAfterShare = false;
  onlineInviteConsumed = false;
  screen = 'home';
  draw();
}

function startPvpLocal() {
  lastOpponentMove = null;
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

function shareToWeChatFriend() {
  if (typeof wx.shareAppMessage !== 'function') {
    wx.showToast({
      title: '当前环境不支持转发',
      icon: 'none'
    });
    return;
  }
  pendingFriendWaitAfterShare = true;
  wx.shareAppMessage({
    title: '来一局团团五子棋吧！',
    query: 'from=invite'
  });
}

function openResult() {
  if (!gameOver) {
    return;
  }
  if (isPvpOnline) {
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
  screen = 'result';
  draw();
}

function getResultLayout() {
  var btnW = Math.min(W - 48, 300);
  var btnH = 54;
  return {
    btnW: btnW,
    btnH: btnH,
    cx: W / 2,
    yAgain: H * 0.58,
    yHome: H * 0.71
  };
}

function drawResult() {
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

  var rg = ctx.createLinearGradient(0, 0, 0, H);
  rg.addColorStop(0, bg);
  rg.addColorStop(1, rs.defaultEnd);
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  render.drawText(ctx, title, W / 2, H * 0.30, 40, titleColor);
  if (sub) {
    render.drawText(ctx, sub, W / 2, H * 0.40, 16, rs.sub, 'normal');
  }

  var rl = getResultLayout();
  drawMacaronCard(
    '再来一局',
    rl.cx,
    rl.yAgain,
    rl.btnW,
    rl.btnH,
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
    rl.cx - rl.btnW / 2,
    rl.yHome - rl.btnH / 2,
    rl.btnW,
    rl.btnH,
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
  ctx.fillText('返回首页', rl.cx, rl.yHome);
  drawThemeChrome(th);
}

function hitResultButton(clientX, clientY) {
  var rl = getResultLayout();
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
  render.drawText(
    ctx,
    '优先匹配真人，' +
      Math.round(RANDOM_MATCH_TIMEOUT_MS / 1000) +
      ' 秒内无对手则与人机对局',
    W / 2,
    H * 0.52,
    12,
    th.muted
  );

  ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('取消', W / 2, H * 0.68);
  drawThemeChrome(th);
}

function drawPvpSelect() {
  fillCuteBackground();

  var pl = getPvpLayout();
  var th = getCurrentTheme();
  render.drawText(ctx, '好友对战', W / 2, H * 0.16, 28, th.title);
  render.drawText(
    ctx,
    '联机需先启动 Spring 服务；也可同桌或转发',
    W / 2,
    H * 0.225,
    12,
    th.subtitle
  );

  drawMacaronCard(
    '联机对战',
    pl.cx,
    pl.yOnline,
    pl.btnW,
    pl.btnH,
    th.homeCards[0],
    false,
    'sparkle'
  );
  drawMacaronCard(
    '加入房间',
    pl.cx,
    pl.yJoin,
    pl.btnW,
    pl.btnH,
    th.homeCards[1],
    false,
    'heart'
  );
  drawMacaronCard(
    '同桌对战',
    pl.cx,
    pl.yLocal,
    pl.btnW,
    pl.btnH,
    th.homeCards[2],
    false,
    'bear'
  );
  drawMacaronCard(
    '转发邀请',
    pl.cx,
    pl.yShare,
    pl.btnW,
    pl.btnH,
    th.homeCards[0],
    false,
    'cloud'
  );

  ctx.font =
    '15px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('返回', pl.cx, pl.backY);
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
  if (screen === 'pvp_select') {
    drawPvpSelect();
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
  if (screen === 'result') {
    drawResult();
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
    if (!onlineBlackConnected || !onlineWhiteConnected) {
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
  render.drawText(
    ctx,
    status,
    W / 2,
    layout.bottomY - 50,
    15,
    th.status
  );

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

function hitPvpSelectButton(clientX, clientY) {
  var pl = getPvpLayout();
  var bw = pl.btnW / 2 + 12;
  var bh = pl.btnH / 2 + 10;
  if (
    Math.abs(clientX - pl.cx) <= bw &&
    Math.abs(clientY - pl.yOnline) <= bh
  ) {
    return 'online';
  }
  if (
    Math.abs(clientX - pl.cx) <= bw &&
    Math.abs(clientY - pl.yJoin) <= bh
  ) {
    return 'join';
  }
  if (
    Math.abs(clientX - pl.cx) <= bw &&
    Math.abs(clientY - pl.yLocal) <= bh
  ) {
    return 'local';
  }
  if (
    Math.abs(clientX - pl.cx) <= bw &&
    Math.abs(clientY - pl.yShare) <= bh
  ) {
    return 'share';
  }
  if (Math.abs(clientX - pl.cx) <= 90 && Math.abs(clientY - pl.backY) <= 24) {
    return 'back';
  }
  return null;
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
    gameOver = true;
    winner = ai;
    openResult();
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
      aiColor: ai
    });
    return;
  }
  var mv;
  try {
    mv = gomoku.aiMove(board, ai);
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
    if (socketTask && typeof socketTask.send === 'function') {
      socketTask.send({
        data: JSON.stringify({ type: 'MOVE', r: r, c: c })
      });
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
    gameOver = true;
    winner = current;
    openResult();
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

  if (themeScreenShowsStyleEntry() && hitThemeEntry(x, y)) {
    cycleThemeNext();
    return;
  }

  if (screen === 'home') {
    var homeBtn = hitHomeButton(x, y);
    if (homeBtn === 'pvp') {
      screen = 'pvp_select';
      draw();
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

  if (screen === 'pvp_select') {
    var pvpBtn = hitPvpSelectButton(x, y);
    if (pvpBtn === 'online') {
      startOnlineAsHost();
      return;
    }
    if (pvpBtn === 'join') {
      tryManualJoinRoom();
      return;
    }
    if (pvpBtn === 'local') {
      startPvpLocal();
      return;
    }
    if (pvpBtn === 'share') {
      shareToWeChatFriend();
      return;
    }
    if (pvpBtn === 'back') {
      backToHome();
      return;
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

  if (screen === 'result') {
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
    if (pendingFriendWaitAfterShare) {
      pendingFriendWaitAfterShare = false;
      startPvpLocal();
      return;
    }
    if (res && res.query && String(res.query.online) === '1' && res.query.roomId) {
      tryLaunchOnlineInvite(res.query);
    }
  });
} else {
  authApi.silentLogin();
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

draw();
maybeFirstVisitProfileModal();

/** 首屏再调一次：避免仅依赖 onShow 时，部分环境下首帧未触发或注册晚于首次 onShow */
authApi.silentLogin();
