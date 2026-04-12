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

/** 默认人机参数（与后端 GomokuAiEngine 默认值语义对齐）；可通过 aiMove(board, color, options) 覆盖 */
var DEFAULT_AI_TUNE = {
  oppThreatWeight: 1.3,
  doubleThreatMult: 4,
  candidateRing: 2,
  forcedTiersMax: 6
};
/** aiMove 执行期间指向当前局参数，便于 minimax 叶评估与排序共用 */
var currentAiTune = null;

function tune() {
  return currentAiTune || DEFAULT_AI_TUNE;
}

function clampNum(n, lo, hi) {
  if (n !== n || n == null) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function applyTuneFields(t, src) {
  if (!src || typeof src !== 'object') return;
  if (src.oppThreatWeight != null) {
    t.oppThreatWeight = clampNum(Number(src.oppThreatWeight), 0.5, 2.5);
  }
  if (src.doubleThreatMult != null) {
    t.doubleThreatMult = clampNum(Number(src.doubleThreatMult), 1, 8);
  }
  if (src.candidateRing != null) {
    t.candidateRing = clampNum(Math.floor(Number(src.candidateRing)), 1, 4);
  }
  if (src.forcedTiersMax != null) {
    t.forcedTiersMax = clampNum(Math.floor(Number(src.forcedTiersMax)), 3, 6);
  }
}

/**
 * 合并 options.aiTune 与顶层同名字段（后者覆盖前者）；控制防守权重、双威胁倍数、候选环、强制层 3–6
 */
function resolveAiTune(options) {
  var t = {
    oppThreatWeight: DEFAULT_AI_TUNE.oppThreatWeight,
    doubleThreatMult: DEFAULT_AI_TUNE.doubleThreatMult,
    candidateRing: DEFAULT_AI_TUNE.candidateRing,
    forcedTiersMax: DEFAULT_AI_TUNE.forcedTiersMax
  };
  if (!options || typeof options !== 'object') {
    return t;
  }
  if (options.aiTune && typeof options.aiTune === 'object') {
    applyTuneFields(t, options.aiTune);
  }
  applyTuneFields(t, options);
  return t;
}

/* ---------- 启发式、局面评估、候选与搜索 ---------- */

/**
 * 与后端 GomokuAiEngine.patternMagnitude 一致。
 * 分值贴近文档第四节（五连、活四、冲四、活三、活二量级），供局面评估与线型扫描使用。
 */
function patternMagnitude(len, leftOpen, rightOpen) {
  var openEnds = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
  if (len >= 5) return 100000;
  if (len === 4) {
    if (openEnds === 2) return 10000;
    if (openEnds === 1) return 1000;
    return 50;
  }
  if (len === 3) {
    if (openEnds === 2) return 100;
    if (openEnds === 1) return 25;
    return 2;
  }
  if (len === 2) {
    if (openEnds === 2) return 5;
    if (openEnds === 1) return 1;
    return 0;
  }
  if (len === 1) {
    if (openEnds === 2) return 1;
    if (openEnds === 1) return 0;
    return 0;
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

function getLineRunInfo(board, r, c, dr, dc, color) {
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
  return {
    len: len,
    leftOpen: leftEnd === EMPTY,
    rightOpen: rightEnd === EMPTY
  };
}

function classifySegment(len, leftOpen, rightOpen) {
  if (len >= 5) return 'W';
  if (len === 4) {
    if (leftOpen && rightOpen) return 'L4';
    if (leftOpen || rightOpen) return 'R4';
    return 'X';
  }
  if (len === 3) {
    if (leftOpen && rightOpen) return 'L3';
    if (leftOpen || rightOpen) return 'S3';
    return 'X';
  }
  if (len === 2) {
    if (leftOpen && rightOpen) return 'L2';
    return 'X';
  }
  return 'N';
}

/**
 * 冲四：沿 dr,dc 连成一线后，下一手成五的空位（仅 R4 有效；文档规则2「独立威胁」用）
 */
function rushFourWinningCell(board, r, c, dr, dc, color) {
  var lr = r;
  var lc = c;
  while (
    inBounds(lr - dr, lc - dc) &&
    board[lr - dr][lc - dc] === color
  ) {
    lr -= dr;
    lc -= dc;
  }
  var rr = r;
  var rc = c;
  while (
    inBounds(rr + dr, rc + dc) &&
    board[rr + dr][rc + dc] === color
  ) {
    rr += dr;
    rc += dc;
  }
  var leftE = inBounds(lr - dr, lc - dc) ? board[lr - dr][lc - dc] : -1;
  var rightE = inBounds(rr + dr, rc + dc) ? board[rr + dr][rc + dc] : -1;
  if (leftE === EMPTY && rightE !== EMPTY) {
    return { r: lr - dr, c: lc - dc };
  }
  if (rightE === EMPTY && leftE !== EMPTY) {
    return { r: rr + dr, c: rc + dc };
  }
  return null;
}

/**
 * 文档规则2：两个冲四须为「不同制胜点」才算独立双威胁；四向扫描下若两路 R4 共用同一成五点则只算一路。
 */
function areIndependentRushFours(board, r, c, color) {
  var seen = {};
  var n = 0;
  var d;
  for (d = 0; d < DIRS.length; d++) {
    var dr = DIRS[d][0];
    var dc = DIRS[d][1];
    var info = getLineRunInfo(board, r, c, dr, dc, color);
    if (classifySegment(info.len, info.leftOpen, info.rightOpen) !== 'R4') {
      continue;
    }
    var w = rushFourWinningCell(board, r, c, dr, dc, color);
    if (!w) continue;
    var k = w.r + ',' + w.c;
    if (!seen[k]) {
      seen[k] = 1;
      n++;
    }
  }
  return n >= 2;
}

/**
 * 假设在 (r,c) 落 color 后的四向棋型统计（用于必应手与排序）
 */
function analyzeMovePattern(board, r, c, color) {
  if (!inBounds(r, c) || board[r][c] !== EMPTY) {
    return null;
  }
  board[r][c] = color;
  var hasWin = checkWin(board, r, c, color);
  var nL4 = 0;
  var nR4 = 0;
  var nL3 = 0;
  var nS3 = 0;
  var nL2 = 0;
  var d;
  for (d = 0; d < DIRS.length; d++) {
    var info = getLineRunInfo(
      board,
      r,
      c,
      DIRS[d][0],
      DIRS[d][1],
      color
    );
    var seg = classifySegment(info.len, info.leftOpen, info.rightOpen);
    if (seg === 'L4') nL4++;
    else if (seg === 'R4') nR4++;
    else if (seg === 'L3') nL3++;
    else if (seg === 'S3') nS3++;
    else if (seg === 'L2') nL2++;
  }
  var independentDR4 = nR4 >= 2 && areIndependentRushFours(board, r, c, color);
  board[r][c] = EMPTY;
  return {
    hasWin: hasWin,
    nL4: nL4,
    nR4: nR4,
    nL3: nL3,
    nS3: nS3,
    nL2: nL2,
    doubleRushFour: nR4 >= 2,
    independentDoubleRushFour: independentDR4,
    doubleLiveThree: nL3 >= 2,
    liveThreeAndRushFour: nL3 >= 1 && nR4 >= 1
  };
}

function shapeThreatScore(a) {
  if (!a) return 0;
  if (a.hasWin) return 100000;
  if (a.independentDoubleRushFour) return 12000;
  if (a.nL4 >= 1) return 10000;
  var v = a.nR4 * 1000 + a.nL3 * 100 + a.nS3 * 25 + a.nL2 * 5;
  var doubleThreat =
    (a.doubleLiveThree || a.liveThreeAndRushFour) && a.nL4 < 1;
  if (doubleThreat) {
    var bump = a.liveThreeAndRushFour ? 1500 : 500;
    if (a.doubleLiveThree && a.liveThreeAndRushFour) {
      bump = 1500;
    }
    v = Math.max(v, bump);
    v *= tune().doubleThreatMult;
  }
  return v;
}

/**
 * 文档：自身进攻 + 对手在该点威胁×权重；双威胁在 shapeThreatScore 中放大进攻侧。
 */
function moveOrderingScore(board, r, c, forColor) {
  var opp = forColor === BLACK ? WHITE : BLACK;
  var my = analyzeMovePattern(board, r, c, forColor);
  var op = analyzeMovePattern(board, r, c, opp);
  if (!my || !op) return -1e9;
  return shapeThreatScore(my) + shapeThreatScore(op) * tune().oppThreatWeight;
}

/** 规则5：同分时天元/星位优先——曼哈顿 + 切比雪夫距中心综合（越大越靠中心） */
function centerTieBreakScore(r, c) {
  var mid = (SIZE - 1) / 2;
  var man = Math.abs(r - mid) + Math.abs(c - mid);
  var cheb = Math.max(Math.abs(r - mid), Math.abs(c - mid));
  return -(man + 0.5 * cheb);
}

function pickBestByCenter(moves) {
  if (!moves || moves.length === 0) return null;
  var best = moves[0];
  var i;
  for (i = 1; i < moves.length; i++) {
    if (centerTieBreakScore(moves[i].r, moves[i].c) > centerTieBreakScore(best.r, best.c)) {
      best = moves[i];
    }
  }
  return best;
}

function allEmptyCells(board) {
  var out = [];
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] === EMPTY) {
        out.push({ r: r, c: c });
      }
    }
  }
  return out;
}

