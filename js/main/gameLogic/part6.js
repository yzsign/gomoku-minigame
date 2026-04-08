/**
 * Auto-split from gameLogic.js (part 6)
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

app.setupShareMessage = function() {
  if (typeof wx.onShareAppMessage === 'function') {
    wx.onShareAppMessage(function () {
      if (app.isPvpOnline && app.onlineRoomId && app.pvpOnlineYourColor === app.BLACK) {
        return {
          title: '五子棋 房号 ' + app.onlineRoomId,
          query: 'roomId=' + app.onlineRoomId + '&online=1'
        };
      }
      return {
        title: '来一局团团五子棋吧！',
        query: 'from=invite'
      };
    });
  }
}
app.setupShareMessage();

try {
  var launchOpt = wx.getLaunchOptionsSync && wx.getLaunchOptionsSync();
  if (launchOpt && launchOpt.query) {
    var lq = launchOpt.query;
    if (String(lq.online) === '1' && lq.roomId) {
      app.tryLaunchOnlineInvite(lq);
    } else if (String(lq.from) === 'invite') {
      app.startPvpLocal();
    }
  }
} catch (launchErr) {}

if (typeof wx.onWindowResize === 'function') {
  wx.onWindowResize(function () {
    app.syncCanvasWithWindow();
    app.draw();
  });
}

defaultAvatars.preloadAll(function () {
  app.loadHomeUiAssets();
  app.draw();
});

app.draw();
app.maybeFirstVisitProfileModal();

/** 首屏再调一次：避免仅依赖 onShow 时，部分环境下首帧未触发或注册晚于首次 onShow */
authApi.silentLogin();
setTimeout(function () {
  app.tryFetchMyProfileAvatar();
}, 600);
};
