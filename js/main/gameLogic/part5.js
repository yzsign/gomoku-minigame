/**
 * Auto-split from gameLogic.js (part 5)
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

app.drawPieceSkinModalOneCard = function(rx, ry, rw, rh, entry, gidx, baseClassic, th) {
  th = th || (typeof app.getUiTheme === 'function' ? app.getUiTheme() : null);
  var U =
    th && typeof app.shopModalUiFromTheme === 'function'
      ? app.shopModalUiFromTheme(th)
      : null;
  var focused = gidx === app.pieceSkinModalPendingIdx;
  var rr = app.rpx(18);
  var cardPad = app.rpx(18);
  var midX = rx + rw / 2;
  var titleFont = app.rpx(28);
  var statusFont = app.rpx(22);
  var gapStoneTitle = app.rpx(10);
  var titleLineH = app.rpx(32);
  var isPointsRedeem =
    entry &&
    entry.rowStatus === 'points' &&
    entry.costPoints &&
    entry.costPoints > 0;
  var statusReserve = isPointsRedeem ? app.rpx(40) : app.rpx(38);
  var innerTop = ry + cardPad;
  var innerBottom = ry + rh - cardPad;
  var statusBandTop = innerBottom - statusReserve;
  var contentBottom = statusBandTop;
  var cyRegion = (innerTop + contentBottom) / 2;
  var clusterShift = (gapStoneTitle + titleLineH) / 2;

  app.ctx.save();
  if (focused) {
    app.ctx.shadowColor = U ? U.focusShadow : 'rgba(224, 124, 46, 0.28)';
    app.ctx.shadowBlur = app.rpx(14);
    app.ctx.shadowOffsetY = app.rpx(5);
  }
  var bgGrad = app.ctx.createLinearGradient(rx, ry, rx, ry + rh);
  bgGrad.addColorStop(0, U ? U.cardG0 : '#fffefb');
  bgGrad.addColorStop(1, U ? U.cardG1 : '#f5f1eb');
  app.ctx.fillStyle = bgGrad;
  app.roundRect(rx, ry, rw, rh, rr);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.strokeStyle = focused
    ? U
      ? U.focusStroke
      : '#e07c2e'
    : U
      ? U.stroke
      : 'rgba(200, 188, 172, 0.85)';
  app.ctx.lineWidth = focused ? app.rpx(2.25) : app.rpx(1.25);
  app.roundRect(rx, ry, rw, rh, rr);
  app.ctx.stroke();
  app.ctx.restore();

  var pr = app.rpx(21);
  if (entry.id === 'tuan_moe' || entry.id === 'qingtao_libai') {
    pr = app.rpx(26);
  }
  var gapBw = app.rpx(18);
  var cyPv = cyRegion - clusterShift;
  var nameY = cyPv + pr + gapStoneTitle + titleLineH / 2;
  var catalogLabelX = midX;
  var catalogLabelAlign = 'center';
  /** 主题卡：名称竖排在图右侧 */
  var catalogLabelVertical = false;
  /** 主题卡专用 font（宋体系 + 略大字号）；非主题时为空 */
  var themeShopLabelFont = '';
  var themeLabelCx = midX;
  var centerDist = 2 * pr + gapBw;
  var statusY = innerBottom - app.rpx(13);

  if (entry && themes.getShopCategory(entry) === themes.SHOP_CATEGORY_THEME) {
    var themePvw = app.rpx(158);
    var themePvh = app.rpx(106);
    var gapImgText = app.rpx(5) + 5;
    var themeTitlePx = app.rpx(31);
    themeShopLabelFont =
      '600 ' +
      themeTitlePx +
      'px "Songti SC","STSong","SimSun","PingFang SC","Microsoft YaHei",serif';
    app.ctx.font = themeShopLabelFont;
    var themeLabLayout = themes.getPieceSkinCatalogLabel(entry);
    var maxChW = 0;
    var cix;
    for (cix = 0; cix < themeLabLayout.length; cix++) {
      var chW = app.ctx.measureText(themeLabLayout.charAt(cix)).width;
      if (chW > maxChW) {
        maxChW = chW;
      }
    }
    if (!(maxChW > 0)) {
      maxChW = themeTitlePx;
    }

    var shopThemeImg =
      entry.id === 'mint'
        ? app.shopThemeMintBoardImg
        : entry.id === 'ink'
          ? app.shopThemeInkBoardImg
          : null;

    var dw;
    var dh;
    if (shopThemeImg && shopThemeImg.width && shopThemeImg.height) {
      var iw0 = shopThemeImg.width;
      var ih0 = shopThemeImg.height;
      var sc0 = Math.min(themePvw / iw0, themePvh / ih0);
      dw = iw0 * sc0;
      dh = ih0 * sc0;
    } else {
      dw = themePvw;
      dh = themePvh;
    }

    var clusterW = dw + gapImgText + maxChW;
    var contentLeft = midX - clusterW / 2;
    cyPv = cyRegion;
    var themeImgCx = contentLeft + dw / 2;
    var imgLeft = themeImgCx - themePvw / 2;
    var themeClipX = imgLeft;
    var themeClipY = cyRegion - themePvh / 2;
    nameY = cyRegion;
    catalogLabelVertical = true;
    themeLabelCx = contentLeft + dw + gapImgText + maxChW / 2;
    catalogLabelAlign = 'center';

    var thm = themes.getTheme(entry.id);
    var pvw = themePvw;
    var pvh = themePvh;
    app.ctx.save();
    if (entry.locked) {
      app.ctx.globalAlpha = 0.78;
    }
    if (shopThemeImg && shopThemeImg.width && shopThemeImg.height) {
      var brPrev = app.rpx(10);
      var bx = themeClipX;
      var by = themeClipY;
      app.ctx.beginPath();
      app.roundRect(bx, by, pvw, pvh, brPrev);
      app.ctx.clip();
      app.ctx.drawImage(
        shopThemeImg,
        app.snapPx(themeImgCx - dw * 0.5),
        app.snapPx(cyPv - dh * 0.5),
        dw,
        dh
      );
    } else {
      app.drawPieceSkinModalThemeBoardPreview(themeImgCx, cyPv, pvw, pvh, thm);
    }
    app.ctx.restore();
  } else if (entry && themes.getShopCategory(entry) === themes.SHOP_CATEGORY_CONSUMABLE) {
    /** 与主题卡一致：左侧方形预览 + 右侧竖排品名，避免大图与底栏文案抢垂直空间 */
    var daggerPvW = app.rpx(118);
    var daggerPvH = app.rpx(118);
    var gapDaggerText = app.rpx(6) + 4;
    var daggerTitlePx = app.rpx(31);
    themeShopLabelFont =
      '600 ' +
      daggerTitlePx +
      'px "Songti SC","STSong","SimSun","PingFang SC","Microsoft YaHei",serif';
    app.ctx.font = themeShopLabelFont;
    var daggerLabLayout = themes.getPieceSkinCatalogLabel(entry);
    var maxDaggerChW = 0;
    var dci;
    for (dci = 0; dci < daggerLabLayout.length; dci++) {
      var dchW = app.ctx.measureText(daggerLabLayout.charAt(dci)).width;
      if (dchW > maxDaggerChW) {
        maxDaggerChW = dchW;
      }
    }
    if (!(maxDaggerChW > 0)) {
      maxDaggerChW = daggerTitlePx;
    }
    var clusterWDagger = daggerPvW + gapDaggerText + maxDaggerChW;
    var contentLeftDagger = midX - clusterWDagger / 2;
    cyPv = cyRegion;
    var daggerImgCx = contentLeftDagger + daggerPvW / 2;
    nameY = cyRegion;
    catalogLabelVertical = true;
    themeLabelCx = contentLeftDagger + daggerPvW + gapDaggerText + maxDaggerChW / 2;
    catalogLabelAlign = 'center';

    var dImg =
      entry.consumableKind === 'love' || entry.id === 'love_skill'
        ? app.shopConsumableLovePreviewImg
        : app.shopConsumableDaggerPreviewImg;
    var brDag = app.rpx(10);
    var clipXD = contentLeftDagger;
    var clipYD = cyRegion - daggerPvH / 2;
    app.ctx.save();
    app.ctx.beginPath();
    app.roundRect(clipXD, clipYD, daggerPvW, daggerPvH, brDag);
    app.ctx.clip();
    if (dImg && dImg.width && dImg.height) {
      var scD = Math.min(daggerPvW / dImg.width, daggerPvH / dImg.height);
      var dw = dImg.width * scD;
      var dh = dImg.height * scD;
      app.ctx.drawImage(
        dImg,
        app.snapPx(daggerImgCx - dw * 0.5),
        app.snapPx(cyPv - dh * 0.5),
        dw,
        dh
      );
    } else {
      app.drawPieceSkinModalPlaceholderPieces(daggerImgCx, cyPv, app.rpx(16));
    }
    app.ctx.restore();
    app.ctx.strokeStyle = U ? U.stroke : 'rgba(200, 188, 172, 0.65)';
    app.ctx.lineWidth = app.rpx(1.1);
    app.roundRect(clipXD, clipYD, daggerPvW, daggerPvH, brDag);
    app.ctx.stroke();
  } else {
  /** 未解锁也绘制真实棋子预览（贴图/渐变），便于「看见皮肤长什么样」；锁定态略降低不透明度 */
  var skinMeta = entry.id && themes.PIECE_SKINS[entry.id];
  if (skinMeta && !skinMeta.followTheme) {
    var pTh = app.enrichPieceSkinTheme(
      themes.applyPieceSkin(baseClassic, entry.id),
      entry.id
    );
    var pb = pTh.pieces.black;
    var pw = pTh.pieces.white;
    app.ctx.save();
    if (entry.locked) {
      app.ctx.globalAlpha = 0.78;
    }
    render.drawStonePiece(
      app.ctx,
      midX - centerDist / 2,
      cyPv,
      pr,
      true,
      pb,
      pw,
      pTh
    );
    render.drawStonePiece(
      app.ctx,
      midX + centerDist / 2,
      cyPv,
      pr,
      false,
      pb,
      pw,
      pTh
    );
    app.ctx.restore();
  } else {
    app.drawPieceSkinModalPlaceholderPieces(midX, cyPv, pr);
  }
  }

  if (catalogLabelVertical && themeShopLabelFont) {
    app.ctx.font = themeShopLabelFont;
  } else {
    app.ctx.font = '500 ' + titleFont + 'px ' + app.PIECE_SKIN_FONT_UI;
  }
  app.ctx.fillStyle = U && U.title ? U.title : '#3d342c';
  app.ctx.textAlign = catalogLabelVertical ? 'center' : catalogLabelAlign;
  app.ctx.textBaseline = 'middle';
  var catLab = themes.getPieceSkinCatalogLabel(entry);
  if (catalogLabelVertical) {
    var vStep = app.rpx(38);
    var vn = catLab.length;
    var vStartY = nameY - ((vn - 1) * vStep) / 2;
    var vi;
    for (vi = 0; vi < vn; vi++) {
      app.ctx.fillText(
        catLab.charAt(vi),
        app.snapPx(themeLabelCx),
        app.snapPx(vStartY + vi * vStep)
      );
    }
  } else {
    app.ctx.fillText(
      catLab,
      app.snapPx(catalogLabelAlign === 'center' ? midX : catalogLabelX),
      app.snapPx(nameY)
    );
  }

  app.ctx.strokeStyle = U ? U.statusSep : 'rgba(92, 75, 58, 0.1)';
  app.ctx.lineWidth = app.rpx(1);
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(rx + cardPad), app.snapPx(statusBandTop));
  app.ctx.lineTo(app.snapPx(rx + rw - cardPad), app.snapPx(statusBandTop));
  app.ctx.stroke();

  if (isPointsRedeem) {
    var rowMidY = innerBottom - app.rpx(20);
    var btnH = app.rpx(26);
    var btnW = app.rpx(76);
    var btnL = rx + rw - cardPad - btnW;
    var btnTop = rowMidY - btnH / 2;
    var gapBeforeBtn = app.rpx(8);
    var pointsSlotLeft = rx + cardPad;
    var pointsSlotRight = btnL - gapBeforeBtn;
    var pointsTextCx = (pointsSlotLeft + pointsSlotRight) / 2;
    var holdCt = null;
    if (entry.kind === 'consumable') {
      if (entry.consumableKind === 'dagger' || entry.id === 'dagger_skill') {
        holdCt =
          typeof themes.getConsumableDaggerCount === 'function'
            ? themes.getConsumableDaggerCount()
            : null;
      } else if (entry.consumableKind === 'love' || entry.id === 'love_skill') {
        holdCt =
          typeof themes.getConsumableLoveCount === 'function'
            ? themes.getConsumableLoveCount()
            : null;
      }
    }
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    if (holdCt != null) {
      app.ctx.font = app.rpx(16) + 'px ' + app.PIECE_SKIN_FONT_UI;
      app.ctx.fillStyle = U && U.muted ? U.muted : '#8a7868';
      app.ctx.fillText(
        '持有' + holdCt + '个',
        app.snapPx(pointsTextCx),
        app.snapPx(rowMidY - app.rpx(11))
      );
    }
    app.ctx.font = app.rpx(18) + 'px ' + app.PIECE_SKIN_FONT_UI;
    app.ctx.fillStyle = U ? U.pointsCost : '#b08040';
    app.ctx.fillText(
      entry.costPoints + '积分',
      app.snapPx(pointsTextCx),
      app.snapPx(holdCt != null ? rowMidY + app.rpx(10) : rowMidY)
    );
    var gBtn = app.ctx.createLinearGradient(btnL, btnTop, btnL, btnTop + btnH);
    if (U) {
      gBtn.addColorStop(0, U.redeemBtnG0);
      gBtn.addColorStop(1, U.redeemBtnG1);
    } else {
      gBtn.addColorStop(0, '#f0a030');
      gBtn.addColorStop(1, '#d97820');
    }
    app.ctx.fillStyle = gBtn;
    app.roundRect(btnL, btnTop, btnW, btnH, app.rpx(6));
    app.ctx.fill();
    app.ctx.strokeStyle = U
      ? th.btnPrimaryStroke || 'rgba(180, 120, 40, 0.35)'
      : 'rgba(180, 120, 40, 0.35)';
    app.ctx.lineWidth = app.rpx(1);
    app.roundRect(btnL, btnTop, btnW, btnH, app.rpx(6));
    app.ctx.stroke();
    app.ctx.font = '600 ' + app.rpx(18) + 'px ' + app.PIECE_SKIN_FONT_UI;
    app.ctx.fillStyle = '#fffef9';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.fillText(
      '兑换',
      app.snapPx(btnL + btnW / 2),
      app.snapPx(rowMidY)
    );
  } else {
    var st = app.pieceSkinModalCardStatusStyle(entry, th);
    var statusLine = st && st.text != null ? String(st.text) : '';
    app.ctx.font = statusFont + 'px ' + app.PIECE_SKIN_FONT_UI;
    app.ctx.fillStyle = st && st.fill ? st.fill : '#8a7a68';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    if (statusLine) {
      app.ctx.fillText(statusLine, app.snapPx(midX), app.snapPx(statusY));
    }
  }

  var equippedTheme =
    entry &&
    themes.getShopCategory(entry) === themes.SHOP_CATEGORY_THEME &&
    app.themeId === entry.id;
  var equippedPiece =
    entry &&
    themes.getShopCategory(entry) === themes.SHOP_CATEGORY_PIECE_SKIN &&
    app.pieceSkinId &&
    entry.id === app.pieceSkinId;
  var equippedDagger =
    entry &&
    themes.getShopCategory(entry) === themes.SHOP_CATEGORY_CONSUMABLE &&
    (entry.consumableKind === 'dagger' || entry.id === 'dagger_skill') &&
    typeof themes.isDaggerSkillEquipped === 'function' &&
    themes.isDaggerSkillEquipped();
  var equippedLove =
    entry &&
    themes.getShopCategory(entry) === themes.SHOP_CATEGORY_CONSUMABLE &&
    (entry.consumableKind === 'love' || entry.id === 'love_skill') &&
    typeof themes.isLoveSkillEquipped === 'function' &&
    themes.isLoveSkillEquipped();
  if (equippedTheme || equippedPiece || equippedDagger || equippedLove) {
    var tagText = '已装备';
    var tagFontPx = app.rpx(20);
    app.ctx.font = '600 ' + tagFontPx + 'px ' + app.PIECE_SKIN_FONT_UI;
    var tw = app.ctx.measureText(tagText).width;
    /** 右上角斜标：↘；clip 与卡片同圆角；渐变+描边+字阴影 */
    var bandW = Math.max(tw + app.rpx(52), app.rpx(124));
    var bandH = app.rpx(28);
    var bandR = app.rpx(4);
    var cornerOff = app.rpx(36);
    var bx = -bandW / 2;
    var by = -bandH / 2;
    app.ctx.save();
    app.ctx.beginPath();
    app.roundRect(rx, ry, rw, rh, rr);
    app.ctx.clip();
    app.ctx.translate(rx + rw - cornerOff, ry + cornerOff);
    app.ctx.rotate(Math.PI / 4);
    var gRibbon = app.ctx.createLinearGradient(0, by, 0, by + bandH);
    if (U) {
      gRibbon.addColorStop(0, U.ribbon0);
      gRibbon.addColorStop(0.5, U.ribbon1);
      gRibbon.addColorStop(1, U.ribbon2);
    } else {
      gRibbon.addColorStop(0, '#3fc286');
      gRibbon.addColorStop(0.5, '#2a9d4f');
      gRibbon.addColorStop(1, '#176d34');
    }
    app.ctx.fillStyle = gRibbon;
    app.roundRect(bx, by, bandW, bandH, bandR);
    app.ctx.fill();
    app.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    app.ctx.lineWidth = app.rpx(1);
    app.roundRect(bx, by, bandW, bandH, bandR);
    app.ctx.stroke();
    app.ctx.fillStyle = U ? U.ribbonText : '#fafff9';
    app.ctx.textAlign = 'center';
    app.ctx.textBaseline = 'middle';
    app.ctx.shadowColor = U ? U.ribbonTextShadow : 'rgba(0, 35, 18, 0.45)';
    app.ctx.shadowBlur = app.rpx(2);
    app.ctx.shadowOffsetY = app.rpx(1);
    app.ctx.fillText(tagText, app.snapPx(0), app.snapPx(0));
    app.ctx.shadowBlur = 0;
    app.ctx.shadowOffsetY = 0;
    app.ctx.restore();
  }
}

