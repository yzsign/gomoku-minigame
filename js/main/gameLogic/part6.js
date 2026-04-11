/**
 * Auto-split from gameLogic.js (part 6)
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

  authApi.onSilentLoginComplete(function (loginOk, payload) {
    if (!loginOk || !payload) {
      return;
    }
    if (payload.admin === true) {
      app.userIsAdmin = true;
    } else if (payload.admin === false) {
      app.userIsAdmin = false;
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  });

app.setupShareMessage = function() {
  if (typeof wx.onShareAppMessage === 'function') {
    wx.onShareAppMessage(function () {
      if (
        app.isPvpOnline &&
        app.onlineRoomId &&
        (app.onlinePuzzleFriendRoom ||
          app.onlineSpectatorMode ||
          app.pvpOnlineYourColor === app.BLACK)
      ) {
        return {
          title:
            app.onlinePuzzleFriendRoom || app.onlineSpectatorMode
              ? '来下这盘残局 · 房号 ' + app.onlineRoomId
              : '五子棋 房号 ' + app.onlineRoomId,
          query: 'roomId=' + app.onlineRoomId + '&online=1'
        };
      }
      return {
        title: '来一局团团五子棋吧！',
        query: 'from=invite'
      };
    });
  }
}
app.setupShareMessage();

try {
  var launchOpt = wx.getLaunchOptionsSync && wx.getLaunchOptionsSync();
  if (launchOpt && launchOpt.query) {
    var lq = launchOpt.query;
    if (String(lq.online) === '1' && lq.roomId) {
      app.tryLaunchOnlineInvite(lq);
    } else if (String(lq.from) === 'invite') {
      app.startPvpLocal();
    }
  }
} catch (launchErr) {}

if (typeof wx.onWindowResize === 'function') {
  wx.onWindowResize(function () {
    app.syncCanvasWithWindow();
    app.draw();
  });
}

defaultAvatars.preloadAll(function () {
  app.loadHomeUiAssets();
  app.draw();
});

app.draw();
app.maybeFirstVisitProfileModal();

/** 首屏再调一次：避免仅依赖 onShow 时，部分环境下首帧未触发或注册晚于首次 onShow */
authApi.silentLogin();
setTimeout(function () {
  app.tryFetchMyProfileAvatar();
}, 600);

/** ---------- 管理员：残局编辑（openid 白名单，见 js/adminConfig.js 与 GOMOKU_ADMIN_OPENIDS） ---------- */

function adminPuzzleSafeBottomPx() {
  if (
    app.sys &&
    app.sys.safeArea &&
    typeof app.sys.safeArea.bottom === 'number'
  ) {
    return Math.max(0, app.H - app.sys.safeArea.bottom);
  }
  return 0;
}

app.getAdminPuzzleFooterLayout = function() {
  var sb = adminPuzzleSafeBottomPx();
  var pad = app.rpx(20);
  var btnH = app.rpx(64);
  var gap = app.rpx(12);
  /* 四行：返回/清空、下一手黑/白、邀请好友、滑动发布 */
  var y0 = app.H - sb - btnH * 4 - gap * 3 - pad;
  var fullW = app.W - pad * 2;
  var half = (fullW - gap) * 0.5;
  return {
    yBack: y0,
    yRow2: y0 + btnH + gap,
    yInvite: y0 + (btnH + gap) * 2,
    yPub: y0 + (btnH + gap) * 3,
    btnH: btnH,
    pad: pad,
    halfW: half,
    fullW: fullW,
    gap: gap
  };
};

/** 棋盘上方：题目标题与排期横排可点区域 */
app.getAdminPuzzleMetaBarLayout = function() {
  var layout = app.layout;
  if (!layout || typeof layout.originY !== 'number') {
    return null;
  }
  var pad = app.rpx(20);
  var midGap = app.rpx(10);
  var stripH = app.rpx(50);
  var gapAboveBoard = app.rpx(18);
  var insetTop =
    typeof app.getGameScreenInsetTop === 'function'
      ? app.getGameScreenInsetTop()
      : Math.max(
          app.sys.statusBarHeight || 24,
          app.sys.safeArea && app.sys.safeArea.top != null
            ? app.sys.safeArea.top
            : 0
        );
  var titleFs = Math.max(16, Math.round(app.rpx(32)));
  var subFs = Math.max(12, Math.round(app.rpx(24)));
  /* 与 drawAdminPuzzleScreen 中主标题/副标题位置一致（用于计算条带下缘） */
  var titleCy = insetTop + app.rpx(6) + titleFs * 0.5;
  var subCy = titleCy + titleFs * 0.5 + app.rpx(12) + subFs * 0.5;
  var subBottom = subCy + subFs * 0.5;
  /* 条带整体在棋盘顶 originY 之上，下缘对齐 originY - gap（不再用 Math.max 与副标题比较而把条带压进棋盘） */
  var top = layout.originY - gapAboveBoard - stripH;
  var fullW = app.W - pad * 2;
  var half = (fullW - midGap) * 0.5;
  return {
    top: top,
    h: stripH,
    pad: pad,
    leftTitle: pad,
    wTitle: half,
    leftSched: pad + half + midGap,
    wSched: half,
    cxTitle: pad + half * 0.5,
    cxSched: pad + half + midGap + half * 0.5,
    cy: top + stripH * 0.5
  };
};

