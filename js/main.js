/**
 * 微信小游戏入口：界面状态机、绘制、触摸、联机与人机流程。
 * 主体逻辑在 js/main/gameLogic/（由 scripts/migrate_main.py + split_gamelogic.py 自单文件拆分）。
 */

var app = require('./main/app.js');
var gomoku = require('./gomoku.js');
var render = require('./render.js');
var themes = require('./themes.js');
var doodles = require('./doodles.js');
var roomApi = require('./roomApi.js');
var authApi = require('./authApi.js');
var defaultAvatars = require('./defaultAvatars.js');
var ratingTitle = require('./ratingTitle.js');

var wxApi = typeof wx !== 'undefined' ? wx : {};

require('./main/gameLogic/index.js')(app, {
  gomoku: gomoku,
  render: render,
  themes: themes,
  doodles: doodles,
  roomApi: roomApi,
  authApi: authApi,
  defaultAvatars: defaultAvatars,
  ratingTitle: ratingTitle,
  wx: wxApi
});
