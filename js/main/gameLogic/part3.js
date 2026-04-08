/**
 * Auto-split from gameLogic.js (part 3)
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

app.checkinModalShiftMonth = function(vy, vm, delta) {
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
}

/** 可浏览：最近 12 个月至当月（不含未来） */
app.checkinModalMonthInRange = function(vy, vm) {
  if (vm < 1 || vm > 12) {
    return false;
  }
  var now = new Date();
  var ty = now.getFullYear();
  var tm = now.getMonth() + 1;
  var cur = ty * 12 + (tm - 1);
  var min = cur - 11;
  var t = vy * 12 + (vm - 1);
  return t >= min && t <= cur;
}

app.checkinModalCanGoNextMonth = function(viewYear, viewMonth) {
  var n = app.checkinModalShiftMonth(viewYear, viewMonth, 1);
  return app.checkinModalMonthInRange(n.y, n.m);
}

app.checkinModalCanGoPrevMonth = function(viewYear, viewMonth) {
  var p = app.checkinModalShiftMonth(viewYear, viewMonth, -1);
  return app.checkinModalMonthInRange(p.y, p.m);
}

app.hitCheckinModalInside = function(x, y) {
  var L = app.getCheckinModalLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  return x >= x0 && x <= x0 + L.w && y >= y0 && y <= y0 + L.h;
}

app.hitCheckinModalHeaderClose = function(x, y) {
  var L = app.getCheckinModalLayout();
  var rr = app.rpx(22);
  var cx = L.headCloseCx;
  var cy = L.headCloseCy;
  return (
    Math.abs(x - cx) <= rr && Math.abs(y - cy) <= rr
  );
}

app.hitCheckinModalPrimaryBtn = function(x, y) {
  var L = app.getCheckinModalLayout();
  var bx = L.cx - L.primaryBtnW / 2;
  return (
    x >= bx &&
    x <= bx + L.primaryBtnW &&
    y >= L.primaryY &&
    y <= L.primaryY + L.primaryBtnH
  );
}

app.hitCheckinModalPrevMonth = function(x, y) {
  var L = app.getCheckinModalLayout();
  var h = L.prevMonthHit;
  return (
    x >= h.x &&
    x <= h.x + h.w &&
    y >= h.y &&
    y <= h.y + h.h
  );
}

app.hitCheckinModalNextMonth = function(x, y) {
  var L = app.getCheckinModalLayout();
  var h = L.nextMonthHit;
  return (
    x >= h.x &&
    x <= h.x + h.w &&
    y >= h.y &&
    y <= h.y + h.h
  );
}

/** 签到月历：左右切换箭头（圆底 + 折线） */
app.drawCheckinMonthArrow = function(cx, cy, dir, ref, enabled) {
  var rr = app.rpx(21);
  app.ctx.save();
  app.ctx.beginPath();
  app.ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  app.ctx.fillStyle = enabled ? ref.arrowFillHi : ref.arrowFillLo;
  app.ctx.fill();
  if (enabled) {
    app.ctx.strokeStyle = ref.boardLine;
    app.ctx.globalAlpha = 0.5;
    app.ctx.lineWidth = 1;
    app.ctx.stroke();
    app.ctx.globalAlpha = 1;
  }
  app.ctx.strokeStyle = enabled ? ref.navAccent : ref.dayMuted;
  app.ctx.lineWidth = app.rpx(2.5);
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  var s = app.rpx(8);
  app.ctx.beginPath();
  if (dir < 0) {
    app.ctx.moveTo(cx + s * 0.25, cy - s * 0.75);
    app.ctx.lineTo(cx - s * 0.45, cy);
    app.ctx.lineTo(cx + s * 0.25, cy + s * 0.75);
  } else {
    app.ctx.moveTo(cx - s * 0.25, cy - s * 0.75);
    app.ctx.lineTo(cx + s * 0.45, cy);
    app.ctx.lineTo(cx - s * 0.25, cy + s * 0.75);
  }
  app.ctx.stroke();
  app.ctx.restore();
}

