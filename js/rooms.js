'use strict';
/* 空洞余响 — 房间数据：6 个相互连通的区域 */

function makeGrid(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('#'));
  return {
    w, h, g,
    set(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; },
    rect(x1, y1, x2, y2, c = '#') { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) this.set(x, y, c); },
    clear(x1, y1, x2, y2) { this.rect(x1, y1, x2, y2, '.'); },
    plat(x1, x2, y) { for (let x = x1; x <= x2; x++) this.set(x, y, '='); },
  };
}

const FLOOR_DECO = {
  pale:   [['grass', 0.16]],
  cross:  [['grass', 0.11], ['bones', 0.04]],
  fungal: [['mush', 0.20], ['grass', 0.08]],
  abyss:  [['crys', 0.13], ['bones', 0.05]],
  arena:  [['bones', 0.05]],
  throne: [['candle', 0.07], ['crys', 0.09]],
};

function finalize(id, name, theme, grid, extra = {}) {
  const deco = extra.deco || [];
  const rng = mulberry32(id * 1013 + 77);
  const g = grid.g;
  const list = FLOOR_DECO[theme] || [];
  for (let y = 0; y < grid.h - 1; y++) for (let x = 0; x < grid.w; x++) {
    if (g[y][x] === '.' && g[y + 1][x] === '#') {
      for (const [t, p] of list) if (rng() < p) deco.push({ t, x, y, s: 0.7 + rng() * 0.8, h: rng() });
    }
    if ((theme === 'fungal' || theme === 'abyss' || theme === 'throne') &&
      y > 0 && y < grid.h * 0.55 && g[y][x] === '.' && g[y - 1][x] === '#' && rng() < 0.08) {
      deco.push({ t: 'vine', x, y, len: 2 + Math.floor(rng() * 3) });
    }
  }
  const room = Object.assign({ id, name, theme, w: grid.w, h: grid.h, tiles: g.map(r => r.join('')), deco }, extra);
  return room;
}

/* ---------- 0 苍白之径（起点教学） ---------- */
function buildRoom0() {
  const g = makeGrid(56, 22);
  g.clear(1, 1, 54, 18);          // 主空间，地板为 19-21 行
  g.rect(20, 17, 26, 18);         // 高台台阶
  g.plat(30, 34, 13);             // 空中平台
  g.clear(40, 19, 44, 20);        // 尖刺坑
  g.rect(40, 20, 44, 20, '^');    // 坑底尖刺（坐在 21 行地板上）
  g.plat(41, 43, 16);             // 坑上协助平台
  g.clear(55, 15, 55, 18);        // 右侧出口
  const deco = [
    { t: 'hint', x: 6,  y: 17, text: '← → / A D  移动' },
    { t: 'hint', x: 15, y: 17, text: 'Z / 空格 跳跃 · 空中可再跳一次' },
    { t: 'hint', x: 24, y: 15, text: 'X / J 挥剑 · 配合 ↑ ↓ 改变劈砍方向' },
    { t: 'hint', x: 33, y: 17, text: 'C / L / Shift  冲刺闪避' },
    { t: 'hint', x: 43, y: 13, text: '↓ + 攻击命中敌人或尖刺，可向上弹跳' },
    { t: 'hint', x: 50, y: 17, text: '长按 V 聚魂疗伤（消耗灵魂）' },
  ];
  return finalize(0, '苍白之径', 'pale', g, {
    deco,
    doors: [{ x: 55, y: 15, w: 1, h: 4, to: 1, spawn: [3, 25] }],
    spawns: [
      { t: 'crawlid', x: 12, y: 18 }, { t: 'crawlid', x: 36, y: 18 },
      { t: 'vengefly', x: 28, y: 10 },
    ],
    mapX: 0, mapY: 0,
  });
}

/* ---------- 1 十字路口（枢纽，有长椅） ---------- */
function buildRoom1() {
  const g = makeGrid(64, 30);
  g.clear(1, 1, 62, 25);          // 地板 26-29 行
  g.rect(36, 22, 42, 25);         // 台阶 A（顶 22）
  g.rect(44, 20, 49, 25);         // 台阶 B（顶 20）
  g.rect(50, 18, 62, 25);         // 右侧高台 C（顶 18）
  g.plat(33, 35, 24);
  g.plat(20, 24, 16);
  g.clear(28, 26, 33, 29);        // 底部深坑 → 沉眠深渊
  g.clear(0, 22, 0, 25);          // 左侧出口
  g.clear(63, 14, 63, 17);        // 右侧出口（高台上）
  return finalize(1, '十字路口', 'cross', g, {
    deco: [
      { t: 'bench', x: 7, y: 25 },
      { t: 'lantern', x: 10, y: 25 },
      { t: 'sign', x: 26, y: 25, text: '前方地面崩塌…… 深渊在脚下低语。' },
      { t: 'sign', x: 40, y: 21, text: '东行穿过真菌洞窟，可抵守卫之厅。' },
    ],
    doors: [
      { x: 0, y: 22, w: 1, h: 4, to: 0, spawn: [53, 18] },
      { x: 63, y: 14, w: 1, h: 4, to: 2, spawn: [3, 17] },
      { x: 28, y: 26, w: 6, h: 4, to: 3, spawn: [31, 3] },
    ],
    spawns: [
      { t: 'husk', x: 18, y: 25 }, { t: 'husk', x: 46, y: 19 },
      { t: 'vengefly', x: 22, y: 12 },
    ],
    bench: { x: 7, y: 25 },
    mapX: 1, mapY: 0,
  });
}

