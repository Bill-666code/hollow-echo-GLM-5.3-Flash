'use strict';
/* 空洞余响 — Boss：残破守卫 & 深渊骑士 */

class Boss {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.hp = 20; this.maxHp = 20;
    this.state = 'idle'; this.st = 1;
    this.flash = 0; this.dead = false;
    this.contact = true; this.invuln = false;
    this.phase = 1; this.face = -1;
    this.t = rand(0, 9); this.grounded = false;
    this.prevB = y + h / 2; this.dropT = 0; this.hitWall = 0;
    this.comboN = 0; this.shots = 0; this.shotT = 0;
  }
  hurt(dmg, dir, g) {
    if (this.dead || this.invuln) return;
    this.hp -= dmg; this.flash = 0.1;
    g.hitstop = Math.max(g.hitstop, 0.05);
    g.shake(3);
    g.soul = Math.min(99, g.soul + 11);
    Pfx.spark(g, this.x + rand(-10, 10), this.y + rand(-16, 16));
    AUDIO.play('bossHit');
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && this.hp > 0) { this.phase = 2; this.onPhase(g); }
    if (this.hp <= 0) this.die(g);
  }
  onPhase(g) {
    this.invuln = true; this.st = 0.9; this.state = 'roar';
    g.shake(9); AUDIO.play('roar');
    Pfx.ring(g, this.x, this.y, 130, '#dfe8ff', 0.7);
    Pfx.burst(g, this.x, this.y, 26, { color: '#dfe8ff', s0: 80, s1: 320, l0: 0.3, l1: 0.8 });
  }
  die(g) {
    this.dead = true;
    g.slow = { t: 0.9, scale: 0.25 };
    g.shake(13); g.whiteFlash = 0.8;
    Pfx.burst(g, this.x, this.y, 56, { color: '#e8ecf2', s0: 100, s1: 440, l0: 0.5, l1: 1.2, grav: 160 });
    Pfx.ring(g, this.x, this.y, 150, '#ffffff', 0.9);
    dropGeo(g, this.x, this.y, 40);
    AUDIO.play('roar'); AUDIO.play('death');
    g.onBossDead(this);
  }
  touchPlayer(g, w, h, ox = 0) {
    const p = g.player;
    return rectHit(this.x + this.face * ox, this.y, w, h, p) && !p.dead;
  }
}