app.drawPieceSkinModalOverlay = function(th) {
  if (!app.pieceSkinModalVisible) {
    return;
  }
  th = th || (typeof app.getUiTheme === 'function' ? app.getUiTheme() : null);
  var U =
    th && typeof app.shopModalUiFromTheme === 'function'
      ? app.shopModalUiFromTheme(th)
      : null;
  var L = app.getPieceSkinModalLayout();
  var e = app.easeOutCubicModal(app.pieceSkinModalAnim);
  var sc = 0.86 + 0.14 * e;
  var x = L.x0;
  var y = L.y0;
  var pad = L.pad != null ? L.pad : L.innerPad;
  var cat = themes.getPieceSkinCatalog();
  var per = themes.PIECE_SKINS_PER_PAGE;
  var baseClassic = themes.getTheme('classic');

  app.ctx.save();
  app.ctx.fillStyle = 'rgba(0,0,0,' + 0.5 * e + ')';
  app.ctx.fillRect(0, 0, app.W, app.H);

  app.ctx.translate(L.cx, L.cy);
  app.ctx.scale(sc, sc);
  app.ctx.translate(-L.cx, -L.cy);

  app.ctx.shadowColor = 'rgba(0,0,0,0.2)';
  app.ctx.shadowBlur = app.rpx(28);
  app.ctx.shadowOffsetY = app.rpx(10);
  if (U && U.panel && U.panel.length >= 3) {
    var shellGrad = app.ctx.createLinearGradient(x, y, x, y + L.h);
    shellGrad.addColorStop(0, U.panel[0]);
    shellGrad.addColorStop(0.48, U.panel[1]);
    shellGrad.addColorStop(1, U.panel[2]);
    app.ctx.fillStyle = shellGrad;
  } else {
    app.ctx.fillStyle = '#f9f5ec';
  }
  app.roundRect(x, y, L.w, L.h, L.r);
  app.ctx.fill();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;

  var cr = L.closeR;
  var closeCx = x + L.w - pad - cr / 2;
  var closeCy = y + pad + cr / 2;
  app.ctx.font = 'bold ' + app.rpx(34) + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = U && U.muted ? U.muted : 'rgba(92,75,58,0.38)';
  app.ctx.globalAlpha = U ? 0.45 : 1;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText('×', app.snapPx(closeCx), app.snapPx(closeCy));
  app.ctx.globalAlpha = 1;

  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.font = '600 ' + app.rpx(34) + 'px ' + app.PIECE_SKIN_FONT_UI;
  app.ctx.fillStyle = U && U.title ? U.title : '#4a3d32';
  app.ctx.fillText('杂货铺', app.snapPx(L.cx), app.snapPx(L.titleCy));

  var sepY = L.gridY0 - app.rpx(10);
  app.ctx.strokeStyle = U ? U.sep : 'rgba(92, 75, 58, 0.12)';
  app.ctx.lineWidth = app.rpx(1);
  app.ctx.beginPath();
  app.ctx.moveTo(app.snapPx(x + pad), app.snapPx(sepY));
  app.ctx.lineTo(app.snapPx(x + L.w - pad), app.snapPx(sepY));
  app.ctx.stroke();

  var start = app.pieceSkinModalPage * per;
  var row;
  var col;
  for (row = 0; row < 4; row++) {
    for (col = 0; col < 2; col++) {
      var slot = row * 2 + col;
      var gidx = start + slot;
      if (gidx >= cat.length) {
        continue;
      }
      var gx = L.gridX0 + col * (L.cellW + L.cellGapX);
      var gy = L.gridY0 + row * (L.cellH + L.cellGapY);
      app.drawPieceSkinModalOneCard(
        gx,
        gy,
        L.cellW,
        L.cellH,
        cat[gidx],
        gidx,
        baseClassic,
        th
      );
    }
  }

  app.ctx.restore();
}

/**
 * 微信小游戏 canvas 上下文状态跨帧保留。上一帧若以红色等大模糊阴影结束，
 * 下一帧首次 fillRect 等也会带阴影，造成首页/战绩/匹配等整屏偏粉红。
 */
function resetCanvasShadowState(ctx) {
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
}

app.draw = function() {
  /** 每帧重置为逻辑坐标系，避免某次 save/restore 失衡导致变换累积（画面套叠缩小） */
  app.ctx.setTransform(app.DPR, 0, 0, app.DPR, 0, 0);
  resetCanvasShadowState(app.ctx);
  if (app.screen !== 'home') {
    app.stopHomeMascotAnimLoop();
    app.checkinModalVisible = false;
    app.checkinModalData = null;
  }
  if (app.screen === 'home') {
    app.drawHome();
    app.ensureHomeMascotAnimLoop();
    return;
  }
  if (app.screen === 'admin_puzzle') {
    if (typeof app.drawAdminPuzzleScreen === 'function') {
      app.drawAdminPuzzleScreen();
    }
    return;
  }
  if (app.screen === 'history') {
    app.drawHistory();
    if (app.historyReplayOverlayVisible) {
      app.drawHistoryReplayOverlay();
    }
    return;
  }
  if (app.screen === 'pve_color') {
    app.drawPveColorSelect();
    return;
  }
  if (app.screen === 'matching') {
    app.drawMatching();
    return;
  }
  if (app.screen === 'replay') {
    app.drawReplay();
    return;
  }

  app.fillAmbientBackground();

  app.layout = app.computeLayout();
  var th = app.getUiTheme();
  /** 棋盘跟随后台所选界面主题（青瓷 / 水墨 / 檀木）；棋子再叠棋子皮肤 */
  var boardTh = app.getCurrentTheme();
  var pieceThBlack;
  var pieceThWhite;
  if (app.isPvpOnline) {
    var fb = app.onlineBlackPieceSkinId;
    var fw = app.onlineWhitePieceSkinId;
    if (fb == null || fb === '') {
      fb = app.pieceSkinId;
    }
    if (fw == null || fw === '') {
      fw = app.pieceSkinId;
    }
    pieceThBlack = app.getPieceThemeForSkin(boardTh, fb);
    pieceThWhite = app.getPieceThemeForSkin(boardTh, fw);
  } else {
    var pieceUnified = app.getThemeForPieces(boardTh);
    pieceThBlack = pieceUnified;
    pieceThWhite = pieceUnified;
  }
  doodles.drawGameBoardCornerClouds(
    app.ctx,
    app.W,
    app.H,
    app.layout,
    app.sys.statusBarHeight || 0
  );
  render.drawBoard(app.ctx, app.layout, boardTh);
  render.drawPieces(app.ctx, app.board, app.layout, pieceThBlack, pieceThWhite);
  if (app.shouldShowOpponentLastMoveMarker()) {
    var lr = app.lastOpponentMove.r;
    var lc = app.lastOpponentMove.c;
    var stoneAt = app.board[lr][lc];
    var markerPieceTh =
      stoneAt === app.BLACK ? pieceThBlack : pieceThWhite;
    render.drawOpponentLastMoveMarker(
      app.ctx,
      app.layout,
      boardTh,
      lr,
      lc,
      stoneAt,
      markerPieceTh
    );
  }
  if (app.winningLineCells && app.winningLineCells.length >= 1) {
    render.drawWinningLine(
      app.ctx,
      app.layout,
      app.winningLineCells,
      pieceThBlack,
      pieceThWhite,
      app.board
    );
  }

  if (typeof app.drawBoardAvatarPropPanels === 'function') {
    app.drawBoardAvatarPropPanels(app.ctx, app.layout, th);
  }
  app.drawBoardNameLabels(app.ctx, app.layout, th);
  if (typeof app.drawQSwordSkillEffect === 'function') {
    app.drawQSwordSkillEffect(app.ctx, app.layout);
  }
  if (typeof app.drawOnlineAvatarChatBubbles === 'function') {
    app.drawOnlineAvatarChatBubbles(app.ctx, app.layout, th);
  }

  app.ctx.save();
  app.ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
  app.ctx.shadowBlur = 4;
  app.ctx.shadowOffsetY = 1;
  var titleFs = Math.max(14, Math.round(app.rpx(15)));
  var insetTop =
    app.layout && app.layout.insetTop != null
      ? app.layout.insetTop
      : typeof app.getGameScreenInsetTop === 'function'
        ? app.getGameScreenInsetTop()
        : Math.max(
            app.sys.statusBarHeight || 24,
            app.sys.safeArea && app.sys.safeArea.top != null
              ? app.sys.safeArea.top
              : 0
          );
  var titleCy = insetTop + titleFs * 0.45;
  render.drawText(
    app.ctx,
    '团团五子棋',
    app.W / 2,
    titleCy,
    titleFs,
    th.subtitle != null ? th.subtitle : th.title
  );
  if (
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    app.shouldShowOnlineGameClockUi()
  ) {
    app.drawOnlineGameClockAboveBoard(app.ctx, th, app.layout);
  }
  app.ctx.restore();

  var status = app.lastMsg;
  if (app.isPvpOnline) {
    var sideName = app.pvpOnlineYourColor === app.BLACK ? '黑' : '白';
    if (!app.onlineWsConnected) {
      status = app.onlineWsEverOpened
        ? '连接中断，正在重连…'
        : '正在连接服务器…';
    } else if (app.onlineSpectatorMode) {
      if (app.onlineOpponentLeft) {
        status = '好友已离开房间';
      } else if (!app.onlineWhiteConnected) {
        status = '等待好友加入 · 房号 ' + app.onlineRoomId;
      } else if (app.gameOver) {
        status = '对局结束';
      } else {
        status =
          '旁观中 · 当前轮到' +
          (app.current === app.BLACK ? '黑' : '白') +
          '方';
      }
    } else if (app.onlineOpponentLeft) {
      status = '对方已离开房间';
    } else if (!app.onlineBlackConnected || !app.onlineWhiteConnected) {
      status =
        app.pvpOnlineYourColor === app.BLACK && app.onlineRoomId
          ? '等待白方加入 · 房号 ' + app.onlineRoomId
          : '等待连接…';
    } else if (app.gameOver) {
      status = '对局结束';
    } else if (app.onlineDrawPending && app.onlineDrawRequesterColor != null) {
      var drOn = app.onlineDrawRequesterColor === app.BLACK ? '黑' : '白';
      if (app.pvpOnlineYourColor === app.onlineDrawRequesterColor) {
        status = '已申请和棋，等待对方回应';
      } else {
        status = '对方提议和棋（' + drOn + '方），请在弹窗中选择';
      }
    } else if (
      app.onlineUndoPending &&
      app.onlineUndoRequesterColor != null
    ) {
      var urOn = app.onlineUndoRequesterColor === app.BLACK ? '黑' : '白';
      if (app.pvpOnlineYourColor === app.onlineUndoRequesterColor) {
        status = '已申请悔棋，等待对方回应';
      } else {
        status = '对方申请悔棋（' + urOn + '方），请在弹窗中选择';
      }
    } else if (app.isRandomMatch) {
      /** 随机匹配：无论对手为真人或后台账号，状态栏与「对方思考」一致 */
      if (app.current === app.pvpOnlineYourColor) {
        status = '轮到你（' + sideName + '）';
      } else {
        status = '对方思考中…';
      }
    } else if (app.onlineOpponentIsBot) {
      if (app.current === app.pvpOnlineYourColor) {
        status = '轮到你（' + sideName + '）';
      } else {
        status = '「电脑」思考中…';
      }
    } else if (app.current === app.pvpOnlineYourColor) {
      status = '轮到你（' + sideName + '）';
    } else {
      status = '对方思考中…';
    }
  } else if (app.isPvpLocal) {
    if (app.localDrawRequest) {
      var drL =
        app.localDrawRequest.requesterColor === app.BLACK ? '黑' : '白';
      status = drL + '方提议和棋，请对方选同意或拒绝';
    } else if (app.localUndoRequest) {
      var urL = app.localUndoRequest.requesterColor === app.BLACK ? '黑' : '白';
      status = urL + '方申请悔棋，请对方选同意或拒绝';
    } else {
      status =
        (app.current === app.BLACK ? '黑方' : '白方') +
        '下棋（面对面轮流）';
    }
  } else if (app.isDailyPuzzle) {
    if (app.dailyPuzzleSubmitting) {
      status = '提交判题中…';
    } else if (app.current === app.dailyPuzzleUserColor) {
      status =
        '轮到你（' +
        (app.dailyPuzzleUserColor === app.BLACK ? '黑' : '白') +
        '）· 对电脑';
    } else {
      status =
        '电脑（' +
        (app.dailyPuzzleBotColor() === app.BLACK ? '黑' : '白') +
        '）思考中…';
    }
  } else if (!status) {
    if (app.current === app.pveHumanColor) {
      status =
        '轮到你（' + (app.pveHumanColor === app.BLACK ? '黑' : '白') + '）';
    } else {
      if (app.isRandomMatch) {
        status =
          '「' +
          app.randomOpponentName +
          '」思考中（' +
          app.PVE_DIFF_LABEL +
          '）…';
      } else {
        status =
          (app.pveAiColor() === app.BLACK ? '黑' : '白') +
          '棋（' +
          app.PVE_DIFF_LABEL +
          '）思考…';
      }
    }
  }
  var btnY = app.layout.bottomY;
  var undoLabel = '悔棋';
  var undoActive = !app.gameOver;
  if (undoActive && app.isPvpOnline) {
    if (app.onlineSpectatorMode) {
      undoActive = false;
    } else if (app.onlineUndoPending) {
      if (app.pvpOnlineYourColor === app.onlineUndoRequesterColor) {
        undoLabel = '等待中';
        undoActive = false;
      } else {
        undoActive = false;
      }
    } else if (app.onlineDrawPending) {
      undoActive = false;
    } else if (app.countStonesOnBoard(app.board) === 0) {
      undoActive = false;
    } else if (
      app.getOnlineUndoCooldownRemainingMs &&
      app.getOnlineUndoCooldownRemainingMs() > 0
    ) {
      undoActive = false;
      undoLabel =
        Math.ceil(app.getOnlineUndoCooldownRemainingMs() / 1000) + '秒';
    }
  } else if (undoActive && app.isPvpLocal) {
    if (app.localUndoRequest) {
      undoLabel = '撤销申请';
    } else if (app.localDrawRequest) {
      undoActive = false;
    } else if (app.localMoveHistory.length === 0) {
      undoActive = false;
    }
  } else if (undoActive && app.isDailyPuzzle) {
    if (!app.dailyPuzzleMoves || app.dailyPuzzleMoves.length === 0) {
      undoActive = false;
    }
  } else if (
    undoActive &&
    !app.isPvpLocal &&
    !app.isPvpOnline &&
    !app.isDailyPuzzle
  ) {
    if (app.pveMoveHistory.length === 0) {
      undoActive = false;
    }
  }

  var drawLabel = '和棋';
  if (
    app.isPvpOnline &&
    !app.gameOver &&
    app.getOnlineDrawCooldownRemainingMs &&
    app.getOnlineDrawCooldownRemainingMs() > 0 &&
    !app.onlineDrawPending &&
    !app.onlineUndoPending
  ) {
    drawLabel =
      Math.ceil(app.getOnlineDrawCooldownRemainingMs() / 1000) + '秒';
  }

  /**
   * 每日残局 + 结算层：底栏会在结算层之上再画一遍；若此处先画一遍，半透明底叠在全屏层下会透出，
   * 视觉上像图标重影/两个。仅在「不会在后面再画底栏」时画这一遍。
   */
  var dailyBarRedrawOnOverlay =
    typeof app.isDailyStyleGameActionBar === 'function' &&
    app.isDailyStyleGameActionBar() &&
    app.showResultOverlay &&
    (app.gameOver || app.onlineResultOverlaySticky);
  if (!dailyBarRedrawOnOverlay) {
    app.drawGameActionBar(undoLabel, undoActive, drawLabel);
  }
  /**
   * 消息面板必须在底栏之后绘制（Canvas 后绘在上层），否则会挡住输入框/发送键。
   * 是否遮挡棋盘暂不限制，以可操作优先。
   */
  if (
    app.isPvpOnline &&
    app.onlineChatOpen &&
    typeof app.shouldShowOnlineChatButton === 'function' &&
    app.shouldShowOnlineChatButton() &&
    typeof app.drawOnlineChatPanel === 'function'
  ) {
    app.drawOnlineChatPanel(th, btnY);
  } else {
    app.onlineChatPanelLayout = null;
  }

  if (
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    app.shouldShowOnlineGameClockUi()
  ) {
    app.ensureOnlineClockTick();
  } else if (typeof app.clearOnlineClockTick === 'function') {
    app.clearOnlineClockTick();
  }

  if (app.showUndoRespondRow()) {
    var Ls = app.getGameActionBarLayout();
    var urY =
      (Ls.statusChipH > 0
        ? Ls.statusCenterY - Ls.statusChipH * 0.5 - app.rpx(12)
        : Ls.y0 - app.rpx(10)) - 17;
    app.drawButton('同意', app.W * 0.35, urY, true);
    app.drawButton('拒绝', app.W * 0.65, urY, true);
  } else if (app.showDrawRespondRow()) {
    var LsD = app.getGameActionBarLayout();
    var drY =
      (LsD.statusChipH > 0
        ? LsD.statusCenterY - LsD.statusChipH * 0.5 - app.rpx(12)
        : LsD.y0 - app.rpx(10)) - 17;
    app.drawButton('同意', app.W * 0.35, drY, true);
    app.drawButton('拒绝', app.W * 0.65, drY, true);
  }

  app.drawUndoRejectFloat();

  app.drawThemeChrome(th);

  if (
    app.showResultOverlay &&
    (app.gameOver || app.onlineResultOverlaySticky)
  ) {
    app.drawResultOverlay();
    /** 每日残局结算与其它模式一致：仅用结算层主按钮 + 底部 dock，不叠画对局底栏 */
  }

  app.drawRatingCardOverlay(th);
}

/**
 * 对局页底栏：浅色分段条 + 竖分割线；上为扁平彩色图标（PNG），下为说明字。
 */
app.getGameActionBarLayout = function() {
  var btnY = app.layout.bottomY;
  var pad = app.rpx(10);
  var barW = app.W - pad * 2;
  var barH =
    app.GAME_ACTION_BAR_H_RPX != null
      ? app.rpx(app.GAME_ACTION_BAR_H_RPX)
      : app.rpx(128);
  var x0 = pad;
  var y0 = btnY - barH / 2;
  /** 人机：2 列；每日残局 / 残局好友房旁观：4 列（重置 + 邀请）；标准联机：5 列（含聊天）；其余联机：4 列 */
  var colCount;
  if (
    app.isPvpOnline &&
    typeof app.shouldShowOnlineChatButton === 'function' &&
    app.shouldShowOnlineChatButton()
  ) {
    colCount = 5;
  } else if (app.isPvpOnline || app.isPvpLocal) {
    colCount = 4;
  } else if (app.isDailyPuzzle) {
    colCount = 4;
  } else {
    colCount = 2;
  }
  var colW = barW / colCount;
  var centers = [];
  var ci;
  for (ci = 0; ci < colCount; ci++) {
    centers.push(x0 + colW * (ci + 0.5));
  }
  var iconSize =
    app.GAME_ACTION_BAR_ICON_RPX != null
      ? app.rpx(app.GAME_ACTION_BAR_ICON_RPX)
      : app.rpx(72);
  var labelFs =
    app.GAME_ACTION_BAR_LABEL_FS_RPX != null
      ? app.rpx(app.GAME_ACTION_BAR_LABEL_FS_RPX)
      : app.rpx(26);
  var iconLabelGap =
    app.GAME_ACTION_BAR_ICON_LABEL_GAP_RPX != null
      ? app.rpx(app.GAME_ACTION_BAR_ICON_LABEL_GAP_RPX)
      : app.rpx(6);
  var chipHr =
    app.GAME_STATUS_CHIP_H_RPX != null ? app.GAME_STATUS_CHIP_H_RPX : 0;
  var chipH = chipHr > 0 ? app.rpx(chipHr) : 0;
  var gapBarToChip = chipH > 0 ? app.rpx(9) : app.rpx(6);
  var statusCenterY = y0 - gapBarToChip - chipH / 2;
  return {
    btnY: btnY,
    pad: pad,
    barW: barW,
    barH: barH,
    x0: x0,
    y0: y0,
    colCount: colCount,
    colW: colW,
    iconSize: iconSize,
    labelFs: labelFs,
    iconLabelGap: iconLabelGap,
    centers: centers,
    statusChipH: chipH,
    statusCenterY: statusCenterY
  };
}

/**
 * 是否在本侧头像上绘制步时环（仅当前行棋一侧；对方头像保持干净）。
 */
app.shouldDrawOnlineStepRingForSide = function(isMySide) {
  if (
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    !app.shouldShowOnlineGameClockUi()
  ) {
    return false;
  }
  if (!app.isPvpOnline || app.gameOver) {
    return false;
  }
  if (
    !app.onlineWsConnected ||
    !app.onlineBlackConnected ||
    !app.onlineWhiteConnected
  ) {
    return false;
  }
  if (
    app.onlineClockMoveDeadlineWallMs == null ||
    isNaN(app.onlineClockMoveDeadlineWallMs)
  ) {
    return false;
  }
  var im = app.current === app.pvpOnlineYourColor;
  return isMySide ? im : !im;
};

/**
 * 联机步时：仅在「当前行棋」头像上，于头像与执子徽章之间绘制细圆环进度（无头像下数字）。
 * 剩余 ≤10 秒时进度弧红色脉冲闪烁；对方头像不装饰；暂停为虚线全环（无文字）。
 */
