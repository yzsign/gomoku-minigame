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
    checkinShellThemeId === 'ink' || checkinShellThemeId === 'mint'
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

  var bottomBtnReserve =
    (d.showSyncProfileBtn ? app.rpx(52) : 0) +
    (d.showAddFriendBtn ? app.rpx(58) : 0);
  var contentBottomPad = 18;
  var gapAboveContent = 14;
  var availH =
    y +
    L.h -
    contentBottomPad -
    gapAboveContent -
    y -
    titleBlock -
    bottomBtnReserve;
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

  if (d.showAddFriendBtn) {
    var AF = app.getRatingCardAddFriendLayout();
    if (AF) {
      var afOn = d.addFriendEnabled !== false;
      var afLabel =
        typeof d.addFriendLabel === 'string' && d.addFriendLabel.trim()
          ? d.addFriendLabel.trim()
          : '添加好友';
      var afR = app.rpx(10);
      var ax = AF.left;
      var ay = AF.top;
      var aw = AF.w;
      var ah = AF.h;
      app.ctx.save();
      if (afOn) {
        app.ctx.shadowColor = 'rgba(22, 101, 72, 0.38)';
        app.ctx.shadowBlur = app.rpx(12);
        app.ctx.shadowOffsetY = app.rpx(4);
        var g = app.ctx.createLinearGradient(ax, ay, ax, ay + ah);
        g.addColorStop(0, '#4ade80');
        g.addColorStop(0.45, '#22c55e');
        g.addColorStop(1, '#15803d');
        app.ctx.fillStyle = g;
        app.roundRect(ax, ay, aw, ah, afR);
        app.ctx.fill();
        app.ctx.shadowBlur = 0;
        app.ctx.shadowOffsetY = 0;
        var gloss = app.ctx.createLinearGradient(ax, ay, ax, ay + ah * 0.55);
        gloss.addColorStop(0, 'rgba(255,255,255,0.42)');
        gloss.addColorStop(0.35, 'rgba(255,255,255,0.08)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        app.ctx.fillStyle = gloss;
        app.roundRect(ax, ay, aw, ah * 0.5, afR);
        app.ctx.fill();
        app.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        app.ctx.lineWidth = 1;
        app.roundRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1, afR - 0.5);
        app.ctx.stroke();
      } else {
        app.ctx.fillStyle = '#f1f5f9';
        app.roundRect(ax, ay, aw, ah, afR);
        app.ctx.fill();
        app.ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        app.ctx.lineWidth = 1;
        app.roundRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1, afR - 0.5);
        app.ctx.stroke();
      }
      var fs = '600 ' + app.rpx(14) + 'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.font = fs;
      app.ctx.textBaseline = 'middle';
      var gap = app.rpx(5);
      var plusStr = '+';
      var pw = app.ctx.measureText(plusStr).width;
      var tw = app.ctx.measureText(afLabel).width;
      var total = pw + gap + tw;
      var startX = AF.cx - total * 0.5;
      var textY = AF.cy;
      if (afOn) {
        app.ctx.fillStyle = '#ffffff';
        app.ctx.shadowColor = 'rgba(0,0,0,0.18)';
        app.ctx.shadowBlur = app.rpx(3);
        app.ctx.shadowOffsetY = app.rpx(1);
      } else {
        app.ctx.fillStyle = '#94a3b8';
        app.ctx.shadowBlur = 0;
        app.ctx.shadowOffsetY = 0;
      }
      app.ctx.textAlign = 'left';
      app.ctx.fillText(plusStr, app.snapPx(startX), app.snapPx(textY));
      app.ctx.fillText(afLabel, app.snapPx(startX + pw + gap), app.snapPx(textY));
      app.ctx.shadowBlur = 0;
      app.ctx.shadowOffsetY = 0;
      app.ctx.restore();
    }
  }

  if (d.showSyncProfileBtn) {
    var B = app.getRatingCardSyncProfileLayout();
    if (B) {
      app.ctx.fillStyle = th.btnPrimary || '#16a34a';
      app.roundRect(B.left, B.top, B.w, B.h, app.rpx(10));
      app.ctx.fill();
      app.ctx.font =
        '600 13px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      app.ctx.fillStyle = '#ffffff';
      app.ctx.textAlign = 'center';
      app.ctx.textBaseline = 'middle';
      app.ctx.fillText(
        '同步头像昵称',
        app.snapPx(B.cx),
        app.snapPx(B.cy)
      );
    }
  }

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
    showActivityPoints: !opts.hideActivityPoints,
    showSyncProfileBtn: opts.showSyncProfileBtn === true,
    showAddFriendBtn: opts.showAddFriendBtn === true,
    addFriendLabel: '添加好友',
    addFriendEnabled: false,
    opponentUserId: null,
    addFriendRateLimited: false
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
        app.fillRatingCardFromApiData(d, {
          showSyncProfileBtn: true,
          usePayloadNickname: true
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

/** 同步微信头像昵称后刷新信息看板（仅本人卡） */
app.refetchMyRatingCardPayloadAndRedraw = function() {
  if (!app.ratingCardVisible || !authApi.getSessionToken()) {
    if (typeof app.draw === 'function') {
      app.draw();
    }
    return;
  }
  wx.request(
    Object.assign(roomApi.meRatingOptions(), {
      success: function (res) {
        if (res.statusCode !== 200 || !res.data) {
          if (typeof app.draw === 'function') {
            app.draw();
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
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return;
        }
        app.syncCheckinStateFromServerPayload(d);
        app.applyMyGenderFromRatingPayload(d);
        if (typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) {
          app.loadMyNetworkAvatar(d.avatarUrl.trim());
        }
        app.fillRatingCardFromApiData(d, {
          showSyncProfileBtn: true,
          usePayloadNickname: true
        });
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '已同步', icon: 'success' });
        }
        if (typeof app.draw === 'function') {
          app.draw();
        }
      },
      fail: function () {
        if (typeof app.draw === 'function') {
          app.draw();
        }
      }
    })
  );
};

/**
 * 信息看板内：用户点击「同步头像昵称」（须在触摸回调内调 wx.getUserProfile）
 */
app.profileSyncFromWeChatInFlight = false;
app.syncMyProfileFromWeChat = function() {
  if (app.profileSyncFromWeChatInFlight) {
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  if (typeof wx.getUserProfile !== 'function') {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '当前环境不支持', icon: 'none' });
    }
    return;
  }
  app.profileSyncFromWeChatInFlight = true;
  wx.getUserProfile({
    desc: '用于展示昵称与头像',
    success: function (up) {
      app.profileSyncFromWeChatInFlight = false;
      if (!up || !up.userInfo) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '未获取到资料', icon: 'none' });
        }
        return;
      }
      var ui = up.userInfo;
      app.persistLocalNickname(ui);
      app.saveCachedWeChatUserInfo(ui);
      if (typeof ui.avatarUrl === 'string' && ui.avatarUrl.trim()) {
        app.loadMyNetworkAvatar(ui.avatarUrl.trim());
      }
      authApi.silentLogin(ui, function (ok) {
        app.myProfileAvatarFetched = false;
        if (typeof app.tryFetchMyProfileAvatar === 'function') {
          app.tryFetchMyProfileAvatar();
        }
        if (!ok) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
          if (typeof app.draw === 'function') {
            app.draw();
          }
          return;
        }
        if (typeof app.refetchMyRatingCardPayloadAndRedraw === 'function') {
          app.refetchMyRatingCardPayloadAndRedraw();
        } else if (typeof app.draw === 'function') {
          app.draw();
        }
      });
    },
    fail: function () {
      app.profileSyncFromWeChatInFlight = false;
      var cached =
        typeof app.readCachedWeChatUserInfo === 'function'
          ? app.readCachedWeChatUserInfo()
          : null;
      if (cached && cached.nickName) {
        app.persistLocalNickname(cached);
        if (typeof cached.avatarUrl === 'string' && cached.avatarUrl.trim()) {
          app.loadMyNetworkAvatar(cached.avatarUrl.trim());
        }
        authApi.silentLogin(cached, function (ok) {
          app.myProfileAvatarFetched = false;
          if (typeof app.tryFetchMyProfileAvatar === 'function') {
            app.tryFetchMyProfileAvatar();
          }
          if (!ok) {
            if (typeof wx.showToast === 'function') {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
            if (typeof app.draw === 'function') {
              app.draw();
            }
            return;
          }
          if (typeof app.refetchMyRatingCardPayloadAndRedraw === 'function') {
            app.refetchMyRatingCardPayloadAndRedraw();
          } else if (typeof app.draw === 'function') {
            app.draw();
          }
        });
        return;
      }
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '未授权', icon: 'none' });
      }
    }
  });
};

