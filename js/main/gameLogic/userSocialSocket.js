/**
 * 用户级 WebSocket（/ws/user）：好友申请到达、处理结果等（friend-request-social-spec §5.4）
 * 与房间 /ws/gomoku 并存；未连接时服务端推送无法送达。
 */
module.exports = function registerUserSocialSocket(app, deps) {
  var wx = deps.wx;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;

  app.userSocialSocketTask = null;
  app._userSocialPingTimer = null;
  app._userSocialReconnectTimer = null;
  app.userSocialReconnectAttempt = 0;
  app._incomingFriendRequestQueue = [];
  app._incomingFriendModalOpen = false;

  var MAX_RECONNECT_MS = 60000;
  var BASE_RECONNECT_MS = 800;
  var PING_INTERVAL_MS = 25000;

  function clearUserSocialPing() {
    if (app._userSocialPingTimer != null) {
      try {
        clearInterval(app._userSocialPingTimer);
      } catch (e) {}
      app._userSocialPingTimer = null;
    }
  }

  function clearUserSocialReconnectTimer() {
    if (app._userSocialReconnectTimer != null) {
      try {
        clearTimeout(app._userSocialReconnectTimer);
      } catch (e2) {}
      app._userSocialReconnectTimer = null;
    }
  }

  function scheduleUserSocialReconnect(forceImmediate) {
    clearUserSocialReconnectTimer();
    if (!authApi.getSessionToken()) {
      return;
    }
    var attempt = app.userSocialReconnectAttempt || 0;
    var delay = forceImmediate
      ? 200
      : Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * Math.pow(2, attempt));
    app._userSocialReconnectTimer = setTimeout(function() {
      app._userSocialReconnectTimer = null;
      if (typeof app.restartUserSocialSocket === 'function') {
        app.restartUserSocialSocket();
      }
    }, delay);
  }

  function refetchOpponentFriendStatusIfRatingVisible(counterpartUserId) {
    if (!app.ratingCardVisible || !app.ratingCardData) {
      return;
    }
    var oid = app.ratingCardData.opponentUserId;
    if (oid == null || Number(oid) !== Number(counterpartUserId)) {
      return;
    }
    wx.request(
      Object.assign(roomApi.socialFriendStatusOptions(oid), {
        success: function(res) {
          if (res.statusCode !== 200 || !res.data) {
            return;
          }
          var fs = res.data;
          if (fs && typeof fs === 'string') {
            try {
              fs = JSON.parse(fs);
            } catch (pe) {
              return;
            }
          }
          if (typeof app.applyFriendStatusToRatingCard === 'function') {
            app.applyFriendStatusToRatingCard(oid, fs);
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
        }
      })
    );
  }

  function handleFriendRequestResolved(payload) {
    if (!payload) {
      return;
    }
    var outcome = payload.outcome;
    var counterpart = payload.counterpartUserId;
    if (typeof wx.showToast === 'function') {
      var title = '';
      if (outcome === 'ACCEPTED') {
        title = '你们已成为好友';
      } else if (outcome === 'REJECTED') {
        title = '好友申请被拒绝';
      } else if (outcome === 'EXPIRED') {
        title = '好友申请已过期';
      }
      if (title) {
        wx.showToast({ title: title, icon: 'none' });
      }
    }
    refetchOpponentFriendStatusIfRatingVisible(counterpart);
  }

  function handleFriendshipUpdated(payload) {
    if (!payload || typeof payload.nowFriends !== 'boolean') {
      return;
    }
    if (typeof app.refreshHomeFriendListFromServer === 'function') {
      app.refreshHomeFriendListFromServer();
    }
  }

  function handleUserSocialMessage(raw, sock) {
    if (!sock || app.userSocialSocketTask !== sock) {
      return;
    }
    var data;
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      return;
    }
    if (!data || typeof data.type !== 'string') {
      return;
    }
    if (data.type === 'PONG') {
      return;
    }
    if (data.type === 'FRIEND_REQUEST_INCOMING') {
      handleIncomingFriendRequestPayload(data.payload);
      return;
    }
    if (data.type === 'FRIEND_REQUEST_RESOLVED') {
      handleFriendRequestResolved(data.payload);
      return;
    }
    if (data.type === 'FRIENDSHIP_UPDATED') {
      handleFriendshipUpdated(data.payload);
      return;
    }
    if (data.type === 'FRIEND_DM_INCOMING') {
      handleFriendDmIncoming(data.payload);
    }
  }

  function handleFriendDmIncoming(payload) {
    if (!payload) {
      return;
    }
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (ePl) {
        return;
      }
    }
    var fromId =
      payload.fromUserId != null
        ? payload.fromUserId
        : payload.from_user_id != null
          ? payload.from_user_id
          : payload.senderUserId != null
            ? payload.senderUserId
            : payload.sender_user_id != null
              ? payload.sender_user_id
              : null;
    var rawNick = payload.fromNickname || payload.from_nickname;
    var nick =
      typeof rawNick === 'string' && rawNick.trim()
        ? rawNick.trim()
        : '好友';
    var raw = payload.text != null ? String(payload.text) : '';
    var sentAt =
      typeof payload.sentAt === 'number' && !isNaN(payload.sentAt)
        ? payload.sentAt
        : Date.now();
    if (typeof app.appendFriendChatIncomingMessage === 'function') {
      app.appendFriendChatIncomingMessage(fromId, nick, raw, sentAt);
    }
  }

  function handleIncomingFriendRequestPayload(payload) {
    if (!payload) {
      return;
    }
    var fr = {
      friendRequestId: payload.friendRequestId,
      fromUserId: payload.fromUserId,
      fromNickname: payload.fromNickname
    };
    if (fr.friendRequestId == null) {
      return;
    }
    app._incomingFriendRequestQueue.push(fr);
    pumpIncomingFriendModal();
  }

  function pumpIncomingFriendModal() {
    if (app._incomingFriendModalOpen) {
      return;
    }
    if (!app._incomingFriendRequestQueue.length) {
      return;
    }
    var next = app._incomingFriendRequestQueue.shift();
    if (!next) {
      return;
    }
    app._incomingFriendModalOpen = true;
    var nick =
      typeof next.fromNickname === 'string' && next.fromNickname.trim()
        ? next.fromNickname.trim()
        : '玩家';
    if (typeof wx.showModal !== 'function') {
      app._incomingFriendModalOpen = false;
      return;
    }
    wx.showModal({
      title: '好友申请',
      content: nick + ' 请求添加你为好友',
      confirmText: '同意',
      cancelText: '拒绝',
      success: function(res) {
        var rid = next.friendRequestId;
        var opts = res.confirm
          ? roomApi.socialFriendRequestAcceptOptions(rid)
          : roomApi.socialFriendRequestRejectOptions(rid);
        wx.request(
          Object.assign(opts, {
            success: function(r2) {
              var ok = r2.statusCode === 200;
              var body = r2.data;
              if (body && typeof body === 'string') {
                try {
                  body = JSON.parse(body);
                } catch (e) {}
              }
              if (typeof wx.showToast === 'function') {
                if (ok) {
                  wx.showToast({
                    title: res.confirm ? '已添加好友' : '已拒绝',
                    icon: 'none'
                  });
                } else {
                  var msg =
                    body && typeof body.message === 'string' && body.message.trim()
                      ? body.message.trim()
                      : '操作失败';
                  wx.showToast({ title: msg, icon: 'none' });
                }
              }
            },
            fail: function() {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '网络异常', icon: 'none' });
              }
            },
            complete: function() {
              app._incomingFriendModalOpen = false;
              pumpIncomingFriendModal();
            }
          })
        );
      },
      fail: function() {
        app._incomingFriendModalOpen = false;
        pumpIncomingFriendModal();
      }
    });
  }

  app.stopUserSocialSocket = function() {
    clearUserSocialPing();
    clearUserSocialReconnectTimer();
    if (app.userSocialSocketTask && typeof app.userSocialSocketTask.close === 'function') {
      try {
        app.userSocialSocketTask.close({});
      } catch (eClose) {}
    }
    app.userSocialSocketTask = null;
    app.userSocialReconnectAttempt = 0;
  };

  /**
   * 有 session 时建立或刷新用户级 WS（静默登录成功、前后台切换、网络恢复等调用）。
   */
  app.restartUserSocialSocket = function() {
    var st = authApi.getSessionToken();
    if (!st) {
      app.stopUserSocialSocket();
      return;
    }
    clearUserSocialPing();
    clearUserSocialReconnectTimer();
    if (app.userSocialSocketTask && typeof app.userSocialSocketTask.close === 'function') {
      try {
        app.userSocialSocketTask.close({});
      } catch (eOld) {}
    }
    app.userSocialSocketTask = null;

    var url = roomApi.userWebSocketUrl(st);
    var sock = wx.connectSocket({
      url: url,
      fail: function() {
        if (app.userSocialSocketTask !== sock) {
          return;
        }
        app.userSocialSocketTask = null;
        app.userSocialReconnectAttempt = (app.userSocialReconnectAttempt || 0) + 1;
        scheduleUserSocialReconnect(false);
      }
    });
    app.userSocialSocketTask = sock;
    if (!sock || !sock.onOpen) {
      return;
    }
    sock.onOpen(function() {
      if (app.userSocialSocketTask !== sock) {
        return;
      }
      app.userSocialReconnectAttempt = 0;
      app._userSocialPingTimer = setInterval(function() {
        if (app.userSocialSocketTask !== sock) {
          return;
        }
        try {
          sock.send({ data: 'ping' });
        } catch (eSend) {}
      }, PING_INTERVAL_MS);
    });
    sock.onMessage(function(res) {
      handleUserSocialMessage(res.data, sock);
    });
    sock.onClose(function() {
      if (app.userSocialSocketTask !== sock) {
        return;
      }
      clearUserSocialPing();
      app.userSocialSocketTask = null;
      app.userSocialReconnectAttempt = (app.userSocialReconnectAttempt || 0) + 1;
      scheduleUserSocialReconnect(false);
    });
    sock.onError(function() {
      if (app.userSocialSocketTask !== sock) {
        return;
      }
      clearUserSocialPing();
      app.userSocialSocketTask = null;
      app.userSocialReconnectAttempt = (app.userSocialReconnectAttempt || 0) + 1;
      scheduleUserSocialReconnect(false);
    });
  };

  authApi.onSilentLoginComplete(function(loginOk) {
    if (loginOk && authApi.getSessionToken()) {
      app.restartUserSocialSocket();
    } else {
      app.stopUserSocialSocket();
    }
  });
};
