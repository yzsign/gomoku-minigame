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
 * body: { roomId, outcome: BLACK_WIN|WHITE_WIN|DRAW, totalSteps }
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

module.exports = {
  GOMOKU_API_BASE: GOMOKU_API_BASE,
  roomApiCreateOptions: roomApiCreateOptions,
  roomApiJoinOptions: roomApiJoinOptions,
  roomApiRandomMatchOptions: roomApiRandomMatchOptions,
  roomApiRandomMatchCancelOptions: roomApiRandomMatchCancelOptions,
  roomApiRandomMatchFallbackOptions: roomApiRandomMatchFallbackOptions,
  meRatingOptions: meRatingOptions,
  roomOpponentRatingOptions: roomOpponentRatingOptions,
  gameSettleOptions: gameSettleOptions,
  wsUrlFromApiBase: wsUrlFromApiBase
};
