/**
 * 五子棋规则引擎：棋盘、胜负、局面评估、minimax AI
 */

/** 棋盘大小 */
var SIZE = 15;

/** 空 / 黑 / 白 */
var EMPTY = 0;
var BLACK = 1;
var WHITE = 2;

/**
 * AI：主线程兜底（无 Worker 或创建失败时用）。人机优先走 workers/index.js + gomoku_ai.js。
 * 时间预算避免主线程长考卡顿；强棋力在 Worker 中不设预算（见 workers/gomoku_ai.js）。
 */
var AI_SEARCH_DEPTH = 5;
var AI_MAX_CANDIDATES = 18;

/** 单次思考上限；略长可提升棋力，过长会拖慢界面（一般 220–320ms 可接受） */
var AI_TIME_BUDGET_MS = 280;
var searchDeadline = 0;

function createBoard() {
  var b = [];
  for (var i = 0; i < SIZE; i++) {
    b[i] = [];
    for (var j = 0; j < SIZE; j++) {
      b[i][j] = EMPTY;
    }
  }
  return b;
}

/** 是否已无空位（和棋） */
function isBoardFull(board) {
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] === EMPTY) {
        return false;
      }
    }
  }
  return true;
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

/**
 * 在 (r,c) 落子后是否五连
 */
function checkWin(board, r, c, color) {
  var dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  for (var d = 0; d < dirs.length; d++) {
    var dr = dirs[d][0];
    var dc = dirs[d][1];
    var count = 1;
    for (var step = 1; step < 5; step++) {
      var nr = r + dr * step;
      var nc = c + dc * step;
      if (inBounds(nr, nc) && board[nr][nc] === color) count++;
      else break;
    }
    for (var s = 1; s < 5; s++) {
      var nr2 = r - dr * s;
      var nc2 = c - dc * s;
      if (inBounds(nr2, nc2) && board[nr2][nc2] === color) count++;
      else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

var DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
];

/* ---------- 启发式、局面评估、候选与搜索 ---------- */

/**
 * 单方向棋型分（假设 (r,c) 已落 color，只评估沿 dr,dc 这一条线）
 */
function linePatternScore(board, r, c, dr, dc, color) {
  var len = 1;
  var nr = r - dr;
  var nc = c - dc;
  while (inBounds(nr, nc) && board[nr][nc] === color) {
    len++;
    nr -= dr;
    nc -= dc;
  }
  var leftEnd = inBounds(nr, nc) ? board[nr][nc] : -1;
  nr = r + dr;
  nc = c + dc;
  while (inBounds(nr, nc) && board[nr][nc] === color) {
    len++;
    nr += dr;
    nc += dc;
  }
  var rightEnd = inBounds(nr, nc) ? board[nr][nc] : -1;

  var leftOpen = leftEnd === EMPTY;
  var rightOpen = rightEnd === EMPTY;

  if (len >= 5) return 10000000;
  if (len === 4) {
    if (leftOpen && rightOpen) return 500000;
    if (leftOpen || rightOpen) return 120000;
    return 8000;
  }
  if (len === 3) {
    if (leftOpen && rightOpen) return 45000;
    if (leftOpen || rightOpen) return 6000;
    return 400;
  }
  if (len === 2) {
    if (leftOpen && rightOpen) return 2200;
    if (leftOpen || rightOpen) return 350;
    return 40;
  }
  if (len === 1) {
    if (leftOpen && rightOpen) return 120;
    if (leftOpen || rightOpen) return 25;
    return 3;
  }
  return 0;
}

/**
 * 在 (r,c) 落 color 后的局部进攻分（用于排序与辅助）
 */
function heuristicMoveScore(board, r, c, color) {
  if (board[r][c] !== EMPTY) return -1e9;
  var was = board[r][c];
  board[r][c] = color;
  var s = 0;
  var d;
  for (d = 0; d < DIRS.length; d++) {
    s += linePatternScore(board, r, c, DIRS[d][0], DIRS[d][1], color);
  }
  board[r][c] = was;
  return s;
}

/**
 * 棋盘上所有「五格窗口」的形势估计（站在 aiColor 一方，越大越有利）
 */
function evaluateBoard(board, aiColor) {
  var opp = aiColor === BLACK ? WHITE : BLACK;
  var score = 0;
  var r;
  var c;
  var dr;
  var dc;

  function windowValue(br, bc, ddr, ddc) {
    var ai = 0;
    var op = 0;
    var em = 0;
    var k;
    for (k = 0; k < 5; k++) {
      var v = board[br + k * ddr][bc + k * ddc];
      if (v === aiColor) ai++;
      else if (v === opp) op++;
      else em++;
    }
    if (op > 0 && ai > 0) return 0;
    if (op > 0) {
      if (op === 5) return -2200000;
      if (op === 4 && em === 1) return -180000;
      if (op === 3 && em === 2) return -8000;
      if (op === 2 && em === 3) return -400;
      return 0;
    }
    if (ai === 5) return 2200000;
    if (ai === 4 && em === 1) return 180000;
    if (ai === 3 && em === 2) return 8000;
    if (ai === 2 && em === 3) return 400;
    if (ai === 1 && em === 4) return 40;
    return 0;
  }

  for (r = 0; r < SIZE; r++) {
    for (c = 0; c <= SIZE - 5; c++) {
      score += windowValue(r, c, 0, 1);
    }
  }
  for (c = 0; c < SIZE; c++) {
    for (r = 0; r <= SIZE - 5; r++) {
      score += windowValue(r, c, 1, 0);
    }
  }
  for (r = 0; r <= SIZE - 5; r++) {
    for (c = 0; c <= SIZE - 5; c++) {
      score += windowValue(r, c, 1, 1);
    }
  }
  for (r = 0; r <= SIZE - 5; r++) {
    for (c = 4; c < SIZE; c++) {
      score += windowValue(r, c, 1, -1);
    }
  }

  return score;
}

function countStones(board) {
  var n = 0;
  var i;
  var j;
  for (i = 0; i < SIZE; i++) {
    for (j = 0; j < SIZE; j++) {
      if (board[i][j] !== EMPTY) n++;
    }
  }
  return n;
}

function nearOccupied(board, r, c, dist) {
  var dr;
  var dc;
  for (dr = -dist; dr <= dist; dr++) {
    for (dc = -dist; dc <= dist; dc++) {
      if (dr === 0 && dc === 0) continue;
      var nr = r + dr;
      var nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] !== EMPTY) return true;
    }
  }
  return false;
}