app.getAdminPuzzlePublishSwipeMetrics = function(L) {
  var pad = L.pad;
  var pubY = L.yPub + L.btnH * 0.5;
  var h = L.btnH;
  var w = L.fullW;
  var knobW0 = app.rpx(76);
  var knobW = Math.min(knobW0, h - app.rpx(8));
  var margin = app.rpx(8);
  /* 右侧固定文案区，与滑块行程互斥，避免「全宽条带 = 仅滑槽」导致无空间放字 */
  var labelReserve = Math.min(
    Math.max(app.rpx(168), w * 0.38),
    Math.max(app.rpx(120), w - knobW - margin * 3)
  );
  var slideW = Math.max(knobW + margin * 2, w - labelReserve);
  var travel = Math.max(0, slideW - knobW - margin * 2);
  return {
    left: pad,
    top: pubY - h * 0.5,
    width: w,
    height: h,
    knobW: knobW,
    margin: margin,
    travel: travel,
    centerY: pubY,
    slideW: slideW,
    labelReserve: labelReserve
  };
};

app.adminSchedulePickerParseYmd = function(s) {
  if (!s || typeof s !== 'string') {
    return null;
  }
  var p = s.trim().split('-');
  if (p.length !== 3) {
    return null;
  }
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  var d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  return { y: y, m: m, d: d };
};

app.adminSchedulePickerFormatYmd = function(y, m, d) {
  return (
    y +
    '-' +
    (m < 10 ? '0' : '') +
    m +
    '-' +
    (d < 10 ? '0' : '') +
    d
  );
};

app.adminSchedulePickerGetBounds = function() {
  var now = new Date();
  var max = new Date(
    now.getFullYear() + 2,
    now.getMonth(),
    now.getDate()
  );
  return {
    minY: now.getFullYear(),
    minM: now.getMonth() + 1,
    maxY: max.getFullYear(),
    maxM: max.getMonth() + 1
  };
};

app.adminSchedulePickerMonthIndex = function(y, m) {
  return y * 12 + (m - 1);
};

app.adminSchedulePickerShiftMonth = function(vy, vm, delta) {
  vm += delta;
  while (vm < 1) {
    vm += 12;
    vy--;
  }
  while (vm > 12) {
    vm -= 12;
    vy++;
  }
  return { y: vy, m: vm };
};

app.adminSchedulePickerCanPrevMonth = function(vy, vm) {
  var b = app.adminSchedulePickerGetBounds();
  return (
    app.adminSchedulePickerMonthIndex(vy, vm) >
    app.adminSchedulePickerMonthIndex(b.minY, b.minM)
  );
};

app.adminSchedulePickerCanNextMonth = function(vy, vm) {
  var b = app.adminSchedulePickerGetBounds();
  return (
    app.adminSchedulePickerMonthIndex(vy, vm) <
    app.adminSchedulePickerMonthIndex(b.maxY, b.maxM)
  );
};

app.adminSchedulePickerClampViewMonth = function(vy, vm) {
  var b = app.adminSchedulePickerGetBounds();
  var cur = app.adminSchedulePickerMonthIndex(vy, vm);
  var minI = app.adminSchedulePickerMonthIndex(b.minY, b.minM);
  var maxI = app.adminSchedulePickerMonthIndex(b.maxY, b.maxM);
  if (cur < minI) {
    return { y: b.minY, m: b.minM };
  }
  if (cur > maxI) {
    return { y: b.maxY, m: b.maxM };
  }
  return { y: vy, m: vm };
};

app.adminSchedulePickerIsSelectableDay = function(y, m, d) {
  var t = new Date(y, m - 1, d).getTime();
  var tMin = new Date();
  tMin.setHours(0, 0, 0, 0);
  var tMax = new Date(tMin);
  tMax.setFullYear(tMax.getFullYear() + 2);
  return t >= tMin.getTime() && t <= tMax.getTime();
};

app.adminSchedulePickerIsToday = function(y, m, d) {
  var n = new Date();
  return (
    y === n.getFullYear() && m === n.getMonth() + 1 && d === n.getDate()
  );
};

app.getAdminSchedulePickerLayout = function() {
  var topPad = app.rpx(10);
  var headerBandH = app.rpx(72);
  var innerAfterHead = app.rpx(12);
  var calInnerPad = app.rpx(16);
  var monthNavH = app.rpx(50);
  var weekH = app.rpx(36);
  var cell = app.rpx(46);
  var rowGap = app.rpx(6);
  var gridH = 6 * cell + 5 * rowGap;
  var calCardH = calInnerPad * 2 + monthNavH + weekH + app.rpx(8) + gridH;
  var bottomPad = app.rpx(22);
  var w = Math.min(app.W - app.rpx(22), app.rpx(680));
  var h = topPad + headerBandH + innerAfterHead + calCardH + bottomPad;
  var cx = app.W / 2;
  var cy = app.H * 0.46;
  var rOuter = app.rpx(26);
  var x0 = cx - w / 2;
  var y0 = cy - h / 2;
  var calLeft = x0 + app.rpx(16);
  var calW = w - app.rpx(32);
  var calTop = y0 + topPad + headerBandH + innerAfterHead;
  var navTop = calTop + calInnerPad;
  var navMidY = navTop + monthNavH * 0.5;
  var leftAx = calLeft + calInnerPad + app.rpx(38);
  var rightAx = calLeft + calW - calInnerPad - app.rpx(38);
  var hitR = app.rpx(28);
  var headCloseCx = x0 + w - app.rpx(34);
  var headCloseCy = y0 + topPad + headerBandH * 0.5;
  var gridTotalW = 7 * cell + 6 * rowGap;
  var gridLeft = cx - gridTotalW / 2;
  var weekTop = navTop + monthNavH;
  var gridTop = weekTop + weekH + app.rpx(10);
  return {
    cx: cx,
    cy: cy,
    w: w,
    h: h,
    r: rOuter,
    x0: x0,
    y0: y0,
    calLeft: calLeft,
    calW: calW,
    calTop: calTop,
    calCardH: calCardH,
    calInnerPad: calInnerPad,
    monthNavH: monthNavH,
    weekH: weekH,
    cell: cell,
    rowGap: rowGap,
    gridTop: gridTop,
    gridLeft: gridLeft,
    headCloseCx: headCloseCx,
    headCloseCy: headCloseCy,
    navTop: navTop,
    navMidY: navMidY,
    leftAx: leftAx,
    rightAx: rightAx,
    prevMonthHit: {
      x: leftAx - hitR,
      y: navMidY - hitR,
      w: hitR * 2,
      h: hitR * 2
    },
    nextMonthHit: {
      x: rightAx - hitR,
      y: navMidY - hitR,
      w: hitR * 2,
      h: hitR * 2
    }
  };
};