app.drawCheckinCalendarMonth = function(th, L, d, ref) {
  var viewYear = d.viewYear;
  var viewMonth = d.viewMonth;
  var stCal = app.getCheckinState();
  var historySet = (stCal && stCal.historySet) || {};
  var now = new Date();
  var ty = now.getFullYear();
  var tm = now.getMonth() + 1;
  var td = now.getDate();

  var navTop = L.calTop + L.calInnerPad;
  var navMidY = navTop + L.monthNavH * 0.5;
  var canPrev = app.checkinModalCanGoPrevMonth(viewYear, viewMonth);
  var canNext = app.checkinModalCanGoNextMonth(viewYear, viewMonth);
  var leftAx = L.calLeft + L.calInnerPad + app.rpx(38);
  var rightAx = L.calLeft + L.calW - L.calInnerPad - app.rpx(38);
  app.drawCheckinMonthArrow(leftAx, navMidY, -1, ref, canPrev);
  app.drawCheckinMonthArrow(rightAx, navMidY, 1, ref, canNext);

  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    '600 ' +
    app.rpx(33) +
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
    app.rpx(23) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ref.weekLabel;
  app.ctx.textBaseline = 'middle';
  var gridTotalW = 7 * L.cell + 6 * L.rowGap;
  var gridLeft = L.cx - gridTotalW / 2;
  var c;
  for (c = 0; c < 7; c++) {
    var tcx = gridLeft + c * (L.cell + L.rowGap) + L.cell / 2;
    app.ctx.textAlign = 'center';
    app.ctx.fillText(
      labels[c],
      app.snapPx(tcx),
      app.snapPx(weekTop + L.weekH * 0.5)
    );
  }

  var first = new Date(viewYear, viewMonth - 1, 1);
  var firstSun0 = first.getDay();
  var dim = new Date(viewYear, viewMonth, 0).getDate();
  var gridTop = weekTop + L.weekH + app.rpx(10);
  var slotW = L.cell;
  var slotH = L.cell - app.rpx(1);
  var cellR = app.rpx(6);
  var dayNum = 1;
  var i;
  for (i = 0; i < 42; i++) {
    var row = Math.floor(i / 7);
    var col = i % 7;
    var cxCell = gridLeft + col * (L.cell + L.rowGap) + L.cell / 2;
    var cyCell = gridTop + row * (L.cell + L.rowGap) + L.cell / 2;
    var bx0 = cxCell - slotW * 0.48;
    var by0 = cyCell - slotH * 0.48;
    var bw = slotW * 0.96;
    var bh = slotH * 0.96;

    if (i < firstSun0 || dayNum > dim) {
      continue;
    }

    var isFuture =
      viewYear > ty ||
      (viewYear === ty && viewMonth > tm) ||
      (viewYear === ty && viewMonth === tm && dayNum > td);
    var key = app.formatCheckinYmdKey(viewYear, viewMonth, dayNum);
    var signed = !!historySet[key];
    var isToday =
      viewYear === ty && viewMonth === tm && dayNum === td;

    app.ctx.save();
    if (signed) {
      app.ctx.fillStyle = ref.signedCellBg;
      app.roundRect(bx0, by0, bw, bh, cellR);
      app.ctx.fill();
      app.ctx.fillStyle = ref.signedCellText;
      app.ctx.font =
        '600 ' +
        app.rpx(27) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(String(dayNum), app.snapPx(cxCell), app.snapPx(cyCell));
    } else {
      app.ctx.fillStyle = isFuture ? ref.dayMuted : ref.dayNumStrong;
      app.ctx.font =
        '600 ' +
        app.rpx(27) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.globalAlpha = isFuture ? 0.45 : 1;
      app.ctx.fillText(String(dayNum), app.snapPx(cxCell), app.snapPx(cyCell));
      app.ctx.globalAlpha = 1;
    }
    if (isToday) {
      app.ctx.strokeStyle = ref.todayRing;
      app.ctx.lineWidth = app.rpx(2.75);
      app.roundRect(bx0 - app.rpx(1), by0 - app.rpx(1), bw + app.rpx(2), bh + app.rpx(2), cellR + app.rpx(1));
      app.ctx.stroke();
    }
    app.ctx.restore();

    dayNum++;
  }
}