app.drawOnlineTurnClockRingBeforeBadge = function(ctx, cx, cy, avR, th, isMySide) {
  if (!app.shouldDrawOnlineStepRingForSide(isMySide)) {
    return;
  }
  var paused = !!app.onlineClockPaused;
  var sec = paused
    ? null
    : Math.max(
        0,
        Math.ceil((app.onlineClockMoveDeadlineWallMs - Date.now()) / 1000)
      );
  var ink = th && th.id === 'ink';
  var mint = th && th.id === 'mint';
  var urgent = sec !== null && sec <= 10;
  var accent = mint
    ? 'rgba(32, 148, 132, 0.94)'
    : ink
      ? 'rgba(212, 168, 72, 0.96)'
      : 'rgba(88, 128, 210, 0.94)';
  var track = ink
    ? 'rgba(72, 64, 56, 0.14)'
    : mint
      ? 'rgba(28, 72, 82, 0.12)'
      : 'rgba(0, 0, 0, 0.09)';
  /** 环略大于头像，避开与右下角执子徽章抢同一视觉层 */
  var ringR = avR + app.rpx(5);
  var lineW = Math.max(2.2, app.rpx(3));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = track;
  ctx.lineWidth = lineW;
  ctx.stroke();

  if (paused) {
    ctx.setLineDash([app.rpx(5), app.rpx(4)]);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = ink
      ? 'rgba(110, 100, 90, 0.5)'
      : mint
        ? 'rgba(50, 88, 98, 0.45)'
        : 'rgba(90, 86, 78, 0.45)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  var t = Math.min(1, sec / 30);
  var start = -Math.PI / 2;
  var sweep = t * Math.PI * 2;
  var nowMs = Date.now();
  /** 最后 10 秒：红色进度弧 + 光晕随时间明暗脉冲 */
  var redPulse =
    urgent ? 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(nowMs / 95)) : 1;
  if (urgent) {
    /** 读秒紧急仅脉冲线色/线宽，不用红色 shadow：同帧染棋盘且 shadow 曾跨帧导致多页泛红 */
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.shadowColor = mint || ink
      ? 'rgba(20, 52, 48, 0.22)'
      : 'rgba(40, 70, 140, 0.2)';
    ctx.shadowBlur = app.rpx(5);
    ctx.shadowOffsetY = app.rpx(1);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, start, start + sweep);
  if (urgent) {
    ctx.strokeStyle =
      'rgba(238, 64, 48, ' + (0.5 + 0.48 * redPulse).toFixed(3) + ')';
  } else {
    ctx.strokeStyle = accent;
  }
  ctx.lineWidth = lineW;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
};

/**
 * 局时限总剩余：MM:SS（如 09:34、10:00），分秒均两位；最长 99:59。
 */
app.formatGameTotalClockMmSs = function(totalSec) {
  var sec = totalSec;
  if (sec < 0 || sec !== sec) {
    sec = 0;
  }
  sec = Math.min(5999, Math.floor(sec));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  var mm = m < 10 ? '0' + m : String(m);
  if (m > 99) {
    mm = String(m);
  }
  var ss = s < 10 ? '0' + s : String(s);
  return mm + ':' + ss;
};

/**
 * 联机局时限文案：纯 MM:SS；暂停时不显示副文案；步时由头像环表示。
 */
app.buildOnlineClockSubline = function() {
  if (
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    !app.shouldShowOnlineGameClockUi()
  ) {
    return '';
  }
  if (!app.isPvpOnline || app.gameOver) {
    return '';
  }
  if (!app.onlineWsConnected) {
    return '';
  }
  if (!app.onlineBlackConnected || !app.onlineWhiteConnected) {
    return '';
  }
  if (
    app.onlineClockMoveDeadlineWallMs == null ||
    isNaN(app.onlineClockMoveDeadlineWallMs)
  ) {
    return '';
  }
  var now = Date.now();
  if (app.onlineClockPaused) {
    return '';
  }
  if (
    app.onlineClockGameDeadlineWallMs != null &&
    !isNaN(app.onlineClockGameDeadlineWallMs) &&
    app.onlineClockGameDeadlineWallMs > 0
  ) {
    var gameSec = Math.max(
      0,
      Math.ceil((app.onlineClockGameDeadlineWallMs - now) / 1000)
    );
    return app.formatGameTotalClockMmSs(gameSec);
  }
  return '';
};

/**
 * 联机局时限：棋盘正上方（顶栏与棋盘木边之间），大号字，与棋盘水平居中对齐。
 */
app.drawOnlineGameClockAboveBoard = function(ctx, th, layout) {
  if (
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    !app.shouldShowOnlineGameClockUi()
  ) {
    return;
  }
  if (!app.isPvpOnline || app.gameOver || !layout) {
    return;
  }
  var line = app.buildOnlineClockSubline();
  if (!line || String(line).trim() === '') {
    return;
  }
  var cell = layout.cell;
  var ox = layout.originX;
  var oy = layout.originY;
  var boardPx = layout.boardPx;
  if (!(cell > 0) || ox !== ox || oy !== oy || !(boardPx > 0)) {
    return;
  }
  var boardOuterTop = oy - cell * 0.5;
  var topBar = layout.topBar != null ? layout.topBar : 0;
  var ink = th && th.id === 'ink';
  var mint = th && th.id === 'mint';
  var clockFs = Math.max(18, Math.round(app.rpx(24)));
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font =
    '700 ' +
    clockFs +
    'px "SF Mono","Menlo","Consolas","PingFang SC","Helvetica Neue",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var tw = ctx.measureText(line).width;
  var padX = app.rpx(20);
  var padY = app.rpx(10);
  var bw = tw + padX * 2;
  var bh = clockFs + padY * 2;
  var bandH = Math.max(0, boardOuterTop - topBar);
  var cy =
    bandH >= bh
      ? topBar + bandH * 0.5
      : boardOuterTop - app.rpx(8) - bh * 0.5;
  var minCy = topBar + bh * 0.5 + app.rpx(4);
  var maxCy = boardOuterTop - bh * 0.5 - app.rpx(4);
  if (cy < minCy) {
    cy = minCy;
  }
  if (cy > maxCy) {
    cy = maxCy;
  }
  var boardCx = ox + boardPx * 0.5;
  var bx = boardCx - bw * 0.5;
  var by = cy - bh * 0.5;
  var rr = Math.min(bh * 0.5, app.rpx(18));
  var sa = app.sys.safeArea;
  var safeLeft = sa && sa.left != null ? sa.left : 0;
  var safeRight = app.W;
  if (sa) {
    if (typeof sa.right === 'number') {
      safeRight = sa.right;
    } else if (typeof sa.width === 'number' && typeof sa.left === 'number') {
      safeRight = sa.left + sa.width;
    }
  }
  if (bx < safeLeft + app.rpx(8)) {
    bx = safeLeft + app.rpx(8);
  }
  if (bx + bw > safeRight - app.rpx(8)) {
    bx = safeRight - app.rpx(8) - bw;
  }
  if (ink) {
    ctx.fillStyle = 'rgba(252, 246, 238, 0.62)';
    ctx.strokeStyle = 'rgba(92, 82, 72, 0.14)';
  } else if (mint) {
    ctx.fillStyle = 'rgba(241, 247, 245, 0.72)';
    ctx.strokeStyle = 'rgba(28, 58, 70, 0.12)';
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)';
  }
  ctx.lineWidth = 1;
  app.roundRect(bx, by, bw, bh, rr);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink
    ? 'rgba(72, 64, 58, 0.92)'
    : mint
      ? 'rgba(38, 72, 82, 0.94)'
      : 'rgba(58, 54, 50, 0.92)';
  ctx.fillText(line, app.snapPx(bx + bw * 0.5), app.snapPx(cy));
  ctx.restore();
};

app.clearOnlineClockTick = function() {
  if (app.onlineClockTickTimer != null) {
    clearInterval(app.onlineClockTickTimer);
    app.onlineClockTickTimer = null;
  }
};

/** 联机对局未结束时定时 redraw，使倒计时平滑 */
app.ensureOnlineClockTick = function() {
  if (!app.shouldRunOnlineClockCountdown()) {
    app.clearOnlineClockTick();
    return;
  }
  if (app.onlineClockTickTimer != null) {
    return;
  }
  app.onlineClockTickTimer = setInterval(function() {
    if (!app.shouldRunOnlineClockCountdown()) {
      app.clearOnlineClockTick();
      return;
    }
    app.draw();
  }, 280);
};

app.shouldRunOnlineClockCountdown = function() {
  return (
    typeof app.shouldShowOnlineGameClockUi === 'function' &&
    app.shouldShowOnlineGameClockUi() &&
    app.isPvpOnline &&
    app.screen === 'game' &&
    !app.gameOver &&
    app.onlineWsConnected &&
    app.onlineBlackConnected &&
    app.onlineWhiteConnected &&
    app.onlineClockMoveDeadlineWallMs != null &&
    !isNaN(app.onlineClockMoveDeadlineWallMs)
  );
};

/** 联机：对方拒绝悔棋时横向飘过提示 */
app.stopUndoRejectFloatAnim = function() {
  if (app.undoRejectFloatTimer != null) {
    clearInterval(app.undoRejectFloatTimer);
    app.undoRejectFloatTimer = null;
  }
};

app.startUndoRejectedFloat = function(floatText) {
  app.stopUndoRejectFloatAnim();
  app.undoRejectFloat = {
    startMs: Date.now(),
    durationMs: 3800,
    text: floatText || '对方拒绝了你的悔棋'
  };
  var self = app;
  app.undoRejectFloatTimer = setInterval(function() {
    if (!self.undoRejectFloat) {
      self.stopUndoRejectFloatAnim();
      return;
    }
    if (
      Date.now() - self.undoRejectFloat.startMs >=
      (self.undoRejectFloat.durationMs || 3800)
    ) {
      self.undoRejectFloat = null;
      self.stopUndoRejectFloatAnim();
    }
    self.draw();
  }, 33);
  app.draw();
};

app.drawUndoRejectFloat = function() {
  if (!app.undoRejectFloat || app.screen !== 'game') {
    return;
  }
  var uf = app.undoRejectFloat;
  var elapsed = Date.now() - uf.startMs;
  var dur = uf.durationMs || 3800;
  if (elapsed >= dur) {
    return;
  }
  var lay = app.layout;
  if (!lay) {
    return;
  }
  var text = uf.text || '对方拒绝了你的悔棋';
  var ctx = app.ctx;
  var fs = Math.max(17, Math.round(app.rpx(32)));
  ctx.save();
  /** 常规字重；优先行楷/隶书笔势（偏张扬），无则系统黑体 */
  ctx.font =
    'normal ' +
    fs +
    'px "STXingkai","Xingkai SC","STXingkai-Regular","Kaiti SC","STKaiti","KaiTi","STLiti","LiSu","PingFang SC","Microsoft YaHei",serif';
  var tw = ctx.measureText(text).width;
  var progress = elapsed / dur;
  /** 沿棋盘宽度从左到右飘过；垂直略偏上于棋盘中心 */
  var boardW = lay.boardPx;
  var travelStart = -tw * 0.5;
  var travelEnd = boardW + tw * 0.5;
  var x = lay.originX + travelStart + progress * (travelEnd - travelStart);
  var y = lay.originY + boardW * 0.5 - app.rpx(32) - 60;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.round(fs * 0.11));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillStyle = 'rgba(215, 72, 68, 0.98)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(text, app.snapPx(x), app.snapPx(y));
  ctx.fillText(text, app.snapPx(x), app.snapPx(y));
  ctx.restore();
};

