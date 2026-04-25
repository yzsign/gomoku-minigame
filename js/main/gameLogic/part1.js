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

/** 落子音效（用户提供的围棋/五子棋落子素材，audio/place-stone-aigei.mp3） */
app.PLACE_STONE_SRC = 'audio/place-stone-aigei.mp3';
app.placeStoneAudio = null;
app.playPlaceStoneSound = function() {
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
    return;
  }
  try {
    if (!app.placeStoneAudio) {
      app.placeStoneAudio = wx.createInnerAudioContext();
      app.placeStoneAudio.src = app.PLACE_STONE_SRC;
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
/** 好友申请 POST 防重复点击（friend-request-social-spec §6.1） */
app.addFriendInFlight = false;
/** 胜负页「添加好友」按压态 */
app.ratingCardAddFriendPressed = false;
app.ratingCardAddFriendArmed = false;
app.ratingCardAddFriendTouchId = null;
app.ratingCardAddFriendTouchStartX = 0;
app.ratingCardAddFriendTouchStartY = 0;
app.clearRatingCardAddFriendTouch = function () {
  app.ratingCardAddFriendPressed = false;
  app.ratingCardAddFriendArmed = false;
  app.ratingCardAddFriendTouchId = null;
};

/** 每日签到：服务端 wxcloudrun-gomoku（POST /api/me/checkin）+ 画布弹窗 */
app.CHECKIN_DAILY_POINTS = 10;
app.checkinStateCache = null;
app.checkinModalVisible = false;
app.checkinModalData = null;

/** 是否已处理过「首次资料」询问（含用户点暂不） */
app.PROFILE_PROMPT_STORAGE_KEY = 'gomoku_profile_prompt_done';
/** 授权后写入，棋盘左下角展示「我」的昵称 */
app.LOCAL_NICKNAME_KEY = 'gomoku_local_nickname';
/**
 * 上次 wx.getUserProfile 成功时的 userInfo（JSON），用于再次点「同步」时 getUserProfile
 * 可能失败（微信对重复调用的限制）仍能静默登录并刷新服务端资料。
 */
app.WX_USER_PROFILE_CACHE_KEY = 'gomoku_wx_user_profile_json';
/** 避免每帧 draw 调用 getStorageSync（同步 IO 易卡顿） */
app.myDisplayNameCache = null;

app.saveCachedWeChatUserInfo = function(userInfo) {
  if (!userInfo || !userInfo.nickName) {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(
        app.WX_USER_PROFILE_CACHE_KEY,
        JSON.stringify({
          nickName: String(userInfo.nickName).trim(),
          avatarUrl:
            typeof userInfo.avatarUrl === 'string' ? userInfo.avatarUrl : '',
          gender: typeof userInfo.gender === 'number' ? userInfo.gender : 0
        })
      );
    }
  } catch (e) {}
};

app.readCachedWeChatUserInfo = function() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) {
      return null;
    }
    var raw = wx.getStorageSync(app.WX_USER_PROFILE_CACHE_KEY);
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    var o = JSON.parse(raw);
    if (!o || !o.nickName) {
      return null;
    }
    return {
      nickName: String(o.nickName).trim(),
      avatarUrl: typeof o.avatarUrl === 'string' ? o.avatarUrl : '',
      gender: typeof o.gender === 'number' ? o.gender : 0
    };
  } catch (e2) {
    return null;
  }
};

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
  if (app.isPvpOnline && app.onlineSpectatorMode) {
    /**
     * 残局好友房等好友进房：与每日残局一致，左侧仍展示「我」与本人头像；
     * 勿显示「旁观」，否则用户会感觉头像/身份被联机页替换。
     */
    if (
      app.onlinePuzzleFriendRoom &&
      typeof app.hasPuzzleFriendHumanGuest === 'function' &&
      !app.hasPuzzleFriendHumanGuest()
    ) {
      /* fall through to下方昵称与「我」 */
    } else {
      if (app.onlinePuzzleFriendRoom) {
        return '旁观';
      }
      /** PvP 好友观战：下方为所点好友，昵称来自 STATE black/white* */
      if (app.onlineFriendWatchPeerUserId != null) {
        var peerG = Number(app.onlineFriendWatchPeerUserId);
        if (
          app.onlineStateBlackUserId != null &&
          peerG === Number(app.onlineStateBlackUserId)
        ) {
          return (app.onlineStateBlackNickname && String(app.onlineStateBlackNickname).trim()) || '黑方';
        }
        if (
          app.onlineStateWhiteUserId != null &&
          peerG === Number(app.onlineStateWhiteUserId)
        ) {
          return (app.onlineStateWhiteNickname && String(app.onlineStateWhiteNickname).trim()) || '白方';
        }
      }
      return '旁观';
    }
  }
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
  if (
    app.isPvpOnline &&
    app.onlineSpectatorMode &&
    app.onlinePuzzleFriendRoom &&
    typeof app.hasPuzzleFriendHumanGuest === 'function' &&
    !app.hasPuzzleFriendHumanGuest()
  ) {
    return '电脑';
  }
  if (
    app.isPvpOnline &&
    app.onlineSpectatorMode &&
    !app.onlinePuzzleFriendRoom &&
    app.onlineFriendWatchPeerUserId != null
  ) {
    var peerH = Number(app.onlineFriendWatchPeerUserId);
    if (
      app.onlineStateBlackUserId != null &&
      peerH === Number(app.onlineStateBlackUserId) &&
      app.onlineStateWhiteUserId != null
    ) {
      return (app.onlineStateWhiteNickname && String(app.onlineStateWhiteNickname).trim()) || '白方';
    }
    if (
      app.onlineStateWhiteUserId != null &&
      peerH === Number(app.onlineStateWhiteUserId) &&
      app.onlineStateBlackUserId != null
    ) {
      return (app.onlineStateBlackNickname && String(app.onlineStateBlackNickname).trim()) || '黑方';
    }
  }
  if (
    app.isPvpOnline &&
    typeof app.isMyOnlineOpponentBot === 'function' &&
    app.isMyOnlineOpponentBot()
  ) {
    if (app.onlineOppNickname) {
      return app.onlineOppNickname;
    }
    return '电脑';
  }
  if (
    app.isPvpOnline &&
    app.onlineOpponentIsBot &&
    !app.isRandomMatch
  ) {
    if (app.onlineOppNickname) {
      return app.onlineOppNickname;
    }
    return '电脑';
  }
  if (app.isPvpOnline && app.onlineOppNickname) {
    return app.onlineOppNickname;
  }
  if (app.isPvpOnline) {
    return '对手';
  }
  if (app.isPvpLocal) {
    return '对方';
  }
  if (app.isDailyPuzzle) {
    return '电脑';
  }
  if (app.isRandomMatch) {
    return app.randomOpponentName || '对手';
  }
  return '电脑';
}

/**
 * 本局「我」在棋盘旁展示的执子色；联机取 pvpOnlineYourColor，其余取 pveHumanColor（含同桌）。
 */
app.getMyAssignedStoneColor = function() {
  if (app.isPvpOnline) {
    if (app.onlineSpectatorMode) {
      return null;
    }
    return app.pvpOnlineYourColor;
  }
  if (app.isDailyPuzzle) {
    return app.dailyPuzzleUserColor;
  }
  return app.pveHumanColor;
};

/** 每日残局：AI 守关方执子色 */
app.dailyPuzzleBotColor = function() {
  return app.oppositeColor(app.dailyPuzzleUserColor);
};

app.refreshDailyPuzzleLastOpponentMove = function() {
  app.lastOpponentMove = null;
  if (!app.dailyPuzzleMoves || app.dailyPuzzleMoves.length === 0) {
    return;
  }
  var bc = app.dailyPuzzleBotColor();
  var j;
  for (j = app.dailyPuzzleMoves.length - 1; j >= 0; j--) {
    if (app.dailyPuzzleMoves[j].color === bc) {
      app.lastOpponentMove = {
        r: app.dailyPuzzleMoves[j].r,
        c: app.dailyPuzzleMoves[j].c
      };
      return;
    }
  }
};

/** 对手执子色（与「我」相对） */
app.getOpponentAssignedStoneColor = function() {
  var mine = app.getMyAssignedStoneColor();
  if (mine === null) {
    return null;
  }
  return app.oppositeColor(mine);
};

/**
 * 联机：当前用户「棋盘对面」是否为电脑（非旁观）；用于头像、资料、文案等。
 * 随机匹配场景下固定为 false，界面与拉取资料与真人对局一致（底层仍可用 onlineOpponentIsBot / STATE 判断走子）。
 */
app.isMyOnlineOpponentBot = function() {
  if (!app.isPvpOnline || app.onlineSpectatorMode) {
    return false;
  }
  if (app.isRandomMatch) {
    return false;
  }
  var mine = app.pvpOnlineYourColor;
  if (mine === app.BLACK) {
    if (app.onlineWhiteIsBotFlag) {
      return true;
    }
  } else if (app.onlineBlackIsBotFlag) {
    return true;
  }
  return false;
};

/**
 * 技能栏不展示：仅单机人机对战（首页人机）与每日残局。联机（含对机器人）、同桌不因此隐藏。
 */
app.isVersusAiOpponentGame = function() {
  if (!app.screen || app.screen !== 'game') {
    return false;
  }
  if (app.isDailyPuzzle) {
    return true;
  }
  if (app.isPvpOnline || app.isPvpLocal) {
    return false;
  }
  return true;
};

app.syncOnlineOpponentProfileForBotSeat = function() {
  if (!app.isPvpOnline) {
    return;
  }
  if (typeof app.isMyOnlineOpponentBot !== 'function' || !app.isMyOnlineOpponentBot()) {
    return;
  }
  /**
   * 随机匹配超时接入的人机：昵称与头像由 /match/random/fallback-bot 或 STATE 前预置，
   * 不清空，避免仍显示「电脑」与占位头像。
   */
  if (app.isRandomMatch) {
    return;
  }
  app.onlineOppAvatarImg = null;
  app.onlineOppNickname = '';
  app.onlineOppUserId = 0;
  defaultAvatars.setOpponentGenderFromServer(null);
  app.onlineOppProfileFetched = false;
  app.onlineOppProfileRoomId = '';
};

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
 * 棋盘两侧头像几何（绘制与点击共用）
 */
app.computeBoardNameLabelLayout = function(layout) {
  var lay = layout || app.layout;
  if ((!lay || typeof lay.cell !== 'number') && typeof app.computeLayout === 'function') {
    lay = app.computeLayout();
  }
  if (!lay || typeof lay.cell !== 'number') {
    return null;
  }
  var r = app.getBoardOuterRect(lay);
  var pad = Math.max(8, lay.cell * 0.22);
  var maxW = r.bw * 0.48;
  var fontPx = Math.max(
    15,
    Math.min(20, Math.round(14 + lay.cell * 0.22))
  );
  var avR = Math.max(22, Math.min(44, Math.round(lay.cell * 0.64)));
  /** 头像圆与棋盘边至少留空，避免大头像压住格线（与 oppCy/myCy 推导一致） */
  var boardEdgePad = Math.max(6, app.rpx(8));
  var outerGap = Math.max(
    10,
    lay.cell * 0.34,
    avR - fontPx * 0.5 + boardEdgePad
  );
  var myImg = app.getMyAvatarImageForUi();
  var oppImg;
  /**
   * 好友观战（非残局房）：下为所点好友、上为其对手，头像与昵称来自 STATE black/white*，勿用本机与 opponent-rating。
   */
  if (
    app.isPvpOnline &&
    app.onlineSpectatorMode &&
    !app.onlinePuzzleFriendRoom
  ) {
    myImg = null;
    oppImg = null;
    var peerL = app.onlineFriendWatchPeerUserId;
    var bU = app.onlineStateBlackUserId;
    var wU = app.onlineStateWhiteUserId;
    if (bU != null) {
      if (peerL != null && wU != null && Number(peerL) === Number(bU)) {
        myImg = app.onlineWatchSeatBlackImg;
        oppImg = app.onlineWatchSeatWhiteImg;
      } else if (peerL != null && wU != null && Number(peerL) === Number(wU)) {
        myImg = app.onlineWatchSeatWhiteImg;
        oppImg = app.onlineWatchSeatBlackImg;
      } else {
        myImg = app.onlineWatchSeatBlackImg;
        oppImg = app.onlineWatchSeatWhiteImg;
      }
    } else {
      myImg = app.onlineWatchSeatBlackImg;
      oppImg = app.onlineWatchSeatWhiteImg;
    }
    if (!oppImg) {
      oppImg = defaultAvatars.getOpponentAvatarImage();
    }
    if (!myImg) {
      myImg = defaultAvatars.getMyAvatarImage();
    }
  } else if (
    app.isPvpOnline &&
    app.onlineSpectatorMode &&
    app.onlinePuzzleFriendRoom &&
    typeof app.hasPuzzleFriendHumanGuest === 'function' &&
    !app.hasPuzzleFriendHumanGuest()
  ) {
    oppImg = defaultAvatars.getGuardianBotAvatarImage();
    if (!oppImg) {
      oppImg = defaultAvatars.getOpponentAvatarImage();
    }
  } else if (app.isDailyPuzzle) {
    oppImg = defaultAvatars.getGuardianBotAvatarImage();
    if (!oppImg) {
      oppImg = defaultAvatars.getOpponentAvatarImage();
    }
  } else if (
    app.isPvpOnline &&
    typeof app.isMyOnlineOpponentBot === 'function' &&
    app.isMyOnlineOpponentBot()
  ) {
    /** 须先于网络头像分支：机器人账号也可能有 avatarUrl，避免与守关图来回切 */
    if (app.isRandomMatch) {
      if (
        app.onlineOppAvatarImg &&
        app.onlineOppAvatarImg.width &&
        app.onlineOppAvatarImg.height
      ) {
        oppImg = app.onlineOppAvatarImg;
      } else {
        /** 随机匹配人机：数据库头像未解码前用性别默认 */
        oppImg = defaultAvatars.getOpponentAvatarImage();
      }
    } else {
      oppImg = defaultAvatars.getGuardianBotAvatarImage();
      if (!oppImg) {
        oppImg = defaultAvatars.getOpponentAvatarImage();
      }
    }
  } else if (
    app.isPvpOnline &&
    app.onlineOppAvatarImg &&
    app.onlineOppAvatarImg.width &&
    app.onlineOppAvatarImg.height
  ) {
    oppImg = app.onlineOppAvatarImg;
  } else if (app.isPvpLocal) {
    oppImg = defaultAvatars.getOpponentAvatarImage();
  } else if (!app.isPvpOnline) {
    /** 人机对战（非同桌）；随机匹配接入本地人机时不使用守关头像 */
    if (app.isRandomMatch) {
      if (
        app.onlineOppAvatarImg &&
        app.onlineOppAvatarImg.width &&
        app.onlineOppAvatarImg.height
      ) {
        oppImg = app.onlineOppAvatarImg;
      } else {
        oppImg = defaultAvatars.getOpponentAvatarImage();
      }
    } else {
      oppImg = defaultAvatars.getGuardianBotAvatarImage();
      if (!oppImg) {
        oppImg = defaultAvatars.getOpponentAvatarImage();
      }
    }
  } else {
    oppImg = defaultAvatars.getOnlineOpponentDefaultAvatarImage();
  }
  /** 有 Image 对象即预留头像位并在圆内绘制（未解码完时 drawCircleAvatar 走占位字） */
  var hasMyAv = !!myImg;
  var hasOppAv = !!oppImg;
  var textTop = r.by + r.bh + outerGap;
  var myNameExtra = hasMyAv ? 2 * avR + 6 : 0;
  var myTextX = r.bx + pad + myNameExtra;
  var oppNameExtra = hasOppAv ? 2 * avR + 6 : 0;
  var oppNameRightX = r.bx + r.bw - pad - oppNameExtra;
  var myCx = r.bx + pad + avR;
  var myCy = textTop + fontPx * 0.5;
  var oppCx = r.bx + r.bw - pad - avR;
  var oppCy = r.by - outerGap - fontPx * 0.5;
  /**
   * Q/W 各自依赖装备：短剑→Q、爱心→W；可只装其一。E/R 不展示。库存为 0 仍展示（角标为 0）。
   * 对手条：标题/局时区下方（topBar 起算）；己方条：底栏「离开/悔棋…」上方（红框区域）。
   */
  var daggerEquipped =
    themes &&
    typeof themes.isDaggerSkillEquipped === 'function' &&
    themes.isDaggerSkillEquipped();
  var loveEquipped =
    themes &&
    typeof themes.isLoveSkillEquipped === 'function' &&
    themes.isLoveSkillEquipped();
  if (
    typeof app.isVersusAiOpponentGame === 'function' &&
    app.isVersusAiOpponentGame()
  ) {
    daggerEquipped = false;
    loveEquipped = false;
  }
  if (app.onlineSpectatorMode) {
    daggerEquipped = false;
    loveEquipped = false;
  }
  var propKeys = [];
  var propSlots = [];
  if (daggerEquipped) {
    propKeys.push('border');
    propSlots.push('Q');
  }
  if (loveEquipped) {
    propKeys.push('love');
    propSlots.push('W');
  }
  var numItems = propKeys.length;
  var itemGap = app.rpx(10);
  var itemSize = Math.max(44, Math.min(70, Math.round(avR * 0.92)));
  var propPanelW =
    numItems === 0 ? 0 : numItems * itemSize + (numItems - 1) * itemGap;
  var propPanelH = numItems === 0 ? 0 : itemSize;
  var propMargin = app.rpx(16);
  var maxPanelW = app.W - 2 * propMargin;
  if (numItems > 0 && propPanelW > maxPanelW) {
    itemSize = Math.max(
      36,
      Math.floor((maxPanelW - (numItems - 1) * itemGap) / numItems)
    );
    propPanelW = numItems * itemSize + (numItems - 1) * itemGap;
    propPanelH = itemSize;
  }
  function buildPropPanel(panelLeft, panelTop) {
    if (numItems === 0) {
      return null;
    }
    var items = [];
    var pi;
    for (pi = 0; pi < numItems; pi++) {
      items.push({
        key: propKeys[pi],
        slotLetter: propSlots[pi],
        left: panelLeft + pi * (itemSize + itemGap),
        top: panelTop,
        w: itemSize,
        h: itemSize
      });
    }
    return {
      left: panelLeft,
      top: panelTop,
      w: propPanelW,
      h: propPanelH,
      btnRadius: Math.max(6, app.rpx(8)),
      items: items
    };
  }
  var safeBottom = 0;
  if (
    app.sys &&
    app.sys.safeArea &&
    typeof app.sys.safeArea.bottom === 'number'
  ) {
    safeBottom = Math.max(0, app.H - app.sys.safeArea.bottom);
  }
  var barH =
    lay.bottomY != null
      ? 2 * (app.H - safeBottom - lay.bottomY)
      : 0;
  if (!(barH > 0 && barH < app.H * 0.4)) {
    barH = (app.W * (app.GAME_ACTION_BAR_H_RPX != null ? app.GAME_ACTION_BAR_H_RPX : 128)) / 750;
  }
  var stripGap = app.rpx(10);
  var topBarReserve = lay.topBar != null ? lay.topBar : app.rpx(88);
  /** 对手条：优先在标题/局时区下（与截图上区一致）；放不下时再贴棋盘顶缘上方（仅在有技能格时占位） */
  var underHeader = topBarReserve + app.rpx(8);
  var aboveBoard = r.by - propPanelH - stripGap;
  var oppPropTop =
    numItems === 0
      ? underHeader
      : underHeader + propPanelH <= r.by - stripGap
        ? underHeader
        : Math.max(topBarReserve + app.rpx(4), aboveBoard);
  /** 己方条：底栏「离开/悔棋…」正上方；不与本人头像、底栏重叠 */
  var barTop = app.H - safeBottom - barH;
  var myPropTop = barTop - stripGap - propPanelH;
  var myAvBottom = myCy + avR + app.rpx(8);
  if (numItems > 0) {
    if (myPropTop < myAvBottom) {
      myPropTop = myAvBottom;
    }
    if (myPropTop + propPanelH > barTop - stripGap) {
      myPropTop = Math.max(myAvBottom, barTop - stripGap - propPanelH);
    }
  }
  var propCenterLeft = (app.W - propPanelW) * 0.5;
  var myPropPanel = buildPropPanel(propCenterLeft, myPropTop);
  var oppPropPanel = buildPropPanel(propCenterLeft, oppPropTop);
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
    myTextX: myTextX,
    myCx: myCx,
    /** 本人头像圆心纵坐标 */
    myCy: myCy,
    oppNameRightX: oppNameRightX,
    oppCx: oppCx,
    /** 对手头像圆心纵坐标 */
    oppCy: oppCy,
    myPropPanel: myPropPanel,
    oppPropPanel: oppPropPanel
  };
}

