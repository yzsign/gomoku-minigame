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
/** 静默登录 payload.userId，供本机私聊历史等按账号隔离（与 token 同步写入） */
var LOCAL_SELF_USER_ID_KEY = 'gomoku_local_self_user_id_v1';
/** 本地 token 有效时，onShow 跳过 wx.login 的最小间隔（毫秒） */
var SESSION_LAST_OK_AT_KEY = 'gomoku_session_last_ok_at_v1';
var SILENT_LOGIN_MIN_INTERVAL_MS = 5 * 60 * 1000;
var SILENT_LOGIN_REQUEST_TIMEOUT_MS = 15000;

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

function recordSessionOkTime() {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(SESSION_LAST_OK_AT_KEY, String(Date.now()));
    }
  } catch (eRec) {}
}

function shouldSkipSilentLogin(optionalProfile) {
  if (optionalProfile) {
    return false;
  }
  if (!getSessionToken()) {
    return false;
  }
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var raw = wx.getStorageSync(SESSION_LAST_OK_AT_KEY);
      var t = Number(raw);
      if (!isNaN(t) && t > 0 && Date.now() - t < SILENT_LOGIN_MIN_INTERVAL_MS) {
        return true;
      }
    }
  } catch (eSkip) {}
  return false;
}

function persistSession(payload) {
  if (!hasValidSessionToken(payload)) {
    return;
  }
  recordSessionOkTime();
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(SESSION_TOKEN_KEY, payload.sessionToken);
      if (
        payload &&
        payload.userId !== undefined &&
        payload.userId !== null
      ) {
        var n = Number(payload.userId);
        if (!isNaN(n) && n > 0) {
          wx.setStorageSync(LOCAL_SELF_USER_ID_KEY, String(Math.floor(n)));
        }
      }
    }
  } catch (e) {}
}

function getStoredSelfUserId() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var s = wx.getStorageSync(LOCAL_SELF_USER_ID_KEY);
      if (s != null && String(s).length > 0) {
        var uid = Number(String(s));
        if (!isNaN(uid) && uid > 0) {
          return Math.floor(uid);
        }
      }
    }
  } catch (e2) {}
  return null;
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
        if (optionalProfile.clearAvatar) {
          data.avatarUrl = '';
        } else if (optionalProfile.avatarUrl) {
          data.avatarUrl = optionalProfile.avatarUrl;
        }
        if (typeof optionalProfile.gender === 'number') {
          data.gender = optionalProfile.gender;
        }
      }
      if (typeof data.gender !== 'number') {
        data.gender = defaultAvatars.getWeChatGenderForApi();
      }
      // 若工具里勾选「不校验合法域名、web-view、TLS 版本与 HTTPS 证书」，
      // 控制台会在此请求附近出现系统提示；真机/提审以公众平台配置的 request 合法域名为准。
      wx.request({
        url: roomApi.GOMOKU_API_BASE + '/api/auth/silent-login',
        method: 'POST',
        timeout: SILENT_LOGIN_REQUEST_TIMEOUT_MS,
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
  if (shouldSkipSilentLogin(optionalProfile)) {
    if (typeof onDone === 'function') {
      onDone(true, { sessionSkipped: true });
    }
    return;
  }
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
  getStoredSelfUserId: getStoredSelfUserId,
  onSilentLoginComplete: onSilentLoginComplete,
};