app.hitAdminSchedulePickerClose = function(x, y) {
  var L = app.getAdminSchedulePickerLayout();
  var rr = app.rpx(22);
  return (
    Math.abs(x - L.headCloseCx) <= rr && Math.abs(y - L.headCloseCy) <= rr
  );
};

app.hitAdminSchedulePickerPrevMonth = function(x, y) {
  var L = app.getAdminSchedulePickerLayout();
  var h = L.prevMonthHit;
  return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
};

app.hitAdminSchedulePickerNextMonth = function(x, y) {
  var L = app.getAdminSchedulePickerLayout();
  var h = L.nextMonthHit;
  return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
};

app.hitAdminSchedulePickerDay = function(clientX, clientY) {
  var L = app.getAdminSchedulePickerLayout();
  var d = app.adminPuzzleSchedulePickerData;
  if (!d) {
    return null;
  }
  var vy = d.viewYear;
  var vm = d.viewMonth;
  var first = new Date(vy, vm - 1, 1);
  var firstSun0 = first.getDay();
  var dim = new Date(vy, vm, 0).getDate();
  var dayNum = 1;
  var i;
  var slotW = L.cell;
  var slotH = L.cell - app.rpx(1);
  for (i = 0; i < 42; i++) {
    if (i < firstSun0 || dayNum > dim) {
      continue;
    }
    var row = Math.floor(i / 7);
    var col = i % 7;
    var cxCell = L.gridLeft + col * (L.cell + L.rowGap) + L.cell / 2;
    var cyCell = L.gridTop + row * (L.cell + L.rowGap) + L.cell / 2;
    var bx0 = cxCell - slotW * 0.48;
    var by0 = cyCell - slotH * 0.48;
    var bw = slotW * 0.96;
    var bh = slotH * 0.96;
    if (
      clientX >= bx0 &&
      clientX <= bx0 + bw &&
      clientY >= by0 &&
      clientY <= by0 + bh
    ) {
      return { y: vy, m: vm, d: dayNum };
    }
    dayNum++;
  }
  return null;
};

app.openAdminSchedulePicker = function() {
  var parsed = app.adminSchedulePickerParseYmd(app.adminPuzzleScheduleDate);
  var n = new Date();
  var vy = parsed ? parsed.y : n.getFullYear();
  var vm = parsed ? parsed.m : n.getMonth() + 1;
  var cl = app.adminSchedulePickerClampViewMonth(vy, vm);
  app.adminPuzzleSchedulePickerData = { viewYear: cl.y, viewMonth: cl.m };
  app.adminPuzzleSchedulePickerOpen = true;
  app.draw();
};