/** 将 GET /api/social/friend-status 结果合并到当前战绩卡（对手卡） */
app.applyFriendStatusToRatingCard = function(opponentUserId, fs) {
  if (!app.ratingCardData) {
    return;
  }
  app.ratingCardData.opponentUserId = opponentUserId;
  app.ratingCardData.showAddFriendBtn = true;
  app.ratingCardData.addFriendRateLimited = false;
  if (fs && fs.friends) {
    app.ratingCardData.addFriendLabel = '已添加';
    app.ratingCardData.addFriendEnabled = false;
  } else if (fs && fs.outgoingPending) {
    app.ratingCardData.addFriendLabel = '申请中';
    app.ratingCardData.addFriendEnabled = false;
  } else {
    app.ratingCardData.addFriendLabel = '添加好友';
    app.ratingCardData.addFriendEnabled = true;
  }
};

/** 点击对手卡「添加好友」 */
app.onRatingCardAddFriendTap = function() {
  var d = app.ratingCardData;
  if (!d || !d.showAddFriendBtn || d.opponentUserId == null) {
    return;
  }
  if (d.addFriendEnabled === false) {
    if (d.addFriendLabel === '申请中') {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: '申请已发送，请等待对方处理',
          icon: 'none'
        });
      }
    }
    return;
  }
  if (app.addFriendInFlight) {
    return;
  }
  if (!authApi.getSessionToken()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请先完成登录', icon: 'none' });
    }
    return;
  }
  app.addFriendInFlight = true;
  wx.request(
    Object.assign(roomApi.socialFriendRequestCreateOptions(d.opponentUserId), {
      success: function(res) {
        app.addFriendInFlight = false;
        var body = res.data;
        if (body && typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (pe) {
            body = null;
          }
        }
        if (res.statusCode === 401) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode !== 200) {
          var errMsg =
            body && typeof body.message === 'string' && body.message.trim()
              ? body.message.trim()
              : body && typeof body.code === 'string'
                ? String(body.code)
                : '';
          if (!errMsg) {
            errMsg =
              res.statusCode === 404
                ? '服务未找到该接口，请确认服务端已部署好友功能'
                : '请求失败(' + res.statusCode + ')';
          }
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: errMsg, icon: 'none', duration: 3200 });
          }
          return;
        }
        if (!body || typeof body !== 'object') {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '服务器返回异常', icon: 'none' });
          }
          return;
        }
        var st = body.status;
        if (st === 'CREATED') {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '好友申请已发送', icon: 'none' });
          }
          d.addFriendLabel = '申请中';
          d.addFriendEnabled = false;
        } else if (st === 'PENDING') {
          d.addFriendLabel = '申请中';
          d.addFriendEnabled = false;
        } else if (st === 'ALREADY_FRIENDS') {
          d.addFriendLabel = '已添加';
          d.addFriendEnabled = false;
        } else if (st === 'RATE_LIMITED') {
          d.addFriendLabel = '添加好友';
          d.addFriendEnabled = false;
          d.addFriendRateLimited = true;
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: '申请过于频繁，请 24 小时后再试',
              icon: 'none'
            });
          }
        }
        if (typeof app.draw === 'function') {
          app.draw();
        }
      },
      fail: function(err) {
        app.addFriendInFlight = false;
        var t = '网络异常，请稍后重试';
        if (err && typeof err.errMsg === 'string') {
          if (
            err.errMsg.indexOf('url not in domain list') >= 0 ||
            err.errMsg.indexOf('不在以下 request 合法域名') >= 0
          ) {
            t = '请在小程序后台配置该 API 域名为 request 合法域名';
          } else if (err.errMsg.indexOf('fail') >= 0) {
            t = '网络不可用，请检查网络或域名配置';
          }
        }
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: t, icon: 'none', duration: 3500 });
        }
      }
    })
  );
};

/** 联机对局中：拉取当前房间对手的公开天梯 */
app.showOpponentRatingModal = function() {
  if (!app.isPvpOnline || !app.onlineRoomId) {
    return;
  }
  if (
    typeof app.shouldToastNoOpponentLadderForOnlineOppAvatar === 'function' &&
    app.shouldToastNoOpponentLadderForOnlineOppAvatar()
  ) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '暂无法查看对手资料', icon: 'none' });
    }
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
        if (res.statusCode === 401) {
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          app.ratingFetchInFlight = false;
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        if (res.statusCode === 404 || res.statusCode === 403) {
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          app.ratingFetchInFlight = false;
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: res.statusCode === 403 ? '无法查看' : '暂无对手数据',
              icon: 'none'
            });
          }
          return;
        }
        if (res.statusCode !== 200 || !res.data) {
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          app.ratingFetchInFlight = false;
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
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          app.ratingFetchInFlight = false;
          return;
        }
        app.applyOnlineOpponentProfilePayload(d);
        app.fillRatingCardFromApiData(d, {
          cardTitle: '对手战绩',
          usePayloadNickname: true,
          hideActivityPoints: true,
          showSyncProfileBtn: false
        });
        var oid = d.userId != null ? Number(d.userId) : NaN;
        function finishOpponentCard() {
          app.ratingFetchInFlight = false;
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          app.ratingCardVisible = true;
          if (typeof app.draw === 'function') {
            app.draw();
          }
        }
        if (!isNaN(oid)) {
          wx.request(
            Object.assign(roomApi.socialFriendStatusOptions(oid), {
              success: function (res2) {
                var fs = res2.data;
                if (fs && typeof fs === 'string') {
                  try {
                    fs = JSON.parse(fs);
                  } catch (pe3) {
                    fs = null;
                  }
                }
                if (res2.statusCode === 200 && fs) {
                  app.applyFriendStatusToRatingCard(oid, fs);
                } else {
                  app.applyFriendStatusToRatingCard(oid, null);
                }
                finishOpponentCard();
              },
              fail: function () {
                app.applyFriendStatusToRatingCard(oid, null);
                finishOpponentCard();
              }
            })
          );
        } else {
          finishOpponentCard();
        }
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
          hideActivityPoints: true,
          showSyncProfileBtn: false
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
  app.lastOpponentMove = null;
  if (app.isPvpOnline) {
    if (app.gameOver) {
      app.screen = 'game';
      app.sendOnlineRematchRequest();
      app.draw();
    }
    return;
  }
  if (app.isDailyPuzzle) {
    app.restoreDailyPuzzleInitial();
    app.screen = 'game';
    return;
  }
  app.showResultOverlay = false;
  app.onlineResultOverlaySticky = false;
  app.stopResultTuanPointsAnim();
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  if (!app.isPvpLocal) {
    app.aiMoveGeneration++;
  }
  app.pveMoveHistory = [];
  app.localMoveHistory = [];
  app.localUndoRequest = null;
  app.localDrawRequest = null;
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

/**
 * 终局结算后是否应禁止「再来一局」：对方已离开或仅己方仍在线。
 * 除 onlineOpponentLeft / 逃跑终局 resultKind 外，也看 STATE 里双方 connected，
 * 避免胜局后对方下线但标志未带上「已离开」时仍误发邀请。
 */
app.isOnlineOpponentGoneForRematch = function() {
  if (!app.isPvpOnline) {
    return false;
  }
  if (app.onlineOpponentLeft || app.resultKind === 'online_opponent_left') {
    return true;
  }
  if (app.onlineOpponentIsBot) {
    return false;
  }
  var oppGone =
    app.pvpOnlineYourColor === app.BLACK
      ? !app.onlineWhiteConnected && app.onlineBlackConnected
      : !app.onlineBlackConnected && app.onlineWhiteConnected;
  return !!oppGone;
};

app.notifyCannotOnlineRematchOpponentLeft = function() {
  if (typeof wx.showModal === 'function') {
    wx.showModal({
      title: '无法再来一局',
      content: '对方已离开，无法发起再来一局邀请。',
      showCancel: false,
      confirmText: '知道了'
    });
  } else if (typeof wx.showToast === 'function') {
    wx.showToast({ title: '对方已离开，无法再来一局', icon: 'none' });
  }
};

/**
 * 再来一局：发 WebSocket 消息。使用 type RESET，与已部署的旧版云托管兼容；
 * 新版服务端将 RESET 与 REMATCH_REQUEST 同样视为「再来一局」邀请。
 */
app.sendOnlineRematchRequest = function() {
  if (!app.onlineSocketCanSend()) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '未连接，请稍后重试', icon: 'none' });
    }
    return;
  }
  if (app.isOnlineOpponentGoneForRematch()) {
    app.notifyCannotOnlineRematchOpponentLeft();
    return;
  }
  if (
    app.onlineRematchRequesterColor != null &&
    app.pvpOnlineYourColor !== app.onlineRematchRequesterColor
  ) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '请在弹窗中同意或拒绝', icon: 'none' });
    }
    return;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: 'RESET' })
  });
  if (typeof wx.showToast === 'function') {
    wx.showToast({ title: '邀请已发送', icon: 'none' });
  }
}

app.sendOnlineRematchAccept = function() {
  if (!app.onlineSocketCanSend()) {
    return;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: 'REMATCH_ACCEPT' })
  });
}