/**
 * 头像右下角执子徽章：扁平圆点 + 描边，不抢头像主体，层次比盘面立体子更轻。
 */
app.drawAvatarStoneBadge = function(ctx, cxAvatar, cyAvatar, avR, stoneColor, th) {
  var isBlack = stoneColor === app.BLACK;
  var ink = th && th.id === 'ink';
  var k = 0.68;
  var bx = cxAvatar + avR * 0.707 * k;
  var by = cyAvatar + avR * 0.707 * k;
  var br = Math.max(5, Math.min(10, avR * 0.30));
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(bx, by, br + Math.max(0.8, app.rpx(1.2)), 0, Math.PI * 2);
  ctx.fillStyle = ink ? 'rgba(18,18,22,0.92)' : 'rgba(255,252,248,0.96)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  if (isBlack) {
    var g = ctx.createRadialGradient(
      bx - br * 0.35,
      by - br * 0.35,
      0,
      bx,
      by,
      br
    );
    g.addColorStop(0, ink ? '#3d3d48' : '#353540');
    g.addColorStop(1, ink ? '#1a1a22' : '#121218');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = ink ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.94)';
    ctx.lineWidth = Math.max(1.1, app.rpx(2.2));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx - br * 0.28, by - br * 0.28, br * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  } else {
    var g2 = ctx.createRadialGradient(
      bx + br * 0.25,
      by - br * 0.3,
      0,
      bx,
      by,
      br
    );
    g2.addColorStop(0, ink ? '#f5f3f0' : '#ffffff');
    g2.addColorStop(1, ink ? '#dcd8d2' : '#ebe6df');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.strokeStyle = ink ? 'rgba(70,65,60,0.42)' : 'rgba(55,48,42,0.36)';
    ctx.lineWidth = Math.max(1, app.rpx(2));
    ctx.stroke();
  }
  ctx.restore();
};

