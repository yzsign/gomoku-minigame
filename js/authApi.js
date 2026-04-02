/**
 * 静默登录：wx.login → 后端 jscode2session，users 表无则插入、有则更新 last_login_at
 * 由 main.js 在 wx.onShow 中每次进入小游戏调用（冷启动与从后台返回）
 * wx.login 只能换 openid；昵称/头像需在授权后通过 optionalProfile 传入
 */
var roomApi = require('./roomApi.js');

function silentLogin(optionalProfile, onDone) {
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
      }
      wx.request({
        url: roomApi.GOMOKU_API_BASE + '/api/auth/silent-login',
        method: 'POST',
        header: {
          'content-type': 'application/json'
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
          var ok =
            res.statusCode === 200 &&
            payload &&
            typeof payload.userId !== 'undefined';
          if (!ok && typeof console !== 'undefined' && console.warn) {
            console.warn(
              '[silent-login] 失败',
              res.statusCode,
              payload || res.data
            );
          }
          if (typeof onDone === 'function') {
            onDone(ok, payload || res.data);
          }
        },
        fail: function (err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[silent-login] 请求未发出或网络错误', err);
          }
          if (typeof onDone === 'function') {
            onDone(false);
          }
        }
      });
    },
    fail: function () {
      if (typeof onDone === 'function') {
        onDone(false);
      }
    }
  });
}

module.exports = {
  silentLogin: silentLogin
};
