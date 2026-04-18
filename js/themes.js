/**
 * 界面风格：柔和渐变底 / 深色主按钮 / 高对比标题（棋院质感；青瓷 / 水墨为解锁主题，全屏与匹配页跟随后台所选）
 * 设计稿宽度 750rpx（与 main 中 rpx() 一致）。
 * 檀木 classic 与青瓷 mint、水墨 ink 各有一套色板，互不覆盖。
 */
var STORAGE_KEY = 'gomoku_theme_id';
/** 棋盘技能槽（短剑）：与后端 user_equipped_cosmetics.BOARD_SKILL item_id dagger 一致 */
var BOARD_SKILL_STORAGE_KEY = 'gomoku_board_skill_id_v1';
var LEGACY_DAGGER_SKILL_EQUIPPED_KEY = 'gomoku_dagger_skill_equipped_v1';

var THEMES = {
  mint: {
    id: 'mint',
    name: '青瓷',
    /** 乳白青釉底：米青偏暖，与棋盘乳白釉/钴青框一体，避免与高饱和湖水青割裂 */
    bg: ['#e8f4f1', '#dfeee9', '#f1f7f5'],
    title: '#143942',
    subtitle: '#3a5862',
    muted: '#5c7680',
    homeCards: ['#1f5664', '#2e7586', '#44919f'],
    /** 首页「人机 / 好友」主按钮（与 homeCards 前两色一致，单列避免与其它用途混淆） */
    homePve: '#1f5664',
    homeFriend: '#2e7586',
    btnPrimary: '#1f5664',
    btnPrimaryStroke: 'rgba(255,255,255,0.42)',
    btnShadow: 'rgba(12, 52, 64, 0.2)',
    btnGhostFill: 'rgba(255,255,255,0.85)',
    btnGhostStroke: 'rgba(255,255,255,0.94)',
    btnGhostText: '#3d5664',
    /** 匹配页「正在寻找对手…」动画点，与檀木分页点同级用途 */
    pageIndicator: '#44919f',
    result: {
      defaultEnd: '#f0f7f5',
      win: { bg: '#cce8e4', title: '#134c56' },
      lose: { bg: '#dfe8ec', title: '#2c4552' },
      draw: { bg: '#ecf0ee', title: '#5c5a48' },
      sub: '#627888',
      secondaryFill: 'rgba(255,255,255,0.64)',
      secondaryStroke: 'rgba(255,255,255,0.92)',
      secondaryText: '#465a68'
    },
    /* 盘面：乳白青釉；格线/星位与首页主色同系 */
    board: {
      g0: '#eef6f4',
      g1: '#dae8e8',
      line: '#7299a0',
      star: '#2f6570',
      gridLineWidth: 1
    },
    pieces: {
      black: {
        g0: '#4a5058',
        gm: '#1a1c22',
        g1: '#060608',
        stroke: 'rgba(255,255,255,0.22)'
      },
      white: {
        g0: '#fffffc',
        gm: '#e8eef0',
        g1: '#c8d4dc',
        stroke: '#6d8a96'
      }
    },
    status: '#284854',
    hint: '#5c7884'
  },
  classic: {
    id: 'classic',
    name: '檀木',
    /**
     * 页面背景：暖杏米渐变（比纯灰米更活泼，与棕色按钮仍同色系）
     */
    bg: ['#FFF0E4', '#FFF6ED', '#FFFCF9'],
    title: '#2c2620',
    subtitle: '#5c4e42',
    muted: '#948878',
    /** 设计稿：随机 #F5F3F2 / #5E524D；好友 #7B5E3F；人机 #5C4738 */
    homeCards: ['#5C4738', '#7B5E3F', '#6A5545'],
    homePve: '#5C4738',
    homeFriend: '#7B5E3F',
    btnPrimary: '#5C4738',
    btnPrimaryStroke: 'rgba(255,255,255,0.36)',
    btnShadow: 'rgba(60, 48, 38, 0.16)',
    btnGhostFill: '#F5F3F2',
    btnGhostStroke: 'rgba(94, 82, 77, 0.18)',
    btnGhostText: '#5E524D',
    /** 分页/加载指示（如匹配页动画点） */
    pageIndicator: '#E0B896',
    result: {
      defaultEnd: '#faf6f0',
      win: { bg: '#e0edd8', title: '#1b5e20' },
      lose: { bg: '#f0e8e4', title: '#8b4040' },
      draw: { bg: '#f5ecd8', title: '#a65c18' },
      sub: '#8a7868',
      secondaryFill: 'rgba(255,255,255,0.6)',
      secondaryStroke: 'rgba(255,255,255,0.88)',
      secondaryText: '#4a3828'
    },
    /* 蜜棕实木盘（略深）；格线浅暖灰棕 */
    board: {
      g0: '#e0d4c0',
      g1: '#b09068',
      line: '#8f8072',
      star: '#8f8072',
      gridLineWidth: 1.4
    },
    pieces: {
      black: {
        g0: '#4a4e52',
        gm: '#222428',
        g1: '#060608',
        stroke: 'rgba(255,255,255,0.15)'
      },
      white: {
        g0: '#fffffe',
        gm: '#ece8e4',
        g1: '#b8b4b0',
        stroke: '#8a7a70'
      }
    },
    status: '#3a3028',
    hint: '#887868'
  },
  ink: {
    id: 'ink',
    name: '水墨',
    /* 暖宣纸：带浅杏色，避免发灰发闷 */
    bg: ['#fff9f2', '#f4ebe0', '#e9dfd2'],
    title: '#242018',
    subtitle: '#585046',
    muted: '#857a70',
    /** 人机深墨、好友浅赭灰，层次拉开 */
    homeCards: ['#221c18', '#8f8578', '#5a524a'],
    homePve: '#221c18',
    homeFriend: '#8f8578',
    btnPrimary: '#221c18',
    btnPrimaryStroke: 'rgba(255,255,255,0.3)',
    btnShadow: 'rgba(28, 20, 14, 0.16)',
    btnGhostFill: 'rgba(255,252,246,0.88)',
    btnGhostStroke: 'rgba(255,255,255,0.92)',
    btnGhostText: '#524a42',
    /** 匹配页加载动画点，与青瓷 / 檀木同级（浅赭灰点缀） */
    pageIndicator: '#8f8578',
    result: {
      defaultEnd: '#f2ede4',
      win: { bg: '#e0e4dc', title: '#2d3d32' },
      lose: { bg: '#ebe4de', title: '#5a4038' },
      draw: { bg: '#eee8e0', title: '#5a5048' },
      sub: '#6a625c',
      secondaryFill: 'rgba(255,255,255,0.62)',
      secondaryStroke: 'rgba(255,255,255,0.9)',
      secondaryText: '#4a433e'
    },
    /* 格线/星位：暖灰墨，贴近 render 中水墨盘外框 rgba(42,38,34) 系 */
    board: {
      g0: '#f4f0e8',
      g1: '#e8e2d8',
      line: '#726c64',
      star: '#4f4840',
      gridLineWidth: 1
    },
    pieces: {
      black: {
        g0: '#4a4542',
        gm: '#262422',
        g1: '#0c0c0a',
        stroke: 'rgba(255,255,255,0.08)'
      },
      white: {
        g0: '#faf8f4',
        gm: '#ebe6de',
        g1: '#d4cec4',
        stroke: '#8a8478'
      }
    },
    status: '#3a3632',
    hint: '#7a7268'
  }
};