app.drawBoardNameLabels = function(ctx, layout, th) {
  var L = app.computeBoardNameLabelLayout(layout);
  if (!L || !L.r) {
    return;
  }
  th = th || (typeof app.getUiTheme === 'function' ? app.getUiTheme() : {});
  ctx.save();
  var strikePair = null;
  var oppSkillFx = null;
  var myStrikeFx = null;
  try {
    if (typeof app.getAvatarBoardSkillStrikeAvatarFrameFx === 'function') {
      try {
        strikePair = app.getAvatarBoardSkillStrikeAvatarFrameFx(layout);
      } catch (eStrike) {
        strikePair = null;
      }
    }
    if (
      strikePair &&
      typeof strikePair.forSide === 'string' &&
      !('my' in strikePair) &&
      !('opp' in strikePair)
    ) {
      var leg0 = strikePair;
      strikePair = {
        my: leg0.forSide === 'my' ? leg0 : null,
        opp: leg0.forSide === 'opp' ? leg0 : null
      };
    }
    oppSkillFx = strikePair && strikePair.opp ? strikePair.opp : null;
    myStrikeFx = strikePair && strikePair.my ? strikePair.my : null;
    /** 对手：棋盘右上角外侧；无网络图时用服务端性别或「与本人相反」默认 */
    if (L.hasOppAv) {
    ctx.save();
    if (oppSkillFx) {
      var oxs = oppSkillFx.scale;
      if (typeof oxs === 'number' && isFinite(oxs) && oxs > 0.001) {
        ctx.translate(oppSkillFx.dx, oppSkillFx.dy);
        ctx.translate(oppSkillFx.cx, oppSkillFx.cy);
        ctx.scale(oxs, oxs);
        ctx.translate(-oppSkillFx.cx, -oppSkillFx.cy);
      } else {
        ctx.translate(oppSkillFx.dx, oppSkillFx.dy);
      }
    }
    if (
      L.oppImg === defaultAvatars.getGuardianBotAvatarImage() &&
      L.oppImg &&
      typeof defaultAvatars.drawGuardianBotCircleAvatar === 'function'
    ) {
      /** 未解码时 drawGuardianBotCircleAvatar 内为中性占位，不展示男/女默认图 */
      defaultAvatars.drawGuardianBotCircleAvatar(
        ctx,
        L.oppImg,
        L.oppCx,
        L.oppCy,
        L.avR,
        th,
        0.88
      );
    } else {
      defaultAvatars.drawCircleAvatar(
        ctx,
        L.oppImg,
        L.oppCx,
        L.oppCy,
        L.avR,
        th
      );
    }
    if (typeof app.drawOnlineTurnClockRingBeforeBadge === 'function') {
      app.drawOnlineTurnClockRingBeforeBadge(
        ctx,
        L.oppCx,
        L.oppCy,
        L.avR,
        th,
        false
      );
    }
    if (!app.onlineSpectatorMode) {
      app.drawAvatarStoneBadge(
        ctx,
        L.oppCx,
        L.oppCy,
        L.avR,
        app.getOpponentAssignedStoneColor(),
        th
      );
    }
    if (
      oppSkillFx &&
      oppSkillFx.extraRing &&
      oppSkillFx.extraRing.alpha > 0.012
    ) {
      var or = oppSkillFx.extraRing;
      var ringPad = app.rpx(or.padRpx != null ? or.padRpx : 2);
      var ringLw = Math.max(1.1, app.rpx(or.lineRpx != null ? or.lineRpx : 2.2));
      var sc = oppSkillFx.scale > 0.001 ? oppSkillFx.scale : 1;
      var gMul = or.glow != null ? or.glow : 0;
      var loveRingOpp = or.tint === 'love';
      ctx.save();
      ctx.shadowColor = loveRingOpp
        ? 'rgba(255, 90, 130, ' + 0.38 * gMul + ')'
        : 'rgba(255, 165, 85, ' + 0.42 * gMul + ')';
      ctx.shadowBlur = app.rpx(11) * gMul;
      ctx.beginPath();
      ctx.arc(
        L.oppCx,
        L.oppCy,
        L.avR + ringPad,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = loveRingOpp
        ? 'rgba(255, 160, 185, ' + or.alpha + ')'
        : 'rgba(255, 210, 155, ' + or.alpha + ')';
      ctx.lineWidth = ringLw / sc;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  /** 我：棋盘左下角外侧；无网络图时用服务端 users.gender 对应默认 */
  if (L.hasMyAv) {
    ctx.save();
    if (myStrikeFx) {
      var mxs = myStrikeFx.scale;
      if (typeof mxs === 'number' && isFinite(mxs) && mxs > 0.001) {
        ctx.translate(myStrikeFx.dx, myStrikeFx.dy);
        ctx.translate(myStrikeFx.cx, myStrikeFx.cy);
        ctx.scale(mxs, mxs);
        ctx.translate(-myStrikeFx.cx, -myStrikeFx.cy);
      } else {
        ctx.translate(myStrikeFx.dx, myStrikeFx.dy);
      }
    }
    defaultAvatars.drawCircleAvatar(
      ctx,
      L.myImg,
      L.myCx,
      L.myCy,
      L.avR,
      th
    );
    if (typeof app.drawOnlineTurnClockRingBeforeBadge === 'function') {
      app.drawOnlineTurnClockRingBeforeBadge(
        ctx,
        L.myCx,
        L.myCy,
        L.avR,
        th,
        true
      );
    }
    if (!app.onlineSpectatorMode) {
      app.drawAvatarStoneBadge(
        ctx,
        L.myCx,
        L.myCy,
        L.avR,
        app.getMyAssignedStoneColor(),
        th
      );
    }
    if (
      myStrikeFx &&
      myStrikeFx.extraRing &&
      myStrikeFx.extraRing.alpha > 0.012
    ) {
      var mr = myStrikeFx.extraRing;
      var myRingPad = app.rpx(mr.padRpx != null ? mr.padRpx : 2);
      var myRingLw = Math.max(1.1, app.rpx(mr.lineRpx != null ? mr.lineRpx : 2.2));
      var mySc = myStrikeFx.scale > 0.001 ? myStrikeFx.scale : 1;
      var myGMul = mr.glow != null ? mr.glow : 0;
      var loveRingMy = mr.tint === 'love';
      ctx.save();
      ctx.shadowColor = loveRingMy
        ? 'rgba(255, 90, 130, ' + 0.38 * myGMul + ')'
        : 'rgba(255, 165, 85, ' + 0.42 * myGMul + ')';
      ctx.shadowBlur = app.rpx(11) * myGMul;
      ctx.beginPath();
      ctx.arc(L.myCx, L.myCy, L.avR + myRingPad, 0, Math.PI * 2);
      ctx.strokeStyle = loveRingMy
        ? 'rgba(255, 160, 185, ' + mr.alpha + ')'
        : 'rgba(255, 210, 155, ' + mr.alpha + ')';
      ctx.lineWidth = myRingLw / mySc;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  } catch (eDrawNames) {
  } finally {
    ctx.restore();
  }
};

/**
 * 对局头像旁 Q/W/E/R：与当前界面风格（檀木 / 青瓷 / 水墨）一致，同源 {@link shopModalUiFromTheme} 卡面色与主色描边。
 */
app.getPropBarUiColors = function(th) {
  th = th || (typeof app.getUiTheme === 'function' ? app.getUiTheme() : {});
  var id = th.id || 'classic';
  var primary = th.btnPrimary || '#5C4738';
  var title = th.title || '#2c2620';
  var S =
    typeof app.shopModalUiFromTheme === 'function'
      ? app.shopModalUiFromTheme(th)
      : null;
  if (S) {
    return {
      btnInnerG0: S.cardG0,
      btnInnerG1: S.cardG1,
      btnIdleBorder: S.stroke,
      btnOnBorder: S.focusStroke || primary,
      btnLetter: title,
      pressShadow: S.focusShadow
    };
  }
  if (id === 'mint') {
    return {
      btnInnerG0: 'rgba(255, 255, 255, 0.94)',
      btnInnerG1: 'rgba(225, 241, 237, 0.95)',
      btnIdleBorder: 'rgba(46, 117, 134, 0.32)',
      btnOnBorder: primary,
      btnLetter: '#143942',
      pressShadow: 'rgba(31, 86, 100, 0.28)'
    };
  }
  if (id === 'ink') {
    return {
      btnInnerG0: 'rgba(255, 252, 248, 0.97)',
      btnInnerG1: 'rgba(236, 228, 218, 0.95)',
      btnIdleBorder: 'rgba(74, 66, 58, 0.36)',
      btnOnBorder: primary,
      btnLetter: '#242018',
      pressShadow: 'rgba(34, 28, 24, 0.24)'
    };
  }
  return {
    btnInnerG0: '#fffefb',
    btnInnerG1: '#f5f1eb',
    btnIdleBorder: 'rgba(200, 188, 172, 0.85)',
    btnOnBorder: primary,
    btnLetter: title,
    pressShadow: 'rgba(224, 124, 46, 0.28)'
  };
};

app.shouldShowAvatarPropBar = function() {
  if (app.screen !== 'game' || app.gameOver) {
    return false;
  }
  if (app.onlineSpectatorMode) {
    return false;
  }
  if (app.showResultOverlay && (app.gameOver || app.onlineResultOverlaySticky)) {
    return false;
  }
  if (
    typeof app.isOnlineFriendMatchNotStarted === 'function' &&
    app.isOnlineFriendMatchNotStarted()
  ) {
    return false;
  }
  if (
    typeof app.isVersusAiOpponentGame === 'function' &&
    app.isVersusAiOpponentGame()
  ) {
    return false;
  }
  return true;
};

/**
 * 联机对局拉取 GET /api/me/rating，同步 consumableLoveCount / consumableDaggerCount 与 Q/W 装备（好友房与随机匹配一致）。
 * 由 WebSocket onOpen 尽早触发，避免仅依赖头像道具栏首帧绘制时的竞态。
 */
app.syncConsumableBoardSkillsFromServerForOnlineGameIfNeeded = function() {
  if (
    !app.isPvpOnline ||
    !authApi.getSessionToken ||
    !authApi.getSessionToken() ||
    app._consumableCountsSyncedThisGame ||
    !roomApi ||
    typeof roomApi.meRatingOptions !== 'function' ||
    typeof app.syncCheckinStateFromServerPayload !== 'function' ||
    typeof wx === 'undefined' ||
    !wx.request
  ) {
    return;
  }
  app._consumableCountsSyncedThisGame = true;
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
      success: function(res) {
        if (res.statusCode !== 200 || !res.data) {
          app._consumableCountsSyncedThisGame = false;
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
        if (d) {
          app.syncCheckinStateFromServerPayload(d);
          if (typeof app.applyMyGenderFromRatingPayload === 'function') {
            app.applyMyGenderFromRatingPayload(d);
          }
        }
        if (typeof app.draw === 'function') {
          app.draw();
        }
      },
      fail: function() {
        app._consumableCountsSyncedThisGame = false;
      }
    })
  );
};

app.drawBoardAvatarPropPanels = function(ctx, layout, th) {
  if (!app.shouldShowAvatarPropBar()) {
    return;
  }
  if (typeof app.syncConsumableBoardSkillsFromServerForOnlineGameIfNeeded === 'function') {
    app.syncConsumableBoardSkillsFromServerForOnlineGameIfNeeded();
  }
  var L = app.computeBoardNameLabelLayout(layout);
  if (!L || !L.myPropPanel) {
    return;
  }
  /** 仅绘制己方 Q/W/E/R，不显示对手技能栏 */
  if (!L.hasMyAv) {
    return;
  }
  th = th || (typeof app.getUiTheme === 'function' ? app.getUiTheme() : {});
  var pc =
    typeof app.getPropBarUiColors === 'function'
      ? app.getPropBarUiColors(th)
      : app.getPropBarUiColors({});

  function rrPath(c, x, y, w, h, rad) {
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }

  if (typeof app.prepareAvatarBoardSkillPanelImages === 'function') {
    app.prepareAvatarBoardSkillPanelImages();
  }

  function drawOnePanel(panel, side) {
    var slotR = Math.max(6, app.rpx(8));
    var letterFs = Math.max(16, Math.round(panel.items[0].h * 0.42));
    var pulse =
      side === 'my' ? app.avatarPropPressPulseMy : app.avatarPropPressPulseOpp;
    var it;
    ctx.save();
    for (it = 0; it < panel.items.length; it++) {
      var itm = panel.items[it];
      var isPressVis =
        pulse &&
        pulse.key === itm.key &&
        pulse.until != null &&
        Date.now() < pulse.until;

      ctx.save();
      if (isPressVis) {
        ctx.shadowColor = pc.pressShadow || 'rgba(92, 71, 56, 0.22)';
        ctx.shadowBlur = app.rpx(10);
      }
      rrPath(ctx, itm.left, itm.top, itm.w, itm.h, slotR);
      var lg = ctx.createLinearGradient(
        itm.left,
        itm.top,
        itm.left + itm.w,
        itm.top + itm.h
      );
      lg.addColorStop(0, pc.btnInnerG0 || '#fffefb');
      lg.addColorStop(1, pc.btnInnerG1 || '#f5f1eb');
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isPressVis ? pc.btnOnBorder || th.btnPrimary : pc.btnIdleBorder;
      ctx.lineWidth = isPressVis ? Math.max(2, app.rpx(2)) : 1;
      ctx.stroke();
      ctx.restore();

      var skillDef =
        typeof app.getAvatarBoardSkillDef === 'function'
          ? app.getAvatarBoardSkillDef(itm.key)
          : null;
      var skillImg =
        skillDef && skillDef.iconSrc && typeof app.getAvatarBoardSkillImageIfReady === 'function'
          ? app.getAvatarBoardSkillImageIfReady(skillDef.iconSrc)
          : null;
      if (skillDef && skillDef.iconSrc && skillImg && skillImg.width && skillImg.height) {
        var slotScale =
          skillDef.slotIcon && skillDef.slotIcon.scaleInSlot != null
            ? skillDef.slotIcon.scaleInSlot
            : 0.55;
        var iconM = Math.min(itm.w, itm.h) * slotScale;
        var iconW = iconM;
        var iconH = (skillImg.height / skillImg.width) * iconW;
        var cx = itm.left + itm.w * 0.5;
        var cy = itm.top + itm.h * 0.5;
        var slotRot =
          typeof app.getAvatarBoardSkillBladeRotationRad === 'function'
            ? app.getAvatarBoardSkillBladeRotationRad(layout, skillDef)
            : Math.PI / 6;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(slotRot);
        ctx.drawImage(skillImg, -iconW * 0.5, -iconH * 0.5, iconW, iconH);
        ctx.restore();
      } else {
        ctx.font =
          '700 ' +
          letterFs +
          'px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = pc.btnLetter || th.title || '#2c2620';
        ctx.fillText(
          itm.slotLetter || '?',
          itm.left + itm.w * 0.5,
          itm.top + itm.h * 0.5
        );
      }
      if (
        side === 'my' &&
        typeof app.getAvatarBoardSkillCooldownRemainMs === 'function'
      ) {
        var cdRem = app.getAvatarBoardSkillCooldownRemainMs('my', itm.key);
        if (cdRem > 0) {
          ctx.save();
          rrPath(ctx, itm.left, itm.top, itm.w, itm.h, slotR);
          ctx.fillStyle = 'rgba(22, 18, 16, 0.48)';
          ctx.fill();
          ctx.font =
            '700 ' +
            Math.max(12, Math.round(Math.min(itm.w, itm.h) * 0.34)) +
            'px "PingFang SC","Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255, 248, 240, 0.95)';
          /** 不足 1s 的冷却须显示小数；ceil(cdRem/1000) 会把 200ms 显示成「1」造成误解 */
          var cdLabel =
            cdRem < 1000
              ? (cdRem / 1000).toFixed(1)
              : String(Math.ceil(cdRem / 1000));
          ctx.fillText(
            cdLabel,
            itm.left + itm.w * 0.5,
            itm.top + itm.h * 0.52
          );
          ctx.restore();
        }
      }
      if (side === 'my' && itm.key === 'border' && themes && typeof themes.getConsumableDaggerCount === 'function') {
        var invRaw = themes.getConsumableDaggerCount();
        var invN = Math.max(0, Math.floor(Number(invRaw) || 0));
        var invLabel = invN > 99 ? '99+' : String(invN);
        var bPadR = Math.max(3, app.rpx(4));
        var bPadB = Math.max(2, app.rpx(3));
        var bFs = Math.max(10, Math.round(Math.min(itm.w, itm.h) * 0.24));
        ctx.save();
        ctx.font =
          '700 ' +
          bFs +
          'px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        var tx = itm.left + itm.w - bPadR;
        var ty = itm.top + itm.h - bPadB;
        var ink = th.id === 'ink';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, app.rpx(2.2));
        ctx.strokeStyle = ink
          ? 'rgba(255, 252, 248, 0.92)'
          : 'rgba(255, 252, 248, 0.94)';
        ctx.strokeText(invLabel, tx, ty);
        ctx.fillStyle = pc.btnLetter || th.title || '#2c2620';
        ctx.fillText(invLabel, tx, ty);
        ctx.restore();
      }
      if (side === 'my' && itm.key === 'love' && themes && typeof themes.getConsumableLoveCount === 'function') {
        var invLove = themes.getConsumableLoveCount();
        var invN2 = Math.max(0, Math.floor(Number(invLove) || 0));
        var invLabel2 = invN2 > 99 ? '99+' : String(invN2);
        var bPadR2 = Math.max(3, app.rpx(4));
        var bPadB2 = Math.max(2, app.rpx(3));
        var bFs2 = Math.max(10, Math.round(Math.min(itm.w, itm.h) * 0.24));
        ctx.save();
        ctx.font =
          '700 ' +
          bFs2 +
          'px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        var tx2 = itm.left + itm.w - bPadR2;
        var ty2 = itm.top + itm.h - bPadB2;
        var ink2 = th.id === 'ink';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, app.rpx(2.2));
        ctx.strokeStyle = ink2
          ? 'rgba(255, 252, 248, 0.92)'
          : 'rgba(255, 252, 248, 0.94)';
        ctx.strokeText(invLabel2, tx2, ty2);
        ctx.fillStyle = pc.btnLetter || th.title || '#2c2620';
        ctx.fillText(invLabel2, tx2, ty2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawOnePanel(L.myPropPanel, 'my');
};

app.hitAvatarPropPanel = function(clientX, clientY) {
  if (!app.shouldShowAvatarPropBar()) {
    return null;
  }
  var L = app.computeBoardNameLabelLayout(app.layout);
  if (!L || !L.myPropPanel) {
    return null;
  }
  function inRect(x, y, rect) {
    return (
      x >= rect.left &&
      x <= rect.left + rect.w &&
      y >= rect.top &&
      y <= rect.top + rect.h
    );
  }
  var i;
  if (!L.hasMyAv) {
    return null;
  }
  for (i = 0; i < L.myPropPanel.items.length; i++) {
    if (inRect(clientX, clientY, L.myPropPanel.items[i])) {
      return { side: 'my', key: L.myPropPanel.items[i].key };
    }
  }
  return null;
};

/** 点击 Q/W/E/R 后短时高亮（无技能逻辑）；约 280ms */
app.AVATAR_PROP_PRESS_MS = 280;

app.clearAvatarPropPressVisual = function() {
  if (typeof app.clearAvatarBoardSkillVfx === 'function') {
    app.clearAvatarBoardSkillVfx();
  }
  if (typeof app.clearAvatarBoardSkillCooldowns === 'function') {
    app.clearAvatarBoardSkillCooldowns();
  }
  app.avatarPropPressPulseMy = null;
  app.avatarPropPressPulseOpp = null;
  if (app._avatarPropPressTmrMy) {
    try {
      clearTimeout(app._avatarPropPressTmrMy);
    } catch (eM) {}
    app._avatarPropPressTmrMy = null;
  }
  if (app._avatarPropPressTmrOpp) {
    try {
      clearTimeout(app._avatarPropPressTmrOpp);
    } catch (eO) {}
    app._avatarPropPressTmrOpp = null;
  }
};

app.flashAvatarPropKeyPress = function(side, key) {
  var started = false;
  if (typeof app.startAvatarBoardSkillFromPanelKey === 'function') {
    started = !!app.startAvatarBoardSkillFromPanelKey(side, key);
  }
  if (
    !started &&
    side === 'my' &&
    typeof app.isAvatarBoardSkillOnCooldown === 'function' &&
    app.isAvatarBoardSkillOnCooldown(side, key)
  ) {
    return;
  }
  if (!started && side === 'my' && key === 'border' && app._consumableDaggerUseInFlight) {
    return;
  }
  if (!started && side === 'my' && key === 'love' && app._consumableLoveUseInFlight) {
    return;
  }
  var pulseName = side === 'my' ? 'avatarPropPressPulseMy' : 'avatarPropPressPulseOpp';
  var tmrName = side === 'my' ? '_avatarPropPressTmrMy' : '_avatarPropPressTmrOpp';
  var dur = app.AVATAR_PROP_PRESS_MS != null ? app.AVATAR_PROP_PRESS_MS : 280;
  app[pulseName] = { key: key, until: Date.now() + dur };
  if (app[tmrName]) {
    try {
      clearTimeout(app[tmrName]);
    } catch (eT) {}
  }
  var self = app;
  app[tmrName] = setTimeout(function() {
    app[tmrName] = null;
    app[pulseName] = null;
    if (typeof self.draw === 'function') {
      self.draw();
    }
  }, dur + 20);
  if (typeof app.draw === 'function') {
    app.draw();
  }
};

app.clearOnlineChatAvatarBubbleState = function() {
  if (app._onlineChatAvatarBubbleMyTmr) {
    try {
      clearTimeout(app._onlineChatAvatarBubbleMyTmr);
    } catch (eM) {}
    app._onlineChatAvatarBubbleMyTmr = null;
  }
  if (app._onlineChatAvatarBubbleOppTmr) {
    try {
      clearTimeout(app._onlineChatAvatarBubbleOppTmr);
    } catch (eO) {}
    app._onlineChatAvatarBubbleOppTmr = null;
  }
  app.onlineChatAvatarBubble = null;
};

/**
 * 收到 WS CHAT 后在发送方 / 接收方头像旁展示短时气泡（非旁观模式）
 */
app.applyOnlineChatAvatarBubble = function(data) {
  if (!app.isPvpOnline || app.onlineSpectatorMode) {
    return;
  }
  if (!data || data.senderColor == null) {
    return;
  }
  var k = (data.kind || 'TEXT').toUpperCase();
  var text = data.text != null ? String(data.text) : '';
  if (!text.trim()) {
    return;
  }
  var mine = data.senderColor === app.pvpOnlineYourColor;
  var dur = 5200;
  app.onlineChatAvatarBubble = app.onlineChatAvatarBubble || {};
  var row = { text: text, until: Date.now() + dur, kind: k };
  if (mine) {
    app.onlineChatAvatarBubble.my = row;
    if (app._onlineChatAvatarBubbleMyTmr) {
      try {
        clearTimeout(app._onlineChatAvatarBubbleMyTmr);
      } catch (e1) {}
    }
    app._onlineChatAvatarBubbleMyTmr = setTimeout(function() {
      app._onlineChatAvatarBubbleMyTmr = null;
      if (app.onlineChatAvatarBubble && app.onlineChatAvatarBubble.my) {
        app.onlineChatAvatarBubble.my = null;
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }, dur);
  } else {
    app.onlineChatAvatarBubble.opp = row;
    if (app._onlineChatAvatarBubbleOppTmr) {
      try {
        clearTimeout(app._onlineChatAvatarBubbleOppTmr);
      } catch (e2) {}
    }
    app._onlineChatAvatarBubbleOppTmr = setTimeout(function() {
      app._onlineChatAvatarBubbleOppTmr = null;
      if (app.onlineChatAvatarBubble && app.onlineChatAvatarBubble.opp) {
        app.onlineChatAvatarBubble.opp = null;
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }, dur);
  }
};

/**
 * 在棋盘两侧头像旁绘制联机聊天气泡（在 drawBoardNameLabels 之后调用）
 */
app.drawOnlineAvatarChatBubbles = function(ctx, layout, th) {
  if (!app.isPvpOnline || app.onlineSpectatorMode || !app.onlineChatAvatarBubble) {
    return;
  }
  var b = app.onlineChatAvatarBubble;
  var L = app.computeBoardNameLabelLayout(layout);
  if (!L) {
    return;
  }
  var now = Date.now();
  ctx.save();
  th = th || {};

  function truncToWidth(text, maxW, fontStr) {
    ctx.font = fontStr;
    if (ctx.measureText(text).width <= maxW) {
      return text;
    }
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawOne(cx, cy, avR, slotKey, bubbleOnLeft) {
    var slot = b[slotKey];
    if (!slot || slot.until <= now || !slot.text) {
      return;
    }
    var kind = (slot.kind || 'TEXT').toUpperCase();
    var fs =
      kind === 'EMOJI'
        ? Math.max(22, Math.round(app.rpx(28)))
        : Math.max(15, Math.round(app.rpx(17)));
    var fontStr =
      fs +
      'px "PingFang SC","Apple Color Emoji","Segoe UI Emoji","Microsoft YaHei",sans-serif';
    var padX = app.rpx(12);
    var padY = app.rpx(9);
    var maxTw = app.rpx(200);
    var disp = truncToWidth(slot.text, maxTw, fontStr);
    ctx.font = fontStr;
    var tw = ctx.measureText(disp).width;
    var bw = Math.min(app.W - app.rpx(24), tw + padX * 2);
    var bh = Math.max(fs + padY * 2, app.rpx(40));
    var by = cy - bh * 0.5;
    var tailDepth = app.rpx(8);
    var gap = app.rpx(5);
    var tipGap = app.rpx(2);
    var br = app.rpx(14);
    var margin = app.rpx(6);
    var t0 = by + bh * 0.34;
    var t1 = by + bh * 0.66;

    var bodyLeft;
    var bodyRight;
    var tipX;
    var bx;
    if (bubbleOnLeft) {
      bodyRight = cx - avR - gap - tailDepth;
      bx = bodyRight - bw;
      if (bx < margin) {
        bx = margin;
        bodyRight = bx + bw;
      }
      tipX = cx - avR - tipGap;
    } else {
      bodyLeft = cx + avR + gap + tailDepth;
      bx = bodyLeft;
      if (bx + bw > app.W - margin) {
        bx = app.W - margin - bw;
        bodyLeft = bx;
      }
      tipX = cx + avR + tipGap;
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.07)';
    ctx.shadowBlur = app.rpx(5);
    ctx.shadowOffsetY = app.rpx(1.5);
    ctx.fillStyle = '#ffffff';

    if (bubbleOnLeft) {
      ctx.beginPath();
      ctx.moveTo(tipX, cy);
      ctx.lineTo(bodyRight, t0);
      ctx.lineTo(bodyRight, t1);
      ctx.closePath();
      ctx.fill();
      roundRectPath(ctx, bx, by, bw, bh, br);
      ctx.fill();
    } else {
      bodyLeft = bx;
      ctx.beginPath();
      ctx.moveTo(tipX, cy);
      ctx.lineTo(bodyLeft, t0);
      ctx.lineTo(bodyLeft, t1);
      ctx.closePath();
      ctx.fill();
      roundRectPath(ctx, bx, by, bw, bh, br);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.09)';
    ctx.lineWidth = app.rpx(1.5);
    if (bubbleOnLeft) {
      ctx.beginPath();
      ctx.moveTo(tipX, cy);
      ctx.lineTo(bodyRight, t0);
      ctx.lineTo(bodyRight, t1);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(tipX, cy);
      ctx.lineTo(bodyLeft, t0);
      ctx.lineTo(bodyLeft, t1);
      ctx.closePath();
      ctx.stroke();
    }
    roundRectPath(ctx, bx, by, bw, bh, br);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(disp, bx + bw * 0.5, by + bh * 0.5);
  }

  drawOne(L.myCx, L.myCy, L.avR, 'my', false);
  drawOne(L.oppCx, L.oppCy, L.avR, 'opp', true);
  ctx.restore();
};

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
 * 首次进入：系统弹窗「完善资料」，在 showModal 的 success 里调用 wx.getUserProfile（按产品要求保留该写法）。
 * 若本地已有授权缓存的微信昵称（readCachedWeChatUserInfo），则不再询问。
 * 若已通过分享链接进入对局，则不再弹出以免盖住棋盘。
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
  /** 本地已有此前授权保存的微信资料时不再弹窗询问 */
  var cachedWx =
    typeof app.readCachedWeChatUserInfo === 'function'
      ? app.readCachedWeChatUserInfo()
      : null;
  if (cachedWx && cachedWx.nickName) {
    try {
      wx.setStorageSync(app.PROFILE_PROMPT_STORAGE_KEY, '1');
    } catch (eCached) {}
    return;
  }
  if (typeof wx.showModal !== 'function') {
    return;
  }
  setTimeout(function () {
    try {
      if (wx.getStorageSync(app.PROFILE_PROMPT_STORAGE_KEY) === '1') {
        return;
      }
    } catch (ePre) {}
    var cachedWx2 =
      typeof app.readCachedWeChatUserInfo === 'function'
        ? app.readCachedWeChatUserInfo()
        : null;
    if (cachedWx2 && cachedWx2.nickName) {
      try {
        wx.setStorageSync(app.PROFILE_PROMPT_STORAGE_KEY, '1');
      } catch (eCached2) {}
      return;
    }
    if (app.isPvpOnline && app.screen === 'game') {
      return;
    }
    if (app.onlineInviteConsumed) {
      return;
    }
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
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '当前环境不支持授权', icon: 'none' });
          }
          return;
        }
        wx.getUserProfile({
          desc: '用于展示昵称与头像',
          success: function (up) {
            if (up && up.userInfo) {
              app.persistLocalNickname(up.userInfo);
              app.saveCachedWeChatUserInfo(up.userInfo);
              var av = up.userInfo.avatarUrl;
              if (typeof av === 'string' && av.trim()) {
                app.loadMyNetworkAvatar(av.trim());
              }
              authApi.silentLogin(up.userInfo, function (ok) {
                app.myProfileAvatarFetched = false;
                if (typeof app.tryFetchMyProfileAvatar === 'function') {
                  app.tryFetchMyProfileAvatar();
                }
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
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '未授权', icon: 'none' });
            }
          }
        });
      }
    });
  }, 450);
}