app.drawAdminPuzzleSchedulePickerOverlay = function(th) {
  var d = app.adminPuzzleSchedulePickerData;
  if (!d) {
    return;
  }
  var L = app.getAdminSchedulePickerLayout();
  var ref =
    typeof app.checkinModalThemePalette === 'function'
      ? app.checkinModalThemePalette(th)
      : {
          shellTop: '#fff',
          shellMid: '#f5f5f5',
          shellBot: '#ececec',
          innerCard: '#ffffff',
          innerCardShade: '#ececec',
          cardStroke: 'rgba(255,255,255,0.88)',
          weekBar: 'rgba(92, 71, 56, 0.1)',
          weekLabel: th.title,
          dayNumStrong: th.title,
          dayMuted: th.muted,
          signedCellBg: th.btnPrimary,
          signedCellText: '#ffffff',
          todayRing: th.btnPrimary,
          boardLine: th.board.line,
          navAccent: th.btnPrimary,
          titleFill: th.title,
          closeXStroke: th.title,
          modalShadow: 'rgba(0,0,0,0.18)',
          arrowFillHi: 'rgba(255,255,255,0.88)',
          arrowFillLo: 'rgba(255,255,255,0.42)'
        };
  var viewYear = d.viewYear;
  var viewMonth = d.viewMonth;
  var canPrev = app.adminSchedulePickerCanPrevMonth(viewYear, viewMonth);
  var canNext = app.adminSchedulePickerCanNextMonth(viewYear, viewMonth);
  var sel = app.adminSchedulePickerParseYmd(app.adminPuzzleScheduleDate);

  var x = L.cx - L.w / 2;
  var y = L.cy - L.h / 2;

  app.ctx.save();
  app.ctx.fillStyle = 'rgba(0,0,0,0.52)';
  app.ctx.fillRect(0, 0, app.W, app.H);

  app.ctx.shadowColor = ref.modalShadow;
  app.ctx.shadowBlur = app.rpx(40);
  app.ctx.shadowOffsetY = app.rpx(14);
  var shellG = app.ctx.createLinearGradient(x, y, x, y + L.h);
  shellG.addColorStop(0, ref.shellTop);
  shellG.addColorStop(0.45, ref.shellMid);
  shellG.addColorStop(1, ref.shellBot);
  app.ctx.fillStyle = shellG;
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;

  app.ctx.strokeStyle = ref.cardStroke;
  app.ctx.lineWidth = app.rpx(2);
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.stroke();

  var titleCy = y + app.rpx(10) + app.rpx(72) * 0.5;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    '700 ' +
    Math.max(1, Math.round(app.rpx(30))) +
    'px -apple-system, "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ref.titleFill;
  app.ctx.fillText('选择排期日期', app.snapPx(L.cx), app.snapPx(titleCy));

  var hx = L.headCloseCx;
  var hy = L.headCloseCy;
  app.ctx.lineWidth = app.rpx(2.5);
  app.ctx.strokeStyle = ref.closeXStroke;
  app.ctx.lineCap = 'round';
  var cs = app.rpx(9);
  app.ctx.beginPath();
  app.ctx.moveTo(hx - cs, hy - cs);
  app.ctx.lineTo(hx + cs, hy + cs);
  app.ctx.moveTo(hx + cs, hy - cs);
  app.ctx.lineTo(hx - cs, hy + cs);
  app.ctx.stroke();

  var cardG = app.ctx.createLinearGradient(
    L.calLeft,
    L.calTop,
    L.calLeft,
    L.calTop + L.calCardH
  );
  cardG.addColorStop(0, ref.innerCard);
  cardG.addColorStop(1, ref.innerCardShade);
  app.ctx.fillStyle = cardG;
  app.roundRect(L.calLeft, L.calTop, L.calW, L.calCardH, app.rpx(20));
  app.ctx.fill();
  app.ctx.strokeStyle = ref.cardStroke;
  app.ctx.lineWidth = 1.25;
  app.roundRect(L.calLeft, L.calTop, L.calW, L.calCardH, app.rpx(20));
  app.ctx.stroke();

  if (typeof app.drawCheckinMonthArrow === 'function') {
    app.drawCheckinMonthArrow(L.leftAx, L.navMidY, -1, ref, canPrev);
    app.drawCheckinMonthArrow(L.rightAx, L.navMidY, 1, ref, canNext);
  }

  var navTop = L.navTop;
  var navMidY = L.navMidY;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    '600 ' +
    app.rpx(31) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ref.dayNumStrong;
  app.ctx.fillText(
    viewYear + '年 ' + viewMonth + ' 月',
    app.snapPx(L.cx),
    app.snapPx(navMidY)
  );

  var weekTop = navTop + L.monthNavH;
  app.ctx.fillStyle = ref.weekBar;
  app.roundRect(
    L.calLeft + L.calInnerPad,
    weekTop,
    L.calW - L.calInnerPad * 2,
    L.weekH,
    app.rpx(10)
  );
  app.ctx.fill();

  var labels = ['日', '一', '二', '三', '四', '五', '六'];
  app.ctx.font =
    '600 ' +
    app.rpx(22) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ref.weekLabel;
  var gridTotalW = 7 * L.cell + 6 * L.rowGap;
  var gridLeft = L.cx - gridTotalW / 2;
  var c;
  for (c = 0; c < 7; c++) {
    var tcx = gridLeft + c * (L.cell + L.rowGap) + L.cell / 2;
    app.ctx.fillText(
      labels[c],
      app.snapPx(tcx),
      app.snapPx(weekTop + L.weekH * 0.5)
    );
  }

  var first = new Date(viewYear, viewMonth - 1, 1);
  var firstSun0 = first.getDay();
  var dim = new Date(viewYear, viewMonth, 0).getDate();
  var gridTop = L.gridTop;
  var cellR = app.rpx(6);
  var dayNum = 1;
  var ii;
  for (ii = 0; ii < 42; ii++) {
    var row = Math.floor(ii / 7);
    var col = ii % 7;
    var cxCell = gridLeft + col * (L.cell + L.rowGap) + L.cell / 2;
    var cyCell = gridTop + row * (L.cell + L.rowGap) + L.cell / 2;
    var slotW = L.cell;
    var slotH = L.cell - app.rpx(1);
    var bx0 = cxCell - slotW * 0.48;
    var by0 = cyCell - slotH * 0.48;
    var bw = slotW * 0.96;
    var bh = slotH * 0.96;

    if (ii < firstSun0 || dayNum > dim) {
      continue;
    }

    var ok = app.adminSchedulePickerIsSelectableDay(
      viewYear,
      viewMonth,
      dayNum
    );
    var isSel =
      sel &&
      sel.y === viewYear &&
      sel.m === viewMonth &&
      sel.d === dayNum;
    var isTo = app.adminSchedulePickerIsToday(viewYear, viewMonth, dayNum);

    app.ctx.save();
    if (isSel && ok) {
      app.ctx.fillStyle = ref.signedCellBg;
      app.roundRect(bx0, by0, bw, bh, cellR);
      app.ctx.fill();
      app.ctx.fillStyle = ref.signedCellText;
      app.ctx.font =
        '600 ' +
        app.rpx(26) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        String(dayNum),
        app.snapPx(cxCell),
        app.snapPx(cyCell)
      );
    } else {
      app.ctx.fillStyle = ok ? ref.dayNumStrong : ref.dayMuted;
      app.ctx.globalAlpha = ok ? 1 : 0.38;
      app.ctx.font =
        '600 ' +
        app.rpx(26) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        String(dayNum),
        app.snapPx(cxCell),
        app.snapPx(cyCell)
      );
      app.ctx.globalAlpha = 1;
    }
    if (isTo && ok && !isSel) {
      app.ctx.strokeStyle = ref.todayRing;
      app.ctx.lineWidth = app.rpx(2.75);
      app.roundRect(
        bx0 - app.rpx(1),
        by0 - app.rpx(1),
        bw + app.rpx(2),
        bh + app.rpx(2),
        cellR + app.rpx(1)
      );
      app.ctx.stroke();
    }
    app.ctx.restore();

    dayNum++;
  }

  app.ctx.restore();
};