/** 仅檀木必带；青瓷 / 水墨在解锁后由 {@link getThemeIdsForCycling} 追加 */
var THEME_IDS = ['classic'];

/**
 * 棋子皮肤：与「界面风格」正交，只覆盖 theme.pieces 的渐变与描边（及可选光照风格）。
 * default=沿用当前界面主题自带的 pieces；其余套在基底主题之上合并。
 */
var PIECE_SKIN_STORAGE_KEY = 'gomoku_piece_skin_id';

var PIECE_SKINS = {
  default: {
    id: 'default',
    name: '随界面',
    followTheme: true
  },
  /** 标准围棋风：纯渐变黑白子，无贴图 */
  basic: {
    id: 'basic',
    name: '基础黑白',
    black: {
      g0: '#3d3d3d',
      gm: '#1a1a1a',
      g1: '#050505',
      stroke: 'rgba(255,255,255,0.14)'
    },
    white: {
      g0: '#ffffff',
      gm: '#f2f2f2',
      g1: '#d8d8d8',
      stroke: '#888888'
    }
  },
  /** 偏蓝灰胎、黑子厚实透亮 */
  yunzi: {
    id: 'yunzi',
    name: '云子',
    black: {
      g0: '#5a5e66',
      gm: '#2c3038',
      g1: '#0c0e12',
      stroke: 'rgba(255,255,255,0.22)'
    },
    white: {
      g0: '#fffffc',
      gm: '#eef1f6',
      g1: '#c4cad4',
      stroke: '#6a7a8a'
    }
  },
  /** 黑子微青绿、白子偏暖玉 */
  jade: {
    id: 'jade',
    name: '翠玉',
    black: {
      g0: '#3d524c',
      gm: '#1a2a24',
      g1: '#060c0a',
      stroke: 'rgba(200,230,215,0.2)'
    },
    white: {
      g0: '#f9fbf9',
      gm: '#e6ebe7',
      g1: '#b8c4bc',
      stroke: '#5a7268'
    }
  },
  /** 哑光墨感，与水墨界面协调；强制 ink 光照分支 */
  inkstone: {
    id: 'inkstone',
    name: '墨玉',
    stoneShading: 'ink',
    black: {
      g0: '#454240',
      gm: '#242220',
      g1: '#0c0c0a',
      stroke: 'rgba(255,255,255,0.08)'
    },
    white: {
      g0: '#faf8f4',
      gm: '#ebe6de',
      g1: '#d4cec4',
      stroke: '#8a8478'
    }
  },
  /**
   * 贴图棋子：黑白各一张 PNG（images/pieces/tuan-black.png / tuan-white.png）
   * 资源未加载时回退为下方渐变 + 描边
   */
  tuan_moe: {
    id: 'tuan_moe',
    name: '团团萌肤',
    /** 棋盘：尽量占满格距；贴图放大使角色贴近裁切圆，减少格内「缝隙感」 */
    pieceBoardRadiusCell: 0.495,
    pieceTextureDrawScale: 2.05,
    pieceTextureBlack: 'images/pieces/tuan-black.png',
    pieceTextureWhite: 'images/pieces/tuan-white.png',
    black: {
      g0: '#2a2826',
      gm: '#141210',
      g1: '#080604',
      stroke: 'rgba(255,235,210,0.18)'
    },
    white: {
      g0: '#faf8f4',
      gm: '#eeeae6',
      g1: '#dcd6d0',
      stroke: 'rgba(120, 98, 78, 0.35)'
    },
    /**
     * 对手上一手：环半径按「角色可视外轮廓」取 pr 的比例（非裁切圆边缘）。
     * 贴图在圆内有留白时，0.98 会环在角色外造成缝隙，需明显小于 1。
     */
    opponentLastMoveMarker: {
      ringRadiusMul: 0.79,
      lineWidthPr: 0.088,
      blackStroke: '#6ec8ff',
      whiteStroke: '#0f7ae8',
      shadowBlack: 'rgba(90, 170, 255, 0.55)',
      shadowWhite: 'rgba(20, 110, 220, 0.35)'
    },
    /**
     * 五子连珠胜：半径按角色轮廓（小于 pr 倍率贴近贴图），光晕外扩缩小以免五子连成一片糊带
     */
    winningLineHighlight: {
      glowOuterMul: 1.18,
      glowGradientInnerMul: 0.76,
      ringPrimaryMul: 0.86,
      ringSecondaryMul: 0.8,
      primaryLineWidthPr: 0.092,
      secondaryLineWidthPr: 0.05,
      primaryShadowBlurPr: 0.2
    }
  },
  /**
   * 贴图棋子：黑=青萄、白=荔白；其余与 tuan_moe 一致（半径/缩放/回退渐变/标记/胜线）
   */
  qingtao_libai: {
    id: 'qingtao_libai',
    name: '青萄荔白',
    pieceBoardRadiusCell: 0.495,
    /**
     * 贴图内球体占画布比例小于 tuan 图（约 0.30 vs 0.41），同 2.05 会显小；
     * 提高缩放使与团团萌肤棋子视觉大小一致。
     */
    pieceTextureDrawScale: 2.83,
    pieceTextureBlack: 'images/pieces/fruit1.png',
    pieceTextureWhite: 'images/pieces/fruit2.png',
    black: {
      g0: '#2a2826',
      gm: '#141210',
      g1: '#080604',
      stroke: 'rgba(255,235,210,0.18)'
    },
    white: {
      g0: '#faf8f4',
      gm: '#eeeae6',
      g1: '#dcd6d0',
      stroke: 'rgba(120, 98, 78, 0.35)'
    },
    /**
     * 环半径：按「圆形裁切内」不透明像素相对质心的最大距离 / pr ≈ 0.88，
     * 使蓝环与果子外轮廓贴合（此前 ~0.55 环落在果子内侧）。
     * 质心：裁切圆内加权质心（与棋盘贴图可见区域一致）。
     */
    opponentLastMoveMarker: {
      ringRadiusMul: 0.87,
      /** 质心相对交点有位移，环过大时会画出棋子圆外；黑子偏移更大故上限略低 */
      ringRadiusMulBlack: 0.868,
      ringRadiusMulWhite: 0.888,
      markerCenterOffsetXMulBlack: -0.010695,
      markerCenterOffsetYMulBlack: -0.045484,
      markerCenterOffsetXMulWhite: -0.001757,
      markerCenterOffsetYMulWhite: -0.038548,
      lineWidthPr: 0.055,
      blackStroke: '#6ec8ff',
      whiteStroke: '#0f7ae8',
      shadowBlack: 'rgba(90, 170, 255, 0.42)',
      shadowWhite: 'rgba(20, 110, 220, 0.28)',
      shadowBlurBlackPr: 0.1,
      shadowBlurWhitePr: 0.072
    },
    winningLineHighlight: {
      glowOuterMul: 1.12,
      glowGradientInnerMul: 0.72,
      ringPrimaryMul: 0.868,
      ringSecondaryMul: 0.805,
      primaryLineWidthPr: 0.092,
      secondaryLineWidthPr: 0.05,
      primaryShadowBlurPr: 0.2
    }
  }
};

