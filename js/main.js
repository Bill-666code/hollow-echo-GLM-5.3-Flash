'use strict';
/* 空洞余响 Hollow Echo — 主引擎 */

const THEMES = {
  pale:   { sky: ['#0b1120', '#151d32'], farC: '#10182b', midC: '#161f38', fog: 'rgba(150,170,215,', fogA: 0.05 },
  cross:  { sky: ['#0d1122', '#1a2138'], farC: '#131a30', midC: '#1a2340', fog: 'rgba(160,170,220,', fogA: 0.05 },
  fungal: { sky: ['#081108', '#0f1d14'], farC: '#0d1a12', midC: '#12251a', fog: 'rgba(120,225,180,', fogA: 0.06 },
  abyss:  { sky: ['#070510', '#0f0b20'], farC: '#0d0a1c', midC: '#141027', fog: 'rgba(150,125,225,', fogA: 0.05 },
  arena:  { sky: ['#0c0f18', '#171c2a'], farC: '#121622', midC: '#181e2e', fog: 'rgba(165,175,205,', fogA: 0.045 },
  throne: { sky: ['#0a0714', '#161128'], farC: '#100c1e', midC: '#181230', fog: 'rgba(175,145,235,', fogA: 0.05 },
};
const ROOM_SUBS = { 0: '旧道之始', 1: '交汇之地', 2: '孢林低语', 3: '无光之底', 4: '钢铁的坟场', 5: '王座的影' };
const ORB_POS = { 4: [21, 13], 5: [23, 17] };
const ORB_INFO = {
  boss1: { flag: 'spell', name: '魂之利刃', desc: '按 F 释放灵魂冲击 · 消耗 33 灵魂' },
  boss2: { flag: 'great', name: '大地斩', desc: '长按攻击后松开 · 释放横扫重斩' },
};
const SERIF = 'Georgia, "Songti SC", "STSong", "SimSun", serif';
const font = (px, w) => `${w || 400} ${px}px ${SERIF}`;

/* ============ 全局状态 ============ */
const G = {
  state: 'title', time: 0, frame: 0,
  room: null, roomId: 0, player: null,
  enemies: [], boss: null, projs: [], slashes: [], geos: [], orbs: [],
  parts: [], ghosts: [], floats: [],
  cam: { x: 0, y: 0, shake: 0 },
  soul: 0, geo: 0,
  flags: { spell: false, great: false, boss1: false, boss2: false, bench: { room: 0, x: 4 * TILE + 16, y: 18 * TILE + 16 } },
  visited: {}, lastTheme: null,
  hitstop: 0, slow: null,
  trans: null, black: null,
  redFlash: 0, whiteFlash: 0, fadePulse: 0,
  banner: null, roomTitle: null, abilityBanner: null,
  letterbox: 0, gateAnim: 0,
  ending: null, endingAt: 0, deathT: 0,
  paused: false, mapOpen: false, muted: false,
  benchHint: false, benchCd: 0, lockMsgT: 0,
  cw: 0, ch: 0, scale: 1, ox: 0, oy: 0,

  shake(n) { this.cam.shake = Math.max(this.cam.shake, n); },
  addFloat(x, y, text, color = '#dfe6f2', size = 15) {
    this.floats.push({ x, y, text, t: 0, life: 1.8, color, size });
  },
  onBossDead(boss) {
    this.flags[this.room.boss.flag] = true;
    this.room.gateActive = false;
    this.boss = null;
    AUDIO.play('gate');
    this.bossTimer = 1.4;
    this.pendingOrb = Object.assign({ roomId: this.roomId, end: this.room.boss.flag === 'boss2' }, ORB_INFO[this.room.boss.flag]);
  },
};

/* ============ 瓦片 / 物理 ============ */
function tileChar(tx, ty) {
  const r = G.room;
  if (!r || tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return ' ';
  return r.tiles[ty][tx];
}
function inDoor(x, y) {
  const r = G.room;
  for (const d of r.doors) {
    if (d.requires && !G.flags[d.requires]) continue;
    if (x >= d.x * TILE - 4 && x < (d.x + d.w) * TILE + 4 &&
        y >= d.y * TILE - 4 && y < (d.y + d.h) * TILE + 4) return d;
  }
  return null;
}
function solidAtPx(x, y) {
  const r = G.room;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return !inDoor(x, y);
  if (r.tiles[ty][tx] === '#') return true;
  const g = r.gate;
  if (r.gateActive && x >= g.x * TILE && x < (g.x + g.w) * TILE && y >= g.y * TILE && y < (g.y + g.h) * TILE) return true;
  return false;
}
function setTile(room, tx, ty, c) {
  const row = room.tiles[ty];
  room.tiles[ty] = row.slice(0, tx) + c + row.slice(tx + 1);
}
function applyOpen(room, silent) {
  if (!room.openWhen || room.openWhen.done || !G.flags[room.openWhen.flag]) return;
  room.openWhen.done = true;
  for (const [x1, y1, x2, y2] of room.openWhen.rects) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) setTile(room, x, y, '.');
    if (!silent) Pfx.dust(G, (x1 + 2) * TILE, (y1 + 2) * TILE, 16, '#4a5670');
  }
  buildTileCanvas(room);
  if (!silent) { AUDIO.play('gate'); G.shake(6); }
}

function moveBody(e, dt) {
  e.hitWall = 0;
  e.prevB = e.y + e.h / 2;
  const hw = e.w / 2, hh = e.h / 2;
  /* 水平 */
  let nx = e.x + e.vx * dt;
  const dir = Math.sign(nx - e.x);
  if (dir !== 0) {
    const edge = nx + dir * hw;
    for (const sy of [e.y - hh + 3, e.y, e.y + hh - 3]) {
      if (solidAtPx(edge, sy)) {
        const t = Math.floor(edge / TILE);
        nx = dir > 0 ? t * TILE - hw - 0.01 : (t + 1) * TILE + hw + 0.01;
        e.vx = 0; e.hitWall = dir;
        break;
      }
    }
  }
  e.x = nx;
  /* 垂直 */
  let ny = e.y + e.vy * dt;
  e.grounded = false;
  if (e.vy > 0) {
    const feet = ny + hh;
    for (const sx of [e.x - hw + 3, e.x, e.x + hw - 3]) {
      const tx = Math.floor(sx / TILE), ty = Math.floor(feet / TILE);
      const c = tileChar(tx, ty);
      const oneWay = c === '=' && (e.dropT || 0) <= 0 && e.prevB <= ty * TILE + 8;
      if (solidAtPx(sx, feet) || oneWay) {
        ny = ty * TILE - hh - 0.01;
        e.vy = 0; e.grounded = true;
        break;
      }
    }
  } else if (e.vy < 0) {
    const head = ny - hh;
    for (const sx of [e.x - hw + 3, e.x, e.x + hw - 3]) {
      if (solidAtPx(sx, head)) {
        ny = (Math.floor(head / TILE) + 1) * TILE + hh + 0.01;
        e.vy = 0;
        break;
      }
    }
  }
  e.y = ny;
  /* 贴地探测 */
  if (!e.grounded && e.vy >= 0) {
    const fy = e.y + hh + 1;
    for (const sx of [e.x - hw + 3, e.x + hw - 3]) {
      const tx = Math.floor(sx / TILE), ty = Math.floor(fy / TILE);
      const c = tileChar(tx, ty);
      if (solidAtPx(sx, fy) || (c === '=' && (e.dropT || 0) <= 0 && (fy % TILE) <= 9 && e.prevB <= ty * TILE + 9)) {
        e.y = ty * TILE - hh - 0.01;
        e.vy = 0; e.grounded = true;
        break;
      }
    }
  }
}