app.drawCheckinModalOverlay = function(th) {
  if (!app.checkinModalVisible || !app.checkinModalData || app.screen !== 'home') {
    return;
  }
  var d = app.checkinModalData;
  if (!d.viewYear || !d.viewMonth) {
    var fixD = new Date();
    d.viewYear = fixD.getFullYear();
    d.viewMonth = fixD.getMonth() + 1;
  }
  var L = app.getCheckinModalLayout();
  var ref = app.checkinModalThemePalette(th);
  var checkinShellThemeId = th.id || 'classic';
  var x = L.cx - L.w / 2;
  var y = L.cy - L.h / 2;
  var doneToday = app.isHomeCheckinDoneToday();

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

  app.ctx.strokeStyle =
    checkinShellThemeId === 'ink'
      ? 'rgba(255, 248, 240, 0.4)'
      : 'rgba(255,255,255,0.55)';
  app.ctx.lineWidth = app.rpx(2);
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.stroke();

  var titleCy = y + L.topPad + L.headerBandH * 0.5;
  var titleFs = Math.max(1, Math.round(app.rpx(32)));
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font =
    '700 ' +
    titleFs +
    'px -apple-system, "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = ref.titleFill;
  app.ctx.fillText('团团每日签到', app.snapPx(L.cx), app.snapPx(titleCy));

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

  app.drawCheckinCalendarMonth(th, L, d, ref);

  var px0 = L.cx - L.primaryBtnW / 2;
  var py0 = L.primaryY;
  app.ctx.shadowColor = ref.modalShadow;
  app.ctx.shadowBlur = app.rpx(14);
  app.ctx.shadowOffsetY = app.rpx(6);
  var pGrad = app.ctx.createLinearGradient(px0, py0, px0, py0 + L.primaryBtnH);
  pGrad.addColorStop(0, ref.primary0);
  pGrad.addColorStop(0.5, ref.primary1);
  pGrad.addColorStop(1, ref.primary2);
  app.ctx.fillStyle = doneToday ? ref.primaryDisabled : pGrad;
  app.roundRect(px0, py0, L.primaryBtnW, L.primaryBtnH, L.primaryBtnH * 0.5);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  if (!doneToday) {
    var shine = app.ctx.createLinearGradient(px0, py0, px0, py0 + L.primaryBtnH);
    shine.addColorStop(0, ref.primaryShine);
    shine.addColorStop(0.45, 'rgba(255,255,255,0)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    app.ctx.fillStyle = shine;
    app.roundRect(px0, py0, L.primaryBtnW, L.primaryBtnH * 0.42, L.primaryBtnH * 0.5);
    app.ctx.fill();
    app.ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    app.ctx.lineWidth = 1;
    app.roundRect(px0, py0, L.primaryBtnW, L.primaryBtnH, L.primaryBtnH * 0.5);
    app.ctx.stroke();
  }
  app.ctx.font =
    '600 ' +
    app.rpx(30) +
    'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = doneToday ? ref.primaryDisabledText : '#ffffff';
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(
    doneToday ? '今日已签' : '今日签到',
    app.snapPx(L.cx),
    app.snapPx(py0 + L.primaryBtnH * 0.5)
  );

  app.ctx.restore();
}

app.drawRatingCardOverlay = function(th) {
  if (!app.ratingCardVisible || !app.ratingCardData) {
    return;
  }
  var d = app.ratingCardData;
  var L = app.getRatingCardLayout();
  var x = L.cx - L.w / 2;
  var y = L.cy - L.h / 2;

  app.ctx.save();
  app.ctx.fillStyle = 'rgba(0,0,0,0.48)';
  app.ctx.fillRect(0, 0, app.W, app.H);

  app.ctx.shadowColor = 'rgba(0,0,0,0.18)';
  app.ctx.shadowBlur = 28;
  app.ctx.shadowOffsetY = 10;
  app.ctx.fillStyle = 'rgba(255,255,255,0.97)';
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;

  app.ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  app.ctx.lineWidth = 1;
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.stroke();

  var apVal =
    typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)
      ? Math.max(0, Math.floor(d.activityPoints))
      : 0;

  var crClose = app.rpx(36);
  var padClose = app.rpx(32);
  var closeCx = x + L.w - padClose - crClose / 2;
  var closeCy = y + padClose + crClose / 2;

  var titleBlock = 0;
  var titleCx = L.cx;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  if (d.cardTitle) {
    app.ctx.font =
      'bold 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.fillStyle = th.title;
    app.ctx.fillText(d.cardTitle, app.snapPx(titleCx), app.snapPx(closeCy));
    titleBlock = closeCy - y + 12;
  }
  if (d.nicknameLine) {
    app.ctx.font = '12px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.fillStyle = th.muted;
    var nickCy = d.cardTitle ? closeCy + 18 : closeCy;
    app.ctx.fillText(d.nicknameLine, app.snapPx(titleCx), app.snapPx(nickCy));
    titleBlock = nickCy - y + 10;
  }

  var showActivityPoints = d.showActivityPoints !== false;

  var contentBottomPad = 18;
  var gapAboveContent = 14;
  var availH =
    y + L.h - contentBottomPad - gapAboveContent - y - titleBlock;
  var row1H = 28;
  var sectGap = 9;
  var threeColInnerH = 48;
  var contentBlockH = showActivityPoints
    ? row1H + sectGap * 2 + threeColInnerH
    : sectGap + threeColInnerH;
  var rowTop = y + titleBlock + (availH - contentBlockH) / 2;
  if (rowTop < y + 10 + titleBlock) {
    rowTop = y + 10 + titleBlock;
  }
  /** 横线分隔团团积分与三列统计；对手战绩不展示团团积分 */
  var accent =
    th.homeCards && th.homeCards[0] ? String(th.homeCards[0]) : '#6b4a38';
  var padX = 16;
  var lineX0 = x + 14;
  var lineX1 = x + L.w - 14;

  function drawRatingCardHLine(yLine) {
    app.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    app.ctx.lineWidth = 1;
    app.ctx.beginPath();
    app.ctx.moveTo(app.snapPx(lineX0), app.snapPx(yLine));
    app.ctx.lineTo(app.snapPx(lineX1), app.snapPx(yLine));
    app.ctx.stroke();
  }

  var threeTop;
  if (showActivityPoints) {
    var r1Mid = rowTop + row1H * 0.5;
    var labelX = x + padX;
    var gapLabelToPoints = 10;
    app.ctx.textAlign = 'left';
    app.ctx.textBaseline = 'middle';
    app.ctx.font = '600 12px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.fillStyle = accent;
    var tuanLabelW = app.ctx.measureText('团团积分').width;
    app.ctx.fillText('团团积分', app.snapPx(labelX), app.snapPx(r1Mid));
    app.ctx.font = 'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
    app.ctx.fillStyle = th.title;
    app.ctx.fillText(
      String(apVal),
      app.snapPx(labelX + tuanLabelW + gapLabelToPoints),
      app.snapPx(r1Mid)
    );

    var line1Y = rowTop + row1H + sectGap;
    drawRatingCardHLine(line1Y);
    threeTop = line1Y + sectGap;
  } else {
    threeTop = rowTop + sectGap;
  }
  var c1 = x + L.w / 6;
  var c2 = x + L.w / 2;
  var c3 = x + (5 * L.w) / 6;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'top';
  app.ctx.font = '12px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = th.muted;
  app.ctx.fillText('得分', app.snapPx(c1), app.snapPx(threeTop));
  app.ctx.fillText('胜率', app.snapPx(c2), app.snapPx(threeTop));
  app.ctx.fillText('称号', app.snapPx(c3), app.snapPx(threeTop));

  app.ctx.font = 'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = th.title;
  app.ctx.fillText(String(d.elo), app.snapPx(c1), app.snapPx(threeTop + 20));
  app.ctx.fillText(d.winPctDisplay, app.snapPx(c2), app.snapPx(threeTop + 20));
  app.ctx.font = 'bold 15px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillText(d.titleName, app.snapPx(c3), app.snapPx(threeTop + 20));

  app.ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  app.ctx.lineWidth = 1;
  var divTop = threeTop + 6;
  var divBot = threeTop + 42;
  for (var dx = 1; dx <= 2; dx++) {
    app.ctx.beginPath();
    app.ctx.moveTo(x + (dx * L.w) / 3 - 0.5, divTop);
    app.ctx.lineTo(x + (dx * L.w) / 3 - 0.5, divBot);
    app.ctx.stroke();
  }

  app.ctx.font = 'bold ' + app.rpx(34) + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = 'rgba(92,75,58,0.38)';
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('×', app.snapPx(closeCx), app.snapPx(closeCy));

  app.ctx.restore();
}

/**
 * 将 /api/me/rating 或 /api/rooms/opponent-rating 的 JSON 填入战绩卡片
 * opts: { cardTitle, nicknameLine, usePayloadNickname, hideActivityPoints（对手卡为 true） }
 */
app.fillRatingCardFromApiData = function(d, opts) {
  opts = opts || {};
  var cardTitle =
    (opts.cardTitle && String(opts.cardTitle).trim()) || '信息看板';
  var nicknameLine = opts.nicknameLine;
  if (nicknameLine === undefined) {
    if (opts.usePayloadNickname) {
      nicknameLine =
        typeof d.nickname === 'string' && d.nickname.trim()
          ? d.nickname.trim()
          : '';
    } else {
      nicknameLine = '';
    }
  }
  var elo = typeof d.eloScore === 'number' ? d.eloScore : 0;
  app.savePeakEloIfHigher(elo);
  var total = typeof d.totalGames === 'number' ? d.totalGames : 0;
  var win = typeof d.winCount === 'number' ? d.winCount : 0;
  var rt = ratingTitle.getRankAndTitleByElo(elo);
  var winPctDisplay;
  var noGames = total <= 0;
  if (noGames) {
    winPctDisplay = '—';
  } else {
    var pct = Math.round((win * 1000) / total) / 10;
    winPctDisplay = pct + '%';
  }
  var ap =
    typeof d.activityPoints === 'number' && !isNaN(d.activityPoints)
      ? Math.max(0, Math.floor(d.activityPoints))
      : 0;
  app.ratingCardData = {
    cardTitle: cardTitle,
    nicknameLine: nicknameLine,
    elo: elo,
    titleName: rt.titleName,
    winPctDisplay: winPctDisplay,
    win: win,
    total: total,
    noGames: noGames,
    activityPoints: ap,
    showActivityPoints: !opts.hideActivityPoints
  };
  app.homeRatingEloCache = elo;
}