/* ---------- 2 真菌洞窟 ---------- */
function buildRoom2() {
  const g = makeGrid(72, 26);
  g.clear(1, 1, 70, 21);
  g.rect(1, 18, 20, 25);          // 左地面（顶 18）
  g.rect(21, 23, 25, 25);         // 浅坑（顶 23）
  g.rect(22, 22, 24, 22, '^');
  g.rect(26, 20, 40, 25);         // 中段地面（顶 20）
  g.rect(41, 23, 43, 25);         // 浅坑（顶 23）
  g.rect(44, 18, 70, 25);         // 右地面（顶 18）
  g.plat(8, 12, 15); g.plat(16, 20, 12);
  g.plat(30, 34, 14); g.plat(48, 52, 11); g.plat(58, 62, 13);
  g.clear(0, 14, 0, 17);          // 左入口
  g.clear(71, 14, 71, 17);        // 右出口 → 守卫之厅
  return finalize(2, '真菌洞窟', 'fungal', g, {
    doors: [
      { x: 0, y: 14, w: 1, h: 4, to: 1, spawn: [59, 17] },
      { x: 71, y: 14, w: 1, h: 4, to: 4, spawn: [3, 15] },
    ],
    spawns: [
      { t: 'crawlid', x: 34, y: 19 }, { t: 'husk', x: 56, y: 17 },
      { t: 'vengefly', x: 30, y: 12 }, { t: 'vengefly', x: 52, y: 9 },
    ],
    mapX: 2, mapY: 0,
  });
}

/* ---------- 3 沉眠深渊（黑暗区域） ---------- */
function buildRoom3() {
  const g = makeGrid(68, 30);
  g.clear(1, 1, 66, 23);          // 底部地板 24-29 行
  g.rect(24, 10, 38, 12);         // 上层落脚台（顶 10）
  g.plat(20, 23, 21); g.plat(16, 19, 17); g.plat(20, 23, 13); // 左侧回路
  g.plat(44, 47, 13); g.plat(52, 55, 17);                     // 右侧下行
  g.clear(12, 24, 17, 27); g.rect(12, 27, 17, 27, '^');       // 尖刺坑 1
  g.clear(44, 24, 49, 27); g.rect(44, 27, 49, 27, '^');       // 尖刺坑 2
  g.clear(67, 20, 67, 23);        // 右出口 → 深渊王座
  return finalize(3, '沉眠深渊', 'abyss', g, {
    doors: [{ x: 67, y: 20, w: 1, h: 4, to: 5, spawn: [3, 19] }],
    spawns: [
      { t: 'husk', x: 10, y: 23 }, { t: 'husk', x: 60, y: 23 },
      { t: 'vengefly', x: 30, y: 16 }, { t: 'vengefly', x: 48, y: 20 },
    ],
    dark: true,
    mapX: 2, mapY: 1,
  });
}

/* ---------- 4 守卫之厅（Boss 1） ---------- */
function buildRoom4() {
  const g = makeGrid(42, 22);
  g.clear(1, 1, 40, 15);          // 地板 16-21 行
  g.plat(8, 13, 10); g.plat(28, 33, 10);
  g.clear(0, 12, 0, 15);          // 左入口
  return finalize(4, '守卫之厅', 'arena', g, {
    doors: [
      { x: 0, y: 12, w: 1, h: 4, to: 2, spawn: [67, 17] },
      { x: 6, y: 16, w: 4, h: 6, to: 3, spawn: [54, 3], requires: 'boss1' },
    ],
    spawns: [],
    boss: { type: 'guard', flag: 'boss1', triggerX: 384, name: '残破守卫', title: '腐朽的钢铁' },
    gate: { x: 2, y: 12, w: 1, h: 4 },
    openWhen: { flag: 'boss1', rects: [[6, 16, 9, 21]] },
    mapX: 3, mapY: 0,
  });
}

/* ---------- 5 深渊王座（Boss 2） ---------- */
function buildRoom5() {
  const g = makeGrid(46, 24);
  g.clear(1, 1, 44, 19);          // 地板 20-23 行
  g.rect(14, 16, 16, 19);         // 石柱
  g.rect(30, 16, 32, 19);
  g.clear(0, 16, 0, 19);          // 左入口
  return finalize(5, '深渊王座', 'throne', g, {
    deco: [
      { t: 'throne', x: 39, y: 19 },
      { t: 'candle', x: 36, y: 19 }, { t: 'candle', x: 43, y: 19 },
      { t: 'statue', x: 6, y: 19 },
    ],
    doors: [{ x: 0, y: 16, w: 1, h: 4, to: 3, spawn: [63, 23] }],
    spawns: [],
    boss: { type: 'knight', flag: 'boss2', triggerX: 320, name: '深渊骑士', title: '长梦的残响' },
    gate: { x: 2, y: 16, w: 1, h: 4 },
    mapX: 3, mapY: 1,
  });
}

const ROOMS = [buildRoom0(), buildRoom1(), buildRoom2(), buildRoom3(), buildRoom4(), buildRoom5()];
const MAP_LINKS = [[0, 1], [1, 2], [2, 4], [1, 3], [3, 5], [4, 3]];