/**
 * 文档第二节优先级 3–6：活四/双冲四、防对方活四/双冲四、双威胁攻防（必应手在必胜/必堵之后）。
 * forcedTiersMax：仅执行层号 ≤ 该值的强制层（默认 6）；设为 4 可弱化双威胁必应手（更易被击败）。
 */
function forcedPriorityMove(board, aiColor) {
  var maxTier = tune().forcedTiersMax;
  if (maxTier < 3) {
    return null;
  }
  var empties = allEmptyCells(board);
  var opp = aiColor === BLACK ? WHITE : BLACK;
  var tier3 = [];
  var i;
  for (i = 0; i < empties.length; i++) {
    var m = empties[i];
    var a = analyzeMovePattern(board, m.r, m.c, aiColor);
    if (!a || a.hasWin) continue;
    if (a.nL4 >= 1 || a.independentDoubleRushFour) {
      tier3.push(m);
    }
  }
  if (tier3.length) {
    return pickBestByCenter(tier3);
  }

  if (maxTier < 4) {
    return null;
  }
  var tier4 = [];
  for (i = 0; i < empties.length; i++) {
    var m4 = empties[i];
    var b = analyzeMovePattern(board, m4.r, m4.c, opp);
    if (b && (b.nL4 >= 1 || b.independentDoubleRushFour)) {
      tier4.push(m4);
    }
  }
  if (tier4.length) {
    return pickBestByCenter(tier4);
  }

  if (maxTier < 5) {
    return null;
  }
  var tier5 = [];
  for (i = 0; i < empties.length; i++) {
    var m5 = empties[i];
    var s = analyzeMovePattern(board, m5.r, m5.c, aiColor);
    if (!s || s.hasWin) continue;
    if (s.nL4 >= 1 || s.independentDoubleRushFour) continue;
    if (s.doubleLiveThree || s.liveThreeAndRushFour) {
      tier5.push(m5);
    }
  }
  if (tier5.length) {
    return pickBestByCenter(tier5);
  }

  if (maxTier < 6) {
    return null;
  }
  var tier6 = [];
  for (i = 0; i < empties.length; i++) {
    var m6 = empties[i];
    var t = analyzeMovePattern(board, m6.r, m6.c, opp);
    if (!t || t.nL4 >= 1 || t.independentDoubleRushFour) continue;
    if (t.doubleLiveThree || t.liveThreeAndRushFour) {
      tier6.push(m6);
    }
  }
  if (tier6.length) {
    return pickBestByCenter(tier6);
  }

  return null;
}

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
        score -= mag * tune().oppThreatWeight;
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
 * 候选落子点：文档规则4——仅「已有棋子周围 2 格」内（切比雪夫距离≤2）；空盘下天元。
 */