app.sendOnlineRematchDecline = function() {
  if (!app.onlineSocketCanSend()) {
    return;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: 'REMATCH_DECLINE' })
  });
}

/** 结算页「继续」：重新随机匹配新对手（离开当前房间） */
app.startRandomMatchFromResultOverlay = function() {
  app.showResultOverlay = false;
  app.onlineResultOverlaySticky = false;
  app.stopResultTuanPointsAnim();
  app.startRandomMatch();
}

/* ---------- 对局流程：人机、随机匹配、本地/结算 ---------- */

app.startPve = function(humanColor) {
  app.disconnectOnline();
  app.isPvpLocal = false;
  app.isRandomMatch = false;
  app.isDailyPuzzle = false;
  app.pveHumanColor = humanColor === undefined ? app.BLACK : humanColor;
  app.screen = 'game';
  app.resetGame();
}

app.restoreDailyPuzzleInitial = function() {
  if (!app.dailyPuzzleInitialBoard) {
    return;
  }
  app.showResultOverlay = false;
  app.onlineResultOverlaySticky = false;
  if (typeof app.stopResultTuanPointsAnim === 'function') {
    app.stopResultTuanPointsAnim();
  }
  app.dailyPuzzleSubmitting = false;
  app.dailyPuzzleResultKind = '';
  app.dailyPuzzleSubmitActivityPointsDelta = null;
  app.dailyPuzzleBotGen++;
  app.board = app.copyBoardFromServer(app.dailyPuzzleInitialBoard);
  app.dailyPuzzleMoves = [];
  app.current = app.dailyPuzzleSideToMoveStart;
  app.dailyPuzzleUserColor = app.dailyPuzzleSideToMoveStart;
  app.gameOver = false;
  app.winner = null;
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  app.lastOpponentMove = null;
  app.lastMsg = '每日残局';
  if (typeof app.refreshDailyPuzzleLastOpponentMove === 'function') {
    app.refreshDailyPuzzleLastOpponentMove();
  }
  if (typeof app.scheduleDailyPuzzleBotIfNeeded === 'function') {
    app.scheduleDailyPuzzleBotIfNeeded();
  }
  app.draw();
};

app.startDailyPuzzleFromApiData = function(d) {
  app.disconnectOnline();
  app.isPvpLocal = false;
  app.isPvpOnline = false;
  app.isRandomMatch = false;
  app.isDailyPuzzle = true;
  app.dailyPuzzleMeta = {
    puzzleDate: d.puzzleDate,
    puzzleId: d.puzzleId,
    goal: d.goal,
    maxUserMoves: d.maxUserMoves,
    title: d.title,
    difficulty: d.difficulty,
    hasHint: d.hasHint
  };
  app.dailyPuzzleMoves = [];
  app.dailyPuzzleSubmitting = false;
  app.dailyPuzzleResultKind = '';
  app.dailyPuzzleSubmitActivityPointsDelta = null;
  app.board = app.copyBoardFromServer(d.board);
  app.dailyPuzzleInitialBoard = app.copyBoardFromServer(d.board);
  app.dailyPuzzleSideToMoveStart =
    d.sideToMove === app.WHITE ? app.WHITE : app.BLACK;
  app.current = app.dailyPuzzleSideToMoveStart;
  /** 挑战者与残局「下一手」同色：sideToMove 为黑则用户执黑，为白则执白 */
  app.dailyPuzzleUserColor = app.dailyPuzzleSideToMoveStart;
  app.dailyPuzzleBotGen++;
  app.lastOpponentMove = null;
  app.gameOver = false;
  app.winner = null;
  app.showResultOverlay = false;
  app.screen = 'game';
  app.lastMsg = '每日残局';
  app.draw();
  if (typeof app.scheduleDailyPuzzleBotIfNeeded === 'function') {
    app.scheduleDailyPuzzleBotIfNeeded();
  }
};

app.requestStartDailyPuzzle = function() {
  authApi.ensureSession(function(ok) {
    if (!ok || !authApi.getSessionToken()) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '请先登录', icon: 'none' });
      }
      return;
    }
    if (typeof wx.showLoading === 'function') {
      wx.showLoading({ title: '加载中…', mask: true });
    }
    wx.request(
      Object.assign(roomApi.meDailyPuzzleTodayOptions(), {
        success: function(res) {
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          var data = res.data;
          if (res.statusCode === 401) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
          }
          if (res.statusCode !== 200 || !data) {
            wx.showToast({ title: '加载失败', icon: 'none' });
            return;
          }
          if (data.scheduled === false) {
            wx.showToast({ title: '今日暂无残局', icon: 'none' });
            return;
          }
          app.startDailyPuzzleFromApiData(data);
        },
        fail: function() {
          if (typeof wx.hideLoading === 'function') {
            wx.hideLoading();
          }
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      })
    );
  });
};

/**
 * 终局或满盘时提交；wasWin 表示最后一步是否构成五连。
 */
app.submitDailyPuzzleMovesAndHandle = function(r, c, lastColor, wasWin) {
  if (app.dailyPuzzleSubmitting) {
    return;
  }
  app.dailyPuzzleSubmitting = true;
  app.draw();
  wx.request(
    Object.assign(
      roomApi.meDailyPuzzleSubmitOptions(app.dailyPuzzleMoves),
      {
        success: function(res) {
          app.dailyPuzzleSubmitting = false;
          var data = res.data;
          if (res.statusCode === 401) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            if (wasWin) {
              app.undoDailyPuzzleOneMove();
            }
            app.draw();
            return;
          }
          if (res.statusCode !== 200 || !data) {
            wx.showToast({ title: '提交失败', icon: 'none' });
            if (wasWin) {
              app.undoDailyPuzzleOneMove();
            } else {
              app.restoreDailyPuzzleInitial();
            }
            app.draw();
            return;
          }
          var result = data.result;
          if (result === 'ALREADY_SOLVED') {
            app.dailyPuzzleResultKind = 'daily_puzzle_already';
            app.dailyPuzzleSubmitActivityPointsDelta = null;
            app.gameOver = true;
            app.winner = null;
            app.openResult();
            return;
          }
          if (result === 'SOLVED') {
            app.dailyPuzzleResultKind = 'daily_puzzle_solved';
            var apD =
              typeof data.activityPointsDelta === 'number' && !isNaN(data.activityPointsDelta)
                ? data.activityPointsDelta
                : Number(data.activityPointsDelta);
            if (typeof apD !== 'number' || isNaN(apD)) {
              apD =
                typeof data.activity_points_delta === 'number' && !isNaN(data.activity_points_delta)
                  ? data.activity_points_delta
                  : Number(data.activity_points_delta);
            }
            if (typeof apD === 'number' && !isNaN(apD) && apD > 0) {
              app.dailyPuzzleSubmitActivityPointsDelta = Math.floor(apD);
            } else {
              app.dailyPuzzleSubmitActivityPointsDelta = null;
            }
            var apAfter =
              typeof data.activityPointsAfter === 'number' && !isNaN(data.activityPointsAfter)
                ? data.activityPointsAfter
                : Number(data.activityPointsAfter);
            if (typeof apAfter !== 'number' || isNaN(apAfter)) {
              apAfter =
                typeof data.activity_points_after === 'number' && !isNaN(data.activity_points_after)
                  ? data.activity_points_after
                  : Number(data.activity_points_after);
            }
            if (typeof apAfter === 'number' && !isNaN(apAfter)) {
              app.getCheckinState().tuanPoints = Math.max(0, Math.floor(apAfter));
            }
            app.gameOver = true;
            app.winner = wasWin ? lastColor : null;
            if (wasWin) {
              app.finishGameWithWin(r, c, lastColor);
            } else {
              app.openResult();
            }
            return;
          }
          wx.showToast({
            title:
              result === 'INVALID' ? '手顺无效或超步数' : '未达成题目要求',
            icon: 'none'
          });
          if (wasWin) {
            app.undoDailyPuzzleOneMove();
          } else {
            app.restoreDailyPuzzleInitial();
          }
          app.draw();
        },
        fail: function() {
          app.dailyPuzzleSubmitting = false;
          wx.showToast({ title: '网络错误', icon: 'none' });
          if (wasWin) {
            app.undoDailyPuzzleOneMove();
          }
          app.draw();
        }
      }
    )
  );
};