/* ============ 房间加载 ============ */
function loadRoom(id, px, py) {
  const room = ROOMS[id];
  G.room = room; G.roomId = id;
  applyOpen(room, true);
  buildTileCanvas(room);
  buildBg(room);
  const CLS = { crawlid: Crawlid, vengefly: Vengefly, husk: Husk };
  G.enemies = (room.spawns || []).map(sp => new CLS[sp.t](sp.x * TILE + 16, sp.y * TILE + 16));
  G.boss = null; G.projs = []; G.slashes = []; G.geos = []; G.orbs = [];
  G.ghosts = []; G.floats = []; G.bossTimer = 0;
  G.banner = null; G.letterbox = 0; G.gateAnim = 0;
  /* 未拾取的能力宝珠跟随房间持久存在 */
  if (G.pendingOrb && G.pendingOrb.roomId === id) {
    const [ox, oy] = ORB_POS[id];
    const orb = new Orb(ox * TILE, oy * TILE, G.pendingOrb.flag, G.pendingOrb.name, G.pendingOrb.desc);
    orb.end = !!G.pendingOrb.end;
    G.orbs.push(orb);
  }
  if (!G.player) G.player = new Player(px, py);
  const p = G.player;
  p.x = px; p.y = py; p.vx = 0; p.vy = 0;
  p.face = px < room.w * TILE / 2 ? 1 : -1;
  p.dashT = 0; p.atkCd = 0; p.spikeT = 0; p.restT = 0; p.focusT = 0;
  p.invuln = Math.max(p.invuln, 0.5); p.dead = false; p.deathT = 0;
  p.lastSafe = { x: px, y: py - 2 };
  updateCam(0, true);
  const show = !G.visited[id] || G.lastTheme !== room.theme;
  if (show) G.roomTitle = { name: room.name, sub: ROOM_SUBS[id] || '', t: 0 };
  G.visited[id] = true; G.lastTheme = room.theme;
  AUDIO.drone(room.theme);
}

function startGame() {
  AUDIO.init(); AUDIO.resume();
  G.state = 'play';
  loadRoom(0, 4 * TILE + 16, 18 * TILE + 16);
  G.trans = { t: 0, phase: 'in', door: null };
}

/* ============ 转场 / 黑屏 ============ */
function startTrans(door) {
  if (G.trans || G.black) return;
  G.trans = { t: 0, phase: 'out', door };
  AUDIO.play('ui');
}
function updateTrans(dt) {
  const tr = G.trans;
  tr.t += dt;
  if (tr.phase === 'out' && tr.t >= 0.24) {
    const d = tr.door;
    if (d) loadRoom(d.to, d.spawn[0] * TILE + 16, d.spawn[1] * TILE + 16);
    tr.phase = 'in'; tr.t = 0;
  } else if (tr.phase === 'in' && tr.t >= 0.35) {
    G.trans = null;
  }
}
function startBlackout(cb) {
  G.black = { t: 0, dur: 0.45, cb, fired: false };
}
function updateBlack(dt) {
  const b = G.black;
  b.t += dt;
  if (!b.fired && b.t >= b.dur) { b.fired = true; b.cb(); }
  if (b.t >= b.dur * 2.2) G.black = null;
}

/* ============ 玩法更新 ============ */
function pogo(p) {
  p.vy = -640; p.airJumps = 1; p.canDash = true; p.spikeGrace = 0.22;
  AUDIO.play('pogo');
  Pfx.dust(G, p.x, p.y + 16, 3, '#8a95ad');
}

function slashBox(s) {
  if (s.great) return { x: s.x + s.face * 58 - 62, y: s.y - 38, w: 124, h: 76 };
  if (s.dir === 'up') return { x: s.x - 30, y: s.y - 78, w: 60, h: 62 };
  if (s.dir === 'down') return { x: s.x - 26, y: s.y + 16, w: 52, h: 62 };
  return { x: s.x + (s.face > 0 ? 4 : -66), y: s.y - 30, w: 62, h: 60 };
}

function resolveSlashes(dt) {
  const p = G.player;
  for (const s of G.slashes) {
    s.t += dt;
    if (s.enemy) continue;
    if (s.t >= s.life * 0.62) continue;
    const box = slashBox(s);
    for (const e of G.enemies) {
      if (e.dead || s.hit.has(e)) continue;
      if (rectHit(box.x, box.y, box.w, box.h, e)) {
        s.hit.add(e);
        e.hurt(s.great ? 3 : 1, p.face, G);
        if (s.dir === 'down') pogo(p);
      }
    }
    if (G.boss && !G.boss.dead && !s.hit.has(G.boss) && rectHit(box.x, box.y, box.w, box.h, G.boss)) {
      s.hit.add(G.boss);
      G.boss.hurt(s.great ? 3 : 1, p.face, G);
      if (s.dir === 'down') pogo(p);
    }
    for (const pr of G.projs) {
      if (pr.dead || s.hit.has(pr)) continue;
      if (pr.type === 'bullet' && rectHit(box.x, box.y, box.w, box.h, pr)) {
        s.hit.add(pr); pr.dead = true;
        Pfx.spark(G, pr.x, pr.y);
        G.soul = Math.min(99, G.soul + 5);
        AUDIO.play('hit');
        if (s.dir === 'down') pogo(p);
      } else if (pr.type === 'debris' && pr.warn > 0 && s.dir === 'down' && rectHit(box.x, box.y, box.w, box.h, pr)) {
        s.hit.add(pr); pogo(p);
      }
    }
    if (s.dir === 'down') {
      const x0 = Math.floor(box.x / TILE), x1 = Math.floor((box.x + box.w) / TILE);
      const y0 = Math.floor(box.y / TILE), y1 = Math.floor((box.y + box.h) / TILE);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const c = tileChar(tx, ty);
        if ((c === '^' || c === 'v') && !s.hit.has('s' + tx + ',' + ty)) {
          s.hit.add('s' + tx + ',' + ty);
          pogo(p);
        }
      }
    }
  }
  G.slashes = G.slashes.filter(s => s.t < s.life);
}

function contacts() {
  const p = G.player;
  if (p.dead || p.invuln > 0 || p.spikeT > 0) return;
  for (const e of G.enemies) {
    if (!e.dead && aabb(p, e)) { p.hurt(1, e.x, G); return; }
  }
  if (G.boss && !G.boss.dead && aabb(p, G.boss)) { p.hurt(1, G.boss.x, G); return; }
  for (const pr of G.projs) {
    if (pr.dead || pr.type === 'spell') continue;
    if (pr.type === 'debris' && pr.warn > 0) continue;
    if (aabb(p, pr)) { p.hurt(1, pr.x, G); pr.dead = true; return; }
  }
}

function checkSpikes() {
  const p = G.player;
  if (p.dead || p.spikeT > 0 || p.spikeGrace > 0 || p.invuln > 0) return;
  const hw = p.w / 2, hh = p.h / 2;
  const x0 = Math.floor((p.x - hw) / TILE), x1 = Math.floor((p.x + hw) / TILE);
  const y0 = Math.floor((p.y - hh) / TILE), y1 = Math.floor((p.y + hh) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = tileChar(tx, ty);
    if (c !== '^' && c !== 'v') continue;
    const hy = c === '^' ? ty * TILE + 16 : ty * TILE;
    if (p.x + hw > tx * TILE && p.x - hw < (tx + 1) * TILE && p.y + hh > hy + 2 && p.y - hh < hy + 16) {
      p.hurt(1, p.x, G);
      if (!p.dead) p.spikeT = 0.5;
      return;
    }
  }
}

function checkDoors() {
  const p = G.player, r = G.room;
  if (p.dead) return;
  for (const d of r.doors) {
    const x1 = d.x * TILE, y1 = d.y * TILE, x2 = (d.x + d.w) * TILE, y2 = (d.y + d.h) * TILE;
    const withinY = p.y > y1 - 10 && p.y < y2 + 10;
    const withinX = p.x > x1 - 10 && p.x < x2 + 10;
    if (d.requires && !G.flags[d.requires]) {
      if (withinX && withinY && p.x > x1 - 34 && G.lockMsgT <= 0) {
        G.lockMsgT = 2.2;
        G.addFloat(p.x, p.y - 46, '封印之门 · 尚未开启', '#9aa6bd', 14);
        AUDIO.play('warn');
      }
      continue;
    }
    let go = false;
    if (d.x === 0 && withinY && p.x < x1 + 14) go = true;
    else if (d.x === r.w - 1 && withinY && p.x > x2 - 14) go = true;
    else if (d.y + d.h >= r.h && withinX && p.y > y1 + 22) go = true;
    if (go) { startTrans(d); return; }
  }
}

