/**
 * 五子棋开局：26 种「星月」命名（直指 13 + 斜指 13）、RIF 限定（白 2 在中心 3×3、黑 3 在 5×5），
 * 以及自由规则下的远距离分支。连珠交换由 main.js 处理，不在此模块。
 */

var SIZE = 15;
var EMPTY = 0;
var BLACK = 1;
var WHITE = 2;

var CENTER_R = 7;
var CENTER_C = 7;

/** 直指 13 局名称（与 Wikipedia / RIF 直指 1D–13D 顺序一致） */
var NAMES_DIRECT = [
  '寒星',
  '溪月',
  '疏星',
  '花月',
  '残月',
  '雨月',
  '金星',
  '松月',
  '丘月',
  '新月',
  '瑞星',
  '山月',
  '游星'
];

/** 斜指 13 局名称 */
var NAMES_DIAG = [
  '长星',
  '峡月',
  '恒星',
  '水月',
  '流星',
  '云月',
  '浦月',
  '岚月',
  '银月',
  '明星',
  '斜月',
  '名月',
  '彗星'
];

/** 直指：白 2 沿过天元的竖线（向下 7 格 + 向右 6 格，共 13 点，不含天元） */
var WHITE_DIRECT = [
  { r: 8, c: 7 },
  { r: 9, c: 7 },
  { r: 10, c: 7 },
  { r: 11, c: 7 },
  { r: 12, c: 7 },
  { r: 13, c: 7 },
  { r: 14, c: 7 },
  { r: 7, c: 8 },
  { r: 7, c: 9 },
  { r: 7, c: 10 },
  { r: 7, c: 11 },
  { r: 7, c: 12 },
  { r: 7, c: 13 }
];

/** 斜指：白 2 沿主斜线（↘ 7 格 + ↗ 方向 6 格） */
var WHITE_DIAG = [
  { r: 8, c: 8 },
  { r: 9, c: 9 },
  { r: 10, c: 10 },
  { r: 11, c: 11 },
  { r: 12, c: 12 },
  { r: 13, c: 13 },
  { r: 14, c: 14 },
  { r: 6, c: 8 },
  { r: 5, c: 9 },
  { r: 4, c: 10 },
  { r: 3, c: 11 },
  { r: 2, c: 12 },
  { r: 1, c: 13 }
];

/**
 * 规范：白在「正下」(8,7) 时黑 3 的 13 种候选（5×5 内常见定式点，序号对应直指名称表）
 * 若某点已被占则后续逻辑会跳过。
 */
var BLACK3_DIRECT_CANON = [
  { r: 9, c: 7 },
  { r: 10, c: 7 },
  { r: 5, c: 7 },
  { r: 6, c: 6 },
  { r: 6, c: 8 },
  { r: 9, c: 5 },
  { r: 9, c: 9 },
  { r: 5, c: 5 },
  { r: 5, c: 9 },
  { r: 6, c: 9 },
  { r: 8, c: 5 },
  { r: 8, c: 9 },
  { r: 4, c: 7 }
];

/**
 * 规范：白在「右下斜」(8,8) 时黑 3 的 13 种候选
 */
var BLACK3_DIAG_CANON = [
  { r: 9, c: 8 },
  { r: 8, c: 9 },
  { r: 9, c: 9 },
  { r: 10, c: 8 },
  { r: 8, c: 10 },
  { r: 10, c: 10 },
  { r: 6, c: 6 },
  { r: 6, c: 8 },
  { r: 8, c: 6 },
  { r: 10, c: 6 },
  { r: 6, c: 10 },
  { r: 5, c: 7 },
  { r: 7, c: 5 }
];

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function countStones(board) {
  var n = 0;
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) {
        n++;
      }
    }
  }
  return n;
}

function collectColor(board, color) {
  var out = [];
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] === color) {
        out.push({ r: r, c: c });
      }
    }
  }
  return out;
}

function findStone(board, color) {
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      if (board[r][c] === color) {
        return { r: r, c: c };
      }
    }
  }
  return null;
}

/** 是否为天元 */
function isTengen(r, c) {
  return r === CENTER_R && c === CENTER_C;
}