app.requestDailyPuzzleHint = function() {
  if (!authApi.getSessionToken()) {
    wx.showToast({ title: '请先登录', icon: 'none' });
    return;
  }
  wx.request(
    Object.assign(roomApi.meDailyPuzzleHintOptions(), {
      success: function(res) {
        var data = res.data;
        if (res.statusCode === 200 && data && data.hintText) {
          if (typeof wx.showModal === 'function') {
            wx.showModal({
              title: '提示',
              content: String(data.hintText),
              showCancel: false
            });
          } else {
            wx.showToast({ title: String(data.hintText), icon: 'none' });
          }
          return;
        }
        var msg =
          data && data.message
            ? String(data.message)
            : '暂无提示';
        wx.showToast({ title: msg, icon: 'none' });
      },
      fail: function() {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    })
  );
};

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
  app.pveHumanColor = Math.random() < 0.5 ? app.BLACK : app.WHITE;
  app.isRandomMatch = true;
  var applyFakeNameAndReset = function() {
    app.randomOpponentName =
      app.FAKE_OPPONENT_NAMES[
        Math.floor(Math.random() * app.FAKE_OPPONENT_NAMES.length)
      ];
    app.screen = 'game';
    app.resetGame();
  };
  if (typeof authApi === 'undefined' || !authApi.ensureSession) {
    applyFakeNameAndReset();
    return;
  }
  authApi.ensureSession(function(sessionOk) {
    if (!sessionOk || typeof wx === 'undefined' || !wx.request) {
      applyFakeNameAndReset();
      return;
    }
    wx.request(
      Object.assign(roomApi.roomApiRandomBotProfileOptions(), {
        success: function(res) {
          var payload = res.data;
          if (payload && typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (ePr) {
              payload = null;
            }
          }
          if (
            res.statusCode === 200 &&
            payload &&
            typeof payload.nickname === 'string' &&
            payload.nickname.trim()
          ) {
            if (typeof app.applyOnlineOpponentProfilePayload === 'function') {
              app.applyOnlineOpponentProfilePayload(payload);
            }
            app.randomOpponentName = payload.nickname.trim();
            app.screen = 'game';
            app.resetGame();
            return;
          }
          applyFakeNameAndReset();
        },
        fail: function() {
          applyFakeNameAndReset();
        }
      })
    );
  });
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
            /** 执子色与人机在哪一侧由首帧 STATE 同步（服务端可能对换座位，房主也可能执白） */
            app.onlineOppProfileFetched = false;
            app.onlineOppProfileRoomId = '';
            var fbPayload = res.data;
            if (fbPayload && typeof fbPayload === 'string') {
              try {
                fbPayload = JSON.parse(fbPayload);
              } catch (eFb) {
                fbPayload = null;
              }
            }
            if (
              fbPayload &&
              typeof app.applyOnlineOpponentProfilePayload === 'function'
            ) {
              app.applyOnlineOpponentProfilePayload(fbPayload);
            }
            app.screen = 'game';
            app.onlineToken = app.randomMatchHostCancelToken;
            app.randomMatchHostCancelToken = '';
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
  if (typeof app.stopUndoRejectFloatAnim === 'function') {
    app.stopUndoRejectFloatAnim();
  }
  app.undoRejectFloat = null;
  app.onlineUndoCancelPending = false;
  app.onlineDrawCancelPending = false;
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
  app.localDrawRequest = null;
  app.onlineUndoPending = false;
  app.onlineUndoRequesterColor = null;
  app.onlineDrawPending = false;
  app.onlineDrawRequesterColor = null;
  app.cancelMatchingTimers();
  app.randomMatchHostWaiting = false;
  app.disconnectOnline();
  app.isRandomMatch = false;
  app.isPvpLocal = false;
  app.isDailyPuzzle = false;
  app.dailyPuzzleMeta = null;
  app.dailyPuzzleMoves = [];
  app.dailyPuzzleInitialBoard = null;
  app.dailyPuzzleSubmitting = false;
  app.dailyPuzzleResultKind = '';
  app.dailyPuzzleSubmitActivityPointsDelta = null;
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
  app.localUndoRequest = null;
  app.localDrawRequest = null;
  app.disconnectOnline();
  app.isRandomMatch = false;
  app.isDailyPuzzle = false;
  app.isPvpLocal = true;
  /** 同桌：下方「我」与上方「对方」固定执黑/执白（与棋局手顺一致） */
  app.pveHumanColor = Math.random() < 0.5 ? app.BLACK : app.WHITE;
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
 * 双方都会调用；重复请求时服务端返回已结算的同一份分数（与先成功者一致）。
 *
 * @param {number} [matchRoundOverride] 本局局次；随机匹配连点「再来一局」时须用终局 STATE 的 matchRound，
 *   避免胜利动画延迟或下一局已开始后仍用 app.onlineMatchRound 导致局次错乱。
 */
app.maybeRequestOnlineGameSettle = function(matchRoundOverride) {
  if (
    !app.isPvpOnline ||
    !app.onlineRoomId ||
    app.onlineSettleSent ||
    app.onlineSpectatorMode
  ) {
    return;
  }
  if (!authApi.getSessionToken()) {
    return;
  }
  var steps = app.countStonesOnBoard(app.board);
  if (steps < 0 || steps > 256) {
    return;
  }
  var mrUse = app.onlineMatchRound;
  if (matchRoundOverride !== undefined && matchRoundOverride !== null) {
    var por = Number(matchRoundOverride);
    if (!isNaN(por) && por >= 1) {
      mrUse = por;
    }
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
    matchRound: mrUse,
    outcome: outcome,
    totalSteps: steps
  };
  if (
    app.resultKind === 'online_opponent_left' &&
    typeof app.onlineOppUserId === 'number' &&
    app.onlineOppUserId > 0
  ) {
    settleBody.runawayUserId = app.onlineOppUserId;
  }
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
            app.onlineSettleSent = false;
            return;
          }
          if (res.statusCode !== 200) {
            app.onlineSettleSent = false;
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
          if (
            d &&
            typeof d === 'object' &&
            d.data &&
            typeof d.data === 'object' &&
            d.blackEloAfter === undefined &&
            d.whiteEloAfter === undefined &&
            d.black_elo_after === undefined &&
            d.white_elo_after === undefined
          ) {
            d = d.data;
          }
          function settleNum(v) {
            if (typeof v === 'number' && !isNaN(v)) {
              return v;
            }
            var n = Number(v);
            return !isNaN(n) ? n : NaN;
          }
          function numField(obj, camel, snake) {
            if (!obj) {
              return NaN;
            }
            var v = obj[camel];
            if (v === undefined && snake) {
              v = obj[snake];
            }
            return settleNum(v);
          }
          if (d && d.gameId !== undefined && d.gameId !== null) {
            var gid = Number(d.gameId);
            if (!isNaN(gid)) {
              app.lastSettledGameId = gid;
            }
          }
          var bAfter = numField(d, 'blackEloAfter', 'black_elo_after');
          var wAfter = numField(d, 'whiteEloAfter', 'white_elo_after');
          if (d && isFinite(bAfter) && isFinite(wAfter)) {
            var bDelta = numField(d, 'blackEloDelta', 'black_elo_delta');
            var wDelta = numField(d, 'whiteEloDelta', 'white_elo_delta');
            var bApA = numField(
              d,
              'blackActivityPointsAfter',
              'black_activity_points_after'
            );
            var wApA = numField(
              d,
              'whiteActivityPointsAfter',
              'white_activity_points_after'
            );
            var bApD = numField(
              d,
              'blackActivityPointsDelta',
              'black_activity_points_delta'
            );
            var wApD = numField(
              d,
              'whiteActivityPointsDelta',
              'white_activity_points_delta'
            );
            app.lastSettleRating = {
              blackEloAfter: Math.round(bAfter),
              whiteEloAfter: Math.round(wAfter),
              blackEloDelta: isFinite(bDelta) ? bDelta : 0,
              whiteEloDelta: isFinite(wDelta) ? wDelta : 0
            };
            if (isFinite(bApA) && isFinite(wApA)) {
              app.lastSettleRating.blackActivityPointsAfter = Math.max(
                0,
                Math.round(bApA)
              );
              app.lastSettleRating.whiteActivityPointsAfter = Math.max(
                0,
                Math.round(wApA)
              );
              app.lastSettleRating.blackActivityPointsDelta = isFinite(bApD)
                ? bApD
                : 0;
              app.lastSettleRating.whiteActivityPointsDelta = isFinite(wApD)
                ? wApD
                : 0;
            }
            if (app.isPvpOnline) {
              var mineAfter =
                app.pvpOnlineYourColor === app.BLACK
                  ? app.lastSettleRating.blackEloAfter
                  : app.lastSettleRating.whiteEloAfter;
              app.homeRatingEloCache = mineAfter;
              var mineApD = NaN;
              if (isFinite(bApD) && isFinite(wApD)) {
                mineApD =
                  app.pvpOnlineYourColor === app.BLACK ? bApD : wApD;
              }
              if (isFinite(mineApD) && mineApD > 0) {
                app.startResultTuanPointsAnim(mineApD);
              }
            }
            app.draw();
          } else {
            app.onlineSettleSent = false;
          }
        },
        fail: function () {
          app.onlineSettleSent = false;
        }
      }
    )
  );
}

/** 联机：对方断线，判己方胜并弹出结算（对方离开） */
app.finishOnlineGameOpponentLeave = function() {
  if (!app.isPvpOnline || app.gameOver) {
    return;
  }
  app.gameOver = true;
  app.winner = app.pvpOnlineYourColor;
  app.resultKind = 'online_opponent_left';
  app.openResult();
};