/** 拉取天梯数据并在画布上展示战绩卡片（依赖已登录 sessionToken） */
app.showMyRatingModal = function() {
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  if (app.ratingFetchInFlight) {
    return;
  }
  app.ratingFetchInFlight = true;
  if (typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载中…', mask: true });
  }
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
      success: function (res) {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        app.ratingFetchInFlight = false;
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '获取失败', icon: 'none' });
          }
          return;
        }
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (pe) {
            d = null;
          }
        }
        if (!d) {
          return;
        }
        app.syncCheckinStateFromServerPayload(d);
        app.applyMyGenderFromRatingPayload(d);
        if (typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
          app.loadMyNetworkAvatar(d.avatarUrl.trim());
        }
        app.fillRatingCardFromApiData(d, {});
        app.ratingCardVisible = true;
        app.draw();
      },
      fail: function () {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        app.ratingFetchInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    })
  );
}

/** 联机对局中：拉取当前房间对手的公开天梯 */
app.showOpponentRatingModal = function() {
  if (!app.isPvpOnline || !app.onlineRoomId) {
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  if (app.ratingFetchInFlight) {
    return;
  }
  app.ratingFetchInFlight = true;
  if (typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载中…', mask: true });
  }
  wx.request(
    Object.assign(roomApi.roomOpponentRatingOptions(app.onlineRoomId), {
      success: function (res) {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        app.ratingFetchInFlight = false;
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode === 404 || res.statusCode === 403) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: res.statusCode === 403 ? '无法查看' : '暂无对手数据',
              icon: 'none'
            });
          }
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '获取失败', icon: 'none' });
          }
          return;
        }
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (pe2) {
            d = null;
          }
        }
        if (!d) {
          return;
        }
        app.applyOnlineOpponentProfilePayload(d);
        app.fillRatingCardFromApiData(d, {
          cardTitle: '对手战绩',
          usePayloadNickname: true,
          hideActivityPoints: true
        });
        app.ratingCardVisible = true;
        app.draw();
      },
      fail: function () {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        app.ratingFetchInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    })
  );
}

/** 我的战绩列表：点击对手头像，按 userId 拉取公开天梯（不写入联机对手缓存） */
app.showHistoryOpponentRatingModal = function(opponentUserId) {
  if (!opponentUserId || app.ratingFetchInFlight) {
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  app.ratingFetchInFlight = true;
  if (typeof wx.showLoading === 'function') {
    wx.showLoading({ title: '加载中…', mask: true });
  }
  wx.request(
    Object.assign(app.getUserRatingByUserIdRequestOptions(opponentUserId), {
      success: function (res) {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        app.ratingFetchInFlight = false;
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode === 404 || res.statusCode === 400) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '暂无该对手数据', icon: 'none' });
          }
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '获取失败', icon: 'none' });
          }
          return;
        }
        var d = res.data;
        if (d && typeof d === 'string') {
          try {
            d = JSON.parse(d);
          } catch (pe3) {
            d = null;
          }
        }
        if (!d) {
          return;
        }
        app.fillRatingCardFromApiData(d, {
          cardTitle: '对手战绩',
          usePayloadNickname: true,
          hideActivityPoints: true
        });
        app.ratingCardVisible = true;
        app.draw();
      },
      fail: function () {
        if (typeof wx.hideLoading === 'function') {
          wx.hideLoading();
        }
        app.ratingFetchInFlight = false;
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    })
  );
}

/** 各页右上角「风格」：胶囊下按钮（首页改从侧栏「界面风格」切换） */
app.getThemeEntryLayout = function() {
  var sb = app.sys.statusBarHeight || 24;
  var safeTop =
    app.sys.safeArea && app.sys.safeArea.top != null ? app.sys.safeArea.top : 0;
  var insetTop = Math.max(sb, safeTop);
  var belowCapsule = 38;
  var topPad = insetTop + belowCapsule;
  var w = 60;
  var h = 32;
  var padR = 12;
  var cx = app.W - padR - w / 2;
  var cy = topPad + h / 2;
  return { cx: cx, cy: cy, w: w, h: h, r: 16 };
}

app.drawThemeEntry = function(th) {
  var L = app.getThemeEntryLayout();
  var x0 = L.cx - L.w / 2;
  var y0 = L.cy - L.h / 2;
  app.ctx.shadowColor = 'rgba(0,0,0,0.1)';
  app.ctx.shadowBlur = 14;
  app.ctx.shadowOffsetX = 0;
  app.ctx.shadowOffsetY = 3;
  var glass = app.ctx.createLinearGradient(x0, y0, x0 + L.w, y0 + L.h);
  glass.addColorStop(0, 'rgba(255,255,255,0.92)');
  glass.addColorStop(1, 'rgba(255,255,255,0.72)');
  app.ctx.fillStyle = glass;
  app.ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  app.ctx.lineWidth = 1.2;
  app.roundRect(x0, y0, L.w, L.h, L.r);
  app.ctx.fill();
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.font =
    'bold 14px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = th.title;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('风格', app.snapPx(L.cx), app.snapPx(L.cy));
}

