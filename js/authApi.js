/**
 * 静默登录：wx.login → 后端 jscode2session，users 表无则插入、有则更新 last_login_at
 * 由 main.js 在 wx.onShow 中每次进入小游戏调用（冷启动与从后台返回）
 * wx.login 只能换 openid；昵称/头像需在授权后通过 optionalProfile 传入
 *
 * 联机需要服务端返回 sessionToken（JWT）。若仅返回 userId，说明云托管未部署含 JWT 的最新后端。
 */

var roomApi = require('./roomApi.js');
var defaultAvatars = require('./defaultAvatars.js');

var SESSION_TOKEN_KEY = 'gomoku_session_token';

/** 静默登录 wx.request 成功回调后触发（loginOk, payload），用于同步管理员标记等 */
var silentLoginCompleteListeners = [];

function onSilentLoginComplete(fn) {
  if (typeof fn === 'function') {
    silentLoginCompleteListeners.push(fn);
  }
}

function hasValidSessionToken(payload) {
  return (
    payload &&
    typeof payload.sessionToken === 'string' &&
    payload.sessionToken.length > 0
  );
}

function persistSession(payload) {
  if (!hasValidSessionToken(payload)) {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(SESSION_TOKEN_KEY, payload.sessionToken);
    }
  } catch (e) {}
}

function getSessionToken() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var t = wx.getStorageSync(SESSION_TOKEN_KEY);
      return t ? String(t) : '';
    }
  } catch (e2) {}
  return '';
}

/**
 * 联机前调用：本地无 token 时走 wx.login + silent-login
 * @param onDone function(ok, errHint) 失败时 errHint 为简短提示文案
 */
function ensureSession(onDone) {
  if (getSessionToken()) {
    if (typeof onDone === 'function') {
      onDone(true);
    }
    return;
  }
  silentLogin(null, function (loginOk, payload) {
    if (loginOk && hasValidSessionToken(payload)) {
      persistSession(payload);
    }
    if (typeof onDone !== 'function') {
      return;
    }
    if (getSessionToken()) {
      onDone(true);
      return;
    }
    if (loginOk) {
      onDone(false, '请更新云托管后端（需返回 sessionToken）');
      return;
    }
    onDone(false, '请先完成登录');
  });
}

/** 串行执行，避免首屏 / onShow / 进房多处同时触发 wx.login 导致失败 */
var silentLoginQueue = [];
var silentLoginBusy = false;

function silentLoginPerform(optionalProfile, onDone) {
  if (typeof wx === 'undefined' || !wx.login) {
    if (typeof onDone === 'function') {
      onDone(false);
    }
    return;
  }
  wx.login({
    success: function (res) {
      if (!res.code) {
        if (typeof onDone === 'function') {
          onDone(false);
        }
        return;
      }
      var data = { code: res.code };
      if (optionalProfile) {
        if (optionalProfile.nickName) {
          data.nickname = optionalProfile.nickName;
        }
        if (optionalProfile.avatarUrl) {
          data.avatarUrl = optionalProfile.avatarUrl;
        }
        if (typeof optionalProfile.gender === 'number') {
          data.gender = optionalProfile.gender;
        }
      }
      if (typeof data.gender !== 'number') {
        data.gender = defaultAvatars.getWeChatGenderForApi();
      }
      wx.request({
        url: roomApi.GOMOKU_API_BASE + '/api/auth/silent-login',
        method: 'POST',
        header: {
          'content-type': 'application/json',
        },
        data: data,
        success: function (res) {
          var payload = res.data;
          if (payload && typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (parseErr) {
              payload = null;
            }
          }
          var loginOk =
            res.statusCode === 200 &&
            payload &&
            typeof payload.userId !== 'undefined';
          if (loginOk && hasValidSessionToken(payload)) {
            persistSession(payload);
          }
          if (loginOk && !hasValidSessionToken(payload)) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn(
                '[silent-login] 接口未返回 sessionToken：请重新部署 wxcloudrun-gomoku（含 JWT 与 jjwt 依赖）'
              );
            }
          }
          if (!loginOk && typeof console !== 'undefined' && console.warn) {
            console.warn(
              '[silent-login] 失败',
              res.statusCode,
              payload || res.data
            );
          }
          var payFinal = payload || res.data;
          var li;
          for (li = 0; li < silentLoginCompleteListeners.length; li++) {
            try {
              silentLoginCompleteListeners[li](loginOk, payFinal);
            } catch (eCb) {}
          }
          if (typeof onDone === 'function') {
            onDone(loginOk, payFinal);
          }
        },
        fail: function (err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[silent-login] 请求未发出或网络错误', err);
          }
          if (typeof onDone === 'function') {
            onDone(false);
          }
        },
      });
    },
    fail: function () {
      if (typeof onDone === 'function') {
        onDone(false);
      }
    },
  });
}

function silentLogin(optionalProfile, onDone) {
  silentLoginQueue.push({ optionalProfile: optionalProfile, onDone: onDone });
  function drain() {
    if (silentLoginBusy || !silentLoginQueue.length) {
      return;
    }
    silentLoginBusy = true;
    var job = silentLoginQueue.shift();
    silentLoginPerform(job.optionalProfile, function () {
      var args = arguments;
      try {
        if (typeof job.onDone === 'function') {
          job.onDone.apply(null, args);
        }
      } finally {
        silentLoginBusy = false;
        drain();
      }
    });
  }
  drain();
}

module.exports = {
  silentLogin: silentLogin,
  ensureSession: ensureSession,
  getSessionToken: getSessionToken,
  persistSession: persistSession,
  onSilentLoginComplete: onSilentLoginComplete,
};