app.drawGameActionBar = function(undoLabel, undoActive, drawLabel) {
  var th = app.getUiTheme();
  var L = app.getGameActionBarLayout();
  var ctx = app.ctx;
  var rBar = app.rpx(12);
  var barIconFg = th.btnGhostText || '#3a3836';
  ctx.save();
  if (th.id === 'ink' || th.id === 'mint') {
    ctx.shadowColor =
      th.id === 'mint'
        ? 'rgba(20, 52, 62, 0.06)'
        : 'rgba(50, 42, 34, 0.06)';
    ctx.shadowBlur = app.rpx(5);
    ctx.shadowOffsetY = app.rpx(1);
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
    ctx.shadowBlur = app.rpx(8);
    ctx.shadowOffsetY = app.rpx(2);
  }
  if (th.id === 'ink') {
    /** 宣纸浅底 + 淡赭墨边，融入 fillAmbientBackground 暖纸色 */
    ctx.fillStyle = 'rgba(252, 246, 238, 0.95)';
    ctx.strokeStyle = 'rgba(92, 82, 72, 0.14)';
  } else if (th.id === 'mint') {
    /** 与 mint.bg[2] 乳白青釉底一致，弱化「悬浮卡片」 */
    ctx.fillStyle = 'rgba(241, 247, 245, 0.96)';
    ctx.strokeStyle = 'rgba(28, 58, 70, 0.11)';
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  }
  ctx.lineWidth = 1;
  app.roundRect(L.x0, L.y0, L.barW, L.barH, rBar);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  var divTop = L.y0 + app.rpx(9);
  var divBot = L.y0 + L.barH - app.rpx(9);
  ctx.strokeStyle =
    th.id === 'ink'
      ? 'rgba(72, 66, 58, 0.14)'
      : th.id === 'mint'
        ? 'rgba(28, 58, 70, 0.12)'
        : 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  var divI;
  for (divI = 1; divI < L.colCount; divI++) {
    ctx.moveTo(app.snapPx(L.x0 + divI * L.colW), app.snapPx(divTop));
    ctx.lineTo(app.snapPx(L.x0 + divI * L.colW), app.snapPx(divBot));
  }
  ctx.stroke();

  var drawOk = app.isDrawButtonActive();
  var resignOk = app.isResignButtonActive();
  var pveBarOnly = L.colCount === 2;
  var dailyBar =
    typeof app.isDailyStyleGameActionBar === 'function' &&
    app.isDailyStyleGameActionBar() &&
    L.colCount === 4;
  var cols = [
    {
      img: app.gameBarHomeImg,
      kind: 'home',
      enabled: true
    },
    {
      img: app.gameBarUndoImg,
      kind: 'undo',
      enabled: undoActive
    }
  ];
  if (dailyBar) {
    cols.push({
      img: app.gameBarResetImg,
      kind: 'reset',
      enabled: true
    });
    cols.push({
      img: app.gameBarInviteImg,
      kind: 'invite',
      enabled:
        typeof app.isPuzzleFriendInviteEnabled === 'function'
          ? app.isPuzzleFriendInviteEnabled()
          : true
    });
  } else if (!pveBarOnly) {
    cols.push(
      {
        img: app.gameBarDrawImg,
        kind: 'draw',
        enabled: drawOk
      },
      {
        img: app.gameBarResignImg,
        kind: 'flag',
        enabled: resignOk
      }
    );
    if (L.colCount === 5) {
      cols.push({
        img: null,
        kind: 'chat',
        enabled: true
      });
    }
  }
  var undoCaption =
    undoLabel != null && String(undoLabel).trim() !== ''
      ? String(undoLabel)
      : '悔棋';
  var drawCaption =
    drawLabel != null && String(drawLabel).trim() !== ''
      ? String(drawLabel)
      : '和棋';
  var gameBarLabels = dailyBar
    ? ['离开', undoCaption, '重置', '邀请']
    : pveBarOnly
      ? ['离开', undoCaption]
      : L.colCount === 5
        ? ['离开', undoCaption, drawCaption, '认输', '聊天']
        : ['离开', undoCaption, drawCaption, '认输'];
  var M = app.gameBarIconSizeMul || {};
  var labelFsPx = Math.max(12, Math.round(L.labelFs));
  /** 底栏各列说明字同一基线，避免因各列图标倍率不同导致上下错位 */
  var labelBottomPad = app.rpx(8);
  var labelY =
    L.y0 + L.barH - labelBottomPad - labelFsPx * 0.5;
  /** 底栏图标底边对齐线（与文字间距固定） */
  var alignBottomY = labelY - labelFsPx * 0.5 - L.iconLabelGap;
  var minIconTop = L.y0 + app.rpx(6);
  /** 浅色条深灰字；水墨 / 青瓷用主题 subtitle，与对战页字色一致 */
  var gameBarLabelColor =
    th.id === 'ink'
      ? th.subtitle || '#585046'
      : th.id === 'mint'
        ? th.subtitle || '#3a5862'
        : '#3a3836';
  var i;
  for (i = 0; i < cols.length; i++) {
    var col = cols[i];
    var mul = M[col.kind] != null ? M[col.kind] : 1;
    var szMax = L.iconSize * mul;
    var sz = szMax;
    var measured;
    var iconTopCol;
    var attempt;
    for (attempt = 0; attempt < 28; attempt++) {
      measured = app.measureGameBarIconDrawSize(col.img, col.kind, sz);
      iconTopCol = alignBottomY - measured.dh;
      if (iconTopCol >= minIconTop - 0.25) {
        break;
      }
      sz *= 0.94;
      if (sz < L.iconSize * 0.48) {
        break;
      }
    }
    measured = app.measureGameBarIconDrawSize(col.img, col.kind, sz);
    iconTopCol = alignBottomY - measured.dh;
    var cx = L.centers[i];
    var colLeft = L.x0 + i * L.colW;
    if (i === 1 && undoActive && th.id === 'ink') {
      ctx.fillStyle = 'rgba(88, 78, 68, 0.1)';
      app.roundRect(
        colLeft + app.rpx(3),
        L.y0 + app.rpx(4),
        L.colW - app.rpx(6),
        L.barH - app.rpx(8),
        app.rpx(8)
      );
      ctx.fill();
    }
    if (i === 1 && undoActive && th.id === 'mint') {
      ctx.fillStyle = 'rgba(28, 72, 84, 0.09)';
      app.roundRect(
        colLeft + app.rpx(3),
        L.y0 + app.rpx(4),
        L.colW - app.rpx(6),
        L.barH - app.rpx(8),
        app.rpx(8)
      );
      ctx.fill();
    }
    if (!pveBarOnly && i === 2 && drawOk && app.onlineDrawPending && th.id === 'ink') {
      ctx.fillStyle = 'rgba(88, 78, 68, 0.1)';
      app.roundRect(
        colLeft + app.rpx(3),
        L.y0 + app.rpx(4),
        L.colW - app.rpx(6),
        L.barH - app.rpx(8),
        app.rpx(8)
      );
      ctx.fill();
    }
    if (!pveBarOnly && i === 2 && drawOk && app.onlineDrawPending && th.id === 'mint') {
      ctx.fillStyle = 'rgba(28, 72, 84, 0.09)';
      app.roundRect(
        colLeft + app.rpx(3),
        L.y0 + app.rpx(4),
        L.colW - app.rpx(6),
        L.barH - app.rpx(8),
        app.rpx(8)
      );
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = col.enabled ? 1 : 0.55;
    app.drawGameBarAssetOrVector(
      ctx,
      col.img,
      col.kind,
      cx,
      iconTopCol,
      sz,
      barIconFg
    );
    ctx.restore();
    ctx.save();
    /** 悔棋：仅图标可置灰；「悔棋」二字保持与其它说明字同色同不透明度 */
    var labelAlpha =
      i === 1 ? 1 : col.enabled ? 1 : 0.55;
    ctx.globalAlpha = labelAlpha;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = gameBarLabelColor;
    ctx.fillStyle = gameBarLabelColor;
    render.drawText(
      ctx,
      gameBarLabels[i],
      cx,
      labelY,
      labelFsPx,
      gameBarLabelColor,
      'normal'
    );
    ctx.restore();
  }
  ctx.restore();
}

/**
 * 与 drawGameBarAssetOrVector 一致：PNG 为 contain 缩放后的 dw/dh；矢量大致按槽高。
 * 用于底栏按「底边对齐」排布，避免各素材透明边距/长宽比不同造成高低不一。
 */
app.measureGameBarIconDrawSize = function(img, iconKind, iconSize) {
  var iw;
  var ih;
  if (img) {
    iw = img.width;
    ih = img.height;
    if ((!iw || !ih) && img.naturalWidth != null && img.naturalHeight != null) {
      iw = img.naturalWidth;
      ih = img.naturalHeight;
    }
    if (iw > 0 && ih > 0) {
      var sc = Math.min(iconSize / iw, iconSize / ih);
      return { dw: iw * sc, dh: ih * sc };
    }
  }
  return { dw: iconSize, dh: iconSize * 0.92 };
};

/** PNG 未就绪时用矢量图标占位（风格与扁平图区分，仅兜底） */
app.drawGameBarAssetOrVector = function(
  ctx,
  img,
  iconKind,
  cx,
  iconTop,
  iconSize,
  fg
) {
  if (img) {
    var iw = img.width;
    var ih = img.height;
    if ((!iw || !ih) && img.naturalWidth != null && img.naturalHeight != null) {
      iw = img.naturalWidth;
      ih = img.naturalHeight;
    }
    if (iw > 0 && ih > 0) {
      var sc = Math.min(iconSize / iw, iconSize / ih);
      var dw = iw * sc;
      var dh = ih * sc;
      var ix = cx - dw / 2;
      ctx.drawImage(img, app.snapPx(ix), app.snapPx(iconTop), dw, dh);
      return;
    }
  }
  var icy = iconTop + iconSize * 0.5;
  var s = iconSize * 0.42;
  app.drawGameActionIcon(ctx, iconKind, cx, icy, s, fg);
}

/**
 * 对局底栏小图标（描线/填充与主题色一致）。
 * @param {number} s 图标半宽（约 rpx(7.5)）
 */
app.drawGameActionIcon = function(ctx, iconKind, icx, icy, s, fg) {
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.65, app.rpx(2));

  if (iconKind === 'home') {
    ctx.beginPath();
    ctx.moveTo(icx, icy - s * 0.5);
    ctx.lineTo(icx - s * 0.7, icy - s * 0.02);
    ctx.lineTo(icx - s * 0.7, icy + s * 0.55);
    ctx.lineTo(icx + s * 0.7, icy + s * 0.55);
    ctx.lineTo(icx + s * 0.7, icy - s * 0.02);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.18, icy + s * 0.55);
    ctx.lineTo(icx - s * 0.18, icy + s * 0.28);
    ctx.lineTo(icx + s * 0.18, icy + s * 0.28);
    ctx.lineTo(icx + s * 0.18, icy + s * 0.55);
    ctx.stroke();
  } else if (iconKind === 'undo') {
    ctx.beginPath();
    ctx.arc(
      icx + s * 0.22,
      icy + s * 0.12,
      s * 0.52,
      Math.PI * 0.72,
      Math.PI * 1.48,
      true
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.28, icy - s * 0.22);
    ctx.lineTo(icx - s * 0.52, icy - s * 0.02);
    ctx.lineTo(icx - s * 0.32, icy + s * 0.12);
    ctx.stroke();
  } else if (iconKind === 'reset') {
    /** PNG 为主；兜底仍用悔棋形 + 小空圈（单色 fg，与位图染色一致） */
    ctx.beginPath();
    ctx.arc(
      icx + s * 0.22,
      icy + s * 0.12,
      s * 0.52,
      Math.PI * 0.72,
      Math.PI * 1.48,
      true
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.28, icy - s * 0.22);
    ctx.lineTo(icx - s * 0.52, icy - s * 0.02);
    ctx.lineTo(icx - s * 0.32, icy + s * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(icx + s * 0.48, icy + s * 0.4, s * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  } else if (iconKind === 'draw') {
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.62, icy - s * 0.12);
    ctx.lineTo(icx + s * 0.62, icy - s * 0.12);
    ctx.moveTo(icx - s * 0.62, icy + s * 0.18);
    ctx.lineTo(icx + s * 0.62, icy + s * 0.18);
    ctx.stroke();
  } else if (iconKind === 'invite') {
    /** 邀请好友：简化为「分享」箭头自方框外出 */
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.5, icy + s * 0.35);
    ctx.lineTo(icx + s * 0.15, icy + s * 0.35);
    ctx.lineTo(icx + s * 0.15, icy - s * 0.15);
    ctx.lineTo(icx + s * 0.45, icy - s * 0.15);
    ctx.lineTo(icx + s * 0.45, icy + s * 0.45);
    ctx.lineTo(icx - s * 0.5, icy + s * 0.45);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(icx + s * 0.38, icy - s * 0.42);
    ctx.lineTo(icx + s * 0.72, icy - s * 0.08);
    ctx.lineTo(icx + s * 0.52, icy + s * 0.02);
    ctx.stroke();
  } else if (iconKind === 'chat') {
    /** 气泡勾边 */
    var bx = icx - s * 0.65;
    var by = icy - s * 0.45;
    var bw = s * 1.3;
    var bh = s * 0.95;
    var br = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.15, icy + s * 0.5);
    ctx.lineTo(icx - s * 0.35, icy + s * 0.82);
    ctx.lineTo(icx + s * 0.25, icy + s * 0.52);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.42, icy + s * 0.62);
    ctx.lineTo(icx - s * 0.42, icy - s * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(icx - s * 0.42, icy - s * 0.48);
    ctx.lineTo(icx + s * 0.58, icy - s * 0.18);
    ctx.lineTo(icx - s * 0.42, icy + s * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

app.drawButton = function(label, cx, cy, active) {
  var th = app.getUiTheme();
  var bw = 82;
  var bh = 34;
  var r = 17;
  app.ctx.shadowColor = active ? th.btnShadow : 'rgba(0,0,0,0.08)';
  app.ctx.shadowBlur = active ? 12 : 8;
  app.ctx.shadowOffsetY = active ? 3 : 2;
  app.ctx.fillStyle = active ? th.btnPrimary : 'rgba(255,255,255,0.88)';
  app.ctx.strokeStyle = active
    ? 'rgba(255,255,255,0.45)'
    : th.btnGhostStroke;
  app.ctx.lineWidth = 1.5;
  app.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
  app.ctx.fill();
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
  app.ctx.font =
    '13px "PingFang SC","Hiragino Sans GB",sans-serif';
  app.ctx.fillStyle = active ? '#ffffff' : th.btnGhostText;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(label, app.snapPx(cx), app.snapPx(cy));
}

/**
 * 棋谱回放底栏药丸：渐变光泽 + 描边（与对局页 drawButton 区分，仅回放条使用）。
 */
app.drawReplayToolbarPill = function(cx, cy, bw, bh, active, pressed) {
  var th = app.getUiTheme();
  var r = Math.min(bh / 2, 18);
  var x = cx - bw / 2;
  var y = cy - bh / 2;
  var ctx = app.ctx;

  ctx.save();
  ctx.shadowColor = active ? th.btnShadow : 'rgba(42, 36, 30, 0.1)';
  ctx.shadowBlur = active ? 16 : 11;
  ctx.shadowOffsetY = active ? 4 : 2;
  ctx.fillStyle = active ? th.btnPrimary : th.btnGhostFill;
  app.roundRect(x, y, bw, bh, r);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  app.roundRect(x, y, bw, bh, r);
  ctx.clip();
  if (active) {
    var gloss = ctx.createLinearGradient(x, y, x, y + bh);
    gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
    gloss.addColorStop(0.42, 'rgba(255,255,255,0.08)');
    gloss.addColorStop(0.72, 'rgba(0,0,0,0)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x, y, bw, bh);
  } else {
    var gi = ctx.createLinearGradient(x, y, x, y + bh);
    gi.addColorStop(0, 'rgba(255,255,255,0.65)');
    gi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gi;
    ctx.fillRect(x, y, bw, bh);
  }
  ctx.restore();

  ctx.strokeStyle = active
    ? 'rgba(255,255,255,0.48)'
    : th.btnGhostStroke;
  ctx.lineWidth = 1.25;
  app.roundRect(x + 0.2, y + 0.2, bw - 0.4, bh - 0.4, Math.max(0, r - 0.2));
  ctx.stroke();

  if (pressed) {
    ctx.save();
    app.roundRect(x, y, bw, bh, r);
    ctx.clip();
    ctx.fillStyle = active ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y, bw, bh);
    ctx.restore();
  }

  ctx.restore();
}

/** 棋谱回放：文字按钮（关闭 / 自动 / 暂停） */
app.drawReplayToolbarButton = function(label, cx, cy, active, controlId) {
  var bw = app.REPLAY_CTRL_PILL_W != null ? app.REPLAY_CTRL_PILL_W : 82;
  var bh = 36;
  var pressed =
    controlId != null && app.replayControlPressedId === controlId;
  app.drawReplayToolbarPill(cx, cy, bw, bh, active, pressed);
  var th = app.getUiTheme();
  app.ctx.font =
    '600 13px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  app.ctx.fillStyle = active ? '#fffefb' : th.btnGhostText;
  app.ctx.textAlign = 'center';
  app.ctx.textBaseline = 'middle';
  app.ctx.fillText(label, app.snapPx(cx), app.snapPx(cy));
}

/**
 * 棋谱回放：上一步 / 下一步，与回放条药丸同风格，中间为单折线箭头。
 */
app.drawReplayStepIconButton = function(cx, cy, toPrev, active, controlId) {
  var th = app.getUiTheme();
  var bw = app.REPLAY_CTRL_PILL_W != null ? app.REPLAY_CTRL_PILL_W : 82;
  var bh = 36;
  var pressed =
    controlId != null && app.replayControlPressedId === controlId;
  app.drawReplayToolbarPill(cx, cy, bw, bh, active, pressed);
  var fg = active ? '#fffefb' : th.btnGhostText;
  app.ctx.strokeStyle = fg;
  if (active) {
    app.ctx.shadowColor = 'rgba(0,0,0,0.2)';
    app.ctx.shadowBlur = 2;
    app.ctx.shadowOffsetY = 1;
  }
  app.ctx.lineCap = 'round';
  app.ctx.lineJoin = 'round';
  app.ctx.lineWidth = Math.max(2.2, app.rpx(2.8));
  var u = app.rpx(12);
  app.ctx.beginPath();
  if (toPrev) {
    app.ctx.moveTo(cx + u * 0.38, cy - u * 0.58);
    app.ctx.lineTo(cx - u * 0.42, cy);
    app.ctx.lineTo(cx + u * 0.38, cy + u * 0.58);
  } else {
    app.ctx.moveTo(cx - u * 0.38, cy - u * 0.58);
    app.ctx.lineTo(cx + u * 0.42, cy);
    app.ctx.lineTo(cx - u * 0.38, cy + u * 0.58);
  }
  app.ctx.stroke();
  app.ctx.shadowBlur = 0;
  app.ctx.shadowOffsetY = 0;
}

app.roundRect = function(x, y, w, h, r) {
  app.ctx.beginPath();
  app.ctx.moveTo(x + r, y);
  app.ctx.arcTo(x + w, y, x + w, y + h, r);
  app.ctx.arcTo(x + w, y + h, x, y + h, r);
  app.ctx.arcTo(x, y + h, x, y, r);
  app.ctx.arcTo(x, y, x + w, y, r);
  app.ctx.closePath();
}

app.hitHomeBottomNav = function(clientX, clientY) {
  var hl = app.getHomeLayout();
  if (
    clientY < hl.bottomNavTop ||
    clientY > hl.bottomNavTop + hl.bottomNavH
  ) {
    return null;
  }
  var pad = hl.dockPadH != null ? hl.dockPadH : app.rpx(52);
  if (clientX < pad || clientX > app.W - pad) {
    return null;
  }
  var innerW = app.W - pad * 2;
  var colW = innerW / 3;
  var col = Math.floor((clientX - pad) / colW);
  if (col < 0 || col > 2) {
    return null;
  }
  return col;
}

app.hitHomeButton = function(clientX, clientY) {
  var hl = app.getHomeLayout();
  var nav = app.getHomeNavBarLayout();
  if (clientY < nav.navBottom) {
    return null;
  }
  /**
   * 不再用 mainBottom 截断：第四颗「每日残局」在部分机型上会低于 mainBottom，
   * 导致整页主按钮无法命中。以下以底部 Dock 上沿为界，与 Dock 重叠时由触摸顺序保证主按钮优先。
   */
  if (
    hl.bottomNavTop != null &&
    hl.bottomNavTop > 0 &&
    clientY >= hl.bottomNavTop - 4
  ) {
    return null;
  }
  var halfW = hl.btnW / 2 + 4;
  var halfH = hl.btnH / 2 + 6;
  if (
    Math.abs(clientX - hl.cx) <= halfW &&
    Math.abs(clientY - hl.yRandom) <= halfH
  ) {
    return 'random';
  }
  if (
    Math.abs(clientX - hl.cx) <= halfW &&
    Math.abs(clientY - hl.yFriend) <= halfH
  ) {
    return 'pvp';
  }
  var pairHalfW = hl.halfBtnW * 0.5 + 4;
  if (
    Math.abs(clientX - hl.cxPve) <= pairHalfW &&
    Math.abs(clientY - hl.yPvePair) <= halfH
  ) {
    return 'pve';
  }
  if (
    Math.abs(clientX - hl.cxDaily) <= pairHalfW &&
    Math.abs(clientY - hl.yPvePair) <= halfH
  ) {
    return 'daily';
  }
  return null;
}

app.hitMatchingCancel = function(clientX, clientY) {
  var M =
    typeof app.getMatchingPageLayout === 'function'
      ? app.getMatchingPageLayout()
      : { titleCx: app.W / 2, cancelCy: app.H * 0.68 };
  var cx = M.titleCx != null ? M.titleCx : app.W / 2;
  var cy = M.cancelCy != null ? M.cancelCy : app.H * 0.68;
  return Math.abs(clientX - cx) <= 100 && Math.abs(clientY - cy) <= 28;
}

app.hitPveColorButton = function(clientX, clientY) {
  var cl = app.getPveColorLayout();
  var bw = cl.btnW / 2 + 12;
  var bh = cl.btnH / 2 + 12;
  if (
    Math.abs(clientX - cl.cx) <= bw &&
    Math.abs(clientY - cl.yBlack) <= bh
  ) {
    return 'black';
  }
  if (
    Math.abs(clientX - cl.cx) <= bw &&
    Math.abs(clientY - cl.yWhite) <= bh
  ) {
    return 'white';
  }
  if (Math.abs(clientX - cl.cx) <= 90 && Math.abs(clientY - cl.backY) <= 24) {
    return 'back';
  }
  return null;
}

app.hitGameButton = function(clientX, clientY) {
  var L = app.getGameActionBarLayout();
  if (
    clientX < L.x0 ||
    clientX > L.x0 + L.barW ||
    clientY < L.y0 ||
    clientY > L.y0 + L.barH
  ) {
    return null;
  }
  var col = Math.floor((clientX - L.x0) / L.colW);
  if (col < 0 || col >= L.colCount) {
    return null;
  }
  if (col === 0) {
    return 'back';
  }
  if (col === 1) {
    return 'undo';
  }
  var dailyStyleBar =
    typeof app.isDailyStyleGameActionBar === 'function' &&
    app.isDailyStyleGameActionBar();
  if (col === 2) {
    return dailyStyleBar ? 'reset' : 'draw';
  }
  if (col === 3) {
    if (dailyStyleBar) {
      if (
        typeof app.isPuzzleFriendInviteEnabled === 'function' &&
        !app.isPuzzleFriendInviteEnabled()
      ) {
        return null;
      }
      return 'invite_friend';
    }
    if (L.colCount === 5) {
      return 'resign';
    }
    return 'resign';
  }
  if (col === 4 && L.colCount === 5) {
    return 'chat';
  }
  return 'resign';
}

/** 消息面板上滑时长（ms），需与 scheduleOnlineChatPanelAnimFrames 一致 */
app.ONLINE_CHAT_PANEL_OPEN_MS = 380;

app.getOnlineChatPanelAnim = function() {
  if (!app.onlineChatOpen) {
    return 1;
  }
  if (!app._onlineChatAnimStartMs) {
    app._onlineChatAnimStartMs = Date.now();
  }
  var dur =
    typeof app.ONLINE_CHAT_PANEL_OPEN_MS === 'number' &&
    app.ONLINE_CHAT_PANEL_OPEN_MS > 0
      ? app.ONLINE_CHAT_PANEL_OPEN_MS
      : 380;
  var t = (Date.now() - app._onlineChatAnimStartMs) / dur;
  if (t >= 1) {
    return 1;
  }
  var u = 1 - Math.pow(1 - t, 3);
  return u;
};

app.scheduleOnlineChatPanelAnimFrames = function() {
  if (app._chatPanelAnimIv) {
    try {
      clearInterval(app._chatPanelAnimIv);
    } catch (e0) {}
    app._chatPanelAnimIv = null;
  }
  var dur =
    typeof app.ONLINE_CHAT_PANEL_OPEN_MS === 'number' &&
    app.ONLINE_CHAT_PANEL_OPEN_MS > 0
      ? app.ONLINE_CHAT_PANEL_OPEN_MS
      : 380;
  app._chatPanelAnimIv = setInterval(function() {
    if (typeof app.draw === 'function') {
      app.draw();
    }
    var done =
      typeof app.getOnlineChatPanelAnim === 'function' &&
      app.getOnlineChatPanelAnim() >= 1;
    if (done) {
      try {
        clearInterval(app._chatPanelAnimIv);
      } catch (e1) {}
      app._chatPanelAnimIv = null;
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }
  }, 16);
};

app.dismissOnlineChatKeyboard = function() {
  if (typeof app._onlineChatKeyboardCleanup === 'function') {
    try {
      app._onlineChatKeyboardCleanup();
    } catch (e0) {}
    app._onlineChatKeyboardCleanup = null;
  }
  try {
    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
      wx.hideKeyboard({});
    }
  } catch (e1) {}
};

/** 收起联机「消息」面板（发短语/表情/文字后调用） */
app.closeOnlineChatPanel = function() {
  if (typeof app.dismissOnlineChatKeyboard === 'function') {
    app.dismissOnlineChatKeyboard();
  }
  app.onlineChatInputDraft = '';
  app.onlineChatOpen = false;
  app.onlineChatEmojiOpen = false;
  app._onlineChatAnimStartMs = 0;
  if (app._chatPanelAnimIv) {
    try {
      clearInterval(app._chatPanelAnimIv);
    } catch (eCc) {}
    app._chatPanelAnimIv = null;
  }
  if (typeof app.draw === 'function') {
    app.draw();
  }
};

/**
 * 与后端 ChatSensitiveInfoFilter#maskSensitiveInfo 一致：敏感片段替换为等长 *（先 NFKC）。
 */
app.maskChatTextSensitive = function(raw) {
  var userText = raw != null ? String(raw) : '';
  if (!userText) {
    return userText;
  }
  var n = typeof userText.normalize === 'function' ? userText.normalize('NFKC') : userText;
  var intervals = [];
  function add(s, e) {
    if (s < e) {
      intervals.push([s, e]);
    }
  }
  var re;
  var m;
  re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  while ((m = re.exec(n)) !== null) {
    add(m.index, m.index + m[0].length);
  }
  re = /https?:\/\/\S*/gi;
  while ((m = re.exec(n)) !== null) {
    add(m.index, m.index + m[0].length);
  }
  re = /\bwww\.\S+/gi;
  while ((m = re.exec(n)) !== null) {
    add(m.index, m.index + m[0].length);
  }
  re = /\d{17}[\dXx]/g;
  while ((m = re.exec(n)) !== null) {
    add(m.index, m.index + m[0].length);
  }
  var starts = [];
  var p = 0;
  for (p = 0; p < n.length; ) {
    var cp0 = n.codePointAt(p);
    var w0 = cp0 > 0xffff ? 2 : 1;
    if (cp0 >= 48 && cp0 <= 57) {
      starts.push(p);
    }
    p += w0;
  }
  var dj;
  for (dj = 0; dj + 11 <= starts.length; dj++) {
    var chunk = '';
    var kk;
    for (kk = 0; kk < 11; kk++) {
      chunk += String.fromCodePoint(n.codePointAt(starts[dj + kk]));
    }
    if (/^1[3-9]\d{9}$/.test(chunk)) {
      var a = starts[dj];
      var lastS = starts[dj + 10];
      var lc = n.codePointAt(lastS);
      var end = lastS + (lc > 0xffff ? 2 : 1);
      add(a, end);
    }
  }
  var qi = 0;
  while (qi < n.length) {
    var cp1 = n.codePointAt(qi);
    var w1 = cp1 > 0xffff ? 2 : 1;
    if (cp1 >= 48 && cp1 <= 57) {
      var rs = qi;
      qi += w1;
      while (qi < n.length) {
        var cpr = n.codePointAt(qi);
        var wr = cpr > 0xffff ? 2 : 1;
        if (cpr < 48 || cpr > 57) {
          break;
        }
        qi += wr;
      }
      if (qi - rs >= 8) {
        add(rs, qi);
      }
    } else {
      qi += w1;
    }
  }
  intervals.sort(function(a, b) {
    return a[0] - b[0];
  });
  var merged = [];
  var mi;
  for (mi = 0; mi < intervals.length; mi++) {
    var iv = intervals[mi];
    if (!merged.length || iv[0] > merged[merged.length - 1][1]) {
      merged.push([iv[0], iv[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    }
  }
  var out = '';
  var cur = 0;
  for (mi = 0; mi < merged.length; mi++) {
    var seg = merged[mi];
    out += n.slice(cur, seg[0]);
    var z;
    for (z = seg[0]; z < seg[1]; z++) {
      out += '*';
    }
    cur = seg[1];
  }
  out += n.slice(cur);
  return out;
};

/** 词表与顺序须与 ChatAbusiveTextFilter 一致；NFKC 后长词优先，再英文词边界 */
app.CHAT_ABUSIVE_CN_TERMS = [
  'motherfucker',
  '操你妈',
  '草泥马',
  '王八蛋',
  '狗杂种',
  '狗日的',
  '狗东西',
  '杀了你',
  '砍死你',
  '下三滥',
  '神经病',
  '去死吧',
  '去死吗',
  '滚远点',
  '滚一边',
  '尼玛的',
  '尼玛逼',
  '你麻痹',
  '泥马逼',
  '贱骨头',
  '臭婊子',
  '臭傻逼',
  '死全家',
  '没爹妈',
  '没娘养',
  '杂种东西',
  '畜生东西',
  '人渣废物',
  '白痴废物',
  '弱智儿童',
  '脑残玩意',
  '沙雕玩意',
  '蠢货玩意',
  '贱人玩意',
  '烂人一个',
  '骚货玩意',
  '尼玛',
  '泥马',
  '傻逼',
  '傻b',
  '傻B',
  '萨比',
  '沙比',
  '蠢猪',
  '白痴',
  '弱智',
  '智障',
  '脑残',
  '沙雕',
  '废物',
  '人渣',
  '贱人',
  '贱货',
  '烂人',
  '婊子',
  '骚货',
  '贱婢',
  '混蛋',
  '混账',
  '畜生',
  '杂种',
  '下贱',
  '滚蛋',
  '滚开',
  '滚粗',
  '滚远',
  'nmsl',
  'NMSL',
  'cnm',
  'CNM',
  'sb东西',
  '艹你',
  '日你'
];

app.maskChatTextAbusive = function(raw) {
  var userText = raw != null ? String(raw) : '';
  if (!userText) {
    return userText;
  }
  var n = typeof userText.normalize === 'function' ? userText.normalize('NFKC') : userText;
  var rawList = app.CHAT_ABUSIVE_CN_TERMS || [];
  var terms = rawList.slice().sort(function(a, b) {
    return b.length - a.length;
  });
  var out = n;
  var ti;
  for (ti = 0; ti < terms.length; ti++) {
    var term = terms[ti];
    if (!term || out.indexOf(term) === -1) {
      continue;
    }
    var stars = '';
    var si;
    for (si = 0; si < term.length; si++) {
      stars += '*';
    }
    out = out.split(term).join(stars);
  }
  var enAbuse =
    /\b(fuck|fucks|fucked|fucking|fucker|shit|shits|bitch|bitches|bitching|asshole|bastard|bastards|slut|sluts|whore|whores|damn|piss|motherfuckers?|dickhead|dickheads|douche|douchebag|crap|bullshit|assholes?|cunts?|pricks?|wanker)\b/gi;
  out = out.replace(enAbuse, function(m) {
    var r = '';
    var ri;
    for (ri = 0; ri < m.length; ri++) {
      r += '*';
    }
    return r;
  });
  return out;
};

/** 敏感信息打码后再做辱骂打码，与 RoomChatService 顺序一致 */
app.moderateChatOutgoingText = function(s) {
  var x = typeof app.maskChatTextSensitive === 'function' ? app.maskChatTextSensitive(s) : s;
  return typeof app.maskChatTextAbusive === 'function' ? app.maskChatTextAbusive(x) : x;
};

app.trySendOnlineChatText = function(raw) {
  var t = String(raw != null ? raw : '').trim();
  if (!t) {
    return false;
  }
  var n = 0;
  var i = 0;
  for (i = 0; i < t.length; ) {
    var c = t.codePointAt(i);
    n++;
    i += c > 0xffff ? 2 : 1;
  }
  if (n > 30) {
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '最多30字', icon: 'none' });
    }
    return false;
  }
  var toSend =
    typeof app.moderateChatOutgoingText === 'function'
      ? app.moderateChatOutgoingText(t)
      : typeof app.maskChatTextSensitive === 'function'
        ? app.maskChatTextSensitive(t)
        : t;
  if (typeof app.sendOnlineChat === 'function') {
    if (!app.sendOnlineChat('TEXT', toSend)) {
      return false;
    }
  }
  if (typeof app.closeOnlineChatPanel === 'function') {
    app.closeOnlineChatPanel();
  }
  return true;
};

app._fallbackOnlineChatModal = function() {
  if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
    return;
  }
  var canEdit = !wx.canIUse || wx.canIUse('showModal.object.editable');
  if (!canEdit) {
    if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '当前版本不支持输入', icon: 'none' });
    }
    return;
  }
  wx.showModal({
    title: '发送消息',
    editable: true,
    placeholderText: '输入发送:',
    success: function(res) {
      if (!res.confirm || res.content == null) {
        return;
      }
      app.trySendOnlineChatText(res.content);
    }
  });
};