/**
 * 候选落子点：已有棋子周围 2 格内；开局靠近天元
 */
function getCandidates(board) {
  var stones = countStones(board);
  if (stones === 0) {
    return [{ r: 7, c: 7 }];
  }

  var list = [];
  var seen = {};
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) continue;
      if (stones < 4 && (r === 7 || r === 6 || r === 8) && (c === 7 || c === 6 || c === 8)) {
        var k = r * SIZE + c;
        if (!seen[k]) {
          seen[k] = 1;
          list.push({ r: r, c: c });
        }
      }
      if (nearOccupied(board, r, c, 2)) {
        var k2 = r * SIZE + c;
        if (!seen[k2]) {
          seen[k2] = 1;
          list.push({ r: r, c: c });
        }
      }
    }
  }

  if (list.length === 0) {
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (board[r][c] === EMPTY) list.push({ r: r, c: c });
      }
    }
  }
  return list;
}

function sortMovesByHeuristic(board, moves, color, desc, maxCandidates) {
  var scored = [];
  var i;
  for (i = 0; i < moves.length; i++) {
    var m = moves[i];
    var h = heuristicMoveScore(board, m.r, m.c, color);
    var h2 = heuristicMoveScore(
      board,
      m.r,
      m.c,
      color === BLACK ? WHITE : BLACK
    );
    scored.push({ m: m, s: h + h2 * 1.12 });
  }
  scored.sort(function (a, b) {
    return desc ? b.s - a.s : a.s - b.s;
  });
  var out = [];
  for (i = 0; i < scored.length && i < maxCandidates; i++) {
    out.push(scored[i].m);
  }
  return out;
}

function tryWinningMove(board, color, pool) {
  var i;
  for (i = 0; i < pool.length; i++) {
    var m = pool[i];
    if (board[m.r][m.c] !== EMPTY) continue;
    board[m.r][m.c] = color;
    var w = checkWin(board, m.r, m.c, color);
    board[m.r][m.c] = EMPTY;
    if (w) return m;
  }
  return null;
}

/**
 * minimax：maximizing=true 表示当前行棋方为 aiColor
 */