/** 已开放可持久化的皮肤 id；与目录中 rowStatus: owned 一致 */
var PIECE_SKIN_IDS = ['basic', 'tuan_moe', 'qingtao_libai'];

/** 杂货铺装备种类：与后端 CosmeticCategory 对应（小写便于 JSON）；每类同时只穿戴一件 */
var SHOP_CATEGORY_PIECE_SKIN = 'piece_skin';
var SHOP_CATEGORY_THEME = 'theme';
var SHOP_CATEGORY_CONSUMABLE = 'consumable';

/** 杂货铺短剑：无 GET /api/me/shop/catalog 时的兜底，与后端 ShopPricingService legacy 一致 */
var CONSUMABLE_DAGGER_COST_POINTS = 2;

/** GET /api/me/shop/catalog 同步的 itemCode → 当前积分价（ACTIVITY_POINTS）；未拉取时用行内 fallback 常量 */
var shopCatalogPointsByItemCode = {};

var consumableDaggerCountServerCache = 0;

function setConsumableDaggerCountFromServer(n) {
  if (typeof n === 'number' && !isNaN(n)) {
    consumableDaggerCountServerCache = Math.max(0, Math.floor(n));
  } else {
    consumableDaggerCountServerCache = 0;
  }
}

function getConsumableDaggerCount() {
  return consumableDaggerCountServerCache;
}

