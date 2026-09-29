'use strict';
/* 空洞余响 — 玩家 / 敌人 / 弹道 / 掉落物 / 能力宝珠 */

/* ============ 玩家 ============ */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 20; this.h = 36;
    this.vx = 0; this.vy = 0; this.face = 1;
    this.grounded = false; this.coyote = 0; this.jbuf = 0;
    this.airJumps = 1; this.canDash = true;
    this.dashT = 0; this.dashCd = 0; this.dropT = 0; this.ghostT = 0;
    this.atkCd = 0; this.slashT = 0; this.holding = false; this.holdT = 0;
    this.greatCd = 0; this.spellCd = 0;
    this.invuln = 0; this.focusT = 0; this.restT = 0;
    this.spikeT = 0; this.spikeGrace = 0;
    this.knockT = 0; this.landT = 0; this.runT = 0; this.blink = 0;
    this.hp = 5; this.maxHp = 5;
    this.jumpT = 0;
    this.dead = false; this.deathT = 0;
    this.lastSafe = { x, y }; this.safeT = 0;
    this.prevB = y + this.h / 2;
  }

  hurt(dmg, sx, g) {
    if (this.dead || this.invuln > 0 || this.spikeT > 0) return;
    this.hp -= dmg;
    g.shake(7); g.hitstop = Math.max(g.hitstop, 0.09);
    this.invuln = 1.15; this.focusT = 0; this.dashT = 0;
    const d = this.x < sx ? -1 : 1;
    this.vx = 300 * d; this.vy = -290; this.knockT = 0.22;
    Pfx.burst(g, this.x, this.y, 14, { color: '#f2f6ff', s0: 70, s1: 260, l0: 0.2, l1: 0.5 });
    g.redFlash = 0.4;
    AUDIO.play('hurt');
    if (this.hp <= 0) { this.hp = 0; this.die(g); }
  }

  die(g) {
    this.dead = true; this.deathT = 0;
    Pfx.burst(g, this.x, this.y, 42, { color: '#e8ecf2', s0: 90, s1: 340, l0: 0.4, l1: 1, grav: 220 });
    Pfx.ring(g, this.x, this.y, 90, '#ffffff', 0.6);
    AUDIO.play('death'); g.shake(11);
  }

  doSlash(g, great) {
    const dir = great ? 'side'
      : Input.d('up') ? 'up'
      : (Input.d('down') && !this.grounded) ? 'down' : 'side';
    g.slashes.push({ x: this.x, y: this.y, face: this.face, dir, t: 0, life: great ? 0.2 : 0.14, hit: new Set(), great: !!great });
    this.slashT = great ? 0.2 : 0.14;
    this.atkCd = great ? 0.5 : 0.38;
    AUDIO.play(great ? 'slashBig' : 'slash');
    if (dir === 'side') this.vx += this.face * (great ? 130 : 45);
    if (great) { g.shake(4); g.hitstop = Math.max(g.hitstop, 0.05); }
  }

  update(dt, g) {
    if (this.dead) return;
    for (const k of ['coyote', 'jbuf', 'dashCd', 'dropT', 'atkCd', 'greatCd', 'spellCd', 'invuln', 'knockT', 'landT', 'slashT', 'spikeGrace'])
      this[k] = Math.max(0, this[k] - dt);
    this.blink -= dt;
    if (this.blink < -3) this.blink = 0.12;

    const ax = Input.axis();
    const onGround = this.grounded;
    if (onGround) this.canDash = true;

    /* 尖刺创伤后：失控片刻，再回到安全点 */
    if (this.spikeT > 0) {
      this.spikeT -= dt;
      this.vx = 0; this.vy = 0;
      if (this.spikeT <= 0) {
        this.x = this.lastSafe.x; this.y = this.lastSafe.y;
        this.invuln = Math.max(this.invuln, 0.8);
        g.fadePulse = 0.3;
      }
      return;
    }

    /* 长椅休息 */
    if (this.restT > 0) {
      this.restT -= dt; this.vx = 0; this.vy = 0;
      if (chance(0.3)) Pfx.wisp(g, this.x + rand(-24, 24), this.y + rand(-30, 6));
      return;
    }

    /* 冲刺 */
    if (Input.p('dash') && this.dashCd <= 0 && this.canDash && this.knockT <= 0) {
      const dir = ax !== 0 ? ax : this.face;
      this.face = dir;
      this.dashT = 0.16; this.dashCd = 0.55;
      if (!onGround) this.canDash = false;
      this.focusT = 0;
      this.vx = 780 * dir; this.vy = 0;
      Pfx.dust(g, this.x - dir * 10, this.y + 12, 8);
      AUDIO.play('dash'); g.shake(1.5);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = 780 * this.face; this.vy = 0;
      this.ghostT -= dt;
      if (this.ghostT <= 0) { g.ghosts.push({ x: this.x, y: this.y, face: this.face, t: 0, pose: 'dash' }); this.ghostT = 0.022; }
    } else {
      /* 聚魂（原地疗伤） */
      const wantFocus = Input.d('focus') && onGround && g.soul >= 33 && this.hp < this.maxHp
        && ax === 0 && !Input.p('jump') && this.knockT <= 0;
      if (wantFocus) {
        this.focusT += dt;
        this.vx = appr(this.vx, 0, 3000 * dt);
        if (chance(0.5)) {
          const a = rand(0, Math.PI * 2), r = rand(26, 44);
          Pfx.add(g, { x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r, vx: 0, vy: 0, life: 0.4, t: 0, size: rand(1.4, 2.4), color: '#eef4ff', grav: 0, home: true, ring: false });
        }
        if (this.focusT >= 0.85) {
          this.focusT = 0;
          g.soul -= 33; this.hp++;
          Pfx.ring(g, this.x, this.y, 46, '#ffffff', 0.4);
          Pfx.burst(g, this.x, this.y, 12, { color: '#ffffff', s0: 30, s1: 120, l0: 0.2, l1: 0.5, grav: -60 });
          AUDIO.play('heal');
        }
      } else {
        this.focusT = 0;
        /* 常规移动 */
        if (this.knockT > 0) {
          /* 击退中，保持速度由摩擦衰减 */
        } else {
          const target = ax * 250;
          const acc = onGround ? 2600 : 1700;
          this.vx = appr(this.vx, target, acc * dt);
          if (ax !== 0) this.face = ax;
        }
        /* 跳跃 */
        if (Input.p('jump')) this.jbuf = 0.12;
        if (this.jbuf > 0) {
          if (Input.d('down') && onGround && this.onPlatform(g)) {
            this.dropT = 0.22; this.jbuf = 0;
          } else if (onGround || this.coyote > 0) {
            this.vy = -690; this.jbuf = 0; this.coyote = 0; this.jumpT = 0;
            Pfx.dust(g, this.x, this.y + 16, 5); AUDIO.play('jump');
          } else if (this.airJumps > 0) {
            this.airJumps--; this.vy = -640; this.jbuf = 0; this.jumpT = 0;
            Pfx.ring(g, this.x, this.y + 12, 24, '#dfe8ff', 0.3);
            Pfx.dust(g, this.x, this.y + 12, 4, '#4a5670');
            AUDIO.play('djump');
          }
        }
        if (Input.r('jump') && this.vy < -220 && this.jumpT > 0.05) this.vy = -220;
        if (this.vy < 0) this.jumpT += dt;
        this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
      }
    }

    /* 移动碰撞 */
    const wasGrounded = this.grounded;
    const fallV = this.vy;
    this.prevB = this.y + this.h / 2;
    moveBody(this, dt);
    if (this.grounded) {
      this.coyote = 0.1; this.airJumps = 1;
      if (!wasGrounded && fallV > 460) { Pfx.dust(g, this.x, this.y + 16, 8); g.shake(1); AUDIO.play('land'); }
    }

    /* 攻击 */
    if (Input.p('attack') && this.atkCd <= 0) {
      this.doSlash(g, false);
      this.holding = true; this.holdT = 0;
    }
    if (this.holding) {
      this.holdT += dt;
      if (Input.r('attack')) {
        this.holding = false;
        if (g.flags.great && this.holdT > 0.35 && this.greatCd <= 0 && this.atkCd <= 0) {
          this.greatCd = 2.2;
          this.doSlash(g, true);
        }
      }
    }

    /* 灵魂弹 */
    if (Input.p('spell') && g.flags.spell && g.soul >= 33 && this.spellCd <= 0) {
      this.spellCd = 0.5;
      g.soul -= 33;
      g.projs.push(new Proj({ type: 'spell', x: this.x + this.face * 22, y: this.y - 2, vx: 640 * this.face, vy: 0, dmg: 2, w: 34, h: 16, life: 1.4 }));
      this.vx -= this.face * 190;
      this.slashT = 0.12;
      AUDIO.play('spell'); g.shake(2);
      Pfx.burst(g, this.x + this.face * 26, this.y - 2, 8, { color: '#dfe8ff', s0: 60, s1: 200, l0: 0.15, l1: 0.35, grav: 0 });
    }

    /* 记录安全落点 */
    if (onGround && this.spikeGrace <= 0) {
      this.safeT -= dt;
      if (this.safeT <= 0) { this.lastSafe = { x: this.x, y: this.y - 2 }; this.safeT = 0.3; }
    }

    /* 跑动灰尘与步态计时 */
    if (onGround && Math.abs(this.vx) > 60) {
      this.runT += dt;
      if (chance(0.06)) Pfx.dust(g, this.x - this.face * 8, this.y + 16, 1);
    } else this.runT = 0;
  }

  onPlatform(g) {
    const fy = this.y + this.h / 2 + 2;
    for (const sx of [this.x - 7, this.x + 7]) {
      if (tileChar(Math.floor(sx / TILE), Math.floor(fy / TILE)) === '=') return true;
    }
    return false;
  }

  /* ---- 绘制：苍白小骑士 ---- */
  draw(ctx, g) {
    if (this.dead) return;
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) return;
    const t = g.time;
    const moving = Math.abs(this.vx) > 40 && this.grounded;
    const bob = moving ? Math.sin(this.runT * 14) * 1.6 : Math.sin(t * 2.2) * 0.8;
    let x = this.x, y = this.y + (this.grounded ? 0 : 0) + bob * 0.4;
    ctx.save();
    ctx.translate(x, y);
    if (this.dashT > 0) ctx.scale(1.22, 0.82);
    if (this.restT > 0) ctx.scale(1, 0.9);
    const wob = Math.sin(t * 9 + x * 0.05) * 1.4 + clamp(-this.vx * 0.012, -2.5, 2.5);

    /* 披风身体 */
    ctx.fillStyle = '#0c0f16';
    ctx.beginPath();
    ctx.moveTo(-5.5, -8);
    ctx.quadraticCurveTo(-10 + wob, 2, -9.5 - Math.abs(wob) * 0.6, 17);
    ctx.lineTo(9.5 + Math.abs(wob) * 0.6, 17);
    ctx.quadraticCurveTo(10 + wob, 2, 5.5, -8);
    ctx.closePath(); ctx.fill();

    /* 头部面具 */
    ctx.fillStyle = '#e9edf3';
    ctx.beginPath();
    ctx.ellipse(0, -13, 9.5, 8.5, 0, 0, 7);
    ctx.fill();
    /* 双角 */
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.quadraticCurveTo(-12, -24, -13.5, -31);
    ctx.quadraticCurveTo(-8, -27, -2.5, -20.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, -18);
    ctx.quadraticCurveTo(12, -24, 13.5, -31);
    ctx.quadraticCurveTo(8, -27, 2.5, -20.5);
    ctx.closePath(); ctx.fill();
    /* 眼睛 */
    const blinkK = this.blink > 0 ? 0.15 : 1;
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath(); ctx.ellipse(-3.6, -12.6, 1.9, 3.1 * blinkK, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.6, -12.6, 1.9, 3.1 * blinkK, 0, 0, 7); ctx.fill();
    /* 低血量裂纹 */
    if (this.hp === 1) {
      ctx.strokeStyle = 'rgba(70,80,100,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-1, -20); ctx.lineTo(1.5, -15); ctx.lineTo(-0.5, -11); ctx.stroke();
    }
    /* 聚魂白光 */
    if (this.focusT > 0) {
      ctx.globalAlpha = 0.25 + Math.sin(t * 20) * 0.12;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -4, 20 + Math.sin(t * 14) * 3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* 剑刃（挥砍瞬间） */
    if (this.slashT > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const p = 1 - this.slashT / 0.16;
      const a = this.slashDirA ? this.slashDirA : 0;
      ctx.rotate(this.face > 0 ? 0 : Math.PI);
      ctx.strokeStyle = '#e9edf3'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(6, 0); ctx.lineTo(40, -14 + p * 8);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* ============ 敌人基类 ============ */
class Enemy {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.hp = 2; this.geo = 3;
    this.flash = 0; this.dead = false; this.contact = true;
    this.t = rand(0, 6); this.fly = false;
    this.grounded = false; this.prevB = y + h / 2; this.dropT = 0; this.hitWall = 0;
  }
  hurt(dmg, dir, g) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 0.12;
    if (!this.fly) this.vx = 240 * dir;
    g.soul = Math.min(99, g.soul + 11);
    g.hitstop = Math.max(g.hitstop, 0.045);
    g.shake(2.5);
    Pfx.spark(g, this.x + rand(-6, 6), this.y + rand(-8, 8));
    AUDIO.play('hit');
    if (this.hp <= 0) {
      this.dead = true;
      Pfx.burst(g, this.x, this.y, 18, { color: '#dfe6ee', s0: 60, s1: 260, l0: 0.3, l1: 0.7 });
      Pfx.ring(g, this.x, this.y, 30, '#cfd8e6', 0.3);
      dropGeo(g, this.x, this.y, this.geo);
      AUDIO.play('kill');
    }
  }
  baseUpdate(dt, g) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
  }
}

