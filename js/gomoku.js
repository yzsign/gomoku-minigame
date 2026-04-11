/**
 * 五子棋规则引擎：棋盘、胜负、局面评估、minimax AI
 */

/** 棋盘大小 */
var SIZE = 15;

/** 空 / 黑 / 白 */
var EMPTY = 0;
var BLACK = 1;
var WHITE = 2;

var openingBook = require('./opening_book.js');

/**
 * AI：主线程兜底（无 Worker 或创建失败时用）。人机优先走 workers/index.js + gomoku_ai.js。
 * 时间预算避免主线程长考卡顿；强棋力主要在 Worker。
 */
var AI_SEARCH_DEPTH = 9;
var AI_MAX_CANDIDATES = 34;

/** 主线程兜底：尽量强但仍控卡顿；常用人机走 Worker */
var AI_TIME_BUDGET_MS = 800;
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

/**
 * 取构成胜利的连续五子（含 (r,c)，用于高亮连线；超过五连时取包含该子的连续五格）
 * @returns {Array<{r:number,c:number}>|null}
 */
function getWinningLineCells(board, r, c, color) {
  var dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  var d;
  for (d = 0; d < dirs.length; d++) {
    var dr = dirs[d][0];
    var dc = dirs[d][1];
    var sr = r;
    var sc = c;
    while (inBounds(sr - dr, sc - dc) && board[sr - dr][sc - dc] === color) {
      sr -= dr;
      sc -= dc;
    }
    var cells = [];
    var tr = sr;
    var tc = sc;
    while (inBounds(tr, tc) && board[tr][tc] === color) {
      cells.push({ r: tr, c: tc });
      tr += dr;
      tc += dc;
    }
    if (cells.length < 5) {
      continue;
    }
    var k = -1;
    var i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].r === r && cells[i].c === c) {
        k = i;
        break;
      }
    }
    if (k < 0) {
      continue;
    }
    var startIdx = Math.max(0, k - 4);
    var maxStart = cells.length - 5;
    if (startIdx > maxStart) {
      startIdx = maxStart;
    }
    var out = [];
    for (i = 0; i < 5; i++) {
      out.push(cells[startIdx + i]);
    }
    return out;
  }
  return null;
}

var DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
];

/* ---------- 启发式、局面评估、候选与搜索 ---------- */

/** 与后端 GomokuAiEngine.patternMagnitude 一致 */
function patternMagnitude(len, leftOpen, rightOpen) {
  var openEnds = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
  if (len >= 5) return 10000000;
  if (len === 4) {
    if (openEnds === 2) return 500000;
    if (openEnds === 1) return 120000;
    return 8000;
  }
  if (len === 3) {
    if (openEnds === 2) return 45000;
    if (openEnds === 1) return 6000;
    return 400;
  }
  if (len === 2) {
    if (openEnds === 2) return 2200;
    if (openEnds === 1) return 350;
    return 40;
  }
  if (len === 1) {
    if (openEnds === 2) return 120;
    if (openEnds === 1) return 25;
    return 3;
  }
  return 0;
}

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
  return patternMagnitude(len, leftOpen, rightOpen);
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

/** 对手线型威胁加权，与后端 OPP_LINE_PATTERN_MULT 一致 */
var OPP_LINE_PATTERN_MULT = 1.18;

/**
 * 沿每条线扫描连续棋块（活二/活三/活四等），比五格窗口更能反映防守压力
 */
