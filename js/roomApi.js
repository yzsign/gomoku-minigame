/**
 * 联机 HTTP / WebSocket 基址与请求选项
 * （需与微信后台「request 合法域名」一致；生产请用 https + wss）
 */
 //var GOMOKU_API_BASE = 'http://127.0.0.1:8080';
var GOMOKU_API_BASE ='https://springboot-emh7-241395-4-1418403127.sh.run.tcloudbase.com';

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

/**
 * 好友在 PVP 对局中时申请观战票：POST /api/rooms/friend-watch?peerUserId=
 * 联 WS 时用返回的 watchToken 作 Gomoku WebSocket 的 token 参数（非黑/白座子 token）。
 */
function roomFriendWatchOptions(peerUserId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/rooms/friend-watch?peerUserId=' +
      encodeURIComponent(String(peerUserId)),
    method: 'POST',
    header: withAuthHeaders({}),
    /** 便于正确解析 Spring 返回的 ApiError JSON；无此字段时部分环境 res.data 为字符串 */
    dataType: 'json'
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

/** 随机一名人机的公开资料：GET /api/match/random/bot-profile（本地随机兜底 UI） */
function roomApiRandomBotProfileOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/match/random/bot-profile',
    method: 'GET',
    header: withAuthHeaders({})
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

/** GET /api/me/shop/catalog：杂货铺商品与有效积分价（可不登录；有 token 则带上） */
function meShopCatalogOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/shop/catalog',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** POST /api/me/pve-game：人机终局写入 games（body: JSON，需 Authorization） */
function mePveGameOptions(bodyObj) {
  return {
    url: GOMOKU_API_BASE + '/api/me/pve-game',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify(bodyObj || {})
  };
}

/** GET /api/me/admin-status — 当前用户是否为 openid 管理员 */
function meAdminStatusOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/admin-status',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** POST /api/admin/daily-puzzles — 创建残局（openid 管理员 Bearer + JSON body） */
function adminDailyPuzzleCreateOptions(bodyObj) {
  return {
    url: GOMOKU_API_BASE + '/api/admin/daily-puzzles',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify(bodyObj || {})
  };
}

/** GET /api/me/daily-puzzle/today */
function meDailyPuzzleTodayOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/daily-puzzle/today',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** POST /api/me/daily-puzzle/submit body: { moves: [{r,c,color},...] } */
function meDailyPuzzleSubmitOptions(movesArr) {
  return {
    url: GOMOKU_API_BASE + '/api/me/daily-puzzle/submit',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({ moves: movesArr || [] })
  };
}

/** POST /api/me/daily-puzzle/hint */
function meDailyPuzzleHintOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/daily-puzzle/hint',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: '{}'
  };
}

/** POST /api/me/puzzle-friend-room body: { board: number[][], sideToMove: 1|2 } */
function mePuzzleFriendRoomOptions(boardArr, sideToMove) {
  return {
    url: GOMOKU_API_BASE + '/api/me/puzzle-friend-room',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({
      board: boardArr,
      sideToMove: sideToMove
    })
  };
}