/* 爬行虫：地面巡逻 */
class Crawlid extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 16);
    this.hp = 2; this.geo = 3;
    this.dir = chance(0.5) ? 1 : -1;
  }
  update(dt, g) {
    this.baseUpdate(dt, g);
    if (this.hitWall) this.dir = -this.hitWall;
    this.vx = this.dir * 42;
    this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
    moveBody(this, dt);
    const fx = this.x + this.dir * (this.w / 2 + 4), fy = this.y + this.h / 2 + 4;
    if (this.grounded && !solidAtPx(fx, fy)) this.dir *= -1;
  }
  draw(ctx) {
    const f = this.flash > 0;
    ctx.save(); ctx.translate(this.x, this.y + Math.sin(this.t * 10) * 0.6);
    ctx.scale(this.dir, 1);
    /* 腿 */
    ctx.strokeStyle = '#1c2230'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const lx = -8 + i * 5, sw = Math.sin(this.t * 11 + i * 2) * 2;
      ctx.beginPath(); ctx.moveTo(lx, 4); ctx.lineTo(lx + sw, 9); ctx.stroke();
    }
    /* 壳 */
    ctx.fillStyle = f ? '#ffffff' : '#c7ced8';
    ctx.beginPath(); ctx.ellipse(0, -1, 12, 8, 0, Math.PI, 0); ctx.lineTo(12, 4); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = f ? '#ffffff' : '#2a3140';
    ctx.beginPath(); ctx.ellipse(0, 3, 12, 3.4, 0, 0, Math.PI); ctx.fill();
    /* 头 */
    ctx.fillStyle = f ? '#ffffff' : '#dde3ea';
    ctx.beginPath(); ctx.arc(12, 0, 4.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath(); ctx.arc(13.4, -0.6, 1.4, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* 复仇蝇：飞行索敌 */
class Vengefly extends Enemy {
  constructor(x, y) {
    super(x, y, 24, 20);
    this.hp = 2; this.geo = 4; this.fly = true;
    this.aggro = false; this.hx = x; this.hy = y;
  }
  update(dt, g) {
    this.baseUpdate(dt, g);
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (!this.aggro && d < 250 && !p.dead) { this.aggro = true; AUDIO.play('fly'); }
    if (this.aggro && (d > 560 || p.dead)) this.aggro = false;
    if (this.aggro) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx = appr(this.vx, Math.cos(a) * 170, 560 * dt);
      this.vy = appr(this.vy, Math.sin(a) * 170 + Math.sin(this.t * 6) * 26, 560 * dt);
    } else {
      this.vx = appr(this.vx, (this.hx - this.x) * 0.4, 160 * dt);
      this.vy = appr(this.vy, (this.hy - this.y) * 0.4 + Math.sin(this.t * 2) * 22, 160 * dt);
    }
    /* 飞行移动 + 撞墙反弹 */
    let nx = this.x + this.vx * dt;
    if (nx !== this.x && solidAtPx(nx + Math.sign(this.vx) * this.w / 2, this.y)) this.vx *= -0.55; else this.x = nx;
    let ny = this.y + this.vy * dt;
    if (ny !== this.y && solidAtPx(this.x, ny + Math.sign(this.vy) * this.h / 2)) this.vy *= -0.55; else this.y = ny;
  }
  draw(ctx) {
    const f = this.flash > 0;
    ctx.save(); ctx.translate(this.x, this.y + Math.sin(this.t * 5) * 2);
    /* 翅膀 */
    const wf = Math.sin(this.t * 34) * 0.7;
    ctx.fillStyle = 'rgba(225,232,242,0.45)';
    ctx.save(); ctx.rotate(-0.5 + wf); ctx.beginPath(); ctx.ellipse(-4, -10, 10, 4, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(0.5 - wf); ctx.beginPath(); ctx.ellipse(4, -10, 10, 4, 0, 0, 7); ctx.fill(); ctx.restore();
    /* 身体 */
    ctx.fillStyle = f ? '#ffffff' : '#a58a6f';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.fillStyle = f ? '#ffffff' : '#6d5a46';
    ctx.beginPath(); ctx.arc(0, 3, 9, 0, Math.PI); ctx.fill();
    /* 眼与悬腿 */
    ctx.fillStyle = '#0d1017';
    ctx.beginPath(); ctx.arc(-3, -2, 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -2, 1.8, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4d3f30'; ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 4, 8); ctx.lineTo(i * 4 + Math.sin(this.t * 9 + i) * 2, 13); ctx.stroke();
    }
    ctx.restore();
  }
}

/* 朽壳者：巡逻 + 追击 */
class Husk extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 34);
    this.hp = 4; this.geo = 8;
    this.dir = chance(0.5) ? 1 : -1;
    this.chase = false;
  }
  update(dt, g) {
    this.baseUpdate(dt, g);
    const p = g.player;
    const dx = p.x - this.x;
    this.chase = !p.dead && Math.abs(dx) < 190 && Math.abs(p.y - this.y) < 70;
    if (this.chase) this.dir = dx > 0 ? 1 : -1;
    else if (this.hitWall) this.dir = -this.hitWall;
    const spd = this.chase ? 115 : 52;
    this.vx = this.dir * spd;
    this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
    moveBody(this, dt);
    if (!this.chase) {
      const fx = this.x + this.dir * (this.w / 2 + 4), fy = this.y + this.h / 2 + 4;
      if (this.grounded && !solidAtPx(fx, fy)) this.dir *= -1;
    }
  }
  draw(ctx) {
    const f = this.flash > 0;
    ctx.save(); ctx.translate(this.x, this.y + (this.grounded ? Math.abs(Math.sin(this.t * 8)) * -1.2 : 0));
    ctx.scale(this.dir, 1);
    /* 躯干 */
    ctx.fillStyle = f ? '#ffffff' : '#565d68';
    ctx.beginPath();
    ctx.moveTo(-9, 16); ctx.quadraticCurveTo(-11, -6, 0, -10);
    ctx.quadraticCurveTo(10, -8, 9, 16);
    ctx.closePath(); ctx.fill();
    /* 手臂垂落 */
    ctx.strokeStyle = f ? '#ffffff' : '#454b56'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(5, -2); ctx.lineTo(8 + Math.sin(this.t * 7) * 1.5, 10); ctx.stroke();
    /* 头 */
    ctx.fillStyle = f ? '#ffffff' : '#cfd5dc';
    ctx.beginPath(); ctx.ellipse(3, -13, 6.4, 5.6, 0.15, 0, 7); ctx.fill();
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath(); ctx.ellipse(4.6, -13, 1.5, 2.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.8, -12.6, 1.2, 2.2, 0, 0, 7); ctx.fill();
    /* 腿 */
    ctx.strokeStyle = f ? '#ffffff' : '#333947'; ctx.lineWidth = 2.6;
    const sw = this.grounded ? Math.sin(this.t * 9) * 3 : 0;
    ctx.beginPath(); ctx.moveTo(-4, 15); ctx.lineTo(-4 - sw, 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 15); ctx.lineTo(4 + sw, 17); ctx.stroke();
    ctx.restore();
  }
}