function benchCheck(dt) {
  G.benchCd = Math.max(0, G.benchCd - dt);
  const b = G.room.bench, p = G.player;
  if (!b || p.dead) { G.benchHint = false; return; }
  const bx = b.x * TILE + 16, by = b.y * TILE + 16;
  const near = Math.abs(p.x - bx) < 30 && Math.abs(p.y - by) < 44 && p.grounded;
  G.benchHint = near;
  if (near && Input.d('down') && G.benchCd <= 0) {
    G.benchCd = 1.6;
    p.restT = 1.1;
    p.hp = p.maxHp;
    G.flags.bench = { room: G.roomId, x: bx, y: by };
    AUDIO.play('bench');
    G.addFloat(bx, by - 46, '灵魂在长椅边凝聚', '#f2f6ff', 16);
    Pfx.ring(G, bx, by, 40, '#dfe8ff', 0.5);
  }
}

function bossTrigger() {
  const r = G.room, p = G.player;
  if (!r.boss || G.flags[r.boss.flag] || G.boss || p.dead) return;
  if (p.x > r.boss.triggerX) {
    G.boss = r.boss.type === 'guard'
      ? new BossGuard(30 * TILE + 16, 14 * TILE + 16)
      : new BossKnight(30 * TILE + 16, 14 * TILE + 16);
    r.gateActive = true;
    G.banner = { name: r.boss.name, title: r.boss.title, t: 0, roared: false };
    G.shake(4);
    AUDIO.play('gate');
  }
}

function updatePlay(dt) {
  G.time += dt;
  G.lockMsgT = Math.max(0, G.lockMsgT - dt);
  const p = G.player;

  if (G.trans) { updateTrans(dt); Pfx.update(G, dt); updateCam(dt); return; }
  if (G.black) { updateBlack(dt); Pfx.update(G, dt); updateCam(dt); return; }

  /* 计时器 */
  for (const k of ['redFlash', 'whiteFlash', 'fadePulse']) G[k] = Math.max(0, G[k] - dt);
  if (G.roomTitle) { G.roomTitle.t += dt; if (G.roomTitle.t > 3.4) G.roomTitle = null; }
  if (G.banner) {
    G.banner.t += dt;
    if (!G.banner.roared && G.banner.t > 0.7) { G.banner.roared = true; AUDIO.play('roar'); G.shake(6); }
    if (G.banner.t > 2.1) G.banner = null;
  }
  G.letterbox = appr(G.letterbox, G.banner ? 1 : 0, 3 * dt);
  if (G.abilityBanner) { G.abilityBanner.t += dt; if (G.abilityBanner.t > 4.2) G.abilityBanner = null; }
  if (G.endingAt && G.time > G.endingAt && !G.ending) G.ending = { t: 0 };
  if (G.ending) { G.ending.t += dt; if (G.ending.t > 10) { G.ending = null; G.endingAt = 0; } }
  G.gateAnim = appr(G.gateAnim, G.room.gateActive ? 1 : 0, 5 * dt);
  applyOpen(G.room, false);

  /* 玩家死亡流程 */
  if (p.dead) {
    G.deathT += dt;
    Pfx.update(G, dt);
    updateCam(dt);
    if (G.deathT > 1.6) {
      G.deathT = 0;
      const b = G.flags.bench;
      startBlackout(() => {
        loadRoom(b.room, b.x, b.y);
        p.hp = p.maxHp; G.soul = 0;
      });
    }
    return;
  }

  p.update(dt, G);
  if (!G.trans && !G.black) { checkDoors(); benchCheck(dt); bossTrigger(); }
  resolveSlashes(dt);

  for (const e of G.enemies) e.update(dt, G);
  G.enemies = G.enemies.filter(e => !e.dead);

  if (G.boss) G.boss.update(dt, G);

  for (const pr of G.projs) pr.update(dt, G);
  /* 魂之利刃命中 */
  for (const pr of G.projs) {
    if (pr.dead || pr.type !== 'spell') continue;
    pr.hit = pr.hit || new Set();
    for (const e of G.enemies) {
      if (!e.dead && !pr.hit.has(e) && rectHit(pr.x, pr.y, pr.w, pr.h, e)) {
        pr.hit.add(e);
        e.hurt(2, Math.sign(pr.vx) || 1, G);
      }
    }
    if (G.boss && !G.boss.dead && !pr.hit.has(G.boss) && rectHit(pr.x, pr.y, pr.w, pr.h, G.boss)) {
      pr.hit.add(G.boss);
      G.boss.hurt(2, Math.sign(pr.vx) || 1, G);
    }
  }
  G.projs = G.projs.filter(pr => !pr.dead);

  for (const geo of G.geos) geo.update(dt, G);
  G.geos = G.geos.filter(gd => !gd.dead);

  /* 宝珠生成 */
  if (G.pendingOrb && G.bossTimer > 0) {
    G.bossTimer -= dt;
    if (G.bossTimer <= 0) {
      const [ox, oy] = ORB_POS[G.roomId];
      const orb = new Orb(ox * TILE, oy * TILE, G.pendingOrb.flag, G.pendingOrb.name, G.pendingOrb.desc);
      orb.end = G.room.boss.flag === 'boss2';
      G.orbs.push(orb);
      G.pendingOrb = null;
      AUDIO.play('orb');
    }
  }
  for (const o of G.orbs) o.update(dt, G);
  G.orbs = G.orbs.filter(o => !o.dead);

  contacts();
  checkSpikes();
  Pfx.update(G, dt);
  for (const gh of G.ghosts) gh.t += dt;
  G.ghosts = G.ghosts.filter(gh => gh.t < 0.3);
  for (const f of G.floats) f.t += dt;
  G.floats = G.floats.filter(f => f.t < f.life);

  updateCam(dt);
}

function updateCam(dt, snap) {
  const p = G.player, r = G.room;
  if (!p || !r) return;
  const maxX = Math.max(0, r.w * TILE - VW), maxY = Math.max(0, r.h * TILE - VH);
  const tx = clamp(p.x - VW / 2 + p.face * 54 + p.vx * 0.05, 0, maxX);
  const ty = clamp(p.y - VH / 2 - 20 + p.vy * 0.03, 0, maxY);
  if (r.w * TILE < VW) G.cam.x = (r.w * TILE - VW) / 2;
  else if (snap) G.cam.x = tx;
  else G.cam.x = lerp(G.cam.x, tx, 1 - Math.exp(-6.5 * dt));
  if (r.h * TILE < VH) G.cam.y = (r.h * TILE - VH) / 2;
  else if (snap) G.cam.y = ty;
  else G.cam.y = lerp(G.cam.y, ty, 1 - Math.exp(-6.5 * dt));
  G.cam.shake = appr(G.cam.shake, 0, 40 * dt + G.cam.shake * 7 * dt);
}