app.promptOnlineChatText = function() {
  if (typeof wx === 'undefined') {
    return;
  }
  if (typeof app.dismissFriendListSearchKeyboard === 'function') {
    app.dismissFriendListSearchKeyboard();
  }
  if (typeof app.dismissOnlineChatKeyboard === 'function') {
    app.dismissOnlineChatKeyboard();
  }
  if (typeof wx.showKeyboard !== 'function') {
    app._fallbackOnlineChatModal();
    return;
  }
  var draft0 =
    app.onlineChatInputDraft != null ? String(app.onlineChatInputDraft) : '';
  var kbCleaned = false;
  var onInput = function(res) {
    app.onlineChatInputDraft = res && res.value != null ? String(res.value) : '';
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };
  var onConfirm = function(res) {
    var v =
      res && res.value != null
        ? String(res.value)
        : app.onlineChatInputDraft != null
          ? String(app.onlineChatInputDraft)
          : '';
    cleanup();
    try {
      if (typeof wx.hideKeyboard === 'function') {
        wx.hideKeyboard({});
      }
    } catch (eH) {}
    app.onlineChatInputDraft = '';
    if (app.trySendOnlineChatText(v)) {
      return;
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };
  var onComplete = function() {
    cleanup();
  };
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
    app._onlineChatKeyboardCleanup = null;
  }
  app._onlineChatKeyboardCleanup = cleanup;
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
    app._fallbackOnlineChatModal();
    return;
  }
  wx.showKeyboard({
    defaultValue: draft0,
    maxLength: 30,
    multiple: false,
    confirmHold: false,
    confirmType: 'send',
    fail: function() {
      cleanup();
      app._fallbackOnlineChatModal();
    }
  });
};

app.reportOnlineChatMessage = function(msg) {
  if (!app.onlineRoomId || !msg || msg.id == null) {
    return;
  }
  wx.request(
    Object.assign(
      roomApi.roomChatReportOptions({
        roomId: app.onlineRoomId,
        messageId: Number(msg.id)
      }),
      {
        success: function(res) {
          if (res.statusCode === 200) {
            wx.showToast({ title: '已收到举报', icon: 'none' });
          } else {
            wx.showToast({ title: '提交失败', icon: 'none' });
          }
        },
        fail: function() {
          wx.showToast({ title: '网络异常', icon: 'none' });
        }
      }
    )
  );
};

/**
 * 联机聊天浮层（半透明、表情行、ONLINE_CHAT_QUICK 短语网格、输入发送；不展示聊天记录）
 * 高度随内容，下沿在底栏上方；打开时自下而上滑入（见 getOnlineChatPanelAnim）
 */
app.drawOnlineChatPanel = function(th, btnY) {
  var L = app.getGameActionBarLayout();
  var barTop = L.y0;
  var oy = app.layout.originY;
  var gapAboveBar = app.rpx(8);
  var panelBottom = barTop - gapAboveBar;
  var headerH = app.rpx(80);
  var sectionGap = app.rpx(10);
  var emojiRowH = app.rpx(76);
  var phraseCellH = app.rpx(52);
  var phraseRows = 2;
  var phraseGapY = app.rpx(8);
  var phraseBlockH =
    phraseCellH * phraseRows + phraseGapY * (phraseRows - 1);
  var inpRowH = app.rpx(88);
  var bannerH =
    app.onlineChatBanner && app.onlineChatBanner.until > Date.now()
      ? app.rpx(28)
      : 0;
  var bottomFixed =
    sectionGap +
    app.rpx(4) +
    emojiRowH +
    sectionGap +
    phraseBlockH +
    sectionGap +
    inpRowH +
    app.rpx(6);
  var contentH =
    headerH + app.rpx(6) + bannerH + bottomFixed + app.rpx(10);
  var minH = app.rpx(200);
  var ph = Math.max(minH, contentH);
  var panelTop0 = panelBottom - ph;
  if (panelTop0 < oy) {
    panelTop0 = oy;
    ph = panelBottom - panelTop0;
  }
  var anim =
    typeof app.getOnlineChatPanelAnim === 'function'
      ? app.getOnlineChatPanelAnim()
      : 1;
  if (anim >= 1) {
    anim = 1;
  }
  var slideY = anim >= 1 ? 0 : (1 - anim) * ph;
  var panelTop = panelTop0 + slideY;
  panelTop = Math.round(panelTop);

  var ctx = app.ctx;
  var w = app.W;
  var pad = app.rpx(28);

  app.onlineChatBubbleHits = [];
  ctx.save();

  ctx.shadowColor = 'rgba(60, 48, 36, 0.1)';
  ctx.shadowBlur = app.rpx(10);
  ctx.shadowOffsetY = app.rpx(3);
  ctx.fillStyle = 'rgba(255, 251, 240, 0.82)';
  var crTop = app.rpx(16);
  app.roundRect(0, panelTop, w, ph, crTop);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  var titleFont =
    '600 ' +
    app.rpx(34) +
    'px "Songti SC","STSong","SimSun","PingFang SC","Microsoft YaHei",serif';
  ctx.font = titleFont;
  ctx.fillStyle = '#3a3830';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('消息', w * 0.5, panelTop + headerH * 0.5);

  var closeR = app.rpx(36);
  var closeCx = w - pad - closeR * 0.5;
  var closeCy = panelTop + headerH * 0.5;
  ctx.font = '300 ' + app.rpx(40) + 'px sans-serif';
  ctx.fillStyle = '#8a8580';
  ctx.textAlign = 'center';
  ctx.fillText('×', closeCx, closeCy + app.rpx(2));

  ctx.strokeStyle = 'rgba(92, 82, 72, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, panelTop + headerH);
  ctx.lineTo(w - pad, panelTop + headerH);
  ctx.stroke();

  var yMsg = panelTop + headerH + app.rpx(6);
  if (bannerH > 0) {
    ctx.font = app.rpx(22) + 'px sans-serif';
    ctx.fillStyle = '#c03030';
    ctx.textAlign = 'center';
    ctx.fillText(
      app.onlineChatBanner.text,
      w * 0.5,
      yMsg + app.rpx(14)
    );
    yMsg += bannerH;
  }

  var emojiSecTop = yMsg + sectionGap;
  var qy = emojiSecTop + app.rpx(4);
  var gapCell = app.rpx(10);
  var cellW = (w - pad * 2 - gapCell * 4) / 5;
  var qiRow = app.ONLINE_CHAT_EMOJI_QUICK_ROW || [];
  var emojiRects = [];
  var qix;
  for (qix = 0; qix < qiRow.length; qix++) {
    var cx = pad + qix * (cellW + gapCell);
    ctx.fillStyle = 'rgba(245, 240, 230, 0.88)';
    app.roundRect(cx, qy, cellW, emojiRowH - app.rpx(8), app.rpx(12));
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 82, 72, 0.15)';
    ctx.lineWidth = 1;
    app.roundRect(cx, qy, cellW, emojiRowH - app.rpx(8), app.rpx(12));
    ctx.stroke();
    ctx.font = app.rpx(36) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      qiRow[qix],
      cx + cellW * 0.5,
      qy + (emojiRowH - app.rpx(8)) * 0.52
    );
    emojiRects.push({
      x: cx,
      y: qy,
      w: cellW,
      h: emojiRowH - app.rpx(8),
      emoji: qiRow[qix]
    });
  }

  var phraseList = app.ONLINE_CHAT_QUICK || [];
  var phraseCols = 4;
  var phraseGapX = app.rpx(8);
  var phraseW =
    (w - pad * 2 - phraseGapX * (phraseCols - 1)) / phraseCols;
  var py0 = qy + emojiRowH + sectionGap;
  var phraseFs = app.rpx(22);
  var phraseRects = [];
  var pi;
  for (pi = 0; pi < phraseList.length; pi++) {
    var pr = Math.floor(pi / phraseCols);
    var pc = pi % phraseCols;
    var px = pad + pc * (phraseW + phraseGapX);
    var py = py0 + pr * (phraseCellH + phraseGapY);
    var ptxt = String(phraseList[pi]);
    ctx.fillStyle = 'rgba(245, 240, 230, 0.88)';
    app.roundRect(px, py, phraseW, phraseCellH, app.rpx(10));
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 82, 72, 0.15)';
    ctx.lineWidth = 1;
    app.roundRect(px, py, phraseW, phraseCellH, app.rpx(10));
    ctx.stroke();
    ctx.font =
      phraseFs +
      'px "PingFang SC","Songti SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#5c5348';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var showTxt = ptxt;
    while (
      showTxt.length > 1 &&
      ctx.measureText(showTxt).width > phraseW - app.rpx(12)
    ) {
      showTxt = showTxt.slice(0, -1);
    }
    if (showTxt.length < ptxt.length) {
      showTxt = showTxt.slice(0, -1) + '…';
    }
    ctx.fillText(showTxt, px + phraseW * 0.5, py + phraseCellH * 0.52);
    phraseRects.push({
      x: px,
      y: py,
      w: phraseW,
      h: phraseCellH,
      phrase: ptxt
    });
  }

  var iy = py0 + phraseBlockH + sectionGap;
  var iH = inpRowH - app.rpx(12);
  var iW = w * 0.68;
  ctx.strokeStyle = 'rgba(224, 216, 204, 0.85)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(255, 252, 247, 0.9)';
  app.roundRect(pad, iy, iW, iH, app.rpx(12));
  ctx.fill();
  ctx.stroke();
  ctx.font = app.rpx(24) + 'px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  var draftStr =
    app.onlineChatInputDraft != null
      ? String(app.onlineChatInputDraft)
      : '';
  var inpTextX = pad + app.rpx(18);
  var inpMaxTextW = iW - app.rpx(28);
  if (draftStr) {
    ctx.fillStyle = '#5c5348';
    var dispDraft = draftStr;
    while (
      dispDraft.length > 0 &&
      ctx.measureText(dispDraft).width > inpMaxTextW
    ) {
      dispDraft = dispDraft.slice(1);
    }
    if (dispDraft.length < draftStr.length && dispDraft.length > 0) {
      dispDraft = '…' + dispDraft.slice(1);
    }
    ctx.fillText(dispDraft, inpTextX, iy + iH * 0.5);
  } else {
    ctx.fillStyle = '#9a938a';
    ctx.fillText('输入发送:', inpTextX, iy + iH * 0.5);
  }

  var sbw = w - pad * 2 - iW - app.rpx(12);
  var sbL = pad + iW + app.rpx(12);
  ctx.fillStyle = 'rgba(212, 184, 148, 0.92)';
  app.roundRect(sbL, iy, sbw, iH, app.rpx(12));
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = app.rpx(26) + 'px "PingFang SC",sans-serif';
  ctx.fillText('发送', sbL + sbw * 0.5, iy + iH * 0.52);

  var emojiPanelRect = null;
  if (app.onlineChatEmojiOpen) {
    var epW = Math.min(app.rpx(560), w - pad * 2);
    var epH = app.rpx(220);
    var ex = pad;
    var ey = qy - epH - app.rpx(8);
    if (ey < panelTop + headerH + app.rpx(8)) {
      ey = qy + emojiRowH + app.rpx(8);
    }
    emojiPanelRect = { x: ex, y: ey, w: epW, h: epH };
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    app.roundRect(ex, ey, epW, epH, app.rpx(10));
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 82, 72, 0.12)';
    ctx.lineWidth = 1;
    app.roundRect(ex, ey, epW, epH, app.rpx(10));
    ctx.stroke();
    var ei;
    var ecx = ex + app.rpx(22);
    var ecy = ey + app.rpx(28);
    for (ei = 0; ei < app.ONLINE_CHAT_EMOJIS.length; ei++) {
      ctx.font = app.rpx(32) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(app.ONLINE_CHAT_EMOJIS[ei], ecx, ecy);
      ecx += app.rpx(72);
      if (ei === 5) {
        ecx = ex + app.rpx(22);
        ecy += app.rpx(56);
      }
    }
  }

  ctx.restore();

  app.onlineChatPanelLayout = {
    panelTop: panelTop0,
    panelTopDrawn: panelTop,
    panelH: ph,
    barTop: barTop,
    slideY: slideY,
    closeRect: {
      x: closeCx - closeR,
      y: panelTop + headerH * 0.5 - closeR,
      w: closeR * 2,
      h: closeR * 2
    },
    emojiMoreLabel: null,
    inpY: iy,
    inpH: iH,
    inpW: iW,
    phraseArrow: null,
    phraseQuickRects: phraseRects,
    sendL: sbL,
    sendW: sbw,
    emojiQuickRects: emojiRects,
    emojiPanel: emojiPanelRect
  };
};

app.hitOnlineChatPanel = function(clientX, clientY) {
  var pl = app.onlineChatPanelLayout;
  if (!pl) {
    return null;
  }
  var topDraw =
    pl.panelTopDrawn != null ? pl.panelTopDrawn : pl.panelTop;
  if (
    clientY < topDraw ||
    clientY >= pl.barTop ||
    clientX < 0 ||
    clientX > app.W
  ) {
    return null;
  }
  var pad = app.rpx(28);
  var cr = pl.closeRect;
  if (
    cr &&
    clientX >= cr.x &&
    clientX <= cr.x + cr.w &&
    clientY >= cr.y &&
    clientY <= cr.y + cr.h
  ) {
    return { kind: 'close' };
  }
  if (
    clientX >= pl.sendL &&
    clientX <= pl.sendL + pl.sendW &&
    clientY >= pl.inpY &&
    clientY <= pl.inpY + pl.inpH
  ) {
    return { kind: 'send' };
  }
  if (pl.phraseQuickRects && pl.phraseQuickRects.length) {
    var pqi;
    for (pqi = 0; pqi < pl.phraseQuickRects.length; pqi++) {
      var pr = pl.phraseQuickRects[pqi];
      if (
        clientX >= pr.x &&
        clientX <= pr.x + pr.w &&
        clientY >= pr.y &&
        clientY <= pr.y + pr.h
      ) {
        return { kind: 'phrase_pick', phrase: pr.phrase };
      }
    }
  }
  if (
    clientX >= pad &&
    clientX <= pad + pl.inpW &&
    clientY >= pl.inpY &&
    clientY <= pl.inpY + pl.inpH
  ) {
    return { kind: 'input' };
  }
  if (pl.emojiQuickRects && pl.emojiQuickRects.length) {
    var eri;
    for (eri = 0; eri < pl.emojiQuickRects.length; eri++) {
      var er = pl.emojiQuickRects[eri];
      if (
        clientX >= er.x &&
        clientX <= er.x + er.w &&
        clientY >= er.y &&
        clientY <= er.y + er.h
      ) {
        if (er.emoji) {
          return { kind: 'emoji_pick', emoji: er.emoji };
        }
      }
    }
  }
  if (pl.emojiPanel) {
    var ep = pl.emojiPanel;
    if (
      clientX >= ep.x &&
      clientX <= ep.x + ep.w &&
      clientY >= ep.y &&
      clientY <= ep.y + ep.h
    ) {
      var col = Math.floor((clientX - ep.x - app.rpx(16)) / app.rpx(72));
      var row = Math.floor((clientY - ep.y - app.rpx(10)) / app.rpx(56));
      var ei = row * 6 + col;
      if (ei >= 0 && ei < app.ONLINE_CHAT_EMOJIS.length) {
        return { kind: 'emoji_pick', emoji: app.ONLINE_CHAT_EMOJIS[ei] };
      }
    }
  }
  return { kind: 'inside' };
};

