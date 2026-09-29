'use strict';
/* 空洞余响 Hollow Echo — 共享常量 / 工具 / 输入 / 粒子 */

const TILE = 32, VW = 960, VH = 540, STEP = 1 / 60;
const GRAV = 2100, MAXFALL = 920;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const appr = (v, t, amt) => v < t ? Math.min(v + amt, t) : Math.max(v - amt, t);
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const chance = p => Math.random() < p;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const aabb = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
const rectHit = (x, y, w, h, b) => Math.abs(x - b.x) * 2 < w + b.w && Math.abs(y - b.y) * 2 < h + b.h;
function mulberry32(s) {
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ============ 输入 ============ */
const KEYMAP = {
  left:   ['ArrowLeft', 'KeyA'],
  right:  ['ArrowRight', 'KeyD'],
  up:     ['ArrowUp', 'KeyW'],
  down:   ['ArrowDown', 'KeyS'],
  jump:   ['KeyZ', 'KeyK', 'Space'],
  attack: ['KeyX', 'KeyJ'],
  dash:   ['KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight'],
  focus:  ['KeyV', 'KeyH'],
  spell:  ['KeyF'],
  map:    ['KeyM', 'Tab'],
  pause:  ['Escape', 'KeyP'],
  mute:   ['KeyN'],
};
const CODE2ACT = {};
for (const act in KEYMAP) for (const c of KEYMAP[act]) CODE2ACT[c] = act;
const BLOCK_DEFAULT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab']);

const Input = {
  down: {}, pressed: {}, released: {},
  init() {
    window.addEventListener('keydown', e => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      const act = CODE2ACT[e.code];
      if (act) {
        if (!this.down[act]) this.pressed[act] = true;
        this.down[act] = true;
      }
    });
    window.addEventListener('keyup', e => {
      const act = CODE2ACT[e.code];
      if (act) { this.down[act] = false; this.released[act] = true; }
    });
    window.addEventListener('blur', () => { this.down = {}; });
  },
  d(a) { return !!this.down[a]; },
  p(a) { return !!this.pressed[a]; },
  r(a) { return !!this.released[a]; },
  axis() { return (this.d('right') ? 1 : 0) - (this.d('left') ? 1 : 0); },
  endFrame() { this.pressed = {}; this.released = {}; },
};

/* ============ 粒子 ============ */
const Pfx = {
  add(g, p) { if (g.parts.length < 800) g.parts.push(p); },
  burst(g, x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(o.a0 ?? 0, o.a1 ?? Math.PI * 2), sp = rand(o.s0 ?? 40, o.s1 ?? 200);
      Pfx.add(g, {
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
        life: rand(o.l0 ?? 0.3, o.l1 ?? 0.7), t: 0,
        size: rand(o.sz0 ?? 1.5, o.sz1 ?? 3.5), color: o.color || '#cfd8e6',
        grav: o.grav ?? 260, home: false, ring: false,
      });
    }
  },
  dust(g, x, y, n = 6, color = '#39435a') {
    for (let i = 0; i < n; i++) Pfx.add(g, {
      x: x + rand(-8, 8), y: y + rand(-3, 2), vx: rand(-70, 70), vy: rand(-90, -10),
      life: rand(0.25, 0.55), t: 0, size: rand(2, 4.5), color, grav: 60, home: false, ring: false,
    });
  },
  spark(g, x, y) {
    Pfx.burst(g, x, y, 8, { color: '#ffffff', s0: 90, s1: 320, l0: 0.12, l1: 0.3, grav: 120, sz0: 1, sz1: 2.6 });
    Pfx.add(g, { x, y, vx: 0, vy: 0, life: 0.14, t: 0, size: 9, color: '#ffffff', grav: 0, home: false, ring: true, r1: 26 });
  },
  ring(g, x, y, r1, color = '#dfe8ff', life = 0.35) {
    Pfx.add(g, { x, y, vx: 0, vy: 0, life, t: 0, size: 3, color, grav: 0, home: false, ring: true, r1 });
  },
  wisp(g, x, y) { // 灵魂光点（飞向玩家）
    Pfx.add(g, { x, y, vx: rand(-60, 60), vy: rand(-60, 0), life: 0.9, t: 0, size: rand(1.6, 2.8), color: '#eef4ff', grav: 0, home: true, ring: false });
  },
  update(g, dt) {
    const arr = g.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i]; p.t += dt;
      if (p.t >= p.life) { arr.splice(i, 1); continue; }
      if (p.ring) continue;
      if (p.home && g.player && !g.player.dead) {
        const dx = g.player.x - p.x, dy = g.player.y - p.y, d = Math.hypot(dx, dy) || 1;
        p.vx += dx / d * 1900 * dt; p.vy += dy / d * 1900 * dt;
        p.vx = clamp(p.vx, -760, 760); p.vy = clamp(p.vy, -760, 760);
      }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  },
  draw(ctx, g) {
    for (const p of g.parts) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      if (p.ring) {
        const r = (p.r1 || 30) * (p.t / p.life);
        ctx.strokeStyle = p.color; ctx.lineWidth = 2 * k + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
};
