/**
 * 对局头像旁 Q/W/E/R：每格技能独立配置（图标、轨迹、刺入表现、音效等）。
 * 在 gameLogic/index.js 中于 part1 之前 require，由 app 上的方法供绘制与触控调用。
 *
 * 新增技能步骤概要：
 * 1. 在 BY_PANEL_KEY 中增加一项；当前对局条仅展示 border（Q），与 computeBoardNameLabelLayout 一致。
 * 2. 配置 iconSrc、imageAngleOffsetRad、fly（时长、sizeMul、刺入点 toInsetAlongAvatar 等）、pierce、audio.src。
 * 3. 若与当前「直线飞向对手头像」不同，在 drawAvatarBoardSkillVfx 内按 def.id 或 def.fly.trajectory 分支扩展绘制/插值。
 * 4. 复杂轨迹可把位置计算抽到独立函数并在本文件内引用。
 */

function smoothstep01(t) {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t * t * (3 - 2 * t);
}

/**
 * @typedef {object} AvatarBoardSkillDef
 * @property {string} id 唯一 id
 * @property {string} panelKey 与 computeBoardNameLabelLayout 一致（当前仅 border/Q）
 * @property {string} [iconSrc] 槽内小图标；无则显示字母
 * @property {number} [imageAngleOffsetRad] 贴图「剑尖/朝前」相对飞行向量的旋转修正（与飞行共用）
 * @property {object} [fly] 仅己方点按触发、飞向对手时有效
 * @property {number} fly.sizeMul
 * @property {number} [fly.baseWidthRpx=88]
 * @property {number} fly.durationMs
 * @property {number} fly.holdMs 刺入后停留
 * @property {number} fly.fromAlongAvatar 从圆心沿连线外推：avR * 系数 + rpx 加算见实现
 * @property {number} fly.toInsetAlongAvatar 刺入点：对手圆心沿连线内收 avR*系数
 * @property {object} [pierce] 刺入阶段
 * @property {number} [pierce.hitPulseAmplitude]
 * @property {number} [pierce.shadowBlurRpx]
 * @property {string} [pierce.shadowColor]
 * @property {number} [pierce.embedRpx]
 * @property {number} [pierce.impactBurstMs]
 * @property {number} [pierce.oppShakeRpx] 对手头像受击位移（rpx）
 * @property {number} [pierce.oppScaleThump] 对手头像受击缩放强度
 * @property {object} [audio]
 * @property {string} [audio.src] 相对小游戏根目录，无则静音
 * @property {object} [slotIcon]
 * @property {number} [slotIcon.scaleInSlot=0.55]
 * @property {number} [cooldownMs] 使用成功后同一格冷却时间（毫秒）
 */