/* ============ 弹道 ============ */
class Proj {
  constructor(o) {
    Object.assign(this, { t: 0, dead: false, dmg: 1, w: 16, h: 16, life: 3, grav: 0, warn: 0 }, o);
    this.prevB = this.y + this.h / 2;
  }
  update(dt, g) {
    this.t += dt;
    if (this.type === 'debris') {
      if (this.warn > 0) { this.warn -= dt; this.vy = 0; }
      else this.vy = Math.min(this.vy + 2600 * dt, 1150);
    }
    if (this.type === 'wave') {
      /* 沿地面行进的冲击波 */
      this.vy = 0;
      if (!solidAtPx(this.x, this.y + this.h / 2 + 6)) {
        let found = false;
        for (let dy = 0; dy <= 56; dy += 8) {
          if (solidAtPx(this.x, this.y + this.h / 2 + 6 + dy)) { this.y += dy; found = true; break; }
        }
        if (!found) this.dead = true;
      } else {
        for (let dy = 0; dy <= 56; dy += 8) {
          if (!solidAtPx(this.x, this.y + this.h / 2 + 6 - dy)) { this.y -= dy; break; }
        }
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > this.life) this.dead = true;
    if (solidAtPx(this.x, this.y)) {
      this.dead = true;
      Pfx.dust(g, this.x, this.y, 5, this.type === 'spell' ? '#dfe8ff' : '#4a5670');
      if (this.type === 'debris') { Pfx.burst(g, this.x, this.y, 10, { color: '#6a7488', s0: 40, s1: 180 }); g.shake(3); AUDIO.play('slam'); }
    }
  }
  draw(ctx, g) {
    const p = this;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.type === 'spell') {
      /* 魂之利刃：幽灵波浪 */
      const k = Math.min(1, p.t * 6);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#e6edfb';
      ctx.beginPath();
      ctx.moveTo(-p.face * 20 * k, -10);
      ctx.quadraticCurveTo(0, -14, p.face * 18, -7);
      ctx.quadraticCurveTo(p.face * 26, 0, p.face * 18, 7);
      ctx.quadraticCurveTo(0, 12, -p.face * 20 * k, 10);
      ctx.quadraticCurveTo(-p.face * 6, 0, -p.face * 20 * k, -10);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,140,200,0.55)';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, 7); ctx.fill();
      if (chance(0.4)) Pfx.wisp(g, p.x - p.face * 14, p.y + rand(-6, 6));
    } else if (p.type === 'bullet') {
      ctx.fillStyle = '#cfd8f5';
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(90,100,160,0.4)';
      ctx.beginPath(); ctx.arc(0, 0, 10 + Math.sin(g.time * 18) * 2, 0, 7); ctx.fill();
    } else if (p.type === 'debris') {
      if (p.warn > 0) {
        ctx.globalAlpha = 0.4 + Math.sin(g.time * 26) * 0.25;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke();
      } else {
        ctx.rotate(p.t * 7);
        ctx.fillStyle = '#5a6478';
        ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(9, -10); ctx.lineTo(11, 7); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#2c3342'; ctx.lineWidth = 1.6; ctx.stroke();
      }
    } else if (p.type === 'wave') {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#dfe8f5';
      ctx.beginPath();
      ctx.moveTo(-p.face * 12, -2);
      ctx.quadraticCurveTo(0, -26 - Math.sin(g.time * 30) * 4, p.face * 14, -2);
      ctx.lineTo(p.face * 8, 0); ctx.lineTo(-p.face * 8, 0);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.ellipse(0, -2, 14, 4, 0, 0, 7); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

/* ============ 吉欧（货币） ============ */
class GeoDrop {
  constructor(x, y, val) {
    this.x = x; this.y = y; this.val = val;
    const a = rand(-Math.PI, 0);
    this.vx = Math.cos(a) * rand(60, 190);
    this.vy = Math.sin(a) * rand(120, 260);
    this.t = 0; this.dead = false; this.spin = rand(-6, 6); this.rot = 0;
  }
  update(dt, g) {
    this.t += dt; this.rot += this.spin * dt;
    if (this.t > 0.45 && !g.player.dead) {
      const dx = g.player.x - this.x, dy = g.player.y - this.y, d = Math.hypot(dx, dy) || 1;
      this.vx = appr(this.vx, dx / d * 720, 2800 * dt);
      this.vy = appr(this.vy, dy / d * 720, 2800 * dt);
      if (d < 20) { this.dead = true; g.geo += this.val; AUDIO.play('geo'); return; }
    } else {
      this.vy += 1500 * dt;
    }
    let nx = this.x + this.vx * dt;
    if (solidAtPx(nx, this.y)) { this.vx *= -0.5; } else this.x = nx;
    let ny = this.y + this.vy * dt;
    if (solidAtPx(this.x, ny)) { this.vy *= -0.42; this.vx *= 0.8; if (Math.abs(this.vy) < 40) this.vy = 0; } else this.y = ny;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot * 0.4);
    ctx.fillStyle = '#b8a98c'; ctx.strokeStyle = '#e8dfc8'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const px = Math.cos(a) * 4.6, py = Math.sin(a) * 4.6;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

/* ============ 能力宝珠 ============ */
class Orb {
  constructor(x, y, flag, name, desc) {
    this.x = x; this.y = y; this.flag = flag; this.name = name; this.desc = desc;
    this.t = 0; this.dead = false;
  }
  update(dt, g) {
    this.t += dt;
    this.by = Math.sin(this.t * 2.4) * 6;
    if (chance(0.25)) Pfx.wisp(g, this.x + rand(-18, 18), this.y + this.by + rand(-18, 18));
    if (dist(this.x, this.y + this.by, g.player.x, g.player.y) < 34) {
      this.dead = true;
      g.flags[this.flag] = true;
      g.player.hp = g.player.maxHp;
      g.soul = 0; g.geo += 0;
      g.abilityBanner = { name: this.name, desc: this.desc, t: 0 };
      Pfx.ring(g, this.x, this.y, 120, '#ffffff', 0.8);
      Pfx.burst(g, this.x, this.y, 40, { color: '#ffffff', s0: 80, s1: 380, l0: 0.4, l1: 1 });
      AUDIO.play('orb'); g.shake(5); g.whiteFlash = 0.5;
      if (this.end) g.endingAt = g.time + 4.5;
    }
  }
  draw(ctx, g) {
    const y = this.y + this.by;
    ctx.save(); ctx.translate(this.x, y);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
    glow.addColorStop(0, 'rgba(240,246,255,0.9)');
    glow.addColorStop(0.35, 'rgba(180,200,255,0.35)');
    glow.addColorStop(1, 'rgba(180,200,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(g.time * 5) * 1.5, 0, 7); ctx.fill();
    /* 环绕碎片 */
    for (let i = 0; i < 5; i++) {
      const a = g.time * 1.6 + i / 5 * Math.PI * 2;
      const r = 20 + Math.sin(g.time * 3 + i) * 3;
      ctx.fillStyle = 'rgba(230,238,252,0.85)';
      ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r * 0.6); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3, 2); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

function dropGeo(g, x, y, val) {
  const n = Math.min(6, Math.max(1, Math.round(val / 2)));
  for (let i = 0; i < n; i++) g.geos.push(new GeoDrop(x + rand(-8, 8), y + rand(-8, 4), Math.max(1, Math.round(val / n))));
}