/** 风格名称气泡：在「风格」按钮左侧，配色随当前主题；app.themeBubbleAlpha 控制渐隐 */
app.drawThemeBubble = function(th) {
  if (!app.themeBubbleText || app.themeBubbleAlpha <= 0) {
    return;
  }
  if (app.screen === 'home') {
    return;
  }
  if (!app.themeScreenShowsStyleEntry()) {
    return;
  }
  var L = app.getThemeEntryLayout();
  var padX = 12;
  app.ctx.font =
    '14px "PingFang SC","Hiragino Sans GB",sans-serif';
  var tw = app.ctx.measureText(app.themeBubbleText).width;
  var bw = Math.ceil(tw + padX * 2);
  var bh = 34;
  var gap = 8;
  var tail = 8;
  var btnLeft = L.cx - L.w / 2;
  var bubbleRight = btnLeft - gap;
  var x = bubbleRight - bw - tail;
  if (x < 10) {
    x = 10;
    bw = Math.max(60, bubbleRight - tail - x);
  }
  var y = L.cy - bh / 2;

  app.ctx.save();
  app.ctx.globalAlpha = app.themeBubbleAlpha;
  app.ctx.shadowColor = 'rgba(0,0,0,0.08)';
  app.ctx.shadowBlur = 12;
  app.ctx.shadowOffsetY = 2;
  app.ctx.fillStyle = th.btnGhostFill;
  app.ctx.strokeStyle = th.btnPrimaryStroke;
  app.ctx.lineWidth = 1.5;
  app.roundRect(x, y, bw, bh, 10);
  app.ctx.fill();
  app.ctx.stroke();
  app.ctx.beginPath();
  app.ctx.moveTo(x + bw, y + bh * 0.32);
  app.ctx.lineTo(x + bw + tail, L.cy);
  app.ctx.lineTo(x + bw, y + bh * 0.68);
  app.ctx.closePath();
  app.ctx.fillStyle = th.btnGhostFill;
  app.ctx.fill();
  app.ctx.strokeStyle = th.btnPrimaryStroke;
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.fillStyle = th.title;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(app.themeBubbleText, app.snapPx(x + bw / 2), app.snapPx(L.cy));
  app.ctx.restore();
}

app.themeBubbleRaf = function(fn) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(fn);
  }
  if (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function') {
    return wx.requestAnimationFrame(fn);
  }
  return setTimeout(fn, 16);
}

