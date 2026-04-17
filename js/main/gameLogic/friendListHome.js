/**
 * 首页好友列表（侧边入口 + 遮罩面板）— 对齐 docs/friend-list-home-spec.md
 */
module.exports = function registerFriendListHome(app, deps) {
  var wx = deps.wx;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;

  var STORAGE_OPEN = 'gomoku_home_friend_list_open';
  var STORAGE_CACHE = 'gomoku_home_friend_list_cache_v1';
  var STORAGE_FAB_POS = 'gomoku_home_friend_fab_pos_v1';

  /** 好友面板 / 默认 FAB 相对原锚点略下移 */
  function homeFriendExtraDown() {
    return app.rpx(16);
  }

  app.homeFriendListOpen = false;
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
  /** 与某好友的会话面板（画布内）；消息仅存内存 */
  app.homeFriendChatPeer = null;
  app.friendChatScrollY = 0;
  app.friendChatMessagesByPeer = {};
  app._friendChatMsgId = 0;
  app._friendChatScrollTouchId = null;
  app._friendChatScrollLastY = 0;
  app._friendChatNeedScrollBottom = false;
  app._friendChatLayoutTotalH = 0;
  app._friendChatBarDownX = undefined;
  app._friendChatBarDownY = undefined;
  app._friendAvImgs = app._friendAvImgs || {};
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

  function clampFabCenter(cx, cy, r) {
    var m = app.rpx(8);
    var minX = r + m;
    var maxX = app.W - r - m;
    var minY = r + m;
    var maxY = app.H - r - m;
    return {
      cx: Math.min(maxX, Math.max(minX, cx)),
      cy: Math.min(maxY, Math.max(minY, cy))
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
    try {
      if (wx && wx.getStorageSync) {
        var o = wx.getStorageSync(STORAGE_OPEN);
        if (o === '1') {
          app.homeFriendListOpen = true;
          app._flSlideT = 1;
          if (!app._friendListRestoredFetched) {
            app._friendListRestoredFetched = true;
            app.refreshHomeFriendListFromServer();
          }
        }
      }
    } catch (e) {}
    var cached = loadCache();
    if (cached && cached.length) {
      app.friendListRaw = cached;
    }
    var fabPos = loadFabPos();
    if (fabPos) {
      var sp0 = snapFabHorizontalEdge(fabPos.cx, fabPos.cy, 24);
      app.homeFriendFabCustomCx = sp0.cx;
      app.homeFriendFabCustomCy = sp0.cy;
    }
  };

  app.getHomeFriendListFabLayout = function () {
    var r = 24;
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
    var chatMsgH = Math.max(
      app.rpx(80),
      panelH - headerH - chatInputBarH
    );
    return {
      x0: x0,
      y0: y0,
      w: panelW,
      h: panelH,
      headerH: headerH,
      searchH: searchH,
      listTop: listTop,
      listH: listH,
      rowH: app.rpx(96),
      chatInputBarH: chatInputBarH,
      chatMsgTop: chatMsgTop,
      chatMsgH: chatMsgH
    };
  };

  function getFilteredFriends() {
    var raw = app.friendListRaw || [];
    var q = (app.friendListSearchQuery || '').trim().toLowerCase();
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var f = raw[i];
      if (q) {
        var name = String(f.displayName || f.nickname || '').toLowerCase();
        if (name.indexOf(q) < 0) {
          continue;
        }
      }
      out.push(f);
    }
    out.sort(function (a, b) {
      var ao = a && a.online ? 1 : 0;
      var bo = b && b.online ? 1 : 0;
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

  function getFriendChatKey(peerId) {
    return 'k' + String(peerId);
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
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };

  function exitHomeFriendChat() {
    app.homeFriendChatPeer = null;
    app.friendChatScrollY = 0;
    app._friendChatScrollTouchId = null;
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
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: '已发送', icon: 'none' });
                }
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
            persistCache(app.friendListRaw);
            var fi;
            for (fi = 0; fi < app.friendListRaw.length; fi++) {
              var row = app.friendListRaw[fi];
              if (row && row.peerUserId && row.avatarUrl) {
                ensureAvatarImg(row.peerUserId, row.avatarUrl);
              }
            }
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
    app._flAnimMode = null;
    app.homeFriendListOpen = false;
    app.homeFriendFabPressed = false;
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

  app.openHomeFriendList = function () {
    app.homeFriendListOpen = true;
    app.homeFriendChatPeer = null;
    app.friendChatScrollY = 0;
    app.friendListScrollY = 0;
    persistOpen();
    startOpenAnim();
    app.refreshHomeFriendListFromServer();
    if (typeof app.draw === 'function') {
      app.draw();
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

  app.dismissFriendDmKeyboard = function () {
    if (typeof app._friendDmKbCleanup === 'function') {
      try {
        app._friendDmKbCleanup();
      } catch (eDm) {}
      app._friendDmKbCleanup = null;
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

  /** 会话底部输入区：调起系统键盘发送 */
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
      app._friendDmKbCleanup = null;
    }

    var draftDm = '';

    function onInputDm(res) {
      draftDm = res && res.value != null ? String(res.value) : '';
    }

    function onConfirmDm(res) {
      var v =
        res && res.value != null ? String(res.value) : draftDm;
      cleanupDm();
      try {
        if (typeof wx.hideKeyboard === 'function') {
          wx.hideKeyboard({});
        }
      } catch (eH) {}
      postFriendDirectMessage(peer.peerUserId, v);
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
    } catch (eL) {
      cleanupDm();
      fallbackModal();
      return;
    }

    wx.showKeyboard({
      defaultValue: '',
      maxLength: 300,
      multiple: false,
      confirmHold: false,
      confirmType: 'send',
      fail: function () {
        cleanupDm();
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
    var yInp = L.y0 + L.h - L.chatInputBarH;
    var sendW = app.rpx(100);
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
      return true;
    }
    if (!app.homeFriendChatPeer && hitSearch(L, panelX, x, y)) {
      return true;
    }

    if (app.homeFriendChatPeer) {
      if (hitFriendChatBack(L, panelX, x, y)) {
        return true;
      }
      if (hitFriendChatInputField(L, panelX, x, y)) {
        app._friendChatBarDownX = x;
        app._friendChatBarDownY = y;
        return true;
      }
      if (hitFriendChatSend(L, panelX, x, y)) {
        app._friendChatBarDownX = x;
        app._friendChatBarDownY = y;
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
        app._friendListRowTapIdx = i;
        app._friendListRowTapX = x;
        app._friendListRowTapY = y;
        if (e && e.touches && e.touches[0]) {
          app._friendListScrollTouchId = e.touches[0].identifier;
          app._friendListScrollLastY = y;
        }
        return true;
      }
    }

    if (insidePanel && y >= L.listTop && y <= L.listTop + L.listH) {
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
      var rFab = 24;
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
      var Lc = app.getHomeFriendListPanelLayout();
      var maxScrollC = Math.min(
        0,
        Lc.chatMsgH - (app._friendChatLayoutTotalH || 0)
      );
      app.friendChatScrollY += dyC;
      if (app.friendChatScrollY > 0) {
        app.friendChatScrollY = 0;
      }
      if (app.friendChatScrollY < maxScrollC) {
        app.friendChatScrollY = maxScrollC;
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
      return true;
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
          var rEnd = 24;
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
            app.openHomeFriendList();
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

    var slop = 14;
    var moved =
      app._friendListRowTapIdx < 0 ||
      Math.abs(x - app._friendListRowTapX) > slop ||
      Math.abs(y - app._friendListRowTapY) > slop;

    var L = app.getHomeFriendListPanelLayout();

    var slide = easeInOut(app._flSlideT != null ? app._flSlideT : 1);
    var panelX = L.x0 - L.w * (1 - slide) * 0.92;

    if (app.homeFriendChatPeer) {
      if (hitFriendChatBack(L, panelX, x, y)) {
        exitHomeFriendChat();
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
      var barHit =
        hitFriendChatInputField(L, panelX, x, y) ||
        hitFriendChatSend(L, panelX, x, y);
      if (
        barHit &&
        typeof app._friendChatBarDownX === 'number' &&
        typeof app._friendChatBarDownY === 'number'
      ) {
        var ds =
          Math.abs(x - app._friendChatBarDownX) <= 20 &&
          Math.abs(y - app._friendChatBarDownY) <= 20;
        app._friendChatBarDownX = undefined;
        app._friendChatBarDownY = undefined;
        if (ds && typeof app.openFriendChatKeyboard === 'function') {
          app.openFriendChatKeyboard();
        }
        return true;
      }
      app._friendChatBarDownX = undefined;
      app._friendChatBarDownY = undefined;
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
      return true;
    }

    var rows = getFilteredFriends();

    if (!moved && app._friendListRowTapIdx >= 0) {
      var idx = app._friendListRowTapIdx;
      app._friendListRowTapIdx = -1;
      var fTap = rows[idx];
      if (fTap && typeof app.openHomeFriendChatMode === 'function') {
        app.openHomeFriendChatMode(fTap);
      }
      return true;
    }
    app._friendListRowTapIdx = -1;
    return true;
  };

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
    var shCol = FL && FL.fabShadow ? FL.fabShadow : 'rgba(0,0,0,0.12)';
    var iconC = FL && FL.fabIcon ? FL.fabIcon : '#5D4037';
    var F = app.getHomeFriendListFabLayout();
    var scale = app.homeFriendFabPressed ? 0.95 : 1;
    var cx = F.cx;
    var cy = F.cy;
    var r = F.r;
    var d = fabEdgeCollapseDrawCenter(cx, cy, r);
    var px = d.cx;
    var py = d.cy;

    app.ctx.save();
    app.ctx.beginPath();
    app.ctx.rect(0, 0, app.W, app.H);
    app.ctx.clip();
    app.ctx.translate(cx, cy);
    app.ctx.scale(scale, scale);
    app.ctx.translate(-cx, -cy);
    app.ctx.fillStyle = fillB;
    app.ctx.shadowColor = shCol;
    app.ctx.shadowBlur = 8;
    app.ctx.shadowOffsetY = 3;
    app.ctx.beginPath();
    app.ctx.arc(app.snapPx(px), app.snapPx(py), app.snapPx(r), 0, Math.PI * 2);
    app.ctx.fill();
    app.ctx.shadowBlur = 0;
    app.ctx.shadowOffsetY = 0;
    app.ctx.strokeStyle = strokeB;
    app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
    app.ctx.beginPath();
    app.ctx.arc(app.snapPx(px), app.snapPx(py), app.snapPx(r), 0, Math.PI * 2);
    app.ctx.stroke();
    if (typeof app.drawHomeFriendListFabIcon === 'function') {
      app.drawHomeFriendListFabIcon(px, py, r, iconC);
    }
    app.ctx.restore();
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

    app.ctx.save();
    app.ctx.fillStyle = 'rgba(0,0,0,' + bdA * slide + ')';
    app.ctx.fillRect(0, 0, app.W, app.H);

    var shPanel = FL && FL.panelShadow ? FL.panelShadow : 'rgba(0,0,0,0.18)';
    app.ctx.save();
    app.ctx.globalAlpha = pa;
    app.ctx.shadowColor = shPanel;
    app.ctx.shadowBlur = app.rpx(20);
    app.ctx.shadowOffsetY = app.rpx(8);
    var g0 = FL ? FL.panelG0 : '#ffffff';
    var g1 = FL ? FL.panelG1 : '#f9f6f2';
    var g2 = FL ? FL.panelG2 : '#f2ebe4';
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

      var chatAvR = app.rpx(22);
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

      if (app._friendChatNeedScrollBottom) {
        var smin0 = Math.min(0, L.chatMsgH - totalH);
        app.friendChatScrollY = smin0;
        app._friendChatNeedScrollBottom = false;
      }
      var maxS0 = Math.min(0, L.chatMsgH - totalH);
      if (app.friendChatScrollY < maxS0) {
        app.friendChatScrollY = maxS0;
      }
      if (app.friendChatScrollY > 0) {
        app.friendChatScrollY = 0;
      }

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
        var yC = L.chatMsgTop + app.rpx(8) + app.friendChatScrollY;
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
          var bubbleColOther = 'rgba(255,255,255,0.96)';
          var bubbleColSelf = 'rgba(220,248,198,0.95)';
          var lj;

          if (!isSelf) {
            avCx = panelX + edgePad + chatAvR;
            bubbleLeft = panelX + avSlot + edgePad * 0.5;
            var imgO =
              peer.peerUserId &&
              app._friendAvImgs['k' + peer.peerUserId];
            if (imgO && imgO.complete && imgO.width && !imgO._failed) {
              app.ctx.save();
              app.ctx.beginPath();
              app.ctx.arc(
                app.snapPx(avCx),
                app.snapPx(avCy),
                app.snapPx(chatAvR),
                0,
                Math.PI * 2
              );
              app.ctx.clip();
              var sz = chatAvR * 2;
              app.ctx.drawImage(
                imgO,
                app.snapPx(avCx - chatAvR),
                app.snapPx(avCy - chatAvR),
                app.snapPx(sz),
                app.snapPx(sz)
              );
              app.ctx.restore();
            } else {
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
                app.rpx(22) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
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
            }
            app.ctx.fillStyle = bubbleColOther;
            app.roundRect(
              bubbleLeft,
              bubbleTop,
              bubbleW2,
              bubbleH,
              app.rpx(10)
            );
            app.ctx.fill();
            app.ctx.fillStyle = colTitle;
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
            if (imgMe && imgMe.complete && imgMe.width) {
              app.ctx.save();
              app.ctx.beginPath();
              app.ctx.arc(
                app.snapPx(avCx),
                app.snapPx(avCy),
                app.snapPx(chatAvR),
                0,
                Math.PI * 2
              );
              app.ctx.clip();
              var sz2 = chatAvR * 2;
              app.ctx.drawImage(
                imgMe,
                app.snapPx(avCx - chatAvR),
                app.snapPx(avCy - chatAvR),
                app.snapPx(sz2),
                app.snapPx(sz2)
              );
              app.ctx.restore();
            } else {
              app.ctx.fillStyle = FL && FL.avatarFallback
                ? FL.avatarFallback
                : '#C5E1A5';
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
                app.rpx(22) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
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
            }
            app.ctx.fillStyle = bubbleColSelf;
            app.roundRect(
              bubbleLeft,
              bubbleTop,
              bubbleW2,
              bubbleH,
              app.rpx(10)
            );
            app.ctx.fill();
            app.ctx.fillStyle = colTitle;
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

      var yInp = L.y0 + L.h - L.chatInputBarH;
      app.ctx.save();
      app.ctx.globalAlpha = pa;
      app.ctx.fillStyle =
        FL && FL.searchBg0 ? FL.searchBg0 : 'rgba(250,246,240,0.98)';
      app.ctx.fillRect(panelX, yInp, L.w, L.chatInputBarH);
      app.ctx.restore();

      app.ctx.strokeStyle = FL && FL.sep ? FL.sep : 'rgba(92,75,58,0.12)';
      app.ctx.lineWidth = 1;
      app.ctx.beginPath();
      app.ctx.moveTo(app.snapPx(panelX + app.rpx(8)), app.snapPx(yInp));
      app.ctx.lineTo(
        app.snapPx(panelX + L.w - app.rpx(8)),
        app.snapPx(yInp)
      );
      app.ctx.stroke();

      var sendW = app.rpx(100);
      var inpX = panelX + app.rpx(12);
      var inpW = L.w - app.rpx(24) - sendW - app.rpx(8);
      var inpH = app.rpx(56);
      var inpY = yInp + (L.chatInputBarH - inpH) * 0.5;
      app.ctx.fillStyle = 'rgba(255,255,255,0.92)';
      app.roundRect(inpX, inpY, inpW, inpH, app.rpx(8));
      app.ctx.fill();
      app.ctx.strokeStyle = 'rgba(92,75,58,0.14)';
      app.ctx.stroke();
      app.ctx.fillStyle = colMuted;
      app.ctx.font =
        app.rpx(24) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        '说点什么...',
        app.snapPx(inpX + app.rpx(14)),
        app.snapPx(inpY + inpH * 0.5)
      );

      var sendX = panelX + L.w - app.rpx(12) - sendW;
      app.ctx.fillStyle = colTitle;
      app.roundRect(sendX, inpY, sendW, inpH, app.rpx(8));
      app.ctx.fill();
      app.ctx.fillStyle = '#fffefb';
      app.ctx.font =
        '500 ' + app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.fillText(
        '发送',
        app.snapPx(sendX + sendW * 0.5),
        app.snapPx(inpY + inpH * 0.5)
      );
      app.ctx.textAlign = 'left';
    } else {
    app.ctx.fillStyle = colTitle;
    app.ctx.font =
      '600 ' + app.rpx(32) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'left';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      '好友列表',
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

    if (app.friendListLoading && (!app.friendListRaw || !app.friendListRaw.length)) {
      app.ctx.fillStyle = FL && FL.loading ? FL.loading : '#999999';
      app.ctx.font =
        app.rpx(24) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'left';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        '加载中…',
        app.snapPx(panelX + app.rpx(16)),
        app.snapPx(L.listTop + L.listH * 0.4)
      );
    } else if (!rows.length) {
      app.ctx.fillStyle = FL && FL.emptyTitle ? FL.emptyTitle : colTitle;
      app.ctx.font =
        app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'left';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        '暂无好友',
        app.snapPx(panelX + app.rpx(16)),
        app.snapPx(L.listTop + L.listH * 0.5)
      );
    } else {
      var ri;
      app.ctx.save();
      app.ctx.globalAlpha = pa;
      for (ri = 0; ri < rows.length && ri < 50; ri++) {
        var yRow0 = L.listTop + ri * L.rowH + app.friendListScrollY;
        if (yRow0 > L.listTop + L.listH + L.rowH || yRow0 + L.rowH < L.listTop) {
          continue;
        }
        var ze0 = FL && FL.rowEven ? FL.rowEven : 'rgba(245,234,223,0.35)';
        var ze1 = FL && FL.rowOdd ? FL.rowOdd : 'rgba(255,255,255,0.5)';
        app.ctx.fillStyle = ri % 2 === 0 ? ze0 : ze1;
        app.ctx.fillRect(
          panelX + app.rpx(8),
          yRow0,
          L.w - app.rpx(16),
          L.rowH - app.rpx(4)
        );
      }
      app.ctx.restore();
      for (ri = 0; ri < rows.length && ri < 50; ri++) {
        var fr = rows[ri];
        var yRow = L.listTop + ri * L.rowH + app.friendListScrollY;
        if (yRow > L.listTop + L.listH + L.rowH || yRow + L.rowH < L.listTop) {
          continue;
        }
        var avR = app.rpx(28);
        var acx = panelX + app.rpx(8) + avR;
        var acy = yRow + L.rowH * 0.5;
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
          if (!fr.online && typeof app.ctx.filter !== 'undefined') {
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
          } else if (!fr.online) {
            app.ctx.globalCompositeOperation = 'source-atop';
            app.ctx.fillStyle = 'rgba(175, 178, 188, 0.48)';
            app.ctx.fillRect(ax0, ay0, asz, asz);
            app.ctx.globalCompositeOperation = 'source-over';
          }
          app.ctx.restore();
        } else {
          app.ctx.fillStyle = !fr.online
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
          app.ctx.fillStyle = !fr.online
            ? '#8A8580'
            : FL && FL.avatarChar
              ? FL.avatarChar
              : colTitle;
          app.ctx.font =
            app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
          app.ctx.textAlign = 'center';
          app.ctx.textBaseline = 'middle';
          var ch = String(fr.displayName || fr.nickname || '?').charAt(0);
          app.ctx.fillText(ch, app.snapPx(acx), app.snapPx(acy));
        }

        app.ctx.textAlign = 'left';
        app.ctx.textBaseline = 'middle';
        app.ctx.fillStyle = FL && FL.name ? FL.name : colTitle;
        app.ctx.font =
          '500 ' + app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
        var nameStr = String(fr.displayName || fr.nickname || '');
        if (nameStr.length > 10) {
          nameStr = nameStr.slice(0, 10) + '…';
        }
        app.ctx.fillText(
          nameStr,
          app.snapPx(acx + avR + app.rpx(12)),
          app.snapPx(yRow + L.rowH * 0.5)
        );
      }
    }
    app.ctx.restore();
    }

    app.ctx.restore();
  };
};