app.hitUndoRespondRow = function(clientX, clientY) {
  if (!app.showUndoRespondRow()) {
    return null;
  }
  var Ls = app.getGameActionBarLayout();
  var urY =
    (Ls.statusChipH > 0
      ? Ls.statusCenterY - Ls.statusChipH * 0.5 - app.rpx(12)
      : Ls.y0 - app.rpx(10)) - 17;
  var halfW = 44;
  var halfH = 20;
  if (
    Math.abs(clientX - app.W * 0.35) <= halfW &&
    Math.abs(clientY - urY) <= halfH
  ) {
    return 'accept';
  }
  if (
    Math.abs(clientX - app.W * 0.65) <= halfW &&
    Math.abs(clientY - urY) <= halfH
  ) {
    return 'reject';
  }
  return null;
}

app.hitDrawRespondRow = function(clientX, clientY) {
  if (!app.showDrawRespondRow()) {
    return null;
  }
  var Ls = app.getGameActionBarLayout();
  var drY =
    (Ls.statusChipH > 0
      ? Ls.statusCenterY - Ls.statusChipH * 0.5 - app.rpx(12)
      : Ls.y0 - app.rpx(10)) - 17;
  var halfW = 44;
  var halfH = 20;
  if (
    Math.abs(clientX - app.W * 0.35) <= halfW &&
    Math.abs(clientY - drY) <= halfH
  ) {
    return 'accept';
  }
  if (
    Math.abs(clientX - app.W * 0.65) <= halfW &&
    Math.abs(clientY - drY) <= halfH
  ) {
    return 'reject';
  }
  return null;
}

app.handleUndoButtonTap = function() {
  if (app.gameOver) {
    return;
  }
  if (app.localDrawRequest) {
    wx.showToast({ title: '请先处理和棋申请', icon: 'none' });
    return;
  }
  if (app.isPvpOnline && app.onlineDrawPending) {
    wx.showToast({ title: '请先处理和棋申请', icon: 'none' });
    return;
  }
  if (app.isPvpOnline) {
    if (app.onlineUndoPending) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title:
            app.pvpOnlineYourColor === app.onlineUndoRequesterColor
              ? '请等待对方处理'
              : '请在弹窗中同意或拒绝',
          icon: 'none'
        });
      }
      return;
    }
    if (
      app.getOnlineUndoCooldownRemainingMs &&
      app.getOnlineUndoCooldownRemainingMs() > 0
    ) {
      var remTap = app.getOnlineUndoCooldownRemainingMs();
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title:
            '请等待 ' + Math.ceil(remTap / 1000) + ' 秒后再发起悔棋',
          icon: 'none'
        });
      }
      return;
    }
    app.sendOnlineUndo('UNDO_REQUEST');
    return;
  }
  if (app.isPvpLocal) {
    if (app.localUndoRequest) {
      app.execLocalUndoCancel();
      return;
    }
    app.tryLocalUndoRequest();
    return;
  }
  app.execPveUndo();
}

app.onBoard = function(clientX, clientY) {
  var cell = app.layout.cell;
  var ox = app.layout.originX;
  var oy = app.layout.originY;
  var max = (app.SIZE - 1) * cell;
  var pad = cell * 0.45;
  return (
    clientX >= ox - pad &&
    clientX <= ox + max + pad &&
    clientY >= oy - pad &&
    clientY <= oy + max + pad
  );
}

app.firstEmptyCellForBoard = function() {
  var i;
  var j;
  for (i = 0; i < app.SIZE; i++) {
    for (j = 0; j < app.SIZE; j++) {
      if (app.board[i][j] === gomoku.EMPTY) {
        return { r: i, c: j };
      }
    }
  }
  return null;
}

app.copyBoardForAiWorker = function(b) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < app.SIZE; i++) {
    out[i] = [];
    for (j = 0; j < app.SIZE; j++) {
      out[i][j] = b[i][j];
    }
  }
  return out;
}

app.destroyAiWorker = function() {
  if (!app.aiWorkerInstance) {
    return;
  }
  try {
    app.aiWorkerInstance.terminate();
  } catch (e1) {}
  app.aiWorkerInstance = null;
}

app.ensureAiWorker = function() {
  if (app.aiWorkerInstance) {
    return true;
  }
  if (typeof wx === 'undefined' || typeof wx.createWorker !== 'function') {
    return false;
  }
  try {
    app.aiWorkerInstance = wx.createWorker('workers/index.js');
    app.aiWorkerInstance.onMessage(function (res) {
      if (!res || res.type !== 'AI_MOVE_RESULT') {
        return;
      }
      if (res.seq !== app.aiWorkerSeq) {
        return;
      }
      if (app.gameOver || app.isPvpLocal) {
        return;
      }
      var puzzleOnlineBot =
        app.isPvpOnline &&
        !app.onlineSpectatorMode &&
        (app.onlinePuzzleFriendRoom || app.onlinePuzzleRoomFromWs) &&
        typeof app.onlinePuzzleFriendBotStoneColor === 'function' &&
        app.onlinePuzzleFriendBotStoneColor() != null &&
        app.current === app.onlinePuzzleFriendBotStoneColor();
      if (app.isPvpOnline && !puzzleOnlineBot) {
        return;
      }
      if (app.screen !== 'game') {
        return;
      }
      if (puzzleOnlineBot) {
        if (res.gen !== app.onlinePuzzleClientBotGen) {
          return;
        }
        if (app.current !== app.onlinePuzzleFriendBotStoneColor()) {
          return;
        }
        var mvP = res.move;
        if (res.err) {
          console.error('worker online puzzle bot', res.err);
        }
        if (!mvP) {
          mvP = app.firstEmptyCellForBoard();
        }
        if (mvP && typeof app.postOnlinePuzzleClientBotMove === 'function') {
          app.postOnlinePuzzleClientBotMove(mvP);
        }
        return;
      }
      var isDaily = app.isDailyPuzzle;
      if (isDaily) {
        if (res.gen !== app.dailyPuzzleBotGen) {
          return;
        }
        if (app.current !== app.dailyPuzzleBotColor()) {
          return;
        }
      } else {
        if (res.gen !== app.aiMoveGeneration) {
          return;
        }
        if (app.current !== app.pveAiColor()) {
          return;
        }
      }
      var mv = res.move;
      if (res.err) {
        console.error('worker ai', res.err);
      }
      if (!mv) {
        mv = app.firstEmptyCellForBoard();
        if (!mv) {
          app.gameOver = true;
          app.winner = null;
          app.openResult();
          app.draw();
          return;
        }
      }
      if (isDaily) {
        app.applyDailyBotMoveResult(mv);
      } else {
        app.applyAiMoveResult(mv);
      }
    });
    if (typeof app.aiWorkerInstance.onProcessKilled === 'function') {
      app.aiWorkerInstance.onProcessKilled(function () {
        app.aiWorkerInstance = null;
      });
    }
    return true;
  } catch (e) {
    app.aiWorkerInstance = null;
    return false;
  }
}

app.applyAiMoveResult = function(mv) {
  var ai = app.pveAiColor();
  app.board[mv.r][mv.c] = ai;
  app.pveMoveHistory.push({ r: mv.r, c: mv.c, color: ai });
  app.lastOpponentMove = { r: mv.r, c: mv.c };
  if (gomoku.checkWin(app.board, mv.r, mv.c, ai)) {
    app.finishGameWithWin(mv.r, mv.c, ai);
    return;
  }
  if (gomoku.isBoardFull(app.board)) {
    app.gameOver = true;
    app.winner = null;
    app.openResult();
    return;
  }
  app.current = app.pveHumanColor;
  app.draw();
}

app.openingOptionsForAi = function() {
  return { rif: true, dailyDifficulty: 3 };
}

/**
 * 每日残局守关方：走子仅使用小程序内人机（Worker workers/index.js → gomoku_ai.js，
 * 无 Worker 时主线程 gomoku.aiMove 兜底）。残局好友房人机与每日同源（见 openingOptionsForOnlinePuzzleBot）。
 * difficulty 1–3 映射至 gomoku_ai 搜索强度。
 */
app.openingOptionsForDailyBot = function() {
  var lv = 3;
  if (app.dailyPuzzleMeta && app.dailyPuzzleMeta.difficulty != null) {
    lv = Number(app.dailyPuzzleMeta.difficulty);
    if (isNaN(lv) || lv < 1) {
      lv = 3;
    }
    if (lv > 3) {
      lv = 3;
    }
  }
  return { rif: true, dailyDifficulty: lv };
};

app.scheduleDailyPuzzleBotIfNeeded = function() {
  if (
    !app.isDailyPuzzle ||
    app.isPvpOnline ||
    app.gameOver ||
    app.dailyPuzzleSubmitting
  ) {
    return;
  }
  if (app.current !== app.dailyPuzzleBotColor()) {
    return;
  }
  setTimeout(function() {
    app.runDailyPuzzleBotMove();
  }, 220);
};

app.applyDailyBotMoveResult = function(mv) {
  var bot = app.dailyPuzzleBotColor();
  app.board[mv.r][mv.c] = bot;
  app.dailyPuzzleMoves.push({ r: mv.r, c: mv.c, color: bot });
  app.lastOpponentMove = { r: mv.r, c: mv.c };
  app.playPlaceStoneSound();
  if (gomoku.checkWin(app.board, mv.r, mv.c, bot)) {
    app.finishDailyPuzzleBotWin(mv.r, mv.c);
    return;
  }
  if (gomoku.isBoardFull(app.board)) {
    app.submitDailyPuzzleMovesAndHandle(mv.r, mv.c, bot, false);
    return;
  }
  app.current = app.dailyPuzzleUserColor;
  app.draw();
};

app.finishDailyPuzzleBotWin = function(r, c) {
  app.dailyPuzzleResultKind = 'daily_puzzle_bot_win';
  app.finishGameWithWin(r, c, app.dailyPuzzleBotColor());
};

app.runDailyPuzzleBotMove = function() {
  if (app.gameOver || !app.isDailyPuzzle || app.dailyPuzzleSubmitting) {
    return;
  }
  var bot = app.dailyPuzzleBotColor();
  if (app.current !== bot) {
    return;
  }
  if (app.ensureAiWorker()) {
    app.aiWorkerSeq++;
    app.aiWorkerInstance.postMessage({
      type: 'AI_MOVE',
      seq: app.aiWorkerSeq,
      gen: app.dailyPuzzleBotGen,
      board: app.copyBoardForAiWorker(app.board),
      aiColor: bot,
      openingOptions: app.openingOptionsForDailyBot()
    });
    return;
  }
  var mv;
  try {
    mv = gomoku.aiMove(app.board, bot, app.openingOptionsForDailyBot());
  } catch (err) {
    console.error('daily aiMove', err);
    mv = null;
  }
  if (!mv) {
    mv = app.firstEmptyCellForBoard();
    if (!mv) {
      app.submitDailyPuzzleMovesAndHandle(0, 0, bot, false);
      return;
    }
  }
  app.applyDailyBotMoveResult(mv);
};

/** 与每日残局人机同源；残局房元数据未下发明细难度时默认 3 */
app.openingOptionsForOnlinePuzzleBot = function() {
  return { rif: true, dailyDifficulty: 3 };
};

app.postOnlinePuzzleClientBotMove = function(mv) {
  if (!mv || app.gameOver || !app.isPvpOnline) {
    return;
  }
  if (!app.onlineSocketCanSend || !app.onlineSocketCanSend()) {
    return;
  }
  if (!app.onlinePuzzleFriendRoom && !app.onlinePuzzleRoomFromWs) {
    return;
  }
  var bot =
    typeof app.onlinePuzzleFriendBotStoneColor === 'function'
      ? app.onlinePuzzleFriendBotStoneColor()
      : null;
  if (bot == null || app.current !== bot) {
    return;
  }
  app.socketTask.send({
    data: JSON.stringify({ type: 'CLIENT_BOT_MOVE', r: mv.r, c: mv.c })
  });
};

app.scheduleOnlinePuzzleClientBotIfNeeded = function() {
  if (
    !app.isPvpOnline ||
    app.onlineSpectatorMode ||
    app.gameOver ||
    (!app.onlinePuzzleFriendRoom && !app.onlinePuzzleRoomFromWs)
  ) {
    return;
  }
  var bot =
    typeof app.onlinePuzzleFriendBotStoneColor === 'function'
      ? app.onlinePuzzleFriendBotStoneColor()
      : null;
  if (bot == null || app.current !== bot) {
    return;
  }
  if (!app.onlineSocketCanSend || !app.onlineSocketCanSend()) {
    return;
  }
  setTimeout(function() {
    app.runOnlinePuzzleFriendBotMove();
  }, 350);
};

app.runOnlinePuzzleFriendBotMove = function() {
  if (app.gameOver || !app.isPvpOnline || app.onlineSpectatorMode) {
    return;
  }
  if (!app.onlinePuzzleFriendRoom && !app.onlinePuzzleRoomFromWs) {
    return;
  }
  var bot = app.onlinePuzzleFriendBotStoneColor();
  if (bot == null || app.current !== bot) {
    return;
  }
  if (!app.onlineSocketCanSend || !app.onlineSocketCanSend()) {
    return;
  }
  var gen = app.onlinePuzzleClientBotGen || 0;
  if (app.ensureAiWorker()) {
    app.aiWorkerSeq++;
    app.aiWorkerInstance.postMessage({
      type: 'AI_MOVE',
      seq: app.aiWorkerSeq,
      gen: gen,
      board: app.copyBoardForAiWorker(app.board),
      aiColor: bot,
      openingOptions: app.openingOptionsForOnlinePuzzleBot()
    });
    return;
  }
  var mv;
  try {
    mv = gomoku.aiMove(
      app.board,
      bot,
      app.openingOptionsForOnlinePuzzleBot()
    );
  } catch (err) {
    console.error('online puzzle bot aiMove', err);
    mv = null;
  }
  if (!mv) {
    mv = app.firstEmptyCellForBoard();
    if (!mv) {
      return;
    }
  }
  app.postOnlinePuzzleClientBotMove(mv);
};

app.runAiMove = function() {
  if (app.gameOver || app.isPvpLocal || app.isPvpOnline || app.isDailyPuzzle) {
    return;
  }
  var ai = app.pveAiColor();
  if (app.current !== ai) {
    return;
  }
  if (app.ensureAiWorker()) {
    app.aiWorkerSeq++;
    app.aiWorkerInstance.postMessage({
      type: 'AI_MOVE',
      seq: app.aiWorkerSeq,
      gen: app.aiMoveGeneration,
      board: app.copyBoardForAiWorker(app.board),
      aiColor: ai,
      openingOptions: app.openingOptionsForAi()
    });
    return;
  }
  var mv;
  try {
    mv = gomoku.aiMove(app.board, ai, app.openingOptionsForAi());
  } catch (err) {
    console.error('aiMove', err);
    mv = null;
  }
  if (!mv) {
    mv = app.firstEmptyCellForBoard();
    if (!mv) {
      app.gameOver = true;
      app.winner = null;
      app.openResult();
      app.draw();
      return;
    }
  }
  app.applyAiMoveResult(mv);
}

app.tryPlace = function(r, c) {
  function restorePuzzleFriendPracticeStart() {
    if (!app.puzzleFriendPracticeStartBoard) {
      return;
    }
    var pb = app.copyBoardFromServer(app.puzzleFriendPracticeStartBoard);
    var br;
    var bc;
    for (br = 0; br < app.SIZE; br++) {
      for (bc = 0; bc < app.SIZE; bc++) {
        app.board[br][bc] = pb[br][bc];
      }
    }
    app.current =
      app.puzzleFriendPracticeStartCurrent != null
        ? app.puzzleFriendPracticeStartCurrent
        : app.BLACK;
  }
  if (app.gameOver) return;
  if (app.isPvpOnline && app.onlineSpectatorMode) {
    if (
      app.onlinePuzzleFriendRoom &&
      typeof app.puzzleFriendSpectatorPracticeAllowed === 'function' &&
      app.puzzleFriendSpectatorPracticeAllowed()
    ) {
      if (app.board[r][c] !== gomoku.EMPTY) {
        return;
      }
      var placedColor = app.current;
      app.board[r][c] = placedColor;
      app.playPlaceStoneSound();
      if (gomoku.checkWin(app.board, r, c, placedColor)) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '练习：连成五子', icon: 'none' });
        }
        restorePuzzleFriendPracticeStart();
      } else if (gomoku.isBoardFull(app.board)) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '练习：棋盘已满', icon: 'none' });
        }
        restorePuzzleFriendPracticeStart();
      } else {
        app.current = placedColor === app.BLACK ? app.WHITE : app.BLACK;
      }
      app.lastMsg = '';
      app.draw();
      return;
    }
    return;
  }
  if (app.localUndoRequest) {
    return;
  }
  if (app.localDrawRequest) {
    return;
  }
  if (app.isPvpOnline && app.onlineUndoPending) {
    return;
  }
  if (app.isPvpOnline && app.onlineDrawPending) {
    return;
  }
  if (app.isPvpOnline) {
    if (app.current !== app.pvpOnlineYourColor) {
      return;
    }
    if (app.board[r][c] !== gomoku.EMPTY) {
      return;
    }
    if (app.onlineSocketCanSend()) {
      app.lastOpponentMove = null;
      app.socketTask.send({
        data: JSON.stringify({ type: 'MOVE', r: r, c: c })
      });
    } else if (typeof app.notifyOnlineSocketSendBlocked === 'function') {
      app.notifyOnlineSocketSendBlocked();
    } else if (typeof wx.showToast === 'function') {
      wx.showToast({ title: '对战暂时无法同步', icon: 'none' });
    }
    return;
  }
  if (app.isDailyPuzzle) {
    if (app.dailyPuzzleSubmitting) {
      return;
    }
    if (app.current !== app.dailyPuzzleUserColor) {
      return;
    }
    if (app.board[r][c] !== gomoku.EMPTY) {
      return;
    }
    var dPlaced = app.current;
    app.board[r][c] = dPlaced;
    app.playPlaceStoneSound();
    app.dailyPuzzleMoves.push({ r: r, c: c, color: dPlaced });
    if (gomoku.checkWin(app.board, r, c, dPlaced)) {
      app.submitDailyPuzzleMovesAndHandle(r, c, dPlaced, true);
      return;
    }
    if (gomoku.isBoardFull(app.board)) {
      app.submitDailyPuzzleMovesAndHandle(r, c, dPlaced, false);
      return;
    }
    app.current = app.dailyPuzzleBotColor();
    app.lastMsg = '';
    app.draw();
    app.scheduleDailyPuzzleBotIfNeeded();
    return;
  }
  if (app.board[r][c] !== gomoku.EMPTY) return;

  var placedColor = app.current;
  app.board[r][c] = placedColor;
  app.playPlaceStoneSound();
  if (app.isPvpLocal) {
    app.localMoveHistory.push({ r: r, c: c, color: placedColor });
    app.lastOpponentMove = { r: r, c: c };
  } else if (!app.isPvpOnline) {
    app.pveMoveHistory.push({ r: r, c: c, color: placedColor });
    app.lastOpponentMove = null;
  }
  if (gomoku.checkWin(app.board, r, c, app.current)) {
    app.finishGameWithWin(r, c, app.current);
    return;
  }

  if (gomoku.isBoardFull(app.board)) {
    app.gameOver = true;
    app.winner = null;
    app.openResult();
    return;
  }

  app.current = app.current === app.BLACK ? app.WHITE : app.BLACK;
  app.lastMsg = '';
  app.draw();

  if (
    !app.isPvpLocal &&
    !app.gameOver &&
    app.current === app.pveAiColor()
  ) {
    setTimeout(function () {
      app.runAiMove();
    }, 200);
  }
}