app.openResult = function() {
  if (!app.gameOver) {
    return;
  }
  app.clearWinRevealTimer();
  app.winningLineCells = null;
  if (app.isPvpOnline) {
    /** 和棋/认输等终局后 winner 与「逃跑胜」不一致时，不得以 online_opponent_left 盖住服务端结果 */
    var keepOppLeftKind =
      app.resultKind === 'online_opponent_left' &&
      app.winner != null &&
      app.winner === app.pvpOnlineYourColor;
    if (app.onlineSettleRetryTimer != null) {
      clearTimeout(app.onlineSettleRetryTimer);
      app.onlineSettleRetryTimer = null;
    }
    app.maybeRequestOnlineGameSettle();
    app.onlineSettleRetryTimer = setTimeout(function () {
      app.onlineSettleRetryTimer = null;
      if (
        app.showResultOverlay &&
        app.isPvpOnline &&
        app.gameOver &&
        !app.lastSettleRating &&
        authApi.getSessionToken()
      ) {
        app.onlineSettleSent = false;
        app.maybeRequestOnlineGameSettle();
      }
    }, 1600);
    if (!keepOppLeftKind) {
      if (app.onlineSpectatorMode) {
        if (app.winner === null) {
          app.resultKind = 'online_draw';
        } else {
          app.resultKind = 'online_spectate';
        }
      } else if (app.winner === null) {
        app.resultKind = 'online_draw';
      } else {
        var wN = Number(app.winner);
        var myN = Number(app.pvpOnlineYourColor);
        if (!isNaN(wN) && !isNaN(myN) && wN === myN) {
          app.resultKind = 'online_win';
        } else {
          app.resultKind = 'online_lose';
        }
      }
    }
  } else if (app.isPvpLocal) {
    if (app.winner === null) {
      app.resultKind = 'pvp_draw';
    } else if (app.winner === app.BLACK) {
      app.resultKind = 'pvp_black_win';
    } else {
      app.resultKind = 'pvp_white_win';
    }
  } else if (app.isDailyPuzzle) {
    /**
     * 须以终局胜负为准：dailyPuzzleResultKind 可能残留上一局「人机胜」的 daily_puzzle_bot_win，
     * 若仍用其覆盖 resultKind，会出现玩家已胜却显示「挑战失败」。
     */
    var botCw =
      typeof app.dailyPuzzleBotColor === 'function'
        ? app.dailyPuzzleBotColor()
        : null;
    if (app.winner != null && botCw != null && app.winner === botCw) {
      app.resultKind = 'daily_puzzle_bot_win';
    } else if (app.dailyPuzzleResultKind === 'daily_puzzle_bot_win') {
      app.resultKind = 'daily_puzzle_solved';
    } else {
      app.resultKind =
        app.dailyPuzzleResultKind || 'daily_puzzle_solved';
    }
  } else if (app.winner === null) {
    app.resultKind = 'pve_draw';
  } else {
    app.resultKind = app.winner === app.pveHumanColor ? 'pve_win' : 'pve_lose';
  }
  app.onlineResultOverlaySticky = false;
  app.showResultOverlay = true;
  if (
    app.isDailyPuzzle &&
    app.dailyPuzzleSubmitActivityPointsDelta != null &&
    app.dailyPuzzleSubmitActivityPointsDelta > 0
  ) {
    var dpd = app.dailyPuzzleSubmitActivityPointsDelta;
    app.dailyPuzzleSubmitActivityPointsDelta = null;
    app.startResultTuanPointsAnim(dpd);
  }
  app.recordMatchHistoryFromGameEnd();
  app.screen = 'game';
  app.draw();
}

app.canShowOnlineReplayButton = function() {
  return app.isPvpOnline && !!app.onlineRoomId;
}

/**
 * 结算页 VS 区：执黑 / 执白 头像（与棋盘侧逻辑一致）。
 */
app.getResultVsAvatarImage = function(forBlack) {
  var L = app.computeBoardNameLabelLayout(app.layout);
  if (!L) {
    if (app.isDailyPuzzle) {
      var uBlack = app.dailyPuzzleUserColor === gomoku.BLACK;
      var mine = defaultAvatars.getMyAvatarImage();
      var g =
        defaultAvatars.getGuardianBotAvatarImage() ||
        defaultAvatars.getOpponentAvatarImage();
      if (forBlack) {
        return uBlack ? mine : g;
      }
      return uBlack ? g : mine;
    }
    if (!app.isPvpOnline && !app.isPvpLocal) {
      var hum0 = app.pveHumanColor;
      var mine0 = defaultAvatars.getMyAvatarImage();
      var g0 = app.isRandomMatch
        ? defaultAvatars.getOpponentAvatarImage()
        : defaultAvatars.getGuardianBotAvatarImage() ||
          defaultAvatars.getOpponentAvatarImage();
      if (forBlack) {
        return hum0 === gomoku.BLACK ? mine0 : g0;
      }
      return hum0 === gomoku.BLACK ? g0 : mine0;
    }
    return forBlack
      ? defaultAvatars.getImageForWeChatGender(1)
      : defaultAvatars.getImageForWeChatGender(2);
  }
  if (app.isPvpOnline) {
    var imBlack = app.pvpOnlineYourColor === gomoku.BLACK;
    if (forBlack) {
      return imBlack ? L.myImg : L.oppImg;
    }
    return imBlack ? L.oppImg : L.myImg;
  }
  if (app.isPvpLocal) {
    return forBlack
      ? defaultAvatars.getImageForWeChatGender(1)
      : defaultAvatars.getImageForWeChatGender(2);
  }
  if (app.isDailyPuzzle) {
    var imBlackUser = app.dailyPuzzleUserColor === gomoku.BLACK;
    if (forBlack) {
      return imBlackUser ? L.myImg : L.oppImg;
    }
    return imBlackUser ? L.oppImg : L.myImg;
  }
  var hum = app.pveHumanColor;
  if (forBlack) {
    return hum === gomoku.BLACK ? L.myImg : L.oppImg;
  }
  return hum === gomoku.WHITE ? L.myImg : L.oppImg;
}