function loadSavedBoardSkillId() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var raw = wx.getStorageSync(BOARD_SKILL_STORAGE_KEY);
      if (raw === 'dagger') {
        return 'dagger';
      }
      if (raw === 'off') {
        return null;
      }
      var leg = wx.getStorageSync(LEGACY_DAGGER_SKILL_EQUIPPED_KEY);
      if (leg === true || leg === 'true' || leg === 1 || leg === '1') {
        try {
          wx.setStorageSync(BOARD_SKILL_STORAGE_KEY, 'dagger');
        } catch (eM) {}
        try {
          wx.removeStorageSync(LEGACY_DAGGER_SKILL_EQUIPPED_KEY);
        } catch (eR) {}
        return 'dagger';
      }
      if (leg === false || leg === 'false' || leg === 0 || leg === '0') {
        try {
          wx.setStorageSync(BOARD_SKILL_STORAGE_KEY, 'off');
        } catch (eM2) {}
        try {
          wx.removeStorageSync(LEGACY_DAGGER_SKILL_EQUIPPED_KEY);
        } catch (eR2) {}
        return null;
      }
    }
  } catch (e) {}
  return null;
}

var boardSkillIdCache = loadSavedBoardSkillId();

function getBoardSkillId() {
  return boardSkillIdCache;
}