/* ============ 预渲染 ============ */
function buildTileCanvas(room) {
  const cv = document.createElement('canvas');
  cv.width = room.w * TILE; cv.height = room.h * TILE;
  const c = cv.getContext('2d');
  const rng = mulberry32(room.id * 31 + 5);
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
    const ch = room.tiles[y][x], px = x * TILE, py = y * TILE;
    if (ch === '#') {
      c.fillStyle = '#0c111d';
      c.fillRect(px, py, TILE, TILE);
      /* 内部斑点 */
      c.fillStyle = 'rgba(6,9,15,0.55)';
      for (let i = 0; i < 3; i++) {
        c.fillRect(px + rng() * 26, py + rng() * 26, 2 + rng() * 3, 2 + rng() * 2);
      }
      const up = y > 0 ? room.tiles[y - 1][x] : '#';
      const dn = y < room.h - 1 ? room.tiles[y + 1][x] : '#';
      const lf = x > 0 ? room.tiles[y][x - 1] : '#';
      const rt = x < room.w - 1 ? room.tiles[y][x + 1] : '#';
      const open = t => t !== '#';
      if (open(up)) { c.fillStyle = '#43547a'; c.fillRect(px, py, TILE, 3); c.fillStyle = '#2a3654'; c.fillRect(px, py + 3, TILE, 3); }
      if (open(dn)) { c.fillStyle = '#1b2336'; c.fillRect(px, py + TILE - 3, TILE, 3); }
      if (open(lf)) { c.fillStyle = '#232d47'; c.fillRect(px, py, 2, TILE); }
      if (open(rt)) { c.fillStyle = '#232d47'; c.fillRect(px + TILE - 2, py, 2, TILE); }
    } else if (ch === '=') {
      c.fillStyle = '#1b2436';
      c.fillRect(px, py, TILE, 11);
      c.fillStyle = '#4d5f85';
      c.fillRect(px, py, TILE, 2.5);
      c.fillStyle = '#121826';
      c.fillRect(px + 4, py + 9, TILE - 8, 2);
    } else if (ch === '^' || ch === 'v') {
      const flip = ch === 'v';
      c.save();
      if (flip) { c.translate(px, py + TILE); c.scale(1, -1); } else c.translate(px, py);
      c.fillStyle = '#9aa6b6';
      c.strokeStyle = '#0a0d14'; c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const bx = i * 11 + 1;
        c.beginPath();
        c.moveTo(bx, 32); c.lineTo(bx + 5, 10); c.lineTo(bx + 10, 32);
        c.closePath(); c.fill(); c.stroke();
      }
      c.restore();
    }
  }
  room.tileCv = cv;
}

function buildBg(room) {
  const th = THEMES[room.theme];
  const mk = (factor, color, mode) => {
    const w = Math.ceil(room.w * TILE * factor + VW + 120);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = VH;
    const c = cv.getContext('2d');
    const rng = mulberry32(room.id * 77 + (mode === 'far' ? 1 : 2));
    c.fillStyle = color;
    const theme = room.theme;
    if (theme === 'fungal') {
      for (let i = 0; i < 16; i++) {
        const x = rng() * w, h = 90 + rng() * 240, cw = 26 + rng() * 50;
        c.beginPath();
        c.rect(x, VH - h, cw * 0.3, h);
        c.fill();
        c.beginPath();
        c.ellipse(x + cw * 0.15, VH - h, cw / 2, cw / 3.2, 0, Math.PI, 0);
        c.fill();
      }
    } else if (theme === 'abyss' || theme === 'throne') {
      for (let i = 0; i < 20; i++) {
        const x = rng() * w, wdt = 14 + rng() * 44, h = 70 + rng() * 260;
        c.beginPath();
        c.moveTo(x, 0); c.lineTo(x + wdt, 0); c.lineTo(x + wdt / 2, h);
        c.closePath(); c.fill();
      }
      for (let i = 0; i < 12; i++) {
        const x = rng() * w, wdt = 20 + rng() * 50, h = 80 + rng() * 230;
        c.beginPath();
        c.moveTo(x, VH); c.lineTo(x + wdt, VH); c.lineTo(x + wdt / 2, VH - h);
        c.closePath(); c.fill();
      }
      if (theme === 'throne') {
        for (let i = 0; i < 7; i++) {
          const x = 80 + rng() * (w - 160), h = 180 + rng() * 220;
          c.beginPath();
          c.moveTo(x, VH); c.lineTo(x + 44, VH); c.lineTo(x + 44, VH - h + 40);
          c.lineTo(x + 30, VH - h); c.lineTo(x + 14, VH - h + 46); c.lineTo(x, VH - h + 40);
          c.closePath(); c.fill();
        }
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const x = rng() * w, wdt = 26 + rng() * 60, h = 120 + rng() * 300;
        c.beginPath();
        c.moveTo(x, VH); c.lineTo(x + wdt, VH);
        c.quadraticCurveTo(x + wdt, VH - h, x + wdt / 2, VH - h - 18);
        c.quadraticCurveTo(x, VH - h, x, VH);
        c.closePath(); c.fill();
      }
      /* 悬链 */
      c.strokeStyle = color; c.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const x = rng() * w, l = 40 + rng() * 140;
        c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 6, l * 0.6, x, l); c.stroke();
      }
    }
    /* 远处微光 */
    if (mode === 'mid' || room.dark) {
      for (let i = 0; i < 10; i++) {
        const x = rng() * w, y = 60 + rng() * (VH - 160), r = 2 + rng() * 3;
        const gl = c.createRadialGradient(x, y, 0, x, y, r * 6);
        gl.addColorStop(0, 'rgba(190,210,255,0.5)');
        gl.addColorStop(1, 'rgba(190,210,255,0)');
        c.fillStyle = gl;
        c.beginPath(); c.arc(x, y, r * 6, 0, 7); c.fill();
      }
    }
    /* 底部雾带 */
    const gr = c.createLinearGradient(0, VH - 200, 0, VH);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = gr; c.fillRect(0, VH - 200, w, 200);
    return cv;
  };
  room.bgFar = mk(0.25, th.farC, 'far');
  room.bgMid = mk(0.55, th.midC, 'mid');
}

/* 雾 / 暗角 预渲染 */
let fogCv, vignetteCv, lightCv;
function prerenderStatics() {
  fogCv = document.createElement('canvas');
  fogCv.width = 700; fogCv.height = 320;
  const c = fogCv.getContext('2d');
  const rng = mulberry32(42);
  for (let i = 0; i < 14; i++) {
    const x = rng() * 700, y = 80 + rng() * 180, r = 60 + rng() * 110;
    const gl = c.createRadialGradient(x, y, 0, x, y, r);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  vignetteCv = document.createElement('canvas');
  vignetteCv.width = VW; vignetteCv.height = VH;
  const v = vignetteCv.getContext('2d');
  const vg = v.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VH * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.52)');
  v.fillStyle = vg; v.fillRect(0, 0, VW, VH);
  lightCv = document.createElement('canvas');
  lightCv.width = lightCv.height = 512;
  const l = lightCv.getContext('2d');
  const lg = l.createRadialGradient(256, 256, 10, 256, 256, 250);
  lg.addColorStop(0, 'rgba(255,255,255,1)');
  lg.addColorStop(0.4, 'rgba(255,255,255,0.75)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  l.fillStyle = lg;
  l.beginPath(); l.arc(256, 256, 250, 0, 7); l.fill();
}

/* ============ 渲染 ============ */
function render() {
  const ctx = G.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#04060b';
  ctx.fillRect(0, 0, G.cw, G.ch);
  ctx.setTransform(G.scale, 0, 0, G.scale, G.ox, G.oy);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
  if (G.state === 'title') drawTitle(ctx);
  else drawWorld(ctx);
  ctx.restore();
}

function drawWorld(ctx) {
  const r = G.room;
  if (!r) return;
  const th = THEMES[r.theme];
  const shX = (Math.random() * 2 - 1) * G.cam.shake;
  const shY = (Math.random() * 2 - 1) * G.cam.shake;
  const camX = Math.round(G.cam.x + shX), camY = Math.round(G.cam.y + shY);

  /* 天空 */
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, VH);

  /* 视差层 */
  if (r.bgFar) ctx.drawImage(r.bgFar, -camX * 0.25, -camY * 0.12);
  if (r.bgMid) ctx.drawImage(r.bgMid, -camX * 0.55, -camY * 0.3);

  /* 世界 */
  ctx.save();
  ctx.translate(-camX, -camY);
  if (r.tileCv) ctx.drawImage(r.tileCv, 0, 0);
  drawDeco(ctx, r);
  drawGate(ctx, r);
  for (const pr of G.projs) if (pr.type === 'debris' && pr.warn > 0) drawTelegraph(ctx, pr);
  for (const e of G.enemies) e.draw(ctx, G);
  if (G.boss) G.boss.draw(ctx, G);
  for (const o of G.orbs) o.draw(ctx, G);
  for (const pr of G.projs) pr.draw(ctx, G);
  for (const gh of G.ghosts) drawGhost(ctx, gh);
  G.player.draw(ctx, G);
  for (const s of G.slashes) drawSlash(ctx, s);
  for (const gd of G.geos) gd.draw(ctx);
  Pfx.draw(ctx, G);
  for (const f of G.floats) {
    const k = f.t / f.life;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6)) / 0.4;
    ctx.fillStyle = f.color;
    ctx.font = font(f.size, 600);
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - k * 26);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /* 雾 */
  drawFog(ctx, th, camX, camY);
  /* 黑暗房间 */
  if (r.dark) drawDarkness(ctx, camX, camY);
  /* 暗角 */
  ctx.drawImage(vignetteCv, 0, 0);

  if (G.redFlash > 0) {
    ctx.fillStyle = `rgba(120,20,30,${G.redFlash * 0.9})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (G.whiteFlash > 0) {
    ctx.fillStyle = `rgba(240,246,255,${Math.min(1, G.whiteFlash * 1.4)})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  drawUI(ctx);
  drawOverlays(ctx);
}

