/**
 * 本地默认头像：images/default/girl.png（女）、images/default/boy.png（男）
 * 展示用性别优先使用服务端 users.gender（经 GET /api/me/rating 等写入）；未同步时用本地微信授权缓存。
 */

var PATH_GIRL = 'images/default/girl.png';
var PATH_BOY = 'images/default/boy.png';
/** 每日残局守关者头像 */
var PATH_GUARDIAN_BOT = 'images/default/guardian-bot.png';
var STORAGE_KEY = 'gomoku_user_gender';

var imgGirl = null;
var imgBoy = null;
var imgGuardianBot = null;

/** 本人：GET /api/me/rating 的 gender（微信 0/1/2）；null 表示尚未从库同步 */
var serverMyWeChatGender = null;
/** 联机对手：GET .../opponent-rating；离开房间应清空 */
var serverOppWeChatGender = null;

function getGender() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var g = wx.getStorageSync(STORAGE_KEY);
      if (g === 'girl' || g === 'boy') {
        return g;
      }
    }
  } catch (e) {}
  return 'boy';
}

function setGender(g) {
  if (g !== 'girl' && g !== 'boy') {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEY, g);
    }
  } catch (e2) {}
}

/**
 * 微信 UserInfo：gender 0 未知 1 男 2 女（小游戏与小程序一致）
 */
function setGenderFromUserInfo(userInfo) {
  if (!userInfo || typeof userInfo.gender === 'undefined') {
    return;
  }
  var g = userInfo.gender;
  if (g === 2) {
    setGender('girl');
  } else {
    setGender('boy');
  }
}

function setMyGenderFromServer(g) {
  if (typeof g === 'number' && g >= 0 && g <= 2) {
    serverMyWeChatGender = g;
    return;
  }
  serverMyWeChatGender = null;
}

function setOpponentGenderFromServer(g) {
  if (typeof g === 'number' && g >= 0 && g <= 2) {
    serverOppWeChatGender = g;
    return;
  }
  serverOppWeChatGender = null;
}

/** 本人默认头像用：库优先，否则本地 boy/girl */
function effectiveWeChatGender() {
  if (typeof serverMyWeChatGender === 'number') {
    return serverMyWeChatGender;
  }
  return getGender() === 'girl' ? 2 : 1;
}

/** 静默登录 body.gender 上报 */
function getWeChatGenderForApi() {
  return effectiveWeChatGender();
}

function getImageForGender(g) {
  return g === 'girl' ? imgGirl : imgBoy;
}

/** 本地默认图未就绪时，文字占位与「当前绘制的头像图」一致（本人/对手） */
function genderForAvatarImage(img) {
  if (img === imgGirl) {
    return 'girl';
  }
  if (img === imgBoy) {
    return 'boy';
  }
  return effectiveWeChatGender() === 2 ? 'girl' : 'boy';
}

function getMyAvatarImage() {
  return getImageForWeChatGender(effectiveWeChatGender());
}

/**
 * 微信 userInfo.gender：0 未知、1 男、2 女；未知按男。
 */
function getImageForWeChatGender(weChatGender) {
  if (weChatGender === 2) {
    return getImageForGender('girl');
  }
  return getImageForGender('boy');
}

/** 棋盘旁对手占位：与本人展示性别相反（本人性别来自库优先） */
function getOpponentAvatarImage() {
  var eg = effectiveWeChatGender();
  var oppCode = eg === 2 ? 1 : 2;
  return getImageForWeChatGender(oppCode);
}

function getGuardianBotAvatarImage() {
  return imgGuardianBot;
}

/** 联机对手：有服务端 gender 时用其，否则同 getOpponentAvatarImage */
function getOnlineOpponentDefaultAvatarImage() {
  if (typeof serverOppWeChatGender === 'number') {
    return getImageForWeChatGender(serverOppWeChatGender);
  }
  return getOpponentAvatarImage();
}

