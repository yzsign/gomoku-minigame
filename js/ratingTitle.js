/**
 * 与 rule.md §5 段位等级对照表一致：根据天梯分返回段位名 + 称号
 */

function getRankAndTitleByElo(elo) {
  var e = elo;
  if (e < 1000) {
    return { rankLabel: '新手', titleName: '木野狐' };
  }
  if (e < 1200) {
    return { rankLabel: '业余初段', titleName: '石枰客' };
  }
  if (e < 1400) {
    return { rankLabel: '业余二段', titleName: '玄素生' };
  }
  if (e < 1600) {
    return { rankLabel: '业余三段', titleName: '落子星' };
  }
  if (e < 1800) {
    return { rankLabel: '业余四段', titleName: '通幽手' };
  }
  if (e < 2000) {
    return { rankLabel: '业余五段', titleName: '坐照客' };
  }
  if (e < 2200) {
    return { rankLabel: '业余六段', titleName: '入神师' };
  }
  if (e < 2350) {
    return { rankLabel: '职业初段', titleName: '玉楸子' };
  }
  if (e < 2500) {
    return { rankLabel: '职业二段', titleName: '璇玑使' };
  }
  if (e < 2700) {
    return { rankLabel: '职业三段', titleName: '天元君' };
  }
  if (e < 2900) {
    return { rankLabel: '职业四段', titleName: '无极圣' };
  }
  return { rankLabel: '职业五段', titleName: '棋鬼王' };
}

module.exports = {
  getRankAndTitleByElo: getRankAndTitleByElo,
};