/* ============ Boss 1 残破守卫：挥锤 / 跳跃重击 / 冲锋 ============ */
class BossGuard extends Boss {
  constructor(x, y) {
    super(x, y, 64, 54);
    this.hp = this.maxHp = 26;
    this.armA = 0;       // 锤臂角度
    this.st = 0.8;
  }
  update(dt, g) {
    if (this.dead) return;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    this.st -= dt;
    const p = g.player;
    const dx = p.x - this.x;
    if (!['charge', 'leapAir'].includes(this.state)) this.face = dx < 0 ? -1 : 1;
    const spd = this.phase === 2 ? 1.3 : 1;

    switch (this.state) {
      case 'roar':
        this.vx = appr(this.vx, 0, 800 * dt);
        if (this.st <= 0) { this.invuln = false; this.state = 'idle'; this.st = 0.5; }
        break;
      case 'idle':
        this.vx = appr(this.vx, Math.sign(dx) * 55 * spd, 700 * dt);
        this.armA = appr(this.armA, 0.3, 4 * dt);
        if (this.st <= 0) {
          const d = Math.abs(dx);
          if (d < 150) { this.state = 'windup'; this.st = 0.55 / spd; AUDIO.play('warn'); }
          else if (d < 440 && chance(0.55)) { this.state = 'leapCrouch'; this.st = 0.4 / spd; }
          else { this.state = 'chargeWind'; this.st = 0.7 / spd; AUDIO.play('warn'); }
        }
        break;
      case 'windup':
        this.vx = appr(this.vx, 0, 1300 * dt);
        this.armA = appr(this.armA, -2.3, 9 * dt);
        if (this.st <= 0) { this.state = 'swing'; this.st = 0.22; AUDIO.play('slashBig'); }
        break;
      case 'swing':
        this.armA = appr(this.armA, 1.6, 26 * dt);
        this.vx = appr(this.vx, this.face * 130, 900 * dt);
        if (this.armA > 0.4 && this.touchPlayer(g, 96, 76, 40)) p.hurt(1, this.x, g);
        if (this.st <= 0) { this.state = 'idle'; this.st = rand(0.45, 0.85) / spd; g.shake(2); }
        break;
      case 'leapCrouch':
        this.vx = appr(this.vx, 0, 1300 * dt);
        this.armA = appr(this.armA, -0.8, 6 * dt);
        if (this.st <= 0) {
          this.state = 'leapAir';
          this.vy = -830;
          this.vx = clamp(Math.abs(dx) / 0.62, 180, 540) * Math.sign(dx);
          AUDIO.play('jump');
        }
        break;
      case 'leapAir':
        if (this.grounded && this.t > 0.1) {
          this.state = 'slamRecover'; this.st = 0.7 / spd;
          g.shake(10); AUDIO.play('slam');
          Pfx.dust(g, this.x, this.y + 26, 16, '#4a5670');
          Pfx.ring(g, this.x, this.y + 20, 70, '#cfd8e6', 0.4);
          g.projs.push(new Proj({ type: 'wave', x: this.x + this.w / 2 + 14, y: this.y + this.h / 2 - 12, vx: 400, vy: 0, w: 22, h: 20, life: 3, face: 1 }));
          g.projs.push(new Proj({ type: 'wave', x: this.x - this.w / 2 - 14, y: this.y + this.h / 2 - 12, vx: -400, vy: 0, w: 22, h: 20, life: 3, face: -1 }));
          if (this.phase === 2) {
            for (const off of [-90, 0, 90]) {
              g.projs.push(new Proj({ type: 'debris', x: clamp(p.x + off, 70, g.room.w * TILE - 70), y: 90, vx: 0, vy: 0, w: 20, h: 20, warn: 0.55 + Math.abs(off) * 0.002, life: 4 }));
            }
          }
        }
        break;
      case 'slamRecover':
        this.vx = appr(this.vx, 0, 1000 * dt);
        this.armA = appr(this.armA, 0.3, 5 * dt);
        if (this.st <= 0) { this.state = 'idle'; this.st = rand(0.3, 0.6) / spd; }
        break;
      case 'chargeWind':
        this.vx = appr(this.vx, 0, 1300 * dt);
        if (chance(0.25)) Pfx.dust(g, this.x - this.face * 20, this.y + 24, 2);
        if (this.st <= 0) { this.state = 'charge'; AUDIO.play('roar2'); }
        break;
      case 'charge':
        this.vx = 520 * spd * this.face;
        if (chance(0.4)) Pfx.dust(g, this.x - this.face * 26, this.y + 22, 2);
        if (this.touchPlayer(g, 80, 60, 22)) p.hurt(1, this.x, g);
        if (this.hitWall) {
          this.state = 'stunned'; this.st = 1.5;
          g.shake(9); AUDIO.play('slam');
          Pfx.dust(g, this.x + this.face * 30, this.y, 14, '#4a5670');
          g.projs.push(new Proj({ type: 'debris', x: this.x + this.face * 60, y: 90, vx: 0, vy: 0, w: 20, h: 20, warn: 0.4, life: 4 }));
        }
        break;
      case 'stunned':
        this.vx = appr(this.vx, 0, 900 * dt);
        this.armA = appr(this.armA, 1.9, 5 * dt);
        if (this.st <= 0) { this.state = 'idle'; this.st = 0.3; }
        break;
    }

    this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
    this.prevB = this.y + this.h / 2;
    moveBody(this, dt);
    if (this.grounded) this.coyote = 0.1;
  }
  draw(ctx, g) {
    const f = this.flash > 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face, 1);
    /* 腿 */
    ctx.strokeStyle = f ? '#fff' : '#232a38'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    const sw = this.grounded && Math.abs(this.vx) > 30 ? Math.sin(this.t * 10) * 5 : 0;
    ctx.beginPath(); ctx.moveTo(-14, 18); ctx.lineTo(-16 - sw, 27); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 18); ctx.lineTo(16 + sw, 27); ctx.stroke();
    /* 锤臂 */
    ctx.save();
    ctx.translate(18, -4);
    ctx.rotate(this.armA);
    ctx.strokeStyle = f ? '#fff' : '#3a4254'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, -6); ctx.stroke();
    ctx.fillStyle = f ? '#fff' : '#59637a';
    ctx.save(); ctx.translate(38, -8); ctx.rotate(0.4);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 10, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#232a38'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.restore();
    /* 甲壳身体 */
    ctx.fillStyle = f ? '#ffffff' : '#39415a';
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 25, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#181d29'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = f ? '#ffffff' : '#4b5570';
    ctx.beginPath(); ctx.ellipse(-6, -8, 20, 13, -0.3, 0, 7); ctx.fill();
    /* 头盔 */
    ctx.fillStyle = f ? '#ffffff' : '#59637e';
    ctx.beginPath(); ctx.arc(10, -14, 15, Math.PI * 1.05, Math.PI * 2.12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#181d29'; ctx.lineWidth = 2; ctx.stroke();
    /* 面甲缝隙 + 发光双眼 */
    ctx.fillStyle = '#12151f';
    ctx.fillRect(4, -18, 20, 8);
    const eyeC = this.phase === 2 ? '#ffb14a' : (this.state === 'stunned' ? '#77808f' : '#e8f0ff');
    ctx.fillStyle = this.state === 'stunned' && Math.floor(g.time * 8) % 2 ? '#12151f' : eyeC;
    ctx.beginPath(); ctx.arc(11, -14, 2.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(18, -14, 2.2, 0, 7); ctx.fill();
    /* 眩晕星 */
    if (this.state === 'stunned') {
      for (let i = 0; i < 3; i++) {
        const a = g.time * 6 + i / 3 * Math.PI * 2;
        ctx.fillStyle = '#e8f0ff';
        ctx.beginPath(); ctx.arc(10 + Math.cos(a) * 13, -34 + Math.sin(a) * 4, 1.8, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* ============ Boss 2 深渊骑士：瞬移连斩 / 冲刺突刺 / 灵魂弹幕 ============ */
class BossKnight extends Boss {
  constructor(x, y) {
    super(x, y, 34, 64);
    this.hp = this.maxHp = 34;
    this.alpha = 1; this.st = 1;
    this.dashDist = 0;
  }
  update(dt, g) {
    if (this.dead) return;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    this.st -= dt;
    const p = g.player;
    const dx = p.x - this.x;
    const spd = this.phase === 2 ? 1.25 : 1;

    switch (this.state) {
      case 'roar':
        this.vx = appr(this.vx, 0, 800 * dt);
        if (this.st <= 0) { this.invuln = false; this.state = 'idle'; this.st = 0.6; }
        break;
      case 'idle': {
        this.vx = appr(this.vx, Math.sign(dx) * 85 * spd, 900 * dt);
        this.alpha = appr(this.alpha, 1, 6 * dt);
        if (this.st <= 0) {
          const d = Math.abs(dx);
          const r = Math.random();
          if (d > 330) { this.state = 'blinkOut'; this.st = 0.3; AUDIO.play('blink'); }
          else if (d < 110 || r < 0.45) { this.state = 'comboWind'; this.comboN = 1; this.st = 0.34 / spd; AUDIO.play('warn'); }
          else if (r < 0.75) { this.state = 'dashWind'; this.st = 0.38 / spd; AUDIO.play('warn'); }
          else { this.state = 'volley'; this.st = 1.25; this.shots = 5; this.shotT = 0.2; this.vy = -430; AUDIO.play('jump'); }
        }
        break;
      }
      case 'blinkOut':
        this.vx = appr(this.vx, 0, 1400 * dt);
        this.alpha = Math.max(0, this.st / 0.3);
        if (this.st <= 0) {
          Pfx.burst(g, this.x, this.y, 12, { color: '#cfd8f5', s0: 40, s1: 180, l0: 0.2, l1: 0.5, grav: 0 });
          const side = chance(0.5) ? -1 : 1;
          this.x = clamp(p.x + side * rand(70, 100), 70, g.room.w * TILE - 70);
          this.face = p.x < this.x ? -1 : 1;
          this.state = 'blinkIn'; this.st = 0.26;
          Pfx.burst(g, this.x, this.y, 12, { color: '#cfd8f5', s0: 40, s1: 180, l0: 0.2, l1: 0.5, grav: 0 });
          AUDIO.play('blink');
        }
        break;
      case 'blinkIn':
        this.alpha = appr(this.alpha, 1, 14 * dt);
        if (this.st <= 0) { this.state = 'comboWind'; this.comboN = 1; this.st = 0.3 / spd; AUDIO.play('warn'); }
        break;
      case 'comboWind':
        this.vx = appr(this.vx, 0, 1600 * dt);
        if (this.st <= 0) {
          this.state = 'slashA'; this.st = 0.15;
          AUDIO.play('slash');
          g.slashes.push({ x: this.x + this.face * 34, y: this.y - 4, face: this.face, dir: 'side', t: 0, life: 0.13, hit: new Set(), enemy: true, r: 52 });
        }
        break;
      case 'slashA':
        this.vx = appr(this.vx, this.face * 150, 1200 * dt);
        if (this.touchPlayer(g, 92, 74, 34)) p.hurt(1, this.x, g);
        if (this.st <= 0) {
          if (this.comboN === 1) { this.comboN = 2; this.state = 'comboWind'; this.st = 0.24 / spd; }
          else { this.state = 'idle'; this.st = rand(0.45, 0.8) / spd; }
        }
        break;
      case 'dashWind':
        this.vx = appr(this.vx, 0, 1600 * dt);
        this.face = dx < 0 ? -1 : 1;
        if (this.st <= 0) {
          this.state = 'dashAtk'; this.invuln = true;
          this.vx = 760 * this.face; this.dashDist = 0;
          AUDIO.play('dashBig');
        }
        break;
      case 'dashAtk':
        this.vx = 760 * this.face;
        this.dashDist += Math.abs(this.vx) * dt;
        g.ghosts.push({ x: this.x, y: this.y, face: this.face, t: 0, pose: 'boss', w: this.w, h: this.h });
        if (this.touchPlayer(g, 72, 52, 20)) p.hurt(1, this.x, g);
        if (this.hitWall || this.dashDist > 350) {
          this.state = 'idle'; this.st = rand(0.4, 0.7) / spd; this.invuln = false;
        }
        break;
      case 'volley':
        if (this.st > 0.55) {
          /* 悬浮 */
          this.vy = appr(this.vy, -30, 900 * dt);
          this.shotT -= dt;
          if (this.shotT <= 0 && this.shots > 0) {
            this.shots--; this.shotT = 0.13;
            const a = Math.atan2(p.y - this.y, p.x - this.x) + rand(-0.16, 0.16);
            g.projs.push(new Proj({ type: 'bullet', x: this.x + this.face * 14, y: this.y - 8, vx: Math.cos(a) * 350, vy: Math.sin(a) * 350, w: 13, h: 13, life: 3.4 }));
            AUDIO.play('spell2');
          }
        }
        this.vx = appr(this.vx, 0, 500 * dt);
        if (this.grounded && this.st <= 0) { this.state = 'idle'; this.st = rand(0.4, 0.7) / spd; }
        break;
    }

    if (this.state !== 'volley' || this.st <= 0.55) this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
    this.prevB = this.y + this.h / 2;
    moveBody(this, dt);
    if (this.grounded) this.coyote = 0.1;
  }
  onPhase(g) {
    super.onPhase(g);
    this.alpha = 1;
  }
  draw(ctx, g) {
    if (this.alpha <= 0.02) return;
    const f = this.flash > 0;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.scale(this.face, 1);
    /* 披风残影身体 */
    const wob = Math.sin(this.t * 7) * 2;
    ctx.fillStyle = f ? '#ffffff' : '#0d1119';
    ctx.beginPath();
    ctx.moveTo(-8, -22);
    ctx.quadraticCurveTo(-16 + wob, -4, -13 - Math.abs(wob), 30);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(-13 + Math.abs(wob) + i * 7, 26 + (i % 2) * 6);
      ctx.lineTo(-13 + Math.abs(wob) + (i + 1) * 7, 30);
    }
    ctx.quadraticCurveTo(16 + wob, -4, 8, -22);
    ctx.closePath(); ctx.fill();
    /* 持剑臂 */
    const nailUp = ['dashWind', 'dashAtk', 'volley'].includes(this.state) ? -1.35
      : this.state === 'comboWind' ? -1.9 : 0.35;
    ctx.save();
    ctx.translate(8, -10);
    ctx.rotate(nailUp);
    ctx.strokeStyle = f ? '#ffffff' : '#39424f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 2); ctx.stroke();
    /* 长钉之剑 */
    const glint = this.state === 'comboWind' || this.state === 'dashWind';
    ctx.strokeStyle = glint && Math.floor(g.time * 14) % 2 ? '#ffffff' : (f ? '#ffffff' : '#b9c2cd');
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, 2); ctx.lineTo(58, -2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(58, -4); ctx.stroke();
    ctx.restore();
    /* 苍白面具（有裂痕） */
    ctx.fillStyle = f ? '#ffffff' : '#dfe4ea';
    ctx.beginPath();
    ctx.ellipse(2, -28, 9, 12, 0.06, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,100,115,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -38); ctx.lineTo(-1, -31); ctx.lineTo(-4, -25); ctx.stroke();
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath(); ctx.ellipse(5, -28, 1.8, 3.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.6, -27.4, 1.4, 3.2, 0, 0, 7); ctx.fill();
    /* 头顶双角（细长后掠） */
    ctx.fillStyle = f ? '#ffffff' : '#dfe4ea';
    ctx.beginPath();
    ctx.moveTo(4, -38); ctx.quadraticCurveTo(10, -50, 6, -58);
    ctx.quadraticCurveTo(2, -50, 0, -40); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3, -39); ctx.quadraticCurveTo(-11, -48, -14, -55);
    ctx.quadraticCurveTo(-9, -47, -7, -38); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