/**
 * 守关机器人头像：整图按比例装入圆内（contain），避免居中裁方切掉两侧装饰
 * @param {number} [padding] 相对直径留白系数，默认 0.88（略缩进圆内）
 */
function drawGuardianBotCircleAvatar(ctx, img, cx, cy, r, th, padding) {
  if (r <= 0) {
    return;
  }
  var pad =
    typeof padding === 'number' && padding > 0 && padding <= 1 ? padding : 0.88;
  if (!img || !img.width || !img.height) {
    drawCircleAvatar(ctx, img, cx, cy, r, th);
    return;
  }
  var diam = 2 * r * pad;
  var iw = img.width;
  var ih = img.height;
  var scale = Math.min(diam / iw, diam / ih);
  var dw = iw * scale;
  var dh = ih * scale;
  var dx = cx - dw * 0.5;
  var dy = cy - dh * 0.5;
  var rcx = cx;
  var rcy = cy;
  var rr = r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.94)';
  ctx.lineWidth = 1.65;
  ctx.stroke();
  ctx.restore();
}

/**
 * 取图源正中的正方形区域（适配图内圆形主体），再绘入圆内
 */
function drawCircleAvatar(ctx, img, cx, cy, r, th) {
  if (r <= 0) {
    return;
  }
  if (img && img.width && img.height) {
    var sw = Math.min(img.width, img.height);
    var sx = (img.width - sw) / 2;
    var sy = (img.height - sw) / 2;
    var dx = Math.round(cx - r);
    var dy = Math.round(cy - r);
    var dw = Math.round(r * 2);
    var rcx = dx + dw * 0.5;
    var rcy = dy + dw * 0.5;
    var rr = dw * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sw, dx, dy, dw, dw);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.fillStyle = th && th.title ? th.title : '#333';
    ctx.font = 'bold 12px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      genderForAvatarImage(img) === 'girl' ? '女' : '男',
      Math.round(cx),
      Math.round(cy)
    );
    ctx.restore();
  }
}

function preloadAll(onDone) {
  var left = 3;
  function oneDone() {
    left--;
    if (left <= 0 && typeof onDone === 'function') {
      onDone();
    }
  }
  if (typeof wx === 'undefined' || !wx.createImage) {
    if (typeof onDone === 'function') {
      onDone();
    }
    return;
  }
  imgGirl = wx.createImage();
  imgGirl.onload = oneDone;
  imgGirl.onerror = oneDone;
  imgGirl.src = PATH_GIRL;
  imgBoy = wx.createImage();
  imgBoy.onload = oneDone;
  imgBoy.onerror = oneDone;
  imgBoy.src = PATH_BOY;
  imgGuardianBot = wx.createImage();
  imgGuardianBot.onload = oneDone;
  imgGuardianBot.onerror = oneDone;
  imgGuardianBot.src = PATH_GUARDIAN_BOT;
}

module.exports = {
  PATH_GIRL: PATH_GIRL,
  PATH_BOY: PATH_BOY,
  PATH_GUARDIAN_BOT: PATH_GUARDIAN_BOT,
  getGender: getGender,
  setGenderFromUserInfo: setGenderFromUserInfo,
  setMyGenderFromServer: setMyGenderFromServer,
  setOpponentGenderFromServer: setOpponentGenderFromServer,
  getWeChatGenderForApi: getWeChatGenderForApi,
  getMyAvatarImage: getMyAvatarImage,
  getImageForWeChatGender: getImageForWeChatGender,
  getOpponentAvatarImage: getOpponentAvatarImage,
  getGuardianBotAvatarImage: getGuardianBotAvatarImage,
  getOnlineOpponentDefaultAvatarImage: getOnlineOpponentDefaultAvatarImage,
  drawCircleAvatar: drawCircleAvatar,
  drawGuardianBotCircleAvatar: drawGuardianBotCircleAvatar,
  preloadAll: preloadAll,
};