module.exports = function avatarBoardSkills(app, deps) {
  deps = deps || {};
  var roomApi = deps.roomApi;
  var themes = deps.themes;
  var authApi = deps.authApi;
  app._avatarBoardSkillCdUntilByKey = Object.create(null);

  app.clearPerGameConsumableSkillState = function() {
    app.avatarDaggerUsedThisGame = false;
  };

  /** @type {Object.<string, AvatarBoardSkillDef>} */
  var BY_PANEL_KEY = {
    border: {
      id: 'dagger',
      panelKey: 'border',
      iconSrc: 'images/skill/q-dagger.png',
      imageAngleOffsetRad: (3 * Math.PI) / 4,
      fly: {
        sizeMul: 0.6468,
        baseWidthRpx: 88,
        durationMs: 400,
        holdMs: 2000,
        fromAlongAvatar: { avRMul: 1, rpxExtra: 10 },
        toInsetAlongAvatar: 0.42
      },
      pierce: {
        hitPulseAmplitude: 0.14,
        shadowBlurRpx: 10,
        shadowColor: 'rgba(30, 26, 22, 0.48)',
        embedRpx: 14,
        impactBurstMs: 280,
        oppShakeRpx: 5,
        oppScaleThump: 0.08
      },
      audio: {
        src: null
      },
      slotIcon: {
        scaleInSlot: 0.55
      },
      cooldownMs: 2000
    }
  };

  app.AVATAR_BOARD_SKILLS_BY_KEY = BY_PANEL_KEY;

  app.getAvatarBoardSkillDef = function(panelKey) {
    return BY_PANEL_KEY[panelKey] || null;
  };

  /** 兼容旧命名：短剑资源路径 */
  app.Q_SKILL_SWORD_SRC =
    (BY_PANEL_KEY.border && BY_PANEL_KEY.border.iconSrc) || 'images/skill/q-dagger.png';
  app.Q_SWORD_ROT_OFFSET =
    (BY_PANEL_KEY.border && BY_PANEL_KEY.border.imageAngleOffsetRad) || (3 * Math.PI) / 4;
  app.Q_SWORD_FLY_SIZE_MUL =
    BY_PANEL_KEY.border && BY_PANEL_KEY.border.fly && BY_PANEL_KEY.border.fly.sizeMul != null
      ? BY_PANEL_KEY.border.fly.sizeMul
      : 0.6468;
  app.Q_SWORD_FLY_DURATION_MS =
    BY_PANEL_KEY.border && BY_PANEL_KEY.border.fly
      ? BY_PANEL_KEY.border.fly.durationMs
      : 400;
  app.Q_SWORD_HOLD_MS =
    BY_PANEL_KEY.border && BY_PANEL_KEY.border.fly
      ? BY_PANEL_KEY.border.fly.holdMs
      : 1000;

  var IMG_CACHE = {};

  function cacheKey(src) {
    return src || '';
  }

  app.getAvatarBoardSkillImageIfReady = function(src) {
    var k = cacheKey(src);
    var im = IMG_CACHE[k];
    return im && im.width && im.height ? im : null;
  };

  app.ensureAvatarBoardSkillImage = function(src, onReady) {
    var k = cacheKey(src);
    if (!k) {
      if (typeof onReady === 'function') {
        onReady(null);
      }
      return;
    }
    if (IMG_CACHE[k] && IMG_CACHE[k].width && IMG_CACHE[k].height) {
      if (typeof onReady === 'function') {
        onReady(IMG_CACHE[k]);
      }
      return;
    }
    if (typeof wx === 'undefined' || typeof wx.createImage !== 'function') {
      if (typeof onReady === 'function') {
        onReady(null);
      }
      return;
    }
    var img = wx.createImage();
    IMG_CACHE[k] = img;
    img.onload = function() {
      if (typeof onReady === 'function') {
        onReady(img);
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
    };
    img.onerror = function() {
      delete IMG_CACHE[k];
      if (typeof onReady === 'function') {
        onReady(null);
      }
    };
    img.src = k;
  };

  /** @deprecated 保留给旧调用；与 ensureAvatarBoardSkillImage(border.iconSrc) 等价 */
  app.ensureQSwordImageLoaded = function(onReady) {
    var src =
      BY_PANEL_KEY.border && BY_PANEL_KEY.border.iconSrc
        ? BY_PANEL_KEY.border.iconSrc
        : 'images/skill/q-dagger.png';
    app.ensureAvatarBoardSkillImage(src, function(img) {
      if (img) {
        app.qSwordImg = img;
      }
      if (typeof onReady === 'function') {
        onReady();
      }
    });
  };

  app.getAvatarBoardSkillBladeRotationRad = function(layout, skillDef) {
    var off =
      skillDef && skillDef.imageAngleOffsetRad != null
        ? skillDef.imageAngleOffsetRad
        : (3 * Math.PI) / 4;
    var L =
      layout && typeof layout.cell === 'number'
        ? layout
        : app.layout;
    var lay =
      (!L || typeof L.cell !== 'number') && typeof app.computeLayout === 'function'
        ? app.computeLayout()
        : L;
    var lab = app.computeBoardNameLabelLayout(lay);
    if (!lab || !lab.hasMyAv || !lab.hasOppAv) {
      return Math.PI / 6;
    }
    var rdx = lab.oppCx - lab.myCx;
    var rdy = lab.oppCy - lab.myCy;
    return Math.atan2(rdy, rdx) + off;
  };

  app.getQSwordBladeRotationRad = function(layout) {
    return app.getAvatarBoardSkillBladeRotationRad(
      layout,
      BY_PANEL_KEY.border
    );
  };

  app.clearAvatarBoardSkillVfx = function() {
    app.avatarBoardSkillVfx = null;
    app.qSwordAnim = null;
    if (app._avatarBoardSkillTmr) {
      try {
        clearInterval(app._avatarBoardSkillTmr);
      } catch (e) {}
      app._avatarBoardSkillTmr = null;
    }
    app._qSwordTmr = null;
  };

  app.clearQSwordSkillAnim = app.clearAvatarBoardSkillVfx;

  app.clearAvatarBoardSkillCooldowns = function() {
    app._avatarBoardSkillCdUntilByKey = Object.create(null);
    if (app._avatarBoardSkillCdTmr) {
      try {
        clearInterval(app._avatarBoardSkillCdTmr);
      } catch (eCd) {}
      app._avatarBoardSkillCdTmr = null;
    }
  };

  app.getAvatarBoardSkillCooldownRemainMs = function(side, panelKey) {
    if (side !== 'my') {
      return 0;
    }
    var def = app.getAvatarBoardSkillDef(panelKey);
    if (!def || def.cooldownMs == null || def.cooldownMs <= 0) {
      return 0;
    }
    var by = app._avatarBoardSkillCdUntilByKey;
    if (!by) {
      return 0;
    }
    var u = by[panelKey];
    if (u == null) {
      return 0;
    }
    var left = u - Date.now();
    return left > 0 ? left : 0;
  };

  app.isAvatarBoardSkillOnCooldown = function(side, panelKey) {
    return app.getAvatarBoardSkillCooldownRemainMs(side, panelKey) > 0;
  };

  app.ensureAvatarBoardSkillCooldownTicker = function() {
    if (app._avatarBoardSkillCdTmr) {
      return;
    }
    app._avatarBoardSkillCdTmr = setInterval(function() {
      if (app.screen !== 'game') {
        return;
      }
      var by = app._avatarBoardSkillCdUntilByKey;
      if (!by) {
        try {
          clearInterval(app._avatarBoardSkillCdTmr);
        } catch (eT0) {}
        app._avatarBoardSkillCdTmr = null;
        return;
      }
      var now = Date.now();
      var any = false;
      var k;
      for (k in by) {
        if (by[k] > now) {
          any = true;
          break;
        }
      }
      if (!any) {
        try {
          clearInterval(app._avatarBoardSkillCdTmr);
        } catch (eT1) {}
        app._avatarBoardSkillCdTmr = null;
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return;
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }, 200);
  };

  function playSkillAudio(skillDef) {
    if (!skillDef || !skillDef.audio || !skillDef.audio.src) {
      return;
    }
    if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
      return;
    }
    try {
      var ctx = wx.createInnerAudioContext();
      ctx.src = skillDef.audio.src;
      ctx.play();
      setTimeout(function() {
        try {
          ctx.destroy();
        } catch (eD) {}
      }, 8000);
    } catch (e) {}
  }

  /**
   * 己方点击某格时触发；仅处理带 fly 的技能，且目前仅 side===my 飞向对手。
   * 短剑（border）须先 POST /api/me/consumables/use 成功后再播放；单局限一次。
   */
  app.startAvatarBoardSkillFromPanelKey = function(side, panelKey) {
    if (side !== 'my' || app.gameOver) {
      return;
    }
    var def = app.getAvatarBoardSkillDef(panelKey);
    if (!def || !def.fly) {
      return;
    }
    if (def.cooldownMs != null && def.cooldownMs > 0) {
      var untilCd = app._avatarBoardSkillCdUntilByKey[panelKey];
      if (untilCd != null && Date.now() < untilCd) {
        return false;
      }
    }

    function executeAvatarBoardSkillFly() {
      app.clearAvatarBoardSkillVfx();
      var L = app.computeBoardNameLabelLayout(app.layout);
      if (!L || !L.hasMyAv || !L.hasOppAv) {
        return;
      }
      var dx = L.oppCx - L.myCx;
      var dy = L.oppCy - L.myCy;
      var dlen = Math.sqrt(dx * dx + dy * dy);
      if (dlen < 1) {
        return;
      }
      var ux = dx / dlen;
      var uy = dy / dlen;
      var avR = L.avR;
      var fa = def.fly.fromAlongAvatar || { avRMul: 1, rpxExtra: 10 };
      var off = Math.max(6, app.rpx(fa.rpxExtra != null ? fa.rpxExtra : 10));
      var fromX = L.myCx + ux * (avR * (fa.avRMul != null ? fa.avRMul : 1) + off);
      var fromY = L.myCy + uy * (avR * (fa.avRMul != null ? fa.avRMul : 1) + off);
      var inset = def.fly.toInsetAlongAvatar != null ? def.fly.toInsetAlongAvatar : 0.42;
      var toX = L.oppCx - ux * (avR * inset);
      var toY = L.oppCy - uy * (avR * inset);

      app.avatarBoardSkillVfx = {
        skillId: def.id,
        panelKey: panelKey,
        startMs: Date.now(),
        durationMs: def.fly.durationMs,
        holdMs: def.fly.holdMs,
        fromX: fromX,
        fromY: fromY,
        toX: toX,
        toY: toY
      };
      /** 兼容旧绘制里读 qSwordAnim / qSwordImg */
      app.qSwordAnim = app.avatarBoardSkillVfx;
      playSkillAudio(def);
      if (def.iconSrc) {
        app.ensureAvatarBoardSkillImage(def.iconSrc, function(img) {
          if (img) {
            app.qSwordImg = img;
          }
        });
        var cached = IMG_CACHE[cacheKey(def.iconSrc)];
        if (cached) {
          app.qSwordImg = cached;
        }
      }
      app.ensureAvatarBoardSkillAnimTicker();
      if (def.cooldownMs != null && def.cooldownMs > 0) {
        app._avatarBoardSkillCdUntilByKey[panelKey] = Date.now() + def.cooldownMs;
        app.ensureAvatarBoardSkillCooldownTicker();
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
      if (
        typeof app.sendOnlineAvatarSkill === 'function' &&
        app.isPvpOnline &&
        !app.onlineSpectatorMode
      ) {
        app.sendOnlineAvatarSkill(panelKey);
      }
    }

    if (panelKey === 'border') {
      if (app.avatarDaggerUsedThisGame) {
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '本局已使用过短剑', icon: 'none' });
        }
        return false;
      }
      var tok = authApi && authApi.getSessionToken && authApi.getSessionToken();
      if (!tok) {
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '请先登录后使用短剑', icon: 'none' });
        }
        return false;
      }
      var cnt =
        themes && typeof themes.getConsumableDaggerCount === 'function'
          ? themes.getConsumableDaggerCount()
          : 0;
      if (cnt < 1) {
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '短剑不足，请在杂货铺兑换', icon: 'none' });
        }
        return false;
      }
      if (app._consumableDaggerUseInFlight) {
        return false;
      }
      if (!roomApi || typeof roomApi.meConsumableUseOptions !== 'function') {
        return false;
      }
      app._consumableDaggerUseInFlight = true;
      wx.request(
        Object.assign(roomApi.meConsumableUseOptions('dagger'), {
          success: function(res) {
            app._consumableDaggerUseInFlight = false;
            var d = res.data;
            if (d && typeof d === 'string') {
              try {
                d = JSON.parse(d);
              } catch (eParse) {
                d = null;
              }
            }
            if (res.statusCode === 200 && d) {
              if (typeof app.mergeConsumableMutationToCache === 'function') {
                app.mergeConsumableMutationToCache(d);
              }
              app.avatarDaggerUsedThisGame = true;
              executeAvatarBoardSkillFly();
              return;
            }
            var msg = '无法使用短剑';
            if (res.statusCode === 409 && d && d.code === 'NONE_LEFT') {
              msg = '短剑数量不足';
            } else if (res.statusCode === 401) {
              msg = '请先登录';
            }
            if (typeof wx !== 'undefined' && wx.showToast) {
              wx.showToast({ title: msg, icon: 'none' });
            }
          },
          fail: function() {
            app._consumableDaggerUseInFlight = false;
            if (typeof wx !== 'undefined' && wx.showToast) {
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          }
        })
      );
      return false;
    }

    executeAvatarBoardSkillFly();
    return true;
  };

  /**
   * 联机：对方释放带 fly 的头像道具时，本端从「对手头像 → 本人头像」_mirror 播放（无冷却）。
   */
  app.startRemoteAvatarBoardSkillForPanelKey = function(panelKey) {
    var def = app.getAvatarBoardSkillDef(panelKey);
    if (!def || !def.fly) {
      return;
    }
    app.clearAvatarBoardSkillVfx();
    var L = app.computeBoardNameLabelLayout(app.layout);
    if (!L || !L.hasMyAv || !L.hasOppAv) {
      return;
    }
    var dx = L.oppCx - L.myCx;
    var dy = L.oppCy - L.myCy;
    var dlen = Math.sqrt(dx * dx + dy * dy);
    if (dlen < 1) {
      return;
    }
    var ux = dx / dlen;
    var uy = dy / dlen;
    var avR = L.avR;
    var fa = def.fly.fromAlongAvatar || { avRMul: 1, rpxExtra: 10 };
    var off = Math.max(6, app.rpx(fa.rpxExtra != null ? fa.rpxExtra : 10));
    var fromX = L.oppCx - ux * (avR * (fa.avRMul != null ? fa.avRMul : 1) + off);
    var fromY = L.oppCy - uy * (avR * (fa.avRMul != null ? fa.avRMul : 1) + off);
    var inset = def.fly.toInsetAlongAvatar != null ? def.fly.toInsetAlongAvatar : 0.42;
    var toX = L.myCx + ux * (avR * inset);
    var toY = L.myCy + uy * (avR * inset);

    app.avatarBoardSkillVfx = {
      skillId: def.id,
      panelKey: panelKey,
      startMs: Date.now(),
      durationMs: def.fly.durationMs,
      holdMs: def.fly.holdMs,
      fromX: fromX,
      fromY: fromY,
      toX: toX,
      toY: toY,
      remoteFromOpponent: true
    };
    app.qSwordAnim = app.avatarBoardSkillVfx;
    playSkillAudio(def);
    if (def.iconSrc) {
      app.ensureAvatarBoardSkillImage(def.iconSrc, function(img) {
        if (img) {
          app.qSwordImg = img;
        }
      });
      var cached = IMG_CACHE[cacheKey(def.iconSrc)];
      if (cached) {
        app.qSwordImg = cached;
      }
    }
    app.ensureAvatarBoardSkillAnimTicker();
    if (typeof app.draw === 'function') {
      app.draw();
    }
  };

  app.applyOnlineIncomingAvatarBoardSkill = function(data) {
    if (!data || app.gameOver || app.screen !== 'game') {
      return;
    }
    if (app.onlineSpectatorMode) {
      return;
    }
    app.startRemoteAvatarBoardSkillForPanelKey(data.panelKey || 'border');
  };

  /** @deprecated */
  app.startQSwordFlyAnimation = function() {
    app.startAvatarBoardSkillFromPanelKey('my', 'border');
  };

  app.ensureAvatarBoardSkillAnimTicker = function() {
    if (app._avatarBoardSkillTmr) {
      return;
    }
    app._avatarBoardSkillTmr = setInterval(function() {
      if (app.screen !== 'game' || !app.avatarBoardSkillVfx) {
        if (typeof app.clearAvatarBoardSkillVfx === 'function') {
          app.clearAvatarBoardSkillVfx();
        }
        return;
      }
      var a = app.avatarBoardSkillVfx;
      var def = app.getAvatarBoardSkillDef(a.panelKey);
      var fly = def && def.fly ? def.fly.durationMs : 400;
      var hold = def && def.fly ? def.fly.holdMs : 1000;
      var fd = a.durationMs != null ? a.durationMs : fly;
      var hd = a.holdMs != null ? a.holdMs : hold;
      if (Date.now() - a.startMs > fd + hd + 30) {
        if (typeof app.clearAvatarBoardSkillVfx === 'function') {
          app.clearAvatarBoardSkillVfx();
        }
        if (typeof app.draw === 'function') {
          app.draw();
        }
        return;
      }
      if (typeof app.draw === 'function') {
        app.draw();
      }
    }, 1000 / 45);
    app._qSwordTmr = app._avatarBoardSkillTmr;
  };

  app.ensureQSwordAnimTicker = app.ensureAvatarBoardSkillAnimTicker;

  /**
   * 预加载技能栏用到的图标（有 iconSrc 的格）
   */
  app.prepareAvatarBoardSkillPanelImages = function() {
    var k;
    for (k in BY_PANEL_KEY) {
      if (BY_PANEL_KEY[k].iconSrc) {
        app.ensureAvatarBoardSkillImage(BY_PANEL_KEY[k].iconSrc, function() {});
      }
    }
  };

  /**
   * 道具飞向的「受击」头像圈表现：本地释放时抖对手；联机对方释放时抖本人。
   * @returns {null|{forSide:'opp'|'my',dx:number,dy:number,scale:number,cx:number,cy:number,avR:number,extraRing:{alpha:number,glow:number,lineRpx:number,padRpx:number}}}
   */
  app.getAvatarBoardSkillStrikeAvatarFrameFx = function(layout) {
    var v = app.avatarBoardSkillVfx;
    if (!v || typeof app.computeBoardNameLabelLayout !== 'function') {
      return null;
    }
    var def = app.getAvatarBoardSkillDef(v.panelKey);
    if (!def || !def.fly) {
      return null;
    }
    var L = app.computeBoardNameLabelLayout(layout);
    if (!L) {
      return null;
    }
    var remote = !!v.remoteFromOpponent;
    if (remote) {
      if (!L.hasMyAv) {
        return null;
      }
    } else if (!L.hasOppAv) {
      return null;
    }
    var pc = def.pierce || {};
    var flyDur = v.durationMs != null ? v.durationMs : def.fly.durationMs;
    var holdMs = v.holdMs != null ? v.holdMs : def.fly.holdMs;
    var elapsed = Date.now() - v.startMs;
    if (elapsed < 0 || elapsed > flyDur + holdMs + 50) {
      return null;
    }
    var cx = remote ? L.myCx : L.oppCx;
    var cy = remote ? L.myCy : L.oppCy;
    var avR = L.avR;
    var shakeR = pc.oppShakeRpx != null ? pc.oppShakeRpx : 5;
    var scaleAmp = pc.oppScaleThump != null ? pc.oppScaleThump : 0.08;
    var burstMax = pc.impactBurstMs != null ? pc.impactBurstMs : 280;

    if (elapsed <= flyDur) {
      var u = elapsed / flyDur;
      if (u < 0.8) {
        return null;
      }
      var a = (u - 0.8) / 0.2;
      var ease = a * a;
      return {
        forSide: remote ? 'my' : 'opp',
        dx: 0,
        dy: 0,
        scale: 1 + 0.032 * ease,
        cx: cx,
        cy: cy,
        avR: avR,
        extraRing: {
          alpha: 0.12 + 0.2 * ease,
          glow: 0.22 * ease,
          lineRpx: 1.4 + 1.8 * ease,
          padRpx: 0.6 + 1.4 * ease
        }
      };
    }

    var pierceElapsed = elapsed - flyDur;
    var amp = app.rpx(shakeR);
    var decay = Math.exp(-pierceElapsed / 205);
    var dx =
      amp *
      decay *
      (Math.sin(pierceElapsed * 0.102) + 0.32 * Math.sin(pierceElapsed * 0.187));
    var dy =
      amp *
      decay *
      (Math.cos(pierceElapsed * 0.115) * 0.82 +
        0.38 * Math.sin(pierceElapsed * 0.068));
    var thump = Math.exp(-pierceElapsed / 82);
    var scale = 1 + scaleAmp * thump + 0.03 * decay * Math.sin(pierceElapsed * 0.032);
    var hitPhase = Math.min(1, pierceElapsed / burstMax);
    var ringAlpha = 0.38 * decay + 0.4 * (1 - hitPhase) * (1 - hitPhase);
    var padR = 1.2 + 2.8 * (1 - hitPhase) + 1.1 * thump;
    return {
      forSide: remote ? 'my' : 'opp',
      dx: dx,
      dy: dy,
      scale: scale,
      cx: cx,
      cy: cy,
      avR: avR,
      extraRing: {
        alpha: Math.min(0.95, ringAlpha),
        glow: 0.55 * thump + 0.2 * (1 - hitPhase),
        lineRpx: 2.2 + 2.4 * thump,
        padRpx: padR
      }
    };
  };

  function drawPierceImpactBurst(ctx, cx, cy, pierceElapsed, pierceCfg) {
    var burstMax = pierceCfg.impactBurstMs != null ? pierceCfg.impactBurstMs : 280;
    if (pierceElapsed < 0 || pierceElapsed > burstMax) {
      return;
    }
    var u = pierceElapsed / burstMax;
    /** 先快后慢散开，前几帧最亮（需在短剑贴图之上绘制，否则会被 PNG 挡住） */
    var r = app.rpx(8) + app.rpx(52) * (1 - Math.pow(1 - u, 0.55));
    var alpha = 0.72 * (1 - u);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,254,248,' + (alpha * 0.98) + ')');
    g.addColorStop(0.22, 'rgba(255,228,190,' + (alpha * 0.55) + ')');
    g.addColorStop(0.5, 'rgba(255,190,120,' + (alpha * 0.22) + ')');
    g.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    var i;
    var sparkN = 9;
    for (i = 0; i < sparkN; i++) {
      var baseAng = (i / sparkN) * Math.PI * 2 + u * 1.35;
      var sparkLen = app.rpx(22) * (1 - u * 0.55);
      var sx = Math.cos(baseAng) * sparkLen;
      var sy = Math.sin(baseAng) * sparkLen;
      ctx.strokeStyle = 'rgba(255,248,220,' + (0.62 * (1 - u * 0.85)) + ')';
      ctx.lineWidth = Math.max(1.2, app.rpx(2));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - sx * 0.08, cy - sy * 0.08);
      ctx.lineTo(cx + sx * 0.94, cy + sy * 0.94);
      ctx.stroke();
    }
    ctx.restore();
  }

  app.drawAvatarBoardSkillVfx = function(ctx, layout) {
    var v = app.avatarBoardSkillVfx;
    if (!v) {
      return;
    }
    var def = app.getAvatarBoardSkillDef(v.panelKey);
    if (!def || !def.fly) {
      return;
    }
    var src = def.iconSrc;
    var img = src ? IMG_CACHE[cacheKey(src)] : null;
    if (!img || !img.width || !img.height) {
      return;
    }
    var fly = def.fly;
    var now = Date.now();
    var flyDur = v.durationMs != null ? v.durationMs : fly.durationMs;
    var holdMs = v.holdMs != null ? v.holdMs : fly.holdMs;
    var elapsed = now - v.startMs;
    var u = elapsed / flyDur;
    if (u > 1) {
      u = 1;
    }
    var t = smoothstep01(u);
    /** 末段略加速「顶」向目标 */
    if (u > 0.88) {
      var rush = (u - 0.88) / 0.12;
      t = t + (1 - t) * 0.22 * rush * rush;
      if (t > 1) {
        t = 1;
      }
    }
    var x = v.fromX + (v.toX - v.fromX) * t;
    var y = v.fromY + (v.toY - v.fromY) * t;

    var tdx = v.toX - v.fromX;
    var tdy = v.toY - v.fromY;
    var tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    var tux = tdx / tlen;
    var tuy = tdy / tlen;

    var pierce = def.pierce || {};
    var hitAmp = pierce.hitPulseAmplitude != null ? pierce.hitPulseAmplitude : 0.08;
    var embedMax = pierce.embedRpx != null ? pierce.embedRpx : 5;

    var inPierce = elapsed > flyDur;
    var pierceElapsed = inPierce ? elapsed - flyDur : 0;
    var holdT = holdMs > 0 ? pierceElapsed / holdMs : 0;

    var hitPulse = 1;
    var wobbleRot = 0;
    var embedPx = 0;

    var drawImpactBurstAfterBlade = false;
    if (!inPierce && u > 0.85) {
      /** 飞行贴近对手时略放大，预示将击中 */
      var a = (u - 0.85) / 0.15;
      hitPulse = 1 + 0.095 * a * a;
    } else if (inPierce) {
      /** 刺入：先沿受力方向「吃进」再阻尼回弹，配合缩放冲击与轻微颤动 */
      var imp = Math.min(1, pierceElapsed / 120);
      var embedIn = 1 - Math.exp(-imp * 3.8);
      var settle = Math.exp(-pierceElapsed / 260);
      embedPx =
        app.rpx(embedMax) * embedIn * settle * (1 - 0.22 * Math.sin(imp * Math.PI));

      var thump = Math.exp(-pierceElapsed / 88) * 0.2;
      var ring = Math.exp(-pierceElapsed / 340);
      hitPulse =
        1 +
        thump +
        hitAmp * ring * Math.sin(pierceElapsed * 0.028);
      hitPulse += 0.055 * Math.exp(-pierceElapsed / 50) * Math.sin(pierceElapsed * 0.45);

      wobbleRot =
        0.08 * Math.exp(-pierceElapsed / 150) * Math.sin(pierceElapsed * 0.095);

      x += tux * embedPx;
      y += tuy * embedPx;

      if (holdT < 0.4) {
        drawImpactBurstAfterBlade = true;
      }
    }

    var imgOff =
      def.imageAngleOffsetRad != null ? def.imageAngleOffsetRad : (3 * Math.PI) / 4;
    var bladeRot = Math.atan2(tdy, tdx) + imgOff + wobbleRot;

    var mul =
      fly.sizeMul != null ? fly.sizeMul : app.Q_SWORD_FLY_SIZE_MUL != null
        ? app.Q_SWORD_FLY_SIZE_MUL
        : 0.6468;
    var baseW = fly.baseWidthRpx != null ? fly.baseWidthRpx : 88;
    var maxW = app.rpx(baseW) * mul;
    var scale = maxW / img.width;
    var w = img.width * scale;
    var h = img.height * scale;

    var shBlur =
      pierce.shadowBlurRpx != null ? app.rpx(pierce.shadowBlurRpx) : app.rpx(8);
    if (inPierce && pierceElapsed < 200) {
      shBlur *= 1 + 0.85 * Math.exp(-pierceElapsed / 110);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bladeRot);
    ctx.scale(hitPulse, hitPulse);
    ctx.shadowColor = pierce.shadowColor || 'rgba(30, 26, 22, 0.42)';
    ctx.shadowBlur = shBlur;
    ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h);
    ctx.restore();

    if (drawImpactBurstAfterBlade) {
      drawPierceImpactBurst(ctx, v.toX, v.toY, pierceElapsed, pierce);
    }
  };

  app.drawQSwordSkillEffect = app.drawAvatarBoardSkillVfx;
};