/* ---------- 触摸与生命周期 ---------- */

app.lastTouchDownX = 0;
app.lastTouchDownY = 0;

wx.onTouchStart(function (e) {
  var t = e.touches[0];
  var x = t.clientX;
  var y = t.clientY;
  app.lastTouchDownX = x;
  app.lastTouchDownY = y;

  if (app.screen === 'admin_puzzle') {
    if (
      e.touches &&
      e.touches[0] &&
      typeof app.handleAdminPuzzleTouchStart === 'function'
    ) {
      app.handleAdminPuzzleTouchStart(
        e.touches[0].clientX,
        e.touches[0].clientY,
        e.touches[0].identifier
      );
    }
    return;
  }

  if (app.screen === 'history') {
    if (app.ratingCardVisible) {
      if (app.hitRatingCardClose(x, y)) {
        if (typeof app.clearRatingCardAddFriendTouch === 'function') {
          app.clearRatingCardAddFriendTouch();
        }
        app.ratingCardVisible = false;
        app.ratingCardData = null;
        app.draw();
        return;
      }
      if (
        typeof app.hitRatingCardAddFriend === 'function' &&
        app.hitRatingCardAddFriend(x, y)
      ) {
        var rdHist = app.ratingCardData;
        if (
          rdHist &&
          rdHist.addFriendEnabled !== false &&
          !app.addFriendInFlight
        ) {
          app.ratingCardAddFriendArmed = true;
          app.ratingCardAddFriendPressed = true;
          app.ratingCardAddFriendTouchStartX = x;
          app.ratingCardAddFriendTouchStartY = y;
          app.ratingCardAddFriendTouchId =
            e.touches && e.touches[0] ? e.touches[0].identifier : null;
          app.draw();
          return;
        }
        if (typeof app.onRatingCardAddFriendTap === 'function') {
          app.onRatingCardAddFriendTap();
        }
        return;
      }
      if (
        typeof app.hitRatingCardSyncProfile === 'function' &&
        app.hitRatingCardSyncProfile(x, y)
      ) {
        if (typeof app.syncMyProfileFromWeChat === 'function') {
          app.syncMyProfileFromWeChat();
        }
        return;
      }
      if (!app.hitRatingCardInside(x, y)) {
        if (typeof app.clearRatingCardAddFriendTouch === 'function') {
          app.clearRatingCardAddFriendTouch();
        }
        app.ratingCardVisible = false;
        app.ratingCardData = null;
        app.draw();
        return;
      }
      return;
    }
    if (app.historyReplayOverlayVisible) {
      app.layout = app.computeLayout();
      var rcH = app.hitReplayControl(x, y);
      if (rcH != null) {
        app.replayControlPressedId = rcH;
        app.replayTouchIdentifier = e.touches[0].identifier;
      } else {
        app.replayControlPressedId = null;
        app.replayTouchIdentifier = null;
      }
      app.draw();
      return;
    }
    var hi = app.hitHistoryInteract(x, y);
    if (hi === 'back') {
      app.historyListLoading = false;
      app.hideHistoryNativeLoading();
      app.historyReplayTouchRec = null;
      app.historyReplayTouchId = null;
      app.stopHistoryMomentum();
      app.historyScrollbarLastScrollTs = 0;
      app.screen = 'home';
      app.historyScrollTouchId = null;
      app.draw();
      return;
    }
    if (typeof hi === 'string' && hi.indexOf('tab') === 0) {
      var tn = parseInt(hi.slice(3), 10);
      if (!isNaN(tn) && tn >= 0 && tn <= 2) {
        app.historyFilterTab = tn;
        app.stopHistoryMomentum();
        app.historyScrollbarLastScrollTs = 0;
        app.historyScrollY = 0;
        app.draw();
        app.fetchHistoryListForCurrentFilter();
      }
      return;
    }
    var hRec = app.hitHistoryRowReplayIcon(x, y);
    if (hRec && e.touches && e.touches[0]) {
      app.historyReplayTouchRec = hRec;
      app.historyReplayTouchId = e.touches[0].identifier;
      app.historyListTouchStartX = x;
      app.historyListTouchStartY = y;
      return;
    }
    if (e.touches && e.touches[0] && app.hitHistoryListZone(x, y)) {
      app.stopHistoryMomentum();
      app.historyScrollTouchId = e.touches[0].identifier;
      app.historyScrollLastY = y;
      app.historyScrollLastTs = Date.now();
      app.historyScrollVel = 0;
      app.historyListTouchStartX = x;
      app.historyListTouchStartY = y;
    }
    return;
  }

  if (
    (app.screen === 'home' || app.screen === 'game') &&
    app.ratingCardVisible
  ) {
    if (app.hitRatingCardClose(x, y)) {
      if (typeof app.clearRatingCardAddFriendTouch === 'function') {
        app.clearRatingCardAddFriendTouch();
      }
      app.ratingCardVisible = false;
      app.ratingCardData = null;
      app.draw();
      return;
    }
    if (
      typeof app.hitRatingCardAddFriend === 'function' &&
      app.hitRatingCardAddFriend(x, y)
    ) {
      var rdCard = app.ratingCardData;
      if (
        rdCard &&
        rdCard.addFriendEnabled !== false &&
        !app.addFriendInFlight
      ) {
        app.ratingCardAddFriendArmed = true;
        app.ratingCardAddFriendPressed = true;
        app.ratingCardAddFriendTouchStartX = x;
        app.ratingCardAddFriendTouchStartY = y;
        app.ratingCardAddFriendTouchId =
          e.touches && e.touches[0] ? e.touches[0].identifier : null;
        app.draw();
        return;
      }
      if (typeof app.onRatingCardAddFriendTap === 'function') {
        app.onRatingCardAddFriendTap();
      }
      return;
    }
    if (
      typeof app.hitRatingCardSyncProfile === 'function' &&
      app.hitRatingCardSyncProfile(x, y)
    ) {
      if (typeof app.syncMyProfileFromWeChat === 'function') {
        app.syncMyProfileFromWeChat();
      }
      return;
    }
    if (!app.hitRatingCardInside(x, y)) {
      if (typeof app.clearRatingCardAddFriendTouch === 'function') {
        app.clearRatingCardAddFriendTouch();
      }
      app.ratingCardVisible = false;
      app.ratingCardData = null;
      app.draw();
      return;
    }
    return;
  }

  if (app.screen === 'home' && app.checkinModalVisible) {
    if (app.hitCheckinModalHeaderClose(x, y)) {
      app.checkinModalVisible = false;
      app.checkinModalData = null;
      app.draw();
      return;
    }
    if (app.hitCheckinModalPrimaryBtn(x, y)) {
      if (!app.isHomeCheckinDoneToday()) {
        if (!authApi.getSessionToken()) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          return;
        }
        wx.request(
          Object.assign(roomApi.meCheckinOptions(), {
            success: function (res) {
              var d = res.data;
              if (d && typeof d === 'string') {
                try {
                  d = JSON.parse(d);
                } catch (pe) {
                  d = null;
                }
              }
              if (res.statusCode === 401) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: '请先登录', icon: 'none' });
                }
                return;
              }
              if (res.statusCode !== 200 || !d) {
                if (typeof wx.showToast === 'function') {
                  wx.showToast({ title: '签到失败', icon: 'none' });
                }
                return;
              }
              app.syncCheckinStateFromServerPayload(d);
              if (app.checkinModalData) {
                app.checkinModalData.streak = app.getCheckinState().streak;
                app.checkinModalData.rewardPoints =
                  d.ok && !d.alreadySigned
                    ? d.rewardPoints
                    : app.CHECKIN_DAILY_POINTS;
                app.checkinModalData.totalPoints = app.getCheckinState().tuanPoints;
                app.checkinModalData.justSigned = !!(d.ok && !d.alreadySigned);
              }
              if (typeof wx.showToast === 'function') {
                if (d.alreadySigned) {
                  wx.showToast({ title: '今日已签到', icon: 'none' });
                } else if (d.ok) {
                  var msg = '签到成功 +' + d.rewardPoints + ' 积分';
                  if (d.newlyUnlockedTuanMoe) {
                    msg += '，「团团萌肤」已解锁';
                  }
                  wx.showToast({ title: msg, icon: 'none' });
                } else {
                  wx.showToast({ title: '签到失败', icon: 'none' });
                }
              }
              app.draw();
            },
            fail: function () {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '网络错误', icon: 'none' });
              }
            }
          })
        );
      }
      return;
    }
    if (
      app.hitCheckinModalPrevMonth(x, y) &&
      app.checkinModalData &&
      app.checkinModalCanGoPrevMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth
      )
    ) {
      var pM = app.checkinModalShiftMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth,
        -1
      );
      app.checkinModalData.viewYear = pM.y;
      app.checkinModalData.viewMonth = pM.m;
      app.draw();
      return;
    }
    if (
      app.hitCheckinModalNextMonth(x, y) &&
      app.checkinModalData &&
      app.checkinModalCanGoNextMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth
      )
    ) {
      var nM = app.checkinModalShiftMonth(
        app.checkinModalData.viewYear,
        app.checkinModalData.viewMonth,
        1
      );
      app.checkinModalData.viewYear = nM.y;
      app.checkinModalData.viewMonth = nM.m;
      app.draw();
      return;
    }
    if (
      app.hitCheckinModalPrevMonth(x, y) ||
      app.hitCheckinModalNextMonth(x, y)
    ) {
      return;
    }
    if (!app.hitCheckinModalInside(x, y)) {
      app.checkinModalVisible = false;
      app.checkinModalData = null;
      app.draw();
      return;
    }
    return;
  }

  if (app.screen === 'home' && app.pieceSkinModalVisible) {
    if (app.hitPieceSkinModalClose(x, y)) {
      app.closePieceSkinModal();
      return;
    }
    var redeemHit = app.hitPieceSkinModalRedeemButton(x, y);
    if (redeemHit >= 0) {
      app.pieceSkinModalPendingIdx = redeemHit;
      app.redeemPieceSkinWithPoints();
      return;
    }
    var cg = app.hitPieceSkinModalGridCatalogIndex(x, y);
    if (cg >= 0) {
      app.pieceSkinModalPendingIdx = cg;
      var catPick = themes.getPieceSkinCatalog();
      var entPick = catPick[cg];
      if (
        entPick &&
        entPick.rowStatus === 'points' &&
        entPick.costPoints &&
        entPick.costPoints > 0 &&
        themes.getShopCategory(entPick) !== themes.SHOP_CATEGORY_CONSUMABLE
      ) {
        app.draw();
        return;
      }
      var now = Date.now();
      var dblMs =
        app.PIECE_SKIN_WEAR_DBL_MS != null ? app.PIECE_SKIN_WEAR_DBL_MS : 450;
      if (
        app.pieceSkinWearDblIdx === cg &&
        now - app.pieceSkinWearDblAt <= dblMs
      ) {
        app.pieceSkinWearDblIdx = -1;
        app.applyPieceSkinWear();
        return;
      }
      app.pieceSkinWearDblIdx = cg;
      app.pieceSkinWearDblAt = now;
      app.draw();
      return;
    }
    if (!app.hitPieceSkinModalPanel(x, y)) {
      app.closePieceSkinModal();
      return;
    }
    return;
  }

  if (app.screen === 'home') {
    if (
      typeof app.onHomeFriendListTouchStart === 'function' &&
      app.onHomeFriendListTouchStart(x, y, e)
    ) {
      return;
    }
  }

  if (app.screen === 'home' && app.homeDrawerOpen) {
    if (app.hitHomeDrawerBackdrop(x, y)) {
      app.homeDrawerOpen = false;
      app.draw();
      return;
    }
    var dr = app.hitHomeDrawerRow(x, y);
    if (dr === null) {
      return;
    }
    var rows = app.getHomeDrawerRows();
    if (dr < 0 || dr >= rows.length) {
      return;
    }
    var kind = rows[dr].kind;
    if (kind === 'admin_puzzle') {
      app.homeDrawerOpen = false;
      if (typeof app.enterAdminPuzzleScreen === 'function') {
        app.enterAdminPuzzleScreen();
      }
      app.draw();
      return;
    }
    return;
  }

  if (
    app.screen === 'home' &&
    app.userIsAdmin &&
    !app.homeDrawerOpen &&
    !app.ratingCardVisible &&
    !app.checkinModalVisible &&
    !app.pieceSkinModalVisible &&
    !app.homeFriendListOpen &&
    typeof app.hitHomeDrawerTab === 'function' &&
    app.hitHomeDrawerTab(x, y)
  ) {
    app.homeDrawerTabPressed = true;
    app.draw();
    return;
  }

  if (app.screen === 'home') {
    var navHit = app.hitHomeNavIcon(x, y);
    if (navHit === 'avatar') {
      app.showMyRatingModal();
      return;
    }
    var homeBtnFirst = app.hitHomeButton(x, y);
    if (homeBtnFirst !== null) {
      app.homePressedDockCol = null;
      app.homePressedButton = homeBtnFirst;
      app.draw();
      return;
    }
    var dockHit = app.hitHomeBottomNav(x, y);
    if (dockHit !== null) {
      app.homePressedButton = null;
      app.homePressedDockCol = dockHit;
      app.draw();
      return;
    }
  }

  if (
    app.screen === 'game' &&
    app.isOnlineFriendMatchNotStarted() &&
    !app.gameOver
  ) {
    if (app.hitGameButton(x, y) !== 'back') {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '对局未开始', icon: 'none' });
      }
      return;
    }
  }

  if (
    app.screen === 'game' &&
    app.isPvpOnline &&
    typeof app.shouldShowOnlineChatButton === 'function' &&
    app.shouldShowOnlineChatButton() &&
    app.onlineChatOpen &&
    typeof app.hitOnlineChatPanel === 'function'
  ) {
    var chHit = app.hitOnlineChatPanel(x, y);
    if (chHit) {
      if (chHit.kind === 'close') {
        if (typeof app.dismissOnlineChatKeyboard === 'function') {
          app.dismissOnlineChatKeyboard();
        }
        app.onlineChatInputDraft = '';
        app.onlineChatOpen = false;
        app.onlineChatEmojiOpen = false;
        app._onlineChatAnimStartMs = 0;
        if (app._chatPanelAnimIv) {
          try {
            clearInterval(app._chatPanelAnimIv);
          } catch (eCl) {}
          app._chatPanelAnimIv = null;
        }
        app.draw();
        return;
      }
      if (chHit.kind === 'phrase_pick' && chHit.phrase) {
        if (typeof app.sendOnlineChat === 'function') {
          if (!app.sendOnlineChat('QUICK', chHit.phrase)) {
            return;
          }
        }
        if (typeof app.closeOnlineChatPanel === 'function') {
          app.closeOnlineChatPanel();
        }
        return;
      }
      if (chHit.kind === 'emoji_pick' && chHit.emoji) {
        app.onlineChatEmojiOpen = false;
        if (typeof app.sendOnlineChat === 'function') {
          if (!app.sendOnlineChat('EMOJI', chHit.emoji)) {
            return;
          }
        }
        if (typeof app.closeOnlineChatPanel === 'function') {
          app.closeOnlineChatPanel();
        }
        return;
      }
      if (chHit.kind === 'send') {
        var sd = String(app.onlineChatInputDraft || '').trim();
        if (sd) {
          if (typeof app.trySendOnlineChatText === 'function') {
            app.trySendOnlineChatText(sd);
          }
        } else if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '请先输入内容', icon: 'none' });
        }
        return;
      }
      if (chHit.kind === 'input') {
        if (typeof app.promptOnlineChatText === 'function') {
          app.promptOnlineChatText();
        }
        return;
      }
      if (chHit.kind === 'inside') {
        return;
      }
    }
  }

  if (app.screen === 'game') {
    var propHit = app.hitAvatarPropPanel(x, y);
    if (propHit) {
      if (typeof app.flashAvatarPropKeyPress === 'function') {
        app.flashAvatarPropKeyPress(propHit.side, propHit.key);
      }
      return;
    }
  }

  var boardAv =
    app.screen === 'replay' ||
    (app.screen === 'history' && app.historyReplayOverlayVisible)
      ? null
      : app.screen === 'game' &&
        app.showResultOverlay &&
        (app.gameOver || app.onlineResultOverlaySticky)
      ? app.hitResultOverlayAvatar(x, y)
      : app.hitWhichGameBoardNameAvatar(x, y);
  if (boardAv === 'my') {
    app.showMyRatingModal();
    return;
  }
  if (boardAv === 'opp') {
    if (app.isPvpOnline && app.onlineRoomId) {
      app.showOpponentRatingModal();
    } else if (app.isPvpLocal) {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '本局无对方账号', icon: 'none' });
      }
    } else {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无法查看对手资料', icon: 'none' });
      }
    }
    return;
  }

  if (
    app.screen !== 'home' &&
    app.themeScreenShowsStyleEntry() &&
    app.hitThemeEntry(x, y)
  ) {
    app.cycleThemeNext();
    return;
  }

  if (app.screen === 'home') {
    if (app.homePressedButton || app.homePressedDockCol !== null) {
      app.homePressedButton = null;
      app.homePressedDockCol = null;
      app.draw();
    }
    return;
  }

  if (app.screen === 'matching') {
    if (app.hitMatchingCancel(x, y)) {
      app.cancelMatching();
    }
    return;
  }

  if (app.screen === 'pve_color') {
    var colorBtn = app.hitPveColorButton(x, y);
    if (colorBtn === 'black') {
      app.startPve(app.BLACK);
      return;
    }
    if (colorBtn === 'white') {
      app.startPve(app.WHITE);
      return;
    }
    if (colorBtn === 'back') {
      app.backToHome();
      return;
    }
    return;
  }

  if (app.screen === 'replay') {
    app.layout = app.computeLayout();
    var rcR = app.hitReplayControl(x, y);
    if (rcR != null) {
      app.replayControlPressedId = rcR;
      app.replayTouchIdentifier = e.touches[0].identifier;
    } else {
      app.replayControlPressedId = null;
      app.replayTouchIdentifier = null;
    }
    app.draw();
    return;
  }

  if (
    app.screen === 'game' &&
    app.showResultOverlay &&
    (app.gameOver || app.onlineResultOverlaySticky)
  ) {
    var rb = app.hitResultButton(x, y);
    if (rb === 'rematch_same') {
      if (app.isPvpOnline) {
        app.sendOnlineRematchRequest();
      } else {
        app.resetGame();
      }
      return;
    }
    if (rb === 'rematch_new') {
      if (app.isPvpOnline) {
        app.startRandomMatchFromResultOverlay();
      } else {
        app.resetGame();
      }
      return;
    }
    if (rb === 'rematch_accept') {
      app.sendOnlineRematchAccept();
      return;
    }
    if (rb === 'rematch_decline') {
      app.sendOnlineRematchDecline();
      return;
    }
    if (rb === 'replay') {
      app.openReplayFromResult();
      return;
    }
    if (rb === 'home') {
      app.backToHome();
      return;
    }
    return;
  }

  var urBtn = app.hitUndoRespondRow(x, y);
  if (urBtn === 'accept') {
    app.execLocalUndoAccept();
    return;
  }
  if (urBtn === 'reject') {
    app.execLocalUndoReject();
    return;
  }

  var drBtn = app.hitDrawRespondRow(x, y);
  if (drBtn === 'accept') {
    app.execLocalDrawAccept();
    return;
  }
  if (drBtn === 'reject') {
    app.execLocalDrawReject();
    return;
  }

  if (
    app.screen === 'game' &&
    app.isPvpOnline &&
    app.onlineChatOpen &&
    app.onBoard(x, y)
  ) {
    if (typeof app.dismissOnlineChatKeyboard === 'function') {
      app.dismissOnlineChatKeyboard();
    }
    app.onlineChatInputDraft = '';
    app.onlineChatOpen = false;
    app.onlineChatEmojiOpen = false;
    app._onlineChatAnimStartMs = 0;
    if (app._chatPanelAnimIv) {
      try {
        clearInterval(app._chatPanelAnimIv);
      } catch (eBd) {}
      app._chatPanelAnimIv = null;
    }
    app.draw();
    return;
  }

  var gbtn = app.hitGameButton(x, y);
  if (gbtn === 'chat') {
    app.onlineChatOpen = !app.onlineChatOpen;
    if (app.onlineChatOpen) {
      app._onlineChatAnimStartMs = Date.now();
      if (typeof app.scheduleOnlineChatPanelAnimFrames === 'function') {
        app.scheduleOnlineChatPanelAnimFrames();
      }
    } else {
      if (typeof app.dismissOnlineChatKeyboard === 'function') {
        app.dismissOnlineChatKeyboard();
      }
      app.onlineChatInputDraft = '';
      app.onlineChatEmojiOpen = false;
      app._onlineChatAnimStartMs = 0;
      if (app._chatPanelAnimIv) {
        try {
          clearInterval(app._chatPanelAnimIv);
        } catch (eG) {}
        app._chatPanelAnimIv = null;
      }
    }
    app.draw();
    return;
  }
  if (gbtn === 'back') {
    if (typeof app.shouldSkipOnlineLeaveConfirm === 'function' && app.shouldSkipOnlineLeaveConfirm()) {
      app.backToHome();
      return;
    }
    if (typeof wx.showModal === 'function') {
      var leaveOnlineMidGame = app.isPvpOnline && !app.gameOver;
      wx.showModal({
        title: '离开对局',
        content: leaveOnlineMidGame
          ? '直接离开会断开连接，可能被判定为逃跑：天梯分将按规则扣减，并影响信誉与匹配。\n若要认输结束本局，请使用底栏「认输」。\n\n仍要离开吗？'
          : '确定要离开当前对局吗？',
        confirmText: '离开',
        cancelText: '取消',
        success: function (res) {
          if (res.confirm) {
            app.backToHome();
          }
        }
      });
    } else {
      app.backToHome();
    }
    return;
  }
  if (gbtn === 'undo') {
    app.handleUndoButtonTap();
    return;
  }
  if (gbtn === 'reset') {
    if (app.isDailyPuzzle && typeof app.restoreDailyPuzzleInitial === 'function') {
      app.restoreDailyPuzzleInitial();
    }
    return;
  }
  if (gbtn === 'invite_friend') {
    if (
      typeof app.isPuzzleFriendInviteEnabled === 'function' &&
      !app.isPuzzleFriendInviteEnabled()
    ) {
      return;
    }
    if (typeof app.startDailyPuzzleFriendInvite === 'function') {
      app.startDailyPuzzleFriendInvite();
    }
    return;
  }
  if (gbtn === 'draw') {
    app.handleDrawButtonTap();
    return;
  }
  if (gbtn === 'resign') {
    if (!app.isResignButtonActive()) {
      return;
    }
    if (typeof wx.showModal === 'function') {
      wx.showModal({
        title: '认输',
        content: '确定认输吗？对方将获胜。',
        confirmText: '认输',
        cancelText: '取消',
        success: function (res) {
          if (res.confirm) {
            app.handleResignTap();
          }
        }
      });
    } else {
      app.handleResignTap();
    }
    return;
  }

  if (!app.onBoard(x, y)) return;
  if (app.isPvpOnline) {
    if (app.current !== app.pvpOnlineYourColor) {
      return;
    }
  } else if (app.isDailyPuzzle) {
    if (app.current !== app.dailyPuzzleUserColor) {
      return;
    }
  } else if (!app.isPvpLocal && app.current !== app.pveHumanColor) {
    return;
  }

  var cell = app.pixelToCell(x, y);
  if (!cell) return;
  app.tryPlace(cell.r, cell.c);
});