themes.setTuanMoeUnlockedFromServer(false);
if (typeof themes.setCheckinStreakFromServer === 'function') {
  themes.setCheckinStreakFromServer(0);
}
themes.setPieceSkinUnlockedIdsFromServer([]);
app.themeId = themes.loadSavedThemeId();
app.pieceSkinId = themes.loadSavedPieceSkinId();

/** 首页「杂货铺」弹窗：居中缩放 + 遮罩 */
app.pieceSkinModalVisible = false;
app.pieceSkinModalAnim = 0;
app.pieceSkinModalAnimRafId = null;
/** 分页与当前选中（catalog 全局下标） */
app.pieceSkinModalPage = 0;
app.pieceSkinModalPendingIdx = 0;
app.pieceSkinRedeemInFlight = false;
/** 杂货铺：双击穿戴，首击 catalog 下标与时间戳 */
app.pieceSkinWearDblIdx = -1;
app.pieceSkinWearDblAt = 0;
app.PIECE_SKIN_WEAR_DBL_MS = 450;

/** 杂货铺：设计稿基准宽度 rpx（304×0.8×1.1） */
app.PIECE_SKIN_CARD_W_RPX = 304 * 0.88;
/** 杂货铺：通用正文字体栈 */
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
/** 首页底部 Dock 按下列：0～2 或 null（与 hitHomeBottomNav 一致：签、战绩、杂货铺） */
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
/** 列表惯性：px/ms，与手指方向一致（上滑为正，内容向下滚） */
app.historyScrollVel = 0;
app.historyScrollLastTs = 0;
app.historyMomentumRafId = null;
app.historyMomentumLastTs = 0;
/** 战绩列表滚动条滑块纵向位置比例 0~1，插值平滑 */
app.historyScrollbarRatioSmooth = null;
/** 静止后约此毫秒再隐藏滚动条（与微信列表接近） */
app.HISTORY_SCROLLBAR_HOLD_MS = 1000;
/** 最近一次列表滚动/惯性时间，用于静止后延迟隐藏条 */
app.historyScrollbarLastScrollTs = 0;
/** 静止后触发重绘以去掉滚动条的定时器 */
app.historyScrollbarFadeTimerId = null;
app.historyListTouchStartX = 0;
app.historyListTouchStartY = 0;
app.historyPeakEloCached = 0;
/** GET /api/me/game-history 返回的 items；与本地人机记录合并展示 */
app.historyServerItems = [];
/** 已登录时拉取 rating + game-history 完成前为 true，列表区显示加载态 */
app.historyListLoading = false;
/** 切换战绩筛选胶囊时拉取列表，列表区显示加载态 */
app.historyTabLoading = false;
/** 开始请求服务端战绩的时间戳，用于最短展示加载动画，避免一闪而过 */
app.historyLoadStartTs = 0;

app.historyListRowHeightRpx = function() {
  return app.rpx(122);
}

app.historyListRowGapRpx = function() {
  return app.rpx(9);
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
    if (!Array.isArray(arr)) {
      app.matchHistoryList = [];
      return;
    }
    var stripped = [];
    var si;
    for (si = 0; si < arr.length; si++) {
      var row = arr[si];
      if (row && row.mode === 'pve') {
        continue;
      }
      stripped.push(row);
    }
    if (stripped.length !== arr.length) {
      try {
        wx.setStorageSync(app.MATCH_HISTORY_STORAGE_KEY, JSON.stringify(stripped));
      } catch (eSync) {}
    }
    app.matchHistoryList = stripped;
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
    return (
      defaultAvatars.getGuardianBotAvatarImage() ||
      defaultAvatars.getOpponentAvatarImage()
    );
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
  var localOnly = [];
  for (i = 0; i < app.matchHistoryList.length; i++) {
    var e = app.matchHistoryList[i];
    if (e && e.mode === 'local_pvp') {
      localOnly.push(e);
    }
  }
  var merged = fromServer.concat(localOnly);
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
 * 绘制棋子用：在基底主题上套用指定棋子皮肤 id（与界面风格独立）。
 */
app.getPieceThemeForSkin = function(baseTheme, skinId) {
  var sid = skinId && String(skinId).trim() ? String(skinId).trim() : 'basic';
  var t = themes.applyPieceSkin(baseTheme, sid);
  return app.enrichPieceSkinTheme(t, sid);
}

/**
 * 绘制棋子用：在基底主题上套用当前佩戴棋子皮肤（与界面风格独立）。
 * 对局页基底为檀木盘时仍用 classic 作合并基底。
 */
app.getThemeForPieces = function(baseTheme) {
  return app.getPieceThemeForSkin(baseTheme, app.pieceSkinId);
}

/**
 * 棋谱回放：某侧为 null 时该侧回退为 app.pieceSkinId（兼容旧存档无字段）。
 */
app.applyReplayPieceSkinsFromOptional = function(blackPieceSkinId, whitePieceSkinId) {
  if (blackPieceSkinId != null && String(blackPieceSkinId).trim() !== '') {
    app.replayBlackPieceSkinId = String(blackPieceSkinId).trim();
  } else {
    app.replayBlackPieceSkinId = null;
  }
  if (whitePieceSkinId != null && String(whitePieceSkinId).trim() !== '') {
    app.replayWhitePieceSkinId = String(whitePieceSkinId).trim();
  } else {
    app.replayWhitePieceSkinId = null;
  }
}

/**
 * 棋谱层绘制：返回黑/白两套棋子主题（与联机对局分支一致）。
 */
app.getReplayPiecePairThemes = function(baseTheme) {
  var fb = app.replayBlackPieceSkinId;
  var fw = app.replayWhitePieceSkinId;
  if (fb == null || fb === '') {
    fb = app.pieceSkinId;
  }
  if (fw == null || fw === '') {
    fw = app.pieceSkinId;
  }
  return {
    black: app.getPieceThemeForSkin(baseTheme, fb),
    white: app.getPieceThemeForSkin(baseTheme, fw)
  };
}

/**
 * 界面用主题：全屏跟随后台所选界面风格（檀木 / 青瓷 / 水墨）。
 * 含随机匹配页、联机随机/好友对战对局与结算层，与首页一致。
 */
app.getUiTheme = function() {
  return app.getCurrentTheme();
}

/**
 * 杂货铺弹窗：色板与当前界面风格（檀木 / 青瓷 / 水墨）一致。
 */
app.shopModalUiFromTheme = function(th) {
  th = th || app.getUiTheme();
  var id = th.id;
  var bg = th.bg && th.bg.length ? th.bg : ['#fff9f4', '#fff6ed', '#fffcf9'];
  return {
    panel: bg,
    title: th.title,
    subtitle: th.subtitle,
    muted: th.muted,
    sep:
      id === 'mint'
        ? 'rgba(20, 57, 66, 0.14)'
        : id === 'ink'
          ? 'rgba(36, 32, 24, 0.13)'
          : 'rgba(92, 75, 58, 0.12)',
    cardG0:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.94)'
        : id === 'ink'
          ? 'rgba(255, 252, 248, 0.97)'
          : '#fffefb',
    cardG1:
      id === 'mint'
        ? 'rgba(225, 241, 237, 0.95)'
        : id === 'ink'
          ? 'rgba(236, 228, 218, 0.95)'
          : '#f5f1eb',
    stroke:
      id === 'mint'
        ? 'rgba(46, 117, 134, 0.32)'
        : id === 'ink'
          ? 'rgba(74, 66, 58, 0.36)'
          : 'rgba(200, 188, 172, 0.85)',
    focusStroke: th.btnPrimary,
    focusShadow:
      id === 'mint'
        ? 'rgba(31, 86, 100, 0.28)'
        : id === 'ink'
          ? 'rgba(34, 28, 24, 0.24)'
          : 'rgba(224, 124, 46, 0.28)',
    statusSep:
      id === 'mint'
        ? 'rgba(20, 57, 66, 0.11)'
        : id === 'ink'
          ? 'rgba(40, 36, 30, 0.11)'
          : 'rgba(92, 75, 58, 0.1)',
    ribbon0:
      th.homeCards && th.homeCards[0] ? th.homeCards[0] : th.btnPrimary,
    ribbon1: th.btnPrimary,
    ribbon2:
      th.homeCards && th.homeCards[2]
        ? th.homeCards[2]
        : th.homeCards && th.homeCards[1]
          ? th.homeCards[1]
          : th.btnPrimary,
    ribbonText: '#fffef9',
    ribbonTextShadow:
      id === 'ink' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 28, 22, 0.42)',
    pointsCost: id === 'mint' ? '#2a7d8c' : id === 'ink' ? '#a07048' : '#b08040',
    redeemBtnG0: th.homeCards && th.homeCards[1] ? th.homeCards[1] : th.btnPrimary,
    redeemBtnG1: th.btnPrimary
  };
};

/**
 * 我的战绩页：统计卡、筛选条、列表行与胜负色随界面主题（与杂货铺同源色板扩展）。
 */
app.historyPageUiFromTheme = function(th) {
  th = th || app.getUiTheme();
  var id = th.id;
  var S =
    typeof app.shopModalUiFromTheme === 'function'
      ? app.shopModalUiFromTheme(th)
      : null;
  var res = th.result || {};
  var winC =
    res.win && res.win.title ? res.win.title : '#a67c3d';
  var loseC =
    res.lose && res.lose.title ? res.lose.title : '#b06060';
  var drawC =
    res.draw && res.draw.title ? res.draw.title : th.subtitle;
  return {
    parchmentTint:
      id === 'mint'
        ? 'rgba(230, 242, 239, 0.34)'
        : id === 'ink'
          ? 'rgba(240, 232, 222, 0.36)'
          : 'rgba(253, 245, 230, 0.32)',
    statG0: S ? S.cardG0 : '#fff9f0',
    statG1: S ? S.cardG1 : '#fff3e4',
    statStroke: S ? S.stroke : 'rgba(92, 75, 58, 0.14)',
    statShadow:
      id === 'mint'
        ? 'rgba(12, 52, 64, 0.1)'
        : id === 'ink'
          ? 'rgba(28, 22, 16, 0.11)'
          : 'rgba(60, 48, 38, 0.12)',
    statDivider: S ? S.statusSep : 'rgba(92, 75, 58, 0.12)',
    tabBg:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.94)'
        : id === 'ink'
          ? 'rgba(255, 252, 248, 0.92)'
          : 'rgba(255, 252, 246, 0.97)',
    tabBorder: S ? S.sep : 'rgba(92, 75, 58, 0.1)',
    tabActive: th.btnPrimary,
    tabTextActive: th.btnPrimary,
    rowG0:
      id === 'mint'
        ? 'rgba(255, 255, 255, 1)'
        : id === 'ink'
          ? 'rgba(255, 253, 250, 1)'
          : 'rgba(255, 254, 251, 1)',
    rowG1:
      id === 'mint'
        ? 'rgba(248, 252, 251, 0.99)'
        : id === 'ink'
          ? 'rgba(252, 248, 244, 0.99)'
          : 'rgba(255, 250, 242, 0.99)',
    rowG2:
      id === 'mint'
        ? 'rgba(218, 234, 230, 0.96)'
        : id === 'ink'
          ? 'rgba(228, 218, 206, 0.96)'
          : 'rgba(238, 228, 214, 0.97)',
    rowStroke: S ? S.stroke : 'rgba(92, 75, 58, 0.13)',
    rowShadow:
      id === 'mint'
        ? 'rgba(10, 45, 55, 0.14)'
        : id === 'ink'
          ? 'rgba(22, 18, 14, 0.16)'
          : 'rgba(38, 28, 18, 0.2)',
    rowFoot1:
      id === 'mint'
        ? 'rgba(20, 55, 62, 0.04)'
        : id === 'ink'
          ? 'rgba(40, 32, 24, 0.06)'
          : 'rgba(72, 56, 40, 0.06)',
    win: winC,
    lose: loseC,
    draw: drawC,
    loadVeil: id === 'mint' ? 'rgba(55, 42, 32, 0.18)' : 'rgba(55, 42, 32, 0.22)',
    loadPanel:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.92)'
        : 'rgba(255, 252, 248, 0.88)',
    loadTitle: th.title,
    loadSub: th.muted,
    replayBg:
      id === 'mint'
        ? 'rgba(31, 86, 100, 0.12)'
        : id === 'ink'
          ? 'rgba(60, 52, 44, 0.12)'
          : 'rgba(123, 94, 63, 0.14)',
    replayStroke:
      id === 'mint'
        ? 'rgba(31, 86, 100, 0.3)'
        : id === 'ink'
          ? 'rgba(70, 60, 50, 0.32)'
          : 'rgba(123, 94, 63, 0.38)',
    replayTri: th.btnPrimary,
    emptySub: th.muted,
    scrollbar:
      id === 'mint'
        ? 'rgba(20, 55, 62, 0.22)'
        : id === 'ink'
          ? 'rgba(32, 26, 20, 0.24)'
          : 'rgba(0, 0, 0, 0.2)'
  };
};

/**
 * 首页好友列表（侧边 FAB + 面板）：与杂货铺 / 战绩同源色板，跟随后台界面风格。
 */