function evaluateBoard(board, aiColor) {
  var opp = aiColor === BLACK ? WHITE : BLACK;
  var score = 0;
  var line = [];
  var r;
  var c;
  var d;
  var sumIdx;

  function evalLine1d(arr, n) {
    var i = 0;
    while (i < n) {
      if (arr[i] === EMPTY) {
        i++;
        continue;
      }
      var stone = arr[i];
      var j = i;
      while (j < n && arr[j] === stone) {
        j++;
      }
      var runLen = j - i;
      var leftOpen = i > 0 && arr[i - 1] === EMPTY;
      var rightOpen = j < n && arr[j] === EMPTY;
      var mag = patternMagnitude(runLen, leftOpen, rightOpen);
      if (stone === aiColor) {
        score += mag;
      } else if (stone === opp) {
        score -= mag * OPP_LINE_PATTERN_MULT;
      }
      i = j;
    }
  }

  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      line[c] = board[r][c];
    }
    evalLine1d(line, SIZE);
  }
  for (c = 0; c < SIZE; c++) {
    for (r = 0; r < SIZE; r++) {
      line[r] = board[r][c];
    }
    evalLine1d(line, SIZE);
  }
  for (d = -(SIZE - 1); d <= SIZE - 1; d++) {
    var count = 0;
    if (d >= 0) {
      r = d;
      c = 0;
    } else {
      r = 0;
      c = -d;
    }
    while (r < SIZE && c < SIZE) {
      line[count++] = board[r][c];
      r++;
      c++;
    }
    if (count > 0) {
      evalLine1d(line, count);
    }
  }
  for (sumIdx = 0; sumIdx <= 2 * (SIZE - 1); sumIdx++) {
    r = Math.max(0, sumIdx - (SIZE - 1));
    c = sumIdx - r;
    count = 0;
    while (r < SIZE && c >= 0) {
      line[count++] = board[r][c];
      r++;
      c--;
    }
    if (count > 0) {
      evalLine1d(line, count);
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

function minChebyshevDistToNearestStone(board, r, c) {
  var best = 99;
  var rr;
  var cc;
  for (rr = 0; rr < SIZE; rr++) {
    for (cc = 0; cc < SIZE; cc++) {
      if (board[rr][cc] === EMPTY) {
        continue;
      }
      var d = Math.max(Math.abs(rr - r), Math.abs(cc - c));
      if (d < best) {
        best = d;
      }
    }
  }
  return best;
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
 * 候选落子点：仅在已有子邻域内展开；开局邻距收紧，避免首步远离战场。
 */
function getCandidates(board) {
  var stones = countStones(board);
  if (stones === 0) {
    return [{ r: 7, c: 7 }];
  }

  var ring = stones <= 2 ? 2 : 4;
  var list = [];
  var seen = {};
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) continue;
      if (nearOccupied(board, r, c, ring)) {
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
    var s = h + h2 * 1.55;
    if (countStones(board) <= 2) {
      var d0 = minChebyshevDistToNearestStone(board, m.r, m.c);
      if (d0 < 99) {
        s += (6 - d0) * 350;
      }
    }
    scored.push({ m: m, s: s });
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

function tryWinningMoveInPool(board, color, pool) {
  var i;
  for (i = 0; i < pool.length; i++) {
    var m = pool[i];
    if (board[m.r][m.c] !== EMPTY) {
      continue;
    }
    board[m.r][m.c] = color;
    var w = checkWin(board, m.r, m.c, color);
    board[m.r][m.c] = EMPTY;
    if (w) {
      return m;
    }
  }
  return null;
}

function tryWinningMoveAnywhere(board, color) {
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) {
        continue;
      }
      board[r][c] = color;
      var w = checkWin(board, r, c, color);
      board[r][c] = EMPTY;
      if (w) {
        return { r: r, c: c };
      }
    }
  }
  return null;
}

function hasImmediateWin(board, color, pool) {
  return (
    tryWinningMoveInPool(board, color, pool) ||
    tryWinningMoveAnywhere(board, color)
  );
}

var THREAT_LIVE_THREE = 45000;
var THREAT_SLEEP_THREE = 6000;
var THREAT_LIVE_TWO = 2000;

function maxLineThreatAtMove(board, r, c, color) {
  if (board[r][c] !== EMPTY) {
    return -1;
  }
  board[r][c] = color;
  var localMax = 0;
  var d;
  for (d = 0; d < DIRS.length; d++) {
    var v = linePatternScore(
      board,
      r,
      c,
      DIRS[d][0],
      DIRS[d][1],
      color
    );
    if (v > localMax) {
      localMax = v;
    }
  }
  board[r][c] = EMPTY;
  return localMax;
}

function findBestThreatCell(board, color) {
  var bestR = -1;
  var bestC = -1;
  var bestM = -1;
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) {
        continue;
      }
      var t = maxLineThreatAtMove(board, r, c, color);
      if (t > bestM) {
        bestM = t;
        bestR = r;
        bestC = c;
      }
    }
  }
  return { r: bestR, c: bestC, max: bestM };
}