/** RIF：白 2 须与天元相邻（八邻） */
function isAdjacentToCenter(r, c) {
  return Math.abs(r - CENTER_R) <= 1 && Math.abs(c - CENTER_C) <= 1 && !isTengen(r, c);
}

/** RIF：黑 3 须在中心 5×5 */
function inCenter5(r, c) {
  return r >= 5 && r <= 9 && c >= 5 && c <= 9;
}

/** 绕天元逆时针 90°，重复 q 次 */
function rotateAroundCenter(r, c, q) {
  var dr = r - CENTER_R;
  var dc = c - CENTER_C;
  var t;
  for (t = 0; t < q; t++) {
    var ndr = -dc;
    var ndc = dr;
    dr = ndr;
    dc = ndc;
  }
  return { r: CENTER_R + dr, c: CENTER_C + dc };
}

/** 直指：白邻接天元时，求 q 使 rotate((8,7),q) === W */
function quartersForDirectWhite(wr, wc) {
  var q;
  for (q = 0; q < 4; q++) {
    var p = rotateAroundCenter(8, 7, q);
    if (p.r === wr && p.c === wc) {
      return q;
    }
  }
  return -1;
}

/** 斜指：白邻接天元时，求 q 使 rotate((8,8),q) === W */
function quartersForDiagWhite(wr, wc) {
  var q;
  for (q = 0; q < 4; q++) {
    var p = rotateAroundCenter(8, 8, q);
    if (p.r === wr && p.c === wc) {
      return q;
    }
  }
  return -1;
}

function pickBlackThirdFromTable(board, w, black3Canon, q) {
  var idx;
  for (idx = 0; idx < black3Canon.length; idx++) {
    var p = black3Canon[idx];
    var abs = rotateAroundCenter(p.r, p.c, q);
    if (
      inBounds(abs.r, abs.c) &&
      board[abs.r][abs.c] === EMPTY &&
      inCenter5(abs.r, abs.c)
    ) {
      return abs;
    }
  }
  return null;
}

function hashBoardOpening(board) {
  var h = 0;
  var r;
  var c;
  for (r = 0; r < SIZE; r++) {
    for (c = 0; c < SIZE; c++) {
      h = (h * 31 + board[r][c]) | 0;
    }
  }
  return Math.abs(h);
}

/**
 * 白 2：在 RIF 下从 8 邻中选；自由模式下从 26 点中选。
 */
function whiteSecondMove(board, blackPos, options) {
  var rif = options.rif !== false;
  var br = blackPos.r;
  var bc = blackPos.c;
  if (!isTengen(br, bc)) {
    return null;
  }

  var list;
  var count;
  if (rif) {
    list = [];
    var orth = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ];
    var diag = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ];
    var i;
    for (i = 0; i < orth.length; i++) {
      var r = br + orth[i][0];
      var c = bc + orth[i][1];
      if (inBounds(r, c) && board[r][c] === EMPTY) {
        list.push({ r: r, c: c });
      }
    }
    for (i = 0; i < diag.length; i++) {
      var r2 = br + diag[i][0];
      var c2 = bc + diag[i][1];
      if (inBounds(r2, c2) && board[r2][c2] === EMPTY) {
        list.push({ r: r2, c: c2 });
      }
    }
    count = list.length;
  } else {
    list = WHITE_DIRECT.concat(WHITE_DIAG);
    count = list.length;
  }

  if (count === 0) {
    return null;
  }
  var h = hashBoardOpening(board);
  return list[h % count];
}

/** 沿黑白与天元共线时，向白子外侧延伸一手（寒星类） */
function extendPastWhite(b, w) {
  var r = 2 * w.r - b.r;
  var c = 2 * w.c - b.c;
  return { r: r, c: c };
}

/** 天元对称点 2*天元 - 白 */
function reflectWhiteThroughCenter(b, w) {
  var r = 2 * CENTER_R - w.r;
  var c = 2 * CENTER_C - w.c;
  return { r: r, c: c };
}