/** GET /api/me/game-history?limit=&offset=&result=：已结算对局列表；result 可选 WIN|LOSS */
function meGameHistoryOptions(limit, offset, result) {
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
  var q =
    GOMOKU_API_BASE +
    '/api/me/game-history?limit=' +
    encodeURIComponent(String(lim)) +
    '&offset=' +
    encodeURIComponent(String(off));
  if (result === 'WIN' || result === 'LOSS') {
    q += '&result=' + encodeURIComponent(result);
  }
  return {
    url: q,
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

/** POST /api/me/consumables/redeem：团团积分兑换消耗品（body: { kind: dagger }） */
function meConsumableRedeemOptions(kind) {
  return {
    url: GOMOKU_API_BASE + '/api/me/consumables/redeem',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({ kind: kind })
  };
}

/** POST /api/me/consumables/use：对局内使用消耗品（body: { kind: dagger }） */
function meConsumableUseOptions(kind) {
  return {
    url: GOMOKU_API_BASE + '/api/me/consumables/use',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({ kind: kind })
  };
}

/** POST /api/me/piece-skin：当前佩戴棋子皮肤写入数据库（body: { pieceSkinId }） */
function mePieceSkinSelectOptions(pieceSkinId) {
  return {
    url: GOMOKU_API_BASE + '/api/me/piece-skin',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({ pieceSkinId: pieceSkinId })
  };
}

/** POST /api/me/equip：按种类装备唯一一件（BOARD_SKILL / BOARD_SKILL_LOVE 卸下 itemId: off） */
function meEquipOptions(category, itemId) {
  return {
    url: GOMOKU_API_BASE + '/api/me/equip',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify({ category: category, itemId: itemId })
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
 * GET /api/rooms/{roomId}/spectators — 本房当前观战中的好友（须登录；玩家与观战者均可调）
 * 返回体：{ friends: FriendListItemDto[] }
 */
function roomSpectatorsOptions(roomId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/rooms/' +
      encodeURIComponent(String(roomId)) +
      '/spectators',
    method: 'GET',
    header: withAuthHeaders({}),
    dataType: 'json'
  };
}

/** GET /api/users/rating?userId=：按用户 id 查询公开天梯（需登录；战绩页点头像） */
function userRatingByUserIdOptions(userId) {
  var id =
    userId !== undefined && userId !== null ? Number(userId) : 0;
  return {
    url:
      GOMOKU_API_BASE +
      '/api/users/rating?userId=' +
      encodeURIComponent(String(id)),
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

/** GET /api/me/replay-study — 当前用户最新复盘存档 */
function meReplayStudyGetOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/replay-study',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/**
 * PUT /api/me/replay-study — 覆盖写入唯一复盘存档
 * body: { moves, replayStep, board, sideToMove, sourceGameId?, blackPieceSkinId?, whitePieceSkinId? }
 */
function meReplayStudyPutOptions(bodyObj) {
  return {
    url: GOMOKU_API_BASE + '/api/me/replay-study',
    method: 'PUT',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify(bodyObj || {})
  };
}

/** DELETE /api/me/replay-study — 清除当前用户复盘存档 */
function meReplayStudyDeleteOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/me/replay-study',
    method: 'DELETE',
    header: withAuthHeaders({})
  };
}

/** GET /api/rooms/chat/messages?roomId=&limit= 联机对局聊天记录 */
function roomChatMessagesOptions(roomId, limit) {
  var lim =
    limit !== undefined && limit !== null ? Number(limit) : 80;
  if (isNaN(lim) || lim < 1) {
    lim = 80;
  }
  return {
    url:
      GOMOKU_API_BASE +
      '/api/rooms/chat/messages?roomId=' +
      encodeURIComponent(roomId) +
      '&limit=' +
      encodeURIComponent(String(lim)),
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** POST /api/rooms/chat/reports body: { roomId, messageId, reason? } */
function roomChatReportOptions(bodyObj) {
  return {
    url: GOMOKU_API_BASE + '/api/rooms/chat/reports',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: JSON.stringify(bodyObj || {})
  };
}

/** GET /api/social/friend-status?userId= — 与对手的按钮态（好友 / 申请中 等） */
function socialFriendStatusOptions(peerUserId) {
  var id =
    peerUserId !== undefined && peerUserId !== null ? Number(peerUserId) : 0;
  return {
    url:
      GOMOKU_API_BASE +
      '/api/social/friend-status?userId=' +
      encodeURIComponent(String(id)),
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** POST /api/social/friend-requests body: { targetUserId } */
function socialFriendRequestCreateOptions(targetUserId) {
  return {
    url: GOMOKU_API_BASE + '/api/social/friend-requests',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    // 传对象；微信在 content-type 为 application/json 时会 JSON 序列化（勿再手动 stringify，否则部分环境请求体异常）
    data: { targetUserId: Number(targetUserId) }
  };
}

/** POST /api/social/friend-requests/{id}/accept */
function socialFriendRequestAcceptOptions(requestId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/social/friend-requests/' +
      encodeURIComponent(String(requestId)) +
      '/accept',
    method: 'POST',
    header: withAuthHeaders({})
  };
}

/** POST /api/social/friend-requests/{id}/reject */
function socialFriendRequestRejectOptions(requestId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/social/friend-requests/' +
      encodeURIComponent(String(requestId)) +
      '/reject',
    method: 'POST',
    header: withAuthHeaders({})
  };
}

/** GET /api/social/friends — 好友列表（最多 50，含在线状态） */
function socialFriendsListOptions() {
  return {
    url: GOMOKU_API_BASE + '/api/social/friends',
    method: 'GET',
    header: withAuthHeaders({})
  };
}

/** DELETE /api/social/friends/{peerUserId} */
function socialFriendDeleteOptions(peerUserId) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/social/friends/' +
      encodeURIComponent(String(peerUserId)),
    method: 'DELETE',
    header: withAuthHeaders({})
  };
}

/** PATCH /api/social/friends/{peerUserId}/remark body: { remark } */
function socialFriendRemarkOptions(peerUserId, remark) {
  return {
    url:
      GOMOKU_API_BASE +
      '/api/social/friends/' +
      encodeURIComponent(String(peerUserId)) +
      '/remark',
    method: 'PATCH',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: { remark: remark != null ? String(remark) : '' }
  };
}

/** POST /api/social/friend-messages body: { peerUserId, text } — 好友私聊（用户 WS 推送） */
function socialFriendSendMessageOptions(peerUserId, text) {
  return {
    url: GOMOKU_API_BASE + '/api/social/friend-messages',
    method: 'POST',
    header: withAuthHeaders({
      'content-type': 'application/json'
    }),
    data: {
      peerUserId: peerUserId != null ? Number(peerUserId) : 0,
      text: text != null ? String(text) : ''
    }
  };
}

/** 用户级 WS：/ws/user?sessionToken=（与 /ws/gomoku 并列） */
function userWebSocketUrl(sessionToken) {
  var token = sessionToken ? String(sessionToken) : '';
  return wsUrlFromApiBase() + '/ws/user?sessionToken=' + encodeURIComponent(token);
}

module.exports = {
  GOMOKU_API_BASE: GOMOKU_API_BASE,
  roomApiCreateOptions: roomApiCreateOptions,
  roomApiJoinOptions: roomApiJoinOptions,
  roomFriendWatchOptions: roomFriendWatchOptions,
  roomApiRandomMatchOptions: roomApiRandomMatchOptions,
  roomApiRandomMatchPairedOptions: roomApiRandomMatchPairedOptions,
  roomApiRandomMatchCancelOptions: roomApiRandomMatchCancelOptions,
  roomApiRandomMatchFallbackOptions: roomApiRandomMatchFallbackOptions,
  roomApiRandomBotProfileOptions: roomApiRandomBotProfileOptions,
  meRatingOptions: meRatingOptions,
  meShopCatalogOptions: meShopCatalogOptions,
  mePveGameOptions: mePveGameOptions,
  meAdminStatusOptions: meAdminStatusOptions,
  adminDailyPuzzleCreateOptions: adminDailyPuzzleCreateOptions,
  meDailyPuzzleTodayOptions: meDailyPuzzleTodayOptions,
  meDailyPuzzleSubmitOptions: meDailyPuzzleSubmitOptions,
  meDailyPuzzleHintOptions: meDailyPuzzleHintOptions,
  mePuzzleFriendRoomOptions: mePuzzleFriendRoomOptions,
  meGameHistoryOptions: meGameHistoryOptions,
  meCheckinOptions: meCheckinOptions,
  mePieceSkinRedeemOptions: mePieceSkinRedeemOptions,
  meConsumableRedeemOptions: meConsumableRedeemOptions,
  meConsumableUseOptions: meConsumableUseOptions,
  mePieceSkinSelectOptions: mePieceSkinSelectOptions,
  meEquipOptions: meEquipOptions,
  roomOpponentRatingOptions: roomOpponentRatingOptions,
  roomSpectatorsOptions: roomSpectatorsOptions,
  userRatingByUserIdOptions: userRatingByUserIdOptions,
  gameSettleOptions: gameSettleOptions,
  gameReplayByRoomOptions: gameReplayByRoomOptions,
  gameReplayByIdOptions: gameReplayByIdOptions,
  meReplayStudyGetOptions: meReplayStudyGetOptions,
  meReplayStudyPutOptions: meReplayStudyPutOptions,
  meReplayStudyDeleteOptions: meReplayStudyDeleteOptions,
  roomChatMessagesOptions: roomChatMessagesOptions,
  roomChatReportOptions: roomChatReportOptions,
  socialFriendStatusOptions: socialFriendStatusOptions,
  socialFriendRequestCreateOptions: socialFriendRequestCreateOptions,
  socialFriendRequestAcceptOptions: socialFriendRequestAcceptOptions,
  socialFriendRequestRejectOptions: socialFriendRequestRejectOptions,
  socialFriendsListOptions: socialFriendsListOptions,
  socialFriendDeleteOptions: socialFriendDeleteOptions,
  socialFriendRemarkOptions: socialFriendRemarkOptions,
  socialFriendSendMessageOptions: socialFriendSendMessageOptions,
  userWebSocketUrl: userWebSocketUrl,
  wsUrlFromApiBase: wsUrlFromApiBase
};