app.friendListHomeUiFromTheme = function(th) {
  th = th || app.getUiTheme();
  var id = th.id;
  var S =
    typeof app.shopModalUiFromTheme === 'function'
      ? app.shopModalUiFromTheme(th)
      : null;
  var H =
    typeof app.historyPageUiFromTheme === 'function'
      ? app.historyPageUiFromTheme(th)
      : null;
  var panelArr =
    S && S.panel && S.panel.length >= 3
      ? S.panel
      : th.bg && th.bg.length >= 3
        ? th.bg
        : ['#fff9f4', '#fff6ed', '#fffcf9'];
  var winTitle =
    th.result && th.result.win && th.result.win.title
      ? th.result.win.title
      : '#2e7d32';
  return {
    backdropAlpha: id === 'ink' ? 0.52 : id === 'mint' ? 0.4 : 0.45,
    panelG0: panelArr[0],
    panelG1: panelArr[1],
    panelG2: panelArr[2],
    panelShadow:
      id === 'mint'
        ? 'rgba(12, 52, 64, 0.2)'
        : id === 'ink'
          ? 'rgba(20, 16, 12, 0.26)'
          : 'rgba(60, 48, 38, 0.18)',
    title: th.title,
    collapse: th.muted,
    searchBg0: S ? S.cardG0 : '#fffefb',
    searchBg1: S ? S.cardG1 : '#f5f1eb',
    sep: S ? S.sep : 'rgba(92, 75, 58, 0.12)',
    tabActive: th.title,
    tabInactive: th.muted,
    searchText: th.title,
    searchPlaceholder: th.muted,
    loading: th.muted,
    emptyTitle: th.title,
    rowEven: H ? H.parchmentTint : 'rgba(253, 245, 230, 0.32)',
    rowOdd:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.65)'
        : id === 'ink'
          ? 'rgba(255, 252, 248, 0.55)'
          : 'rgba(255, 252, 246, 0.58)',
    avatarFallback:
      id === 'mint'
        ? '#c8e0dc'
        : id === 'ink'
          ? '#ddd4cc'
          : '#e0d6c8',
    avatarChar: th.title,
    name: th.title,
    /** 好友列表未读私聊角标 */
    unreadDot:
      id === 'mint'
        ? '#e53935'
        : id === 'ink'
          ? '#e57373'
          : '#d32f2f',
    online: winTitle,
    offline: th.muted,
    actionHint: th.muted,
    fabFill: th.btnGhostFill,
    fabStroke: th.btnGhostStroke,
    fabIcon: th.title,
    /** 有未读私聊时外圈高亮主色 / 外圈 */
    fabUnreadHighlight:
      id === 'mint'
        ? 'rgba(0, 128, 132, 0.92)'
        : id === 'ink'
          ? 'rgba(200, 120, 88, 0.94)'
          : 'rgba(230, 95, 40, 0.93)',
    fabUnreadHighlightSoft:
      id === 'mint'
        ? 'rgba(150, 220, 215, 0.55)'
        : id === 'ink'
          ? 'rgba(255, 200, 170, 0.45)'
          : 'rgba(255, 200, 150, 0.75)',
    fabShadow: th.btnShadow,
    /** 侧栏大面板渐变/子块填充：相对实色 1.0 的不透明度（越大越实） */
    panelBodyAlpha: 0.92,
    /** 好友列表 Tab：仅选中态药丸（无底层轨道） */
    tabPill:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.94)'
        : id === 'ink'
          ? 'rgba(255, 252, 248, 0.96)'
          : 'rgba(255, 253, 248, 0.97)',
    tabPillStroke:
      id === 'mint'
        ? 'rgba(46, 117, 134, 0.22)'
        : id === 'ink'
          ? 'rgba(74, 66, 58, 0.24)'
          : 'rgba(200, 188, 172, 0.45)',
    /** 行内「游戏中」与战绩胜色、online 点同源 */
    friendInGame: winTitle,
    /** 观战 pill：与 Tab 药丸同级，轻向绿 / 暖底 */
    watchPillG0:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.99)'
        : id === 'ink'
          ? 'rgba(255, 252, 250, 0.98)'
          : 'rgba(255, 253, 250, 0.99)',
    watchPillG1:
      id === 'mint'
        ? 'rgba(224, 246, 241, 0.97)'
        : id === 'ink'
          ? 'rgba(236, 230, 222, 0.97)'
          : 'rgba(232, 244, 234, 0.97)',
    watchPillStroke:
      id === 'mint'
        ? 'rgba(0, 120, 118, 0.25)'
        : id === 'ink'
          ? 'rgba(120, 95, 78, 0.3)'
          : 'rgba(46, 125, 50, 0.24)',
    watchPillText: winTitle,
    watchPillShade:
      id === 'mint'
        ? 'rgba(0, 64, 62, 0.05)'
        : id === 'ink'
          ? 'rgba(28, 22, 16, 0.07)'
          : 'rgba(20, 70, 32, 0.06)',
    /** 棋盘右上角旁观 X 人徽章（小巧独立，与 clock pill 风格一致） */
    spectatorBadgeBg:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.96)'
        : id === 'ink'
          ? 'rgba(255, 252, 250, 0.96)'
          : 'rgba(255, 253, 250, 0.96)',
    spectatorBadgeText: winTitle,
    spectatorListTitle: '旁观列表',
    /** 私聊顶栏：与侧栏渐变中段一致 */
    chatHeaderBg: panelArr[1],
    /** 私聊消息列表区（暖色 parchment，非微信灰） */
    chatMsgBg:
      id === 'mint'
        ? 'rgba(226, 241, 239, 0.96)'
        : id === 'ink'
          ? 'rgba(235, 229, 221, 0.96)'
          : 'rgba(244, 236, 226, 0.96)',
    /** 对方气泡：与列表药丸卡片一致 */
    chatBubbleOther:
      id === 'mint'
        ? 'rgba(255, 255, 255, 0.94)'
        : id === 'ink'
          ? 'rgba(255, 252, 248, 0.96)'
          : 'rgba(255, 253, 248, 0.97)',
    chatBubbleOtherStroke:
      id === 'mint'
        ? 'rgba(46, 117, 134, 0.2)'
        : id === 'ink'
          ? 'rgba(74, 66, 58, 0.22)'
          : 'rgba(200, 188, 172, 0.4)',
    /** 己方气泡：主题色浅铺，与杂货铺主按钮同源 */
    chatBubbleSelf:
      id === 'mint'
        ? 'rgba(55, 132, 146, 0.24)'
        : id === 'ink'
          ? 'rgba(105, 86, 68, 0.3)'
          : 'rgba(191, 144, 99, 0.34)',
    chatAvatarSelfFallback:
      id === 'mint'
        ? '#c5e0dc'
        : id === 'ink'
          ? '#cfc4b8'
          : '#ead8c8',
    chatCursor: th.btnPrimary,
    chatSendActive: th.btnPrimary,
    chatSendInactive: th.muted
  };
};

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

/** 初始化旁观人数（防止首次绘制前未定义导致黑屏） */
app.spectatorCount = 0;

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

/** 'home' | 'pve_color' | 'matching' | 'game' | 'history' | 'replay' | 'review_hub' | 'admin_puzzle' */
app.screen = 'home';
/** 对局复盘入口页：GET /api/me/replay-study 的响应体（含 hasData） */
app.reviewHubData = null;

/** openid 管理员：侧栏「残局管理」入口（由 /api/me/admin-status 设置） */
app.userIsAdmin = false;
/** 首页管理员悬浮按钮按下态 */
app.homeDrawerTabPressed = false;
/** 管理页草稿棋盘；与 app.board 同引用 */
app.adminDraftBoard = null;
app.adminPuzzleTitle = '新残局';
app.adminPuzzleSideToMove = app.BLACK;
app.adminPuzzleScheduleDate = '';
/** 发布条：横向滑动确认，像素偏移与手势追踪 */
app.adminPuzzlePublishSwipePx = 0;
app.adminPuzzlePublishSwipeTouchId = null;
app.adminPuzzlePublishSwipeStartClientX = 0;
app.adminPuzzlePublishSwipeStartOffsetPx = 0;
/** 残局排期：画布日历弹层（原生 picker 需 WXML，本工程为纯 Canvas） */
app.adminPuzzleSchedulePickerOpen = false;
app.adminPuzzleSchedulePickerData = null;

/** 对局结束：在棋盘页上以半透明弹层展示（不再切全屏 result） */
app.showResultOverlay = false;

/** 联机：对方已重置开新局，本端仍显示上一局结算直至用户点「再来一局/返回首页」 */
app.onlineResultOverlaySticky = false;
/** 联机终局：WS STATE.rematchRequesterColor，null 表示无人发起再来一局邀请 */
app.onlineRematchRequesterColor = null;

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
/** STATE：各方是否为人机（用于「我」对面是否为电脑，避免误用对手接口头像） */
app.onlineBlackIsBotFlag = false;
app.onlineWhiteIsBotFlag = false;

/** 同桌好友对战：双方在同一设备轮流落子（无需服务端） */
app.isPvpLocal = false;

/** 联机好友对战（Spring Boot WebSocket） */
app.isPvpOnline = false;
/** 每日残局：用户对「守关者」(AI)，提交完整手顺至 /api/me/daily-puzzle/submit */
app.isDailyPuzzle = false;
/** true：由棋谱回放「复盘」进入，胜负不提交 /api/me/daily-puzzle/submit */
app.dailyPuzzleLocalStudy = false;
app.dailyPuzzleMeta = null;
app.dailyPuzzleMoves = [];
app.dailyPuzzleInitialBoard = null;
app.dailyPuzzleSideToMoveStart = app.BLACK;
/** 挑战者执子色：与残局「下一手」一致（下一手黑则执黑，下一手白则执白） */
app.dailyPuzzleUserColor = app.BLACK;
/** 守关 AI 思考代数，与悔棋/重开配合以丢弃过期 Worker 结果 */
app.dailyPuzzleBotGen = 0;
/** 残局好友房：客户端人机 Worker 代数，与 STATE 不同步时丢弃过期结果 */
app.onlinePuzzleClientBotGen = 0;
app.dailyPuzzleSubmitting = false;
app.dailyPuzzleResultKind = '';
/** 当日第一次通关每日残局时 submit 返回的团团积分增量，在 openResult 时触发飘字 */
app.dailyPuzzleSubmitActivityPointsDelta = null;
app.onlineRoomId = '';
app.onlineToken = '';
/** 本客户端执子 gomoku.BLACK | gomoku.WHITE，与服务器 STATE.yourColor 一致 */
app.pvpOnlineYourColor = app.BLACK;
app.onlineBlackConnected = false;
app.onlineWhiteConnected = false;
/** 对方曾在线后断开，用于状态栏「对方已离开房间」 */
app.onlineOpponentLeft = false;
/**
 * 好友房（非随机匹配）：是否曾出现「黑、白双方都在线」。
 * 用于避免好友尚未进房时误判「对方离开 / 逃跑」终局与结算 runaway。
 */
app.onlineFriendBothEverConnected = false;
/** 残局好友房：房主 WS 使用旁观 token，不落子 */
app.onlineSpectatorMode = false;
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
/** 残局好友房：用于分享文案与「好友进房重置棋盘」提示 */
app.onlinePuzzleFriendRoom = false;
/** 邀请好友进残局前快照，分享取消时 restoreAfterCancelledPuzzleFriendInvite 恢复 */
app._puzzleFriendInviteSnapshot = null;
/** 已调起分享面板，等待 onShow 兜底（部分机型 fail 不回调） */
app._puzzleFriendInviteShareAwaitOnShow = false;
app._puzzleFriendInviteOnShowTimer = null;
/** 每次打开分享递增，避免多次定时器互相误伤 */
app._puzzleFriendInviteOnShowFallbackGen = 0;
/** WS STATE.puzzleRoom：残局房不展示读秒、不依赖本机猜房型 */
app.onlinePuzzleRoomFromWs = false;
/** 残局好友房房主旁观、好友未进房：本地练习用，连成五后恢复至此（与最近一次同步后的残局模板一致） */
app.puzzleFriendPracticeStartBoard = null;
app.puzzleFriendPracticeStartCurrent = null;
/** 本局是否已请求 POST /api/games/settle（防重复；新局由 applyOnlineState 置 false） */
app.onlineSettleSent = false;
/** 结算分未返回时延迟补拉一次 settle（仅一局内有效；离开房间时清除） */
app.onlineSettleRetryTimer = null;
/** 与 WS STATE.matchRound 一致：首局 1，再来一局后递增，用于结算上报 */
app.onlineMatchRound = 1;
/** 联机终局原因：TIME_DRAW | MOVE_TIMEOUT | RESIGN 等，与 STATE.gameEndReason 一致 */
app.onlineGameEndReason = null;
/** 联机读秒：与 STATE.clock* 一致；null 表示未下发（旧服务端） */
app.onlineClockMoveDeadlineWallMs = null;
app.onlineClockGameDeadlineWallMs = null;
app.onlineClockPaused = false;
/** 联机对局页倒计时刷新用 */
app.onlineClockTickTimer = null;
/**
 * 联机 STATE：双方执子皮肤（服务端广播）；null 兼容旧服务端，绘制时回退为统一使用 app.pieceSkinId
 */
app.onlineBlackPieceSkinId = null;
app.onlineWhitePieceSkinId = null;
/** 从好友列表观战 PvP 时：被观战好友的 userId（与 STATE 黑/白比对接口） */
app.onlineFriendWatchPeerUserId = null;
app.onlineStateBlackUserId = null;
app.onlineStateWhiteUserId = null;
app.onlineStateBlackNickname = '';
app.onlineStateWhiteNickname = '';
app.onlineWatchSeatBlackImg = null;
app.onlineWatchSeatWhiteImg = null;
app._watchBlackAvatarUrlCached = '';
app._watchWhiteAvatarUrlCached = '';

/** 联机聊天（标准对战底栏第 5 键；WS type CHAT / CHAT_SEND） */
app.onlineChatMessages = [];
app.onlineChatOpen = false;
app.onlineChatEmojiOpen = false;
app.onlineChatBanner = null;
app.onlineChatBubbleHits = [];
app.onlineChatPanelLayout = null;
/** 打开面板时 0.2s 上滑；0～1 */
app.onlineChatPanelOpenAnim = 1;
app._onlineChatAnimStartMs = 0;
app._chatPanelAnimIv = null;
/** 自定义绘制用草稿；与 wx.showKeyboard 同步 */
app.onlineChatInputDraft = '';
app._onlineChatKeyboardCleanup = null;
/** 头像旁会话气泡：{ my: {text,until,kind}, opp: ... } kind 为 TEXT|QUICK|EMOJI */
app.onlineChatAvatarBubble = null;
app._onlineChatAvatarBubbleMyTmr = null;
app._onlineChatAvatarBubbleOppTmr = null;
app.ONLINE_CHAT_QUICK = [
  '哈喽～',
  '这步绝了',
  '大意了',
  '稳住别慌',
  '容我想想',
  '平局不？',
  '太强了吧',
  '输了输了'
];
app.ONLINE_CHAT_EMOJIS = [
  '👍',
  '👌',
  '😊',
  '😅',
  '🤝',
  '🎯',
  '🎉',
  '😔',
  '🤔',
  '✋',
  '👋',
  '🫡'
];
/** 表情快捷区：与 UI 稿一致展示 5 个（其余可从「⋯」选） */
app.ONLINE_CHAT_EMOJI_QUICK_ROW = ['👍', '👌', '😊', '😅', '🤝'];

app.shouldShowOnlineChatButton = function() {
  return (
    app.isPvpOnline &&
    !app.onlineSpectatorMode &&
    typeof app.isDailyStyleGameActionBar === 'function' &&
    !app.isDailyStyleGameActionBar()
  );
};

/**
 * 残局好友房房主旁观：仅在人机占位、尚无人类好友入座时可本地练习（与 STATE 白/黑是否 bot 一致）。
 * 注意：服务端 whiteConnected 会包含「白方人机已就位」，不能单用 onlineWhiteConnected。
 */
app.puzzleFriendSpectatorPracticeAllowed = function() {
  if (
    !app.isPvpOnline ||
    !app.onlinePuzzleFriendRoom ||
    !app.onlineSpectatorMode
  ) {
    return false;
  }
  var humanWhite =
    app.onlineWhiteConnected && app.onlineWhiteIsBotFlag !== true;
  var humanBlack =
    app.onlineBlackConnected && app.onlineBlackIsBotFlag !== true;
  return !humanWhite && !humanBlack;
};

/**
 * 好友联机（非随机匹配）：双方未都在座时视为对局未开始。
 * 用于邀请后对面未进房、白方未加入、关闭转发面板后仍在等待等场景。
 * 残局好友房房主旁观时：本地练习中不挡点击（与 part5 触摸 guard 配合）。
 */
app.isOnlineFriendMatchNotStarted = function() {
  if (!app.isPvpOnline || app.isRandomMatch) {
    return false;
  }
  if (
    app.onlinePuzzleFriendRoom &&
    app.onlineSpectatorMode &&
    typeof app.puzzleFriendSpectatorPracticeAllowed === 'function' &&
    app.puzzleFriendSpectatorPracticeAllowed()
  ) {
    return false;
  }
  if (app.onlineSpectatorMode) {
    return !app.onlineWhiteConnected;
  }
  return !app.onlineBlackConnected || !app.onlineWhiteConnected;
};

/**
 * 底栏使用「每日残局」四键样式：离开 / 悔棋 / 重置 / 邀请。
 * - 单机每日残局：isDailyPuzzle && !isPvpOnline
 * - 残局好友房：房主有 onlinePuzzleFriendRoom；好友凭 STATE.puzzleRoom（onlinePuzzleRoomFromWs）
 */
app.isDailyStyleGameActionBar = function() {
  if (app.isDailyPuzzle && !app.isPvpOnline) {
    return true;
  }
  return (
    !!app.isPvpOnline &&
    (!!app.onlinePuzzleFriendRoom || !!app.onlinePuzzleRoomFromWs)
  );
};

/**
 * 残局好友房：若仅一方为人机，返回该方执子色；否则 null（与 STATE blackIsBot/whiteIsBot 一致）。
 */