function blackThirdFallback(board, b, w) {
  var mv = extendPastWhite(b, w);
  if (inBounds(mv.r, mv.c) && board[mv.r][mv.c] === EMPTY) {
    return mv;
  }
  if (!(Math.abs(w.r - b.r) <= 1 && Math.abs(w.c - b.c) <= 1)) {
    mv = reflectWhiteThroughCenter(b, w);
    if (inBounds(mv.r, mv.c) && board[mv.r][mv.c] === EMPTY) {
      return mv;
    }
  }
  var dr = w.r - b.r;
  var dc = w.c - b.c;
  if (dr === 0 && dc === 0) {
    return null;
  }
  var cand = [];
  cand.push({ r: b.r - dr, c: b.c - dc });
  cand.push({ r: b.r + dr * 2, c: b.c + dc * 2 });
  cand.push({ r: b.r + dc, c: b.c + dr });
  cand.push({ r: b.r - dc, c: b.c - dr });
  var i;
  for (i = 0; i < cand.length; i++) {
    var p = cand[i];
    if (inBounds(p.r, p.c) && board[p.r][p.c] === EMPTY) {
      return p;
    }
  }
  return null;
}

function classifyWhiteKind(wr, wc) {
  var dr = wr - CENTER_R;
  var dc = wc - CENTER_C;
  if (dr !== 0 && dc !== 0) {
    if (Math.abs(dr) === Math.abs(dc)) {
      return 'diag';
    }
    return 'mixed';
  }
  return 'direct';
}

function blackThirdMove(board, b, w, options) {
  var rif = options.rif !== false;
  var kind = classifyWhiteKind(w.r, w.c);

  if (rif && !isAdjacentToCenter(w.r, w.c)) {
    return blackThirdFallback(board, b, w);
  }

  var table;
  var q;
  if (kind === 'diag') {
    table = BLACK3_DIAG_CANON;
    q = quartersForDiagWhite(w.r, w.c);
  } else if (kind === 'direct') {
    table = BLACK3_DIRECT_CANON;
    q = quartersForDirectWhite(w.r, w.c);
  } else {
    return blackThirdFallback(board, b, w);
  }

  if (q < 0) {
    return blackThirdFallback(board, b, w);
  }

  var mv = pickBlackThirdFromTable(board, w, table, q);
  if (mv) {
    return mv;
  }

  mv = extendPastWhite(b, w);
  if (
    inBounds(mv.r, mv.c) &&
    board[mv.r][mv.c] === EMPTY &&
    (!rif || inCenter5(mv.r, mv.c))
  ) {
    return mv;
  }

  mv = reflectWhiteThroughCenter(b, w);
  if (
    inBounds(mv.r, mv.c) &&
    board[mv.r][mv.c] === EMPTY &&
    (!rif || inCenter5(mv.r, mv.c))
  ) {
    return mv;
  }

  return blackThirdFallback(board, b, w);
}

/**
 * @param {number[][]} board
 * @param {number} aiColor BLACK | WHITE
 * @param {{rif?: boolean}|undefined} options — rif 默认 true（连珠式限定）；false 时白 2 可走 26 点远点
 */
function getJosekiMove(board, aiColor, options) {
  options = options || {};
  var stones = countStones(board);

  if (stones === 0 && aiColor === BLACK) {
    return { r: CENTER_R, c: CENTER_C };
  }

  if (stones === 1 && aiColor === WHITE) {
    var bOnly = findStone(board, BLACK);
    if (bOnly) {
      return whiteSecondMove(board, bOnly, options);
    }
    return null;
  }

  if (stones === 2 && aiColor === BLACK) {
    var bs = collectColor(board, BLACK);
    var ws = collectColor(board, WHITE);
    if (bs.length === 1 && ws.length === 1) {
      var b = bs[0];
      var w = ws[0];
      return blackThirdMove(board, b, w, options);
    }
  }

  return null;
}

module.exports = {
  getJosekiMove: getJosekiMove,
  SIZE: SIZE,
  EMPTY: EMPTY,
  BLACK: BLACK,
  WHITE: WHITE,
  NAMES_DIRECT: NAMES_DIRECT,
  NAMES_DIAG: NAMES_DIAG,
  CENTER_R: CENTER_R,
  CENTER_C: CENTER_C
};
