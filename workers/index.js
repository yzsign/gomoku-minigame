/**
 * 人机 AI Worker 入口：仅处理 COMPUTE，不访问 wx API。
 */
var engine = require('./gomoku_ai.js');

worker.onMessage(function (res) {
  if (!res || res.type !== 'AI_MOVE') {
    return;
  }
  var seq = res.seq;
  var gen = res.gen;
  var board = res.board;
  var aiColor = res.aiColor;
  try {
    var mv = engine.aiMove(board, aiColor);
    worker.postMessage({
      type: 'AI_MOVE_RESULT',
      seq: seq,
      gen: gen,
      move: mv,
      err: null
    });
  } catch (err) {
    worker.postMessage({
      type: 'AI_MOVE_RESULT',
      seq: seq,
      gen: gen,
      move: null,
      err: err && err.message ? err.message : 'ai_failed'
    });
  }
});
