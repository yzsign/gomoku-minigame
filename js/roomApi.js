/**
 * 联机 HTTP / WebSocket 基址与请求选项
 * （需与微信后台「request 合法域名」一致；生产请用 https + wss）
 */
// var GOMOKU_API_BASE = 'http://127.0.0.1:8080';
var GOMOKU_API_BASE =
  'https://springboot-emh7-prod-6gn1r1137409822f-1418403127.ap-shanghai.run.wxcloudrun.com';

/**
 * 与 wxcloudrun-gomoku RoomController 一致：@RequestParam / form
 * - 创建：POST /api/rooms
 * - 加入：POST /api/rooms/join，body：application/x-www-form-urlencoded
 * - 随机匹配：POST /api/match/random；房主取消：POST /api/match/random/cancel
 */
function roomApiCreateOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/rooms',
    method: 'POST'
  };
}

function roomApiJoinOptions(roomId) {
  return {
    url: GOMOKU_API_BASE + '/api/rooms/join',
    method: 'POST',
    header: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    data: 'roomId=' + encodeURIComponent(roomId)
  };
}

/** 随机匹配：POST /api/match/random */
function roomApiRandomMatchOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/match/random',
    method: 'POST'
  };
}

/** 房主取消随机匹配等待：POST /api/match/random/cancel */
function roomApiRandomMatchCancelOptions(roomId, blackToken) {
  return {
    url: GOMOKU_API_BASE + '/api/match/random/cancel',
    method: 'POST',
    header: {
      'content-type': 'application/x-www-form-urlencoded'
    },
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

module.exports = {
  GOMOKU_API_BASE: GOMOKU_API_BASE,
  roomApiCreateOptions: roomApiCreateOptions,
  roomApiJoinOptions: roomApiJoinOptions,
  roomApiRandomMatchOptions: roomApiRandomMatchOptions,
  roomApiRandomMatchCancelOptions: roomApiRandomMatchCancelOptions,
  wsUrlFromApiBase: wsUrlFromApiBase
};
