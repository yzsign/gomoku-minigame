/**
 * 首页「对战排行」天梯榜列表页
 */
module.exports = function registerRankLeaderboardHome(app, deps) {
  var wx = deps.wx;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;
  var ratingTitle = deps.ratingTitle;

  app.rankBoardItems = [];
  app.rankBoardLoading = false;
  app.rankBoardLoadError = false;
  app.rankBoardScrollY = 0;
  app.rankBoardScrollTouchId = null;
  app.rankBoardScrollLastY = 0;

  app.getRankBoardPageLayout = function() {
    var insetTop = Math.max(
      app.sys.statusBarHeight || 24,
      app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0
    );
    var padX = app.rpx(28);
    var backCy = insetTop + app.rpx(44);
    var backCx = app.rpx(44);
    var titleCy = backCy;
    var listTop = titleCy + app.rpx(42);
    var safeBottom =
      app.sys.safeArea && app.sys.safeArea.bottom != null
        ? app.sys.safeArea.bottom
        : app.H;
    var listBottom = safeBottom - app.rpx(12);
    var listH = Math.max(app.rpx(160), listBottom - listTop);
    return {
      padX: padX,
      backCx: backCx,
      backCy: backCy,
      titleCy: titleCy,
      listTop: listTop,
      listBottom: listBottom,
      listH: listH
    };
  };

  app.rankBoardRowHeightRpx = function() {
    return app.rpx(92);
  };

  app.rankBoardRowGapRpx = function() {
    return app.rpx(10);
  };

  app.getRankBoardScrollMetrics = function() {
    var L = app.getRankBoardPageLayout();
    var rowH = app.rankBoardRowHeightRpx();
    var gap = app.rankBoardRowGapRpx();
    var n = app.rankBoardLoading ? 0 : app.rankBoardItems.length;
    var contentH =
      n === 0
        ? app.rpx(120)
        : n * (rowH + gap) - gap + app.rpx(16);
    return {
      contentH: contentH,
      maxScroll: Math.max(0, contentH - L.listH)
    };
  };

  app.hitRankBoardBack = function(clientX, clientY) {
    var L = app.getRankBoardPageLayout();
    return (
      Math.abs(clientX - L.backCx) <= app.rpx(40) &&
      Math.abs(clientY - L.backCy) <= app.rpx(40)
    );
  };

  app.hitRankBoardListZone = function(clientX, clientY) {
    var L = app.getRankBoardPageLayout();
    return (
      clientX >= L.padX &&
      clientX <= app.W - L.padX &&
      clientY >= L.listTop &&
      clientY <= L.listBottom
    );
  };

  app.closeRankLeaderboardScreen = function() {
    app.rankBoardScrollTouchId = null;
    app.rankBoardScrollY = 0;
    app.screen = 'home';
    app.draw();
  };

  app.fetchRankBoardList = function() {
    app.rankBoardLoading = true;
    app.rankBoardLoadError = false;
    app.rankBoardItems = [];
    app.draw();
    wx.request(
      Object.assign(roomApi.ratingLeaderboardOptions(100), {
        complete: function() {
          app.rankBoardLoading = false;
          app.draw();
        },
        success: function(res) {
          if (res.statusCode === 401) {
            app.rankBoardLoadError = true;
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '请先登录', icon: 'none' });
            }
            return;
          }
          if (res.statusCode !== 200 || !res.data) {
            app.rankBoardLoadError = true;
            return;
          }
          var body = res.data;
          if (body && typeof body === 'string') {
            try {
              body = JSON.parse(body);
            } catch (eParse) {
              body = null;
            }
          }
          if (!body || !body.items || !body.items.length) {
            app.rankBoardItems = [];
            return;
          }
          app.rankBoardItems = body.items;
        },
        fail: function() {
          app.rankBoardLoadError = true;
        }
      })
    );
  };

  app.openRankLeaderboardScreen = function() {
    authApi.ensureSession(function(sessOk) {
      if (!sessOk || !authApi.getSessionToken()) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '请先登录', icon: 'none' });
        }
        return;
      }
      app.rankBoardScrollY = 0;
      app.rankBoardScrollTouchId = null;
      app.screen = 'rank_board';
      app.fetchRankBoardList();
    });
  };

  app.drawRankLeaderboardScreen = function() {
    app.fillAmbientBackground();
    var th = app.getUiTheme();
    var L = app.getRankBoardPageLayout();
    var ink = th.title;
    var sub = th.subtitle;
    var muted = th.muted;

    app.ctx.save();
    app.ctx.strokeStyle = sub;
    app.ctx.lineWidth = Math.max(1.2, app.rpx(2));
    app.ctx.lineCap = 'round';
    app.ctx.lineJoin = 'round';
    var bx = L.backCx - app.rpx(8);
    var by = L.backCy;
    app.ctx.beginPath();
    app.ctx.moveTo(bx + app.rpx(10), by - app.rpx(12));
    app.ctx.lineTo(bx - app.rpx(2), by);
    app.ctx.lineTo(bx + app.rpx(10), by + app.rpx(12));
    app.ctx.stroke();
    app.ctx.restore();

    var titleCx = app.W * 0.5;
    if (
      app.sys.safeArea &&
      app.sys.safeArea.width != null &&
      app.sys.safeArea.left != null
    ) {
      titleCx = app.sys.safeArea.left + app.sys.safeArea.width * 0.5;
    }
    app.ctx.save();
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.font =
      '700 ' +
      app.rpx(34) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    app.ctx.fillStyle = ink;
    app.ctx.fillText('对战排行', app.snapPx(titleCx), app.snapPx(L.titleCy));
    app.ctx.restore();

    app.ctx.save();
    app.ctx.beginPath();
    app.ctx.rect(L.padX, L.listTop, app.W - L.padX * 2, L.listH);
    app.ctx.clip();

    var rowH = app.rankBoardRowHeightRpx();
    var gap = app.rankBoardRowGapRpx();
    var selfId =
      typeof authApi.getStoredSelfUserId === 'function'
        ? authApi.getStoredSelfUserId()
        : null;

    if (app.rankBoardLoading) {
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.font =
        app.rpx(26) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.fillStyle = sub;
      app.ctx.fillText(
        '加载中…',
        app.snapPx(app.W / 2),
        app.snapPx(L.listTop + L.listH * 0.45)
      );
    } else if (app.rankBoardLoadError) {
      app.ctx.textAlign = 'center';
      app.ctx.fillStyle = sub;
      app.ctx.fillText(
        '加载失败',
        app.snapPx(app.W / 2),
        app.snapPx(L.listTop + L.listH * 0.45)
      );
    } else if (!app.rankBoardItems.length) {
      app.ctx.textAlign = 'center';
      app.ctx.fillStyle = muted;
      app.ctx.fillText(
        '暂无排行数据',
        app.snapPx(app.W / 2),
        app.snapPx(L.listTop + L.listH * 0.45)
      );
    } else {
      var y = L.listTop - app.rankBoardScrollY;
      var i;
      for (i = 0; i < app.rankBoardItems.length; i++) {
        var row = app.rankBoardItems[i];
        if (!row) {
          continue;
        }
        var ry = y + i * (rowH + gap);
        if (ry + rowH < L.listTop - rowH) {
          continue;
        }
        if (ry > L.listBottom + rowH) {
          break;
        }
        var rw = app.W - L.padX * 2;
        var rx = L.padX;
        var isMe =
          selfId != null &&
          row.userId != null &&
          Number(row.userId) === Number(selfId);
        app.ctx.save();
        app.ctx.fillStyle = isMe
          ? 'rgba(166, 124, 61, 0.12)'
          : 'rgba(255, 252, 246, 0.94)';
        app.roundRect(rx, ry, rw, rowH, app.rpx(14));
        app.ctx.fill();
        app.ctx.strokeStyle = isMe
          ? 'rgba(166, 124, 61, 0.35)'
          : 'rgba(92, 75, 58, 0.1)';
        app.ctx.lineWidth = Math.max(1, app.rpx(1));
        app.roundRect(rx + 0.5, ry + 0.5, rw - 1, rowH - 1, app.rpx(13));
        app.ctx.stroke();

        var rankNum = row.rank != null ? row.rank : i + 1;
        var rankCx = rx + app.rpx(36);
        var midY = ry + rowH * 0.5;
        app.ctx.textAlign = 'center';
        app.ctx.textBaseline = 'middle';
        app.ctx.font =
          '700 ' +
          app.rpx(rankNum <= 3 ? 32 : 28) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        if (rankNum === 1) {
          app.ctx.fillStyle = '#c9a227';
        } else if (rankNum === 2) {
          app.ctx.fillStyle = '#9aa3ad';
        } else if (rankNum === 3) {
          app.ctx.fillStyle = '#b87333';
        } else {
          app.ctx.fillStyle = sub;
        }
        app.ctx.fillText(String(rankNum), app.snapPx(rankCx), app.snapPx(midY));

        var nick =
          row.nickname && String(row.nickname).trim()
            ? String(row.nickname).trim()
            : '棋手';
        nick = app.truncateNameToWidth
          ? app.truncateNameToWidth(app.ctx, nick, rw - app.rpx(200))
          : nick;
        var elo =
          typeof row.eloScore === 'number' && !isNaN(row.eloScore)
            ? row.eloScore
            : 1200;
        var rt = ratingTitle.getRankAndTitleByElo(elo);
        var rankLabel = rt && rt.rankLabel ? rt.rankLabel : '—';

        app.ctx.textAlign = 'left';
        app.ctx.font =
          '600 ' +
          app.rpx(28) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = ink;
        app.ctx.fillText(
          nick,
          app.snapPx(rx + app.rpx(68)),
          app.snapPx(ry + rowH * 0.38)
        );
        app.ctx.font =
          app.rpx(22) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = muted;
        app.ctx.fillText(
          rankLabel,
          app.snapPx(rx + app.rpx(68)),
          app.snapPx(ry + rowH * 0.68)
        );

        app.ctx.textAlign = 'right';
        app.ctx.font =
          '700 ' +
          app.rpx(30) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = ink;
        app.ctx.fillText(
          String(elo) + ' 分',
          app.snapPx(rx + rw - app.rpx(20)),
          app.snapPx(midY)
        );
        app.ctx.restore();
      }
    }
    app.ctx.restore();
    app.drawThemeChrome(th);
  };

  app.onRankBoardTouchMove = function(touch) {
    if (!touch || app.rankBoardScrollTouchId == null) {
      return;
    }
    if (touch.identifier != app.rankBoardScrollTouchId) {
      return;
    }
    var dy = touch.clientY - app.rankBoardScrollLastY;
    app.rankBoardScrollLastY = touch.clientY;
    app.rankBoardScrollY -= dy;
    var sm = app.getRankBoardScrollMetrics();
    if (app.rankBoardScrollY > sm.maxScroll) {
      app.rankBoardScrollY = sm.maxScroll;
    }
    if (app.rankBoardScrollY < 0) {
      app.rankBoardScrollY = 0;
    }
    app.draw();
  };
};