/* ---- 装饰 ---- */
function drawDeco(ctx, r) {
  const t = G.time;
  for (const d of r.deco) {
    const px = d.x * TILE + 16, base = (d.y + 1) * TILE;
    switch (d.t) {
      case 'grass': {
        ctx.strokeStyle = r.theme === 'fungal' ? '#25402f' : '#242e42';
        ctx.lineWidth = 1.6;
        const n = 4 + Math.floor(d.s * 3);
        for (let i = 0; i < n; i++) {
          const ox = (i - n / 2) * 3.4, h = (9 + (i % 3) * 4) * d.s;
          const sway = Math.sin(t * 2 + d.x + i) * 2.2;
          ctx.beginPath();
          ctx.moveTo(px + ox, base);
          ctx.quadraticCurveTo(px + ox + sway, base - h * 0.6, px + ox + sway * 2, base - h);
          ctx.stroke();
        }
        break;
      }
      case 'mush': {
        const hue = d.h < 0.6 ? ['#7fd8c8', '#2ea88f'] : ['#b7a8ef', '#7a63d0'];
        const pulse = 0.5 + Math.sin(t * 2.4 + d.x) * 0.2;
        const gl = ctx.createRadialGradient(px, base - 12 * d.s, 0, px, base - 12 * d.s, 26 * d.s);
        gl.addColorStop(0, `rgba(140,230,205,${0.22 * pulse})`);
        gl.addColorStop(1, 'rgba(140,230,205,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(px, base - 12 * d.s, 26 * d.s, 0, 7); ctx.fill();
        ctx.strokeStyle = '#d8e4e0'; ctx.lineWidth = 2.4 * d.s;
        ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, base - 13 * d.s); ctx.stroke();
        ctx.fillStyle = hue[0];
        ctx.beginPath(); ctx.ellipse(px, base - 13 * d.s, 9 * d.s, 5.5 * d.s, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = hue[1];
        ctx.beginPath(); ctx.ellipse(px, base - 12 * d.s, 9 * d.s, 3.4 * d.s, 0, Math.PI, 0); ctx.fill();
        break;
      }
      case 'crys': {
        const pulse = 0.4 + Math.sin(t * 1.8 + d.x * 2) * 0.2;
        const gl = ctx.createRadialGradient(px, base - 10, 0, px, base - 10, 24 * d.s);
        gl.addColorStop(0, `rgba(165,140,245,${0.25 * pulse})`);
        gl.addColorStop(1, 'rgba(165,140,245,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(px, base - 10, 24 * d.s, 0, 7); ctx.fill();
        ctx.fillStyle = d.h < 0.5 ? '#8f7ae0' : '#b39cf5';
        ctx.beginPath();
        ctx.moveTo(px - 6 * d.s, base); ctx.lineTo(px - 2 * d.s, base - 20 * d.s); ctx.lineTo(px + 3 * d.s, base);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + 1 * d.s, base); ctx.lineTo(px + 6 * d.s, base - 12 * d.s); ctx.lineTo(px + 9 * d.s, base);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'vine': {
        ctx.strokeStyle = r.theme === 'fungal' ? '#1e3a28' : '#241f3d';
        ctx.lineWidth = 2;
        const L = d.len * 18;
        const sway = Math.sin(t * 1.4 + d.x) * 4;
        ctx.beginPath();
        ctx.moveTo(px, (d.y) * TILE);
        ctx.quadraticCurveTo(px + sway, (d.y) * TILE + L * 0.6, px + sway * 1.5, (d.y) * TILE + L);
        ctx.stroke();
        ctx.fillStyle = 'rgba(140,200,170,0.5)';
        ctx.beginPath(); ctx.arc(px + sway * 1.5, (d.y) * TILE + L, 2, 0, 7); ctx.fill();
        break;
      }
      case 'lantern': {
        const gl = ctx.createRadialGradient(px, base - 34, 0, px, base - 34, 60);
        gl.addColorStop(0, 'rgba(255,214,150,0.35)');
        gl.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(px, base - 34, 60, 0, 7); ctx.fill();
        ctx.strokeStyle = '#3c455c'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, base - 40); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, base - 40); ctx.quadraticCurveTo(px + 10, base - 48, px + 12, base - 40); ctx.stroke();
        const fy = base - 34 + Math.sin(t * 1.7) * 1.5;
        ctx.fillStyle = '#ffe9c4';
        ctx.beginPath();
        ctx.moveTo(px + 12, fy - 7); ctx.lineTo(px + 16, fy); ctx.lineTo(px + 12, fy + 7); ctx.lineTo(px + 8, fy);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3c455c'; ctx.lineWidth = 1.2; ctx.stroke();
        break;
      }
      case 'bench': {
        const c1 = '#8f9aac', c2 = '#57617a';
        ctx.strokeStyle = c1; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px - 20, base - 10); ctx.lineTo(px + 20, base - 10); ctx.stroke();
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(px - 16, base - 10); ctx.lineTo(px - 16, base); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px + 16, base - 10); ctx.lineTo(px + 16, base); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 20, base - 10);
        ctx.quadraticCurveTo(px - 24, base - 30, px - 8, base - 32);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + 20, base - 10);
        ctx.quadraticCurveTo(px + 24, base - 30, px + 8, base - 32);
        ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(px - 18, base - 6); ctx.lineTo(px + 18, base - 6); ctx.stroke();
        break;
      }
      case 'sign': {
        ctx.strokeStyle = '#4a5570'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, base - 20); ctx.stroke();
        ctx.fillStyle = '#232c42';
        ctx.fillRect(px - 13, base - 34, 26, 16);
        ctx.strokeStyle = '#4a5570'; ctx.lineWidth = 1.4;
        ctx.strokeRect(px - 13, base - 34, 26, 16);
        const pd = dist(G.player.x, G.player.y, px, base - 20);
        if (pd < 170) {
          ctx.globalAlpha = clamp((170 - pd) / 60, 0, 1);
          ctx.fillStyle = '#cdd6e4';
          ctx.font = font(13);
          ctx.textAlign = 'center';
          ctx.fillText(d.text, px, base - 46);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'hint': {
        const pd = dist(G.player.x, G.player.y, px, d.y * TILE);
        if (pd < 230) {
          ctx.globalAlpha = clamp((230 - pd) / 90, 0, 0.85);
          ctx.fillStyle = '#aeb9cc';
          ctx.font = font(14);
          ctx.textAlign = 'center';
          ctx.fillText(d.text, px, d.y * TILE + 8);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'bones': {
        ctx.strokeStyle = 'rgba(150,158,172,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, base, 8 * d.s, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(px + 7 * d.s, base, 5 * d.s, Math.PI, 0); ctx.stroke();
        break;
      }
      case 'candle': {
        const fl = 0.7 + Math.sin(t * 9 + d.x * 3) * 0.3;
        const gl = ctx.createRadialGradient(px, base - 12, 0, px, base - 12, 30);
        gl.addColorStop(0, `rgba(255,200,120,${0.3 * fl})`);
        gl.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(px, base - 12, 30, 0, 7); ctx.fill();
        ctx.fillStyle = '#d8dce4';
        ctx.fillRect(px - 2.4, base - 12, 4.8, 12);
        ctx.fillStyle = '#ffca7a';
        ctx.beginPath(); ctx.ellipse(px, base - 15, 1.8, 3.6 * fl, 0, 0, 7); ctx.fill();
        break;
      }
      case 'throne': {
        ctx.fillStyle = '#1b2233';
        ctx.beginPath();
        ctx.moveTo(px - 26, base);
        ctx.lineTo(px - 26, base - 74);
        ctx.lineTo(px - 16, base - 92);
        ctx.lineTo(px - 6, base - 74);
        ctx.lineTo(px + 6, base - 92);
        ctx.lineTo(px + 16, base - 74);
        ctx.lineTo(px + 26, base - 92);
        ctx.lineTo(px + 26, base);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3a4666'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#12182a';
        ctx.fillRect(px - 20, base - 46, 40, 30);
        break;
      }
      case 'statue': {
        ctx.fillStyle = '#232b40';
        ctx.fillRect(px - 14, base - 8, 28, 8);
        ctx.beginPath();
        ctx.moveTo(px - 10, base - 8); ctx.lineTo(px - 8, base - 44);
        ctx.quadraticCurveTo(px, base - 54, px + 8, base - 44);
        ctx.lineTo(px + 10, base - 8);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3a4666'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 12, base - 6); ctx.lineTo(px + 12, base - 52); ctx.stroke();
        break;
      }
    }
  }
}

