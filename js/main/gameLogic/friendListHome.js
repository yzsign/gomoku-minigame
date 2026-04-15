/**
 * 首页好友列表（侧边入口 + 遮罩面板）— 对齐 docs/friend-list-home-spec.md
 */
module.exports = function registerFriendListHome(app, deps) {
  var wx = deps.wx;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;

  var STORAGE_OPEN = 'gomoku_home_friend_list_open';
  var STORAGE_CACHE = 'gomoku_home_friend_list_cache_v1';

  app.homeFriendListOpen = false;
  app.homeFriendFabPressed = false;
  app.friendListRaw = [];
  app.friendListSearchQuery = '';
  app.friendListFilterMode = 'all';
  app.friendListScrollY = 0;
  app.friendListLoading = false;
  app.friendListLoadError = false;
  app._friendListScrollTouchId = null;
  app._friendListScrollLastY = 0;
  app._friendListRowTapIdx = -1;
  app._friendListRowTapX = 0;
  app._friendListRowTapY = 0;
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
  };

  app.getHomeFriendListFabLayout = function () {
    var r = 24;
    var cx = app.rpx(20) + r;
    var hl =
      typeof app.getHomeLayout === 'function' ? app.getHomeLayout() : null;
    var cy =
      hl && hl.mascotCy != null
        ? hl.mascotCy
        : app.H * (300 / 812);
    return { cx: cx, cy: cy, r: r };
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
    var x0 = app.rpx(20);
    var y0 = app.H * (120 / 812);
    var panelH = Math.min(app.H * (580 / 812), app.H - y0 - app.rpx(24));
    var headerH = app.rpx(88);
    var searchH = app.rpx(64);
    var tabH = app.rpx(56);
    var listTop = y0 + headerH + searchH + tabH;
    var listH = Math.max(app.rpx(120), panelH - headerH - searchH - tabH);
    return {
      x0: x0,
      y0: y0,
      w: panelW,
      h: panelH,
      headerH: headerH,
      searchH: searchH,
      tabH: tabH,
      listTop: listTop,
      listH: listH,
      rowH: app.rpx(72)
    };
  };

  function getFilteredFriends() {
    var raw = app.friendListRaw || [];
    var q = (app.friendListSearchQuery || '').trim().toLowerCase();
    var mode = app.friendListFilterMode || 'all';
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var f = raw[i];
      if (mode === 'online' && !f.online) {
        continue;
      }
      if (q) {
        var name = String(f.displayName || f.nickname || '').toLowerCase();
        if (name.indexOf(q) < 0) {
          continue;
        }
      }
      out.push(f);
    }
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

  app.closeHomeFriendList = function (opts) {
    if (typeof opts === 'function') {
      opts = { onClosed: opts };
    } else {
      opts = opts && typeof opts === 'object' ? opts : {};
    }
    app.dismissFriendListSearchKeyboard();
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

  function hitTabAll(L, panelX, x, y) {
    var y1 = L.y0 + L.headerH + L.searchH;
    var mid = panelX + L.w * 0.5;
    return y >= y1 && y <= y1 + L.tabH && x >= panelX && x <= mid;
  }

  function hitTabOnline(L, panelX, x, y) {
    var y1 = L.y0 + L.headerH + L.searchH;
    var mid = panelX + L.w * 0.5;
    return y >= y1 && y <= y1 + L.tabH && x > mid && x <= panelX + L.w;
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

  function hitEmptyAdd(L, panelX, x, y) {
    var cx = panelX + L.w * 0.5;
    var cy = L.listTop + L.listH * 0.55;
    var bw = app.rpx(200);
    var bh = app.rpx(44);
    return (
      Math.abs(x - cx) <= bw * 0.5 && Math.abs(y - cy) <= bh * 0.5
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
        app.homeFriendFabPressed = true;
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

    if (hitCollapse(L, panelX, x, y)) {
      return true;
    }
    if (hitSearch(L, panelX, x, y)) {
      return true;
    }
    if (hitTabAll(L, panelX, x, y) || hitTabOnline(L, panelX, x, y)) {
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

    if (rows.length === 0 && hitEmptyAdd(L, panelX, x, y)) {
      return true;
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

  function showFriendActions(f) {
    var itemList = ['修改备注', '删除好友', '发起聊天', '好友对战'];
    if (typeof wx.showActionSheet === 'function') {
      wx.showActionSheet({
        itemList: itemList,
        success: function (res) {
          if (res.tapIndex === 0) {
            if (typeof wx.showModal === 'function') {
              wx.showModal({
                title: '备注',
                editable: true,
                placeholderText: '最多64字',
                content: f.remark || '',
                success: function (mr) {
                  if (!mr.confirm) {
                    return;
                  }
                  var txt = mr.content != null ? String(mr.content) : '';
                  wx.request(
                    Object.assign(
                      roomApi.socialFriendRemarkOptions(f.peerUserId, txt),
                      {
                        success: function (res2) {
                          if (res2.statusCode === 200) {
                            if (typeof wx.showToast === 'function') {
                              wx.showToast({ title: '已保存', icon: 'none' });
                            }
                            app.refreshHomeFriendListFromServer();
                          } else {
                            var msg = apiErrorMessage(res2) || '保存失败';
                            if (typeof wx.showToast === 'function') {
                              wx.showToast({ title: msg, icon: 'none' });
                            }
                          }
                        },
                        fail: function () {
                          if (typeof wx.showToast === 'function') {
                            wx.showToast({ title: '网络错误', icon: 'none' });
                          }
                        }
                      }
                    )
                  );
                }
              });
            }
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '删除好友',
              content: '确定删除「' + (f.displayName || f.nickname) + '」？',
              success: function (dr) {
                if (!dr.confirm) {
                  return;
                }
                wx.request(
                  Object.assign(
                    roomApi.socialFriendDeleteOptions(f.peerUserId),
                    {
                      success: function (res2) {
                        if (res2.statusCode === 200) {
                          if (typeof wx.showToast === 'function') {
                            wx.showToast({ title: '已删除', icon: 'none' });
                          }
                          app.refreshHomeFriendListFromServer();
                        } else {
                          var delMsg = apiErrorMessage(res2) || '删除失败';
                          if (typeof wx.showToast === 'function') {
                            wx.showToast({ title: delMsg, icon: 'none' });
                          }
                        }
                      },
                      fail: function () {
                        if (typeof wx.showToast === 'function') {
                          wx.showToast({ title: '网络错误', icon: 'none' });
                        }
                      }
                    }
                  )
                );
              }
            });
          } else if (res.tapIndex === 2) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({
                title: '私聊功能敬请期待',
                icon: 'none'
              });
            }
          } else if (res.tapIndex === 3) {
            if (!f.online) {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '好友离线，无法邀请对战', icon: 'none' });
              }
              return;
            }
            app.closeHomeFriendList(function () {
              if (typeof app.startOnlineAsHost === 'function') {
                app.startOnlineAsHost();
              }
            });
          }
        }
      });
    }
  }

  app.onHomeFriendListTouchEnd = function (x, y) {
    app.ensureHomeFriendListPersistedStateOnce();
    if (app._flAnimMode === 'out') {
      return true;
    }
    if (!app.homeFriendListOpen) {
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

    app._friendListScrollTouchId = null;

    var slop = 14;
    var moved =
      app._friendListRowTapIdx < 0 ||
      Math.abs(x - app._friendListRowTapX) > slop ||
      Math.abs(y - app._friendListRowTapY) > slop;

    var L = app.getHomeFriendListPanelLayout();

    var slide = easeInOut(app._flSlideT != null ? app._flSlideT : 1);
    var panelX = L.x0 - L.w * (1 - slide) * 0.92;

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

    if (kbActive) {
      if (!insidePanel) {
        app.dismissFriendListSearchKeyboard();
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return true;
      }
      var onSearchKb = hitSearch(L, panelX, x, y);
      var onAllKb = hitTabAll(L, panelX, x, y);
      var onOnlKb = hitTabOnline(L, panelX, x, y);
      var rowsKb = getFilteredFriends();
      var rkb;
      var onRowKb = false;
      for (rkb = 0; rkb < rowsKb.length && rkb < 50; rkb++) {
        if (hitFriendRow(L, panelX, x, y, rkb)) {
          onRowKb = true;
          break;
        }
      }
      var onEmptyAddKb =
        rowsKb.length === 0 && hitEmptyAdd(L, panelX, x, y);
      if (
        !onSearchKb &&
        !onAllKb &&
        !onOnlKb &&
        !onRowKb &&
        !onEmptyAddKb
      ) {
        app.dismissFriendListSearchKeyboard();
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

    if (hitTabAll(L, panelX, x, y)) {
      app.friendListFilterMode = 'all';
      app.friendListScrollY = 0;
      if (typeof app.draw === 'function') {
        app.draw();
      }
      return true;
    }
    if (hitTabOnline(L, panelX, x, y)) {
      app.friendListFilterMode = 'online';
      app.friendListScrollY = 0;
      if (typeof app.draw === 'function') {
        app.draw();
      }
      return true;
    }

    var rows = getFilteredFriends();
    if (rows.length === 0 && hitEmptyAdd(L, panelX, x, y)) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: '请在对局中打开对手战绩添加好友',
          icon: 'none'
        });
      }
      return true;
    }

    if (!moved && app._friendListRowTapIdx >= 0) {
      var idx = app._friendListRowTapIdx;
      app._friendListRowTapIdx = -1;
      var f = rows[idx];
      if (f) {
        showFriendActions(f);
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
    app.ctx.save();
    app.ctx.translate(cx, cy);
    app.ctx.scale(scale, scale);
    app.ctx.translate(-cx, -cy);
    app.ctx.fillStyle = fillB;
    app.ctx.shadowColor = shCol;
    app.ctx.shadowBlur = 8;
    app.ctx.shadowOffsetY = 3;
    app.ctx.beginPath();
    app.ctx.arc(app.snapPx(cx), app.snapPx(cy), app.snapPx(r), 0, Math.PI * 2);
    app.ctx.fill();
    app.ctx.shadowBlur = 0;
    app.ctx.shadowOffsetY = 0;
    app.ctx.strokeStyle = strokeB;
    app.ctx.lineWidth = Math.max(1, app.rpx(1.5));
    app.ctx.beginPath();
    app.ctx.arc(app.snapPx(cx), app.snapPx(cy), app.snapPx(r), 0, Math.PI * 2);
    app.ctx.stroke();
    if (typeof app.drawHomeFriendListFabIcon === 'function') {
      app.drawHomeFriendListFabIcon(cx, cy, r, iconC);
    }
    app.ctx.restore();
  };

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
        app.snapPx(searchY + (L.searchH - app.rpx(12)) * 0.55)
      );
    } else {
      app.ctx.fillStyle = FL && FL.searchPlaceholder ? FL.searchPlaceholder : '#999999';
      app.ctx.fillText(
        '搜索好友昵称',
        app.snapPx(panelX + app.rpx(24)),
        app.snapPx(searchY + (L.searchH - app.rpx(12)) * 0.55)
      );
    }

    var tabY = L.y0 + L.headerH + L.searchH;
    var tPad = app.rpx(12);
    var trX = panelX + tPad;
    var trY = tabY + app.rpx(4);
    var trW = L.w - tPad * 2;
    var trH = L.tabH - app.rpx(10);

    var g = app.rpx(4);
    var pillW = (trW - g * 3) / 2;
    var pillH = trH - g * 2;
    var pillX =
      app.friendListFilterMode === 'all'
        ? trX + g
        : trX + g + pillW + g;
    var pillY = trY + g;
    var piFill = FL && FL.tabPill ? FL.tabPill : 'rgba(255, 255, 255, 0.94)';
    var piStroke = FL && FL.tabPillStroke ? FL.tabPillStroke : 'rgba(200, 188, 172, 0.45)';
    app.ctx.save();
    app.ctx.globalAlpha = pa;
    app.ctx.fillStyle = piFill;
    app.roundRect(pillX, pillY, pillW, pillH, app.rpx(8));
    app.ctx.fill();
    app.ctx.strokeStyle = piStroke;
    app.ctx.lineWidth = Math.max(1, app.rpx(1));
    app.roundRect(pillX, pillY, pillW, pillH, app.rpx(8));
    app.ctx.stroke();
    app.ctx.restore();

    app.ctx.font =
      '500 ' + app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.textAlign = 'center';
    var tabOn = FL && FL.tabActive ? FL.tabActive : colTitle;
    var tabOff = FL && FL.tabInactive ? FL.tabInactive : colMuted;
    app.ctx.fillStyle =
      app.friendListFilterMode === 'all' ? tabOn : tabOff;
    app.ctx.fillText(
      '全部',
      app.snapPx(trX + trW * 0.25),
      app.snapPx(trY + trH * 0.5)
    );
    app.ctx.fillStyle =
      app.friendListFilterMode === 'online' ? tabOn : tabOff;
    app.ctx.fillText(
      '在线',
      app.snapPx(trX + trW * 0.75),
      app.snapPx(trY + trH * 0.5)
    );

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
      app.ctx.textAlign = 'center';
      app.ctx.fillText(
        '加载中…',
        app.snapPx(panelX + L.w * 0.5),
        app.snapPx(L.listTop + L.listH * 0.4)
      );
    } else if (!rows.length) {
      app.ctx.fillStyle = FL && FL.emptyTitle ? FL.emptyTitle : colTitle;
      app.ctx.font =
        app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.fillText(
        '暂无好友',
        app.snapPx(panelX + L.w * 0.5),
        app.snapPx(L.listTop + L.listH * 0.38)
      );
      app.ctx.save();
      app.ctx.globalAlpha = pa;
      app.ctx.fillStyle = FL && FL.emptyBtnFill ? FL.emptyBtnFill : '#F5EADF';
      app.roundRect(
        panelX + L.w * 0.5 - app.rpx(100),
        L.listTop + L.listH * 0.48,
        app.rpx(200),
        app.rpx(44),
        app.rpx(22)
      );
      app.ctx.fill();
      app.ctx.strokeStyle =
        FL && FL.emptyBtnStroke ? FL.emptyBtnStroke : 'rgba(93,64,55,0.35)';
      app.ctx.lineWidth = app.rpx(1);
      app.roundRect(
        panelX + L.w * 0.5 - app.rpx(100),
        L.listTop + L.listH * 0.48,
        app.rpx(200),
        app.rpx(44),
        app.rpx(22)
      );
      app.ctx.stroke();
      app.ctx.restore();
      app.ctx.fillStyle = FL && FL.emptyBtnText ? FL.emptyBtnText : colTitle;
      app.ctx.font =
        '500 ' + app.rpx(26) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
      app.ctx.fillText(
        '去添加',
        app.snapPx(panelX + L.w * 0.5),
        app.snapPx(L.listTop + L.listH * 0.48 + app.rpx(22))
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
        var avR = app.rpx(20);
        var acx = panelX + app.rpx(8 + 20 + 8);
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
          app.ctx.drawImage(
            img,
            app.snapPx(acx - avR),
            app.snapPx(acy - avR),
            app.snapPx(sz),
            app.snapPx(sz)
          );
          app.ctx.restore();
        } else {
          app.ctx.fillStyle =
            FL && FL.avatarFallback ? FL.avatarFallback : '#E0D6C8';
          app.ctx.beginPath();
          app.ctx.arc(
            app.snapPx(acx),
            app.snapPx(acy),
            app.snapPx(avR),
            0,
            Math.PI * 2
          );
          app.ctx.fill();
          app.ctx.fillStyle =
            FL && FL.avatarChar ? FL.avatarChar : colTitle;
          app.ctx.font =
            app.rpx(22) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
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
          app.snapPx(panelX + app.rpx(72)),
          app.snapPx(yRow + L.rowH * 0.38)
        );
        var onCol = FL && FL.online ? FL.online : '#2E7D32';
        var offCol = FL && FL.offline ? FL.offline : '#9E9E9E';
        app.ctx.fillStyle = fr.online ? onCol : offCol;
        app.ctx.font =
          app.rpx(20) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
        app.ctx.fillText(
          fr.online ? '在线' : '离线',
          app.snapPx(panelX + app.rpx(72)),
          app.snapPx(yRow + L.rowH * 0.72)
        );
        app.ctx.textAlign = 'right';
        app.ctx.fillStyle = FL && FL.actionHint ? FL.actionHint : colMuted;
        app.ctx.font =
          app.rpx(20) + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
        app.ctx.fillText(
          '点击操作',
          app.snapPx(panelX + L.w - app.rpx(16)),
          app.snapPx(yRow + L.rowH * 0.55)
        );
      }
    }
    app.ctx.restore();

    app.ctx.restore();
  };
};