function isDaggerSkillEquipped() {
  return boardSkillIdCache === 'dagger';
}

function saveBoardSkillId(id) {
  boardSkillIdCache = id === 'dagger' ? 'dagger' : null;
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(
        BOARD_SKILL_STORAGE_KEY,
        boardSkillIdCache === 'dagger' ? 'dagger' : 'off'
      );
    }
  } catch (e) {}
}

/** 登录后 GET /api/me/rating 的 daggerSkillEquipped：与装备槽 BOARD_SKILL 一致 */
function applyDaggerSkillEquippedFromServer(equipped) {
  saveBoardSkillId(equipped ? 'dagger' : null);
}

/** 杂货铺列表（双列 4 行，每页 8 格） */
var PIECE_SKINS_PER_PAGE = 8;

/**
 * 「团团萌肤」是否已解锁：由服务端 users.piece_skin_tuan_moe_unlocked 决定，
 * 经 GET /api/me/rating 或 POST /api/me/checkin 同步到内存（不写本地解锁标记）。
 */
var tuanMoeUnlockedServerCache = false;

/** 连续签到天数（与 CheckinService streak 一致），用于团团萌肤解锁提示 */
var checkinStreakServerCache = 0;

/** 解锁团团萌肤所需连续签到天数（与后端一致） */
var TUAN_MOE_UNLOCK_STREAK_DAYS = 7;

function setTuanMoeUnlockedFromServer(unlocked) {
  tuanMoeUnlockedServerCache = !!unlocked;
}

function setCheckinStreakFromServer(streak) {
  if (typeof streak === 'number' && !isNaN(streak)) {
    checkinStreakServerCache = Math.max(0, Math.floor(streak));
  } else {
    checkinStreakServerCache = 0;
  }
}

function isTuanMoeUnlocked() {
  return tuanMoeUnlockedServerCache;
}

/** 未解锁时底部文案：有进度则显示「已连签X天，还需Y天」 */
function tuanMoeLockedUnlockHint() {
  var need = TUAN_MOE_UNLOCK_STREAK_DAYS;
  var s = checkinStreakServerCache;
  if (s > 0 && s < need) {
    var rest = need - s;
    return '已连签' + s + '天，还需' + rest + '天';
  }
  return '连签7天解锁';
}

/**
 * 积分兑换类棋子皮肤：由 GET /api/me/rating 的 pieceSkinUnlockedIds 同步（不写本地解锁标记）。
 */
var pieceSkinUnlockedIdSet = {};

/** 与 PieceSkinRedeemService 中定价一致 */
var PIECE_SKIN_QINGTAO_LIBAI_COST_POINTS = 200;
/** 杂货铺：青瓷 / 水墨棋盘，与后端 PieceSkinRedeemService 一致 */
var THEME_SHOP_COST_POINTS = 200;

function setPieceSkinUnlockedIdsFromServer(ids) {
  pieceSkinUnlockedIdSet = {};
  if (!Array.isArray(ids)) {
    return;
  }
  var i;
  for (i = 0; i < ids.length; i++) {
    var sid = ids[i];
    if (sid) {
      pieceSkinUnlockedIdSet[String(sid)] = true;
    }
  }
}

function isPieceSkinUnlockedOnServer(skinId) {
  return !!(skinId && pieceSkinUnlockedIdSet[skinId]);
}

/**
 * 将 GET /api/me/shop/catalog 的 body 写入内存价表（覆盖式）。
 * @param {{ items?: Array<{ itemCode?: string, priceAmount?: number, currency?: string }> }} d
 */