app.themeBubbleCaf = function(id) {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
  } else if (typeof wx !== 'undefined' && typeof wx.cancelAnimationFrame === 'function') {
    wx.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

app.stopThemeBubbleAnim = function() {
  if (app.themeBubbleRafId != null) {
    app.themeBubbleCaf(app.themeBubbleRafId);
    app.themeBubbleRafId = null;
  }
}

/** 停留后线性淡出，结束时清空文案 */
app.startThemeBubbleFadeAnim = function() {
  app.stopThemeBubbleAnim();
  app.themeBubbleAlpha = 1;
  var holdMs = 400;
  var fadeMs = 600;
  var t0 = Date.now();
  function frame() {
    if (!app.themeScreenShowsStyleEntry() || !app.themeBubbleText) {
      app.themeBubbleText = '';
      app.themeBubbleAlpha = 1;
      app.themeBubbleRafId = null;
      app.draw();
      return;
    }
    var e = Date.now() - t0;
    if (e < holdMs) {
      app.themeBubbleAlpha = 1;
    } else if (e < holdMs + fadeMs) {
      app.themeBubbleAlpha = 1 - (e - holdMs) / fadeMs;
    } else {
      app.themeBubbleText = '';
      app.themeBubbleAlpha = 1;
      app.themeBubbleRafId = null;
      app.draw();
      return;
    }
    app.draw();
    app.themeBubbleRafId = app.themeBubbleRaf(frame);
  }
  app.themeBubbleRafId = app.themeBubbleRaf(frame);
}

/**
 * 是否参与「风格」气泡/点击逻辑；右上角胶囊仅在非首页且此处为 true 时绘制。
 * 回放页不显示风格按钮（棋盘固定檀木，与界面主题切换无关）。
 */
app.themeScreenShowsStyleEntry = function() {
  return app.screen === 'home';
}

app.drawThemeChrome = function(th) {
  app.drawThemeBubble(th);
  if (app.screen !== 'home' && app.themeScreenShowsStyleEntry()) {
    app.drawThemeEntry(th);
  }
}

app.hitThemeEntry = function(clientX, clientY) {
  var L = app.getThemeEntryLayout();
  return (
    Math.abs(clientX - L.cx) <= L.w / 2 + 10 &&
    Math.abs(clientY - L.cy) <= L.h / 2 + 10
  );
}

app.getPveColorLayout = function() {
  var btnW = Math.min(app.W - 48, 300);
  var btnH = 54;
  var cx = app.W / 2;
  return {
    btnW: btnW,
    btnH: btnH,
    cx: cx,
    yBlack: app.H * 0.4,
    yWhite: app.H * 0.52,
    backY: app.H * 0.66
  };
}

app.pixelToCell = function(clientX, clientY) {
  var cell = app.layout.cell;
  var ox = app.layout.originX;
  var oy = app.layout.originY;
  var c = Math.round((clientX - ox) / cell);
  var r = Math.round((clientY - oy) / cell);
  if (r < 0 || r >= app.SIZE || c < 0 || c >= app.SIZE) return null;
  return { r: r, c: c };
}

app.resetGame = function() {
  app.showResultOverlay = false;
  app.onlineResultOverlaySticky = false;
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  app.lastOpponentMove = null;
  if (app.isPvpOnline) {
    app.screen = 'game';
    if (app.gameOver && app.onlineSocketCanSend()) {
      app.socketTask.send({
        data: JSON.stringify({ type: 'RESET' })
      });
    }
    app.draw();
    return;
  }
  if (!app.isPvpLocal) {
    app.aiMoveGeneration++;
  }
  app.pveMoveHistory = [];
  app.localMoveHistory = [];
  app.localUndoRequest = null;
  app.screen = 'game';
  app.board = gomoku.createBoard();
  app.current = app.BLACK;
  app.gameOver = false;
  app.winner = null;
  if (app.isPvpLocal) {
    app.lastMsg = '';
    app.draw();
    return;
  }
  app.lastMsg = '';
  app.draw();
  if (!app.gameOver && app.current === app.pveAiColor()) {
    setTimeout(function () {
      app.runAiMove();
    }, 220);
  }
}

/* ---------- 对局流程：人机、随机匹配、本地/结算 ---------- */

app.startPve = function(humanColor) {
  app.disconnectOnline();
  app.isPvpLocal = false;
  app.isRandomMatch = false;
  app.pveHumanColor = humanColor === undefined ? app.BLACK : humanColor;
  app.screen = 'game';
  app.resetGame();
}

app.cancelMatchingTimers = function() {
  if (app.matchingTimer) {
    clearTimeout(app.matchingTimer);
    app.matchingTimer = null;
  }
  if (app.matchingAnimTimer) {
    clearInterval(app.matchingAnimTimer);
    app.matchingAnimTimer = null;
  }
  if (app.randomMatchPairedPollTimer) {
    clearInterval(app.randomMatchPairedPollTimer);
    app.randomMatchPairedPollTimer = null;
  }
}

/** 房主：轮询 paired，对手加入后拿 yourToken 再连 WS（与随机先后手一致） */
app.pollRandomMatchPairedOnce = function() {
  if (!app.randomMatchHostWaiting || app.screen !== 'matching' || !app.onlineRoomId) {
    return;
  }
  wx.request(
    Object.assign(roomApi.roomApiRandomMatchPairedOptions(app.onlineRoomId), {
      success: function (res) {
        if (!app.randomMatchHostWaiting || app.screen !== 'matching') {
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          return;
        }
        var p = res.data;
        if (!p.guestJoined) {
          return;
        }
        if (!p.yourToken) {
          return;
        }
        app.cancelMatchingTimers();
        app.onlineToken = p.yourToken;
        app.pvpOnlineYourColor = p.yourColor === 'WHITE' ? app.WHITE : app.BLACK;
        app.randomMatchHostCancelToken = '';
        app.randomMatchHostWaiting = false;
        app.isPvpLocal = false;
        app.isRandomMatch = false;
        app.screen = 'game';
        app.lastOpponentMove = null;
        app.board = gomoku.createBoard();
        app.current = app.BLACK;
        app.gameOver = false;
        app.winner = null;
        app.lastMsg = '';
        app.startOnlineSocket();
        app.draw();
      },
      fail: function () {}
    })
  );
}

app.finishRandomMatch = function() {
  app.cancelMatchingTimers();
  app.randomMatchHostWaiting = false;
  app.disconnectOnline();
  app.isPvpLocal = false;
  app.randomOpponentName =
    app.FAKE_OPPONENT_NAMES[
      Math.floor(Math.random() * app.FAKE_OPPONENT_NAMES.length)
    ];
  app.pveHumanColor = Math.random() < 0.5 ? app.BLACK : app.WHITE;
  app.isRandomMatch = true;
  app.screen = 'game';
  app.resetGame();
}

app.onRandomMatchHostTimeout = function() {
  if (!app.randomMatchHostWaiting) {
    return;
  }
  wx.request(
    Object.assign(
      roomApi.roomApiRandomMatchFallbackOptions(
        app.onlineRoomId,
        app.randomMatchHostCancelToken
      ),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            /* 已有白方：paired 轮询应很快成功；兜底再拉一次 */
            app.pollRandomMatchPairedOnce();
            return;
          }
          if (res.statusCode === 200) {
            app.randomMatchHostWaiting = false;
            app.cancelMatchingTimers();
            app.isRandomMatch = true;
            app.onlineOpponentIsBot = true;
            app.onlineOppProfileFetched = false;
            app.onlineOppProfileRoomId = '';
            app.screen = 'game';
            app.onlineToken = app.randomMatchHostCancelToken;
            app.randomMatchHostCancelToken = '';
            app.pvpOnlineYourColor = app.BLACK;
            app.closeSocketOnly();
            app.startOnlineSocket();
            app.draw();
            return;
          }
          if (res.statusCode === 503) {
            wx.showToast({ title: '暂无人机，已切换本地人机', icon: 'none' });
          }
          app.randomMatchHostWaiting = false;
          app.cancelMatchingTimers();
          app.finishRandomMatch();
        },
        fail: function () {
          app.randomMatchHostWaiting = false;
          app.cancelMatchingTimers();
          app.finishRandomMatch();
        }
      }
    )
  );
}

