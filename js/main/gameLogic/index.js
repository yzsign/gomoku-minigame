/**
 * 游戏逻辑分片入口（原 main.js 主体）
 */
module.exports = function gameLogic(app, deps) {
  require('./avatarBoardSkills.js')(app, deps || {});
  require('./part1.js')(app, deps);
  require('./part2.js')(app, deps);
  require('./userSocialSocket.js')(app, deps);
  require('./part3.js')(app, deps);
  require('./part4.js')(app, deps);
  require('./friendListHome.js')(app, deps);
  require('./part5.js')(app, deps);
  require('./part6.js')(app, deps);
};