function applyShopCatalogFromServerPayload(d) {
  if (!d || typeof d !== 'object') {
    return;
  }
  var items = d.items;
  if (!Array.isArray(items)) {
    return;
  }
  var map = {};
  var i;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || typeof it !== 'object') {
      continue;
    }
    var code = it.itemCode;
    if (!code) {
      continue;
    }
    var cur = it.currency;
    if (cur && cur !== 'ACTIVITY_POINTS') {
      continue;
    }
    var amt = it.priceAmount;
    if (typeof amt !== 'number' || isNaN(amt) || amt < 0) {
      continue;
    }
    map[String(code)] = Math.max(0, Math.floor(amt));
  }
  shopCatalogPointsByItemCode = map;
}

function pointsCostFromShopCatalog(itemCode, fallback) {
  if (
    itemCode &&
    shopCatalogPointsByItemCode &&
    Object.prototype.hasOwnProperty.call(shopCatalogPointsByItemCode, itemCode)
  ) {
    return shopCatalogPointsByItemCode[itemCode];
  }
  return fallback;
}

/** 首页循环切换：檀木 + 已解锁的棋盘风格 */
function getThemeIdsForCycling() {
  var ids = ['classic'];
  if (isPieceSkinUnlockedOnServer('mint')) {
    ids.push('mint');
  }
  if (isPieceSkinUnlockedOnServer('ink')) {
    ids.push('ink');
  }
  return ids;
}

function getShopCategory(entry) {
  if (!entry || typeof entry !== 'object') {
    return SHOP_CATEGORY_PIECE_SKIN;
  }
  if (entry.shopCategory === SHOP_CATEGORY_CONSUMABLE || entry.kind === 'consumable') {
    return SHOP_CATEGORY_CONSUMABLE;
  }
  if (entry.shopCategory === SHOP_CATEGORY_THEME || entry.kind === 'theme') {
    return SHOP_CATEGORY_THEME;
  }
  return SHOP_CATEGORY_PIECE_SKIN;
}

function getPieceSkinCatalog() {
  var tuanOk = isTuanMoeUnlocked();
  var qingOk = isPieceSkinUnlockedOnServer('qingtao_libai');
  var mintOk = isPieceSkinUnlockedOnServer('mint');
  var inkOk = isPieceSkinUnlockedOnServer('ink');
  return [
    {
      id: 'basic',
      shopCategory: SHOP_CATEGORY_PIECE_SKIN,
      locked: false,
      label: '基础黑白',
      rowStatus: 'owned'
    },
    {
      id: 'tuan_moe',
      shopCategory: SHOP_CATEGORY_PIECE_SKIN,
      locked: !tuanOk,
      label: '团团萌肤',
      rowStatus: tuanOk ? 'owned' : 'locked',
      unlockHint: tuanOk ? undefined : tuanMoeLockedUnlockHint()
    },
    {
      id: 'qingtao_libai',
      shopCategory: SHOP_CATEGORY_PIECE_SKIN,
      locked: !qingOk,
      label: '青萄荔白',
      rowStatus: qingOk ? 'owned' : 'points',
      costPoints: qingOk ? 0 : PIECE_SKIN_QINGTAO_LIBAI_COST_POINTS
    },
    {
      kind: 'theme',
      shopCategory: SHOP_CATEGORY_THEME,
      id: 'mint',
      locked: !mintOk,
      label: '青瓷',
      rowStatus: mintOk ? 'owned' : 'points',
      costPoints: mintOk ? 0 : THEME_SHOP_COST_POINTS
    },
    {
      kind: 'theme',
      shopCategory: SHOP_CATEGORY_THEME,
      id: 'ink',
      locked: !inkOk,
      label: '水墨',
      rowStatus: inkOk ? 'owned' : 'points',
      costPoints: inkOk ? 0 : THEME_SHOP_COST_POINTS
    },
    {
      kind: 'consumable',
      consumableKind: 'dagger',
      shopCategory: SHOP_CATEGORY_CONSUMABLE,
      id: 'dagger_skill',
      locked: false,
      label: '短剑',
      rowStatus: 'points',
      costPoints: CONSUMABLE_DAGGER_COST_POINTS
    }
  ];
}

function getPieceSkinCatalogLabel(entry) {
  if (!entry) {
    return '';
  }
  if (entry.kind === 'consumable' && entry.id === 'dagger_skill') {
    return '短剑';
  }
  if (entry.label) {
    return entry.label;
  }
  if (entry.id && PIECE_SKINS[entry.id]) {
    return PIECE_SKINS[entry.id].name || entry.id;
  }
  return '敬请期待';
}