app.onlinePuzzleFriendBotStoneColor = function() {
  if (!app.isPvpOnline || app.onlineSpectatorMode) {
    return null;
  }
  if (!app.onlinePuzzleFriendRoom && !app.onlinePuzzleRoomFromWs) {
    return null;
  }
  var bb = !!app.onlineBlackIsBotFlag;
  var wb = !!app.onlineWhiteIsBotFlag;
  if (bb && !wb) {
    return app.BLACK;
  }
  if (wb && !bb) {
    return app.WHITE;
  }
  return null;
};

/**
 * 「邀请」仅房主可用；好友进入残局房后置灰不可点（含房主侧：有人类棋手入座后不可再邀）。
 */
app.isPuzzleFriendInviteEnabled = function() {
  if (app.isDailyPuzzle && !app.isPvpOnline) {
    return app.dailyPuzzleLocalStudy !== true;
  }
  if (
    app.isPvpOnline &&
    typeof app.isDailyStyleGameActionBar === 'function' &&
    app.isDailyStyleGameActionBar()
  ) {
    if (!app.onlinePuzzleFriendRoom) {
      return false;
    }
    var humanBlack =
      app.onlineBlackConnected && app.onlineBlackIsBotFlag !== true;
    var humanWhite =
      app.onlineWhiteConnected && app.onlineWhiteIsBotFlag !== true;
    if (humanBlack || humanWhite) {
      return false;
    }
    return true;
  }
  return true;
};

/**
 * 残局好友房是否已有真人好友入座（与 isPuzzleFriendInviteEnabled 中 human 判定一致）。
 */
app.hasPuzzleFriendHumanGuest = function() {
  if (!app.isPvpOnline || !app.onlinePuzzleFriendRoom) {
    return false;
  }
  var humanBlack =
    app.onlineBlackConnected && app.onlineBlackIsBotFlag !== true;
  var humanWhite =
    app.onlineWhiteConnected && app.onlineWhiteIsBotFlag !== true;
  return humanBlack || humanWhite;
};

/**
 * 点击棋盘旁「对手」头像时：是否拦截 opponent-rating。
 * - 联机房间（有 onlineRoomId）内对面为人机：服务端有人机账号，允许 GET /api/rooms/opponent-rating（含随机匹配超时接入的机器人）。
 * - 无联机房间时对面仍判为人机：勿拉接口（本地人机等）。
 * - 残局好友房旁观侧对人机：尚无真人入座或占位未就绪时提示，勿拉 opponent-rating。
 */
app.shouldToastNoOpponentLadderForOnlineOppAvatar = function() {
  if (typeof app.isMyOnlineOpponentBot === 'function' && app.isMyOnlineOpponentBot()) {
    if (app.onlineRoomId) {
      return false;
    }
    return true;
  }
  if (
    app.onlineSpectatorMode &&
    app.onlinePuzzleFriendRoom
  ) {
    if (
      typeof app.hasPuzzleFriendHumanGuest !== 'function' ||
      !app.hasPuzzleFriendHumanGuest()
    ) {
      return true;
    }
    var oi = app.onlineOppAvatarImg;
    if (!oi || !oi.width || !oi.height) {
      return true;
    }
  }
  return false;
};

/**
 * 是否绘制/刷新联机读秒（局时条、头像环、setInterval）；残局房（好友创建或 STATE.puzzleRoom）一律关闭。
 * 标准好友房：对方未进房、对局未开始时也不显示倒计时（与「等待好友加入」一致）。
 */
app.shouldShowOnlineGameClockUi = function() {
  if (!app.isPvpOnline) {
    return false;
  }
  if (app.onlinePuzzleFriendRoom) {
    return false;
  }
  if (app.onlinePuzzleRoomFromWs) {
    return false;
  }
  if (
    typeof app.isOnlineFriendMatchNotStarted === 'function' &&
    app.isOnlineFriendMatchNotStarted()
  ) {
    return false;
  }
  return true;
};

/**
 * 好友房且对方从未进房：离开无逃跑风险，底栏「离开」可不弹确认直接返回。
 * 与 onlineFriendBothEverConnected 一致：双方曾同时在线后为 true，此后即使断线仍弹窗。
 */
app.shouldSkipOnlineLeaveConfirm = function() {
  return (
    app.isPvpOnline &&
    !app.gameOver &&
    !app.isRandomMatch &&
    !app.onlineFriendBothEverConnected
  );
};

/** 联机：从盘面差分同步的终局手顺（悔棋会缩短），用于结算 moves 与回放 */
app.onlineMoveHistory = [];
/** POST /api/games/settle 返回的 gameId，棋谱可事后拉取 */
app.lastSettledGameId = null;
/**
 * 最近一次 settle 返回的天梯分与团团积分字段（动画用）；离开房间时清空。
 * 含 black/白 双方列；若有 callerEloAfter、callerEloDelta、callerPlaysBlack 则与 JWT 用户一致（防执子色错配）。
 */
app.lastSettleRating = null;
/** 结算页仅自己可见：团团积分增加飘字；{ startMs, delta } */
app.resultTuanPointsAnim = null;
app.resultTuanPointsRafId = null;
/** app.screen === 'replay'：棋谱数据与当前展示步数（0 表示空盘） */
app.replayMoves = [];
app.replayStep = 0;
app.replayAutoTimerId = null;
/** 棋谱回放双方棋子皮肤（服务端 replay 或本局联机 STATE） */
app.replayBlackPieceSkinId = null;
app.replayWhitePieceSkinId = null;
/** 当前棋谱来源 games.id（存档复盘时可写入服务端 user_replay_study） */
app.replaySourceGameId = null;
/** 棋谱回放底栏药丸宽度（与 drawButton 一致；相邻箭头按钮中心距=此值则边缘相贴） */
app.REPLAY_CTRL_PILL_W = 82;
/**
 * 对局页底栏：分段条高度（rpx）、图标槽基准边长（rpx）。
 * 仅改这两项即可调节底部按钮块整体高度（条高与图标略成比例更易协调）。
 */
app.GAME_ACTION_BAR_H_RPX = 128;
app.GAME_ACTION_BAR_ICON_RPX = 72;
/** 底栏图标下方说明字字号、与图标间距（rpx） */
app.GAME_ACTION_BAR_LABEL_FS_RPX = 26;
app.GAME_ACTION_BAR_ICON_LABEL_GAP_RPX = 6;
/**
 * 底栏图标槽边长倍率（相对 GAME_ACTION_BAR_ICON_RPX）。
 * 离开/悔棋素材在盒内更「满」，与和棋/认输同倍率时会显大，略缩小以四格观感接近。
 */
app.gameBarIconSizeMul = {
  home: 0.86,
  undo: 0.86,
  /** restart2：环形+中心点略「满」，倍率与悔棋 0.86 同档略抬一点对齐视觉 */
  reset: 0.88,
  invite: 0.88,
  draw: 1,
  flag: 1
};
/** 对局页状态胶囊高度；0 表示不绘制状态条（仅图标底栏时） */
app.GAME_STATUS_CHIP_H_RPX = 0;
/** 扁平彩色图标 PNG（images/ui/game-bar-*.png），失败时回退矢量 */
app.gameBarHomeImg = null;
app.gameBarUndoImg = null;
app.gameBarResetImg = null;
app.gameBarInviteImg = null;
app.gameBarDrawImg = null;
app.gameBarResignImg = null;
/** 首页好友列表悬浮球 `images/ui/chat4.png`（失败时回退矢量圆+图标） */
app.homeFriendFabImg = null;
/**
 * 好友私聊键盘上推：对 wx.onKeyboardHeightChange 的 height 再换算到与 app.W/app.H 一致的逻辑 px。
 * 顶起过量可把 scale 改小（如 0.92）；若仍明显偏大且 DPR>1，可将 divideDpr 设为 true 再试。
 */
app.friendDmKeyboardHeightScale = 1;
app.friendDmKeyboardHeightDivideDpr = false;
/** 输入条与键盘之间的留白（rpx，经 app.rpx） */
app.friendDmKeyboardTopExtraPadRpx = 16;
/** 当前 windowHeight 比唤起键盘前小超过此 rpx 时，视为系统已缩小窗口，不再减 kbH */
app.friendDmKeyboardShrinkThresholdRpx = 24;
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
/** 对手 userId（对手资料接口），用于逃跑结算等 */
app.onlineOppUserId = 0;
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
/** 杂货铺「青瓷」棋盘展示图 images/ui/shop-celadon-board.png */
app.shopThemeMintBoardImg = null;
/** 杂货铺「水墨」棋盘展示图 images/ui/shop-ink-board.png */
app.shopThemeInkBoardImg = null;
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
app.HOME_UI_ASSETS_REV = 49;
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
/** 同桌：和棋申请方颜色 */
app.localDrawRequest = null;

/** 联机：服务端 undoPending / undoRequesterColor */
app.onlineUndoPending = false;
app.onlineUndoRequesterColor = null;
/** 本端刚发出 UNDO_CANCEL，下一帧 STATE 用于区分「对方拒绝」与「自己撤销」 */
app.onlineUndoCancelPending = false;
/** 本端刚发出 DRAW_CANCEL，同上 */
app.onlineDrawCancelPending = false;
app.onlineDrawPending = false;
app.onlineDrawRequesterColor = null;
/** 联机：发起悔棋 / 和棋后的冷却（毫秒）；人机与同桌不用 */
app.ONLINE_UNDO_COOLDOWN_MS = 20000;
app.ONLINE_DRAW_COOLDOWN_MS = 20000;
app.onlineUndoCooldownUntilMs = 0;
app.onlineDrawCooldownUntilMs = 0;
app.onlineBarCooldownTimer = null;

app.clearOnlineBarCooldownTimer = function() {
  if (app.onlineBarCooldownTimer != null) {
    clearInterval(app.onlineBarCooldownTimer);
    app.onlineBarCooldownTimer = null;
  }
};

app.getOnlineUndoCooldownRemainingMs = function() {
  if (!app.onlineUndoCooldownUntilMs) {
    return 0;
  }
  var r = app.onlineUndoCooldownUntilMs - Date.now();
  return r > 0 ? r : 0;
};

app.getOnlineDrawCooldownRemainingMs = function() {
  if (!app.onlineDrawCooldownUntilMs) {
    return 0;
  }
  var r = app.onlineDrawCooldownUntilMs - Date.now();
  return r > 0 ? r : 0;
};

/** 悔棋或和棋任一在冷却中时每秒 redraw，直至两者均结束 */
app.startOnlineBarCooldownTicker = function() {
  app.clearOnlineBarCooldownTimer();
  app.onlineBarCooldownTimer = setInterval(function() {
    if (app.screen !== 'game' || !app.isPvpOnline) {
      app.clearOnlineBarCooldownTimer();
      return;
    }
    if (
      !app.getOnlineUndoCooldownRemainingMs() &&
      !app.getOnlineDrawCooldownRemainingMs()
    ) {
      app.clearOnlineBarCooldownTimer();
      if (app.screen === 'game' && app.isPvpOnline) {
        app.draw();
      }
      return;
    }
    app.draw();
  }, 1000);
};

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
  if (typeof app.stopUndoRejectFloatAnim === 'function') {
    app.stopUndoRejectFloatAnim();
  }
  app.undoRejectFloat = null;
  app.onlineUndoCancelPending = false;
  app.onlineDrawCancelPending = false;
  app.clearOnlineReconnectTimer();
  app.onlineReconnectAttempt = 0;
  app.onlineSocketConnectGen++;
  app.onlineWsEverOpened = false;
  if (app.onlineSettleRetryTimer != null) {
    clearTimeout(app.onlineSettleRetryTimer);
    app.onlineSettleRetryTimer = null;
  }
  app.onlineResultOverlaySticky = false;
  app.onlineOpponentLeft = false;
  app.onlineFriendBothEverConnected = false;
  app.closeSocketOnly();
  app.stopReplayAuto();
  app.onlineMoveHistory = [];
  app.lastSettledGameId = null;
  app.lastSettleRating = null;
  if (typeof app.stopResultTuanPointsAnim === 'function') {
    app.stopResultTuanPointsAnim();
  }
  app.isPvpOnline = false;
  app.onlineRoomId = '';
  app.onlineToken = '';
  app.onlineSpectatorMode = false;
  app.onlinePuzzleFriendRoom = false;
  app.onlinePuzzleRoomFromWs = false;
  app.pvpOnlineYourColor = app.BLACK;
  app.onlineBlackConnected = false;
  app.onlineWhiteConnected = false;
  app.onlineOpponentIsBot = false;
  app.onlineBlackIsBotFlag = false;
  app.onlineWhiteIsBotFlag = false;
  app.onlinePuzzleClientBotGen = 0;
  app.puzzleFriendPracticeStartBoard = null;
  app.puzzleFriendPracticeStartCurrent = null;
  app.onlineUndoPending = false;
  app.onlineUndoRequesterColor = null;
  app.onlineUndoCooldownUntilMs = 0;
  app.onlineDrawCooldownUntilMs = 0;
  app.clearOnlineBarCooldownTimer();
  app.onlineDrawPending = false;
  app.onlineDrawRequesterColor = null;
  app.onlineRematchRequesterColor = null;
  app.onlineSettleSent = false;
  app.onlineMatchRound = 1;
  app.onlineGameEndReason = null;
  app.onlineClockMoveDeadlineWallMs = null;
  app.onlineClockGameDeadlineWallMs = null;
  app.onlineClockPaused = false;
  if (typeof app.clearOnlineClockTick === 'function') {
    app.clearOnlineClockTick();
  }
  app.randomMatchHostCancelToken = '';
  app.onlineBlackPieceSkinId = null;
  app.onlineWhitePieceSkinId = null;
  app.onlineFriendWatchPeerUserId = null;
  app.onlineStateBlackUserId = null;
  app.onlineStateWhiteUserId = null;
  app.onlineStateBlackNickname = '';
  app.onlineStateWhiteNickname = '';
  app.onlineWatchSeatBlackImg = null;
  app.onlineWatchSeatWhiteImg = null;
  app._watchBlackAvatarUrlCached = '';
  app._watchWhiteAvatarUrlCached = '';
  app.onlineChatMessages = [];
  app.onlineChatOpen = false;
  app.onlineChatEmojiOpen = false;
  app.onlineChatBanner = null;
  app.onlineChatBubbleHits = [];
  app.onlineChatPanelLayout = null;
  app.onlineChatPanelOpenAnim = 1;
  app._onlineChatAnimStartMs = 0;
  if (typeof app.dismissOnlineChatKeyboard === 'function') {
    app.dismissOnlineChatKeyboard();
  }
  app.onlineChatInputDraft = '';
  if (typeof app.clearOnlineChatAvatarBubbleState === 'function') {
    app.clearOnlineChatAvatarBubbleState();
  }
  app._puzzleFriendInviteSnapshot = null;
  app._puzzleFriendInviteShareAwaitOnShow = false;
  if (app._puzzleFriendInviteOnShowTimer != null) {
    try {
      clearTimeout(app._puzzleFriendInviteOnShowTimer);
    } catch (ePf) {}
    app._puzzleFriendInviteOnShowTimer = null;
  }
  if (app._chatPanelAnimIv) {
    try {
      clearInterval(app._chatPanelAnimIv);
    } catch (eIv) {}
    app._chatPanelAnimIv = null;
  }
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
  app.onlineOppUserId = 0;
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

/**
 * 将 WS STATE 中 black/white 的 userId、昵称、头像 URL 同步到观战用缓存并加载网络图。
 */