function getCandidates(board) {
  var stones = countStones(board);
  if (stones === 0) {
    return [{ r: 7, c: 7 }];
  }

  var ring = tune().candidateRing;
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
    list.sort(function (a, b) {
      return centerTieBreakScore(b.r, b.c) - centerTieBreakScore(a.r, a.c);
    });
  }
  return list;
}

function sortMovesByHeuristic(board, moves, color, desc, maxCandidates) {
  var scored = [];
  var i;
  var stones = countStones(board);
  for (i = 0; i < moves.length; i++) {
    var m = moves[i];
    var s = moveOrderingScore(board, m.r, m.c, color);
    if (stones <= 2) {
      var d0 = minChebyshevDistToNearestStone(board, m.r, m.c);
      if (d0 < 99) {
        s += (6 - d0) * 2;
      }
    }
    scored.push({ m: m, s: s, tie: centerTieBreakScore(m.r, m.c) });
  }
  scored.sort(function (a, b) {
    var ds = desc ? b.s - a.s : a.s - b.s;
    if (Math.abs(ds) > 1e-7) return ds;
    var dt = b.tie - a.tie;
    return desc ? dt : -dt;
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
 * @param {{
 *   rif?: boolean,
 *   dailyDifficulty?: number,
 *   aiTune?: { oppThreatWeight?: number, doubleThreatMult?: number, candidateRing?: number, forcedTiersMax?: number },
 *   oppThreatWeight?: number,
 *   doubleThreatMult?: number,
 *   candidateRing?: number,
 *   forcedTiersMax?: number
 * }|undefined} options 开局库 rif；每日难度；可选 aiTune 或顶层字段调节防守权重、双威胁倍数、候选环、强制优先级层数
 */
function aiMove(board, aiColor, options) {
  var searchDepth = AI_SEARCH_DEPTH;
  var maxCandidates = AI_MAX_CANDIDATES;
  var timeBudget = AI_TIME_BUDGET_MS;
  var tuneMerged = resolveAiTune(options);
  if (options && options.dailyDifficulty != null) {
    var lv = Number(options.dailyDifficulty);
    if (isNaN(lv)) {
      lv = 3;
    }
    if (lv <= 1) {
      searchDepth = 7;
      maxCandidates = 26;
      timeBudget = 600;
      tuneMerged.oppThreatWeight = Math.min(tuneMerged.oppThreatWeight, 1.15);
      tuneMerged.doubleThreatMult = Math.min(tuneMerged.doubleThreatMult, 3);
      tuneMerged.forcedTiersMax = Math.min(tuneMerged.forcedTiersMax, 4);
    } else if (lv === 2) {
      searchDepth = 9;
      maxCandidates = 34;
      timeBudget = 1200;
      tuneMerged.forcedTiersMax = Math.min(tuneMerged.forcedTiersMax, 5);
    } else {
      searchDepth = 12;
      maxCandidates = 42;
      timeBudget = 2400;
    }
  }
  currentAiTune = tuneMerged;
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

    var forced = forcedPriorityMove(board, aiColor);
    if (forced) {
      return forced;
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
    currentAiTune = null;
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
  inBounds: inBounds,
  DEFAULT_AI_TUNE: DEFAULT_AI_TUNE
};