function urgentDefenseAgainstShape(board, aiColor) {
  var opp = aiColor === BLACK ? WHITE : BLACK;
  var o = findBestThreatCell(board, opp);
  var m = findBestThreatCell(board, aiColor);
  if (o.r < 0 || o.max < THREAT_SLEEP_THREE) {
    return null;
  }
  if (o.max >= THREAT_LIVE_THREE) {
    if (m.max > o.max + 4000) {
      return null;
    }
    return { r: o.r, c: o.c };
  }
  if (o.max >= THREAT_SLEEP_THREE && o.max >= m.max + 200) {
    return { r: o.r, c: o.c };
  }
  if (
    countStones(board) > 8 &&
    o.max >= THREAT_LIVE_TWO &&
    o.max > m.max + 120
  ) {
    return { r: o.r, c: o.c };
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
  var winSelf = hasImmediateWin(board, turnColor, fullPool);
  if (winSelf) {
    if (turnColor === aiColor) return 20000000 - depth;
    return -20000000 + depth;
  }

  if (depth === 0) {
    return evaluateBoard(board, aiColor);
  }

  var poolCap = Math.min(maxCandidates, 6 + depth * 6);
  if (poolCap < 12) poolCap = 12;
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
 * @param {{rif?: boolean}|undefined} options 开局库：rif 为 false 时用自由远距离 26 点
 */
function aiMove(board, aiColor, options) {
  var searchDepth = AI_SEARCH_DEPTH;
  var maxCandidates = AI_MAX_CANDIDATES;
  var timeBudget = AI_TIME_BUDGET_MS;
  if (options && options.dailyDifficulty != null) {
    var lv = Number(options.dailyDifficulty);
    if (isNaN(lv)) {
      lv = 3;
    }
    if (lv <= 1) {
      searchDepth = 7;
      maxCandidates = 26;
      timeBudget = 600;
    } else if (lv === 2) {
      searchDepth = 9;
      maxCandidates = 34;
      timeBudget = 1200;
    } else {
      searchDepth = 12;
      maxCandidates = 42;
      timeBudget = 2400;
    }
  }
  searchDeadline = Date.now() + timeBudget;
  try {
    var opp = aiColor === BLACK ? WHITE : BLACK;
    var pool = getCandidates(board);
    if (pool.length === 0) return null;

    var win = tryWinningMoveAnywhere(board, aiColor);
    if (win) {
      return win;
    }

    var block = tryWinningMoveAnywhere(board, opp);
    if (block) {
      return block;
    }

    var shapeBlock = urgentDefenseAgainstShape(board, aiColor);
    if (shapeBlock) {
      return shapeBlock;
    }

    var joseki = openingBook.getJosekiMove(board, aiColor, options);
    var ordered = sortMovesByHeuristic(
      board,
      pool,
      aiColor,
      true,
      maxCandidates
    );
    if (!ordered.length) {
      return joseki || pool[0];
    }
    if (
      joseki &&
      board[joseki.r][joseki.c] === EMPTY
    ) {
      var dupIdx = -1;
      var k;
      for (k = 0; k < ordered.length; k++) {
        if (ordered[k].r === joseki.r && ordered[k].c === joseki.c) {
          dupIdx = k;
          break;
        }
      }
      if (dupIdx >= 0) {
        var without = ordered.slice();
        without.splice(dupIdx, 1);
        ordered = [joseki].concat(without).slice(0, maxCandidates);
      } else {
        ordered = [joseki].concat(ordered).slice(0, maxCandidates);
      }
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
  getWinningLineCells: getWinningLineCells,
  aiMove: aiMove,
  inBounds: inBounds
};
