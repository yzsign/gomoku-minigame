/**
 * 微信小游戏隐私合规：在处理昵称/头像等个人信息前调用 wx.requirePrivacyAuthorize。
 * 勿注册 wx.onNeedPrivacyAuthorization —— 纯 Canvas 绘制的「同意」无法通过微信校验，会导致点击无反应。
 * MP 后台须单独配置「用户隐私保护指引」，并声明昵称、头像、剪切板等类型。
 * 详见：https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html
 */
module.exports = function registerPrivacyConsent(app, deps) {
  var wx = (deps && deps.wx) || (typeof wx !== 'undefined' ? wx : null);

  var PRIVACY_AGREED_KEY = 'gomoku_privacy_user_agreed_v1';
  var CONTRACT_LINK_TEXT = '《隐私保护指引》';

  app.privacyConsentVisible = false;
  app._privacyConsentDeferred = null;
  app._privacyConsentTouchOnAgree = false;
  app._privacyConsentTouchOnReject = false;

  app.getPrivacyConsentLayout = function () {
    var cardW = Math.min(app.W - app.rpx(48), app.rpx(620));
    var cardH = app.rpx(420);
    var cx = app.W * 0.5;
    var cy = app.H * 0.46;
    var x = cx - cardW * 0.5;
    var y = cy - cardH * 0.5;
    var pad = app.rpx(28);
    var linkH = app.rpx(44);
    var btnH = app.rpx(44);
    var btnGap = app.rpx(16);
    var btnW = (cardW - pad * 2 - btnGap) * 0.5;
    var btnTop = y + cardH - pad - btnH;
    var linkTop = btnTop - app.rpx(56);
    return {
      cx: cx,
      cy: cy,
      x: x,
      y: y,
      w: cardW,
      h: cardH,
      r: app.rpx(18),
      pad: pad,
      link: {
        left: x + pad,
        top: linkTop,
        w: cardW - pad * 2,
        h: linkH
      },
      btnReject: {
        left: x + pad,
        top: btnTop,
        w: btnW,
        h: btnH
      },
      btnAgree: {
        left: x + pad + btnW + btnGap,
        top: btnTop,
        w: btnW,
        h: btnH
      }
    };
  };

  function hitSlop() {
    return typeof app.rpx === 'function' ? app.rpx(20) : 10;
  }

  function hitRect(clientX, clientY, r, slop) {
    var s = slop == null ? hitSlop() : slop;
    return (
      clientX >= r.left - s &&
      clientX <= r.left + r.w + s &&
      clientY >= r.top - s &&
      clientY <= r.top + r.h + s
    );
  }

  app.openPrivacyProtectionContract = function () {
    if (!wx || typeof wx.openPrivacyContract !== 'function') {
      if (typeof wx.showToast === 'function') {
        wx.showToast({
          title: '请先在微信公众平台配置用户隐私保护指引',
          icon: 'none',
          duration: 2800
        });
      }
      return;
    }
    wx.openPrivacyContract({
      fail: function () {
        if (typeof wx.showToast === 'function') {
          wx.showToast({ title: '暂时无法打开隐私保护指引', icon: 'none' });
        }
      }
    });
  };

  function persistLocalAgreed() {
    try {
      if (wx && wx.setStorageSync) {
        wx.setStorageSync(PRIVACY_AGREED_KEY, '1');
      }
    } catch (e) {}
  }

  function finishPrivacyConsent(agreed) {
    var deferred = app._privacyConsentDeferred;
    app._privacyConsentDeferred = null;
    app.privacyConsentVisible = false;
    app._privacyConsentTouchOnAgree = false;
    app._privacyConsentTouchOnReject = false;
    if (agreed) {
      persistLocalAgreed();
      if (deferred && typeof deferred.ok === 'function') {
        deferred.ok();
      }
    } else if (deferred && typeof deferred.fail === 'function') {
      deferred.fail();
    }
    if (typeof app.draw === 'function') {
      app.draw();
    }
  }

  /** 极旧基础库兜底：无 requirePrivacyAuthorize 时用 Canvas 弹窗 */
  app.showPrivacyConsentOverlay = function (deferred) {
    app.privacyConsentVisible = true;
    app._privacyConsentDeferred = deferred || null;
    app._privacyConsentTouchOnAgree = false;
    app._privacyConsentTouchOnReject = false;
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };

  app.onPrivacyConsentAgree = function () {
    finishPrivacyConsent(true);
  };

  app.onPrivacyConsentReject = function () {
    finishPrivacyConsent(false);
  };

  app.handlePrivacyConsentTouchStart = function (clientX, clientY) {
    if (!app.privacyConsentVisible) {
      return false;
    }
    var L = app.getPrivacyConsentLayout();
    if (hitRect(clientX, clientY, L.link)) {
      app.openPrivacyProtectionContract();
      return true;
    }
    app._privacyConsentTouchOnAgree = hitRect(clientX, clientY, L.btnAgree);
    app._privacyConsentTouchOnReject = hitRect(clientX, clientY, L.btnReject);
    if (app._privacyConsentTouchOnAgree) {
      app.onPrivacyConsentAgree();
      return true;
    }
    if (app._privacyConsentTouchOnReject) {
      app.onPrivacyConsentReject();
      return true;
    }
    return true;
  };

  app.handlePrivacyConsentTouchEnd = function (clientX, clientY) {
    if (!app.privacyConsentVisible) {
      app._privacyConsentTouchOnAgree = false;
      app._privacyConsentTouchOnReject = false;
      return false;
    }
    var L = app.getPrivacyConsentLayout();
    if (
      app._privacyConsentTouchOnAgree &&
      hitRect(clientX, clientY, L.btnAgree)
    ) {
      app.onPrivacyConsentAgree();
      return true;
    }
    if (
      app._privacyConsentTouchOnReject &&
      hitRect(clientX, clientY, L.btnReject)
    ) {
      app.onPrivacyConsentReject();
      return true;
    }
    app._privacyConsentTouchOnAgree = false;
    app._privacyConsentTouchOnReject = false;
    return true;
  };

  /** @deprecated 兼容旧调用 */
  app.handlePrivacyConsentTouch = function (clientX, clientY) {
    return app.handlePrivacyConsentTouchStart(clientX, clientY);
  };

  app.drawPrivacyConsentOverlay = function () {
    if (!app.privacyConsentVisible || !app.ctx) {
      return;
    }
    var L = app.getPrivacyConsentLayout();
    var ctx = app.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, app.W, app.H);

    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = app.rpx(24);
    ctx.shadowOffsetY = app.rpx(8);
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    app.roundRect(L.x, L.y, L.w, L.h, L.r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    var titleY = L.y + L.pad + app.rpx(28);
    ctx.font =
      'bold ' +
      app.rpx(34) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('用户隐私保护提示', app.snapPx(L.cx), app.snapPx(titleY));

    var bodyY = titleY + app.rpx(52);
    ctx.font =
      app.rpx(26) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#555555';
    var lines = [
      '欢迎使用团团五子棋。我们在展示昵称、头像、',
      '保存对局与好友互动等功能时，会处理您的',
      '个人信息。请阅读并同意' + CONTRACT_LINK_TEXT + '。'
    ];
    var li;
    for (li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], app.snapPx(L.cx), app.snapPx(bodyY + li * app.rpx(36)));
    }

    ctx.font =
      '600 ' +
      app.rpx(28) +
      'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#2563eb';
    ctx.fillText(
      CONTRACT_LINK_TEXT,
      app.snapPx(L.cx),
      app.snapPx(L.link.top + L.link.h * 0.5)
    );
    ctx.strokeStyle = 'rgba(37,99,235,0.35)';
    ctx.lineWidth = 1;
    var linkW = ctx.measureText(CONTRACT_LINK_TEXT).width;
    ctx.beginPath();
    ctx.moveTo(app.snapPx(L.cx - linkW * 0.5), app.snapPx(L.link.top + L.link.h * 0.5 + app.rpx(16)));
    ctx.lineTo(app.snapPx(L.cx + linkW * 0.5), app.snapPx(L.link.top + L.link.h * 0.5 + app.rpx(16)));
    ctx.stroke();

    function drawBtn(rect, label, primary) {
      if (primary) {
        var g = ctx.createLinearGradient(rect.left, rect.top, rect.left, rect.top + rect.h);
        g.addColorStop(0, '#ff8a65');
        g.addColorStop(1, '#f4511e');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = '#f3f4f6';
      }
      app.roundRect(rect.left, rect.top, rect.w, rect.h, rect.h * 0.5);
      ctx.fill();
      ctx.font =
        '600 ' +
        app.rpx(28) +
        'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      ctx.fillStyle = primary ? '#ffffff' : '#666666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        label,
        app.snapPx(rect.left + rect.w * 0.5),
        app.snapPx(rect.top + rect.h * 0.5)
      );
    }
    drawBtn(L.btnReject, '拒绝', false);
    drawBtn(L.btnAgree, '同意', true);
    ctx.restore();
  };

  /**
   * 在处理昵称/头像等非匿名个人信息前调用。
   * 优先走微信官方隐私弹窗（requirePrivacyAuthorize），已授权则直接 success。
   * @param {function} onAgreed
   * @param {function} [onDeclined]
   */
  app.ensurePrivacyAuthorized = function (onAgreed, onDeclined) {
    var ok = typeof onAgreed === 'function' ? onAgreed : function () {};
    var fail = typeof onDeclined === 'function' ? onDeclined : function () {};

    if (!wx) {
      ok();
      return;
    }

    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: function () {
          persistLocalAgreed();
          ok();
        },
        fail: fail
      });
      return;
    }

    try {
      if (wx.getStorageSync(PRIVACY_AGREED_KEY) === '1') {
        ok();
        return;
      }
    } catch (eLegacy) {}
    app.showPrivacyConsentOverlay({ ok: ok, fail: fail });
  };

  app._wrapDrawForPrivacyConsent = function () {
    if (app._privacyDrawWrapped || typeof app.draw !== 'function') {
      return;
    }
    app._privacyDrawWrapped = true;
    var origDraw = app.draw;
    app.draw = function () {
      origDraw.apply(app, arguments);
      if (app.privacyConsentVisible) {
        app.drawPrivacyConsentOverlay();
      }
    };
  };
};