/** 仅「已拥有」且可选择的皮肤可写入本地，避免锁位/占位 id 被保存 */
function pieceSkinIdIsPersistable(id) {
  if (!id || !PIECE_SKINS[id] || PIECE_SKINS[id].followTheme) {
    return false;
  }
  var cat = getPieceSkinCatalog();
  var i;
  for (i = 0; i < cat.length; i++) {
    var e = cat[i];
    if (e.id === id && e.rowStatus === 'owned' && !e.locked) {
      return true;
    }
  }
  return false;
}

function shallowCopyTheme(t) {
  var out = {};
  var k;
  for (k in t) {
    if (Object.prototype.hasOwnProperty.call(t, k)) {
      out[k] = t[k];
    }
  }
  return out;
}

function mergePieceDef(base, over) {
  if (!over) {
    return base;
  }
  return {
    g0: over.g0 != null ? over.g0 : base.g0,
    gm: over.gm != null ? over.gm : base.gm,
    g1: over.g1 != null ? over.g1 : base.g1,
    stroke: over.stroke != null ? over.stroke : base.stroke
  };
}

/**
 * @param {object} baseTheme themes.THEMES 中的一项
 * @param {string} skinId PIECE_SKINS 的 id
 * @returns {object} 新对象；followTheme 时直接返回 baseTheme
 */
function applyPieceSkin(baseTheme, skinId) {
  var skin = PIECE_SKINS[skinId];
  if (!skin || skin.followTheme) {
    return baseTheme;
  }
  var out = shallowCopyTheme(baseTheme);
  out.pieces = {
    black: mergePieceDef(baseTheme.pieces.black, skin.black),
    white: mergePieceDef(baseTheme.pieces.white, skin.white)
  };
  if (skin.stoneShading) {
    out.stoneShading = skin.stoneShading;
  }
  if (skin.textureUV) {
    out.textureUV = skin.textureUV;
  }
  if (typeof skin.pieceBoardRadiusCell === 'number') {
    out.pieceBoardRadiusCell = skin.pieceBoardRadiusCell;
  }
  if (typeof skin.pieceTextureDrawScale === 'number') {
    out.pieceTextureDrawScale = skin.pieceTextureDrawScale;
  }
  if (skin.opponentLastMoveMarker) {
    out.opponentLastMoveMarker = skin.opponentLastMoveMarker;
  }
  if (skin.winningLineHighlight) {
    out.winningLineHighlight = skin.winningLineHighlight;
  }
  return out;
}

function getPieceSkin(id) {
  return PIECE_SKINS[id] || PIECE_SKINS.default;
}

function loadSavedPieceSkinId() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var v = wx.getStorageSync(PIECE_SKIN_STORAGE_KEY);
      if (pieceSkinIdIsPersistable(v)) {
        return v;
      }
    }
  } catch (e) {}
  return 'basic';
}

function savePieceSkinId(id) {
  if (!pieceSkinIdIsPersistable(id)) {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorage) {
      wx.setStorage({ key: PIECE_SKIN_STORAGE_KEY, data: id });
      return;
    }
  } catch (e) {}
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      setTimeout(function () {
        try {
          wx.setStorageSync(PIECE_SKIN_STORAGE_KEY, id);
        } catch (e2) {}
      }, 0);
    }
  } catch (e3) {}
}

/** 登录后 GET /api/me/rating 的 pieceSkinId：服务端已校验，直接落盘并用于当前局 */
function applyPieceSkinIdFromServer(id) {
  if (!id || typeof id !== 'string') {
    return;
  }
  var sid = id.trim();
  if (!sid || !PIECE_SKINS[sid] || PIECE_SKINS[sid].followTheme) {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorage) {
      wx.setStorage({ key: PIECE_SKIN_STORAGE_KEY, data: sid });
      return;
    }
  } catch (e) {}
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(PIECE_SKIN_STORAGE_KEY, sid);
    }
  } catch (e2) {}
}

function getTheme(id) {
  var t = THEMES[id] || THEMES.classic;
  return t;
}

function clampThemeIdToUnlocked(id) {
  if (id === 'classic') {
    return 'classic';
  }
  if ((id === 'mint' || id === 'ink') && THEMES[id] && isPieceSkinUnlockedOnServer(id)) {
    return id;
  }
  return 'classic';
}