function drawGate(ctx, r) {
  if (!r.gate) return;
  const g = r.gate, anim = G.gateAnim;
  if (anim <= 0.01) return;
  const x = g.x * TILE, y = g.y * TILE, h = g.h * TILE * anim;
  ctx.fillStyle = '#2c3346';
  ctx.fillRect(x + 2, y, 4, h);
  for (let i = 1; i < 4; i++) ctx.fillRect(x + 2 + i * 8, y, 3, h);
  ctx.fillStyle = '#454f6a';
  ctx.fillRect(x, y, TILE, 4);
  ctx.fillRect(x, y + h - 5, TILE, 4);
  if (anim > 0.95) {
    ctx.fillStyle = 'rgba(90,110,150,0.25)';
    ctx.fillRect(x, y, TILE, h);
  }
}

function drawTelegraph(ctx, pr) {
  /* 下坠物的地面阴影预警 */
  let gy = null;
  for (let dy = 0; dy < 640; dy += 8) {
    if (solidAtPx(pr.x, pr.y + dy)) { gy = pr.y + dy; break; }
  }
  if (gy === null) return;
  const a = 0.22 + Math.sin(G.time * 18) * 0.12;
  ctx.fillStyle = `rgba(220,230,250,${a})`;
  ctx.beginPath(); ctx.ellipse(pr.x, gy - 2, 16, 5, 0, 0, 7); ctx.fill();
}