app.handleAdminSchedulePickerTouchEnd = function(clientX, clientY) {
  var L = app.getAdminSchedulePickerLayout();
  if (
    clientX < L.x0 ||
    clientX > L.x0 + L.w ||
    clientY < L.y0 ||
    clientY > L.y0 + L.h
  ) {
    app.adminPuzzleSchedulePickerOpen = false;
    app.adminPuzzleSchedulePickerData = null;
    app.draw();
    return;
  }
  if (app.hitAdminSchedulePickerClose(clientX, clientY)) {
    app.adminPuzzleSchedulePickerOpen = false;
    app.adminPuzzleSchedulePickerData = null;
    app.draw();
    return;
  }
  var d = app.adminPuzzleSchedulePickerData;
  if (!d) {
    return;
  }
  if (
    app.hitAdminSchedulePickerPrevMonth(clientX, clientY) &&
    app.adminSchedulePickerCanPrevMonth(d.viewYear, d.viewMonth)
  ) {
    var p = app.adminSchedulePickerShiftMonth(d.viewYear, d.viewMonth, -1);
    var pc = app.adminSchedulePickerClampViewMonth(p.y, p.m);
    d.viewYear = pc.y;
    d.viewMonth = pc.m;
    app.draw();
    return;
  }
  if (
    app.hitAdminSchedulePickerNextMonth(clientX, clientY) &&
    app.adminSchedulePickerCanNextMonth(d.viewYear, d.viewMonth)
  ) {
    var n = app.adminSchedulePickerShiftMonth(d.viewYear, d.viewMonth, 1);
    var nc = app.adminSchedulePickerClampViewMonth(n.y, n.m);
    d.viewYear = nc.y;
    d.viewMonth = nc.m;
    app.draw();
    return;
  }
  var hit = app.hitAdminSchedulePickerDay(clientX, clientY);
  if (
    hit &&
    app.adminSchedulePickerIsSelectableDay(hit.y, hit.m, hit.d)
  ) {
    app.adminPuzzleScheduleDate = app.adminSchedulePickerFormatYmd(
      hit.y,
      hit.m,
      hit.d
    );
    app.adminPuzzleSchedulePickerOpen = false;
    app.adminPuzzleSchedulePickerData = null;
    app.draw();
  }
};

app.enterAdminPuzzleScreen = function() {
  app.screen = 'admin_puzzle';
  app.adminDraftBoard = gomoku.createBoard();
  app.board = app.adminDraftBoard;
  if (!app.adminPuzzleTitle) {
    app.adminPuzzleTitle = '新残局';
  }
  app.adminPuzzleSideToMove = app.adminPuzzleSideToMove || app.BLACK;
  app.adminPuzzleScheduleDate =
    typeof app.getLocalCalendarYmd === 'function'
      ? app.getLocalCalendarYmd()
      : '';
  app.adminPuzzleSaving = false;
  app.adminPuzzlePublishSwipePx = 0;
  app.adminPuzzlePublishSwipeTouchId = null;
  app.adminPuzzleSchedulePickerOpen = false;
  app.adminPuzzleSchedulePickerData = null;
  app.draw();
};

app.exitAdminPuzzleScreen = function() {
  app.screen = 'home';
  app.adminDraftBoard = null;
  app.board = gomoku.createBoard();
  app.adminPuzzleSaving = false;
  app.adminPuzzlePublishSwipePx = 0;
  app.adminPuzzlePublishSwipeTouchId = null;
  app.adminPuzzleSchedulePickerOpen = false;
  app.adminPuzzleSchedulePickerData = null;
  app.draw();
};