app.startRandomMatch = function() {
  app.homeDrawerOpen = false;
  app.cancelMatchingTimers();
  app.randomMatchHostWaiting = false;
  authApi.ensureSession(function (sessionOk, errHint) {
    if (!sessionOk) {
      wx.showToast({ title: errHint || '请先完成登录', icon: 'none' });
      app.screen = 'home';
      app.draw();
      return;
    }
    app.disconnectOnline();
    app.matchingDots = 0;
    app.screen = 'matching';
    app.matchingAnimTimer = setInterval(function () {
      app.matchingDots = (app.matchingDots + 1) % 4;
      if (app.screen === 'matching') {
        app.draw();
      }
    }, 400);
    app.draw();
    wx.request(
      Object.assign(roomApi.roomApiRandomMatchOptions(), {
      success: function (res) {
        if (app.screen !== 'matching') {
          return;
        }
        if ((res.statusCode !== 200 && res.statusCode !== 201) || !res.data) {
          wx.showToast({
            title: '匹配服务不可用',
            icon: 'none'
          });
          app.cancelMatchingTimers();
          app.disconnectOnline();
          app.randomMatchHostWaiting = false;
          app.screen = 'home';
          app.draw();
          return;
        }
        var d = res.data;
        var role = d.role;
        if (role === 'guest') {
          app.cancelMatchingTimers();
          app.onlineRoomId = d.roomId;
          if (d.yourColor === 'BLACK') {
            app.onlineToken = d.blackToken;
            app.pvpOnlineYourColor = app.BLACK;
          } else if (d.yourColor === 'WHITE') {
            app.onlineToken = d.whiteToken;
            app.pvpOnlineYourColor = app.WHITE;
          } else {
            app.onlineToken = d.whiteToken;
            app.pvpOnlineYourColor = app.WHITE;
          }
          app.isPvpLocal = false;
          app.isRandomMatch = false;
          app.randomMatchHostWaiting = false;
          app.randomMatchHostCancelToken = '';
          app.screen = 'game';
          app.lastOpponentMove = null;
          app.board = gomoku.createBoard();
          app.current = app.BLACK;
          app.gameOver = false;
          app.winner = null;
          app.lastMsg = '';
          app.startOnlineSocket();
          app.draw();
          return;
        }
        if (role === 'host') {
          app.onlineRoomId = d.roomId;
          app.onlineToken = '';
          app.randomMatchHostCancelToken = d.blackToken || '';
          app.pvpOnlineYourColor = app.BLACK;
          app.isPvpLocal = false;
          app.isRandomMatch = false;
          app.randomMatchHostWaiting = true;
          app.lastOpponentMove = null;
          app.board = gomoku.createBoard();
          app.current = app.BLACK;
          app.gameOver = false;
          app.winner = null;
          app.lastMsg = '';
          app.pollRandomMatchPairedOnce();
          app.randomMatchPairedPollTimer = setInterval(function () {
            app.pollRandomMatchPairedOnce();
          }, app.RANDOM_MATCH_PAIRED_POLL_MS);
          app.matchingTimer = setTimeout(function () {
            app.matchingTimer = null;
            app.onRandomMatchHostTimeout();
          }, app.RANDOM_MATCH_TIMEOUT_MS);
          app.draw();
          return;
        }
        wx.showToast({ title: '匹配数据异常', icon: 'none' });
        app.cancelMatchingTimers();
        app.disconnectOnline();
        app.randomMatchHostWaiting = false;
        app.screen = 'home';
        app.draw();
      },
      fail: function () {
        if (app.screen !== 'matching') {
          return;
        }
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        app.cancelMatchingTimers();
        app.disconnectOnline();
        app.randomMatchHostWaiting = false;
        app.screen = 'home';
        app.draw();
      }
    })
    );
  });
}

app.cancelMatching = function() {
  app.cancelMatchingTimers();
  if (app.randomMatchHostWaiting && app.onlineRoomId && app.randomMatchHostCancelToken) {
    wx.request(
      roomApi.roomApiRandomMatchCancelOptions(
        app.onlineRoomId,
        app.randomMatchHostCancelToken
      )
    );
  }
  app.randomMatchHostWaiting = false;
  app.randomMatchHostCancelToken = '';
  app.disconnectOnline();
  app.homeDrawerOpen = false;
  app.homePressedButton = null;
  app.homePressedDockCol = null;
  app.screen = 'home';
  app.draw();
}

app.backToHome = function() {
  app.stopReplayAuto();
  app.onlineMoveHistory = [];
  app.lastSettledGameId = null;
  app.showResultOverlay = false;
  app.onlineResultOverlaySticky = false;
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  app.destroyAiWorker();
  app.lastOpponentMove = null;
  app.pveMoveHistory = [];
  app.localMoveHistory = [];
  app.localUndoRequest = null;
  app.onlineUndoPending = false;
  app.onlineUndoRequesterColor = null;
  app.cancelMatchingTimers();
  app.randomMatchHostWaiting = false;
  app.disconnectOnline();
  app.isRandomMatch = false;
  app.isPvpLocal = false;
  app.onlineInviteConsumed = false;
  app.homeDrawerOpen = false;
  app.homePressedButton = null;
  app.homePressedDockCol = null;
  app.screen = 'home';
  app.draw();
}

app.startPvpLocal = function() {
  app.lastOpponentMove = null;
  app.showResultOverlay = false;
  app.onlineResultOverlaySticky = false;
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  app.disconnectOnline();
  app.isRandomMatch = false;
  app.isPvpLocal = true;
  app.screen = 'game';
  app.board = gomoku.createBoard();
  app.current = app.BLACK;
  app.gameOver = false;
  app.winner = null;
  app.lastMsg = '';
  app.draw();
}

/**
 * 联机终局后上报结算，服务端写入 game 记录并更新 elo（须已登录）。
 * 双方都会调用，先成功者结算，另一方可能收到 409 已结算。
 */
app.maybeRequestOnlineGameSettle = function() {
  if (!app.isPvpOnline || !app.onlineRoomId || app.onlineSettleSent) {
    return;
  }
  if (!authApi.getSessionToken()) {
    return;
  }
  var steps = app.countStonesOnBoard(app.board);
  if (steps < 0 || steps > 256) {
    return;
  }
  var outcome;
  if (app.winner === null) {
    outcome = 'DRAW';
  } else if (app.winner === app.BLACK) {
    outcome = 'BLACK_WIN';
  } else {
    outcome = 'WHITE_WIN';
  }
  var movesPayload = [];
  var mi;
  for (mi = 0; mi < app.onlineMoveHistory.length; mi++) {
    movesPayload.push(app.onlineMoveHistory[mi]);
  }
  var settleBody = {
    roomId: app.onlineRoomId,
    matchRound: app.onlineMatchRound,
    outcome: outcome,
    totalSteps: steps
  };
  if (movesPayload.length === steps) {
    settleBody.moves = movesPayload;
  }
  app.onlineSettleSent = true;
  wx.request(
    Object.assign(
      roomApi.gameSettleOptions(settleBody),
      {
        success: function (res) {
          if (res.statusCode === 409) {
            return;
          }
          if (res.statusCode !== 200) {
            app.onlineSettleSent = false;
            return;
          }
          var d = res.data;
          if (d && d.gameId !== undefined && d.gameId !== null) {
            var gid = Number(d.gameId);
            if (!isNaN(gid)) {
              app.lastSettledGameId = gid;
            }
          }
        },
        fail: function () {
          app.onlineSettleSent = false;
        }
      }
    )
  );
}

