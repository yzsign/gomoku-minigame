/**
 * 界面风格：马卡龙 pastel / 大圆角卡片 / 白字主操作（参考小组件可爱风）
 */
var STORAGE_KEY = 'gomoku_theme_id';

var THEMES = {
  mint: {
    id: 'mint',
    name: '薄荷清新',
    bg: ['#fff9f5', '#f5fbfa', '#f8f6ff'],
    title: '#5a5a62',
    subtitle: '#8a8a96',
    muted: '#9a9aa8',
    homeCards: ['#8fd4c8', '#b5e0a5', '#b8c4f0'],
    btnPrimary: '#8fd4c8',
    btnPrimaryStroke: 'rgba(255,255,255,0.45)',
    btnShadow: 'rgba(0,0,0,0.07)',
    btnGhostFill: 'rgba(255,255,255,0.75)',
    btnGhostStroke: 'rgba(255,255,255,0.95)',
    btnGhostText: '#6a6a78',
    result: {
      defaultEnd: '#f7f7fb',
      win: { bg: '#d8f0e4', title: '#2d6a4f' },
      lose: { bg: '#e4eaf5', title: '#4a5f78' },
      draw: { bg: '#f2efe6', title: '#7a6a48' },
      sub: '#7a7a86',
      secondaryFill: 'rgba(255,255,255,0.6)',
      secondaryStroke: 'rgba(255,255,255,0.9)',
      secondaryText: '#5a5a62'
    },
    board: {
      g0: '#fafcfa',
      g1: '#f3f6f4',
      line: '#c5cec9',
      star: '#9eb0a6'
    },
    pieces: {
      black: { g0: '#6a6a82', g1: '#3d3d52', stroke: '#5a5a70' },
      white: { g0: '#fffefb', g1: '#eef6f2', stroke: '#c8e0d8' }
    },
    status: '#6a6a72',
    hint: '#a0a0ac'
  },
  lilac: {
    id: 'lilac',
    name: '香芋软萌',
    bg: ['#faf8ff', '#f3f0fc', '#fef8fb'],
    title: '#5a4a68',
    subtitle: '#8a7a96',
    muted: '#a898b0',
    homeCards: ['#c4b8e8', '#dcb8e0', '#e8c0d4'],
    btnPrimary: '#c4b8e8',
    btnPrimaryStroke: 'rgba(255,255,255,0.45)',
    btnShadow: 'rgba(0,0,0,0.07)',
    btnGhostFill: 'rgba(255,255,255,0.75)',
    btnGhostStroke: 'rgba(255,255,255,0.95)',
    btnGhostText: '#6a5a72',
    result: {
      defaultEnd: '#f8f6fc',
      win: { bg: '#d8f0e4', title: '#2d6a4f' },
      lose: { bg: '#ebe4f5', title: '#5a4a78' },
      draw: { bg: '#f5f0f2', title: '#8a7a58' },
      sub: '#8a7a96',
      secondaryFill: 'rgba(255,255,255,0.6)',
      secondaryStroke: 'rgba(255,255,255,0.9)',
      secondaryText: '#5a4a68'
    },
    board: {
      g0: '#faf9fc',
      g1: '#f4f2f8',
      line: '#d8d2e4',
      star: '#b0a8c8'
    },
    pieces: {
      black: { g0: '#6b6b82', g1: '#3d3d52', stroke: '#5a5a70' },
      white: { g0: '#fffefb', g1: '#f5f0ff', stroke: '#dcc8e8' }
    },
    status: '#6a5a72',
    hint: '#b0a0b8'
  },
  ocean: {
    id: 'ocean',
    name: '海盐气泡',
    bg: ['#f5fcff', '#eef8fc', '#f7fbfa'],
    title: '#3a5a68',
    subtitle: '#7a8a96',
    muted: '#8aa8b0',
    homeCards: ['#7cc8dc', '#94d8ec', '#a8e0e8'],
    btnPrimary: '#7cc8dc',
    btnPrimaryStroke: 'rgba(255,255,255,0.45)',
    btnShadow: 'rgba(0,0,0,0.07)',
    btnGhostFill: 'rgba(255,255,255,0.75)',
    btnGhostStroke: 'rgba(255,255,255,0.95)',
    btnGhostText: '#4a6a78',
    result: {
      defaultEnd: '#f2f9fc',
      win: { bg: '#d4f0e4', title: '#1d6a50' },
      lose: { bg: '#e4eef8', title: '#3a5a78' },
      draw: { bg: '#eef5f0', title: '#7a7a50' },
      sub: '#7a8a96',
      secondaryFill: 'rgba(255,255,255,0.6)',
      secondaryStroke: 'rgba(255,255,255,0.9)',
      secondaryText: '#3a5a68'
    },
    board: {
      g0: '#f8fafb',
      g1: '#f0f3f5',
      line: '#bcc8d0',
      star: '#8ca8b8'
    },
    pieces: {
      black: { g0: '#5a6a78', g1: '#2d3d4a', stroke: '#4a5a68' },
      white: { g0: '#fffefb', g1: '#e8f4fa', stroke: '#b8d8e4' }
    },
    status: '#5a6a6a',
    hint: '#98b8c0'
  },
  classic: {
    id: 'classic',
    name: '木纹经典',
    bg: ['#faf6f0', '#f2ebe2', '#faf8f4'],
    title: '#4a3828',
    subtitle: '#8a7868',
    muted: '#9a8878',
    homeCards: ['#d4b896', '#c9a878', '#a8b898'],
    btnPrimary: '#c9a878',
    btnPrimaryStroke: 'rgba(255,255,255,0.35)',
    btnShadow: 'rgba(0,0,0,0.08)',
    btnGhostFill: 'rgba(255,255,255,0.72)',
    btnGhostStroke: 'rgba(255,255,255,0.9)',
    btnGhostText: '#5a4838',
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
    /* 浅蜜棕木纹感（tan/burlywood），低饱和护眼；细黑线 + 黑星位，贴近参考图 */
    board: {
      g0: '#e8d4b8',
      g1: '#d2b48c',
      line: '#000000',
      star: '#000000'
    },
    pieces: {
      black: { g0: '#666666', g1: '#111111', stroke: '#222222' },
      white: { g0: '#ffffff', g1: '#c8c8c8', stroke: '#999999' }
    },
    status: '#4a3828',
    hint: '#9a8878'
  },
  sakura: {
    id: 'sakura',
    name: '樱花豆沙',
    bg: ['#fff8fa', '#faf0f5', '#fff9f6'],
    title: '#7a5868',
    subtitle: '#a898a4',
    muted: '#c0a8b4',
    homeCards: ['#e8b8c8', '#f0c8d8', '#f8d0d8'],
    btnPrimary: '#e8b8c8',
    btnPrimaryStroke: 'rgba(255,255,255,0.45)',
    btnShadow: 'rgba(0,0,0,0.07)',
    btnGhostFill: 'rgba(255,255,255,0.75)',
    btnGhostStroke: 'rgba(255,255,255,0.95)',
    btnGhostText: '#8a5868',
    result: {
      defaultEnd: '#fff8fa',
      win: { bg: '#e0f5e8', title: '#2d8a5a' },
      lose: { bg: '#f5e8f0', title: '#a05070' },
      draw: { bg: '#faf0e8', title: '#b87a50' },
      sub: '#a898a4',
      secondaryFill: 'rgba(255,255,255,0.6)',
      secondaryStroke: 'rgba(255,255,255,0.9)',
      secondaryText: '#7a5868'
    },
    board: {
      g0: '#fdf9fa',
      g1: '#f7f0f3',
      line: '#dcc8d0',
      star: '#c4a8b4'
    },
    pieces: {
      black: { g0: '#6b6b7a', g1: '#3d3d50', stroke: '#5a5a68' },
      white: { g0: '#fffefb', g1: '#fceff4', stroke: '#f0c8d8' }
    },
    status: '#7a5868',
    hint: '#c8a8b4'
  }
};

/** 切换顺序：默认木纹经典为首项 */
var THEME_IDS = ['classic', 'mint', 'lilac', 'ocean', 'sakura'];

function getTheme(id) {
  var t = THEMES[id] || THEMES.classic;
  return t;
}

function loadSavedThemeId() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var v = wx.getStorageSync(STORAGE_KEY);
      if (v && THEMES[v]) {
        return v;
      }
    }
  } catch (e) {}
  return 'classic';
}

function saveThemeId(id) {
  if (!THEMES[id]) {
    return;
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEY, id);
    }
  } catch (e) {}
}

module.exports = {
  THEMES: THEMES,
  THEME_IDS: THEME_IDS,
  getTheme: getTheme,
  loadSavedThemeId: loadSavedThemeId,
  saveThemeId: saveThemeId
};