app.syncOnlineWatchSeatFromStateData = function(data) {
  if (!data) {
    return;
  }
  function numOrUndef(v) {
    if (v === undefined || v === null || v === '') {
      return null;
    }
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  var bId = numOrUndef(data.blackUserId);
  var wId = numOrUndef(data.whiteUserId);
  app.onlineStateBlackUserId = bId;
  app.onlineStateWhiteUserId = wId;
  app.onlineStateBlackNickname =
    typeof data.blackNickname === 'string' ? data.blackNickname : '';
  app.onlineStateWhiteNickname =
    typeof data.whiteNickname === 'string' ? data.whiteNickname : '';
  var bUrl = typeof data.blackAvatarUrl === 'string' ? data.blackAvatarUrl : '';
  var wUrl = typeof data.whiteAvatarUrl === 'string' ? data.whiteAvatarUrl : '';
  if (bUrl !== app._watchBlackAvatarUrlCached) {
    app._watchBlackAvatarUrlCached = bUrl;
    app.onlineWatchSeatBlackImg = null;
    if (bUrl && String(bUrl).replace(/^\s+|\s+$/g, '')) {
      app.loadNetworkAvatarIntoProp(String(bUrl).trim(), 'onlineWatchSeatBlackImg');
    }
  }
  if (wUrl !== app._watchWhiteAvatarUrlCached) {
    app._watchWhiteAvatarUrlCached = wUrl;
    app.onlineWatchSeatWhiteImg = null;
    if (wUrl && String(wUrl).replace(/^\s+|\s+$/g, '')) {
      app.loadNetworkAvatarIntoProp(String(wUrl).trim(), 'onlineWatchSeatWhiteImg');
    }
  }
}

/** 与 loadOnlineOpponentAvatar 相同，但写入 app 上指定属性名（观战双头像）。 */
app.loadNetworkAvatarIntoProp = function(url, appPropName) {
  if (!url || typeof wx === 'undefined' || !wx.createImage) {
    if (appPropName && app) {
      app[appPropName] = null;
    }
    return;
  }
  var src = String(url);
  if (src.indexOf('local:') === 0) {
    src = src.slice('local:'.length);
  }
  var img = wx.createImage();
  img.onload = function() {
    app[appPropName] = img;
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };
  img.onerror = function() {
    app[appPropName] = null;
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };
  img.src = src;
}

app.applyOnlineOpponentProfilePayload = function(d) {
  if (!d) {
    return;
  }
  if (typeof d.userId === 'number' && !isNaN(d.userId)) {
    app.onlineOppUserId = Math.floor(d.userId);
  } else if (d.userId != null) {
    var uid = Number(d.userId);
    if (!isNaN(uid)) {
      app.onlineOppUserId = Math.floor(uid);
    }
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
  /** 好友 PvP 观战：黑/白资料来自 STATE，GET opponent-rating 会 403 */
  if (app.onlineSpectatorMode && !app.onlinePuzzleFriendRoom) {
    return;
  }
  if (typeof app.isMyOnlineOpponentBot === 'function' && app.isMyOnlineOpponentBot()) {
    return;
  }
  if (app.onlineSpectatorMode) {
    /**
     * 残局好友房：仅白连上可能是人机；须等真人好友入座再拉对手资料，避免误把人机当「对手」。
     * 非残局旁观仍沿用原「白方已连上」启发式。
     */
    if (app.onlinePuzzleFriendRoom) {
      if (
        typeof app.hasPuzzleFriendHumanGuest !== 'function' ||
        !app.hasPuzzleFriendHumanGuest()
      ) {
        return;
      }
    } else if (!app.onlineWhiteConnected) {
      return;
    }
  } else if (!app.onlineBlackConnected || !app.onlineWhiteConnected) {
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
  if (app.onlineSpectatorMode) {
    return false;
  }
  return (
    app.socketTask &&
    typeof app.socketTask.send === 'function' &&
    app.onlineWsConnected
  );
}

/**
 * 联机操作（落子/悔棋/和棋/认输等）在无法经 WS 发送时提示。
 * 多数情况并非手机「无网络」，而是对战通道未就绪或断线重连中；避免一律提示「网络未连接」。
 */
app.notifyOnlineSocketSendBlocked = function() {
  if (typeof wx === 'undefined' || typeof wx.showToast !== 'function') {
    return;
  }
  if (app.onlineSpectatorMode) {
    wx.showToast({ title: '旁观模式无法操作', icon: 'none' });
    return;
  }
  if (typeof app.shouldAutoReconnectOnline === 'function' && app.shouldAutoReconnectOnline()) {
    if (
      app.socketTask &&
      typeof app.socketTask.send === 'function' &&
      !app.onlineWsConnected
    ) {
      wx.showToast({ title: '正在连接服务器…', icon: 'none' });
      return;
    }
    if (typeof app.clearOnlineReconnectTimer === 'function') {
      app.clearOnlineReconnectTimer();
    }
    if (typeof app.scheduleOnlineReconnect === 'function') {
      app.scheduleOnlineReconnect(true);
    }
    wx.showToast({ title: '对战连接中断，正在重连…', icon: 'none' });
    return;
  }
  wx.showToast({ title: '无法连接到对战服务器', icon: 'none' });
};

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
    if (app.onlineSpectatorMode) {
      return false;
    }
    return (
      app.current === app.pvpOnlineYourColor &&
      stoneColor === app.oppositeColor(app.pvpOnlineYourColor)
    );
  }
  if (app.isPvpLocal) {
    return stoneColor === app.oppositeColor(app.current);
  }
  if (app.isDailyPuzzle) {
    return (
      app.current === app.dailyPuzzleUserColor &&
      stoneColor === app.dailyPuzzleBotColor()
    );
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
 * 终局后：人机已登录则 POST /api/me/pve-game 入库；同桌和棋仍写本机 local_pvp。
 * 联机战绩由服务端结算写入 /api/me/game-history。
 */
app.submitPveGameToServer = function(body) {
  if (
    typeof wx === 'undefined' ||
    !wx.request ||
    typeof roomApi.mePveGameOptions !== 'function'
  ) {
    return;
  }
  wx.request(
    Object.assign(roomApi.mePveGameOptions(body), {
      success: function() {},
      fail: function() {}
    })
  );
}

app.recordMatchHistoryFromGameEnd = function() {
  if (!app.gameOver || app.isPvpOnline || app.isDailyPuzzle) {
    return;
  }
  var rk = app.resultKind;
  var steps = app.countStonesOnBoard(app.board);

  if (app.isPvpLocal) {
    if (rk !== 'pvp_draw') {
      return;
    }
    app.appendMatchHistoryRecord({
      t: Date.now(),
      res: 'draw',
      opp: String(app.getOpponentDisplayName() || '对手'),
      steps: steps,
      mode: 'local_pvp'
    });
    return;
  }

  var res = null;
  if (rk === 'pve_win') {
    res = 'win';
  } else if (rk === 'pve_lose') {
    res = 'lose';
  } else if (rk === 'pve_draw') {
    res = 'draw';
  } else {
    return;
  }
  if (!authApi.getSessionToken || !authApi.getSessionToken()) {
    return;
  }
  var playBlack = app.pveHumanColor === app.BLACK;
  var myResult = res === 'win' ? 'WIN' : res === 'lose' ? 'LOSS' : 'DRAW';
  var movesJson = null;
  if (app.pveMoveHistory && app.pveMoveHistory.length > 0) {
    if (app.pveMoveHistory.length === steps) {
      try {
        movesJson = JSON.stringify(app.pveMoveHistory);
      } catch (eMj) {}
    }
  }
  app.submitPveGameToServer({
    playBlack: playBlack,
    myResult: myResult,
    totalSteps: steps,
    movesJson: movesJson
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

app.syncDailyPuzzleSideToMove = function() {
  if (!app.dailyPuzzleMoves || app.dailyPuzzleMoves.length === 0) {
    app.current = app.dailyPuzzleSideToMoveStart;
    return;
  }
  var lm = app.dailyPuzzleMoves[app.dailyPuzzleMoves.length - 1];
  app.current = app.oppositeColor(lm.color);
};

app.undoDailyPuzzleOneMove = function() {
  if (!app.dailyPuzzleMoves || app.dailyPuzzleMoves.length === 0) {
    return;
  }
  var m = app.dailyPuzzleMoves.pop();
  app.board[m.r][m.c] = gomoku.EMPTY;
  app.syncDailyPuzzleSideToMove();
  app.gameOver = false;
  app.winner = null;
  app.clearWinRevealTimer();
  app.winningLineCells = null;
};

app.execDailyPuzzleUndo = function() {
  if (app.gameOver) {
    return;
  }
  if (!app.dailyPuzzleMoves || app.dailyPuzzleMoves.length === 0) {
    wx.showToast({ title: '没有可悔的棋', icon: 'none' });
    return;
  }
  app.dailyPuzzleBotGen++;
  /** 轮到守关者：仅撤回上一手（挑战者刚下完，AI 尚未回应或正在算） */
  if (app.current === app.dailyPuzzleBotColor()) {
    app.undoDailyPuzzleOneMove();
    app.syncDailyPuzzleSideToMove();
    app.refreshDailyPuzzleLastOpponentMove();
    app.draw();
    return;
  }
  /** 轮到挑战者：撤己方上一手 + 守关者上一手（若有） */
  var pops = app.dailyPuzzleMoves.length >= 2 ? 2 : 1;
  var i;
  for (i = 0; i < pops; i++) {
    if (!app.dailyPuzzleMoves || app.dailyPuzzleMoves.length === 0) {
      break;
    }
    app.undoDailyPuzzleOneMove();
  }
  app.syncDailyPuzzleSideToMove();
  app.refreshDailyPuzzleLastOpponentMove();
  app.draw();
};

app.execPveUndo = function() {
  if (app.isDailyPuzzle) {
    app.execDailyPuzzleUndo();
    return;
  }
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
  if (app.localDrawRequest) {
    wx.showToast({ title: '请先处理和棋申请', icon: 'none' });
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
    app.notifyOnlineSocketSendBlocked();
    return;
  }
  if (msgType === 'UNDO_REQUEST') {
    var remCd = app.getOnlineUndoCooldownRemainingMs();
    if (remCd > 0) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: '请等待 ' + Math.ceil(remCd / 1000) + ' 秒后再发起悔棋',
          icon: 'none'
        });
      }
      return;
    }
  }
  if (msgType === 'UNDO_CANCEL') {
    app.onlineUndoCancelPending = true;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: msgType })
  });
  if (msgType === 'UNDO_REQUEST') {
    app.onlineUndoCooldownUntilMs = Date.now() + app.ONLINE_UNDO_COOLDOWN_MS;
    app.startOnlineBarCooldownTicker();
    if (typeof app.draw === 'function') {
      app.draw();
    }
  }
}

/** 同桌：画布上显示同意/拒绝。联机改由弹框处理，不再画此行。 */
app.showUndoRespondRow = function() {
  return !!app.localUndoRequest;
}

app.clearWinRevealTimer = function() {
  if (app.winRevealTimerId != null) {
    clearTimeout(app.winRevealTimerId);
    app.winRevealTimerId = null;
  }
}

/** 认输：当前行棋方判负（同桌）；人机为玩家认输则 AI 胜。 */
app.finishGameByResignLocal = function() {
  app.gameOver = true;
  app.winner = app.current === app.BLACK ? app.WHITE : app.BLACK;
  app.openResult();
}

app.finishGameByResignPve = function() {
  app.gameOver = true;
  app.winner = app.pveAiColor();
  app.openResult();
}

/** 和棋终局（同桌 / 人机） */
app.finishGameDrawLocal = function() {
  app.gameOver = true;
  app.winner = null;
  app.openResult();
}

app.finishGameDrawPve = function() {
  app.gameOver = true;
  app.winner = null;
  app.openResult();
}

app.tryLocalDrawRequest = function() {
  if (app.gameOver || !app.isPvpLocal) {
    return;
  }
  if (app.localUndoRequest) {
    wx.showToast({ title: '请先处理悔棋申请', icon: 'none' });
    return;
  }
  if (app.localDrawRequest) {
    return;
  }
  app.localDrawRequest = { requesterColor: app.current };
  app.draw();
}

app.execLocalDrawAccept = function() {
  if (!app.localDrawRequest) {
    return;
  }
  app.localDrawRequest = null;
  app.finishGameDrawLocal();
}

app.execLocalDrawReject = function() {
  app.localDrawRequest = null;
  app.draw();
}

app.execLocalDrawCancel = function() {
  app.localDrawRequest = null;
  app.draw();
}

app.sendOnlineDraw = function(msgType) {
  if (!app.onlineSocketCanSend()) {
    app.notifyOnlineSocketSendBlocked();
    return;
  }
  if (msgType === 'DRAW_REQUEST') {
    var remDraw = app.getOnlineDrawCooldownRemainingMs();
    if (remDraw > 0) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: '请等待 ' + Math.ceil(remDraw / 1000) + ' 秒后再发起和棋',
          icon: 'none'
        });
      }
      return;
    }
  }
  if (msgType === 'DRAW_CANCEL') {
    app.onlineDrawCancelPending = true;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: msgType })
  });
  if (msgType === 'DRAW_REQUEST') {
    app.onlineDrawCooldownUntilMs = Date.now() + app.ONLINE_DRAW_COOLDOWN_MS;
    app.startOnlineBarCooldownTicker();
    if (typeof app.draw === 'function') {
      app.draw();
    }
  }
}

/** 同桌：画布上显示同意/拒绝。联机改由弹框处理。 */
app.showDrawRespondRow = function() {
  return !!app.localDrawRequest;
}

app.handleDrawButtonTap = function() {
  if (app.gameOver) {
    return;
  }
  if (app.isPvpOnline) {
    if (!app.onlineSocketCanSend()) {
      app.notifyOnlineSocketSendBlocked();
      return;
    }
    if (app.onlineDrawPending) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title:
            app.pvpOnlineYourColor === app.onlineDrawRequesterColor
              ? '请等待对方处理'
              : '请在弹窗中同意或拒绝',
          icon: 'none'
        });
      }
      return;
    }
    if (app.onlineUndoPending) {
      wx.showToast({ title: '请先处理悔棋申请', icon: 'none' });
      return;
    }
    app.sendOnlineDraw('DRAW_REQUEST');
    return;
  }
  if (app.isPvpLocal) {
    if (app.localUndoRequest) {
      wx.showToast({ title: '请先处理悔棋申请', icon: 'none' });
      return;
    }
    if (app.localDrawRequest) {
      app.execLocalDrawCancel();
      return;
    }
    app.tryLocalDrawRequest();
    return;
  }
  if (typeof wx.showModal === 'function') {
    wx.showModal({
      title: '和棋',
      content: '确定以和棋结束本局吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          app.finishGameDrawPve();
        }
      }
    });
  } else {
    app.finishGameDrawPve();
  }
}

app.isDrawButtonActive = function() {
  if (app.gameOver) {
    return false;
  }
  if (app.isPvpOnline) {
    if (app.onlineSpectatorMode) {
      return false;
    }
    if (!app.onlineWsConnected || app.onlineOpponentLeft) {
      return false;
    }
    /** 已发起和棋或对方发起和棋：等待结果前不可再点和棋 */
    if (app.onlineDrawPending) {
      return false;
    }
    if (app.onlineUndoPending) {
      return false;
    }
    if (
      app.getOnlineDrawCooldownRemainingMs &&
      app.getOnlineDrawCooldownRemainingMs() > 0
    ) {
      return false;
    }
    return true;
  }
  if (app.isPvpLocal) {
    if (app.localDrawRequest) {
      return true;
    }
    if (app.localUndoRequest) {
      return false;
    }
    return true;
  }
  return true;
}

app.isResignButtonActive = function() {
  if (app.gameOver) {
    return false;
  }
  if (app.localDrawRequest) {
    return false;
  }
  if (app.isPvpOnline) {
    if (app.onlineSpectatorMode) {
      return false;
    }
    if (!app.onlineWsConnected || app.onlineOpponentLeft) {
      return false;
    }
    if (app.onlineDrawPending) {
      return false;
    }
  }
  return true;
}

app.handleResignTap = function() {
  if (app.gameOver) {
    return;
  }
  if (app.isPvpOnline) {
    if (!app.onlineSocketCanSend()) {
      app.notifyOnlineSocketSendBlocked();
      return;
    }
    app.socketTask.send({
      data: JSON.stringify({ type: 'RESIGN' })
    });
    return;
  }
  if (app.isPvpLocal) {
    app.finishGameByResignLocal();
    return;
  }
  app.finishGameByResignPve();
}