app.openResult = function() {
  if (!app.gameOver) {
    return;
  }
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  if (app.isPvpOnline) {
    app.maybeRequestOnlineGameSettle();
    if (app.winner === null) {
      app.resultKind = 'pvp_draw';
    } else if (app.winner === app.pvpOnlineYourColor) {
      app.resultKind = 'online_win';
    } else {
      app.resultKind = 'online_lose';
    }
  } else if (app.isPvpLocal) {
    if (app.winner === null) {
      app.resultKind = 'pvp_draw';
    } else if (app.winner === app.BLACK) {
      app.resultKind = 'pvp_black_win';
    } else {
      app.resultKind = 'pvp_white_win';
    }
  } else if (app.winner === null) {
    app.resultKind = 'pve_draw';
  } else {
    app.resultKind = app.winner === app.pveHumanColor ? 'pve_win' : 'pve_lose';
  }
  app.onlineResultOverlaySticky = false;
  app.showResultOverlay = true;
  app.recordMatchHistoryFromGameEnd();
  app.screen = 'game';
  app.draw();
}

app.canShowOnlineReplayButton = function() {
  return app.isPvpOnline && !!app.onlineRoomId;
}

/** 棋盘页结算弹层：卡片与按钮位置（与 drawResultOverlay / hitResultButton 一致） */
app.getResultOverlayLayout = function() {
  var btnW = Math.min(app.W - 48, 300);
  var btnH = 54;
  var cardW = Math.min(app.W - 40, 360);
  var threeBtn = app.canShowOnlineReplayButton();
  var cardH = threeBtn
    ? Math.min(380, Math.max(300, app.H * 0.42))
    : Math.min(300, Math.max(260, app.H * 0.38));
  var cardX = (app.W - cardW) / 2;
  var cardY = Math.max((app.sys.statusBarHeight || 0) + 20, app.H * 0.16);
  var yTitle = cardY + 46;
  var ySub = cardY + 96;
  var yAgain = cardY + 148;
  var yReplay = cardY + 214;
  var yHome = cardY + 280;
  if (!threeBtn) {
    yAgain = cardY + 162;
    yHome = cardY + 228;
  }
  return {
    btnW: btnW,
    btnH: btnH,
    cx: app.W / 2,
    cardX: cardX,
    cardY: cardY,
    cardW: cardW,
    cardH: cardH,
    yTitle: yTitle,
    ySub: ySub,
    yAgain: yAgain,
    yReplay: yReplay,
    yHome: yHome,
    threeBtn: threeBtn
  };
}

app.drawResultOverlay = function() {
  var th = app.getUiTheme();
  var rs = th.result;
  var bg = rs.defaultEnd;
  var titleColor = th.title;
  var title = '';
  var sub = '';
  switch (app.resultKind) {
    case 'pve_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '胜利';
      sub = '恭喜战胜对手';
      break;
    case 'pve_lose':
      bg = rs.lose.bg;
      titleColor = rs.lose.title;
      title = '失败';
      sub = '再接再厉';
      break;
    case 'pve_draw':
      bg = rs.draw.bg;
      titleColor = rs.draw.title;
      title = '平局';
      sub = '难分高下';
      break;
    case 'pvp_black_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '黑方胜利';
      sub = '好友对战';
      break;
    case 'pvp_white_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '白方胜利';
      sub = '好友对战';
      break;
    case 'pvp_draw':
      bg = rs.draw.bg;
      titleColor = rs.draw.title;
      title = '平局';
      sub = '好友对战';
      break;
    case 'online_win':
      bg = rs.win.bg;
      titleColor = rs.win.title;
      title = '胜利';
      sub = '联机对战';
      break;
    case 'online_lose':
      bg = rs.lose.bg;
      titleColor = rs.lose.title;
      title = '失败';
      sub = '联机对战';
      break;
    default:
      title = '对局结束';
      sub = '';
  }

  app.ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  app.ctx.fillRect(0, 0, app.W, app.H);

  var ly = app.getResultOverlayLayout();
  var rg = app.ctx.createLinearGradient(
    0,
    ly.cardY,
    0,
    ly.cardY + ly.cardH
  );
  rg.addColorStop(0, bg);
  rg.addColorStop(1, rs.defaultEnd);
  var cr = Math.min(26, ly.cardH * 0.12);
  app.ctx.shadowColor = 'rgba(0,0,0,0.18)';
  app.ctx.shadowBlur = 24;
  app.ctx.shadowOffsetY = 8;
  app.ctx.fillStyle = rg;
  app.roundRect(ly.cardX, ly.cardY, ly.cardW, ly.cardH, cr);
  app.ctx.fill();
  app.ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  app.ctx.lineWidth = 1.5;
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;

  render.drawText(app.ctx, title, ly.cx, ly.yTitle, 36, titleColor);
  if (sub) {
    render.drawText(app.ctx, sub, ly.cx, ly.ySub, 16, rs.sub, 'normal');
  }

  app.drawMacaronCard(
    '再来一局',
    ly.cx,
    ly.yAgain,
    ly.btnW,
    ly.btnH,
    th.homeCards[0],
    false,
    'bear'
  );

  if (ly.threeBtn) {
    app.drawMacaronCard(
      '本局回放',
      ly.cx,
      ly.yReplay,
      ly.btnW,
      ly.btnH,
      th.homeCards[1],
      false,
      'cloud'
    );
  }

  app.ctx.shadowColor = 'rgba(0,0,0,0.06)';
  app.ctx.shadowBlur = 10;
  app.ctx.shadowOffsetY = 2;
  app.ctx.fillStyle = rs.secondaryFill;
  app.ctx.strokeStyle = rs.secondaryStroke;
  app.ctx.lineWidth = 1.5;
  app.roundRect(
    ly.cx - ly.btnW / 2,
    ly.yHome - ly.btnH / 2,
    ly.btnW,
    ly.btnH,
    22
  );
  app.ctx.fill();
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.font =
    'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = rs.secondaryText;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('返回首页', app.snapPx(ly.cx), app.snapPx(ly.yHome));
  app.drawThemeChrome(th);
}

};
