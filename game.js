/**
 * 【setTimeout / LifeCycle.load 报错说明】
 * 微信基础库 3.13+ 在 WAGame.js 内会在加载本文件之前就引用 setTimeout，属框架侧问题；
 * 仅靠 game.js 无法拦截。开放社区确认：开发者工具请将「调试基础库」设为 3.12.1 或更低。
 * 路径：工具栏「详情」→「本地设置」→「调试基础库」。
 *
 * 下面仍做 GameGlobal ↔ globalThis 桥接与兜底，避免业务脚本阶段缺定时器。
 */
(function bridgeGameGlobalTimers() {
  var GG = typeof GameGlobal !== 'undefined' ? GameGlobal : null;
  if (!GG) {
    return;
  }
  var GT = typeof globalThis !== 'undefined' ? globalThis : GG;
  var names = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
  var k;
  for (k = 0; k < names.length; k++) {
    var n = names[k];
    if (typeof GT[n] !== 'function' && typeof GG[n] === 'function') {
      try {
        GT[n] = GG[n].bind(GG);
      } catch (e0) {
        GT[n] = GG[n];
      }
    }
  }
})();

(function () {
  var names = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
  var roots = [];
  if (typeof globalThis !== 'undefined') {
    roots.push(globalThis);
  }
  if (typeof GameGlobal !== 'undefined') {
    roots.push(GameGlobal);
  }
  if (typeof global !== 'undefined') {
    roots.push(global);
  }
  if (typeof window !== 'undefined') {
    roots.push(window);
  }
  if (typeof self !== 'undefined') {
    roots.push(self);
  }

  function firstImpl(name) {
    var r;
    var i;
    for (i = 0; i < roots.length; i++) {
      r = roots[i];
      if (r && typeof r[name] === 'function') {
        return r[name];
      }
    }
    try {
      var timers = require('timers');
      if (timers && typeof timers[name] === 'function') {
        return timers[name];
      }
    } catch (e) {}
    return null;
  }

  function installRafFallback() {
    if (typeof firstImpl('setTimeout') === 'function') {
      return null;
    }
    var raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function'
          ? function (cb) {
              return wx.requestAnimationFrame(cb);
            }
          : null;
    if (!raf) {
      return null;
    }
    var nextId = 1;
    var pending = {};
    function setTimeoutPoly(fn, delay) {
      delay = Math.max(0, Number(delay) || 0);
      var id = nextId++;
      var start = Date.now();
      var state = { cancelled: false, handle: null };
      pending[id] = state;
      function tick() {
        if (state.cancelled) {
          return;
        }
        if (Date.now() - start >= delay) {
          delete pending[id];
          try {
            fn();
          } catch (err) {}
          return;
        }
        state.handle = raf(tick);
      }
      state.handle = raf(tick);
      return id;
    }
    function clearTimeoutPoly(id) {
      var state = pending[id];
      if (!state) {
        return;
      }
      state.cancelled = true;
      if (state.handle != null) {
        if (typeof cancelAnimationFrame === 'function') {
          try {
            cancelAnimationFrame(state.handle);
          } catch (e1) {}
        }
        if (
          typeof wx !== 'undefined' &&
          typeof wx.cancelAnimationFrame === 'function'
        ) {
          try {
            wx.cancelAnimationFrame(state.handle);
          } catch (e2) {}
        }
      }
      delete pending[id];
    }
    return { setTimeoutPoly: setTimeoutPoly, clearTimeoutPoly: clearTimeoutPoly };
  }

  var i;
  var n;
  var impl;
  var j;
  var fb = installRafFallback();
  if (fb) {
    for (i = 0; i < roots.length; i++) {
      if (roots[i] && typeof roots[i].setTimeout !== 'function') {
        roots[i].setTimeout = fb.setTimeoutPoly;
      }
      if (roots[i] && typeof roots[i].clearTimeout !== 'function') {
        roots[i].clearTimeout = fb.clearTimeoutPoly;
      }
    }
  }

  for (i = 0; i < names.length; i++) {
    n = names[i];
    impl = firstImpl(n);
    if (typeof impl !== 'function') {
      continue;
    }
    for (j = 0; j < roots.length; j++) {
      if (!roots[j]) {
        continue;
      }
      if (typeof roots[j][n] !== 'function') {
        try {
          roots[j][n] = impl;
        } catch (eBind) {
          try {
            roots[j][n] = impl.bind(roots[j]);
          } catch (e2) {}
        }
      }
    }
  }
})();

require('./js/main');