app.finishGameWithWin = function(r, c, winnerColor) {
  app.gameOver = true;
  app.winner = winnerColor;
  if (
    app.isDailyPuzzle &&
    typeof app.dailyPuzzleBotColor === 'function' &&
    winnerColor !== app.dailyPuzzleBotColor() &&
    app.dailyPuzzleResultKind === 'daily_puzzle_bot_win'
  ) {
    app.dailyPuzzleResultKind = '';
  }
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
  var undoCancelPending = app.onlineUndoCancelPending;
  app.onlineUndoCancelPending = false;
  var drawCancelPending = app.onlineDrawCancelPending;
  app.onlineDrawCancelPending = false;

  /** 对方断线：终局并进入结算（仅本帧触发一次） */
  var finishDueToOppLeave = false;

  /** 用于边沿检测：对方刚发起悔棋/和棋时弹窗提醒回应方 */
  var prevUndoPendingFlag = app.onlineUndoPending;
  var prevDrawPendingFlag = app.onlineDrawPending;

  var prevBlack = app.onlineBlackConnected;
  var prevWhite = app.onlineWhiteConnected;
  var wasOver = app.gameOver;
  /** 本帧应用 STATE 前快照；用于终局后服务端修正胜负/和棋时重新弹出结算（如先误判断线再收到和棋） */
  var prevWinner = app.winner;
  var prevBoard = app.copyBoardFromServer(app.board);
  var prevStoneCount = app.countStonesOnBoard(prevBoard);
  var prevCurrentStone = app.current;
  var nextBoard = app.copyBoardFromServer(data.board);

  /** 实时旁观人数（后端 GameRoom.spectatorSessions.size），用于右上角徽章实时更新 */
  app.spectatorCount = typeof data.spectatorCount === 'number' ? data.spectatorCount : (app.spectatorCount || 0);
  var incW =
    data.whiteConnected === true ||
    data.whiteConnected === 1 ||
    data.whiteConnected === '1' ||
    String(data.whiteConnected) === 'true';
  var incB =
    data.blackConnected === true ||
    data.blackConnected === 1 ||
    data.blackConnected === '1' ||
    String(data.blackConnected) === 'true';
  var wIsBotData =
    data.whiteIsBot === true ||
    data.whiteIsBot === 1 ||
    data.whiteIsBot === 'true';
  var bIsBotData =
    data.blackIsBot === true ||
    data.blackIsBot === 1 ||
    data.blackIsBot === 'true';
  /** 本帧 STATE：人类已占白或黑（与「仅人机占位」区分，见 broadcastState white/blackConnected） */
  var humanWhiteNow = incW && !wIsBotData;
  var humanBlackNow = incB && !bIsBotData;
  var noHumanOpponentYet = !humanWhiteNow && !humanBlackNow;
  var skipBoardFromServer =
    app.isPvpOnline &&
    app.onlinePuzzleFriendRoom &&
    app.onlineSpectatorMode &&
    noHumanOpponentYet &&
    app.countStonesOnBoard(prevBoard) > app.countStonesOnBoard(nextBoard);
  if (!skipBoardFromServer) {
    app.board = nextBoard;
    app.current = app.normalizeOnlineStoneInt(data.current, app.BLACK);
  }
  var newStoneCount = app.countStonesOnBoard(app.board);
  if (app.countStonesOnBoard(app.board) === app.countStonesOnBoard(prevBoard) + 1) {
    app.playPlaceStoneSound();
  }
  app.syncOnlineMoveHistory(prevBoard, app.board);
  if (
    !skipBoardFromServer &&
    app.onlinePuzzleFriendRoom &&
    app.onlineSpectatorMode &&
    noHumanOpponentYet
  ) {
    app.puzzleFriendPracticeStartBoard = app.copyBoardFromServer(app.board);
    app.puzzleFriendPracticeStartCurrent = app.current;
  }
  var prevWasMyUndoRequest =
    app.isPvpOnline &&
    app.screen === 'game' &&
    !app.gameOver &&
    app.onlineUndoPending &&
    app.onlineUndoRequesterColor != null &&
    app.onlineUndoRequesterColor === app.pvpOnlineYourColor;
  var prevWasMyDrawRequest =
    app.isPvpOnline &&
    app.screen === 'game' &&
    !app.gameOver &&
    app.onlineDrawPending &&
    app.onlineDrawRequesterColor != null &&
    app.onlineDrawRequesterColor === app.pvpOnlineYourColor;
  var prevRematchRequesterColor = app.onlineRematchRequesterColor;
  app.gameOver = !!data.gameOver;
  if (!app.gameOver) {
    app.onlineSettleSent = false;
    app.onlineGameEndReason = null;
  } else if (
    data.gameEndReason !== undefined &&
    data.gameEndReason !== null &&
    String(data.gameEndReason).trim() !== ''
  ) {
    app.onlineGameEndReason = String(data.gameEndReason).trim();
  } else {
    app.onlineGameEndReason = null;
  }
  function readClockMs(v) {
    if (v === undefined || v === null) {
      return null;
    }
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  if (data.puzzleRoom !== undefined && data.puzzleRoom !== null) {
    app.onlinePuzzleRoomFromWs =
      data.puzzleRoom === true ||
      data.puzzleRoom === 'true' ||
      data.puzzleRoom === 1 ||
      data.puzzleRoom === '1';
  }
  var noOnlineClock =
    app.onlinePuzzleFriendRoom ||
    app.onlinePuzzleRoomFromWs;
  if (noOnlineClock) {
    app.onlineClockMoveDeadlineWallMs = null;
    app.onlineClockGameDeadlineWallMs = null;
    app.onlineClockPaused = false;
  } else {
    app.onlineClockMoveDeadlineWallMs = readClockMs(data.clockMoveDeadlineWallMs);
    app.onlineClockGameDeadlineWallMs = readClockMs(data.clockGameDeadlineWallMs);
    app.onlineClockPaused = !!data.clockPaused;
  }
  if (data.matchRound !== undefined && data.matchRound !== null) {
    var mr = Number(data.matchRound);
    if (!isNaN(mr) && mr >= 1) {
      var prevMr =
        typeof app.onlineMatchRound === 'number' && !isNaN(app.onlineMatchRound)
          ? app.onlineMatchRound
          : 0;
      app.onlineMatchRound = mr;
      if (
        app.isPvpOnline &&
        !app.onlineSpectatorMode &&
        prevMr > 0 &&
        mr > prevMr &&
        typeof app.clearPerGameConsumableSkillState === 'function'
      ) {
        app.clearPerGameConsumableSkillState();
      }
    }
  }
  if (data.winner === undefined || data.winner === null) {
    app.winner = null;
  } else {
    app.winner = app.normalizeOnlineStoneInt(data.winner, null);
  }
  /**
   * spectator 须严格区分「明确为 false」与「缺省/异常」：若仅写 else 则缺字段时会把旁观清掉，
   * 从「选择聊天」点返回后偶发不完整帧或重连首包会导致残局好友房主底栏误变成和棋/认输样式。
   */
  (function () {
    var s = data.spectator;
    var explicitTrue =
      s === true || s === 'true' || s === 1 || s === '1';
    var explicitFalse =
      s === false || s === 'false' || s === 0 || s === '0';
    if (explicitTrue) {
      app.onlineSpectatorMode = true;
    } else if (explicitFalse) {
      app.onlineSpectatorMode = false;
      app.pvpOnlineYourColor = app.normalizeOnlineStoneInt(
        data.yourColor,
        app.BLACK
      );
    } else if (app.onlinePuzzleFriendRoom && app.onlineSpectatorMode) {
      /* 缺字段：保持旁观 */
    } else if (!app.onlineSpectatorMode) {
      app.pvpOnlineYourColor = app.normalizeOnlineStoneInt(
        data.yourColor,
        app.BLACK
      );
    }
  })();
  if (
    data.blackPieceSkinId !== undefined &&
    data.blackPieceSkinId !== null &&
    String(data.blackPieceSkinId).trim() !== ''
  ) {
    app.onlineBlackPieceSkinId = String(data.blackPieceSkinId).trim();
  } else {
    app.onlineBlackPieceSkinId = null;
  }
  if (
    data.whitePieceSkinId !== undefined &&
    data.whitePieceSkinId !== null &&
    String(data.whitePieceSkinId).trim() !== ''
  ) {
    app.onlineWhitePieceSkinId = String(data.whitePieceSkinId).trim();
  } else {
    app.onlineWhitePieceSkinId = null;
  }
  app.onlineBlackConnected = !!data.blackConnected;
  app.onlineWhiteConnected = !!data.whiteConnected;
  if (
    data.whiteIsBot !== undefined &&
    data.whiteIsBot !== null &&
    data.blackIsBot !== undefined &&
    data.blackIsBot !== null
  ) {
    app.onlineOpponentIsBot = !!data.whiteIsBot || !!data.blackIsBot;
  } else if (data.whiteIsBot !== undefined && data.whiteIsBot !== null) {
    app.onlineOpponentIsBot = !!data.whiteIsBot;
  } else if (data.blackIsBot !== undefined && data.blackIsBot !== null) {
    app.onlineOpponentIsBot = !!data.blackIsBot;
  } else {
    app.onlineOpponentIsBot = false;
  }
  if (data.blackIsBot !== undefined && data.blackIsBot !== null) {
    app.onlineBlackIsBotFlag = !!data.blackIsBot;
  }
  if (data.whiteIsBot !== undefined && data.whiteIsBot !== null) {
    app.onlineWhiteIsBotFlag = !!data.whiteIsBot;
  }
  if (
    app.isPvpOnline &&
    !app.onlineSpectatorMode &&
    (app.onlinePuzzleFriendRoom || app.onlinePuzzleRoomFromWs)
  ) {
    var curOrBoardChanged =
      prevCurrentStone !== app.current || prevStoneCount !== newStoneCount;
    if (curOrBoardChanged) {
      app.onlinePuzzleClientBotGen = (app.onlinePuzzleClientBotGen || 0) + 1;
    }
  }
  if (typeof app.syncOnlineOpponentProfileForBotSeat === 'function') {
    app.syncOnlineOpponentProfileForBotSeat();
  }
  if (
    app.isPvpOnline &&
    app.onlinePuzzleFriendRoom &&
    ((!prevWhite && humanWhiteNow) || (!prevBlack && humanBlackNow))
  ) {
    app.onlineMoveHistory = [];
    app.winningLineCells = null;
    app.lastOpponentMove = null;
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '好友已加入，棋盘已重置', icon: 'none' });
    }
    if (app.onlineSpectatorMode) {
      app.lastMsg = '旁观中 · 好友已加入';
    }
    app.puzzleFriendPracticeStartBoard = null;
    app.puzzleFriendPracticeStartCurrent = null;
  }
  if (app.isPvpOnline && !app.isRandomMatch && !app.onlineOpponentIsBot) {
    if (app.onlineSpectatorMode) {
      if (app.onlineWhiteConnected) {
        app.onlineFriendBothEverConnected = true;
      }
    } else if (app.onlineBlackConnected && app.onlineWhiteConnected) {
      app.onlineFriendBothEverConnected = true;
    }
  }
  if (app.isPvpOnline && (app.screen === 'game' || app.screen === 'matching')) {
    if (app.onlineSpectatorMode) {
      if (app.onlineWhiteConnected) {
        app.onlineOpponentLeft = false;
      } else if (prevWhite && !app.onlineWhiteConnected) {
        app.onlineOpponentLeft = true;
      }
    } else {
      var yc = app.pvpOnlineYourColor;
      var oppWas = yc === app.BLACK ? prevWhite : prevBlack;
      var oppNow = yc === app.BLACK ? app.onlineWhiteConnected : app.onlineBlackConnected;
      if (oppNow) {
        app.onlineOpponentLeft = false;
      } else if (oppWas && !oppNow) {
        app.onlineOpponentLeft = true;
        /**
         * 仅「对局未结束、尚无胜负」时按逃跑终局；若本帧已 gameOver 或已有 winner
         *（含连五/认输等），走下方正常终局，避免胜局因对端断线被误判为「对方离开」。
         */
        if (
          app.screen === 'game' &&
          !wasOver &&
          !data.gameOver &&
          (data.winner === undefined || data.winner === null) &&
          prevBlack &&
          prevWhite &&
          !app.onlineOpponentIsBot &&
          (app.isRandomMatch || app.onlineFriendBothEverConnected)
        ) {
          finishDueToOppLeave = true;
        }
      }
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
  app.onlineDrawPending = !!data.drawPending;
  if (data.drawRequesterColor === undefined || data.drawRequesterColor === null) {
    app.onlineDrawRequesterColor = null;
  } else {
    app.onlineDrawRequesterColor = app.normalizeOnlineStoneInt(
      data.drawRequesterColor,
      null
    );
  }
  if (data.rematchRequesterColor === undefined || data.rematchRequesterColor === null) {
    app.onlineRematchRequesterColor = null;
  } else {
    app.onlineRematchRequesterColor = app.normalizeOnlineStoneInt(
      data.rematchRequesterColor,
      null
    );
  }
  if (
    !app.onlineSpectatorMode &&
    app.isPvpOnline &&
    app.screen === 'game' &&
    prevRematchRequesterColor == null &&
    app.onlineRematchRequesterColor != null &&
    app.pvpOnlineYourColor !== app.onlineRematchRequesterColor &&
    typeof wx !== 'undefined' &&
    typeof wx.showModal === 'function'
  ) {
    wx.showModal({
      title: '对方想再来一局',
      content: '是否同意与对方再来一局？',
      confirmText: '同意',
      cancelText: '拒绝',
      success: function(res) {
        if (!app.isPvpOnline || !app.onlineRematchRequesterColor) {
          return;
        }
        if (app.pvpOnlineYourColor === app.onlineRematchRequesterColor) {
          return;
        }
        if (res.confirm) {
          app.sendOnlineRematchAccept();
        } else {
          app.sendOnlineRematchDecline();
        }
      }
    });
  }
  if (
    prevWasMyUndoRequest &&
    !data.undoPending &&
    prevStoneCount === newStoneCount &&
    !undoCancelPending &&
    typeof app.startUndoRejectedFloat === 'function'
  ) {
    app.startUndoRejectedFloat();
  }
  if (
    prevWasMyDrawRequest &&
    !data.drawPending &&
    !data.gameOver &&
    !drawCancelPending &&
    typeof app.startUndoRejectedFloat === 'function'
  ) {
    app.startUndoRejectedFloat('对方拒绝了你的和棋');
  }
  if (
    finishDueToOppLeave &&
    typeof app.finishOnlineGameOpponentLeave === 'function'
  ) {
    app.finishOnlineGameOpponentLeave();
    return;
  }
  if (
    !app.onlineSpectatorMode &&
    app.isPvpOnline &&
    app.screen === 'game' &&
    !wasOver &&
    !data.gameOver &&
    typeof wx !== 'undefined' &&
    typeof wx.showModal === 'function'
  ) {
    var respY2 = app.pvpOnlineYourColor;
    var urq2 = app.onlineUndoRequesterColor;
    var drq2 = app.onlineDrawRequesterColor;
    if (
      !prevUndoPendingFlag &&
      data.undoPending &&
      urq2 != null &&
      respY2 !== urq2
    ) {
      wx.showModal({
        title: '对方申请悔棋',
        content: '是否同意对方悔棋？',
        confirmText: '同意',
        cancelText: '拒绝',
        success: function(res) {
          if (!app.isPvpOnline || !app.onlineUndoPending) {
            return;
          }
          if (res.confirm) {
            app.sendOnlineUndo('UNDO_ACCEPT');
          } else {
            app.sendOnlineUndo('UNDO_REJECT');
          }
        }
      });
    } else if (
      !prevDrawPendingFlag &&
      data.drawPending &&
      drq2 != null &&
      respY2 !== drq2
    ) {
      wx.showModal({
        title: '对方提议和棋',
        content: '是否同意和棋终局？',
        confirmText: '同意',
        cancelText: '拒绝',
        success: function(res) {
          if (!app.isPvpOnline || !app.onlineDrawPending) {
            return;
          }
          if (res.confirm) {
            app.sendOnlineDraw('DRAW_ACCEPT');
          } else {
            app.sendOnlineDraw('DRAW_REJECT');
          }
        }
      });
    }
  }
  app.lastMsg = '';
  if (!app.onlineSpectatorMode) {
    app.syncLastOpponentMoveOnline(prevBoard, app.board, app.pvpOnlineYourColor);
  }

  if (app.gameOver && !wasOver) {
    /**
     * 须在弹出胜利动画或 openResult 之前发起结算：否则用户快速「再来一局」后新局 STATE 先到，
     * gameOver 变 false，延迟的 openResult 会跳过结算；或 app.onlineMatchRound 已变为下一局导致局次不匹配。
     */
    var endedMatchRound = null;
    if (data.matchRound !== undefined && data.matchRound !== null) {
      var emr = Number(data.matchRound);
      if (!isNaN(emr) && emr >= 1) {
        endedMatchRound = emr;
      }
    }
    if (app.isPvpOnline && !app.onlineSpectatorMode) {
      if (endedMatchRound != null) {
        app.maybeRequestOnlineGameSettle(endedMatchRound);
      } else {
        app.maybeRequestOnlineGameSettle();
      }
    }
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
  if (
    app.isPvpOnline &&
    app.screen === 'game' &&
    app.gameOver &&
    wasOver &&
    (function () {
      var pa = prevWinner === null || prevWinner === undefined;
      var pb = app.winner === null || app.winner === undefined;
      if (pa && pb) {
        return false;
      }
      if (pa !== pb) {
        return true;
      }
      return prevWinner !== app.winner;
    })()
  ) {
    app.onlineSettleSent = false;
    app.lastSettleRating = null;
    if (typeof app.stopResultTuanPointsAnim === 'function') {
      app.stopResultTuanPointsAnim();
    }
    app.openResult();
    return;
  }
  if (!app.gameOver && wasOver) {
    app.screen = 'game';
    app.showResultOverlay = false;
    app.onlineResultOverlaySticky = false;
    if (typeof app.stopResultTuanPointsAnim === 'function') {
      app.stopResultTuanPointsAnim();
    }
    app.clearWinRevealTimer();
    app.winningLineCells = null;
  }
  if (typeof app.syncOnlineWatchSeatFromStateData === 'function') {
    app.syncOnlineWatchSeatFromStateData(data);
  }
  app.tryFetchOnlineOpponentProfile();
  if (typeof app.scheduleOnlinePuzzleClientBotIfNeeded === 'function') {
    app.scheduleOnlinePuzzleClientBotIfNeeded();
  }
  if (typeof app.scheduleSpectatorListRefreshAfterState === 'function') {
    app.scheduleSpectatorListRefreshAfterState();
  }
  app.draw();
}

};