app.drawAdminPuzzleScreen = function() {
  app.fillAmbientBackground();
  app.layout = app.computeLayout();
  var boardTh = app.getCurrentTheme();
  var pieceUnified = app.getThemeForPieces(boardTh);
  doodles.drawGameBoardCornerClouds(
    app.ctx,
    app.W,
    app.H,
    app.layout,
    app.sys.statusBarHeight || 0
  );
  render.drawBoard(app.ctx, app.layout, boardTh);
  render.drawPieces(
    app.ctx,
    app.adminDraftBoard,
    app.layout,
    pieceUnified,
    pieceUnified
  );

  var th = app.getUiTheme();
  var insetTop =
    typeof app.getGameScreenInsetTop === 'function'
      ? app.getGameScreenInsetTop()
      : Math.max(
          app.sys.statusBarHeight || 24,
          app.sys.safeArea && app.sys.safeArea.top != null
            ? app.sys.safeArea.top
            : 0
        );
  var titleFs = Math.max(16, Math.round(app.rpx(32)));
  var subFs = Math.max(12, Math.round(app.rpx(24)));
  var titleCy = insetTop + app.rpx(6) + titleFs * 0.5;
  var subCy = titleCy + titleFs * 0.5 + app.rpx(12) + subFs * 0.5;
  app.ctx.save();
  render.drawText(
    app.ctx,
    '残局管理',
    app.W / 2,
    titleCy,
    titleFs,
    th.title
  );
  render.drawText(
    app.ctx,
    '点格循环空·黑·白 · 底部右滑发布',
    app.W / 2,
    subCy,
    subFs,
    th.subtitle != null ? th.subtitle : th.muted
  );
  app.ctx.restore();

  var metaBar = app.getAdminPuzzleMetaBarLayout();
  if (metaBar) {
    function ellipsizeLabel(s, maxLen) {
      var t = String(s || '');
      if (t.length <= maxLen) {
        return t;
      }
      return t.slice(0, Math.max(0, maxLen - 1)) + '…';
    }
    function drawMetaPill(cx, bw, bh, label, sub) {
      app.ctx.save();
      app.ctx.fillStyle = 'rgba(255,255,255,0.94)';
      app.roundRect(cx - bw / 2, metaBar.cy - bh / 2, bw, bh, app.rpx(12));
      app.ctx.fill();
      app.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      app.ctx.lineWidth = 1;
      app.ctx.stroke();
      render.drawText(
        app.ctx,
        label,
        cx,
        metaBar.cy - app.rpx(10),
        app.rpx(20),
        th.muted
      );
      render.drawText(
        app.ctx,
        sub,
        cx,
        metaBar.cy + app.rpx(12),
        app.rpx(22),
        th.title
      );
      app.ctx.restore();
    }
    drawMetaPill(
      metaBar.cxTitle,
      metaBar.wTitle,
      metaBar.h - app.rpx(4),
      '题目标题',
      ellipsizeLabel(app.adminPuzzleTitle || '新残局', 14)
    );
    drawMetaPill(
      metaBar.cxSched,
      metaBar.wSched,
      metaBar.h - app.rpx(4),
      '排期',
      ellipsizeLabel(
        app.adminPuzzleScheduleDate ? String(app.adminPuzzleScheduleDate) : '-',
        14
      )
    );
  }

  var L = app.getAdminPuzzleFooterLayout();
  var pad = L.pad;
  function drawMiniBtn(cx, cy, bw, bh, label, pressed) {
    app.ctx.save();
    app.ctx.fillStyle = pressed
      ? 'rgba(0,0,0,0.12)'
      : 'rgba(255,255,255,0.92)';
    app.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, app.rpx(12));
    app.ctx.fill();
    app.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    app.ctx.lineWidth = 1;
    app.ctx.stroke();
    render.drawText(app.ctx, label, cx, cy, app.rpx(26), th.title);
    app.ctx.restore();
  }
  var xL = pad + L.halfW * 0.5;
  var xR = app.W - pad - L.halfW * 0.5;
  drawMiniBtn(xL, L.yBack + L.btnH * 0.5, L.halfW, L.btnH, '返回', false);
  drawMiniBtn(xR, L.yBack + L.btnH * 0.5, L.halfW, L.btnH, '清空', false);
  var sideBlackOn = app.adminPuzzleSideToMove === app.BLACK;
  var sideWhiteOn = app.adminPuzzleSideToMove === app.WHITE;
  drawMiniBtn(
    xL,
    L.yRow2 + L.btnH * 0.5,
    L.halfW,
    L.btnH,
    '下一手黑',
    sideBlackOn
  );
  drawMiniBtn(
    xR,
    L.yRow2 + L.btnH * 0.5,
    L.halfW,
    L.btnH,
    '下一手白',
    sideWhiteOn
  );
  app.ctx.save();
  app.ctx.fillStyle = 'rgba(255,255,255,0.92)';
  app.roundRect(
    L.pad,
    L.yInvite,
    L.fullW,
    L.btnH,
    app.rpx(12)
  );
  app.ctx.fill();
  app.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  app.ctx.lineWidth = 1;
  app.ctx.stroke();
  render.drawText(
    app.ctx,
    '邀请好友下残局（我执旁观）',
    L.pad + L.fullW * 0.5,
    L.yInvite + L.btnH * 0.5,
    app.rpx(26),
    th.title
  );
  app.ctx.restore();
  var pubY = L.yPub + L.btnH * 0.5;
  var Sw = app.getAdminPuzzlePublishSwipeMetrics(L);
  app.ctx.save();
  if (app.adminPuzzleSaving) {
    app.ctx.fillStyle = 'rgba(0,0,0,0.12)';
    app.roundRect(Sw.left, Sw.top, Sw.width, Sw.height, app.rpx(12));
    app.ctx.fill();
    render.drawText(
      app.ctx,
      '提交中…',
      Sw.left + Sw.width * 0.5,
      pubY,
      app.rpx(26),
      th.muted
    );
  } else {
    var slideW = Sw.slideW != null ? Sw.slideW : Sw.width;
    var knobLeft = Sw.left + Sw.margin + app.adminPuzzlePublishSwipePx;
    var slideRight = Sw.left + slideW;
    var labelLeft = slideRight + app.rpx(4);
    var labelRight = Sw.left + Sw.width - Sw.margin;
    var labelW = labelRight - labelLeft;

    app.ctx.fillStyle = 'rgba(0,0,0,0.08)';
    app.roundRect(Sw.left, Sw.top, Sw.width, Sw.height, app.rpx(12));
    app.ctx.fill();

    app.ctx.fillStyle = 'rgba(0,0,0,0.06)';
    app.roundRect(Sw.left, Sw.top, slideW, Sw.height, app.rpx(12));
    app.ctx.fill();

    var fillW = Math.min(
      slideW,
      Sw.margin + app.adminPuzzlePublishSwipePx + Sw.knobW * 0.45
    );
    if (fillW > app.rpx(4)) {
      app.ctx.fillStyle = 'rgba(76, 175, 80, 0.22)';
      app.roundRect(Sw.left, Sw.top, fillW, Sw.height, app.rpx(12));
      app.ctx.fill();
    }

    if (labelW > app.rpx(48)) {
      app.ctx.fillStyle = 'rgba(255,255,255,0.62)';
      app.roundRect(
        labelLeft,
        Sw.top + app.rpx(2),
        labelW,
        Sw.height - app.rpx(4),
        app.rpx(10)
      );
      app.ctx.fill();
      render.drawText(
        app.ctx,
        '发布到题库并绑定排期',
        (labelLeft + labelRight) * 0.5,
        pubY,
        labelW < app.rpx(260) ? app.rpx(16) : app.rpx(18),
        th.muted
      );
    }

    app.ctx.fillStyle = 'rgba(76, 175, 80, 0.98)';
    app.roundRect(
      knobLeft,
      pubY - Sw.knobW * 0.5,
      Sw.knobW,
      Sw.knobW,
      app.rpx(12)
    );
    app.ctx.fill();
    render.drawText(
      app.ctx,
      '››',
      knobLeft + Sw.knobW * 0.5,
      pubY,
      app.rpx(24),
      '#FFFFFF',
      'normal'
    );
  }
  app.ctx.restore();
  if (app.adminPuzzleSchedulePickerOpen) {
    app.drawAdminPuzzleSchedulePickerOverlay(th);
  }
};

