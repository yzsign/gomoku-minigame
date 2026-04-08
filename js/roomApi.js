/**
 * 联机 HTTP / WebSocket 基址与请求选项
 * （需与微信后台「request 合法域名」一致；生产请用 https + wss）
 */
// var GOMOKU_API_BASE = 'http://127.0.0.1:8080';
var GOMOKU_API_BASE =
  'https://springboot-emh7-prod-6gn1r1137409822f-1418403127.ap-shanghai.run.wxcloudrun.com';

function withAuthHeaders(baseHeader) {
  var h = baseHeader ? Object.assign({}, baseHeader) : {};
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var t = wx.getStorageSync('gomoku_session_token');
      if (t) {
        h.Authorization = 'Bearer ' + String(t);
      }
    }
  } catch (e) {}
  return h;
}

/**
 * 与 wxcloudrun-gomoku RoomController 一致：@RequestParam / form
 * - 创建：POST /api/rooms（Header: Authorization: Bearer sessionToken）
 * - 加入：POST /api/rooms/join
 * - 随机匹配：POST /api/match/random；房主取消：POST /api/match/random/cancel
 */
function roomApiCreateOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/rooms',
    method: 'POST',
    header: withAuthHeaders({})
  };
}

function roomApiJoinOptions(roomId) {
  return {
    url: GOMOKU_API_BASE + '/api/rooms/join',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/x-www-form-urlencoded'
    }),
    data: 'roomId=' + encodeURIComponent(roomId)
  };
}

/** 随机匹配：POST /api/match/random */
function roomApiRandomMatchOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/match/random',
    method: 'POST',
    header: withAuthHeaders({})
  };
}

/** 房主：对手加入后 GET /api/match/random/paired?roomId= — 取最终 WebSocket token（含随机先后手交换） */
function roomApiRandomMatchPairedOptions(roomId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/match/random/paired?roomId=' +
      encodeURIComponent(roomId),
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** 房主取消随机匹配等待：POST /api/match/random/cancel */
function roomApiRandomMatchCancelOptions(roomId, blackToken) {
  return {
    url: GOMOKU_API_BASE + '/api/match/random/cancel',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/x-www-form-urlencoded'
    }),
    data:
      'roomId=' +
      encodeURIComponent(roomId) +
      '&blackToken=' +
      encodeURIComponent(blackToken)
  };
}

/** 匹配超时：POST /api/match/random/fallback-bot — 从数据库随机人机作为白方 */
function roomApiRandomMatchFallbackOptions(roomId, blackToken) {
  return {
    url: GOMOKU_API_BASE + '/api/match/random/fallback-bot',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/x-www-form-urlencoded'
    }),
    data:
      'roomId=' +
      encodeURIComponent(roomId) +
      '&blackToken=' +
      encodeURIComponent(blackToken)
  };
}

function wsUrlFromApiBase() {
  var base = GOMOKU_API_BASE || '';
  if (base.indexOf('https://') === 0) {
    return 'wss://' + base.slice(8);
  }
  if (base.indexOf('http://') === 0) {
    return 'ws://' + base.slice(7);
  }
  return base;
}

/** GET /api/me/rating：天梯分、局数、胜负等（需 Authorization） */
function meRatingOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/rating',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** GET /api/me/game-history?limit=&offset=：已结算联机对局列表（需 Authorization） */
function meGameHistoryOptions(limit, offset) {
  var lim =
    limit !== undefined && limit !== null ? Number(limit) : 50;
  var off =
    offset !== undefined && offset !== null ? Number(offset) : 0;
  if (isNaN(lim) || lim < 1) {
    lim = 50;
  }
  if (isNaN(off) || off < 0) {
    off = 0;
  }
  return {
    url:
      GOMOKU_API_BASE +
      '/api/me/game-history?limit=' +
      encodeURIComponent(String(lim)) +
      '&offset=' +
      encodeURIComponent(String(off)),
    /** 与 GET 等价；部分运行环境对 GET 返回 405，服务端已同时注册 POST */
    method: 'POST',
    header: withAuthHeaders({})
  };
}

/** POST /api/me/checkin：每日签到（服务端 streak/积分/团团萌肤解锁，需 Authorization） */
function meCheckinOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/checkin',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: '{}'
  };
}

/** POST /api/me/piece-skins/redeem：积分兑换棋子皮肤（body: { skinId }） */
function mePieceSkinRedeemOptions(skinId) {
  return {
    url: GOMOKU_API_BASE + '/api/me/piece-skins/redeem',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({ skinId: skinId })
  };
}

/** GET /api/rooms/opponent-rating?roomId=：当前房间对手的公开天梯（须为双方玩家之一） */
function roomOpponentRatingOptions(roomId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/rooms/opponent-rating?roomId=' +
      encodeURIComponent(roomId),
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/**
 * POST /api/games/settle：联机对局结束上报，服务端更新天梯（须 Authorization）
 * body: { roomId, matchRound, outcome: BLACK_WIN|WHITE_WIN|DRAW, totalSteps }
 */
function gameSettleOptions(body) {
  return {
    url: GOMOKU_API_BASE + '/api/games/settle',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

/** GET /api/games/replay?roomId=&matchRound= */
function gameReplayByRoomOptions(roomId, matchRound) {
  var mr =
    matchRound !== undefined && matchRound !== null ? Number(matchRound) : 1;
  if (isNaN(mr) || mr < 1) {
    mr = 1;
  }
  return {
    url:
      GOMOKU_API_BASE +
      '/api/games/replay?roomId=' +
      encodeURIComponent(roomId) +
      '&matchRound=' +
      encodeURIComponent(String(mr)),
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** GET /api/games/{gameId}/replay */
function gameReplayByIdOptions(gameId) {
  return {
    url: GOMOKU_API_BASE + '/api/games/' + encodeURIComponent(String(gameId)) + '/replay',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

module.exports = {
  GOMOKU_API_BASE: GOMOKU_API_BASE,
  roomApiCreateOptions: roomApiCreateOptions,
  roomApiJoinOptions: roomApiJoinOptions,
  roomApiRandomMatchOptions: roomApiRandomMatchOptions,
  roomApiRandomMatchPairedOptions: roomApiRandomMatchPairedOptions,
  roomApiRandomMatchCancelOptions: roomApiRandomMatchCancelOptions,
  roomApiRandomMatchFallbackOptions: roomApiRandomMatchFallbackOptions,
  meRatingOptions: meRatingOptions,
  meGameHistoryOptions: meGameHistoryOptions,
  meCheckinOptions: meCheckinOptions,
  mePieceSkinRedeemOptions: mePieceSkinRedeemOptions,
  roomOpponentRatingOptions: roomOpponentRatingOptions,
  gameSettleOptions: gameSettleOptions,
  gameReplayByRoomOptions: gameReplayByRoomOptions,
  gameReplayByIdOptions: gameReplayByIdOptions,
  wsUrlFromApiBase: wsUrlFromApiBase
};
