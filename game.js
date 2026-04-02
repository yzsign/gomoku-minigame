/**
 * 部分基础库（如 3.13+）在 LifeCycle.load 阶段可能未正确注入全局 setTimeout；
 * 若 GameGlobal 上已有实现则挂到当前全局，避免框架/业务 ReferenceError。
 */
(function () {
  var G = typeof GameGlobal !== 'undefined' ? GameGlobal : null;
  if (!G) {
    return;
  }
  var root =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof global !== 'undefined'
        ? global
        : G;
  var names = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (typeof root[n] !== 'function' && typeof G[n] === 'function') {
      try {
        root[n] = G[n].bind(G);
      } catch (e) {
        root[n] = G[n];
      }
    }
  }
})();

require('./js/main');