function loadSavedThemeId() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var v = wx.getStorageSync(STORAGE_KEY);
      if (v === 'classic') {
        return 'classic';
      }
      if ((v === 'mint' || v === 'ink') && THEMES[v]) {
        if (isPieceSkinUnlockedOnServer(v)) {
          return v;
        }
        try {
          wx.setStorageSync(STORAGE_KEY, 'classic');
        } catch (e2) {}
        return 'classic';
      }
    }
  } catch (e) {}
  return 'classic';
}

function saveThemeId(id) {
  if (!THEMES[id]) {
    return;
  }
  if (id === 'mint' || id === 'ink') {
    if (!isPieceSkinUnlockedOnServer(id)) {
      return;
    }
  } else if (id !== 'classic') {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEY, id);
    }
  } catch (e) {}
}

/**
 * 登录后 GET /api/me/rating 的 themeId：写入本地 STORAGE_KEY（服务端已校验解锁）
 */
function applyThemeIdFromServer(id) {
  if (!id || typeof id !== 'string') {
    return;
  }
  var tid = id.trim();
  if (!THEMES[tid]) {
    return;
  }
  if (tid === 'classic') {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEY, 'classic');
      }
    } catch (e) {}
    return;
  }
  if ((tid === 'mint' || tid === 'ink') && isPieceSkinUnlockedOnServer(tid)) {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEY, tid);
      }
    } catch (e2) {}
  }
}

var themesExports = {
  THEMES: THEMES,
  THEME_IDS: THEME_IDS,
  PIECE_SKINS: PIECE_SKINS,
  PIECE_SKIN_IDS: PIECE_SKIN_IDS,
  PIECE_SKINS_PER_PAGE: PIECE_SKINS_PER_PAGE,
  SHOP_CATEGORY_PIECE_SKIN: SHOP_CATEGORY_PIECE_SKIN,
  SHOP_CATEGORY_THEME: SHOP_CATEGORY_THEME,
  SHOP_CATEGORY_CONSUMABLE: SHOP_CATEGORY_CONSUMABLE,
  CONSUMABLE_DAGGER_COST_POINTS: CONSUMABLE_DAGGER_COST_POINTS,
  setConsumableDaggerCountFromServer: setConsumableDaggerCountFromServer,
  getConsumableDaggerCount: getConsumableDaggerCount,
  getBoardSkillId: getBoardSkillId,
  isDaggerSkillEquipped: isDaggerSkillEquipped,
  saveBoardSkillId: saveBoardSkillId,
  applyDaggerSkillEquippedFromServer: applyDaggerSkillEquippedFromServer,
  getShopCategory: getShopCategory,
  applyShopCatalogFromServerPayload: applyShopCatalogFromServerPayload,
  getPieceSkinCatalog: getPieceSkinCatalog,
  getPieceSkinCatalogLabel: getPieceSkinCatalogLabel,
  isTuanMoeUnlocked: isTuanMoeUnlocked,
  setTuanMoeUnlockedFromServer: setTuanMoeUnlockedFromServer,
  setCheckinStreakFromServer: setCheckinStreakFromServer,
  setPieceSkinUnlockedIdsFromServer: setPieceSkinUnlockedIdsFromServer,
  isPieceSkinUnlockedOnServer: isPieceSkinUnlockedOnServer,
  getTheme: getTheme,
  getThemeIdsForCycling: getThemeIdsForCycling,
  clampThemeIdToUnlocked: clampThemeIdToUnlocked,
  loadSavedThemeId: loadSavedThemeId,
  saveThemeId: saveThemeId,
  applyThemeIdFromServer: applyThemeIdFromServer,
  applyPieceSkin: applyPieceSkin,
  getPieceSkin: getPieceSkin,
  loadSavedPieceSkinId: loadSavedPieceSkinId,
  savePieceSkinId: savePieceSkinId,
  applyPieceSkinIdFromServer: applyPieceSkinIdFromServer
};

Object.defineProperty(themesExports, 'PIECE_SKIN_CATALOG', {
  get: function () {
    return getPieceSkinCatalog();
  },
  enumerable: true
});

module.exports = themesExports;
