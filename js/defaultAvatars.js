/**
 * 本地默认头像：images/default/girl.png（女）、images/default/boy.png（男）
 * 性别来自微信 userInfo.gender（授权后）：0 未知 → boy，1 男 → boy，2 女 → girl
 */

var PATH_GIRL = 'images/default/girl.png';
var PATH_BOY = 'images/default/boy.png';
var STORAGE_KEY = 'gomoku_user_gender';

var imgGirl = null;
var imgBoy = null;

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

function getImageForGender(g) {
  return g === 'girl' ? imgGirl : imgBoy;
}

function getMyAvatarImage() {
  return getImageForGender(getGender());
}

/** 棋盘旁对手占位：与「我」性别相反，便于区分 */
function getOpponentAvatarImage() {
  return getImageForGender(getGender() === 'girl' ? 'boy' : 'girl');
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
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sw, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
    ctx.fillText(getGender() === 'girl' ? '女' : '男', cx, cy);
    ctx.restore();
  }
}

function preloadAll(onDone) {
  var left = 2;
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
}

module.exports = {
  PATH_GIRL: PATH_GIRL,
  PATH_BOY: PATH_BOY,
  getGender: getGender,
  setGenderFromUserInfo: setGenderFromUserInfo,
  getMyAvatarImage: getMyAvatarImage,
  getOpponentAvatarImage: getOpponentAvatarImage,
  drawCircleAvatar: drawCircleAvatar,
  preloadAll: preloadAll,
};