function drawResultRoundedSquareAvatar(app, th, img, cx, cy, size, cornerR) {
  var ctx = app.ctx;
  var x = cx - size * 0.5;
  var y = cy - size * 0.5;
  ctx.save();
  app.roundRect(x, y, size, size, cornerR);
  ctx.clip();
  if (img && img.width && img.height) {
    var sw = Math.min(img.width, img.height);
    var sx = (img.width - sw) / 2;
    var sy = (img.height - sw) / 2;
    ctx.drawImage(img, sx, sy, sw, sw, x, y, size, size);
  } else {
    ctx.fillStyle = 'rgba(230, 230, 235, 0.95)';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = th && th.title ? th.title : '#333';
    ctx.font = 'bold 14px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', app.snapPx(cx), app.snapPx(cy));
  }
  ctx.restore();
  ctx.save();
  app.roundRect(x, y, size, size, cornerR);
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** 结算页守关头像：整图 contain 入圆角方，避免方裁切（须在 drawResultRoundedSquareAvatar 之后定义以便安全调用） */
function drawResultGuardianRoundedAvatar(app, th, img, cx, cy, size, cornerR) {
  var ctx = app.ctx;
  var x = cx - size * 0.5;
  var y = cy - size * 0.5;
  if (!img || !img.width || !img.height) {
    drawResultRoundedSquareAvatar(app, th, img, cx, cy, size, cornerR);
    return;
  }
  var iw = img.width;
  var ih = img.height;
  var inner = size * 0.9;
  var scale = Math.min(inner / iw, inner / ih);
  if (!isFinite(scale) || scale <= 0) {
    drawResultRoundedSquareAvatar(app, th, img, cx, cy, size, cornerR);
    return;
  }
  var dw = iw * scale;
  var dh = ih * scale;
  var dx = cx - dw * 0.5;
  var dy = cy - dh * 0.5;
  if (typeof app.roundRect !== 'function') {
    drawResultRoundedSquareAvatar(app, th, img, cx, cy, size, cornerR);
    return;
  }
  ctx.save();
  app.roundRect(x, y, size, size, cornerR);
  ctx.clip();
  ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
  ctx.restore();
  ctx.save();
  app.roundRect(x, y, size, size, cornerR);
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawResultConfetti(app, top, hBand) {
  var ctx = app.ctx;
  var W = app.W;
  var seed = 17;
  var k;
  var colors = ['#fbbf24', '#60a5fa', '#fb7185', '#34d399', '#a78bfa'];
  for (k = 0; k < 28; k++) {
    seed = (seed * 9301 + 49297) % 233280;
    var rx = (seed % 1000) / 1000;
    seed = (seed * 9301 + 49297) % 233280;
    var ry = (seed % 1000) / 1000;
    var x = rx * W;
    var y = top + ry * hBand;
    var r = 2 + (k % 4);
    ctx.fillStyle = colors[k % colors.length];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 联机结算页：仅自己一侧飘字，时长与 themeBubble 共用 RAF */
var RESULT_TUAN_POINTS_ANIM_MS = 1400;

app.stopResultTuanPointsAnim = function() {
  if (app.resultTuanPointsRafId != null) {
    app.themeBubbleCaf(app.resultTuanPointsRafId);
    app.resultTuanPointsRafId = null;
  }
  app.resultTuanPointsAnim = null;
};

/**
 * 本局团团积分增加 &gt; 0 时调用；对手侧不展示。
 * @param {number} delta 正整数
 */
app.startResultTuanPointsAnim = function(delta) {
  app.stopResultTuanPointsAnim();
  if (!(typeof delta === 'number') || delta <= 0) {
    return;
  }
  app.resultTuanPointsAnim = {
    startMs: Date.now(),
    delta: Math.floor(delta)
  };
  function loop() {
    if (!app.resultTuanPointsAnim) {
      app.resultTuanPointsRafId = null;
      return;
    }
    if (!app.showResultOverlay || (!app.isPvpOnline && !app.isDailyPuzzle)) {
      app.stopResultTuanPointsAnim();
      return;
    }
    var elapsed = Date.now() - app.resultTuanPointsAnim.startMs;
    if (elapsed >= RESULT_TUAN_POINTS_ANIM_MS) {
      app.stopResultTuanPointsAnim();
      app.draw();
      return;
    }
    app.draw();
    app.resultTuanPointsRafId = app.themeBubbleRaf(loop);
  }
  app.resultTuanPointsRafId = app.themeBubbleRaf(loop);
};

/**
 * 在「我」的头像上方绘制飘字（联机左侧为本人）；依赖 getResultOverlayLayout。
 */
function drawResultOverlayTuanPointsAnim(app, ctx, th, ly) {
  if (!app.resultTuanPointsAnim || (!app.isPvpOnline && !app.isDailyPuzzle)) {
    return;
  }
  if (!app.showResultOverlay) {
    return;
  }
  var anim = app.resultTuanPointsAnim;
  var elapsed = Date.now() - anim.startMs;
  var p = Math.min(1, elapsed / RESULT_TUAN_POINTS_ANIM_MS);
  if (p >= 1) {
    return;
  }
  var ease = 1 - (1 - p) * (1 - p);
  var yOff = -56 * ease;
  var alpha;
  if (p < 0.12) {
    alpha = p / 0.12;
  } else if (p > 0.42) {
    alpha = Math.max(0, 1 - (p - 0.42) / 0.58);
  } else {
    alpha = 1;
  }
  var cx = ly.vsLeftCx;
  var baseY = ly.vsCy - ly.avatarS * 0.42 + yOff;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 11px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = '#78716c';
  ctx.fillText(
    '团团积分',
    app.snapPx(cx),
    app.snapPx(baseY - 14)
  );
  ctx.font = 'bold 22px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = '#16a34a';
  ctx.shadowColor = 'rgba(22, 163, 74, 0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillText(
    '+' + anim.delta,
    app.snapPx(cx),
    app.snapPx(baseY + 6)
  );
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}

/**
 * resultKind 未写入时（如历史路径只拉了 showResultOverlay），按终局状态推断，避免标题落在默认「对局结束」。
 */
/**
 * 残局好友房：受邀执棋一方是否取胜（旁观/好友共用，依赖 STATE 人机标记）。
 * @returns {boolean|null} true 好友胜，false 好友负，null 非残局房或无法判断
 */
function onlinePuzzleFriendWon(app) {
  if (
    !app.isPvpOnline ||
    (!app.onlinePuzzleFriendRoom && !app.onlinePuzzleRoomFromWs)
  ) {
    return null;
  }
  if (app.winner == null) {
    return null;
  }
  var bBot = !!app.onlineBlackIsBotFlag;
  var wBot = !!app.onlineWhiteIsBotFlag;
  if (bBot === wBot) {
    return null;
  }
  var friendIsBlack = !bBot;
  var w = Number(app.winner);
  if (isNaN(w)) {
    return null;
  }
  if (friendIsBlack) {
    return w === gomoku.BLACK;
  }
  return w === gomoku.WHITE;
}

function inferOverlayResultKindWhenEmpty(app) {
  if (!app.gameOver) {
    return '';
  }
  if (app.isPvpOnline) {
    if (app.onlineSpectatorMode) {
      return app.winner == null ? 'online_draw' : 'online_spectate';
    }
    if (app.winner == null) {
      return 'online_draw';
    }
    var wN = Number(app.winner);
    var myN = Number(app.pvpOnlineYourColor);
    if (!isNaN(wN) && !isNaN(myN) && wN === myN) {
      return 'online_win';
    }
    return 'online_lose';
  }
  if (app.isDailyPuzzle) {
    return app.dailyPuzzleResultKind || 'daily_puzzle_solved';
  }
  if (app.isPvpLocal) {
    if (app.winner == null) {
      return 'pvp_draw';
    }
    return app.winner === gomoku.BLACK ? 'pvp_black_win' : 'pvp_white_win';
  }
  if (app.winner == null) {
    return 'pve_draw';
  }
  return app.winner === app.pveHumanColor ? 'pve_win' : 'pve_lose';
}

function resultOverlayTitlePack(app) {
  var rs = app.getUiTheme().result;
  var rk = app.resultKind;
  if (!rk) {
    rk = inferOverlayResultKindWhenEmpty(app);
  }
  var main = '对局结束';
  var sub = '';
  var titleColor = app.getUiTheme().title;
  var mood = 'draw';
  /** 联机残局房（房主创建或 STATE.puzzleRoom）：胜方展示「挑战成功」主标题 */
  var onlinePuzzle =
    !!app.isPvpOnline &&
    (!!app.onlinePuzzleFriendRoom || !!app.onlinePuzzleRoomFromWs);
  var winColorSub = '';
  if (app.winner != null && app.winner !== undefined) {
    winColorSub =
      Number(app.winner) === gomoku.WHITE ? '白棋获胜' : '黑棋获胜';
  }
  switch (rk) {
    case 'pve_win':
      mood = 'win';
      main = '胜利';
      sub = '恭喜战胜对手';
      titleColor = rs.win.title;
      break;
    case 'pve_lose':
      mood = 'lose';
      main = '失败';
      sub = '再接再厉';
      titleColor = rs.lose.title;
      break;
    case 'pve_draw':
      mood = 'draw';
      main = '和局';
      sub = '难分高下';
      titleColor = rs.draw.title;
      break;
    case 'pvp_black_win':
      mood = 'win';
      main = '黑方胜利';
      sub = '好友对战';
      titleColor = rs.win.title;
      break;
    case 'pvp_white_win':
      mood = 'win';
      main = '白方胜利';
      sub = '好友对战';
      titleColor = rs.win.title;
      break;
    case 'pvp_draw':
      mood = 'draw';
      main = '和局';
      sub = '好友对战';
      titleColor = rs.draw.title;
      break;
    case 'online_win':
      mood = 'win';
      if (onlinePuzzle) {
        main = '挑战成功';
        sub = winColorSub;
        if (app.onlineGameEndReason === 'MOVE_TIMEOUT') {
          sub = '对方思考超时';
        } else if (app.onlineGameEndReason === 'RESIGN') {
          sub = '对方认输';
        }
      } else {
        main = winColorSub;
        if (app.onlineGameEndReason === 'MOVE_TIMEOUT') {
          sub = '对方思考超时';
        } else if (app.onlineGameEndReason === 'RESIGN') {
          sub = '对方认输';
        }
      }
      titleColor = rs.win.title;
      break;
    case 'online_lose':
      mood = 'lose';
      if (onlinePuzzle) {
        main = '挑战失败';
        if (app.onlineGameEndReason === 'MOVE_TIMEOUT') {
          sub = '思考超时判负';
        } else if (app.onlineGameEndReason === 'RESIGN') {
          sub = '已认输';
        } else {
          sub = '人机获胜';
        }
      } else {
        main = '失败';
        if (app.onlineGameEndReason === 'MOVE_TIMEOUT') {
          sub = '思考超时判负';
        } else if (app.onlineGameEndReason === 'RESIGN') {
          sub = '已认输';
        }
      }
      titleColor = rs.lose.title;
      break;
    case 'online_draw':
      mood = 'draw';
      main = '和局';
      if (app.onlineGameEndReason === 'TIME_DRAW') {
        sub = '本局已超过30分钟';
      }
      titleColor = rs.draw.title;
      break;
    case 'online_opponent_left':
      mood = 'win';
      if (onlinePuzzle) {
        main = '挑战成功';
        sub = winColorSub;
      } else {
        main = winColorSub;
      }
      titleColor = rs.win.title;
      break;
    case 'online_spectate':
      if (onlinePuzzle && app.winner != null) {
        var pfw = onlinePuzzleFriendWon(app);
        if (pfw === true) {
          mood = 'win';
          main = '挑战成功';
          sub = winColorSub + ' · 旁观对局';
          titleColor = rs.win.title;
        } else if (pfw === false) {
          mood = 'lose';
          main = '挑战失败';
          sub = winColorSub + ' · 旁观对局';
          titleColor = rs.lose.title;
        } else {
          mood = 'draw';
          main =
            app.winner === gomoku.WHITE ? '白棋获胜' : '黑棋获胜';
          sub = '旁观对局';
          titleColor = rs.draw.title;
        }
      } else {
        mood = 'draw';
        main =
          app.winner === null
            ? '和局'
            : app.winner === gomoku.WHITE
              ? '白棋获胜'
              : '黑棋获胜';
        sub = '旁观对局';
        titleColor = rs.draw.title;
      }
      break;
    case 'daily_puzzle_solved':
      mood = 'win';
      main = '挑战成功';
      sub = '残局完成';
      titleColor = rs.win.title;
      break;
    case 'daily_puzzle_already':
      mood = 'draw';
      main = '今日已完成';
      sub = '明天再来';
      titleColor = rs.draw.title;
      break;
    case 'daily_puzzle_bot_win':
      mood = 'lose';
      main = '挑战失败';
      sub = '电脑获胜';
      titleColor = rs.lose.title;
      break;
    default:
      titleColor = app.getUiTheme().title;
  }
  return { main: main, sub: sub, titleColor: titleColor, mood: mood, rs: rs };
}

/** 棋盘页结算全屏层：几何与 drawResultOverlay / hitResultButton 一致 */
app.getResultOverlayLayout = function() {
  var W = app.W;
  var H = app.H;
  var sb = app.sys && app.sys.statusBarHeight ? app.sys.statusBarHeight : 0;
  var pack = resultOverlayTitlePack(app);
  var hasReplayDock = app.canShowOnlineReplayButton();
  var primaryW = Math.min(W - 44, 336);
  var primaryH = 50;
  var avatarS = 56;
  var dockH = 56;
  var statsH = 44;
  var gapPrimaryStats = 22;
  var clusterPadV = 14;

  var safeInsetBottom = 0;
  if (app.sys && app.sys.safeArea && typeof app.sys.safeArea.bottom === 'number') {
    safeInsetBottom = Math.max(0, H - app.sys.safeArea.bottom);
  }
  var dockBottomPad = 10 + Math.min(safeInsetBottom, 28);
  var dockCy = H - dockBottomPad - dockH * 0.5;
  var dockZoneTop = dockCy - dockH * 0.62 - 10;

  var trophyCy = sb + 28;
  var titleMainY;
  if (pack.mood === 'win') {
    titleMainY = sb + 96;
  } else {
    titleMainY = sb + 56;
  }
  var headerEndY = titleMainY + (pack.sub ? 40 : 14);

  var clusterH = avatarS + statsH + gapPrimaryStats + primaryH;
  var midZoneTop = headerEndY + 18;
  var midZoneBottom = dockZoneTop;
  var midH = midZoneBottom - midZoneTop;
  if (midH < clusterH + 24) {
    midZoneTop = Math.max(headerEndY + 8, midZoneBottom - clusterH - 24);
  }
  var clusterCenterY = midZoneTop + (midZoneBottom - midZoneTop) * 0.5;
  var clusterTop = clusterCenterY - clusterH * 0.5;
  if (clusterTop < headerEndY + 8) {
    clusterTop = headerEndY + 8;
  }
  if (clusterTop + clusterH > dockZoneTop - 6) {
    clusterTop = Math.max(headerEndY + 8, dockZoneTop - clusterH - 6);
  }

  var vsCy = clusterTop + avatarS * 0.5;
  var primaryCy =
    clusterTop + avatarS + statsH + gapPrimaryStats + primaryH * 0.5;

  var midX = W * 0.5;
  var pairHalf = Math.min(108, Math.max(76, W * 0.27));

  var cardW = Math.min(W - 32, 348);
  var cardH = clusterH + clusterPadV * 2;
  var cardX = (W - cardW) * 0.5;
  var cardY = clusterTop - clusterPadV;
  var cardR = Math.min(20, cardH * 0.12);

  /** 联机回应方：与悔棋/和棋一致用 wx.showModal，不在画布上画同意/拒绝 */
  var showRematchRespond = false;
  var showRematchInviteHint =
    app.isPvpOnline &&
    app.gameOver &&
    app.onlineRematchRequesterColor != null &&
    app.onlineRematchRequesterColor !== app.pvpOnlineYourColor;
  var rematchGap = 10;
  var rematchBtnW = (primaryW - rematchGap) * 0.5;
  var rematchAcceptCx = midX - primaryW * 0.25 - rematchGap * 0.25;
  var rematchDeclineCx = midX + primaryW * 0.25 + rematchGap * 0.25;

  return {
    fullPage: true,
    W: W,
    H: H,
    sb: sb,
    trophyCy: trophyCy,
    titleMainY: titleMainY,
    vsCy: vsCy,
    vsLeftCx: midX - pairHalf,
    vsRightCx: midX + pairHalf,
    vsTextY: vsCy,
    avatarS: avatarS,
    avatarR: 12,
    primaryCx: midX,
    primaryCy: primaryCy,
    primaryW: primaryW,
    primaryH: primaryH,
    dockCy: dockCy,
    dockH: dockH,
    hasReplayDock: hasReplayDock,
    clusterTop: clusterTop,
    clusterH: clusterH,
    cardX: cardX,
    cardY: cardY,
    cardW: cardW,
    cardH: cardH,
    cardR: cardR,
    showRematchRespond: showRematchRespond,
    showRematchInviteHint: showRematchInviteHint,
    rematchBtnW: rematchBtnW,
    rematchAcceptCx: rematchAcceptCx,
    rematchDeclineCx: rematchDeclineCx
  };
}

/**
 * 结算全屏层 VS 区方头像命中（与 getResultOverlayLayout 一致）。
 * 与 drawResultOverlay 一致：左为我、右为对手（与执子色无关）。
 */
app.hitResultOverlayAvatar = function(clientX, clientY) {
  if (app.screen !== 'game') {
    return null;
  }
  if (
    !app.showResultOverlay ||
    (!app.gameOver && !app.onlineResultOverlaySticky)
  ) {
    return null;
  }
  var ly = app.getResultOverlayLayout();
  var pad = 10;
  var half = ly.avatarS * 0.5 + pad;
  function inSquare(cx, cy) {
    return (
      Math.abs(clientX - cx) <= half && Math.abs(clientY - cy) <= half
    );
  }
  var hitLeft = inSquare(ly.vsLeftCx, ly.vsCy);
  var hitRight = inSquare(ly.vsRightCx, ly.vsCy);
  if (!hitLeft && !hitRight) {
    return null;
  }
  if (hitLeft && hitRight) {
    var dl =
      Math.abs(clientX - ly.vsLeftCx) + Math.abs(clientY - ly.vsCy);
    var dr =
      Math.abs(clientX - ly.vsRightCx) + Math.abs(clientY - ly.vsCy);
    hitLeft = dl <= dr;
    hitRight = !hitLeft;
  }
  return hitLeft ? 'my' : 'opp';
};

app.drawResultOverlay = function() {
  var th = app.getUiTheme();
  var pack = resultOverlayTitlePack(app);
  var rs = pack.rs;
  var ctx = app.ctx;
  var bgG = ctx.createLinearGradient(0, 0, 0, app.H);
  if (th.bg && th.bg.length >= 3) {
    bgG.addColorStop(0, th.bg[0]);
    bgG.addColorStop(0.52, th.bg[1]);
    bgG.addColorStop(1, th.bg[2]);
  } else {
    bgG.addColorStop(0, rs.defaultEnd);
    bgG.addColorStop(1, rs.defaultEnd);
  }
  ctx.fillStyle = bgG;
  ctx.fillRect(0, 0, app.W, app.H);

  var ly = app.getResultOverlayLayout();
  if (pack.mood === 'win') {
    drawResultConfetti(app, ly.sb + 4, 100);
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83C\uDFC6', app.snapPx(app.W * 0.5), app.snapPx(ly.trophyCy));
  }

  render.drawText(
    ctx,
    pack.main,
    app.W * 0.5,
    ly.titleMainY,
    30,
    pack.titleColor,
    'bold'
  );
  if (pack.sub) {
    render.drawText(
      ctx,
      pack.sub,
      app.W * 0.5,
      ly.titleMainY + 34,
      14,
      rs.sub,
      'normal'
    );
  }
  var imRematchRequester =
    app.isPvpOnline &&
    app.onlineRematchRequesterColor != null &&
    app.onlineRematchRequesterColor === app.pvpOnlineYourColor;
  if (imRematchRequester) {
    render.drawText(
      ctx,
      '等待对方接受再来一局…',
      app.W * 0.5,
      ly.titleMainY + 52,
      13,
      rs.sub,
      'normal'
    );
  }

  ctx.save();
  ctx.shadowColor = 'rgba(55, 48, 40, 0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = rs.secondaryFill;
  ctx.strokeStyle = rs.secondaryStroke;
  ctx.lineWidth = 1.25;
  app.roundRect(ly.cardX, ly.cardY, ly.cardW, ly.cardH, ly.cardR);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.stroke();
  ctx.restore();

  /** 结算 VS 区：一律「左我右对手」（与棋盘旁头像语义一致）；勿用左黑右白，否则执白时头像与分数会左右对调 */
  var Lvs = app.computeBoardNameLabelLayout(app.layout);
  var imgLeft;
  var imgRight;
  if (Lvs) {
    imgLeft = Lvs.myImg;
    imgRight = Lvs.oppImg;
  } else {
    var msAv = app.getMyAssignedStoneColor();
    if (msAv === gomoku.BLACK || msAv === gomoku.WHITE) {
      var meBlackAv = msAv === gomoku.BLACK;
      imgLeft = app.getResultVsAvatarImage(meBlackAv);
      imgRight = app.getResultVsAvatarImage(!meBlackAv);
    } else {
      imgLeft = app.getResultVsAvatarImage(true);
      imgRight = app.getResultVsAvatarImage(false);
    }
  }
  var gBotImg = defaultAvatars.getGuardianBotAvatarImage();
  function drawVsResultAvatar(img, vsCx, vsCy) {
    if (
      gBotImg &&
      img === gBotImg &&
      img &&
      img.width &&
      img.height
    ) {
      drawResultGuardianRoundedAvatar(
        app,
        th,
        img,
        vsCx,
        vsCy,
        ly.avatarS,
        ly.avatarR
      );
    } else {
      drawResultRoundedSquareAvatar(
        app,
        th,
        img,
        vsCx,
        vsCy,
        ly.avatarS,
        ly.avatarR
      );
    }
  }
  drawVsResultAvatar(imgLeft, ly.vsLeftCx, ly.vsCy);
  drawVsResultAvatar(imgRight, ly.vsRightCx, ly.vsCy);

  ctx.font = 'bold 28px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.pageIndicator != null ? th.pageIndicator : '#ea580c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', app.snapPx(app.W * 0.5), app.snapPx(ly.vsTextY));

  function eloLine(forBlack) {
    if (app.isDailyPuzzle) {
      return { elo: '--', delta: '', dNeg: false, dZero: true };
    }
    var sr = app.lastSettleRating;
    if (sr) {
      var e = forBlack ? sr.blackEloAfter : sr.whiteEloAfter;
      var d = forBlack ? sr.blackEloDelta : sr.whiteEloDelta;
      var elo = String(e);
      var deltaStr = '';
      var dNeg = false;
      var dZero = false;
      if (typeof d === 'number') {
        dNeg = d < 0;
        dZero = d === 0;
        deltaStr = '(' + (d > 0 ? '+' : '') + d + ')';
      }
      return {
        elo: elo,
        delta: deltaStr,
        dNeg: dNeg,
        dZero: dZero
      };
    }
    if (app.isPvpOnline) {
      var imBlackOnline = Number(app.pvpOnlineYourColor) === gomoku.BLACK;
      var isMeOnline = forBlack === imBlackOnline;
      if (
        (app.onlinePuzzleFriendRoom || app.onlinePuzzleRoomFromWs) &&
        !sr
      ) {
        if (isMeOnline) {
          var eloPuzzleMe =
            typeof app.homeRatingEloCache === 'number' &&
            isFinite(app.homeRatingEloCache)
              ? String(Math.round(app.homeRatingEloCache))
              : '—';
          return { elo: eloPuzzleMe, delta: '', dNeg: false, dZero: true };
        }
        return { elo: '人机', delta: '', dNeg: false, dZero: true };
      }
      return { elo: '--', delta: '', dNeg: false, dZero: false };
    }
    if (app.isPvpLocal) {
      return { elo: '--', delta: '', dNeg: false, dZero: false };
    }
    var hum = app.pveHumanColor;
    var humanOnBlack = hum === gomoku.BLACK;
    var showHuman = forBlack === humanOnBlack;
    if (showHuman && typeof app.homeRatingEloCache === 'number') {
      return {
        elo: String(Math.round(app.homeRatingEloCache)),
        delta: '',
        dNeg: false,
        dZero: false
      };
    }
    return { elo: '--', delta: '', dNeg: false, dZero: false };
  }

  var lb;
  var lw;
  if (app.isPvpOnline) {
    var meBlack = Number(app.pvpOnlineYourColor) === gomoku.BLACK;
    lb = eloLine(meBlack);
    lw = eloLine(!meBlack);
  } else {
    var msElo = app.getMyAssignedStoneColor();
    if (msElo === gomoku.BLACK || msElo === gomoku.WHITE) {
      var meBlackE = msElo === gomoku.BLACK;
      lb = eloLine(meBlackE);
      lw = eloLine(!meBlackE);
    } else {
      lb = eloLine(true);
      lw = eloLine(false);
    }
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.fillStyle = th.title;
  ctx.fillText(lb.elo, app.snapPx(ly.vsLeftCx), app.snapPx(ly.vsCy + ly.avatarS * 0.5 + 16));
  ctx.fillText(lw.elo, app.snapPx(ly.vsRightCx), app.snapPx(ly.vsCy + ly.avatarS * 0.5 + 16));
  ctx.font = '600 14px "PingFang SC","Hiragino Sans GB",sans-serif';
  if (lb.delta) {
    ctx.fillStyle = lb.dNeg ? '#dc2626' : lb.dZero ? '#64748b' : '#16a34a';
    ctx.fillText(
      lb.delta,
      app.snapPx(ly.vsLeftCx),
      app.snapPx(ly.vsCy + ly.avatarS * 0.5 + 34)
    );
  }
  if (lw.delta) {
    ctx.fillStyle = lw.dNeg ? '#dc2626' : lw.dZero ? '#64748b' : '#16a34a';
    ctx.fillText(
      lw.delta,
      app.snapPx(ly.vsRightCx),
      app.snapPx(ly.vsCy + ly.avatarS * 0.5 + 34)
    );
  }

  drawResultOverlayTuanPointsAnim(app, ctx, th, ly);

  var px0 = ly.primaryCx - ly.primaryW * 0.5;
  var py0 = ly.primaryCy - ly.primaryH * 0.5;
  if (ly.showRematchInviteHint) {
    ctx.font = '600 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = rs.sub != null ? rs.sub : '#78716c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      '请在弹窗中选择同意或拒绝',
      app.snapPx(ly.primaryCx),
      app.snapPx(ly.primaryCy)
    );
  } else {
    var primaryLabel = '再来一局';
    var pinkG = ctx.createLinearGradient(px0, py0, px0, py0 + ly.primaryH);
    pinkG.addColorStop(0, '#fce7f3');
    pinkG.addColorStop(0.45, '#f9a8d4');
    pinkG.addColorStop(1, '#ec4899');
    ctx.shadowColor = 'rgba(236, 72, 153, 0.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = pinkG;
    app.roundRect(px0, py0, ly.primaryW, ly.primaryH, ly.primaryH * 0.5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.25;
    app.roundRect(px0 + 0.5, py0 + 0.5, ly.primaryW - 1, ly.primaryH - 1, ly.primaryH * 0.5);
    ctx.stroke();
    ctx.font = 'bold 17px "PingFang SC","Hiragino Sans GB",sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      '\u2709 ' + primaryLabel,
      app.snapPx(ly.primaryCx),
      app.snapPx(ly.primaryCy)
    );
  }

  var dockY = ly.dockCy;
  var nDock = ly.hasReplayDock ? 3 : 2;
  var colW = app.W / nDock;
  var di;
  var dockLabels =
    nDock === 3 ? ['首页', '回放', '继续'] : ['首页', '继续'];
  var dockIcons = nDock === 3 ? ['🏠', '🎬', '↻'] : ['🏠', '↻'];
  var dockTop = dockY - ly.dockH * 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, dockTop, app.W, ly.dockH);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, dockTop);
  ctx.lineTo(app.W, dockTop);
  ctx.stroke();
  var dockLabelColor = '#8f887f';
  var dockIconMuted = '#a8a29e';
  for (di = 0; di < nDock; di++) {
    var cx = colW * (di + 0.5);
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dockIconMuted;
    ctx.fillText(dockIcons[di], app.snapPx(cx), app.snapPx(dockY - 10));
    ctx.font =
      '500 12px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = dockLabelColor;
    ctx.fillText(dockLabels[di], app.snapPx(cx), app.snapPx(dockY + 14));
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  for (di = 1; di < nDock; di++) {
    var lx = colW * di;
    ctx.beginPath();
    ctx.moveTo(lx, dockY - ly.dockH * 0.32);
    ctx.lineTo(lx, dockY + ly.dockH * 0.32);
    ctx.stroke();
  }

  app.drawThemeChrome(th);
}

};