app.hitAdminPuzzleUi = function(clientX, clientY) {
  var metaBar = app.getAdminPuzzleMetaBarLayout();
  if (metaBar) {
    if (
      clientY >= metaBar.top - 2 &&
      clientY <= metaBar.top + metaBar.h + 2
    ) {
      if (
        clientX >= metaBar.leftTitle - 2 &&
        clientX <= metaBar.leftTitle + metaBar.wTitle + 2
      ) {
        return 'edit_title';
      }
      if (
        clientX >= metaBar.leftSched - 2 &&
        clientX <= metaBar.leftSched + metaBar.wSched + 2
      ) {
        return 'edit_schedule';
      }
    }
  }
  var L = app.getAdminPuzzleFooterLayout();
  var pad = L.pad;
  var half = L.halfW;
  var xL = pad + half * 0.5;
  var xR = app.W - pad - half * 0.5;
  function inBtn(cx, cy, bw, bh) {
    return (
      Math.abs(clientX - cx) <= bw * 0.5 + 4 &&
      Math.abs(clientY - cy) <= bh * 0.5 + 6
    );
  }
  if (inBtn(xL, L.yBack + L.btnH * 0.5, half, L.btnH)) {
    return 'back';
  }
  if (inBtn(xR, L.yBack + L.btnH * 0.5, half, L.btnH)) {
    return 'clear';
  }
  if (inBtn(xL, L.yRow2 + L.btnH * 0.5, half, L.btnH)) {
    return 'side_black';
  }
  if (inBtn(xR, L.yRow2 + L.btnH * 0.5, half, L.btnH)) {
    return 'side_white';
  }
  if (
    clientX >= L.pad - 2 &&
    clientX <= L.pad + L.fullW + 2 &&
    clientY >= L.yInvite - 2 &&
    clientY <= L.yInvite + L.btnH + 2
  ) {
    return 'invite_friend';
  }
  return null;
};

app.handleAdminPuzzleTouchStart = function(clientX, clientY, touchId) {
  if (app.adminPuzzleSchedulePickerOpen) {
    return;
  }
  if (app.adminPuzzleSaving) {
    return;
  }
  var L = app.getAdminPuzzleFooterLayout();
  var M = app.getAdminPuzzlePublishSwipeMetrics(L);
  if (
    clientX >= M.left - 2 &&
    clientX <= M.left + M.width + 2 &&
    clientY >= M.top - 10 &&
    clientY <= M.top + M.height + 10
  ) {
    app.adminPuzzlePublishSwipeTouchId = touchId;
    app.adminPuzzlePublishSwipeStartClientX = clientX;
    app.adminPuzzlePublishSwipeStartOffsetPx = app.adminPuzzlePublishSwipePx;
  }
};

app.handleAdminPuzzleTouchMove = function(e) {
  if (app.adminPuzzleSchedulePickerOpen) {
    return false;
  }
  if (app.adminPuzzlePublishSwipeTouchId == null) {
    return false;
  }
  var touches = e.touches;
  if (!touches || !touches.length) {
    return false;
  }
  var ti;
  var t = null;
  for (ti = 0; ti < touches.length; ti++) {
    if (touches[ti].identifier === app.adminPuzzlePublishSwipeTouchId) {
      t = touches[ti];
      break;
    }
  }
  if (!t) {
    return false;
  }
  var L = app.getAdminPuzzleFooterLayout();
  var M = app.getAdminPuzzlePublishSwipeMetrics(L);
  var dx = t.clientX - app.adminPuzzlePublishSwipeStartClientX;
  var next = app.adminPuzzlePublishSwipeStartOffsetPx + dx;
  if (next < 0) {
    next = 0;
  }
  if (next > M.travel) {
    next = M.travel;
  }
  app.adminPuzzlePublishSwipePx = next;
  app.draw();
  return true;
};

