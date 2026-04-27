/**
 * 首页好友列表（侧边入口 + 遮罩面板）— 对齐 docs/friend-list-home-spec.md
 */
module.exports = function registerFriendListHome(app, deps) {
  var wx = deps.wx;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;
  var render = deps.render;
  var ratingTitle = deps.ratingTitle;

  var STORAGE_OPEN = 'gomoku_home_friend_list_open';
  var STORAGE_CACHE = 'gomoku_home_friend_list_cache_v1';
  var STORAGE_FAB_POS = 'gomoku_home_friend_fab_pos_v1';
  /** 悬浮球半径（逻辑 px），与拖拽/吸附/命中共用 */
  var HOME_FRIEND_LIST_FAB_R = 22.5;
  /** 好友列表行高（设计 rpx，原 96 增大 20%） */
  var HOME_FRIEND_LIST_ROW_DESIGN_RPX = Math.round(96 * 1.2);
  /** 左滑后右侧「备注 / 删除」列宽（rpx），与微信侧栏条接近 */
  var FRIEND_LIST_SWIPE_REMARK_RPX = 80;
  var FRIEND_LIST_SWIPE_DELETE_RPX = 80;
  /** 行内右侧「观战」按钮（仅好友在对局中时显示，与左滑区独立） */
  var FRIEND_LIST_WATCH_BTN_RPX = 72;
  /** 在「半行高」基础上再缩短高度（略收紧以成饱满药丸，勿过高挡昵称） */
  var FRIEND_LIST_WATCH_BTN_HEIGHT_TRIM_RPX = 6;
  /** 相对行右缘再左移（约 10px，分两次各 5） */
  var FRIEND_LIST_WATCH_BTN_SHIFT_LEFT_RPX = 10;
  /** 行内「邀请」药丸宽（rpx），与观战按钮同排布；仅 online 且非 inGame 时显示（PRD §4.4） */
  var FRIEND_LIST_INVITE_BTN_RPX = 72;
  /** 判定横向滑动 vs 竖向滚动（px²） */
  var FRIEND_LIST_SWIPE_DECIDE_PX2 = 8 * 8;
  /** 抠图或 contain 策略变更时递增，使缓存失效 */
  var FRIEND_FAB_DRAW_REV = 7;
  /**
   * contain 边长 = 直径×系数；显著 >1 时图标主体放大，外圈黑边/毛边落在圆外被裁掉。
   */
  var FRIEND_FAB_CONTAIN_MUL = 1.48;
  /** 圆形裁剪相对半径的比例；略 <1 再切掉最外一圈像素，去黑毛边 */
  var FRIEND_FAB_CLIP_R_MUL = 0.93;
  /**
   * 未读呼吸动画对整页 drawHome 的节流（ms）。过低会徒增 CPU；过高动画发涩。
   */
  var FRIEND_FAB_UNREAD_PULSE_MIN_DRAW_MS = 33;
  /** 来新消息时加强显示（与呼吸叠加） */
  var FRIEND_FAB_MSG_HIGHLIGHT_MS = 2200;
  var friendFabUnreadPulseLastDrawMs = 0;

  /** 好友面板 / 默认 FAB 相对原锚点略下移 */
  function homeFriendExtraDown() {
    return app.rpx(16);
  }

  app.homeFriendListOpen = false;
  /** 是否已执行过一次 ensureHomeFriendListPersistedStateOnce */
  app._friendListPersistRestored = false;
  /** 对战中打开好友列表时，自动过滤为「当前观战」（inGame = true）的朋友 */
  app._gameSpectatorFilter = false;
  /**
   * 观战模式下列表数据：null = 未拉到 / 回退 inGame 本地过滤；数组 = GET /api/rooms/{id}/spectators
   */
  app._spectatorListRoomFriends = null;
  app.spectatorListLoading = false;
  /** 收到联机 STATE 时合并刷新观战列表，避免每包打满 HTTP */
  var _spectatorListStateRefreshTimer = null;
  var SPECTATOR_LIST_STATE_REFRESH_MS = 380;
  app.homeFriendFabPressed = false;
  /** 用户拖动后的悬浮按钮中心；未设置时用默认（左侧对齐吉祥物高度） */
  app.homeFriendFabCustomCx = undefined;
  app.homeFriendFabCustomCy = undefined;
  app._friendFabTouchId = null;
  app._friendFabTouchStartX = 0;
  app._friendFabTouchStartY = 0;
  app._friendFabGrabFx = 0;
  app._friendFabGrabFy = 0;
  app._friendFabGrabCx = 0;
  app._friendFabGrabCy = 0;
  app.homeFriendFabDragging = false;
  app._fabSnapAnim = null;
  app._fabSnapRaf = null;
  app._fabSnapUsesTimeout = false;
  /** 未读私聊时 FAB 呼吸动画；仅首页且列表收起时跑 rAF */
  app._friendFabUnreadPulseRaf = null;
  app._friendFabUnreadPulseUsesTimeout = false;
  app._friendFabInEdgeSnap = false;
  app.friendListRaw = [];
  app.friendListSearchQuery = '';
  app.friendListScrollY = 0;
  app.friendListLoading = false;
  app.friendListLoadError = false;
  app._friendListScrollTouchId = null;
  app._friendListScrollLastY = 0;
  app._friendListRowTapIdx = -1;
  app._friendListRowTapX = 0;
  app._friendListRowTapY = 0;
  /**
   * 好友行左滑：{ peerKey: string | null, offset: number }，offset 为 0 ~ actionTotal
   */
  app.friendListRowSwipe = { peerKey: null, offset: 0 };
  /** 当前列表手势：null | { id, x0, y0, idx, peerKey, mode: 0 未决 | 1 竖向滚动 | 2 横向左滑, startOff } */
  app._flRowTouch = null;
  /** 与某好友的会话面板（画布内）；消息仅存内存 */
  app.homeFriendChatPeer = null;
  app.friendChatScrollY = 0;
  app.friendChatMessagesByPeer = {};
  /** 私聊输入草稿（画布白框与键盘 defaultValue 同步；仅点「发送」才 POST） */
  app.friendChatComposeDraft = '';
  /** 有未读好友私聊时 FAB 呼吸动画（见 drawHomeFriendListFab） */
  app._friendDmUnreadPeers = {};
  /** 收到新私聊时用于一次「强高亮」脉冲（Date.now() + ms 前有效） */
  app._friendFabHighlightUntil = 0;
  app._friendChatMsgId = 0;
  app._friendChatScrollTouchId = null;
  app._friendChatScrollLastY = 0;
  /** 私聊消息区本次手势是否发生过滚动，用于区分「点空白关面板」与滑动列表 */
  app._friendChatScrollMoved = false;
  app._friendChatNeedScrollBottom = false;
  app._friendChatLayoutTotalH = 0;
  app._friendChatBarDownX = undefined;
  app._friendChatBarDownY = undefined;
  app._friendChatBarHitKind = null;
  /** 私聊输入框光标闪烁（键盘打开时 setInterval 驱动 draw） */
  app._friendChatInpBlinkTimer = null;
  /** 系统键盘高度（与 window 同逻辑 px）；仅私聊输入使用 */
  app._friendDmKeyboardHeight = 0;
  app._friendDmKeyboardHeightListener = null;
  /** 唤起键盘前一刻的 window 高度，用于区分「窗口已随键盘缩小」与「仅上报 kb 高度」 */
  app._friendDmLayoutFullH = 0;
  app._friendAvImgs = app._friendAvImgs || {};
  /** 黑底抠图缓存：与 {@link app.homeFriendFabImg} 引用对应 */
  app._friendFabKeyCacheImg = null;
  app._friendFabKeyCacheCanvas = null;
  app._friendFabKeyCacheRev = -1;
  app._flSlideT = 1;
  app._flAnimRaf = null;
  app._flAnimUsesTimeout = false;
  app._flAnimMode = null;
  app._flAnimStart = 0;

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function persistOpen() {
    try {
      if (wx && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_OPEN, app.homeFriendListOpen ? '1' : '0');
      }
    } catch (e) {}
  }

  function persistCache(list) {
    try {
      if (wx && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_CACHE, JSON.stringify(list || []));
      }
    } catch (e) {}
  }

  function loadCache() {
    try {
      if (wx && wx.getStorageSync) {
        var s = wx.getStorageSync(STORAGE_CACHE);
        if (s && typeof s === 'string') {
          var j = JSON.parse(s);
          if (Array.isArray(j)) {
            return j;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function persistFabPos() {
    try {
      if (
        wx &&
        wx.setStorageSync &&
        typeof app.homeFriendFabCustomCx === 'number' &&
        typeof app.homeFriendFabCustomCy === 'number'
      ) {
        wx.setStorageSync(
          STORAGE_FAB_POS,
          JSON.stringify({
            cx: app.homeFriendFabCustomCx,
            cy: app.homeFriendFabCustomCy
          })
        );
      }
    } catch (eP) {}
  }

  function loadFabPos() {
    try {
      if (wx && wx.getStorageSync) {
        var s = wx.getStorageSync(STORAGE_FAB_POS);
        if (s && typeof s === 'string') {
          var j = JSON.parse(s);
          if (j && typeof j.cx === 'number' && typeof j.cy === 'number') {
            return j;
          }
        }
      }
    } catch (eL) {}
    return null;
  }

  /**
   * 悬浮球限制在「状态栏/刘海以下 ~ 底栏/安全区底沿以上」主内容区（与对局/首页等划线区一致）。
   */
  function getFabContentClampBounds(r) {
    var m = app.rpx(8);
    var minX = r + m;
    var maxX = app.W - r - m;
    var inset =
      typeof app.getGameScreenInsetTop === 'function'
        ? app.getGameScreenInsetTop()
        : Math.max(
            app.sys.statusBarHeight || 24,
            app.sys.safeArea && app.sys.safeArea.top != null
              ? app.sys.safeArea.top
              : 0
          );
    var safeBottomY =
      app.sys && app.sys.safeArea && app.sys.safeArea.bottom != null
        ? app.sys.safeArea.bottom
        : app.H;
    var minYInset = inset + r + m;
    var maxYSafe = safeBottomY - r - m;

    function fin(minY, maxY) {
      if (maxY < minY) {
        var mid = (minY + maxY) * 0.5;
        minY = mid;
        maxY = mid;
      }
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    if (
      app.screen === 'home' &&
      typeof app.getHomeLayout === 'function' &&
      typeof app.getHomeNavBarLayout === 'function'
    ) {
      var hl = app.getHomeLayout();
      var nav = app.getHomeNavBarLayout();
      if (
        hl &&
        nav &&
        typeof hl.bottomNavTop === 'number' &&
        typeof nav.navBottom === 'number'
      ) {
        return fin(nav.navBottom + r + m, hl.bottomNavTop - r - m);
      }
    }

    if (
      (app.screen === 'game' || app.screen === 'admin_puzzle') &&
      app.layout &&
      typeof app.getGameActionBarLayout === 'function'
    ) {
      try {
        var gab = app.getGameActionBarLayout();
        if (gab && typeof gab.y0 === 'number') {
          return fin(minYInset, gab.y0 - r - m);
        }
      } catch (eG) {}
    }

    if (app.screen === 'replay' && app.layout) {
      if (typeof app.getReplayControlsButtonY === 'function') {
        var yReplay = app.getReplayControlsButtonY();
        return fin(minYInset, yReplay - 24 - r - m);
      }
    }

    if (app.screen === 'history' && app.historyReplayOverlayVisible && app.layout) {
      if (typeof app.getReplayControlsButtonY === 'function') {
        var yHRO = app.getReplayControlsButtonY();
        return fin(minYInset, yHRO - 24 - r - m);
      }
    }

    if (app.screen === 'history' && typeof app.getHistoryPageLayout === 'function') {
      var hL = app.getHistoryPageLayout();
      if (
        hL &&
        typeof hL.listBottom === 'number' &&
        typeof hL.insetTop === 'number'
      ) {
        return fin(hL.insetTop + r + m, hL.listBottom - r - m);
      }
    }

    if (app.screen === 'matching' && typeof app.getMatchingPageLayout === 'function') {
      var mL = app.getMatchingPageLayout();
      if (mL && typeof mL.cancelCy === 'number') {
        return fin(minYInset, mL.cancelCy - app.rpx(32) - r - m);
      }
    }

    if (app.screen === 'review_hub' && typeof app.getReviewHubLayout === 'function') {
      var rL = app.getReviewHubLayout();
      if (rL && typeof rL.backY === 'number') {
        return fin(minYInset, rL.backY - 24 - r - m);
      }
    }

    if (app.screen === 'pve_color' && typeof app.getPveColorLayout === 'function') {
      var pL = app.getPveColorLayout();
      if (pL && typeof pL.backY === 'number') {
        return fin(minYInset, pL.backY - 24 - r - m);
      }
    }

    return fin(minYInset, maxYSafe);
  }

  function clampFabCenter(cx, cy, r) {
    var b = getFabContentClampBounds(r);
    return {
      cx: Math.min(b.maxX, Math.max(b.minX, cx)),
      cy: Math.min(b.maxY, Math.max(b.minY, cy))
    };
  }

  /** 手指在触边带内时返回吸边目标；否则 null（仍跟手，不吸边） */
  function getSnapEdgeIntent(cx, cy, r, fingerX) {
    var c = clampFabCenter(cx, cy, r);
    var m = app.rpx(8);
    var minX = r + m;
    var maxX = app.W - r - m;
    var edgeTouch = app.rpx(10);
    var fx = fingerX;
    var touchLeft =
      typeof fx === 'number' && fx >= 0 && fx <= edgeTouch;
    var touchRight =
      typeof fx === 'number' && fx <= app.W && fx >= app.W - edgeTouch;
    if (!touchLeft && !touchRight) {
      return null;
    }
    var targetCx = c.cx;
    if (touchLeft && touchRight) {
      targetCx = fx < app.W * 0.5 ? minX : maxX;
    } else if (touchLeft) {
      targetCx = minX;
    } else {
      targetCx = maxX;
    }
    return { targetCx: targetCx, targetCy: c.cy };
  }

  /**
   * 吸边：仅当手指触点落在屏左/右缘的「触边带」内时磁力贴到 minX/maxX。
   * fingerX 可选；无触点信息时不吸边。
   */
  function snapFabHorizontalEdge(cx, cy, r, fingerX) {
    var c = clampFabCenter(cx, cy, r);
    var intent = getSnapEdgeIntent(cx, cy, r, fingerX);
    if (!intent) {
      return c;
    }
    return clampFabCenter(intent.targetCx, intent.targetCy, r);
  }

  function stopFabSnapAnim(jumpToEnd) {
    if (app._fabSnapRaf != null) {
      try {
        if (app._fabSnapUsesTimeout) {
          clearTimeout(app._fabSnapRaf);
        } else if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(app._fabSnapRaf);
        }
      } catch (eS) {}
    }
    app._fabSnapRaf = null;
    app._fabSnapUsesTimeout = false;
    if (jumpToEnd && app._fabSnapAnim && typeof app.homeFriendFabCustomCx === 'number') {
      app.homeFriendFabCustomCx = app._fabSnapAnim.toCx;
    }
    app._fabSnapAnim = null;
  }

  function startFabSnapAnim(fromCx, toCx, rSnap) {
    stopFabSnapAnim(false);
    if (Math.abs(toCx - fromCx) < 0.75) {
      app.homeFriendFabCustomCx = toCx;
      if (typeof app.draw === 'function') {
        app.draw();
      }
      return;
    }
    var dur =
      app.HOME_FAB_SNAP_MS != null ? app.HOME_FAB_SNAP_MS : 1040;
    app._fabSnapAnim = {
      fromCx: fromCx,
      toCx: toCx,
      start: Date.now(),
      duration: dur,
      r: rSnap
    };
    function tick() {
      var a = app._fabSnapAnim;
      if (!a) {
        app._fabSnapRaf = null;
        return;
      }
      var u = (Date.now() - a.start) / a.duration;
      u = Math.min(1, Math.max(0, u));
      var e = easeInOut(u);
      app.homeFriendFabCustomCx = a.fromCx + (a.toCx - a.fromCx) * e;
      if (typeof app.draw === 'function') {
        app.draw();
      }
      if (u < 1) {
        if (typeof requestAnimationFrame === 'function') {
          app._fabSnapUsesTimeout = false;
          app._fabSnapRaf = requestAnimationFrame(tick);
        } else {
          app._fabSnapUsesTimeout = true;
          app._fabSnapRaf = setTimeout(tick, 16);
        }
      } else {
        app.homeFriendFabCustomCx = a.toCx;
        app._fabSnapAnim = null;
        app._fabSnapRaf = null;
        app._fabSnapUsesTimeout = false;
        if (typeof app.draw === 'function') {
          app.draw();
        }
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      app._fabSnapUsesTimeout = false;
      app._fabSnapRaf = requestAnimationFrame(tick);
    } else {
      app._fabSnapUsesTimeout = true;
      app._fabSnapRaf = setTimeout(tick, 16);
    }
  }

  /**
   * 是否已吸在左/右停靠点（仅此时才允许半圆收起态）。
   * 使用较严的容差，避免未贴边时误判。
   */
  function fabEdgeCollapseSide(cx, cy, r) {
    var m = app.rpx(8);
    var minX = r + m;
    var maxX = app.W - r - m;
    var epsDock = Math.max(1, app.rpx(2.5));
    if (Math.abs(cx - minX) <= epsDock) {
      return 'left';
    }
    if (Math.abs(cx - maxX) <= epsDock) {
      return 'right';
    }
    return 'none';
  }

  /**
   * 贴左右边时「收起二分之一」：圆心在左缘 x=0 或右缘 x=W。
   * 仅当用户拖动保存过位置且已吸边时收起；默认浮动位始终完整圆形。
   */
  function fabEdgeCollapseDrawCenter(cx, cy, r) {
    if (
      typeof app.homeFriendFabCustomCx !== 'number' ||
      typeof app.homeFriendFabCustomCy !== 'number'
    ) {
      return { cx: cx, cy: cy };
    }
    var side = fabEdgeCollapseSide(cx, cy, r);
    if (side === 'left') {
      return { cx: 0, cy: cy };
    }
    if (side === 'right') {
      return { cx: app.W, cy: cy };
    }
    return { cx: cx, cy: cy };
  }

  app.ensureHomeFriendListPersistedStateOnce = function () {
    if (app._friendListPersistRestored) {
      return;
    }
    app._friendListPersistRestored = true;
    var cached = loadCache();
    if (cached && cached.length) {
      normalizeFriendListRowsInPlace(cached);
      app.friendListRaw = cached;
      syncFriendListAvatarImgs(cached);
    }
    var fabPos = loadFabPos();
    if (fabPos) {
      var sp0 = snapFabHorizontalEdge(
        fabPos.cx,
        fabPos.cy,
        HOME_FRIEND_LIST_FAB_R
      );
      app.homeFriendFabCustomCx = sp0.cx;
      app.homeFriendFabCustomCy = sp0.cy;
    }
    app.homeFriendListOpen = false;
    persistOpen();
  };

  app.getHomeFriendListFabLayout = function () {
    var r = HOME_FRIEND_LIST_FAB_R;
    var hl =
      typeof app.getHomeLayout === 'function' ? app.getHomeLayout() : null;
    var safeL =
      app.sys && app.sys.safeArea && app.sys.safeArea.left != null
        ? app.sys.safeArea.left
        : 0;
    var leftPad = safeL + app.rpx(8);
    var defCx = leftPad + r;
    var defCy =
      (hl && hl.mascotCy != null
        ? hl.mascotCy
        : app.H * (300 / 812)) + homeFriendExtraDown();
    var cx = defCx;
    var cy = defCy;
    if (
      typeof app.homeFriendFabCustomCx === 'number' &&
      typeof app.homeFriendFabCustomCy === 'number'
    ) {
      cx = app.homeFriendFabCustomCx;
      cy = app.homeFriendFabCustomCy;
    }
    var c = clampFabCenter(cx, cy, r);
    return { cx: c.cx, cy: c.cy, r: r };
  };

  /**
   * 好友入口：人物剪影（头圆 + 肩线贝塞尔）；颜色随当前界面主题 title。
   */
  app.drawHomeFriendListFabIcon = function (cx, cy, r, iconFill) {
    var px = function (v) {
      return app.snapPx(v);
    };
    var headR = r * 0.28;
    var headCy = cy - r * 0.3;
    app.ctx.fillStyle = iconFill || '#5D4037';
    app.ctx.beginPath();
    app.ctx.arc(px(cx), px(headCy), px(headR), 0, Math.PI * 2);
    app.ctx.fill();

    app.ctx.beginPath();
    app.ctx.moveTo(px(cx - r * 0.34), px(cy - r * 0.04));
    app.ctx.bezierCurveTo(
      px(cx - r * 0.4),
      px(cy + r * 0.42),
      px(cx + r * 0.4),
      px(cy + r * 0.42),
      px(cx + r * 0.34),
      px(cy - r * 0.04)
    );
    app.ctx.quadraticCurveTo(
      px(cx),
      px(cy - r * 0.14),
      px(cx - r * 0.34),
      px(cy - r * 0.04)
    );
    app.ctx.fill();
  };

  /**
   * 键盘顶沿 Y（输入条底边应 ≤ 该值 − pad）。见 _friendDmLayoutFullH + syncCanvas。
   */
  function friendChatKeyboardTopLineY(kbH) {
    if (!kbH || kbH <= 0) {
      return app.H;
    }
    var padR =
      typeof app.friendDmKeyboardTopExtraPadRpx === 'number'
        ? app.friendDmKeyboardTopExtraPadRpx
        : 16;
    var pad = app.rpx(padR);
    var full = app._friendDmLayoutFullH || app.H;
    var wh = app.H;
    if (typeof wx.getWindowInfo === 'function') {
      try {
        var wi = wx.getWindowInfo();
        if (wi && typeof wi.windowHeight === 'number' && wi.windowHeight > 0) {
          wh = wi.windowHeight;
        }
      } catch (eW) {}
    }
    var shrunkTh =
      typeof app.friendDmKeyboardShrinkThresholdRpx === 'number'
        ? app.rpx(app.friendDmKeyboardShrinkThresholdRpx)
        : app.rpx(24);
    if (wh < full - shrunkTh) {
      return wh - pad;
    }
    return full - kbH - pad;
  }

  app.getHomeFriendListPanelLayout = function () {
    var panelW = app.W * (280 / 375);
    var nav =
      typeof app.getHomeNavBarLayout === 'function'
        ? app.getHomeNavBarLayout()
        : null;
    var hl =
      typeof app.getHomeLayout === 'function' ? app.getHomeLayout() : null;
    var safeL =
      app.sys && app.sys.safeArea && app.sys.safeArea.left != null
        ? app.sys.safeArea.left
        : 0;
    var x0 = safeL + app.rpx(8);
    var y0 =
      (nav && nav.navBottom != null
        ? nav.navBottom
        : app.H * (120 / 812)) + homeFriendExtraDown();
    var gapAboveDock = app.rpx(10);
    var bottomY =
      hl && hl.bottomNavTop != null
        ? hl.bottomNavTop - gapAboveDock
        : app.H - app.rpx(24);
    var panelH = Math.max(0, bottomY - y0);
    var headerH = app.rpx(88);
    var searchH = app.rpx(64);
    var listTop = y0 + headerH + searchH;
    var listH = Math.max(app.rpx(120), panelH - headerH - searchH);
    var chatInputBarH = app.rpx(112);
    var chatMsgTop = y0 + headerH;
    var panelBottom = y0 + panelH;
    var chatInputBarY = panelBottom - chatInputBarH;
    var chatMsgH = Math.max(
      app.rpx(80),
      panelH - headerH - chatInputBarH
    );
    var chatMsgHNoKb = chatMsgH;
    var chatMsgLiftPx = 0;
    if (app.homeFriendChatPeer) {
      chatMsgHNoKb = Math.max(
        app.rpx(80),
        chatInputBarY - chatMsgTop
      );
      chatMsgH = chatMsgHNoKb;
      var kbH = app._friendDmKeyboardHeight || 0;
      if (kbH > 0) {
        var keyboardTop = friendChatKeyboardTopLineY(kbH);
        var yInp0 = chatInputBarY;
        chatInputBarY = Math.max(
          chatMsgTop + app.rpx(80),
          Math.min(yInp0, keyboardTop - chatInputBarH)
        );
        chatMsgH = Math.max(app.rpx(80), chatInputBarY - chatMsgTop);
      }
      if (chatMsgHNoKb > chatMsgH) {
        chatMsgLiftPx = chatMsgHNoKb - chatMsgH;
      }
    }
    return {
      x0: x0,
      y0: y0,
      w: panelW,
      h: panelH,
      headerH: headerH,
      searchH: searchH,
      listTop: listTop,
      listH: listH,
      rowH: app.rpx(HOME_FRIEND_LIST_ROW_DESIGN_RPX),
      chatInputBarH: chatInputBarH,
      chatInputBarY: chatInputBarY,
      chatMsgTop: chatMsgTop,
      chatMsgH: chatMsgH,
      chatMsgLiftPx: chatMsgLiftPx
    };
  };

  function getFilteredFriends() {
    var isSpectatorMode = !!app._gameSpectatorFilter && app.isPvpOnline;
    var raw;
    if (isSpectatorMode) {
      raw =
        app._spectatorListRoomFriends != null
          ? app._spectatorListRoomFriends
          : app.friendListRaw || [];
    } else {
      raw = app.friendListRaw || [];
    }
    var q = (app.friendListSearchQuery || '').trim().toLowerCase();
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var f = raw[i];
      if (
        isSpectatorMode &&
        app._spectatorListRoomFriends == null &&
        !friendRowInGame(f)
      ) {
        continue;
      }
      if (q && !isSpectatorMode) {
        var name = String(f.displayName || f.nickname || '').toLowerCase();
        var rmk = String(f.remark != null ? f.remark : '').toLowerCase();
        if (name.indexOf(q) < 0 && rmk.indexOf(q) < 0) {
          continue;
        }
      }
      out.push(f);
    }
    out.sort(function (a, b) {
      var ar = friendListActivityRank(a);
      var br = friendListActivityRank(b);
      if (ar !== br) {
        return br - ar;
      }
      var ao = friendRowIsOnline(a) ? 1 : 0;
      var bo = friendRowIsOnline(b) ? 1 : 0;
      if (ao !== bo) {
        return bo - ao;
      }
      var na = String((a && (a.displayName || a.nickname)) || '');
      var nb = String((b && (b.displayName || b.nickname)) || '');
      try {
        return na.localeCompare(nb, 'zh-Hans-CN');
      } catch (eLc) {
        return na < nb ? -1 : na > nb ? 1 : 0;
      }
    });
    return out;
  }

  function ensureAvatarImg(peerId, url) {
    if (!url || !peerId) {
      return;
    }
    if (app._friendAvImgs['k' + peerId]) {
      return;
    }
    var img =
      typeof wx.createImage === 'function' ? wx.createImage() : null;
    if (!img) {
      return;
    }
    app._friendAvImgs['k' + peerId] = img;
    img.onload = function () {
      if (typeof app.draw === 'function') {
        app.draw();
      }
    };
    img.onerror = function () {
      app._friendAvImgs['k' + peerId] = { _failed: true };
    };
    img.src = url;
  }

  /**
   * 为当前列表中的行启动头像加载（createImage + onload 触发重绘）。
   * 从缓存冷启动、仅打开侧栏不拉 API 时也必须调用，否则无此前 refresh 则永远不加载头像。
   * @param {Array<{peerUserId?: *, avatarUrl?: string}>|null|undefined} list 默认用 app.friendListRaw
   */
  function syncFriendListAvatarImgs(list) {
    var raw = list;
    if (raw == null) {
      raw = app.friendListRaw;
    }
    if (!raw || !raw.length) {
      return;
    }
    var i;
    for (i = 0; i < raw.length; i++) {
      var row = raw[i];
      if (row && row.peerUserId && row.avatarUrl) {
        ensureAvatarImg(row.peerUserId, row.avatarUrl);
      }
    }
  }

  function getFriendChatKey(peerId) {
    if (peerId == null || peerId === '') {
      return 'k';
    }
    return 'k' + String(peerId).trim();
  }

  /**
   * 在线状态：接口 boolean online；兼容 isOnline / is_online、1/0、字符串。
   * 与 inGame 的关系由 {@link normalizeFriendListRowsInPlace} 合并（对局中亦记为在线）。
   */
  function friendRowIsOnline(fr) {
    if (!fr) {
      return false;
    }
    var v = fr.online;
    if (v == null && fr.isOnline != null) {
      v = fr.isOnline;
    }
    if (v == null && fr.is_online != null) {
      v = fr.is_online;
    }
    if (v === true || v === 1) {
      return true;
    }
    if (typeof v === 'string') {
      var s = v.replace(/^\s+|\s+$/g, '').toLowerCase();
      return s === 'true' || s === '1' || s === 'yes';
    }
    return false;
  }

  /**
   * 是否处于未结束对局且棋手挂在 Gomoku 房间 WS（与 online 正交）；接口字段 inGame / in_game。
   */
  function friendRowInGame(fr) {
    if (!fr) {
      return false;
    }
    var v = fr.inGame;
    if (v == null && fr.in_game != null) {
      v = fr.in_game;
    }
    if (v === true || v === 1) {
      return true;
    }
    if (typeof v === 'string') {
      var s = v.replace(/^\s+|\s+$/g, '').toLowerCase();
      return s === 'true' || s === '1' || s === 'yes';
    }
    return false;
  }

  /**
   * 是否挂在某局 Gomoku 观战位（与 inGame 二选一）；接口 spectating。
   */
  function friendRowEloScore(fr) {
    if (!fr) {
      return null;
    }
    var e = fr.eloScore;
    if (e == null && fr.elo_score != null) {
      e = fr.elo_score;
    }
    if (e == null) {
      return null;
    }
    var n = Number(e);
    if (isNaN(n)) {
      return null;
    }
    return n;
  }

  /**
   * 与 ratingTitle.js 段位表一致的称号（二字段之一）；缺 elo 时用默认分映射。
   */
  function friendListRowTitleName(fr) {
    if (fr) {
      var t = fr.titleName;
      if (t == null && fr.title_name != null) {
        t = fr.title_name;
      }
      if (t != null) {
        var s0 = String(t).replace(/^\s+|\s+$/g, '');
        if (s0) {
          return s0;
        }
      }
    }
    var elo = friendRowEloScore(fr);
    if (
      ratingTitle &&
      typeof ratingTitle.getRankAndTitleByElo === 'function'
    ) {
      var rt = ratingTitle.getRankAndTitleByElo(
        elo != null ? elo : 1200
      );
      if (rt && rt.titleName) {
        return String(rt.titleName);
      }
    }
    return '';
  }
  app.resolveFriendRowTitleName = friendListRowTitleName;

  function friendRowSpectating(fr) {
    if (!fr) {
      return false;
    }
    if (friendRowInGame(fr)) {
      return false;
    }
    var v = fr.spectating;
    if (v == null && fr.is_spectating != null) {
      v = fr.is_spectating;
    }
    if (v == null && fr.isSpectating != null) {
      v = fr.isSpectating;
    }
    if (v === true || v === 1) {
      return true;
    }
    if (typeof v === 'string') {
      var s2 = v.replace(/^\s+|\s+$/g, '').toLowerCase();
      return s2 === 'true' || s2 === '1' || s2 === 'yes';
    }
    return false;
  }

  function friendListActivityRank(fr) {
    if (!fr) {
      return 0;
    }
    if (friendRowInGame(fr)) {
      return 2;
    }
    if (friendRowSpectating(fr)) {
      return 1;
    }
    if (friendRowIsOnline(fr)) {
      return 0;
    }
    return -1;
  }

  /** 兼容缓存/旧字段，保证列表行与未读 map、头像缓存共用 peerUserId；并规范 online / inGame */
  function normalizeFriendListRowsInPlace(list) {
    if (!list || !list.length) {
      return;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) {
        continue;
      }
      if (r.peerUserId == null) {
        if (r.peer_user_id != null) {
          r.peerUserId = r.peer_user_id;
        } else if (r.userId != null) {
          r.peerUserId = r.userId;
        }
      }
      r.inGame = friendRowInGame(r);
      r.spectating = r.inGame ? false : friendRowSpectating(r);
      r.online = friendRowIsOnline(r) || r.inGame || r.spectating;
      if (r.remark == null) {
        r.remark = '';
      }
    }
  }

  /**
   * 拉取当前联机房的观战好友（与棋盘徽章总人数 spectatorCount 配合展示）
   * @param {boolean} silentRefresh 为 true 时不进入全屏「加载中」、不清空已展示列表（用于 STATE 合并刷新）
   */
  /**
   * 对局内右上角观战面板的列表（不打开侧栏好友列表）
   * @param {boolean} silentRefresh 为 true 时不展示全屏感加载、不清空已展示
   */
  app.refreshSpectatorPopoverList = function (silentRefresh) {
    var silent = !!silentRefresh;
    if (!roomApi || typeof roomApi.roomSpectatorsOptions !== 'function') {
      if (!silent) {
        app.spectatorPopoverRows = [];
        app.spectatorPopoverListLoading = false;
      }
      return;
    }
    var roomId = app.onlineRoomId;
    if (!roomId) {
      if (!silent) {
        app.spectatorPopoverRows = [];
        app.spectatorPopoverListLoading = false;
      }
      return;
    }
    if (!silent) {
      app.spectatorPopoverListLoading = true;
      app.spectatorPopoverRows = null;
    }
    wx.request(
      Object.assign(roomApi.roomSpectatorsOptions(roomId), {
        success: function (res) {
          if (!silent) {
            app.spectatorPopoverListLoading = false;
          }
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (eJ) {
              d = null;
            }
          }
          if (res.statusCode === 200 && d && Array.isArray(d.friends)) {
            var arr = d.friends.slice();
            normalizeFriendListRowsInPlace(arr);
            var j;
            for (j = 0; j < arr.length; j++) {
              var row = arr[j];
              if (row) {
                row._spectatorInRoom = true;
                row.inGame = true;
                row.online = true;
              }
            }
            app.spectatorPopoverRows = arr;
            syncFriendListAvatarImgs(arr);
          } else {
            if (!silent) {
              app.spectatorPopoverRows = null;
            }
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
        },
        fail: function () {
          if (!silent) {
            app.spectatorPopoverListLoading = false;
            app.spectatorPopoverRows = null;
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
        }
      })
    );
  };

  function fetchSpectatorsForCurrentRoom(silentRefresh) {
    var silent = !!silentRefresh;
    if (!roomApi || typeof roomApi.roomSpectatorsOptions !== 'function') {
      if (!silent) {
        app._spectatorListRoomFriends = [];
        app.spectatorListLoading = false;
      }
      return;
    }
    var roomId = app.onlineRoomId;
    if (!roomId) {
      if (!silent) {
        app._spectatorListRoomFriends = [];
        app.spectatorListLoading = false;
      }
      return;
    }
    if (!silent) {
      app.spectatorListLoading = true;
      app._spectatorListRoomFriends = null;
    }
    wx.request(
      Object.assign(roomApi.roomSpectatorsOptions(roomId), {
        success: function (res) {
          if (!silent) {
            app.spectatorListLoading = false;
          }
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (eJ) {
              d = null;
            }
          }
          if (res.statusCode === 200 && d && Array.isArray(d.friends)) {
            var arr = d.friends.slice();
            normalizeFriendListRowsInPlace(arr);
            var j;
            for (j = 0; j < arr.length; j++) {
              var row = arr[j];
              if (row) {
                row._spectatorInRoom = true;
                row.inGame = true;
                row.online = true;
              }
            }
            app._spectatorListRoomFriends = arr;
            syncFriendListAvatarImgs(arr);
          } else {
            if (!silent) {
              app._spectatorListRoomFriends = null;
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '观战列表加载失败', icon: 'none' });
              }
            }
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
        },
        fail: function () {
          if (!silent) {
            app.spectatorListLoading = false;
            app._spectatorListRoomFriends = null;
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '网络异常', icon: 'none' });
            }
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
        }
      })
    );
  }

  /**
   * 联机每帧 STATE 后调度刷新观战侧栏（侧栏以观战模式打开时）；节流合并，避免对局热时请求过密
   */
  function scheduleSpectatorListRefreshAfterState() {
    if (!app.isPvpOnline || !app.onlineRoomId) {
      return;
    }
    var needFriendSidebar =
      app.homeFriendListOpen && app._gameSpectatorFilter;
    var needPopover = app.spectatorPopoverOpen;
    if (!needFriendSidebar && !needPopover) {
      return;
    }
    if (!roomApi || typeof roomApi.roomSpectatorsOptions !== 'function') {
      return;
    }
    if (_spectatorListStateRefreshTimer) {
      try {
        clearTimeout(_spectatorListStateRefreshTimer);
      } catch (eC) {}
    }
    _spectatorListStateRefreshTimer = setTimeout(function () {
      _spectatorListStateRefreshTimer = null;
      if (
        app.homeFriendListOpen &&
        app._gameSpectatorFilter &&
        app.isPvpOnline &&
        app.onlineRoomId
      ) {
        fetchSpectatorsForCurrentRoom(true);
      }
      if (
        app.spectatorPopoverOpen &&
        app.isPvpOnline &&
        app.onlineRoomId
      ) {
        app.refreshSpectatorPopoverList(true);
      }
    }, SPECTATOR_LIST_STATE_REFRESH_MS);
  }

  app.scheduleSpectatorListRefreshAfterState = scheduleSpectatorListRefreshAfterState;

  function getFriendListSwipeActionWidths() {
    var remarkW = app.rpx(FRIEND_LIST_SWIPE_REMARK_RPX);
    var delW = app.rpx(FRIEND_LIST_SWIPE_DELETE_RPX);
    return { remark: remarkW, del: delW, total: remarkW + delW };
  }

  function friendListCloseSwipe() {
    app.friendListRowSwipe = { peerKey: null, offset: 0 };
  }

  function getFriendListWatchBtnLayout(L, panelX, yRow, offRow) {
    var rowPad = app.rpx(8);
    var rowHCell = L.rowH - app.rpx(4);
    var btnW = app.rpx(FRIEND_LIST_WATCH_BTN_RPX);
    var trim = app.rpx(FRIEND_LIST_WATCH_BTN_HEIGHT_TRIM_RPX);
    var btnH = Math.max(
      app.rpx(26),
      rowHCell * 0.5 - trim
    );
    var yBtn = yRow + (rowHCell - btnH) * 0.5;
    var o = offRow > 0 ? offRow : 0;
    var contentW = L.w - rowPad * 2;
    var x0 =
      panelX +
      rowPad +
      contentW -
      btnW -
      o -
      app.rpx(FRIEND_LIST_WATCH_BTN_SHIFT_LEFT_RPX);
    return { x: x0, y: yBtn, w: btnW, h: btnH };
  }

  function friendListHitWatch(x, y, L, panelX, yRow, offRow) {
    var r = getFriendListWatchBtnLayout(L, panelX, yRow, offRow);
    return (
      x >= r.x &&
      x <= r.x + r.w &&
      y >= r.y &&
      y <= r.y + r.h
    );
  }

  /**
   * 行级邀请：与 PRD §4.4 一致；观战列表不展示。
   */
  function friendListRowShowInviteBtn(isSpectatorListUi, fr) {
    if (isSpectatorListUi || !fr) {
      return false;
    }
    var pid = fr.peerUserId != null ? Number(fr.peerUserId) : 0;
    if (!pid || isNaN(pid) || pid <= 0) {
      return false;
    }
    if (friendRowInGame(fr) || !friendRowIsOnline(fr)) {
      return false;
    }
    if (fr._spectatorInRoom) {
      return false;
    }
    return true;
  }

  /**
   * 好友列表行内「邀请」专用：建房 + /api/social/pvp-invites/push（用户 WS）。
   * 与首页大卡 {@link app.startOnlineAsHostFromHome} 的微信分享链路严格区分。
   */
  function startOnlineInviteFromFriendListRow(peerUserId) {
    if (typeof app.startOnlineAsHost !== 'function') {
      return;
    }
    app.startOnlineAsHost({
      notifyPeerUserId: peerUserId,
      skipWeChatInviteShare: true
    });
  }

  function getFriendListInviteBtnLayout(L, panelX, yRow, offRow) {
    var rowPad = app.rpx(8);
    var rowHCell = L.rowH - app.rpx(4);
    var btnW = app.rpx(FRIEND_LIST_INVITE_BTN_RPX);
    var trim = app.rpx(FRIEND_LIST_WATCH_BTN_HEIGHT_TRIM_RPX);
    var btnH = Math.max(
      app.rpx(26),
      rowHCell * 0.5 - trim
    );
    var yBtn = yRow + (rowHCell - btnH) * 0.5;
    var o = offRow > 0 ? offRow : 0;
    var contentW = L.w - rowPad * 2;
    var x0 =
      panelX +
      rowPad +
      contentW -
      btnW -
      o -
      app.rpx(FRIEND_LIST_WATCH_BTN_SHIFT_LEFT_RPX);
    return { x: x0, y: yBtn, w: btnW, h: btnH };
  }

  function friendListHitInvite(x, y, L, panelX, yRow, offRow) {
    var r = getFriendListInviteBtnLayout(L, panelX, yRow, offRow);
    return (
      x >= r.x &&
      x <= r.x + r.w &&
      y >= r.y &&
      y <= r.y + r.h
    );
  }

  /**
   * 行内「邀请」药丸：主色绿渐变，与首页随机匹配主按钮同系。
   */
  function drawFriendListInvitePill(wRect, FL) {
    var wbx = wRect.x;
    var wby = wRect.y;
    var wbw = wRect.w;
    var wbh = wRect.h;
    var wbr = Math.min(wbh * 0.5, wbw * 0.5, app.rpx(10));
    var strokeW = Math.max(1, app.rpx(1.25));
    var strokeC =
      FL && FL.watchPillStroke
        ? FL.watchPillStroke
        : 'rgba(27, 94, 32, 0.35)';
    app.ctx.save();
    var fillStyle = '#43a047';
    try {
      if (app.ctx.createLinearGradient) {
        var grad = app.ctx.createLinearGradient(
          wbx,
          wby,
          wbx,
          wby + wbh
        );
        grad.addColorStop(0, '#66bb6a');
        grad.addColorStop(1, '#2e7d32');
        fillStyle = grad;
      }
    } catch (eGr) {
      fillStyle = '#43a047';
    }
    if (typeof app.roundRect === 'function') {
      app.ctx.fillStyle = fillStyle;
      app.roundRect(wbx, wby, wbw, wbh, wbr);
      app.ctx.fill();
      app.roundRect(wbx, wby, wbw, wbh, wbr);
      app.ctx.strokeStyle = strokeC;
      app.ctx.lineWidth = strokeW;
      app.ctx.stroke();
    } else {
      app.ctx.fillStyle = fillStyle;
      app.ctx.fillRect(wbx, wby, wbw, wbh);
      app.ctx.strokeStyle = strokeC;
      app.ctx.lineWidth = strokeW;
      app.ctx.strokeRect(wbx, wby, wbw, wbh);
    }
    app.ctx.fillStyle = '#ffffff';
    app.ctx.font =
      '600 ' +
      app.rpx(20) +
      'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      '邀请',
      app.snapPx(wbx + wbw * 0.5),
      app.snapPx(wby + wbh * 0.5 + app.rpx(0.5))
    );
    app.ctx.textAlign = 'left';
    app.ctx.restore();
  }

  /**
   * 行内「观战」药丸：与 friendListHomeUiFromTheme 的 watchPill* 一致；文字与「游戏中」同字号、snapPx 居中。
   */
  function drawFriendListWatchPill(wRect, FL) {
    var wbx = wRect.x;
    var wby = wRect.y;
    var wbw = wRect.w;
    var wbh = wRect.h;
    var wbr = Math.min(wbh * 0.5, wbw * 0.5, app.rpx(10));
    var g0 =
      FL && FL.watchPillG0
        ? FL.watchPillG0
        : 'rgba(255, 255, 255, 0.99)';
    var g1 =
      FL && FL.watchPillG1
        ? FL.watchPillG1
        : 'rgba(234, 244, 236, 0.96)';
    var strokeC =
      FL && FL.watchPillStroke
        ? FL.watchPillStroke
        : 'rgba(46, 125, 50, 0.24)';
    var labelC =
      FL && FL.watchPillText
        ? FL.watchPillText
        : FL && FL.online
          ? FL.online
          : '#2e7d32';
    var shade =
      FL && FL.watchPillShade
        ? FL.watchPillShade
        : 'rgba(20, 70, 32, 0.06)';
    var innerTop =
      FL && FL.watchPillInnerTop
        ? FL.watchPillInnerTop
        : 'rgba(255, 255, 255, 0.35)';
    var strokeW = Math.max(1, app.rpx(1.25));

    app.ctx.save();
    if (typeof app.roundRect === 'function') {
      app.ctx.fillStyle = shade;
      app.roundRect(
        wbx + app.rpx(0.5),
        wby + app.rpx(1.25),
        wbw,
        wbh,
        wbr
      );
      app.ctx.fill();
    }
    var fillStyle = g1;
    try {
      if (app.ctx.createLinearGradient) {
        var grad = app.ctx.createLinearGradient(
          wbx,
          wby,
          wbx,
          wby + wbh
        );
        grad.addColorStop(0, g0);
        grad.addColorStop(1, g1);
        fillStyle = grad;
      }
    } catch (eGr) {
      fillStyle = g1;
    }
    if (typeof app.roundRect === 'function') {
      app.ctx.fillStyle = fillStyle;
      app.roundRect(wbx, wby, wbw, wbh, wbr);
      app.ctx.fill();
      app.ctx.save();
      app.roundRect(wbx, wby, wbw, wbh, wbr);
      app.ctx.clip();
      if (app.ctx.createLinearGradient) {
        var hi = app.ctx.createLinearGradient(
          wbx,
          wby,
          wbx,
          wby + wbh * 0.42
        );
        hi.addColorStop(0, innerTop);
        hi.addColorStop(0.55, 'rgba(255, 255, 255, 0.04)');
        hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
        app.ctx.fillStyle = hi;
        app.ctx.fillRect(wbx, wby, wbw, wbh * 0.42);
      }
      app.ctx.restore();
      app.roundRect(wbx, wby, wbw, wbh, wbr);
      app.ctx.strokeStyle = strokeC;
      app.ctx.lineWidth = strokeW;
      app.ctx.stroke();
    } else {
      app.ctx.fillStyle = fillStyle;
      app.ctx.fillRect(wbx, wby, wbw, wbh);
      app.ctx.strokeStyle = strokeC;
      app.ctx.lineWidth = strokeW;
      app.ctx.strokeRect(wbx, wby, wbw, wbh);
    }
    app.ctx.fillStyle = labelC;
    app.ctx.font =
      '600 ' +
      app.rpx(20) +
      'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      '观战',
      app.snapPx(wbx + wbw * 0.5),
      app.snapPx(wby + wbh * 0.5 + app.rpx(0.5))
    );
    app.ctx.textAlign = 'left';
    app.ctx.restore();
  }

  function getFriendListSwipeActionRects(L, panelX, yRow) {
    var wAct = getFriendListSwipeActionWidths();
    var rowPad = app.rpx(8);
    var rowLeft = panelX + rowPad;
    var rowW = L.w - rowPad * 2;
    var yCard = yRow;
    var hCard = L.rowH - app.rpx(4);
    var rDelX = rowLeft + rowW - wAct.del;
    var rRemX = rDelX - wAct.remark;
    return {
      rem: { x: rRemX, y: yCard, w: wAct.remark, h: hCard },
      del: { x: rDelX, y: yCard, w: wAct.del, h: hCard }
    };
  }

  function friendListPeerKey(fr) {
    if (!fr || fr.peerUserId == null) {
      return '';
    }
    return String(fr.peerUserId).trim();
  }

  /**
   * 在左滑已露出时，依触摸 x 判断点了「备注」或「删」；需与 getFriendListSwipeActionRects 一致。
   */
  function friendListHitSwipeAction(x, y, L, panelX, yRow, off) {
    if (off < 0.5) {
      return null;
    }
    var rowPad = app.rpx(8);
    var rowLeft = panelX + rowPad;
    var rowW = L.w - rowPad * 2;
    var wAct = getFriendListSwipeActionWidths();
    if (x < rowLeft + rowW - off || x > rowLeft + rowW) {
      return null;
    }
    var yCard = yRow;
    var hCard = L.rowH - app.rpx(4);
    if (y < yCard || y > yCard + hCard) {
      return null;
    }
    if (x >= rowLeft + rowW - wAct.del) {
      return 'delete';
    }
    if (x >= rowLeft + rowW - wAct.total) {
      return 'remark';
    }
    return null;
  }

  function updateFriendRowLocalDisplayAfterRemark(fr, remarkTrim) {
    if (!fr) {
      return;
    }
    fr.remark = remarkTrim;
    var nick = String(fr.nickname != null ? fr.nickname : '');
    fr.displayName = remarkTrim ? remarkTrim : nick;
  }

  function callFriendApiThenRefreshCache(peerKey, onDone) {
    if (typeof onDone === 'function') {
      onDone();
    }
    try {
      persistCache(app.friendListRaw || []);
    } catch (eP) {}
    if (typeof app.draw === 'function') {
      app.draw();
    }
  }

  function deleteFriendByPeerId(peerId, onDone) {
    authApi.ensureSession(function (ok) {
      if (!ok || !authApi.getSessionToken()) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '请先登录', icon: 'none' });
        }
        return;
      }
      wx.request(
        Object.assign(roomApi.socialFriendDeleteOptions(peerId), {
          success: function (res) {
            if (res.statusCode === 200 || res.statusCode === 204) {
              var raw = app.friendListRaw || [];
              var nraw = [];
              var ii;
              for (ii = 0; ii < raw.length; ii++) {
                if (String((raw[ii] && raw[ii].peerUserId) || '') !== String(peerId)) {
                  nraw.push(raw[ii]);
                }
              }
              app.friendListRaw = nraw;
              if (app._friendDmUnreadPeers) {
                delete app._friendDmUnreadPeers['k' + String(peerId)];
              }
              friendListCloseSwipe();
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '已删除', icon: 'success' });
              }
              callFriendApiThenRefreshCache(String(peerId), onDone);
            } else {
              var m = apiErrorMessage(res) || '删除失败';
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: m, icon: 'none' });
              }
            }
          },
          fail: function () {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '网络异常', icon: 'none' });
            }
          }
        })
      );
    });
  }

  function patchFriendRemarkByPeerId(peerId, remarkRaw, onDone) {
    var remarkTrim = String(remarkRaw != null ? remarkRaw : '').replace(/^\s+|\s+$/g, '');
    if (remarkTrim.length > 64) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '备注过长', icon: 'none' });
      }
      return;
    }
    authApi.ensureSession(function (ok) {
      if (!ok || !authApi.getSessionToken()) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '请先登录', icon: 'none' });
        }
        return;
      }
      wx.request(
        Object.assign(
          roomApi.socialFriendRemarkOptions(peerId, remarkTrim),
          {
            success: function (res) {
              if (res.statusCode === 200 || res.statusCode === 204) {
                var raw = app.friendListRaw || [];
                var jj;
                for (jj = 0; jj < raw.length; jj++) {
                  if (
                    raw[jj] &&
                    String(raw[jj].peerUserId) === String(peerId)
                  ) {
                    updateFriendRowLocalDisplayAfterRemark(raw[jj], remarkTrim);
                    break;
                  }
                }
                friendListCloseSwipe();
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: '已保存', icon: 'success' });
                }
                callFriendApiThenRefreshCache(String(peerId), onDone);
              } else {
                var m2 = apiErrorMessage(res) || '保存失败';
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: m2, icon: 'none' });
                }
              }
            },
            fail: function () {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '网络异常', icon: 'none' });
              }
            }
          }
        )
      );
    });
  }

  function openFriendRemarkDialog(peer) {
    if (!peer || peer.peerUserId == null) {
      return;
    }
    friendListCloseSwipe();
    if (typeof app.draw === 'function') {
      app.draw();
    }
    var def = String(
      peer.remark != null
        ? peer.remark
        : (peer.nickname != null ? peer.nickname : '')
    );
    if (def.length > 64) {
      def = def.slice(0, 64);
    }
    if (typeof wx.showModal === 'function') {
      wx.showModal({
        title: '设置备注',
        editable: true,
        placeholderText: '备注名',
        content: def,
        success: function (res) {
          if (res.confirm) {
            var v = res.content != null ? String(res.content) : '';
            patchFriendRemarkByPeerId(peer.peerUserId, v, null);
          } else {
            friendListCloseSwipe();
            if (typeof app.draw === 'function') {
              app.draw();
            }
          }
        }
      });
    } else {
      patchFriendRemarkByPeerId(peer.peerUserId, def, null);
    }
  }

  function friendDmHasAnyUnread() {
    var m = app._friendDmUnreadPeers;
    if (!m) {
      return false;
    }
    var k;
    for (k in m) {
      if (Object.prototype.hasOwnProperty.call(m, k) && m[k]) {
        return true;
      }
    }
    return false;
  }

  function friendDmPeerHasUnread(peerUserId) {
    if (peerUserId == null || !app._friendDmUnreadPeers) {
      return false;
    }
    return !!app._friendDmUnreadPeers[getFriendChatKey(peerUserId)];
  }

  function stopFriendFabUnreadPulse() {
    if (app._friendFabUnreadPulseRaf != null) {
      try {
        if (app._friendFabUnreadPulseUsesTimeout) {
          clearTimeout(app._friendFabUnreadPulseRaf);
        } else if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(app._friendFabUnreadPulseRaf);
        }
      } catch (eStop) {}
    }
    app._friendFabUnreadPulseRaf = null;
    app._friendFabUnreadPulseUsesTimeout = false;
    friendFabUnreadPulseLastDrawMs = 0;
  }

  function ensureFriendFabUnreadPulse() {
    if (!friendDmHasAnyUnread() || app.homeFriendListOpen) {
      stopFriendFabUnreadPulse();
      return;
    }
    if (app._friendFabUnreadPulseRaf != null) {
      return;
    }
    function tick() {
      if (!friendDmHasAnyUnread() || app.homeFriendListOpen) {
        stopFriendFabUnreadPulse();
        return;
      }
      var nowPulse = Date.now();
      if (
        typeof app.draw === 'function' &&
        nowPulse - friendFabUnreadPulseLastDrawMs >=
          FRIEND_FAB_UNREAD_PULSE_MIN_DRAW_MS
      ) {
        friendFabUnreadPulseLastDrawMs = nowPulse;
        app.draw();
      }
      if (!friendDmHasAnyUnread() || app.homeFriendListOpen) {
        stopFriendFabUnreadPulse();
        return;
      }
      // 勿在 draw() 前把 _friendFabUnreadPulseRaf 置空：draw → drawHomeFriendListFab →
      // ensureFriendFabUnreadPulse 会误以为未调度而再注册 RAF，与此处尾调度叠成指数级回调导致卡死。
      if (typeof requestAnimationFrame === 'function') {
        app._friendFabUnreadPulseUsesTimeout = false;
        app._friendFabUnreadPulseRaf = requestAnimationFrame(tick);
      } else {
        app._friendFabUnreadPulseUsesTimeout = true;
        app._friendFabUnreadPulseRaf = setTimeout(
          tick,
          FRIEND_FAB_UNREAD_PULSE_MIN_DRAW_MS
        );
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      app._friendFabUnreadPulseUsesTimeout = false;
      app._friendFabUnreadPulseRaf = requestAnimationFrame(tick);
    } else {
      app._friendFabUnreadPulseUsesTimeout = true;
      app._friendFabUnreadPulseRaf = setTimeout(
        tick,
        FRIEND_FAB_UNREAD_PULSE_MIN_DRAW_MS
      );
    }
  }

  function appendFriendChatMessage(peerUserId, text, isSelf, ts) {
    var key = getFriendChatKey(peerUserId);
    if (!app.friendChatMessagesByPeer[key]) {
      app.friendChatMessagesByPeer[key] = [];
    }
    app._friendChatMsgId = (app._friendChatMsgId || 0) + 1;
    app.friendChatMessagesByPeer[key].push({
      msgId: app._friendChatMsgId,
      text: String(text || ''),
      isSelf: !!isSelf,
      ts: typeof ts === 'number' ? ts : Date.now()
    });
    app._friendChatNeedScrollBottom = true;
  }

  app.appendFriendChatIncomingMessage = function (
    fromUserId,
    fromNickname,
    text,
    sentAt
  ) {
    if (fromUserId == null) {
      return;
    }
    appendFriendChatMessage(
      fromUserId,
      text != null ? String(text) : '',
      false,
      typeof sentAt === 'number' ? sentAt : Date.now()
    );
    var viewingSame =
      app.homeFriendChatPeer &&
      app.homeFriendChatPeer.peerUserId != null &&
      String(app.homeFriendChatPeer.peerUserId) === String(fromUserId);
    if (!viewingSame) {
      app._friendDmUnreadPeers[getFriendChatKey(fromUserId)] = true;
      app._friendFabHighlightUntil = Date.now() + FRIEND_FAB_MSG_HIGHLIGHT_MS;
    }
    if (typeof app.draw === 'function') {
      app.draw();
      friendFabUnreadPulseLastDrawMs = Date.now();
    }
  };

  function exitHomeFriendChat() {
    app.homeFriendChatPeer = null;
    app.friendChatScrollY = 0;
    app._friendChatScrollTouchId = null;
    app.friendChatComposeDraft = '';
    app._friendChatBarHitKind = null;
    app.dismissFriendDmKeyboard();
  }

  function apiErrorMessage(res) {
    var d = res && res.data;
    if (d && typeof d === 'string') {
      try {
        d = JSON.parse(d);
      } catch (e) {
        d = null;
      }
    }
    if (d && d.message) {
      return String(d.message);
    }
    return '';
  }

  function postFriendDirectMessage(peerUserId, text) {
    var trimmed = String(text || '').replace(/^\s+|\s+$/g, '');
    if (!trimmed) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '消息不能为空', icon: 'none' });
      }
      return;
    }
    authApi.ensureSession(function (ok) {
      if (!ok || !authApi.getSessionToken()) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '请先登录', icon: 'none' });
        }
        return;
      }
      wx.request(
        Object.assign(
          roomApi.socialFriendSendMessageOptions(peerUserId, trimmed),
          {
            success: function (res) {
              if (res.statusCode === 200) {
                appendFriendChatMessage(peerUserId, trimmed, true, Date.now());
                app.friendChatComposeDraft = '';
                app.dismissFriendDmKeyboard();
                if (typeof app.draw === 'function') {
                  app.draw();
                }
              } else {
                var msg = apiErrorMessage(res) || '发送失败';
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: msg, icon: 'none' });
                }
              }
            },
            fail: function () {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '网络异常', icon: 'none' });
              }
            }
          }
        )
      );
    });
  }

  app.refreshHomeFriendListFromServer = function (done) {
    app.friendListLoading = true;
    app.friendListLoadError = false;
    authApi.ensureSession(function (ok) {
      if (!ok || !authApi.getSessionToken()) {
        app.friendListLoading = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '请先登录', icon: 'none' });
        }
        if (typeof done === 'function') {
          done(false);
        }
        return;
      }
      wx.request(
        Object.assign(roomApi.socialFriendsListOptions(), {
          success: function (res) {
            app.friendListLoading = false;
            var d = res.data;
            if (d && typeof d === 'string') {
              try {
                d = JSON.parse(d);
              } catch (e) {
                d = null;
              }
            }
            if (res.statusCode === 401) {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '请先登录', icon: 'none' });
              }
              app.friendListLoadError = true;
              if (typeof done === 'function') {
                done(false);
              }
              return;
            }
            if (res.statusCode !== 200 || !d || !Array.isArray(d.friends)) {
              app.friendListLoadError = true;
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '加载好友失败', icon: 'none' });
              }
              if (typeof done === 'function') {
                done(false);
              }
              return;
            }
            app.friendListRaw = d.friends;
            normalizeFriendListRowsInPlace(app.friendListRaw);
            persistCache(app.friendListRaw);
            syncFriendListAvatarImgs();
            if (typeof done === 'function') {
              done(true);
            }
            if (typeof app.draw === 'function') {
              app.draw();
            }
          },
          fail: function () {
            app.friendListLoading = false;
            app.friendListLoadError = true;
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '网络异常，已显示缓存', icon: 'none' });
            }
            if (typeof done === 'function') {
              done(false);
            }
            if (typeof app.draw === 'function') {
              app.draw();
            }
          }
        })
      );
    });
  };

  function startOpenAnim() {
    app._flSlideT = 0;
    app._flAnimMode = 'in';
    app._flAnimStart = Date.now();
    function tick() {
      if (!app.homeFriendListOpen || app._flAnimMode !== 'in') {
        app._flAnimRaf = null;
        app._flAnimUsesTimeout = false;
        return;
      }
      var dt = Date.now() - app._flAnimStart;
      app._flSlideT = Math.min(1, dt / 300);
      if (typeof app.draw === 'function') {
        app.draw();
      }
      if (app._flSlideT < 1) {
        if (typeof requestAnimationFrame === 'function') {
          app._flAnimUsesTimeout = false;
          app._flAnimRaf = requestAnimationFrame(tick);
        } else {
          app._flAnimUsesTimeout = true;
          app._flAnimRaf = setTimeout(tick, 16);
        }
      } else {
        app._flAnimRaf = null;
        app._flAnimUsesTimeout = false;
        app._flSlideT = 1;
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      app._flAnimUsesTimeout = false;
      app._flAnimRaf = requestAnimationFrame(tick);
    } else {
      app._flAnimUsesTimeout = true;
      app._flAnimRaf = setTimeout(tick, 16);
    }
  }

  function stopFlAnimRaf() {
    if (app._flAnimRaf != null) {
      try {
        if (app._flAnimUsesTimeout) {
          clearTimeout(app._flAnimRaf);
        } else if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(app._flAnimRaf);
        }
      } catch (e) {}
    }
    app._flAnimRaf = null;
    app._flAnimUsesTimeout = false;
  }

  function finalizeFriendListClose(done) {
    app.dismissFriendDmKeyboard();
    app.homeFriendChatPeer = null;
    app._friendChatScrollTouchId = null;
    friendListCloseSwipe();
    app._flRowTouch = null;
    app._flAnimMode = null;
    app.homeFriendListOpen = false;
    app._gameSpectatorFilter = false;
    app._spectatorListRoomFriends = null;
    app.spectatorListLoading = false;
    app.homeFriendFabPressed = false;
    if (_spectatorListStateRefreshTimer) {
      try {
        clearTimeout(_spectatorListStateRefreshTimer);
      } catch (eCt) {}
      _spectatorListStateRefreshTimer = null;
    }
    app._flSlideT = 1;
    persistOpen();
    if (typeof app.draw === 'function') {
      app.draw();
    }
    if (typeof done === 'function') {
      try {
        done();
      } catch (eD) {}
    }
  }

  function startCloseAnim(done) {
    app._friendListScrollTouchId = null;
    app._friendChatScrollTouchId = null;
    app._flRowTouch = null;
    app._friendListRowTapIdx = -1;
    stopFlAnimRaf();
    var from =
      typeof app._flSlideT === 'number' ? app._flSlideT : 1;
    from = Math.max(0, Math.min(1, from));
    if (from <= 0.002) {
      finalizeFriendListClose(done);
      return;
    }
    app._flAnimMode = 'out';
    app._flAnimStart = Date.now();
    var baseDur = 300;
    var dur = Math.max(120, baseDur * from);
    function tick() {
      if (app._flAnimMode !== 'out') {
        app._flAnimRaf = null;
        return;
      }
      var dt = Date.now() - app._flAnimStart;
      var u = Math.min(1, dt / dur);
      app._flSlideT = from * (1 - u);
      if (typeof app.draw === 'function') {
        app.draw();
      }
      if (u < 1) {
        if (typeof requestAnimationFrame === 'function') {
          app._flAnimUsesTimeout = false;
          app._flAnimRaf = requestAnimationFrame(tick);
        } else {
          app._flAnimUsesTimeout = true;
          app._flAnimRaf = setTimeout(tick, 16);
        }
      } else {
        app._flSlideT = 0;
        finalizeFriendListClose(done);
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      app._flAnimUsesTimeout = false;
      app._flAnimRaf = requestAnimationFrame(tick);
    } else {
      app._flAnimUsesTimeout = true;
      app._flAnimRaf = setTimeout(tick, 16);
    }
  }

  app.openHomeFriendList = function (spectatorMode) {
    stopFriendFabUnreadPulse();
    app.spectatorPopoverOpen = false;
    app.homeFriendListOpen = true;
    app._gameSpectatorFilter = !!spectatorMode && app.isPvpOnline;
    if (app._gameSpectatorFilter) {
      app.friendListSearchQuery = '';
    }
    if (app._gameSpectatorFilter && app.onlineRoomId) {
      fetchSpectatorsForCurrentRoom();
    } else {
      app._spectatorListRoomFriends = null;
      app.spectatorListLoading = false;
    }
    friendListCloseSwipe();
    app._flRowTouch = null;
    app.homeFriendChatPeer = null;
    app.friendChatScrollY = 0;
    app.friendListScrollY = 0;
    persistOpen();
    startOpenAnim();
    syncFriendListAvatarImgs();
    if (typeof app.draw === 'function') {
      app.draw();
    }
    if (typeof app.refreshHomeFriendListFromServer === 'function') {
      app.refreshHomeFriendListFromServer();
    }
  };

  app.dismissFriendListSearchKeyboard = function () {
    if (typeof app._friendListSearchKbCleanup === 'function') {
      try {
        app._friendListSearchKbCleanup();
      } catch (e) {}
      app._friendListSearchKbCleanup = null;
    }
    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
      try {
        wx.hideKeyboard({});
      } catch (eH) {}
    }
  };

  /**
   * 搜索框：调起系统键盘实时输入（与局内聊天 wx.showKeyboard 一致）。
   */
  app.openFriendListSearchKeyboard = function () {
    if (typeof wx === 'undefined') {
      return;
    }
    if (typeof app.dismissOnlineChatKeyboard === 'function') {
      app.dismissOnlineChatKeyboard();
    }
    app.dismissFriendListSearchKeyboard();

    var draft0 =
      app.friendListSearchQuery != null ? String(app.friendListSearchQuery) : '';

    function fallbackModal() {
      if (typeof wx.showModal !== 'function') {
        return;
      }
      wx.showModal({
        title: '搜索好友',
        editable: true,
        placeholderText: '昵称关键词',
        content: draft0,
        success: function (res) {
          if (res.confirm) {
            app.friendListSearchQuery =
              res.content != null ? String(res.content) : '';
            app.friendListScrollY = 0;
            if (typeof app.draw === 'function') {
              app.draw();
            }
          }
        }
      });
    }

    if (typeof wx.showKeyboard !== 'function') {
      fallbackModal();
      return;
    }

    var kbCleaned = false;
    function cleanup() {
      if (kbCleaned) {
        return;
      }
      kbCleaned = true;
      try {
        if (typeof wx.offKeyboardInput === 'function') {
          wx.offKeyboardInput(onInput);
        }
      } catch (e1) {}
      try {
        if (typeof wx.offKeyboardConfirm === 'function') {
          wx.offKeyboardConfirm(onConfirm);
        }
      } catch (e2) {}
      try {
        if (typeof wx.offKeyboardComplete === 'function') {
          wx.offKeyboardComplete(onComplete);
        }
      } catch (e3) {}
      app._friendListSearchKbCleanup = null;
    }

    function onInput(res) {
      app.friendListSearchQuery =
        res && res.value != null ? String(res.value) : '';
      app.friendListScrollY = 0;
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }

    function onConfirm(res) {
      var v =
        res && res.value != null
          ? String(res.value)
          : app.friendListSearchQuery != null
            ? String(app.friendListSearchQuery)
            : '';
      cleanup();
      try {
        if (typeof wx.hideKeyboard === 'function') {
          wx.hideKeyboard({});
        }
      } catch (eH) {}
      app.friendListSearchQuery = v.replace(/^\s+|\s+$/g, '');
      app.friendListScrollY = 0;
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }

    function onComplete() {
      cleanup();
    }

    app._friendListSearchKbCleanup = function () {
      cleanup();
    };

    try {
      if (typeof wx.onKeyboardInput === 'function') {
        wx.onKeyboardInput(onInput);
      }
      if (typeof wx.onKeyboardConfirm === 'function') {
        wx.onKeyboardConfirm(onConfirm);
      }
      if (typeof wx.onKeyboardComplete === 'function') {
        wx.onKeyboardComplete(onComplete);
      }
    } catch (eL) {
      cleanup();
      fallbackModal();
      return;
    }

    wx.showKeyboard({
      defaultValue: draft0,
      maxLength: 32,
      multiple: false,
      confirmHold: false,
      confirmType: 'done',
      fail: function () {
        cleanup();
        fallbackModal();
      }
    });
  };

  function clearFriendDmKeyboardHeightWatch() {
    if (
      app._friendDmKeyboardHeightListener &&
      typeof wx !== 'undefined' &&
      typeof wx.offKeyboardHeightChange === 'function'
    ) {
      try {
        wx.offKeyboardHeightChange(app._friendDmKeyboardHeightListener);
      } catch (eKbOff) {}
    }
    app._friendDmKeyboardHeightListener = null;
    app._friendDmKeyboardHeight = 0;
    app._friendDmLayoutFullH = 0;
    if (typeof app.draw === 'function') {
      app.draw();
    }
  }

  app.dismissFriendDmKeyboard = function () {
    if (typeof app._friendDmKbCleanup === 'function') {
      try {
        app._friendDmKbCleanup();
      } catch (eDm) {}
      app._friendDmKbCleanup = null;
    } else {
      clearFriendDmKeyboardHeightWatch();
    }
    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
      try {
        wx.hideKeyboard({});
      } catch (eH) {}
    }
  };

  /**
   * 点击好友行：进入画布内会话面板（与列表同壳；消息仅存内存，POST 同 /api/social/friend-messages）。
   */
  app.openHomeFriendChatMode = function (f) {
    if (!f || f.peerUserId == null) {
      return;
    }
    if (!app.homeFriendListOpen) {
      return;
    }
    app.dismissFriendListSearchKeyboard();
    app.dismissFriendDmKeyboard();
    if (typeof app.dismissOnlineChatKeyboard === 'function') {
      app.dismissOnlineChatKeyboard();
    }
    app.homeFriendChatPeer = f;
    app.friendChatComposeDraft = '';
    if (f.peerUserId != null && app._friendDmUnreadPeers) {
      delete app._friendDmUnreadPeers[getFriendChatKey(f.peerUserId)];
    }
    app.friendChatScrollY = 0;
    app._friendChatNeedScrollBottom = true;
    if (f.avatarUrl) {
      ensureAvatarImg(f.peerUserId, f.avatarUrl);
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };

  app.openFriendDirectMessageComposer = app.openHomeFriendChatMode;

  /** 会话底部输入区：调起系统键盘编辑草稿；发送仅通过画布「发送」按钮 */
  app.openFriendChatKeyboard = function () {
    var peer = app.homeFriendChatPeer;
    if (!peer || peer.peerUserId == null || typeof wx === 'undefined') {
      return;
    }
    app.dismissFriendListSearchKeyboard();
    if (typeof app.dismissOnlineChatKeyboard === 'function') {
      app.dismissOnlineChatKeyboard();
    }
    app.dismissFriendDmKeyboard();
    var peerName = String(peer.displayName || peer.nickname || '好友');

    function fallbackModal() {
      if (typeof wx.showModal !== 'function') {
        return;
      }
      wx.showModal({
        title: '发给 ' + peerName,
        editable: true,
        placeholderText: '输入消息',
        content: '',
        success: function (res) {
          if (res.confirm) {
            postFriendDirectMessage(
              peer.peerUserId,
              res.content != null ? String(res.content) : ''
            );
          }
        }
      });
    }

    if (typeof wx.showKeyboard !== 'function') {
      fallbackModal();
      return;
    }

    var kbCleanedDm = false;
    function cleanupDm() {
      if (kbCleanedDm) {
        return;
      }
      kbCleanedDm = true;
      try {
        if (typeof wx.offKeyboardInput === 'function') {
          wx.offKeyboardInput(onInputDm);
        }
      } catch (e1) {}
      try {
        if (typeof wx.offKeyboardConfirm === 'function') {
          wx.offKeyboardConfirm(onConfirmDm);
        }
      } catch (e2) {}
      try {
        if (typeof wx.offKeyboardComplete === 'function') {
          wx.offKeyboardComplete(onCompleteDm);
        }
      } catch (e3) {}
      clearFriendDmKeyboardHeightWatch();
      if (app._friendChatInpBlinkTimer != null) {
        clearInterval(app._friendChatInpBlinkTimer);
        app._friendChatInpBlinkTimer = null;
      }
      app._friendDmKbCleanup = null;
    }

    function onInputDm(res) {
      app.friendChatComposeDraft =
        res && res.value != null ? String(res.value) : '';
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }

    function onConfirmDm(res) {
      if (res && res.value != null) {
        app.friendChatComposeDraft = String(res.value);
      }
      cleanupDm();
      try {
        if (typeof wx.hideKeyboard === 'function') {
          wx.hideKeyboard({});
        }
      } catch (eH) {}
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }

    function onCompleteDm() {
      cleanupDm();
    }

    app._friendDmKbCleanup = function () {
      cleanupDm();
    };

    try {
      if (typeof wx.onKeyboardInput === 'function') {
        wx.onKeyboardInput(onInputDm);
      }
      if (typeof wx.onKeyboardConfirm === 'function') {
        wx.onKeyboardConfirm(onConfirmDm);
      }
      if (typeof wx.onKeyboardComplete === 'function') {
        wx.onKeyboardComplete(onCompleteDm);
      }
      if (typeof wx.onKeyboardHeightChange === 'function') {
        if (
          app._friendDmKeyboardHeightListener &&
          typeof wx.offKeyboardHeightChange === 'function'
        ) {
          try {
            wx.offKeyboardHeightChange(app._friendDmKeyboardHeightListener);
          } catch (eKb0) {}
        }
        var onKbH = function (res) {
          var raw =
            res && typeof res.height === 'number' && !isNaN(res.height)
              ? res.height
              : 0;
          var h = raw;
          if (app.friendDmKeyboardHeightDivideDpr) {
            var dprKb = app.DPR;
            if (typeof dprKb === 'number' && dprKb > 0 && dprKb === dprKb) {
              h = h / dprKb;
            }
          }
          var scKb = app.friendDmKeyboardHeightScale;
          if (typeof scKb === 'number' && scKb > 0 && scKb === scKb) {
            h *= scKb;
          }
          app._friendDmKeyboardHeight = Math.max(0, h);
          if (typeof app.syncCanvasWithWindow === 'function') {
            try {
              app.syncCanvasWithWindow();
            } catch (eSy) {}
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
          if (
            h > 0 &&
            typeof requestAnimationFrame === 'function'
          ) {
            requestAnimationFrame(function () {
              if (typeof app.syncCanvasWithWindow === 'function') {
                try {
                  app.syncCanvasWithWindow();
                } catch (eSy2) {}
              }
              if (typeof app.draw === 'function') {
                app.draw();
              }
            });
          }
        };
        app._friendDmKeyboardHeightListener = onKbH;
        wx.onKeyboardHeightChange(onKbH);
      }
    } catch (eL) {
      cleanupDm();
      fallbackModal();
      return;
    }

    app._friendDmLayoutFullH = app.H;
    // 微信小游戏：showKeyboard 会在键盘上方固定显示系统输入条（与 defaultValue 同步），
    // 文档无隐藏参数；社区反馈亦无法关闭。画布内输入框仅为自绘，无法替代该原生条。
    wx.showKeyboard({
      defaultValue: app.friendChatComposeDraft || '',
      maxLength: 300,
      multiple: false,
      confirmHold: false,
      confirmType: 'done',
      success: function () {
        if (app._friendChatInpBlinkTimer != null) {
          clearInterval(app._friendChatInpBlinkTimer);
          app._friendChatInpBlinkTimer = null;
        }
        app._friendChatInpBlinkTimer = setInterval(function () {
          if (
            app.homeFriendListOpen &&
            app.homeFriendChatPeer &&
            typeof app.draw === 'function'
          ) {
            app.draw();
          }
        }, 420);
      },
      fail: function () {
        cleanupDm();
        app._friendDmLayoutFullH = 0;
        fallbackModal();
      }
    });
  };

  app.closeHomeFriendList = function (opts) {
    if (typeof opts === 'function') {
      opts = { onClosed: opts };
    } else {
      opts = opts && typeof opts === 'object' ? opts : {};
    }
    app.dismissFriendListSearchKeyboard();
    app.dismissFriendDmKeyboard();
    if (opts.immediate) {
      stopFlAnimRaf();
      finalizeFriendListClose(opts.onClosed);
      return;
    }
    if (!app.homeFriendListOpen) {
      if (typeof opts.onClosed === 'function') {
        opts.onClosed();
      }
      return;
    }
    if (app._flAnimMode === 'out') {
      return;
    }
    startCloseAnim(opts.onClosed);
  };

  function hitCollapse(L, panelX, x, y) {
    var btnW = app.rpx(80);
    var btnH = app.rpx(36);
    var bx = panelX + L.w - btnW - app.rpx(8);
    var by = L.y0 + app.rpx(8);
    return x >= bx && x <= bx + btnW && y >= by && y <= by + btnH;
  }

  function hitSearch(L, panelX, x, y) {
    /** 观战列表无搜索，避免与「好友列表」同一套输入行为 */
    if (app._gameSpectatorFilter && app.isPvpOnline) {
      return false;
    }
    var pad = app.rpx(12);
    var y1 = L.y0 + L.headerH + app.rpx(6);
    var h = L.searchH - app.rpx(12);
    return (
      x >= panelX + pad &&
      x <= panelX + L.w - pad &&
      y >= y1 &&
      y <= y1 + h
    );
  }

  function hitFriendRow(L, panelX, x, y, idx) {
    var yRow = L.listTop + idx * L.rowH + app.friendListScrollY;
    return (
      x >= panelX + app.rpx(8) &&
      x <= panelX + L.w - app.rpx(8) &&
      y >= yRow &&
      y <= yRow + L.rowH &&
      y >= L.listTop &&
      y <= L.listTop + L.listH
    );
  }

  function hitFriendChatInputLayout(L, panelX) {
    var yInp =
      L.chatInputBarY != null
        ? L.chatInputBarY
        : L.y0 + L.h - L.chatInputBarH;
    var sendW = app.rpx(72);
    var inpH = app.rpx(56);
    var inpY = yInp + (L.chatInputBarH - inpH) * 0.5;
    var inpX = panelX + app.rpx(12);
    var inpW = L.w - app.rpx(24) - sendW - app.rpx(8);
    var sendX = panelX + L.w - app.rpx(12) - sendW;
    return {
      yInp: yInp,
      sendW: sendW,
      inpX: inpX,
      inpW: inpW,
      inpH: inpH,
      inpY: inpY,
      sendX: sendX
    };
  }

  function hitFriendChatBack(L, panelX, x, y) {
    var backOff = 10;
    return (
      x >= panelX + app.rpx(8) + backOff &&
      x <= panelX + app.rpx(56) + backOff &&
      y >= L.y0 + app.rpx(4) &&
      y <= L.y0 + L.headerH - app.rpx(4)
    );
  }

  function hitFriendChatInputField(L, panelX, x, y) {
    var u = hitFriendChatInputLayout(L, panelX);
    return (
      x >= u.inpX &&
      x <= u.inpX + u.inpW &&
      y >= u.inpY &&
      y <= u.inpY + u.inpH
    );
  }

  function hitFriendChatSend(L, panelX, x, y) {
    var u = hitFriendChatInputLayout(L, panelX);
    return (
      x >= u.sendX &&
      x <= u.sendX + u.sendW &&
      y >= u.inpY &&
      y <= u.inpY + u.inpH
    );
  }

  app.onHomeFriendListTouchStart = function (x, y, e) {
    app.ensureHomeFriendListPersistedStateOnce();
    if (app._flAnimMode === 'out') {
      return true;
    }
    if (!app.homeFriendListOpen) {
      var F = app.getHomeFriendListFabLayout();
      var dx = x - F.cx;
      var dy = y - F.cy;
      if (dx * dx + dy * dy <= F.r * F.r * 1.2) {
        stopFabSnapAnim(false);
        app._friendFabInEdgeSnap = false;
        app.homeFriendFabPressed = true;
        app.homeFriendFabDragging = false;
        app._friendFabTouchStartX = x;
        app._friendFabTouchStartY = y;
        app._friendFabGrabFx = x;
        app._friendFabGrabFy = y;
        app._friendFabGrabCx = F.cx;
        app._friendFabGrabCy = F.cy;
        app._friendFabTouchId =
          e && e.touches && e.touches[0]
            ? e.touches[0].identifier
            : 0;
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
      return false;
    }
    var L = app.getHomeFriendListPanelLayout();
    var slide = easeInOut(app._flSlideT != null ? app._flSlideT : 1);
    var panelX = L.x0 - L.w * (1 - slide) * 0.92;
    var insidePanel =
      x >= panelX &&
      x <= panelX + L.w &&
      y >= L.y0 &&
      y <= L.y0 + L.h;

    if (!app.homeFriendChatPeer && hitCollapse(L, panelX, x, y)) {
      friendListCloseSwipe();
      app._flRowTouch = null;
      return true;
    }
    if (!app.homeFriendChatPeer && hitSearch(L, panelX, x, y)) {
      friendListCloseSwipe();
      app._flRowTouch = null;
      return true;
    }

    if (app.homeFriendChatPeer) {
      if (hitFriendChatBack(L, panelX, x, y)) {
        return true;
      }
      if (hitFriendChatInputField(L, panelX, x, y)) {
        app._friendChatBarDownX = x;
        app._friendChatBarDownY = y;
        app._friendChatBarHitKind = 'input';
        return true;
      }
      if (hitFriendChatSend(L, panelX, x, y)) {
        app._friendChatBarDownX = x;
        app._friendChatBarDownY = y;
        app._friendChatBarHitKind = 'send';
        return true;
      }
      var cmt = L.chatMsgTop;
      var cmh = L.chatMsgH;
      if (
        x >= panelX &&
        x <= panelX + L.w &&
        y >= cmt &&
        y <= cmt + cmh &&
        e &&
        e.touches &&
        e.touches[0]
      ) {
        app._friendChatScrollMoved = false;
        app._friendChatScrollTouchId = e.touches[0].identifier;
        app._friendChatScrollLastY = y;
        return true;
      }
      if (insidePanel) {
        return true;
      }
      return true;
    }

    var rows = getFilteredFriends();
    var i;
    for (i = 0; i < rows.length && i < 50; i++) {
      if (hitFriendRow(L, panelX, x, y, i)) {
        var fHit = rows[i];
        var pkHit = friendListPeerKey(fHit);
        if (pkHit && app.friendListRowSwipe && app.friendListRowSwipe.peerKey && app.friendListRowSwipe.peerKey !== pkHit) {
          friendListCloseSwipe();
        }
        app._friendListRowTapIdx = i;
        app._friendListRowTapX = x;
        app._friendListRowTapY = y;
        if (e && e.touches && e.touches[0]) {
          var tid0 = e.touches[0].identifier;
          app._friendListScrollTouchId = tid0;
          app._friendListScrollLastY = y;
          app._flRowTouch = {
            id: tid0,
            x0: x,
            y0: y,
            idx: i,
            peerKey: pkHit,
            mode: 0,
            startOff: 0
          };
          if (pkHit && app.friendListRowSwipe && app.friendListRowSwipe.peerKey === pkHit) {
            app._flRowTouch.startOff = app.friendListRowSwipe.offset || 0;
          }
        }
        return true;
      }
    }

    if (insidePanel && y >= L.listTop && y <= L.listTop + L.listH) {
      friendListCloseSwipe();
      if (e && e.touches && e.touches[0]) {
        app._friendListScrollTouchId = e.touches[0].identifier;
        app._friendListScrollLastY = y;
      }
      return true;
    }

    if (!insidePanel) {
      return true;
    }
    return true;
  };

  app.onHomeFriendListTouchMove = function (e) {
    if (!app.homeFriendListOpen && app._friendFabTouchId != null) {
      var touchesFab = e.touches;
      if (!touchesFab || !touchesFab.length) {
        return false;
      }
      var tFab = null;
      var tfi;
      for (tfi = 0; tfi < touchesFab.length; tfi++) {
        if (touchesFab[tfi].identifier === app._friendFabTouchId) {
          tFab = touchesFab[tfi];
          break;
        }
      }
      if (!tFab) {
        return false;
      }
      var dragSlop = app.rpx(10);
      var fdx = tFab.clientX - app._friendFabTouchStartX;
      var fdy = tFab.clientY - app._friendFabTouchStartY;
      if (!app.homeFriendFabDragging) {
        if (fdx * fdx + fdy * fdy < dragSlop * dragSlop) {
          return true;
        }
        app.homeFriendFabDragging = true;
        app.homeFriendFabPressed = false;
      }
      var rFab = HOME_FRIEND_LIST_FAB_R;
      var tcx = app._friendFabGrabCx + (tFab.clientX - app._friendFabGrabFx);
      var tcy = app._friendFabGrabCy + (tFab.clientY - app._friendFabGrabFy);
      var cDrag = clampFabCenter(tcx, tcy, rFab);
      var snapIntent = getSnapEdgeIntent(tcx, tcy, rFab, tFab.clientX);
      if (!snapIntent) {
        stopFabSnapAnim(false);
        app._friendFabInEdgeSnap = false;
        app.homeFriendFabCustomCx = cDrag.cx;
        app.homeFriendFabCustomCy = cDrag.cy;
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
      app.homeFriendFabCustomCy = cDrag.cy;
      if (!app._friendFabInEdgeSnap) {
        app._friendFabInEdgeSnap = true;
        var cur0 =
          typeof app.homeFriendFabCustomCx === 'number'
            ? app.homeFriendFabCustomCx
            : cDrag.cx;
        startFabSnapAnim(cur0, snapIntent.targetCx, rFab);
      } else if (
        app._fabSnapAnim &&
        Math.abs(app._fabSnapAnim.toCx - snapIntent.targetCx) > 1
      ) {
        stopFabSnapAnim(false);
        var cur1 =
          typeof app.homeFriendFabCustomCx === 'number'
            ? app.homeFriendFabCustomCx
            : cDrag.cx;
        startFabSnapAnim(cur1, snapIntent.targetCx, rFab);
      } else if (
        !app._fabSnapAnim &&
        typeof app.homeFriendFabCustomCx === 'number' &&
        Math.abs(app.homeFriendFabCustomCx - snapIntent.targetCx) > 2
      ) {
        startFabSnapAnim(
          app.homeFriendFabCustomCx,
          snapIntent.targetCx,
          rFab
        );
      } else if (typeof app.draw === 'function') {
        app.draw();
      }
      return true;
    }
    if (
      app.homeFriendListOpen &&
      app.homeFriendChatPeer &&
      app._friendChatScrollTouchId != null &&
      app._flAnimMode !== 'out'
    ) {
      var touchesC = e.touches;
      if (!touchesC || !touchesC.length) {
        return false;
      }
      var tc = null;
      var tci;
      for (tci = 0; tci < touchesC.length; tci++) {
        if (touchesC[tci].identifier === app._friendChatScrollTouchId) {
          tc = touchesC[tci];
          break;
        }
      }
      if (!tc) {
        return false;
      }
      var dyC = tc.clientY - app._friendChatScrollLastY;
      app._friendChatScrollLastY = tc.clientY;
      if (Math.abs(dyC) > 2) {
        app._friendChatScrollMoved = true;
      }
      var Lc = app.getHomeFriendListPanelLayout();
      var liftLc = Lc.chatMsgLiftPx || 0;
      var maxScrollC = Math.min(
        0,
        Lc.chatMsgH - (app._friendChatLayoutTotalH || 0)
      );
      app.friendChatScrollY += dyC;
      if (app.friendChatScrollY - liftLc > 0) {
        app.friendChatScrollY = liftLc;
      }
      if (app.friendChatScrollY - liftLc < maxScrollC) {
        app.friendChatScrollY = maxScrollC + liftLc;
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
      return true;
    }
    if (
      app.homeFriendListOpen &&
      !app.homeFriendChatPeer &&
      app._flRowTouch &&
      app._flAnimMode !== 'out'
    ) {
      var tSwipe = null;
      var tsi;
      if (e.touches && e.touches.length) {
        for (tsi = 0; tsi < e.touches.length; tsi++) {
          if (e.touches[tsi].identifier === app._flRowTouch.id) {
            tSwipe = e.touches[tsi];
            break;
          }
        }
      }
      if (tSwipe) {
        var ft0 = app._flRowTouch;
        var sdx = tSwipe.clientX - ft0.x0;
        var sdy = tSwipe.clientY - ft0.y0;
        if (ft0.mode === 0) {
          if (sdx * sdx + sdy * sdy < FRIEND_LIST_SWIPE_DECIDE_PX2) {
            return true;
          }
          if (Math.abs(sdx) > Math.abs(sdy)) {
            ft0.mode = 2;
            app._friendListScrollTouchId = null;
            var wM = getFriendListSwipeActionWidths().total;
            var s0 = typeof ft0.startOff === 'number' ? ft0.startOff : 0;
            if (s0 < 0) s0 = 0;
            if (s0 > wM) s0 = wM;
            if (ft0.peerKey) {
              app.friendListRowSwipe = {
                peerKey: ft0.peerKey,
                offset: s0
              };
            }
            ft0.horizStartX = tSwipe.clientX;
            ft0.horizBaseOff = s0;
            if (typeof app.draw === 'function') {
              app.draw();
            }
            return true;
          }
          friendListCloseSwipe();
          app._flRowTouch = null;
          app._friendListScrollLastY = tSwipe.clientY;
        } else if (ft0.mode === 2) {
          var wAct0 = getFriendListSwipeActionWidths();
          var maxO0 = wAct0.total;
          var oNew = ft0.horizBaseOff + (ft0.horizStartX - tSwipe.clientX);
          if (oNew < 0) oNew = 0;
          if (oNew > maxO0) oNew = maxO0;
          if (ft0.peerKey) {
            app.friendListRowSwipe = {
              peerKey: ft0.peerKey,
              offset: oNew
            };
          }
          app._friendListRowTapIdx = -1;
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return true;
        }
      }
    }
    if (
      !app.homeFriendListOpen ||
      app._flAnimMode === 'out' ||
      !app._friendListScrollTouchId
    ) {
      return false;
    }
    var touches = e.touches;
    if (!touches || !touches.length) {
      return false;
    }
    var ti;
    var t = null;
    for (ti = 0; ti < touches.length; ti++) {
      if (touches[ti].identifier === app._friendListScrollTouchId) {
        t = touches[ti];
        break;
      }
    }
    if (!t) {
      return false;
    }
    var dy = t.clientY - app._friendListScrollLastY;
    app._friendListScrollLastY = t.clientY;
    var L = app.getHomeFriendListPanelLayout();
    var rows = getFilteredFriends();
    var totalH = rows.length * L.rowH;
    var maxScroll = Math.min(0, L.listH - totalH);
    app.friendListScrollY += dy;
    if (app.friendListScrollY > 0) {
      app.friendListScrollY = 0;
    }
    if (app.friendListScrollY < maxScroll) {
      app.friendListScrollY = maxScroll;
    }
    app._friendListRowTapIdx = -1;
    if (typeof app.draw === 'function') {
      app.draw();
    }
    return true;
  };

  app.onHomeFriendListTouchEnd = function (x, y) {
    app.ensureHomeFriendListPersistedStateOnce();
    if (app._flAnimMode === 'out') {
      return true;
    }
    if (!app.homeFriendListOpen) {
      var hadFabTouch = app._friendFabTouchId != null;
      var endedFabDrag = app.homeFriendFabDragging;
      app._friendFabTouchId = null;
      app.homeFriendFabDragging = false;
      if (hadFabTouch) {
        if (endedFabDrag) {
          app.homeFriendFabPressed = false;
          app._friendFabInEdgeSnap = false;
          stopFabSnapAnim(true);
          var rEnd = HOME_FRIEND_LIST_FAB_R;
          var spEnd = snapFabHorizontalEdge(
            app.homeFriendFabCustomCx,
            app.homeFriendFabCustomCy,
            rEnd,
            x
          );
          app.homeFriendFabCustomCx = spEnd.cx;
          app.homeFriendFabCustomCy = spEnd.cy;
          persistFabPos();
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return true;
        }
        if (app.homeFriendFabPressed) {
          app.homeFriendFabPressed = false;
          var F = app.getHomeFriendListFabLayout();
          var dx = x - F.cx;
          var dy = y - F.cy;
          if (dx * dx + dy * dy <= F.r * F.r * 1.44) {
            /** 始终打开好友列表；观战列表仅由棋盘「观战人数：N」徽章打开，不与 FAB 共用模式 */
            app.openHomeFriendList(false);
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return true;
        }
        return false;
      }
      return false;
    }

    app._friendListScrollTouchId = null;
    app._friendChatScrollTouchId = null;
    app._friendChatScrollMoved = false;

    var slop = 14;
    var moved =
      app._friendListRowTapIdx < 0 ||
      Math.abs(x - app._friendListRowTapX) > slop ||
      Math.abs(y - app._friendListRowTapY) > slop;
    if (app._flRowTouch && app._flRowTouch.mode === 2) {
      moved = true;
    }

    var L = app.getHomeFriendListPanelLayout();

    var slide = easeInOut(app._flSlideT != null ? app._flSlideT : 1);
    var panelX = L.x0 - L.w * (1 - slide) * 0.92;

    var oPreSwipe =
      (app.friendListRowSwipe && app.friendListRowSwipe.offset) || 0;
    var pkSwipe =
      app.friendListRowSwipe && app.friendListRowSwipe.peerKey
        ? app.friendListRowSwipe.peerKey
        : '';
    var hadListHoriz = !!(app._flRowTouch && app._flRowTouch.mode === 2);
    var pkSnap = hadListHoriz && app._flRowTouch ? app._flRowTouch.peerKey : '';
    app._flRowTouch = null;

    if (app.homeFriendChatPeer) {
      if (hitFriendChatBack(L, panelX, x, y)) {
        exitHomeFriendChat();
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
      var barKind = app._friendChatBarHitKind;
      app._friendChatBarHitKind = null;
      var barHadDown =
        typeof app._friendChatBarDownX === 'number' &&
        typeof app._friendChatBarDownY === 'number';
      if (barHadDown && (barKind === 'input' || barKind === 'send')) {
        var ds =
          Math.abs(x - app._friendChatBarDownX) <= 20 &&
          Math.abs(y - app._friendChatBarDownY) <= 20;
        app._friendChatBarDownX = undefined;
        app._friendChatBarDownY = undefined;
        if (ds) {
          if (
            barKind === 'input' &&
            typeof app.openFriendChatKeyboard === 'function'
          ) {
            app.openFriendChatKeyboard();
          } else if (barKind === 'send') {
            var peerSend = app.homeFriendChatPeer;
            if (peerSend && peerSend.peerUserId != null) {
              var tSend = String(app.friendChatComposeDraft || '').replace(
                /^\s+|\s+$/g,
                ''
              );
              if (tSend) {
                postFriendDirectMessage(peerSend.peerUserId, tSend);
              } else if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '消息不能为空', icon: 'none' });
              }
            }
          }
        }
        return true;
      }
      app._friendChatBarDownX = undefined;
      app._friendChatBarDownY = undefined;

      var insidePanelChat =
        x >= panelX &&
        x <= panelX + L.w &&
        y >= L.y0 &&
        y <= L.y0 + L.h;

      if (!insidePanelChat) {
        app.closeHomeFriendList();
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }

      app._friendListRowTapIdx = -1;
      return true;
    }

    if (hitCollapse(L, panelX, x, y)) {
      app.closeHomeFriendList();
      return true;
    }
    var insidePanel =
      x >= panelX &&
      x <= panelX + L.w &&
      y >= L.y0 &&
      y <= L.y0 + L.h;

    var kbActive =
      typeof app._friendListSearchKbCleanup === 'function' &&
      app._friendListSearchKbCleanup;
    var kbDmActive =
      typeof app._friendDmKbCleanup === 'function' &&
      app._friendDmKbCleanup;

    if (kbActive || kbDmActive) {
      if (!insidePanel) {
        app.dismissFriendListSearchKeyboard();
        app.dismissFriendDmKeyboard();
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
      var onSearchKb = hitSearch(L, panelX, x, y);
      var rowsKb = getFilteredFriends();
      var rkb;
      var onRowKb = false;
      for (rkb = 0; rkb < rowsKb.length && rkb < 50; rkb++) {
        if (hitFriendRow(L, panelX, x, y, rkb)) {
          onRowKb = true;
          break;
        }
      }
      var onChatBarKb =
        app.homeFriendChatPeer &&
        (hitFriendChatInputField(L, panelX, x, y) ||
          hitFriendChatSend(L, panelX, x, y));
      if (!onSearchKb && !onRowKb && !onChatBarKb) {
        app.dismissFriendListSearchKeyboard();
        app.dismissFriendDmKeyboard();
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
    }

    if (!insidePanel) {
      app.closeHomeFriendList();
      return true;
    }

    if (hitSearch(L, panelX, x, y)) {
      if (typeof app.openFriendListSearchKeyboard === 'function') {
        app.openFriendListSearchKeyboard();
      }
      if (hadListHoriz) {
        var wFin0 = getFriendListSwipeActionWidths().total;
        if (oPreSwipe < wFin0 * 0.5) {
          friendListCloseSwipe();
        } else if (pkSnap) {
          app.friendListRowSwipe = { peerKey: pkSnap, offset: wFin0 };
        }
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
      return true;
    }

    if (oPreSwipe > 0.5 && pkSwipe) {
      var rowsA = getFilteredFriends();
      var ira;
      var iRowHit = -1;
      for (ira = 0; ira < rowsA.length; ira++) {
        if (friendListPeerKey(rowsA[ira]) === pkSwipe) {
          iRowHit = ira;
          break;
        }
      }
      if (iRowHit >= 0) {
        var fList = rowsA[iRowHit];
        var yRowH = L.listTop + iRowHit * L.rowH + app.friendListScrollY;
        var actHit = friendListHitSwipeAction(
          x,
          y,
          L,
          panelX,
          yRowH,
          oPreSwipe
        );
        if (actHit === 'remark') {
          openFriendRemarkDialog(fList);
          return true;
        }
        if (actHit === 'delete') {
          if (hadListHoriz) {
            var wFD = getFriendListSwipeActionWidths().total;
            if (oPreSwipe < wFD * 0.5) {
              friendListCloseSwipe();
            } else if (pkSnap) {
              app.friendListRowSwipe = {
                peerKey: pkSnap,
                offset: wFD
              };
            }
          }
          if (typeof wx.showModal === 'function') {
            wx.showModal({
              title: '删除好友',
              content: '确定从好友列表中删除该好友吗？',
              success: function (res) {
                if (res.confirm) {
                  deleteFriendByPeerId(fList.peerUserId, null);
                } else if (typeof app.draw === 'function') {
                  app.draw();
                }
              }
            });
          } else {
            deleteFriendByPeerId(fList.peerUserId, null);
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return true;
        }
        if (
          friendRowInGame(fList) &&
          !fList._spectatorInRoom &&
          friendListHitWatch(x, y, L, panelX, yRowH, oPreSwipe) &&
          typeof app.startOnlineFriendWatchFromPeer === 'function'
        ) {
          if (hadListHoriz) {
            var wFW = getFriendListSwipeActionWidths().total;
            if (oPreSwipe < wFW * 0.5) {
              friendListCloseSwipe();
            } else if (pkSnap) {
              app.friendListRowSwipe = { peerKey: pkSnap, offset: wFW };
            }
          } else {
            friendListCloseSwipe();
          }
          app.startOnlineFriendWatchFromPeer(fList.peerUserId);
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return true;
        }
        if (
          friendListRowShowInviteBtn(
            !!app._gameSpectatorFilter && app.isPvpOnline,
            fList
          ) &&
          friendListHitInvite(x, y, L, panelX, yRowH, oPreSwipe) &&
          typeof app.startOnlineAsHost === 'function'
        ) {
          if (hadListHoriz) {
            var wFI = getFriendListSwipeActionWidths().total;
            if (oPreSwipe < wFI * 0.5) {
              friendListCloseSwipe();
            } else if (pkSnap) {
              app.friendListRowSwipe = { peerKey: pkSnap, offset: wFI };
            }
          } else {
            friendListCloseSwipe();
          }
          app.closeHomeFriendList();
          startOnlineInviteFromFriendListRow(fList.peerUserId);
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return true;
        }
        var rPadG = app.rpx(8);
        var rLeftG = panelX + rPadG;
        var rWG = L.w - rPadG * 2;
        var wTotG = getFriendListSwipeActionWidths().total;
        if (
          !hadListHoriz &&
          hitFriendRow(L, panelX, x, y, iRowHit) &&
          x < rLeftG + rWG - wTotG
        ) {
          friendListCloseSwipe();
          if (typeof app.openHomeFriendChatMode === 'function') {
            app.openHomeFriendChatMode(fList);
          }
          return true;
        }
      }
    }
    if (hadListHoriz) {
      var wFin = getFriendListSwipeActionWidths().total;
      if (oPreSwipe < wFin * 0.5) {
        friendListCloseSwipe();
      } else if (pkSnap) {
        app.friendListRowSwipe = { peerKey: pkSnap, offset: wFin };
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }

    var rows = getFilteredFriends();

    if (!moved && app._friendListRowTapIdx >= 0) {
      var idx = app._friendListRowTapIdx;
      app._friendListRowTapIdx = -1;
      var fTap = rows[idx];
      if (fTap) {
        var yRowTap = L.listTop + idx * L.rowH + app.friendListScrollY;
        var offTap = 0;
        if (
          app.friendListRowSwipe &&
          app.friendListRowSwipe.peerKey === friendListPeerKey(fTap)
        ) {
          offTap = app.friendListRowSwipe.offset || 0;
        }
        if (
          friendRowInGame(fTap) &&
          !fTap._spectatorInRoom &&
          friendListHitWatch(x, y, L, panelX, yRowTap, offTap) &&
          typeof app.startOnlineFriendWatchFromPeer === 'function'
        ) {
          app.startOnlineFriendWatchFromPeer(fTap.peerUserId);
          return true;
        }
        if (
          friendListRowShowInviteBtn(
            !!app._gameSpectatorFilter && app.isPvpOnline,
            fTap
          ) &&
          friendListHitInvite(x, y, L, panelX, yRowTap, offTap) &&
          typeof app.startOnlineAsHost === 'function'
        ) {
          app.closeHomeFriendList();
          startOnlineInviteFromFriendListRow(fTap.peerUserId);
          return true;
        }
        if (typeof app.openHomeFriendChatMode === 'function') {
          app.openHomeFriendChatMode(fTap);
        }
      }
      return true;
    }
    app._friendListRowTapIdx = -1;
    return true;
  };

  /**
   * 抠图后再剥边：8 邻域 + 多遍，去掉与透明相邻的暗部/半透明晕边。
   */
  function friendFabErodeKeyFringe(cvs, passes) {
    if (!cvs || !cvs.width || !cvs.height) {
      return;
    }
    var nPass = passes > 0 ? passes : 1;
    var c2 = cvs.getContext('2d');
    if (!c2 || !c2.getImageData) {
      return;
    }
    var w = cvs.width;
    var h = cvs.height;
    /** 与「近似透明」相邻且 RGB 和低于此值的像素剥掉 */
    var maxSum = 210;
    /** 邻域 alpha 低于此视为透明（略抬高以吃掉抗锯齿灰边） */
    var alphaNear0 = 22;
    var p;
    for (p = 0; p < nPass; p++) {
      var imgData = c2.getImageData(0, 0, w, h);
      var d = imgData.data;
      var copy = new Uint8ClampedArray(d.length);
      copy.set(d);
      var x;
      var y;
      var i;
      var sum;
      var row = w * 4;
      for (y = 1; y < h - 1; y++) {
        for (x = 1; x < w - 1; x++) {
          i = (y * w + x) * 4;
          if (copy[i + 3] < alphaNear0) {
            continue;
          }
          sum = copy[i] + copy[i + 1] + copy[i + 2];
          if (sum >= maxSum) {
            continue;
          }
          if (
            copy[i - row - 4 + 3] < alphaNear0 ||
            copy[i - row + 3] < alphaNear0 ||
            copy[i - row + 4 + 3] < alphaNear0 ||
            copy[i - 4 + 3] < alphaNear0 ||
            copy[i + 4 + 3] < alphaNear0 ||
            copy[i + row - 4 + 3] < alphaNear0 ||
            copy[i + row + 3] < alphaNear0 ||
            copy[i + row + 4 + 3] < alphaNear0
          ) {
            d[i + 3] = 0;
          }
        }
      }
      c2.putImageData(imgData, 0, 0);
    }
  }

  /** 去掉仍残留的半透明黑灰（抠图/缩放产生的弱 alpha） */
  function friendFabCullDarkHalos(cvs) {
    if (!cvs || !cvs.width || !cvs.height) {
      return;
    }
    var c2 = cvs.getContext('2d');
    if (!c2 || !c2.getImageData) {
      return;
    }
    var w = cvs.width;
    var h = cvs.height;
    var imgData = c2.getImageData(0, 0, w, h);
    var d = imgData.data;
    var i;
    var a;
    var sum;
    for (i = 0; i < d.length; i += 4) {
      a = d[i + 3];
      if (a < 1) {
        continue;
      }
      sum = d[i] + d[i + 1] + d[i + 2];
      if (a < 72 && sum < 125) {
        d[i + 3] = 0;
      } else if (a < 110 && sum < 85) {
        d[i + 3] = 0;
      }
    }
    c2.putImageData(imgData, 0, 0);
  }

  /**
   * 悬浮球用图：对近黑底做软边抠透明（与水墨叠图同源 {@link render.buildBlackKeyForeground}）。
   * 纯黑细部（如极小纯黑眼睛）可能被误抠，更稳妥请使用透明底 PNG。
   */
  function getFriendFabDrawSource() {
    var src = app.homeFriendFabImg;
    if (!src || !src.width || !src.height) {
      return null;
    }
    if (
      app._friendFabKeyCacheImg === src &&
      app._friendFabKeyCacheRev === FRIEND_FAB_DRAW_REV
    ) {
      return app._friendFabKeyCacheCanvas || src;
    }
    app._friendFabKeyCacheImg = src;
    app._friendFabKeyCacheRev = FRIEND_FAB_DRAW_REV;
    var keyed =
      render && typeof render.buildBlackKeyForeground === 'function'
        ? render.buildBlackKeyForeground(src, {
            sum0: 52,
            sum1: 102,
            keyLinear: true
          })
        : null;
    if (keyed) {
      friendFabErodeKeyFringe(keyed, 3);
      friendFabCullDarkHalos(keyed);
    }
    app._friendFabKeyCacheCanvas = keyed || null;
    return app._friendFabKeyCacheCanvas || src;
  }

  app.drawHomeFriendListFab = function (th) {
    if (app.homeFriendListOpen) {
      return;
    }
    app.ensureHomeFriendListPersistedStateOnce();
    var thFab =
      th || (typeof app.getCurrentTheme === 'function' ? app.getCurrentTheme() : null);
    var FL =
      typeof app.friendListHomeUiFromTheme === 'function'
        ? app.friendListHomeUiFromTheme(thFab)
        : null;
    var fillB = FL ? FL.fabFill : '#F5EADF';
    var strokeB = FL ? FL.fabStroke : 'rgba(93, 64, 55, 0.35)';
    var iconC = FL && FL.fabIcon ? FL.fabIcon : '#5D4037';
    var fabUnread = FL && FL.fabUnreadHighlight ? FL.fabUnreadHighlight : '#E65100';
    var fabUnreadSoft =
      FL && FL.fabUnreadHighlightSoft
        ? FL.fabUnreadHighlightSoft
        : 'rgba(255, 200, 140, 0.8)';
    var F = app.getHomeFriendListFabLayout();
    var hasUnread = friendDmHasAnyUnread();
    var tFab = Date.now();
    var highlightActive =
      hasUnread &&
      typeof app._friendFabHighlightUntil === 'number' &&
      tFab < app._friendFabHighlightUntil;
    var hiPhase = 0;
    if (highlightActive) {
      hiPhase = (app._friendFabHighlightUntil - tFab) / FRIEND_FAB_MSG_HIGHLIGHT_MS;
      if (hiPhase > 1) hiPhase = 1;
      hiPhase = 1 - (1 - hiPhase) * (1 - hiPhase);
    }
    var breath = 1;
    if (hasUnread && !app.homeFriendFabPressed && !app.homeFriendFabDragging) {
      var ampB = highlightActive ? 0.1 : 0.07;
      breath = 1 + ampB * (0.5 + 0.5 * Math.sin(tFab * 0.007));
    }
    var scale = (app.homeFriendFabPressed ? 0.95 : 1) * breath;
    var cx = F.cx;
    var cy = F.cy;
    var r = F.r;
    var d = fabEdgeCollapseDrawCenter(cx, cy, r);
    var px = d.cx;
    var py = d.cy;
    var sPx = app.snapPx(px);
    var sPy = app.snapPx(py);
    var sPr = app.snapPx(r);
    var clipR = sPr * FRIEND_FAB_CLIP_R_MUL;

    app.ctx.save();
    app.ctx.beginPath();
    app.ctx.rect(0, 0, app.W, app.H);
    app.ctx.clip();
    app.ctx.translate(cx, cy);
    app.ctx.scale(scale, scale);
    app.ctx.translate(-cx, -cy);
    app.ctx.globalAlpha = 1;
    app.ctx.globalCompositeOperation = 'source-over';

    if (hasUnread) {
      var ph0 = tFab * 0.0062;
      var aRing0 =
        0.32 + 0.2 * (0.5 + 0.5 * Math.sin(ph0)) + 0.28 * hiPhase;
      var rRing0 = sPr * (1.1 + 0.055 * Math.sin(ph0) + 0.1 * hiPhase);
      app.ctx.save();
      app.ctx.globalAlpha = Math.min(0.92, aRing0);
      app.ctx.strokeStyle = fabUnread;
      app.ctx.lineWidth = Math.max(2.5, app.rpx(4.2));
      app.ctx.lineCap = 'round';
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, rRing0, 0, Math.PI * 2);
      app.ctx.stroke();
      var rRing1 = sPr * (1.3 + 0.04 * Math.sin(ph0 * 0.75));
      app.ctx.globalAlpha =
        0.2 + 0.14 * hiPhase + 0.12 * (0.5 + 0.5 * Math.sin(ph0 * 0.85));
      app.ctx.strokeStyle = fabUnreadSoft;
      app.ctx.lineWidth = app.rpx(2.6);
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, rRing1, 0, Math.PI * 2);
      app.ctx.stroke();
      app.ctx.restore();
    }

    var fabImg = getFriendFabDrawSource();
    var useFabImg =
      fabImg &&
      fabImg.width > 0 &&
      fabImg.height > 0 &&
      typeof app.drawHomeUiImageContain === 'function';

    function drawFriendFabSphereShadeDisk() {
      app.ctx.save();
      app.ctx.shadowColor = 'rgba(12, 10, 8, 0.38)';
      app.ctx.shadowBlur = Math.max(8, app.rpx(12));
      app.ctx.shadowOffsetY = Math.max(3, app.rpx(4.5));
      app.ctx.shadowOffsetX = 0;
      app.ctx.fillStyle = fillB;
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, sPr * 0.985, 0, Math.PI * 2);
      app.ctx.fill();
      app.ctx.restore();
    }

    function drawFriendFabGlossInCircle(radiusPx) {
      var g0x = px - r * 0.4;
      var g0y = py - r * 0.46;
      var gr = app.ctx.createRadialGradient(
        app.snapPx(g0x),
        app.snapPx(g0y),
        app.snapPx(Math.max(1, r * 0.06)),
        sPx,
        sPy,
        radiusPx * 1.05
      );
      gr.addColorStop(0, 'rgba(255,255,255,0.36)');
      gr.addColorStop(0.32, 'rgba(255,255,255,0.07)');
      gr.addColorStop(0.68, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.13)');
      app.ctx.fillStyle = gr;
      app.ctx.fillRect(sPx - radiusPx * 2, sPy - radiusPx * 2, radiusPx * 4, radiusPx * 4);
    }

    function drawFriendFabTopRimArc(radiusPx) {
      app.ctx.save();
      app.ctx.strokeStyle = 'rgba(255,255,255,0.48)';
      app.ctx.lineWidth = Math.max(1, app.rpx(1.35));
      app.ctx.lineCap = 'round';
      app.ctx.beginPath();
      app.ctx.arc(
        sPx,
        sPy,
        radiusPx * 0.93,
        -Math.PI * 0.92,
        -Math.PI * 0.08,
        false
      );
      app.ctx.stroke();
      app.ctx.restore();
    }

    if (useFabImg) {
      drawFriendFabSphereShadeDisk();
      app.ctx.save();
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, clipR, 0, Math.PI * 2);
      app.ctx.clip();
      app.drawHomeUiImageContain(
        fabImg,
        px,
        py,
        r * 2 * FRIEND_FAB_CONTAIN_MUL
      );
      drawFriendFabGlossInCircle(clipR);
      app.ctx.restore();
      drawFriendFabTopRimArc(clipR);
    } else {
      app.ctx.fillStyle = fillB;
      app.ctx.shadowColor = 'rgba(12, 10, 8, 0.36)';
      app.ctx.shadowBlur = Math.max(10, app.rpx(14));
      app.ctx.shadowOffsetY = Math.max(4, app.rpx(5));
      app.ctx.shadowOffsetX = 0;
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, sPr, 0, Math.PI * 2);
      app.ctx.fill();
      app.ctx.shadowBlur = 0;
      app.ctx.shadowOffsetY = 0;
      app.ctx.strokeStyle = strokeB;
      app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, sPr, 0, Math.PI * 2);
      app.ctx.stroke();
      app.ctx.save();
      app.ctx.beginPath();
      app.ctx.arc(sPx, sPy, sPr * 0.96, 0, Math.PI * 2);
      app.ctx.clip();
      drawFriendFabGlossInCircle(sPr * 0.96);
      app.ctx.restore();
      drawFriendFabTopRimArc(sPr);
      if (typeof app.drawHomeFriendListFabIcon === 'function') {
        app.drawHomeFriendListFabIcon(px, py, r, iconC);
      }
    }
    app.ctx.restore();
    ensureFriendFabUnreadPulse();
  };

  function wrapFriendChatLines(ctx, text, maxW) {
    var lines = [];
    var line = '';
    var s = String(text || '');
    var i;
    for (i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var test = line + ch;
      if (ctx.measureText(test).width > maxW && line.length) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line.length) {
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  app.drawHomeFriendListOverlay = function (th) {
    if (!app.homeFriendListOpen) {
      return;
    }
    app.ensureHomeFriendListPersistedStateOnce();
    var thm =
      th || (typeof app.getCurrentTheme === 'function' ? app.getCurrentTheme() : null);
    var FL =
      typeof app.friendListHomeUiFromTheme === 'function'
        ? app.friendListHomeUiFromTheme(thm)
        : null;
    var bdA = FL && FL.backdropAlpha != null ? FL.backdropAlpha : 0.45;
    var panelBodyA =
      FL && FL.panelBodyAlpha != null ? FL.panelBodyAlpha : 0.92;
    var L = app.getHomeFriendListPanelLayout();
    var slide = easeInOut(app._flSlideT != null ? app._flSlideT : 1);
    var panelX = L.x0 - L.w * (1 - slide) * 0.92;
    /** 与滑入一致；搜索/Tab/行底与外壳同乘，否则实色块盖住外壳看不出通透 */
    var pa = panelBodyA * slide;
    var isSpectatorListUi = !!app._gameSpectatorFilter && app.isPvpOnline;

    app.ctx.save();
    app.ctx.fillStyle = 'rgba(0,0,0,' + bdA * slide + ')';
    app.ctx.fillRect(0, 0, app.W, app.H);

    var shPanel = FL && FL.panelShadow ? FL.panelShadow : 'rgba(0,0,0,0.18)';
    app.ctx.save();
    app.ctx.globalAlpha = pa;
    app.ctx.shadowColor = shPanel;
    app.ctx.shadowBlur = app.rpx(20);
    app.ctx.shadowOffsetY = app.rpx(8);
    var g0 = FL
      ? isSpectatorListUi && FL.spectatorPanelG0
        ? FL.spectatorPanelG0
        : FL.panelG0
      : '#ffffff';
    var g1 = FL
      ? isSpectatorListUi && FL.spectatorPanelG1
        ? FL.spectatorPanelG1
        : FL.panelG1
      : '#f9f6f2';
    var g2 = FL
      ? isSpectatorListUi && FL.spectatorPanelG2
        ? FL.spectatorPanelG2
        : FL.panelG2
      : '#f2ebe4';
    var shellGrad = app.ctx.createLinearGradient(
      panelX,
      L.y0,
      panelX,
      L.y0 + L.h
    );
    shellGrad.addColorStop(0, g0);
    shellGrad.addColorStop(0.48, g1);
    shellGrad.addColorStop(1, g2);
    app.ctx.fillStyle = shellGrad;
    app.roundRect(panelX, L.y0, L.w, L.h, app.rpx(12));
    app.ctx.fill();
    app.ctx.shadowBlur = 0;
    app.ctx.shadowOffsetY = 0;
    app.ctx.restore();

    var colTitle = FL && FL.title ? FL.title : '#5D4037';
    var colMuted = FL && FL.collapse ? FL.collapse : '#888888';

    if (app.homeFriendChatPeer) {
      var yChatInpBar = L.chatInputBarY;
      app.ctx.save();
      app.ctx.globalAlpha = pa;
      app.ctx.fillStyle =
        FL && FL.chatHeaderBg ? FL.chatHeaderBg : '#f9f6f2';
      app.ctx.fillRect(panelX, L.y0, L.w, L.headerH);
      app.ctx.fillStyle =
        FL && FL.chatMsgBg ? FL.chatMsgBg : 'rgba(244, 236, 226, 0.96)';
      app.ctx.fillRect(
        panelX,
        L.y0 + L.headerH,
        L.w,
        Math.max(0, yChatInpBar - (L.y0 + L.headerH))
      );
      app.ctx.strokeStyle = FL && FL.sep ? FL.sep : 'rgba(92,75,58,0.12)';
      app.ctx.lineWidth = 1;
      app.ctx.beginPath();
      app.ctx.moveTo(
        app.snapPx(panelX),
        app.snapPx(L.y0 + L.headerH - 0.5)
      );
      app.ctx.lineTo(
        app.snapPx(panelX + L.w),
        app.snapPx(L.y0 + L.headerH - 0.5)
      );
      app.ctx.stroke();
      app.ctx.restore();

      var peer = app.homeFriendChatPeer;
      var chatName0 = String(peer.displayName || peer.nickname || '好友');
      var chatName = chatName0;
      if (chatName.length > 11) {
        chatName = chatName.slice(0, 11) + '…';
      }

      (function drawFriendChatBackChevron() {
        var backPad = 10;
        var icx = panelX + app.rpx(22) + backPad;
        var icy = L.y0 + L.headerH * 0.5;
        var arm = app.rpx(11);
        app.ctx.save();
        app.ctx.strokeStyle = colMuted;
        app.ctx.lineWidth = Math.max(1.5, app.rpx(2.8));
        app.ctx.lineCap = 'round';
        app.ctx.lineJoin = 'round';
        app.ctx.beginPath();
        app.ctx.moveTo(
          app.snapPx(icx + arm * 0.45),
          app.snapPx(icy - arm * 0.58)
        );
        app.ctx.lineTo(app.snapPx(icx - arm * 0.42), app.snapPx(icy));
        app.ctx.lineTo(
          app.snapPx(icx + arm * 0.45),
          app.snapPx(icy + arm * 0.58)
        );
        app.ctx.stroke();
        app.ctx.restore();
      })();

      app.ctx.fillStyle = colTitle;
      app.ctx.font =
        '600 ' + app.rpx(30) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.fillText(
        chatName,
        app.snapPx(panelX + L.w * 0.5),
        app.snapPx(L.y0 + L.headerH * 0.5)
      );
      app.ctx.textAlign = 'left';

      var chatAvDesignRpx = Math.round(22 * 1.3);
      var chatAvR = app.rpx(chatAvDesignRpx);
      var msgFs = app.rpx(26);
      var lh = app.rpx(30);
      var gapMsg = app.rpx(10);
      var padBubble = app.rpx(12);
      var edgePad = app.rpx(12);
      var avSlot = chatAvR * 2 + app.rpx(8);
      var innerMaxOther = L.w - edgePad * 2 - avSlot;
      var innerMaxSelf = innerMaxOther;

      app.ctx.font =
        msgFs + 'px "PingFang SC","Hiragino Sans GB",sans-serif';

      var key = getFriendChatKey(peer.peerUserId);
      var msgs = app.friendChatMessagesByPeer[key] || [];
      var mi;
      var blocks = [];
      var totalH = app.rpx(8);
      for (mi = 0; mi < msgs.length; mi++) {
        var m = msgs[mi];
        var maxInner = m.isSelf ? innerMaxSelf : innerMaxOther;
        var linesM = wrapFriendChatLines(app.ctx, m.text, maxInner);
        var bubbleInnerH = linesM.length * lh + padBubble * 2;
        var rowH =
          Math.max(bubbleInnerH, chatAvR * 2 + app.rpx(4)) + gapMsg;
        var bubbleW = padBubble * 2;
        var lwi;
        for (lwi = 0; lwi < linesM.length; lwi++) {
          bubbleW = Math.max(
            bubbleW,
            app.ctx.measureText(linesM[lwi]).width + padBubble * 2
          );
        }
        bubbleW = Math.min(
          bubbleW,
          maxInner + padBubble * 2 + app.rpx(4)
        );
        blocks.push({
          msg: m,
          lines: linesM,
          rowH: rowH,
          bubbleH: bubbleInnerH,
          bubbleW: bubbleW
        });
        totalH += rowH;
      }
      if (msgs.length === 0) {
        totalH += app.rpx(100);
      }
      app._friendChatLayoutTotalH = totalH;

      var liftPx = L.chatMsgLiftPx || 0;
      if (app._friendChatNeedScrollBottom) {
        var smin0 = Math.min(0, L.chatMsgH - totalH);
        app.friendChatScrollY = smin0 + liftPx;
        app._friendChatNeedScrollBottom = false;
      }
      var maxS0 = Math.min(0, L.chatMsgH - totalH);
      var scrollEff0 = app.friendChatScrollY - liftPx;
      if (scrollEff0 < maxS0) {
        app.friendChatScrollY = maxS0 + liftPx;
      }
      if (scrollEff0 > 0) {
        app.friendChatScrollY = liftPx;
      }
      var yDrawScroll = app.friendChatScrollY - liftPx;

      app.ctx.save();
      app.ctx.beginPath();
      app.ctx.rect(
        panelX + app.rpx(4),
        L.chatMsgTop,
        L.w - app.rpx(8),
        L.chatMsgH
      );
      app.ctx.clip();

      if (!msgs.length) {
        app.ctx.fillStyle = colMuted;
        app.ctx.font =
          app.rpx(24) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
        app.ctx.textAlign = 'center';
        app.ctx.textBaseline = 'middle';
        app.ctx.fillText(
          '暂无聊天记录，快来打个招呼吧~',
          app.snapPx(panelX + L.w * 0.5),
          app.snapPx(L.chatMsgTop + L.chatMsgH * 0.38)
        );
        app.ctx.textAlign = 'left';
      } else {
        function drawFriendChatRoundAvatar(img, acx, acy, avR, drawPlaceholder) {
          var diam = avR * 2;
          if (
            img &&
            img.complete &&
            img.width &&
            !img._failed &&
            typeof app.drawHomeUiImageContain === 'function'
          ) {
            app.ctx.save();
            app.ctx.beginPath();
            app.ctx.arc(
              app.snapPx(acx),
              app.snapPx(acy),
              app.snapPx(avR),
              0,
              Math.PI * 2
            );
            app.ctx.clip();
            var drew = app.drawHomeUiImageContain(img, acx, acy, diam);
            app.ctx.restore();
            if (drew) {
              return;
            }
          }
          drawPlaceholder();
        }
        var yC = L.chatMsgTop + app.rpx(8) + yDrawScroll;
        var bi;
        for (bi = 0; bi < blocks.length; bi++) {
          var blk = blocks[bi];
          var mm = blk.msg;
          var lines2 = blk.lines;
          var rowHH = blk.rowH;
          var bubbleH = blk.bubbleH;
          var bubbleW2 = blk.bubbleW;
          var isSelf = mm.isSelf;
          var bubbleLeft;
          var bubbleTop = yC + app.rpx(6);
          var avCx;
          var avCy = yC + rowHH * 0.5 - gapMsg * 0.35;
          var bubbleColOther =
            FL && FL.chatBubbleOther
              ? FL.chatBubbleOther
              : 'rgba(255, 253, 248, 0.97)';
          var bubbleColSelf =
            FL && FL.chatBubbleSelf
              ? FL.chatBubbleSelf
              : 'rgba(191, 144, 99, 0.34)';
          var bubbleStrokeOther =
            FL && FL.chatBubbleOtherStroke
              ? FL.chatBubbleOtherStroke
              : 'rgba(200, 188, 172, 0.4)';
          var bubbleRad = app.rpx(6);
          var textOnOther = colTitle;
          var textOnSelf = colTitle;
          var lj;

          if (!isSelf) {
            avCx = panelX + edgePad + chatAvR;
            bubbleLeft = panelX + avSlot + edgePad * 0.5;
            var imgO =
              peer.peerUserId &&
              app._friendAvImgs['k' + peer.peerUserId];
            drawFriendChatRoundAvatar(imgO, avCx, avCy, chatAvR, function () {
              app.ctx.fillStyle = FL && FL.avatarFallback
                ? FL.avatarFallback
                : '#E0D6C8';
              app.ctx.beginPath();
              app.ctx.arc(
                app.snapPx(avCx),
                app.snapPx(avCy),
                app.snapPx(chatAvR),
                0,
                Math.PI * 2
              );
              app.ctx.fill();
              app.ctx.fillStyle = colTitle;
              app.ctx.font =
                app.rpx(chatAvDesignRpx) +
                'px "PingFang SC","Hiragino Sans GB",sans-serif';
              app.ctx.textAlign = 'center';
              app.ctx.textBaseline = 'middle';
              app.ctx.fillText(
                String(chatName0).charAt(0),
                app.snapPx(avCx),
                app.snapPx(avCy)
              );
              app.ctx.textAlign = 'left';
              app.ctx.font =
                msgFs + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
            });
            app.ctx.fillStyle = bubbleColOther;
            app.roundRect(
              bubbleLeft,
              bubbleTop,
              bubbleW2,
              bubbleH,
              bubbleRad
            );
            app.ctx.fill();
            app.ctx.strokeStyle = bubbleStrokeOther;
            app.ctx.lineWidth = 1;
            app.ctx.stroke();
            app.ctx.fillStyle = textOnOther;
            app.ctx.textBaseline = 'middle';
            for (lj = 0; lj < lines2.length; lj++) {
              app.ctx.fillText(
                lines2[lj],
                app.snapPx(bubbleLeft + padBubble),
                app.snapPx(bubbleTop + padBubble + lh * (lj + 0.5))
              );
            }
          } else {
            avCx = panelX + L.w - edgePad - chatAvR;
            bubbleLeft = avCx - chatAvR - app.rpx(8) - bubbleW2;
            var imgMe = app.myNetworkAvatarImg;
            drawFriendChatRoundAvatar(imgMe, avCx, avCy, chatAvR, function () {
              app.ctx.fillStyle =
                FL && FL.chatAvatarSelfFallback
                  ? FL.chatAvatarSelfFallback
                  : FL && FL.avatarFallback
                    ? FL.avatarFallback
                    : '#ead8c8';
              app.ctx.beginPath();
              app.ctx.arc(
                app.snapPx(avCx),
                app.snapPx(avCy),
                app.snapPx(chatAvR),
                0,
                Math.PI * 2
              );
              app.ctx.fill();
              app.ctx.fillStyle = colTitle;
              app.ctx.font =
                app.rpx(chatAvDesignRpx) +
                'px "PingFang SC","Hiragino Sans GB",sans-serif';
              app.ctx.textAlign = 'center';
              app.ctx.textBaseline = 'middle';
              app.ctx.fillText(
                '我',
                app.snapPx(avCx),
                app.snapPx(avCy)
              );
              app.ctx.textAlign = 'left';
              app.ctx.font =
                msgFs + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
            });
            app.ctx.fillStyle = bubbleColSelf;
            app.roundRect(
              bubbleLeft,
              bubbleTop,
              bubbleW2,
              bubbleH,
              bubbleRad
            );
            app.ctx.fill();
            app.ctx.fillStyle = textOnSelf;
            app.ctx.textBaseline = 'middle';
            for (lj = 0; lj < lines2.length; lj++) {
              app.ctx.fillText(
                lines2[lj],
                app.snapPx(bubbleLeft + padBubble),
                app.snapPx(bubbleTop + padBubble + lh * (lj + 0.5))
              );
            }
          }
          yC += rowHH;
        }
      }
      app.ctx.restore();

      var yInp =
        L.chatInputBarY != null
          ? L.chatInputBarY
          : L.y0 + L.h - L.chatInputBarH;
      app.ctx.save();
      app.ctx.globalAlpha = pa;
      app.ctx.fillStyle =
        FL && FL.searchBg0 ? FL.searchBg0 : 'rgba(250,246,240,0.98)';
      app.ctx.fillRect(panelX, yInp, L.w, L.chatInputBarH);
      app.ctx.restore();

      app.ctx.strokeStyle = FL && FL.sep ? FL.sep : 'rgba(92,75,58,0.12)';
      app.ctx.lineWidth = 1;
      app.ctx.beginPath();
      app.ctx.moveTo(app.snapPx(panelX), app.snapPx(yInp + 0.5));
      app.ctx.lineTo(
        app.snapPx(panelX + L.w),
        app.snapPx(yInp + 0.5)
      );
      app.ctx.stroke();

      var sendW = app.rpx(72);
      var inpX = panelX + app.rpx(12);
      var inpW = L.w - app.rpx(24) - sendW - app.rpx(8);
      var inpH = app.rpx(56);
      var inpY = yInp + (L.chatInputBarH - inpH) * 0.5;
      app.ctx.fillStyle =
        FL && FL.chatBubbleOther
          ? FL.chatBubbleOther
          : 'rgba(255, 253, 248, 0.97)';
      app.roundRect(inpX, inpY, inpW, inpH, app.rpx(6));
      app.ctx.fill();
      app.ctx.strokeStyle =
        FL && FL.chatBubbleOtherStroke
          ? FL.chatBubbleOtherStroke
          : 'rgba(200, 188, 172, 0.4)';
      app.ctx.stroke();
      var padInpL = app.rpx(14);
      var inpTextMaxW = inpW - padInpL - app.rpx(10);
      app.ctx.font =
        app.rpx(24) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textBaseline = 'middle';
      var composeRaw =
        app.friendChatComposeDraft != null
          ? String(app.friendChatComposeDraft)
          : '';
      var hasCompose = composeRaw.replace(/\s/g, '').length > 0;
      var inpTextX = inpX + padInpL;
      var inpTextY = inpY + inpH * 0.5;
      var kbInpActive =
        typeof app._friendDmKbCleanup === 'function' &&
        app._friendDmKbCleanup;
      var cursorPrefix = '';
      if (hasCompose) {
        app.ctx.fillStyle = colTitle;
        var tVis = composeRaw;
        while (
          tVis.length > 0 &&
          app.ctx.measureText(tVis).width > inpTextMaxW
        ) {
          tVis = tVis.slice(0, -1);
        }
        if (tVis.length < composeRaw.length) {
          var ellInp = '…';
          while (
            tVis.length > 0 &&
            app.ctx.measureText(tVis + ellInp).width > inpTextMaxW
          ) {
            tVis = tVis.slice(0, -1);
          }
          cursorPrefix = tVis;
          tVis += ellInp;
        } else {
          cursorPrefix = tVis;
        }
        app.ctx.fillText(
          tVis,
          app.snapPx(inpTextX),
          app.snapPx(inpTextY)
        );
      } else if (!kbInpActive) {
        app.ctx.fillStyle = colMuted;
        app.ctx.fillText(
          '说点什么...',
          app.snapPx(inpTextX),
          app.snapPx(inpTextY)
        );
      }
      if (kbInpActive) {
        var curW0 = hasCompose
          ? app.ctx.measureText(cursorPrefix).width
          : 0;
        var cxCur = inpTextX + curW0;
        var cxMax = inpX + inpW - app.rpx(8);
        if (cxCur > cxMax) {
          cxCur = cxMax;
        }
        if ((Date.now() % 920) < 460) {
          app.ctx.fillStyle =
            FL && FL.chatCursor ? FL.chatCursor : colTitle;
          var curH = app.rpx(22);
          var curT = Math.max(1, app.rpx(2));
          app.ctx.fillRect(
            app.snapPx(cxCur),
            app.snapPx(inpTextY - curH * 0.5),
            curT,
            curH
          );
        }
      }

      var sendX = panelX + L.w - app.rpx(12) - sendW;
      app.ctx.font =
        '500 ' + app.rpx(28) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillStyle = hasCompose
        ? FL && FL.chatSendActive
          ? FL.chatSendActive
          : colTitle
        : FL && FL.chatSendInactive
          ? FL.chatSendInactive
          : colMuted;
      app.ctx.fillText(
        '发送',
        app.snapPx(sendX + sendW * 0.5),
        app.snapPx(inpY + inpH * 0.5)
      );
      app.ctx.textAlign = 'left';
    } else {
    var isSpectatorMode = isSpectatorListUi;
    var titleText = isSpectatorMode
      ? (FL && FL.spectatorListTitle ? FL.spectatorListTitle : '观战列表')
      : '好友列表';
    if (isSpectatorMode) {
      var friendN = getFilteredFriends().length;
      var total =
        typeof app.spectatorCount === 'number' ? app.spectatorCount : friendN;
      if (app.spectatorListLoading && app._spectatorListRoomFriends == null) {
        titleText += ' (加载中…)';
      } else if (friendN > 0 || total > 0) {
        if (total > friendN) {
          titleText += ' (好友' + friendN + '·共' + total + '人)';
        } else {
          titleText += ' (' + friendN + '人)';
        }
      }
    }
    var titleFill =
      isSpectatorMode && FL && FL.spectatorListTitleColor
        ? FL.spectatorListTitleColor
        : colTitle;
    app.ctx.fillStyle = titleFill;
    app.ctx.font =
      '600 ' + app.rpx(32) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'left';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      titleText,
      app.snapPx(panelX + app.rpx(16)),
      app.snapPx(L.y0 + L.headerH * 0.5)
    );

    app.ctx.fillStyle = colMuted;
    app.ctx.font =
      '400 ' + app.rpx(28) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'right';
    app.ctx.fillText(
      '收起',
      app.snapPx(panelX + L.w - app.rpx(16)),
      app.snapPx(L.y0 + L.headerH * 0.5)
    );

    var searchY = L.y0 + L.headerH + app.rpx(8);
    var searchBoxH = L.searchH - app.rpx(12);
    var searchTextCy = searchY + searchBoxH * 0.5;
    if (isSpectatorMode) {
      var sSpec0 = FL && FL.spectatorListStripBg0 ? FL.spectatorListStripBg0 : 'rgba(0,0,0,0.06)';
      var sSpec1 = FL && FL.spectatorListStripBg1 ? FL.spectatorListStripBg1 : 'rgba(255,255,255,0.5)';
      var stripGrad = app.ctx.createLinearGradient(
        panelX + app.rpx(12),
        searchY,
        panelX + app.rpx(12),
        searchY + searchBoxH
      );
      stripGrad.addColorStop(0, sSpec0);
      stripGrad.addColorStop(1, sSpec1);
      app.ctx.save();
      app.ctx.globalAlpha = pa;
      app.ctx.fillStyle = stripGrad;
      app.roundRect(
        panelX + app.rpx(12),
        searchY,
        L.w - app.rpx(24),
        searchBoxH,
        app.rpx(8)
      );
      app.ctx.fill();
      app.ctx.strokeStyle = FL && FL.spectatorListStripBorder
        ? FL.spectatorListStripBorder
        : 'rgba(0, 121, 107, 0.2)';
      app.ctx.lineWidth = 1;
      app.roundRect(
        panelX + app.rpx(12),
        searchY,
        L.w - app.rpx(24),
        searchBoxH,
        app.rpx(8)
      );
      app.ctx.stroke();
      app.ctx.restore();
      var hint = '本局房间内的观战好友，非全局搜索';
      app.ctx.font =
        app.rpx(22) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'left';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillStyle = FL && FL.spectatorListStripText
        ? FL.spectatorListStripText
        : colMuted;
      var hDraw = hint;
      var hMaxW = L.w - app.rpx(48);
      while (
        hDraw.length > 0 &&
        app.ctx.measureText(hDraw).width > hMaxW &&
        hDraw.length > 1
      ) {
        hDraw = hDraw.slice(0, -1);
      }
      if (hDraw.length < hint.length) {
        hDraw += '…';
      }
      app.ctx.fillText(
        hDraw,
        app.snapPx(panelX + app.rpx(24)),
        app.snapPx(searchTextCy)
      );
    } else {
    var s0 = FL && FL.searchBg0 ? FL.searchBg0 : 'rgba(245, 234, 223, 0.95)';
    var s1 = FL && FL.searchBg1 ? FL.searchBg1 : 'rgba(255, 252, 248, 0.98)';
    var searchGrad = app.ctx.createLinearGradient(
      panelX + app.rpx(12),
      searchY,
      panelX + app.rpx(12),
      searchY + searchBoxH
    );
    searchGrad.addColorStop(0, s0);
    searchGrad.addColorStop(1, s1);
    app.ctx.save();
    app.ctx.globalAlpha = pa;
    app.ctx.fillStyle = searchGrad;
    app.roundRect(
      panelX + app.rpx(12),
      searchY,
      L.w - app.rpx(24),
      searchBoxH,
      app.rpx(8)
    );
    app.ctx.fill();
    app.ctx.restore();
    var q = (app.friendListSearchQuery || '').trim();
    app.ctx.font =
      app.rpx(24) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'left';
    app.ctx.textBaseline = 'middle';
    if (q) {
      app.ctx.fillStyle = FL && FL.searchText ? FL.searchText : colTitle;
      var qDraw = q;
      var maxW = L.w - app.rpx(48);
      while (
        qDraw.length > 0 &&
        app.ctx.measureText(qDraw).width > maxW &&
        qDraw.length > 1
      ) {
        qDraw = qDraw.slice(0, -1);
      }
      if (qDraw.length < q.length) {
        qDraw += '…';
      }
      app.ctx.fillText(
        qDraw,
        app.snapPx(panelX + app.rpx(24)),
        app.snapPx(searchTextCy)
      );
    } else {
      app.ctx.fillStyle = FL && FL.searchPlaceholder ? FL.searchPlaceholder : '#999999';
      app.ctx.fillText(
        '搜索好友昵称',
        app.snapPx(panelX + app.rpx(24)),
        app.snapPx(searchTextCy)
      );
    }
    }

    var rows = getFilteredFriends();
    app.ctx.save();
    app.ctx.beginPath();
    app.ctx.rect(
      panelX + app.rpx(6),
      L.listTop,
      L.w - app.rpx(12),
      L.listH
    );
    app.ctx.clip();

    if (
      (app.friendListLoading &&
        (!app.friendListRaw || !app.friendListRaw.length)) ||
      (isSpectatorMode &&
        app.spectatorListLoading &&
        app._spectatorListRoomFriends == null)
    ) {
      app.ctx.fillStyle = FL && FL.loading ? FL.loading : '#999999';
      app.ctx.font =
        app.rpx(24) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'left';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        isSpectatorMode ? '加载观战列表…' : '加载中…',
        app.snapPx(panelX + app.rpx(16)),
        app.snapPx(L.listTop + L.listH * 0.4)
      );
    } else if (!rows.length) {
      app.ctx.fillStyle = FL && FL.emptyTitle ? FL.emptyTitle : colTitle;
      app.ctx.font =
        app.rpx(Math.round(26 * 1.2)) +
        'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'left';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        isSpectatorMode ? '暂无好友观战本局' : '暂无好友',
        app.snapPx(panelX + app.rpx(16)),
        app.snapPx(L.listTop + L.listH * 0.5)
      );
    } else {
      var ri;
      for (ri = 0; ri < rows.length && ri < 50; ri++) {
        var fr = rows[ri];
        var yRow = L.listTop + ri * L.rowH + app.friendListScrollY;
        if (yRow > L.listTop + L.listH + L.rowH || yRow + L.rowH < L.listTop) {
          continue;
        }
        var skR = friendListPeerKey(fr);
        var offRow = 0;
        if (
          app.friendListRowSwipe &&
          app.friendListRowSwipe.peerKey === skR
        ) {
          offRow = app.friendListRowSwipe.offset || 0;
        }
        var rectsAct = getFriendListSwipeActionRects(L, panelX, yRow);
        var rowCellPad = app.rpx(8);
        var rowHCell = L.rowH - app.rpx(4);
        app.ctx.save();
        app.ctx.beginPath();
        app.ctx.rect(
          panelX + rowCellPad,
          yRow,
          L.w - rowCellPad * 2,
          rowHCell
        );
        app.ctx.clip();
        if (offRow > 0) {
          app.ctx.fillStyle = '#7A6F6A';
          app.ctx.fillRect(
            rectsAct.rem.x,
            rectsAct.rem.y,
            rectsAct.rem.w,
            rectsAct.rem.h
          );
          app.ctx.fillStyle = '#C62828';
          app.ctx.fillRect(
            rectsAct.del.x,
            rectsAct.del.y,
            rectsAct.del.w,
            rectsAct.del.h
          );
          app.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          app.ctx.font =
            '500 ' +
            app.rpx(24) +
            'px "PingFang SC","Hiragino Sans GB",sans-serif';
          app.ctx.textAlign = 'center';
          app.ctx.textBaseline = 'middle';
          app.ctx.fillText(
            '备注',
            rectsAct.rem.x + rectsAct.rem.w * 0.5,
            rectsAct.rem.y + rectsAct.rem.h * 0.5
          );
          app.ctx.fillText(
            '删除',
            rectsAct.del.x + rectsAct.del.w * 0.5,
            rectsAct.del.y + rectsAct.del.h * 0.5
          );
          app.ctx.textAlign = 'left';
        }
        app.ctx.textAlign = 'left';
        app.ctx.save();
        app.ctx.globalAlpha = pa;
        app.ctx.translate(-offRow, 0);
        var ze0 = FL && FL.rowEven ? FL.rowEven : 'rgba(245,234,223,0.35)';
        var ze1 = FL && FL.rowOdd ? FL.rowOdd : 'rgba(255,255,255,0.5)';
        var rowBgOpaque =
          ri % 2 === 0
            ? 'rgba(252, 248, 242, 0.99)'
            : 'rgba(255, 255, 255, 0.99)';
        app.ctx.fillStyle = rowBgOpaque;
        app.ctx.fillRect(
          panelX + rowCellPad,
          yRow,
          L.w - rowCellPad * 2,
          rowHCell
        );
        app.ctx.fillStyle = ri % 2 === 0 ? ze0 : ze1;
        app.ctx.fillRect(
          panelX + rowCellPad,
          yRow,
          L.w - rowCellPad * 2,
          rowHCell
        );
        var avR = app.rpx(Math.round(28 * 1.2));
        var acx = panelX + app.rpx(8) + avR;
        var acy = yRow + L.rowH * 0.5;
        var hasDmUnread = friendDmPeerHasUnread(fr.peerUserId);
        var frOnline = friendRowIsOnline(fr);
        var frInGame = friendRowInGame(fr);
        var frSpectating = friendRowSpectating(fr);
        var frSpectatorInRoom = !!fr._spectatorInRoom;
        var dimAvatar = !frOnline && !frInGame && !frSpectating;
        var img =
          fr.peerUserId && app._friendAvImgs['k' + fr.peerUserId];
        if (img && img.complete && img.width && !img._failed) {
          app.ctx.save();
          app.ctx.beginPath();
          app.ctx.arc(
            app.snapPx(acx),
            app.snapPx(acy),
            app.snapPx(avR),
            0,
            Math.PI * 2
          );
          app.ctx.clip();
          var sz = avR * 2;
          var ax0 = app.snapPx(acx - avR);
          var ay0 = app.snapPx(acy - avR);
          var asz = app.snapPx(sz);
          var usedGrayFilter = false;
          if (dimAvatar && typeof app.ctx.filter !== 'undefined') {
            try {
              app.ctx.filter = 'grayscale(1)';
              usedGrayFilter = true;
            } catch (eGray) {}
          }
          app.ctx.drawImage(img, ax0, ay0, asz, asz);
          if (usedGrayFilter) {
            try {
              app.ctx.filter = 'none';
            } catch (eGray2) {}
          } else if (dimAvatar) {
            app.ctx.globalCompositeOperation = 'source-atop';
            app.ctx.fillStyle = 'rgba(175, 178, 188, 0.48)';
            app.ctx.fillRect(ax0, ay0, asz, asz);
            app.ctx.globalCompositeOperation = 'source-over';
          }
          app.ctx.restore();
        } else {
          app.ctx.fillStyle = dimAvatar
            ? '#C4BEB4'
            : FL && FL.avatarFallback
              ? FL.avatarFallback
              : '#E0D6C8';
          app.ctx.beginPath();
          app.ctx.arc(
            app.snapPx(acx),
            app.snapPx(acy),
            app.snapPx(avR),
            0,
            Math.PI * 2
          );
          app.ctx.fill();
          app.ctx.fillStyle = dimAvatar
            ? '#8A8580'
            : FL && FL.avatarChar
              ? FL.avatarChar
              : colTitle;
          app.ctx.font =
            app.rpx(Math.round(26 * 1.2)) +
            'px "PingFang SC","Hiragino Sans GB",sans-serif';
          app.ctx.textAlign = 'center';
          app.ctx.textBaseline = 'middle';
          var ch = String(fr.displayName || fr.nickname || '?').charAt(0);
          app.ctx.fillText(ch, app.snapPx(acx), app.snapPx(acy));
        }

        if (hasDmUnread) {
          var badgeR = Math.max(5.5, app.rpx(Math.round(9 * 1.2)));
          var bcx = app.snapPx(acx + avR * 0.58);
          var bcy = app.snapPx(acy - avR * 0.58);
          app.ctx.save();
          app.ctx.fillStyle = FL && FL.unreadDot ? FL.unreadDot : '#E53935';
          app.ctx.beginPath();
          app.ctx.arc(bcx, bcy, app.snapPx(badgeR), 0, Math.PI * 2);
          app.ctx.fill();
          app.ctx.strokeStyle = 'rgba(255,255,255,0.94)';
          app.ctx.lineWidth = Math.max(1, app.rpx(2));
          app.ctx.stroke();
          app.ctx.restore();
        }

        app.ctx.textAlign = 'left';
        app.ctx.textBaseline = 'middle';
        app.ctx.fillStyle = FL && FL.name ? FL.name : colTitle;
        app.ctx.font =
          (hasDmUnread ? '600 ' : '500 ') +
          app.rpx(Math.round(26 * 1.2)) +
          'px "PingFang SC","Hiragino Sans GB",sans-serif';
        var nameStr = String(fr.displayName || fr.nickname || '');
        var nameX = acx + avR + app.rpx(12);
        var showStatusLine = frInGame || frSpectatorInRoom || frSpectating;
        var nameY = showStatusLine
          ? yRow + L.rowH * 0.36
          : yRow + L.rowH * 0.5;
        var showInvBtn = friendListRowShowInviteBtn(isSpectatorListUi, fr);
        var watchReserve =
          frInGame && !frSpectatorInRoom
            ? app.rpx(FRIEND_LIST_WATCH_BTN_RPX) + app.rpx(8)
            : 0;
        var inviteReserve = showInvBtn
          ? app.rpx(FRIEND_LIST_INVITE_BTN_RPX) + app.rpx(8)
          : 0;
        var rightPillReserve = Math.max(watchReserve, inviteReserve);
        var nameMaxPx = Math.max(
          app.rpx(48),
          L.w - app.rpx(16) - (nameX - panelX) - app.rpx(6) - rightPillReserve
        );
        while (
          nameStr.length > 0 &&
          app.ctx.measureText(nameStr).width > nameMaxPx &&
          nameStr.length > 1
        ) {
          nameStr = nameStr.slice(0, -1);
        }
        if (
          nameStr.length <
          String(fr.displayName || fr.nickname || '').length
        ) {
          nameStr += '…';
        }
        app.ctx.fillText(
          nameStr,
          app.snapPx(nameX),
          app.snapPx(nameY)
        );
        if (isSpectatorListUi) {
          var titStr = friendListRowTitleName(fr);
          if (titStr) {
            app.ctx.fillStyle =
              FL && FL.spectatorListRowTitle
                ? FL.spectatorListRowTitle
                : '#0d47a1';
            app.ctx.font =
              '600 ' +
              app.rpx(21) +
              'px "PingFang SC","Hiragino Sans GB",sans-serif';
            app.ctx.textAlign = 'left';
            app.ctx.textBaseline = 'middle';
            var titMaxW = nameMaxPx;
            var titDraw = titStr;
            while (
              titDraw.length > 0 &&
              app.ctx.measureText(titDraw).width > titMaxW &&
              titDraw.length > 1
            ) {
              titDraw = titDraw.slice(0, -1);
            }
            if (titDraw.length < titStr.length) {
              titDraw += '…';
            }
            app.ctx.fillText(
              titDraw,
              app.snapPx(nameX),
              app.snapPx(yRow + L.rowH * 0.7)
            );
          }
        } else if (frSpectatorInRoom) {
          var specC =
            FL && FL.friendInGame
              ? FL.friendInGame
              : FL && FL.online
                ? FL.online
                : '#2e7d32';
          app.ctx.fillStyle = specC;
          app.ctx.font =
            '500 ' +
            app.rpx(21) +
            'px "PingFang SC","Hiragino Sans GB",sans-serif';
          app.ctx.textAlign = 'left';
          app.ctx.textBaseline = 'middle';
          app.ctx.fillText(
            '本局观战中',
            app.snapPx(nameX),
            app.snapPx(yRow + L.rowH * 0.7)
          );
        } else if (frInGame) {
          var inGameC =
            FL && FL.friendInGame
              ? FL.friendInGame
              : FL && FL.online
                ? FL.online
                : '#2e7d32';
          app.ctx.fillStyle = inGameC;
          app.ctx.font =
            '500 ' +
            app.rpx(21) +
            'px "PingFang SC","Hiragino Sans GB",sans-serif';
          app.ctx.textAlign = 'left';
          app.ctx.textBaseline = 'middle';
          app.ctx.fillText(
            '游戏中',
            app.snapPx(nameX),
            app.snapPx(yRow + L.rowH * 0.7)
          );
          var wRect = getFriendListWatchBtnLayout(
            L,
            panelX,
            yRow,
            offRow
          );
          drawFriendListWatchPill(wRect, FL);
        } else if (frSpectating) {
          var specStC =
            FL && FL.friendSpectating
              ? FL.friendSpectating
              : FL && FL.collapse
                ? FL.collapse
                : '#0277bd';
          app.ctx.fillStyle = specStC;
          app.ctx.font =
            '500 ' +
            app.rpx(21) +
            'px "PingFang SC","Hiragino Sans GB",sans-serif';
          app.ctx.textAlign = 'left';
          app.ctx.textBaseline = 'middle';
          app.ctx.fillText(
            '观战中',
            app.snapPx(nameX),
            app.snapPx(yRow + L.rowH * 0.7)
          );
        }
        if (showInvBtn) {
          var invRect = getFriendListInviteBtnLayout(
            L,
            panelX,
            yRow,
            offRow
          );
          drawFriendListInvitePill(invRect, FL);
        }
        app.ctx.restore();
        app.ctx.restore();
      }
    }
    app.ctx.restore();
    }

    app.ctx.restore();
  };

  /**
   * 非首页全屏：在对应 screen 已绘制完毕后叠画好友入口悬浮球与侧栏（与首页同一套状态与交互）。
   */
  app.drawFriendListGlobalChrome = function () {
    var th =
      typeof app.getUiTheme === 'function' ? app.getUiTheme() : null;
    if (typeof app.drawHomeFriendListFab === 'function') {
      app.drawHomeFriendListFab(th);
    }
    if (typeof app.drawHomeFriendListOverlay === 'function') {
      app.drawHomeFriendListOverlay(th);
    }
  };
};
