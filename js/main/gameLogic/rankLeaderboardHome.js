/**
 * 首页「对战排行」天梯榜列表页
 */
module.exports = function registerRankLeaderboardHome(app, deps) {
  /** 对战排行展示人数（与 GET /api/rating/leaderboard?limit= 一致） */
  var RANK_BOARD_LEADERBOARD_LIMIT = 30;

  var wx = deps.wx;
  var roomApi = deps.roomApi;
  var authApi = deps.authApi;
  var ratingTitle = deps.ratingTitle;
  var defaultAvatars = deps.defaultAvatars;

  function resolveRankBoardRowAvatar(row, isMe) {
    var url =
      row && row.avatarUrl && typeof row.avatarUrl === 'string'
        ? row.avatarUrl.trim()
        : '';
    if (url && typeof app.getOrLoadHistoryOpponentAvatar === 'function') {
      var net = app.getOrLoadHistoryOpponentAvatar(url);
      if (net && net.width && net.height) {
        return net;
      }
    }
    if (isMe) {
      return defaultAvatars.getMyAvatarImage();
    }
    return defaultAvatars.getOpponentAvatarImage();
  }

  /** 与战绩统计卡一致：总局数为 0 时显示 — */
  function formatRankBoardWinPct(row) {
    var total =
      row && typeof row.totalGames === 'number' && !isNaN(row.totalGames)
        ? row.totalGames
        : 0;
    var win =
      row && typeof row.winCount === 'number' && !isNaN(row.winCount)
        ? row.winCount
        : 0;
    if (total <= 0) {
      return '—';
    }
    return String(Math.round((win * 1000) / total) / 10) + '%';
  }

  function prefetchRankBoardAvatars(items) {
    if (!items || !items.length) {
      return;
    }
    var i;
    for (i = 0; i < items.length; i++) {
      var row = items[i];
      if (!row) {
        continue;
      }
      var url =
        row.avatarUrl && typeof row.avatarUrl === 'string'
          ? row.avatarUrl.trim()
          : '';
      if (url && typeof app.getOrLoadHistoryOpponentAvatar === 'function') {
        app.getOrLoadHistoryOpponentAvatar(url);
      }
    }
  }

  app.rankBoardItems = [];
  app.rankBoardLoading = false;
  app.rankBoardLoadError = false;
  app.rankBoardScrollY = 0;
  app.rankBoardScrollTouchId = null;
  app.rankBoardScrollLastY = 0;
  app.rankBoardScrollVel = 0;
  app.rankBoardScrollLastTs = 0;
  app.rankBoardMomentumRafId = null;
  app.rankBoardMomentumLastTs = 0;
  app.rankBoardScrollbarRatioSmooth = null;
  app.rankBoardScrollbarLastScrollTs = 0;
  app.rankBoardScrollbarFadeTimerId = null;
  app.rankBoardListTouchStartX = 0;
  app.rankBoardListTouchStartY = 0;

  /** 单行几何（绘制与点击共用） */
  app.getRankBoardRowGeom = function(rx, ry, rw, rowH) {
    var rowPadX = app.rpx(18);
    var rankColW = app.rpx(48);
    var avR = app.rpx(34);
    var gapRankAv = app.rpx(14);
    var gapAvText = app.rpx(16);
    var rightPad = app.rpx(22);
    var innerL = rx + rowPadX;
    var rankCx = innerL + rankColW * 0.5;
    var avCx = innerL + rankColW + gapRankAv + avR;
    var nickLeft = avCx + avR + gapAvText;
    var rightX = rx + rw - rowPadX - rightPad;
    var midY = ry + rowH * 0.5;
    var nickY1 = ry + rowH * 0.36;
    var nickY2 = ry + rowH * 0.72;
    return {
      rowPadX: rowPadX,
      rankColW: rankColW,
      avR: avR,
      rankCx: rankCx,
      avCx: avCx,
      nickLeft: nickLeft,
      rightX: rightX,
      midY: midY,
      nickY1: nickY1,
      nickY2: nickY2,
      nickMaxW: rightX - nickLeft - app.rpx(16)
    };
  };

  /** 点击行内圆形头像：返回 userId，否则 null */
  app.hitRankBoardRowAvatar = function(clientX, clientY) {
    if (
      app.rankBoardLoading ||
      app.rankBoardLoadError ||
      !app.rankBoardItems ||
      !app.rankBoardItems.length
    ) {
      return null;
    }
    var L = app.getRankBoardPageLayout();
    if (
      clientX < L.padX ||
      clientX > app.W - L.padX ||
      clientY < L.listTop ||
      clientY > L.listBottom
    ) {
      return null;
    }
    var rowH = app.rankBoardRowHeightRpx();
    var gap = app.rankBoardRowGapRpx();
    var yBase = L.listTop - app.rankBoardScrollY;
    var i;
    for (i = 0; i < app.rankBoardItems.length; i++) {
      var row = app.rankBoardItems[i];
      if (!row) {
        continue;
      }
      var ry = yBase + i * (rowH + gap);
      if (ry + rowH < L.listTop - 2 || ry > L.listBottom + 2) {
        continue;
      }
      var rw = app.W - L.padX * 2;
      var g = app.getRankBoardRowGeom(L.padX, ry, rw, rowH);
      var hitR = g.avR + app.rpx(16);
      var dx = clientX - g.avCx;
      var dy = clientY - g.midY;
      if (dx * dx + dy * dy <= hitR * hitR) {
        var uid =
          row.userId != null && !isNaN(Number(row.userId))
            ? Number(row.userId)
            : 0;
        return uid > 0 ? uid : null;
      }
    }
    return null;
  };

  app.getRankBoardPageLayout = function() {
    var insetTop = Math.max(
      app.sys.statusBarHeight || 24,
      app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0
    );
    var padX = app.rpx(24);
    var backCy = insetTop + app.rpx(44);
    var backCx = app.rpx(44);
    var titleCy = backCy;
    var listTop = titleCy + app.rpx(52);
    var safeBottom =
      app.sys.safeArea && app.sys.safeArea.bottom != null
        ? app.sys.safeArea.bottom
        : app.H;
    var listBottom = safeBottom - app.rpx(20);
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
    return app.rpx(118);
  };

  app.rankBoardRowGapRpx = function() {
    return app.rpx(18);
  };

  app.getRankBoardScrollMetrics = function() {
    var L = app.getRankBoardPageLayout();
    var rowH = app.rankBoardRowHeightRpx();
    var gap = app.rankBoardRowGapRpx();
    var n = app.rankBoardLoading ? 0 : app.rankBoardItems.length;
    var contentH =
      n === 0
        ? app.rpx(120)
        : n * (rowH + gap) - gap + app.rpx(28);
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

  app.clearRankBoardScrollbarFadeTimer = function() {
    if (app.rankBoardScrollbarFadeTimerId != null) {
      try {
        clearTimeout(app.rankBoardScrollbarFadeTimerId);
      } catch (eRb) {}
      app.rankBoardScrollbarFadeTimerId = null;
    }
  };

  app.scheduleRankBoardScrollbarFadeRedraw = function() {
    app.clearRankBoardScrollbarFadeTimer();
    if (typeof setTimeout === 'undefined') {
      return;
    }
    var hold =
      app.HISTORY_SCROLLBAR_HOLD_MS != null ? app.HISTORY_SCROLLBAR_HOLD_MS : 1000;
    app.rankBoardScrollbarFadeTimerId = setTimeout(function() {
      app.rankBoardScrollbarFadeTimerId = null;
      if (app.screen === 'rank_board') {
        app.draw();
      }
    }, hold);
  };

  app.stopRankBoardMomentum = function() {
    app.clearRankBoardScrollbarFadeTimer();
    if (app.rankBoardMomentumRafId != null) {
      app.themeBubbleCaf(app.rankBoardMomentumRafId);
      app.rankBoardMomentumRafId = null;
    }
    app.rankBoardScrollVel = 0;
    app.rankBoardMomentumLastTs = 0;
  };

  app.tickRankBoardScrollMomentum = function() {
    if (
      app.screen !== 'rank_board' ||
      app.rankBoardLoading ||
      app.rankBoardLoadError
    ) {
      app.stopRankBoardMomentum();
      return;
    }
    var now = Date.now();
    var dt = Math.min(36, Math.max(5, now - app.rankBoardMomentumLastTs));
    app.rankBoardMomentumLastTs = now;
    var sm = app.getRankBoardScrollMetrics();
    var maxScroll = sm.maxScroll;
    var nextY = app.rankBoardScrollY + app.rankBoardScrollVel * dt;
    if (nextY <= 0) {
      app.rankBoardScrollY = 0;
      app.rankBoardScrollVel = 0;
    } else if (nextY >= maxScroll) {
      app.rankBoardScrollY = maxScroll;
      app.rankBoardScrollVel = 0;
    } else {
      app.rankBoardScrollY = nextY;
    }
    app.rankBoardScrollVel *= Math.exp(-dt / 240);
    app.draw();
    if (Math.abs(app.rankBoardScrollVel) < 0.014) {
      app.stopRankBoardMomentum();
      app.scheduleRankBoardScrollbarFadeRedraw();
      return;
    }
    app.rankBoardMomentumRafId = app.themeBubbleRaf(app.tickRankBoardScrollMomentum);
  };

  /** 与战绩列表 drawHistoryListScrollbar 一致 */
  app.drawRankBoardListScrollbar = function(L, maxScroll, contentH) {
    if (maxScroll <= 0 || contentH <= 0) {
      return;
    }
    var trackPadT = app.rpx(8);
    var trackPadB = app.rpx(8);
    var trackTop = L.listTop + trackPadT;
    var trackH = L.listH - trackPadT - trackPadB;
    if (trackH < app.rpx(48)) {
      return;
    }
    var barW = app.rpx(5);
    var rCap = barW / 2;
    var inset = app.rpx(6);
    var cx = app.W - L.padX - inset - rCap;

    var viewRatio = L.listH / contentH;
    if (viewRatio > 1) {
      viewRatio = 1;
    }
    var thumbH = Math.max(app.rpx(40), trackH * viewRatio);
    if (thumbH > trackH) {
      thumbH = trackH;
    }
    var travel = Math.max(0, trackH - thumbH);
    var targetP = maxScroll > 0 ? app.rankBoardScrollY / maxScroll : 0;
    if (targetP < 0) {
      targetP = 0;
    }
    if (targetP > 1) {
      targetP = 1;
    }
    var sm = app.rankBoardScrollbarRatioSmooth;
    if (sm == null || typeof sm !== 'number' || isNaN(sm)) {
      sm = targetP;
    } else {
      var k = app.rankBoardScrollTouchId != null ? 0.88 : 0.42;
      sm += (targetP - sm) * k;
      if (Math.abs(targetP - sm) < 0.0015) {
        sm = targetP;
      }
    }
    app.rankBoardScrollbarRatioSmooth = sm;
    var thumbTop = trackTop + sm * travel;

    var ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = 1;
    var thumbFill = 'rgba(0, 0, 0, 0.2)';
    if (typeof app.getUiTheme === 'function' && typeof app.historyPageUiFromTheme === 'function') {
      var thSb = app.getUiTheme();
      var HSb = app.historyPageUiFromTheme(thSb);
      if (HSb && HSb.scrollbar) {
        thumbFill = HSb.scrollbar;
      }
    }
    ctx.fillStyle = thumbFill;
    app.roundRect(cx - rCap, thumbTop, barW, thumbH, rCap);
    ctx.fill();
    ctx.restore();
  };

  app.closeRankLeaderboardScreen = function() {
    app.stopRankBoardMomentum();
    app.rankBoardScrollbarLastScrollTs = 0;
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
      Object.assign(roomApi.ratingLeaderboardOptions(RANK_BOARD_LEADERBOARD_LIMIT), {
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
          prefetchRankBoardAvatars(body.items);
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
      app.stopRankBoardMomentum();
      app.rankBoardScrollbarLastScrollTs = 0;
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

    var scrollM = app.getRankBoardScrollMetrics();
    var contentH = scrollM.contentH;
    var maxScroll = scrollM.maxScroll;
    if (app.rankBoardScrollY > maxScroll) {
      app.rankBoardScrollY = maxScroll;
    }
    if (app.rankBoardScrollY < 0) {
      app.rankBoardScrollY = 0;
    }

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
        var geom = app.getRankBoardRowGeom(rx, ry, rw, rowH);
        var isMe =
          selfId != null &&
          row.userId != null &&
          Number(row.userId) === Number(selfId);
        app.ctx.save();
        app.ctx.shadowColor = isMe
          ? 'rgba(166, 124, 61, 0.18)'
          : 'rgba(60, 48, 38, 0.07)';
        app.ctx.shadowBlur = app.rpx(isMe ? 12 : 10);
        app.ctx.shadowOffsetY = app.rpx(3);
        app.ctx.fillStyle = isMe
          ? 'rgba(255, 249, 238, 0.98)'
          : 'rgba(255, 252, 246, 0.96)';
        app.roundRect(rx, ry, rw, rowH, app.rpx(18));
        app.ctx.fill();
        app.ctx.shadowBlur = 0;
        app.ctx.shadowOffsetY = 0;
        app.ctx.strokeStyle = isMe
          ? 'rgba(166, 124, 61, 0.28)'
          : 'rgba(92, 75, 58, 0.08)';
        app.ctx.lineWidth = Math.max(1, app.rpx(1));
        app.roundRect(rx + 0.5, ry + 0.5, rw - 1, rowH - 1, app.rpx(17));
        app.ctx.stroke();

        var rankNum = row.rank != null ? row.rank : i + 1;
        app.ctx.textAlign = 'center';
        app.ctx.textBaseline = 'middle';
        if (rankNum <= 3) {
          var medalR = app.rpx(22);
          app.ctx.save();
          var medalG = app.ctx.createRadialGradient(
            geom.rankCx,
            geom.midY,
            0,
            geom.rankCx,
            geom.midY,
            medalR
          );
          if (rankNum === 1) {
            medalG.addColorStop(0, 'rgba(201, 162, 39, 0.28)');
            medalG.addColorStop(1, 'rgba(201, 162, 39, 0.06)');
          } else if (rankNum === 2) {
            medalG.addColorStop(0, 'rgba(154, 163, 173, 0.26)');
            medalG.addColorStop(1, 'rgba(154, 163, 173, 0.05)');
          } else {
            medalG.addColorStop(0, 'rgba(184, 115, 51, 0.26)');
            medalG.addColorStop(1, 'rgba(184, 115, 51, 0.05)');
          }
          app.ctx.fillStyle = medalG;
          app.ctx.beginPath();
          app.ctx.arc(geom.rankCx, geom.midY, medalR, 0, Math.PI * 2);
          app.ctx.fill();
          app.ctx.restore();
        }
        app.ctx.font =
          '700 ' +
          app.rpx(rankNum <= 3 ? 34 : 26) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        if (rankNum === 1) {
          app.ctx.fillStyle = '#c9a227';
        } else if (rankNum === 2) {
          app.ctx.fillStyle = '#8a939c';
        } else if (rankNum === 3) {
          app.ctx.fillStyle = '#b87333';
        } else {
          app.ctx.fillStyle = sub;
        }
        app.ctx.fillText(
          String(rankNum),
          app.snapPx(geom.rankCx),
          app.snapPx(geom.midY)
        );

        defaultAvatars.drawCircleAvatar(
          app.ctx,
          resolveRankBoardRowAvatar(row, isMe),
          geom.avCx,
          geom.midY,
          geom.avR,
          th
        );

        var nick =
          row.nickname && String(row.nickname).trim()
            ? String(row.nickname).trim()
            : '棋手';
        nick = app.truncateNameToWidth
          ? app.truncateNameToWidth(app.ctx, nick, geom.nickMaxW)
          : nick;
        var elo =
          typeof row.eloScore === 'number' && !isNaN(row.eloScore)
            ? row.eloScore
            : 1200;
        var rt = ratingTitle.getRankAndTitleByElo(elo);
        var rankLabel = rt && rt.rankLabel ? rt.rankLabel : '—';
        var winPctStr = formatRankBoardWinPct(row);

        app.ctx.textAlign = 'left';
        app.ctx.font =
          '600 ' +
          app.rpx(30) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = ink;
        app.ctx.fillText(nick, app.snapPx(geom.nickLeft), app.snapPx(geom.nickY1));
        app.ctx.font =
          app.rpx(24) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = muted;
        app.ctx.fillText(
          rankLabel,
          app.snapPx(geom.nickLeft),
          app.snapPx(geom.nickY2)
        );

        app.ctx.textAlign = 'right';
        app.ctx.font =
          '700 ' +
          app.rpx(32) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = ink;
        app.ctx.fillText(String(elo), app.snapPx(geom.rightX), app.snapPx(geom.nickY1));
        app.ctx.font =
          app.rpx(24) +
          'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
        app.ctx.fillStyle = muted;
        app.ctx.fillText(
          winPctStr === '—' ? '胜率 —' : '胜率 ' + winPctStr,
          app.snapPx(geom.rightX),
          app.snapPx(geom.nickY2)
        );
        app.ctx.restore();
      }
    }
    app.ctx.restore();

    var listScrolling =
      app.rankBoardScrollTouchId != null || app.rankBoardMomentumRafId != null;
    if (listScrolling) {
      app.rankBoardScrollbarLastScrollTs = Date.now();
      app.clearRankBoardScrollbarFadeTimer();
    }
    var holdMs =
      app.HISTORY_SCROLLBAR_HOLD_MS != null ? app.HISTORY_SCROLLBAR_HOLD_MS : 1000;
    var fadeHold =
      app.rankBoardScrollbarLastScrollTs > 0 &&
      Date.now() - app.rankBoardScrollbarLastScrollTs < holdMs;
    if (
      !app.rankBoardLoading &&
      !app.rankBoardLoadError &&
      app.rankBoardItems.length > 0 &&
      maxScroll > 0 &&
      (listScrolling || fadeHold)
    ) {
      app.drawRankBoardListScrollbar(L, maxScroll, contentH);
    } else {
      app.rankBoardScrollbarRatioSmooth = null;
    }

    app.drawThemeChrome(th);
    if (typeof app.drawRatingCardOverlay === 'function') {
      app.drawRatingCardOverlay(th);
    }
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
    var now = Date.now();
    var dtMove = Math.max(5, now - app.rankBoardScrollLastTs);
    app.rankBoardScrollLastTs = now;
    var instVel = -dy / dtMove;
    app.rankBoardScrollVel = app.rankBoardScrollVel * 0.62 + instVel * 0.38;
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