app.handleAdminPuzzleTouchEnd = function(clientX, clientY, touchId) {
  if (app.adminPuzzleSchedulePickerOpen) {
    app.handleAdminSchedulePickerTouchEnd(clientX, clientY);
    return;
  }
  if (
    app.adminPuzzlePublishSwipeTouchId != null &&
    touchId === app.adminPuzzlePublishSwipeTouchId
  ) {
    var L = app.getAdminPuzzleFooterLayout();
    var M = app.getAdminPuzzlePublishSwipeMetrics(L);
    var threshold = M.travel * 0.82;
    var shouldPublish =
      M.travel > 0 && app.adminPuzzlePublishSwipePx >= threshold;
    app.adminPuzzlePublishSwipeTouchId = null;
    app.adminPuzzlePublishSwipePx = 0;
    if (shouldPublish) {
      app.submitAdminDailyPuzzle();
    } else {
      app.draw();
    }
    return;
  }
  var ui = app.hitAdminPuzzleUi(clientX, clientY);
  if (ui === 'back') {
    app.exitAdminPuzzleScreen();
    return;
  }
  if (ui === 'clear') {
    var r;
    var c;
    for (r = 0; r < app.SIZE; r++) {
      for (c = 0; c < app.SIZE; c++) {
        app.adminDraftBoard[r][c] = gomoku.EMPTY;
      }
    }
    app.draw();
    return;
  }
  if (ui === 'side_black') {
    app.adminPuzzleSideToMove = app.BLACK;
    app.draw();
    return;
  }
  if (ui === 'side_white') {
    app.adminPuzzleSideToMove = app.WHITE;
    app.draw();
    return;
  }
  if (ui === 'invite_friend') {
    if (typeof app.startPuzzleFriendInvite === 'function') {
      app.startPuzzleFriendInvite();
    }
    return;
  }
  if (ui === 'edit_title') {
    if (typeof wx.showModal !== 'function') {
      return;
    }
    var canEdit = !wx.canIUse || wx.canIUse('showModal.object.editable');
    if (canEdit) {
      wx.showModal({
        title: '题目标题',
        editable: true,
        placeholderText: app.adminPuzzleTitle || '新残局',
        success: function (res) {
          if (res.confirm && res.content != null) {
            app.adminPuzzleTitle =
              String(res.content).trim() || app.adminPuzzleTitle;
          }
          app.draw();
        }
      });
    }
    return;
  }
  if (ui === 'edit_schedule') {
    app.openAdminSchedulePicker();
    return;
  }
  if (!app.onBoard(clientX, clientY)) {
    return;
  }
  var cell = app.pixelToCell(clientX, clientY);
  if (!cell) {
    return;
  }
  var v = app.adminDraftBoard[cell.r][cell.c];
  var next = v === gomoku.EMPTY ? app.BLACK : v === app.BLACK ? app.WHITE : gomoku.EMPTY;
  app.adminDraftBoard[cell.r][cell.c] = next;
  if (typeof app.playPlaceStoneSound === 'function') {
    app.playPlaceStoneSound();
  }
  app.draw();
};

app.submitAdminDailyPuzzle = function() {
  if (app.adminPuzzleSaving) {
    return;
  }
  authApi.ensureSession(function (ok) {
    if (!ok || !authApi.getSessionToken()) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '请先登录', icon: 'none' });
      }
      return;
    }
    var i;
    var j;
    var grid = [];
    for (i = 0; i < app.SIZE; i++) {
      grid[i] = [];
      for (j = 0; j < app.SIZE; j++) {
        grid[i][j] = app.adminDraftBoard[i][j];
      }
    }
    var body = {
      title: app.adminPuzzleTitle || '新残局',
      difficulty: 3,
      boardSize: 15,
      board: grid,
      sideToMove: app.adminPuzzleSideToMove,
      goal: 'WIN',
      status: 1
    };
    if (app.adminPuzzleScheduleDate) {
      body.scheduleDate = app.adminPuzzleScheduleDate;
    }
    app.adminPuzzleSaving = true;
    app.draw();
    wx.request(
      Object.assign(roomApi.adminDailyPuzzleCreateOptions(body), {
        success: function (res) {
          app.adminPuzzleSaving = false;
          app.draw();
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (e1) {
              d = null;
            }
          }
          if (res.statusCode === 200 && d && d.id != null) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '已发布 id=' + d.id, icon: 'none' });
            }
            app.exitAdminPuzzleScreen();
            return;
          }
          var msg =
            d && d.message
              ? d.message
              : '发布失败 ' + (res.statusCode || '');
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: msg.slice(0, 18), icon: 'none' });
          }
        },
        fail: function () {
          app.adminPuzzleSaving = false;
          app.draw();
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        }
      })
    );
  });
};

function fetchAdminStatusFromServer() {
  authApi.ensureSession(function (ok) {
    if (!ok || !authApi.getSessionToken()) {
      return;
    }
    wx.request(
      Object.assign(roomApi.meAdminStatusOptions(), {
        success: function (res) {
          var d = res.data;
          if (d && typeof d === 'string') {
            try {
              d = JSON.parse(d);
            } catch (e2) {
              d = null;
            }
          }
          if (res.statusCode === 200 && d && typeof d.admin === 'boolean') {
            app.userIsAdmin = d.admin === true;
          }
          app.draw();
        }
      })
    );
  });
}

app.refreshAdminStatus = fetchAdminStatusFromServer;
[600, 2000, 4500].forEach(function (ms) {
  setTimeout(fetchAdminStatusFromServer, ms);
});
};