if (typeof wx.onTouchMove === 'function') {
  wx.onTouchMove(function (e) {
    if (
      app.screen === 'admin_puzzle' &&
      typeof app.handleAdminPuzzleTouchMove === 'function' &&
      app.handleAdminPuzzleTouchMove(e)
    ) {
      return;
    }
    if (
      app.screen === 'home' &&
      typeof app.onHomeFriendListTouchMove === 'function' &&
      app.onHomeFriendListTouchMove(e)
    ) {
      return;
    }
    if (
      app.screen === 'replay' ||
      (app.screen === 'history' && app.historyReplayOverlayVisible)
    ) {
      if (
        app.replayControlPressedId != null &&
        e.touches &&
        e.touches.length
      ) {
        var tm;
        for (tm = 0; tm < e.touches.length; tm++) {
          if (
            app.replayTouchIdentifier != null &&
            e.touches[tm].identifier === app.replayTouchIdentifier
          ) {
            app.layout = app.computeLayout();
            var curHit = app.hitReplayControl(
              e.touches[tm].clientX,
              e.touches[tm].clientY
            );
            if (curHit !== app.replayControlPressedId) {
              app.replayControlPressedId = null;
              app.replayTouchIdentifier = null;
              app.draw();
            }
            break;
          }
        }
      }
      return;
    }
    if (app.screen !== 'history' || app.historyScrollTouchId == null) {
      return;
    }
    var touches = e.touches;
    if (!touches || !touches.length) {
      return;
    }
    var t = null;
    var i;
    for (i = 0; i < touches.length; i++) {
      if (touches[i].identifier == app.historyScrollTouchId) {
        t = touches[i];
        break;
      }
    }
    if (!t) {
      return;
    }
    var dy = t.clientY - app.historyScrollLastY;
    app.historyScrollLastY = t.clientY;
    var now = Date.now();
    var dtMove = Math.max(5, now - app.historyScrollLastTs);
    app.historyScrollLastTs = now;
    var instVel = -dy / dtMove;
    app.historyScrollVel = app.historyScrollVel * 0.62 + instVel * 0.38;
    app.historyScrollY -= dy;
    var sm = app.getHistoryListScrollMetrics();
    var maxScroll = sm.maxScroll;
    if (app.historyScrollY > maxScroll) {
      app.historyScrollY = maxScroll;
    }
    if (app.historyScrollY < 0) {
      app.historyScrollY = 0;
    }
    app.draw();
  });
}

if (typeof wx.onTouchEnd === 'function') {
  wx.onTouchEnd(function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (app.screen === 'admin_puzzle' && t) {
      if (typeof app.handleAdminPuzzleTouchEnd === 'function') {
        app.handleAdminPuzzleTouchEnd(
          t.clientX,
          t.clientY,
          t.identifier
        );
      }
      return;
    }
    if (
      app.screen === 'home' &&
      t &&
      typeof app.onHomeFriendListTouchEnd === 'function' &&
      app.onHomeFriendListTouchEnd(t.clientX, t.clientY)
    ) {
      return;
    }
    if (app.ratingCardAddFriendArmed && e.changedTouches) {
      var teAf = null;
      var iaf;
      if (app.ratingCardAddFriendTouchId != null) {
        for (iaf = 0; iaf < e.changedTouches.length; iaf++) {
          if (
            e.changedTouches[iaf].identifier === app.ratingCardAddFriendTouchId
          ) {
            teAf = e.changedTouches[iaf];
            break;
          }
        }
      } else {
        teAf = e.changedTouches[0];
      }
      if (teAf) {
        app.ratingCardAddFriendPressed = false;
        var rdAf = app.ratingCardData;
        var ex = teAf.clientX;
        var ey = teAf.clientY;
        var tapSlopAf = app.rpx(56);
        var adx = ex - app.ratingCardAddFriendTouchStartX;
        var ady = ey - app.ratingCardAddFriendTouchStartY;
        var slopOk = adx * adx + ady * ady <= tapSlopAf * tapSlopAf;
        var endedOnBtn =
          typeof app.hitRatingCardAddFriend === 'function' &&
          app.hitRatingCardAddFriend(ex, ey);
        var canActAf =
          app.ratingCardVisible &&
          rdAf &&
          rdAf.addFriendEnabled !== false &&
          !app.addFriendInFlight;
        if (
          endedOnBtn &&
          canActAf &&
          slopOk &&
          typeof app.onRatingCardAddFriendTap === 'function'
        ) {
          app.onRatingCardAddFriendTap();
        }
        app.ratingCardAddFriendArmed = false;
        app.ratingCardAddFriendTouchId = null;
        app.draw();
        return;
      }
    }
    if (
      e.changedTouches &&
      (app.screen === 'replay' ||
        (app.screen === 'history' && app.historyReplayOverlayVisible))
    ) {
      var rpe;
      var matchedReplayEnd = null;
      if (app.replayTouchIdentifier != null) {
        for (rpe = 0; rpe < e.changedTouches.length; rpe++) {
          if (e.changedTouches[rpe].identifier === app.replayTouchIdentifier) {
            matchedReplayEnd = e.changedTouches[rpe];
            break;
          }
        }
      }
      var savedReplayId = app.replayControlPressedId;
      app.replayControlPressedId = null;
      app.replayTouchIdentifier = null;
      if (savedReplayId != null && matchedReplayEnd) {
        app.layout = app.computeLayout();
        var endReplayHit = app.hitReplayControl(
          matchedReplayEnd.clientX,
          matchedReplayEnd.clientY
        );
        if (endReplayHit === savedReplayId) {
          app.onReplayControlHit(savedReplayId);
        } else {
          app.draw();
        }
      } else if (savedReplayId != null) {
        app.draw();
      }
    }
    if (app.screen === 'history' && app.historyReplayTouchId != null && e.changedTouches) {
      var hrTouch = null;
      var hrej;
      for (hrej = 0; hrej < e.changedTouches.length; hrej++) {
        if (e.changedTouches[hrej].identifier == app.historyReplayTouchId) {
          hrTouch = e.changedTouches[hrej];
          break;
        }
      }
      if (hrTouch) {
        var tapSlopHr = app.rpx(56);
        var hdx = hrTouch.clientX - app.historyListTouchStartX;
        var hdy = hrTouch.clientY - app.historyListTouchStartY;
        if (
          hdx * hdx + hdy * hdy <= tapSlopHr * tapSlopHr &&
          app.historyReplayTouchRec
        ) {
          app.openHistoryReplayForRecord(app.historyReplayTouchRec);
        }
      }
      app.historyReplayTouchRec = null;
      app.historyReplayTouchId = null;
    }
    var teHist = null;
    if (app.screen === 'history' && app.historyScrollTouchId != null && e.changedTouches) {
      var hi;
      for (hi = 0; hi < e.changedTouches.length; hi++) {
        if (e.changedTouches[hi].identifier == app.historyScrollTouchId) {
          teHist = e.changedTouches[hi];
          break;
        }
      }
    }
    if (teHist) {
      var tapSlop = app.rpx(56);
      var tdx = teHist.clientX - app.historyListTouchStartX;
      var tdy = teHist.clientY - app.historyListTouchStartY;
      if (tdx * tdx + tdy * tdy <= tapSlop * tapSlop) {
        var tapUid = app.hitHistoryRowOpponentAvatar(
          app.historyListTouchStartX,
          app.historyListTouchStartY
        );
        if (tapUid != null && tapUid > 0) {
          app.showHistoryOpponentRatingModal(tapUid);
        }
      }
      app.historyScrollTouchId = null;
      var vmin = 0.055;
      if (Math.abs(app.historyScrollVel) >= vmin) {
        app.historyMomentumLastTs = Date.now();
        if (app.historyMomentumRafId == null) {
          app.historyMomentumRafId = app.themeBubbleRaf(
            app.tickHistoryScrollMomentum
          );
        }
      } else {
        app.historyScrollVel = 0;
        app.scheduleHistoryScrollbarFadeRedraw();
      }
    }
    if (app.screen === 'home' && app.homeDrawerTabPressed) {
      app.homeDrawerTabPressed = false;
      if (
        t &&
        !app.homeDrawerOpen &&
        !app.ratingCardVisible &&
        !app.checkinModalVisible &&
        !app.pieceSkinModalVisible &&
        !app.homeFriendListOpen &&
        typeof app.hitHomeDrawerTab === 'function' &&
        app.hitHomeDrawerTab(t.clientX, t.clientY)
      ) {
        app.homeDrawerOpen = true;
        app.draw();
        if (typeof app.refreshAdminStatus === 'function') {
          app.refreshAdminStatus();
        }
      } else {
        app.draw();
      }
      return;
    }
    if (app.screen === 'home' && app.homePressedButton) {
      if (
        !t ||
        app.homeDrawerOpen ||
        app.ratingCardVisible ||
        app.checkinModalVisible ||
        app.pieceSkinModalVisible ||
        app.homeFriendListOpen
      ) {
        app.homePressedButton = null;
        app.draw();
        return;
      } else {
        var xRel = t.clientX;
        var yRel = t.clientY;
        var endHit = app.hitHomeButton(xRel, yRel);
        var pb = app.homePressedButton;
        app.homePressedButton = null;
        app.draw();
        if (endHit === pb) {
          if (pb === 'pvp') {
            app.startOnlineAsHost();
            return;
          }
          if (pb === 'pve') {
            app.homeDrawerOpen = false;
            app.screen = 'pve_color';
            app.draw();
            return;
          }
          if (pb === 'random') {
            app.startRandomMatch();
            return;
          }
          if (pb === 'daily') {
            app.requestStartDailyPuzzle();
            return;
          }
        }
        return;
      }
    } else if (app.screen === 'home' && app.homePressedDockCol !== null) {
      if (
        !t ||
        app.homeDrawerOpen ||
        app.ratingCardVisible ||
        app.checkinModalVisible ||
        app.pieceSkinModalVisible ||
        app.homeFriendListOpen
      ) {
        app.homePressedDockCol = null;
        app.draw();
        return;
      }
      var endDock = app.hitHomeBottomNav(t.clientX, t.clientY);
      var pdc = app.homePressedDockCol;
      app.homePressedDockCol = null;
      app.draw();
      if (endDock === pdc) {
        if (pdc === 2) {
          app.openPieceSkinModal();
          return;
        }
        if (pdc === 0) {
          authApi.ensureSession(function (sessOk) {
            if (!sessOk || !authApi.getSessionToken()) {
              if (typeof wx.showToast === 'function') {
                wx.showToast({ title: '请先登录后再签到', icon: 'none' });
              }
              return;
            }
            if (typeof wx.showLoading === 'function') {
              wx.showLoading({ title: '加载中…', mask: true });
            }
            wx.request(
              Object.assign(roomApi.meRatingOptions(), {
                success: function (res) {
                  if (typeof wx.hideLoading === 'function') {
                    wx.hideLoading();
                  }
                  if (res.statusCode === 401 || res.statusCode !== 200 || !res.data) {
                    if (typeof wx.showToast === 'function') {
                      wx.showToast({
                        title:
                          res.statusCode === 401 ? '请先登录' : '加载失败',
                        icon: 'none'
                      });
                    }
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
                  if (!d) {
                    return;
                  }
                  app.syncCheckinStateFromServerPayload(d);
                  app.applyMyGenderFromRatingPayload(d);
                  var calNow = new Date();
                  var calY = calNow.getFullYear();
                  var calM = calNow.getMonth() + 1;
                  var stOpen = app.getCheckinState();
                  app.checkinModalData = {
                    streak: stOpen.streak,
                    rewardPoints: app.CHECKIN_DAILY_POINTS,
                    totalPoints: stOpen.tuanPoints,
                    justSigned: false,
                    viewYear: calY,
                    viewMonth: calM
                  };
                  app.checkinModalVisible = true;
                  app.draw();
                },
                fail: function () {
                  if (typeof wx.hideLoading === 'function') {
                    wx.hideLoading();
                  }
                  if (typeof wx.showToast === 'function') {
                    wx.showToast({ title: '网络错误', icon: 'none' });
                  }
                }
              })
            );
          });
          return;
        }
        if (pdc === 1) {
          app.openHistoryScreen();
          return;
        }
      }
      return;
    } else if (app.homePressedButton) {
      app.homePressedButton = null;
      app.draw();
    } else if (app.homePressedDockCol !== null) {
      app.homePressedDockCol = null;
      app.draw();
    }
    if (
      !t ||
      app.screen !== 'home' ||
      app.homeDrawerOpen ||
      app.ratingCardVisible ||
      app.checkinModalVisible ||
      app.pieceSkinModalVisible ||
      app.homeFriendListOpen
    ) {
      return;
    }
    var nav = app.getHomeNavBarLayout();
    if (
      app.lastTouchDownY < nav.navTop ||
      app.lastTouchDownY > nav.navBottom
    ) {
      return;
    }
    var x1 = t.clientX;
    var y1 = t.clientY;
    var dx = x1 - app.lastTouchDownX;
    var dy = y1 - app.lastTouchDownY;
    var edge = app.rpx(28);
    if (
      app.lastTouchDownX < edge &&
      dx > app.rpx(56) &&
      Math.abs(dy) < app.rpx(72)
    ) {
      if (!app.userIsAdmin) {
        return;
      }
      app.homeDrawerOpen = true;
      app.draw();
      if (typeof app.refreshAdminStatus === 'function') {
        app.refreshAdminStatus();
      }
    }
  });
}

if (typeof wx.onTouchCancel === 'function') {
  wx.onTouchCancel(function () {
    if (app.ratingCardAddFriendArmed || app.ratingCardAddFriendPressed) {
      if (typeof app.clearRatingCardAddFriendTouch === 'function') {
        app.clearRatingCardAddFriendTouch();
      }
      app.draw();
    }
    if (app.screen === 'admin_puzzle') {
      if (app.adminPuzzleSchedulePickerOpen) {
        app.adminPuzzleSchedulePickerOpen = false;
        app.adminPuzzleSchedulePickerData = null;
      }
      app.adminPuzzlePublishSwipeTouchId = null;
      app.adminPuzzlePublishSwipePx = 0;
      app.draw();
      return;
    }
    if (app.screen === 'history') {
      app.historyScrollTouchId = null;
      app.stopHistoryMomentum();
      app.scheduleHistoryScrollbarFadeRedraw();
    }
    if (app.replayControlPressedId != null || app.replayTouchIdentifier != null) {
      app.replayControlPressedId = null;
      app.replayTouchIdentifier = null;
      app.draw();
    }
    if (app.homePressedButton || app.homePressedDockCol !== null) {
      app.homePressedButton = null;
      app.homePressedDockCol = null;
      app.draw();
    }
    if (app.homeDrawerTabPressed) {
      app.homeDrawerTabPressed = false;
      app.draw();
    }
  });
}

wx.onError(function (err) {
  console.error('game error', err);
});

if (typeof wx.showShareMenu === 'function') {
  wx.showShareMenu({
    withShareTicket: true
  });
}

if (typeof wx.onShow === 'function') {
  wx.onShow(function (res) {
    /**
     * 先完成静默登录再拉资源/分享进房，避免与首帧 silentLogin 并发导致进房失败（请先完成登录）。
     */
    authApi.silentLogin(null, function () {
      if (typeof app.restartUserSocialSocket === 'function') {
        app.restartUserSocialSocket();
      }
      app.loadHomeUiAssets();
      setTimeout(function () {
        app.tryFetchMyProfileAvatar();
      }, 500);
      setTimeout(function () {
        if (typeof app.refreshAdminStatus === 'function') {
          app.refreshAdminStatus();
        }
      }, 700);
      if (res && res.query && String(res.query.online) === '1' && res.query.roomId) {
        if (typeof app.tryLaunchOnlineInvite === 'function') {
          app.tryLaunchOnlineInvite(res.query);
        }
      }
      if (typeof app.schedulePuzzleFriendInviteOnShowFallback === 'function') {
        app.schedulePuzzleFriendInviteOnShowFallback();
      }
      if (app.shouldAutoReconnectOnline() && !app.onlineWsConnected) {
        app.clearOnlineReconnectTimer();
        app.scheduleOnlineReconnect(true);
      }
    });
  });
} else {
  authApi.silentLogin();
}

if (typeof wx.onHide === 'function') {
  wx.onHide(function () {
    if (typeof app.clearOnlineClockTick === 'function') {
      app.clearOnlineClockTick();
    }
  });
}

if (typeof wx.onNetworkStatusChange === 'function') {
  wx.onNetworkStatusChange(function (res) {
    if (
      res.isConnected &&
      app.shouldAutoReconnectOnline() &&
      !app.onlineWsConnected
    ) {
      app.clearOnlineReconnectTimer();
      app.scheduleOnlineReconnect(true);
    }
    if (res.isConnected && typeof app.restartUserSocialSocket === 'function') {
      app.restartUserSocialSocket();
    }
  });
}

};