function minimax(board, depth, alpha, beta, maximizing, aiColor, maxCandidates) {
  if (searchDeadline > 0 && Date.now() > searchDeadline) {
    return evaluateBoard(board, aiColor);
  }
  var opp = aiColor === BLACK ? WHITE : BLACK;
  var turnColor = maximizing ? aiColor : opp;

  var fullPool = getCandidates(board);
  var winSelf = tryWinningMove(board, turnColor, fullPool);
  if (winSelf) {
    if (turnColor === aiColor) return 20000000 - depth;
    return -20000000 + depth;
  }

  if (depth === 0) {
    return evaluateBoard(board, aiColor);
  }

  /** 剩余层数越深，分支越宽；越接近叶子越窄，显著减少节点数 */
  var poolCap = Math.min(maxCandidates, 4 + depth * 4);
  if (poolCap < 8) poolCap = 8;
  var pool = sortMovesByHeuristic(
    board,
    fullPool,
    turnColor,
    true,
    poolCap
  );

  if (pool.length === 0) {
    return evaluateBoard(board, aiColor);
  }

  var i;
  if (maximizing) {
    var maxEval = -1e15;
    for (i = 0; i < pool.length; i++) {
      var mv = pool[i];
      if (board[mv.r][mv.c] !== EMPTY) continue;
      board[mv.r][mv.c] = turnColor;
      if (checkWin(board, mv.r, mv.c, turnColor)) {
        board[mv.r][mv.c] = EMPTY;
        return 20000000 - depth;
      }
      var ev = minimax(
        board,
        depth - 1,
        alpha,
        beta,
        false,
        aiColor,
        maxCandidates
      );
      board[mv.r][mv.c] = EMPTY;
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  }

  var minEval = 1e15;
  for (i = 0; i < pool.length; i++) {
    var mv2 = pool[i];
    if (board[mv2.r][mv2.c] !== EMPTY) continue;
    board[mv2.r][mv2.c] = turnColor;
    if (checkWin(board, mv2.r, mv2.c, turnColor)) {
      board[mv2.r][mv2.c] = EMPTY;
      return -20000000 + depth;
    }
    var ev2 = minimax(
      board,
      depth - 1,
      alpha,
      beta,
      true,
      aiColor,
      maxCandidates
    );
    board[mv2.r][mv2.c] = EMPTY;
    if (ev2 < minEval) minEval = ev2;
    if (ev2 < beta) beta = ev2;
    if (beta <= alpha) break;
  }
  return minEval;
}

/* ---------- AI 落子 ---------- */

/**
 * AI：必胜/必堵 + 候选裁剪 + minimax + 棋型启发
 */
function aiMove(board, aiColor) {
  var searchDepth = AI_SEARCH_DEPTH;
  var maxCandidates = AI_MAX_CANDIDATES;
  searchDeadline = Date.now() + AI_TIME_BUDGET_MS;
  try {
    var opp = aiColor === BLACK ? WHITE : BLACK;
    var pool = getCandidates(board);
    if (pool.length === 0) return null;

    var win = tryWinningMove(board, aiColor, pool);
    if (win) return win;

    var block = tryWinningMove(board, opp, pool);
    if (block) return block;

    var ordered = sortMovesByHeuristic(
      board,
      pool,
      aiColor,
      true,
      maxCandidates
    );
    if (!ordered.length) {
      return pool[0];
    }
    var bestMove = ordered[0];
    var bestScore = -1e15;
    var alpha = -1e15;
    var beta = 1e15;
    var i;
    for (i = 0; i < ordered.length; i++) {
      var m = ordered[i];
      if (board[m.r][m.c] !== EMPTY) continue;
      board[m.r][m.c] = aiColor;
      if (checkWin(board, m.r, m.c, aiColor)) {
        board[m.r][m.c] = EMPTY;
        return m;
      }
      var sc = minimax(
        board,
        searchDepth - 1,
        alpha,
        beta,
        false,
        aiColor,
        maxCandidates
      );
      board[m.r][m.c] = EMPTY;
      if (sc > bestScore) {
        bestScore = sc;
        bestMove = m;
      }
      if (sc > alpha) alpha = sc;
    }

    return bestMove || pool[0];
  } finally {
    searchDeadline = 0;
  }
}

module.exports = {
  SIZE: SIZE,
  EMPTY: EMPTY,
  BLACK: BLACK,
  WHITE: WHITE,
  createBoard: createBoard,
  isBoardFull: isBoardFull,
  checkWin: checkWin,
  aiMove: aiMove,
  inBounds: inBounds
};