function drawGhost(ctx, gh) {
  const a = (1 - gh.t / 0.3) * 0.3;
  ctx.globalAlpha = a;
  if (gh.pose === 'boss') {
    ctx.fillStyle = '#9fb2d8';
    ctx.fillRect(gh.x - gh.w / 2, gh.y - gh.h / 2, gh.w, gh.h);
  } else {
    ctx.save(); ctx.translate(gh.x, gh.y);
    ctx.fillStyle = '#aebbd6';
    ctx.beginPath();
    ctx.moveTo(-5, -8); ctx.quadraticCurveTo(-9, 4, -8, 17);
    ctx.lineTo(8, 17); ctx.quadraticCurveTo(9, 4, 5, -8);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -13, 8, 7.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawSlash(ctx, s) {
  const p = s.t / s.life;
  const R = s.great ? 92 : (s.r || 54);
  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.dir === 'up') ctx.rotate(-Math.PI / 2);
  if (s.dir === 'down') ctx.rotate(Math.PI / 2);
  if (s.face < 0) ctx.scale(-1, 1);
  const a1 = lerp(-1.15, 1.0, p), a0 = a1 - (s.great ? 2.2 : 1.5);
  ctx.globalAlpha = (1 - p) * 0.95;
  ctx.fillStyle = s.enemy ? 'rgba(200,212,240,0.85)' : '#f2f6ff';
  ctx.beginPath();
  ctx.arc(0, 0, R, a0, a1);
  ctx.arc(0, 0, R * (s.great ? 0.6 : 0.55), a1, a0, true);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = s.great ? 3 : 2;
  ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.stroke();
  if (s.great) {
    ctx.globalAlpha = (1 - p) * 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.25, a0, a1);
    ctx.arc(0, 0, R * 0.7, a1, a0, true);
    ctx.closePath(); ctx.fillStyle = '#c9d6f5'; ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFog(ctx, th, camX, camY) {
  ctx.globalAlpha = th.fogA * 1.15;
  const ox1 = (camX * 0.18 + G.time * 7) % 700, oy1 = (camY * 0.1 + G.time * 2) % 320;
  for (let x = -ox1 - 700; x < VW + 700; x += 700) {
    for (let y = -oy1 - 320; y < VH + 320; y += 320) {
      ctx.drawImage(fogCv, x, y);
    }
  }
  ctx.globalAlpha = th.fogA;
  const ox2 = (-camX * 0.1 - G.time * 4) % 700;
  for (let x = -ox2 - 700; x < VW + 700; x += 700) ctx.drawImage(fogCv, x, VH - 300);
  ctx.globalAlpha = 1;
  const gr = ctx.createLinearGradient(0, VH - 130, 0, VH);
  gr.addColorStop(0, th.fog + '0)');
  gr.addColorStop(1, th.fog + '0.1)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, VH - 130, VW, 130);
}

function drawDarkness(ctx, camX, camY) {
  const r = G.room;
  const off = document.createElement('canvas');
  off.width = VW; off.height = VH;
  const c = off.getContext('2d');
  c.fillStyle = 'rgba(3,3,10,0.66)';
  c.fillRect(0, 0, VW, VH);
  c.globalCompositeOperation = 'destination-out';
  const hole = (wx, wy, rad) => {
    const sx = wx - camX, sy = wy - camY;
    if (sx < -rad || sx > VW + rad || sy < -rad || sy > VH + rad) return;
    c.globalAlpha = 0.95;
    c.drawImage(lightCv, sx - rad, sy - rad, rad * 2, rad * 2);
  };
  hole(G.player.x, G.player.y, 215 + Math.sin(G.time * 3) * 6);
  for (const d of r.deco) {
    if (d.t === 'crys') hole(d.x * TILE + 16, (d.y + 1) * TILE - 10, 66);
    if (d.t === 'candle') hole(d.x * TILE + 16, (d.y + 1) * TILE - 12, 58);
  }
  for (const pr of G.projs) if (pr.type === 'spell' || pr.type === 'bullet') hole(pr.x, pr.y, 60);
  if (G.boss) hole(G.boss.x, G.boss.y, 150);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(off, 0, 0);
}

/* ---- UI ---- */
function drawUI(ctx) {
  const p = G.player;
  /* 灵魂容器 */
  const sx = 42, sy = 42, R = 19;
  ctx.fillStyle = '#10141f';
  ctx.beginPath(); ctx.arc(sx, sy, R + 3, 0, 7); ctx.fill();
  ctx.strokeStyle = '#57648a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(sx, sy, R + 3, 0, 7); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.clip();
  ctx.fillStyle = '#1a2130';
  ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
  const lvl = G.soul / 99;
  const top = sy + R - lvl * R * 2;
  ctx.fillStyle = G.soul >= 33 ? '#f2f6ff' : '#aeb6c9';
  ctx.beginPath();
  ctx.moveTo(sx - R, sy + R);
  ctx.lineTo(sx - R, top + Math.sin(G.time * 3) * 1.5);
  ctx.quadraticCurveTo(sx, top + 3 + Math.sin(G.time * 3 + 2) * 2, sx + R, top + Math.sin(G.time * 3 + 4) * 1.5);
  ctx.lineTo(sx + R, sy + R);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  if (G.soul >= 33 && p.hp < p.maxHp) {
    ctx.globalAlpha = 0.35 + Math.sin(G.time * 5) * 0.15;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, R + 6, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* 面具血量 */
  for (let i = 0; i < p.maxHp; i++) {
    const mx = 78 + i * 27, my = 40;
    ctx.save(); ctx.translate(mx, my);
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.quadraticCurveTo(0, -13, 9, -6);
    ctx.quadraticCurveTo(9, 4, 0, 11);
    ctx.quadraticCurveTo(-9, 4, -9, -6);
    ctx.closePath();
    if (i < p.hp) {
      ctx.fillStyle = '#f2f6ff'; ctx.fill();
      ctx.fillStyle = '#0c101a';
      ctx.beginPath(); ctx.ellipse(-3.4, -4.5, 1.5, 2.6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3.4, -4.5, 1.5, 2.6, 0, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#161b28'; ctx.fill();
      ctx.strokeStyle = '#3a4358'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }
  /* 吉欧 */
  ctx.save();
  ctx.translate(VW - 40, 40);
  ctx.fillStyle = '#b8a98c'; ctx.strokeStyle = '#e8dfc8'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 - Math.PI / 2;
    const gx = Math.cos(a) * 8, gy = Math.sin(a) * 8;
    i ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8e2d2';
  ctx.font = font(19, 600);
  ctx.textAlign = 'right';
  ctx.fillText(String(G.geo), -18, 7);
  ctx.restore();
  /* Boss 血条 */
  if (G.boss && !G.boss.dead) {
    const bw = 320, bx = VW / 2 - bw / 2, by = VH - 34;
    ctx.fillStyle = 'rgba(10,13,22,0.8)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
    ctx.fillStyle = '#e8eef8';
    ctx.fillRect(bx, by, bw * clamp(G.boss.hp / G.boss.maxHp, 0, 1), 5);
    ctx.strokeStyle = '#4c5878'; ctx.lineWidth = 1;
    ctx.strokeRect(bx - 2.5, by - 2.5, bw + 5, 10);
  }
  /* 长椅提示 */
  if (G.benchHint) {
    ctx.globalAlpha = 0.7 + Math.sin(G.time * 4) * 0.2;
    ctx.fillStyle = '#dfe6f2';
    ctx.font = font(15);
    ctx.textAlign = 'center';
    ctx.fillText('↓ 休息', G.room.bench.x * TILE + 16, G.room.bench.y * TILE - 26);
    ctx.globalAlpha = 1;
  }
}

function drawOverlays(ctx) {
  const p = G.player;
  /* 房间标题 */
  if (G.roomTitle) {
    const t = G.roomTitle.t;
    const a = t < 0.5 ? t / 0.5 : t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.8) : 1;
    ctx.globalAlpha = a;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8eef8';
    ctx.font = font(38, 600);
    ctx.fillText(G.roomTitle.name, 74, VH - 74);
    ctx.font = font(15);
    ctx.fillStyle = '#8d99b4';
    ctx.fillText(G.roomTitle.sub, 76, VH - 50);
    ctx.fillStyle = 'rgba(141,153,180,0.6)';
    ctx.fillRect(76, VH - 88, 120, 1.5);
    ctx.globalAlpha = 1;
  }
  /* Boss 出场 */
  if (G.banner) {
    const t = G.banner.t;
    const a = t < 0.35 ? t / 0.35 : t > 1.7 ? Math.max(0, 1 - (t - 1.7) / 0.4) : 1;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8d99b4';
    ctx.font = font(17);
    ctx.fillText('— ' + G.banner.title + ' —', VW / 2, VH / 2 - 42);
    ctx.fillStyle = '#f2f6ff';
    ctx.font = font(46, 600);
    ctx.fillText(G.banner.name, VW / 2, VH / 2 + 4);
    ctx.globalAlpha = 1;
  }
  /* 黑边 */
  if (G.letterbox > 0.01) {
    const h = 58 * G.letterbox;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, h);
    ctx.fillRect(0, VH - h, VW, h);
  }
  /* 能力获得 */
  if (G.abilityBanner) {
    const t = G.abilityBanner.t;
    const a = t < 0.4 ? t / 0.4 : t > 3.5 ? Math.max(0, 1 - (t - 3.5) / 0.7) : 1;
    const gr = ctx.createLinearGradient(0, VH - 150, 0, VH);
    gr.addColorStop(0, 'rgba(4,6,12,0)');
    gr.addColorStop(1, `rgba(4,6,12,${0.88 * a})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, VH - 150, VW, 150);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8d99b4';
    ctx.font = font(14);
    ctx.fillText('· 获得新能力 ·', VW / 2, VH - 96);
    ctx.fillStyle = '#f2f6ff';
    ctx.font = font(34, 600);
    ctx.fillText(G.abilityBanner.name, VW / 2, VH - 60);
    ctx.fillStyle = '#b9c2d6';
    ctx.font = font(15);
    ctx.fillText(G.abilityBanner.desc, VW / 2, VH - 34);
    ctx.globalAlpha = 1;
  }
  /* 尾声 */
  if (G.ending) {
    const t = G.ending.t;
    const aIn = clamp(t / 1.2, 0, 1) * (t > 8.4 ? Math.max(0, 1 - (t - 8.4) / 1.2) : 1);
    ctx.fillStyle = `rgba(2,3,8,${aIn * 0.92})`;
    ctx.fillRect(0, 0, VW, VH);
    const lines = ['深渊骑士的力量重归寂静。', '尘封的徽光在长梦中苏醒。', '圣巢的回响，仍在等待新的旅人。', '— 感谢游玩 · HOLLOW ECHO —'];
    ctx.textAlign = 'center';
    lines.forEach((ln, i) => {
      const la = clamp((t - 1 - i * 1.4) / 0.9, 0, 1) * aIn;
      ctx.globalAlpha = la;
      ctx.fillStyle = i === lines.length - 1 ? '#f2f6ff' : '#c9d2e4';
      ctx.font = font(i === lines.length - 1 ? 24 : 21, 600);
      ctx.fillText(ln, VW / 2, VH / 2 - 60 + i * 42);
    });
    ctx.globalAlpha = 1;
  }
  /* 地图 */
  if (G.mapOpen) drawMap(ctx);
  /* 暂停 */
  if (G.paused) {
    ctx.fillStyle = 'rgba(3,5,10,0.78)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2f6ff';
    ctx.font = font(42, 600);
    ctx.fillText('已暂停', VW / 2, 200);
    ctx.font = font(16);
    ctx.fillStyle = '#9aa6bd';
    const lines = [
      'Esc 继续 · N 声音 · M 地图',
      '移动 ←→/AD · 跳跃 Z/空格 · 攻击 X/J · 冲刺 C/L/Shift',
      '聚魂疗伤 长按 V · 灵魂弹 F · 重斩 长按攻击松开',
    ];
    lines.forEach((l, i) => ctx.fillText(l, VW / 2, 260 + i * 30));
  }
  /* 转场/黑屏淡入淡出 */
  let fade = 0;
  if (G.trans) fade = G.trans.phase === 'out' ? G.trans.t / 0.24 : Math.max(0, 1 - G.trans.t / 0.35);
  if (G.black) fade = Math.max(fade, G.black.fired ? Math.max(0, 1 - (G.black.t - G.black.dur) / (G.black.dur * 1.2)) : clamp(G.black.t / G.black.dur, 0, 1));
  if (G.fadePulse > 0) fade = Math.max(fade, G.fadePulse);
  if (G.deathT > 0.9) fade = Math.max(fade, clamp((G.deathT - 0.9) / 0.6, 0, 1));
  if (fade > 0) {
    ctx.fillStyle = `rgba(2,3,7,${clamp(fade, 0, 1)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawMap(ctx) {
  ctx.fillStyle = 'rgba(3,5,10,0.86)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#0b0f1a';
  ctx.strokeStyle = '#3a4666';
  ctx.lineWidth = 1.5;
  ctx.fillRect(170, 60, 620, 420);
  ctx.strokeRect(170, 60, 620, 420);
  ctx.fillStyle = '#e8eef8';
  ctx.font = font(24, 600);
  ctx.textAlign = 'left';
  ctx.fillText('地图', 200, 100);
  ctx.font = font(13);
  ctx.fillStyle = '#8d99b4';
  ctx.textAlign = 'right';
  ctx.fillText('M / Tab 关闭', 762, 100);
  const CW = 128, CH = 96;
  const pos = r => ({ x: 230 + r.mapX * (CW + 18), y: 130 + r.mapY * (CH + 26) });
  /* 连线 */
  ctx.strokeStyle = '#2c3854';
  ctx.lineWidth = 2;
  for (const [a, b] of MAP_LINKS) {
    const ra = pos(ROOMS[a]), rb = pos(ROOMS[b]);
    ctx.beginPath();
    ctx.moveTo(ra.x + CW / 2, ra.y + CH / 2);
    ctx.lineTo(rb.x + CW / 2, rb.y + CH / 2);
    ctx.stroke();
  }
  for (const r of ROOMS) {
    if (!G.visited[r.id]) continue;
    const { x, y } = pos(r);
    ctx.fillStyle = '#1b2336';
    ctx.fillRect(x, y, CW, CH);
    ctx.strokeStyle = r.id === G.roomId ? '#e8eef8' : '#4c5b80';
    ctx.lineWidth = r.id === G.roomId ? 2 : 1.2;
    ctx.strokeRect(x, y, CW, CH);
    ctx.fillStyle = '#8d99b4';
    ctx.font = font(13);
    ctx.textAlign = 'center';
    ctx.fillText(r.name, x + CW / 2, y + CH - 8);
    if (r.bench) {
      ctx.strokeStyle = '#cdd6e4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 16); ctx.lineTo(x + 28, y + 16); ctx.stroke();
    }
    if (r.boss) {
      ctx.fillStyle = G.flags[r.boss.flag] ? '#5a6788' : '#cdd6e4';
      ctx.font = font(16);
      ctx.fillText(G.flags[r.boss.flag] ? '✦' : '☠', x + CW - 20, y + 22);
    }
    if (r.id === G.roomId) {
      const px = x + G.player.x / (r.w * TILE) * CW;
      const py = y + G.player.y / (r.h * TILE) * CH;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(px, py, 7 + Math.sin(G.time * 4) * 2, 0, 7); ctx.stroke();
    }
  }
}

/* ---- 标题画面 ---- */
function drawTitle(ctx) {
  const t = G.time;
  ctx.fillStyle = '#04060b';
  ctx.fillRect(0, 0, VW, VH);
  /* 缓升的孢子 */
  if (G.parts.length < 60 && chance(0.3)) {
    Pfx.add(G, { x: rand(0, VW), y: VH + 10, vx: rand(-6, 6), vy: rand(-16, -5), life: rand(4, 9), t: 0, size: rand(1, 2.4), color: 'rgba(190,205,235,0.5)', grav: 0, home: false, ring: false });
  }
  Pfx.update(G, 1 / 60);
  Pfx.draw(ctx, G);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9edf3';
  ctx.font = font(74, 600);
  ctx.fillText('空 洞 余 响', VW / 2, 176);
  ctx.fillStyle = '#5d6a88';
  ctx.font = font(17);
  ctx.fillText('H  O  L  L  O  W     E  C  H  O', VW / 2, 214);
  ctx.strokeStyle = '#3a4666'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(VW / 2 - 130, 240); ctx.lineTo(VW / 2 + 130, 240); ctx.stroke();
  ctx.fillStyle = '#8d99b4';
  ctx.font = font(15);
  ctx.fillText('✦', VW / 2, 245);
  const rows = [
    ['移动 ←→ / AD', '跳跃 Z / 空格（可二段跳）'],
    ['攻击 X / J（↑↓ 变向）', '冲刺 C / L / Shift'],
    ['聚魂疗伤 长按 V', '地图 M · 暂停 Esc · 静音 N'],
  ];
  ctx.font = font(16);
  rows.forEach((row, i) => {
    ctx.textAlign = 'right'; ctx.fillStyle = '#b9c2d6';
    ctx.fillText(row[0], VW / 2 - 24, 300 + i * 32);
    ctx.textAlign = 'left';
    ctx.fillText(row[1], VW / 2 + 24, 300 + i * 32);
  });
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.3;
  ctx.fillStyle = '#e9edf3';
  ctx.font = font(18, 600);
  ctx.fillText('按任意键，进入梦境', VW / 2, 438);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#4c5878';
  ctx.font = font(12);
  ctx.fillText('击败深渊中的两个守望者，夺回失落的力量', VW / 2, 486);
  ctx.fillText('致敬《空洞骑士》 · 全程序化绘制，无外部素材', VW / 2, 508);
}

/* ============ 主循环 ============ */
function tick(dt) {
  G.frame++;
  if (Input.p('mute')) {
    const m = AUDIO.toggleMute();
    if (G.player) G.addFloat(G.player.x, G.player.y - 50, m ? '声音：关' : '声音：开');
  }
  if (G.state !== 'play') { Input.endFrame(); return; }
  if (Input.p('pause')) { G.paused = !G.paused; AUDIO.play('ui'); }
  if (Input.p('map')) { G.mapOpen = !G.mapOpen; AUDIO.play('ui'); }
  if (G.paused) { Input.endFrame(); return; }
  if (G.hitstop > 0) { G.hitstop -= dt; return; } /* 顿帧期间保留输入缓冲 */
  updatePlay(dt);
  Input.endFrame();
}

let lastT = 0, acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0);
  lastT = now;
  if (G.state === 'title') { G.time += dt; render(); return; }
  if (G.slow) { G.slow.t -= dt; if (G.slow.t <= 0) G.slow = null; }
  acc += dt * (G.slow ? G.slow.scale : 1);
  let guard = 0;
  while (acc >= STEP && guard++ < 6) { acc -= STEP; tick(STEP); }
  render();
}

/* ============ 启动 ============ */
function boot() {
  const cv = document.getElementById('cv');
  G.ctx = cv.getContext('2d');
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    G.cw = cv.width = Math.floor(window.innerWidth * dpr);
    G.ch = cv.height = Math.floor(window.innerHeight * dpr);
    cv.style.width = window.innerWidth + 'px';
    cv.style.height = window.innerHeight + 'px';
    G.scale = Math.min(G.cw / VW, G.ch / VH);
    G.ox = (G.cw - VW * G.scale) / 2;
    G.oy = (G.ch - VH * G.scale) / 2;
  };
  window.addEventListener('resize', resize);
  resize();
  Input.init();
  prerenderStatics();
  window.addEventListener('pointerdown', () => { AUDIO.init(); AUDIO.resume(); });
  window.addEventListener('keydown', () => {
    AUDIO.init(); AUDIO.resume();
    if (G.state === 'title') startGame();
  });
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}
boot();

/* ============ 调试钩子 ============ */
window.__game = {
  G,
  start() { if (G.state === 'title') startGame(); },
  step(n = 1) { for (let i = 0; i < n; i++) tick(STEP); render(); },
  state() {
    return {
      state: G.state, room: G.roomId, roomName: G.room && G.room.name,
      hp: G.player && G.player.hp, soul: G.soul, geo: G.geo,
      x: G.player && Math.round(G.player.x), y: G.player && Math.round(G.player.y),
      flags: JSON.parse(JSON.stringify(G.flags)),
      boss: G.boss ? { hp: G.boss.hp, max: G.boss.maxHp, state: G.boss.state, phase: G.boss.phase } : null,
      enemies: G.enemies.length, projs: G.projs.length, paused: G.paused, trans: !!G.trans,
    };
  },
  teleport(tx, ty, room) {
    if (room !== undefined) loadRoom(room, tx * TILE + 16, ty * TILE + 16);
    else { G.player.x = tx * TILE + 16; G.player.y = ty * TILE + 16; }
  },
  key(code, down = true) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  },
  tap(code) { this.key(code, true); this.step(2); this.key(code, false); this.step(1); },
  hold(code, frames) { this.key(code, true); this.step(frames); this.key(code, false); },
  give(soul = 0, geo = 0) { G.soul = clamp(G.soul + soul, 0, 99); G.geo += geo; },
  hurt(n = 1) { G.player.hurt(n, G.player.x + 10, G); },
  boss() { return G.boss; },
  killBoss() { if (G.boss) G.boss.die(G); },
  unlock(a) { G.flags[a] = true; },
  render: () => render(),
};
