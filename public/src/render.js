// Canvas 描画
import { STAGE, SHIELD_MAX } from './engine.js';

export const SLOT_COLORS = ['#ff4d5e', '#4d8dff', '#ffc933', '#3ddc84'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: -180, z: 1 };
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.panelShake = [0, 0, 0, 0];
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() * 1.6 + 0.3, t: Math.random() * 6 }));
    this.clouds = Array.from({ length: 7 }, (_, i) => ({ x: i / 7 + Math.random() * 0.1, y: 0.25 + Math.random() * 0.35, s: 0.6 + Math.random() * 0.8 }));
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
  }

  // 画面回転などでキャンバスの表示サイズと解像度がずれたら合わせ直す（横長につぶれるのを防ぐ）
  ensureSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height || dpr !== this.dpr) this.resize();
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }
  get compact() { return this.H / this.dpr < 500 || this.W / this.dpr < 700; }

  // ------------------------------------------------------------ イベント → 演出
  handleEvents(events, sfx) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const n = 6 + Math.min(20, Math.floor(e.kb / 8));
          const col = e.strong ? '#fff27a' : '#ffffff';
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(e.dy, e.dx) + (Math.random() - 0.5) * 2.2;
            const sp = 4 + Math.random() * (6 + e.kb / 15);
            this.particles.push({ t: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 18, max: 18, color: col, size: 3 + e.kb / 40 });
          }
          this.particles.push({ t: 'ring', x: e.x, y: e.y, r: 10, vr: 4 + e.kb / 25, life: 14, max: 14, color: e.a.char.accent, size: 5 });
          if (e.strong) { this.shake = Math.max(this.shake, Math.min(22, e.kb / 9)); this.particles.push({ t: 'star', x: e.x, y: e.y, life: 16, max: 16, size: 30 + e.kb / 5, color: '#fff27a' }); }
          else this.shake = Math.max(this.shake, Math.min(6, e.kb / 25));
          this.panelShake[e.d.slot] = 12;
          sfx.hit(e.kb);
          break;
        }
        case 'ko': {
          const tx = 0, ty = -200;
          const a = Math.atan2(ty - e.y, tx - e.x);
          this.particles.push({ t: 'beam', x: e.x, y: e.y, a, life: 50, max: 50, color: e.f.char.color, size: 120 });
          for (let i = 0; i < 40; i++) {
            const b = a + (Math.random() - 0.5) * 1.2;
            const sp = 10 + Math.random() * 25;
            this.particles.push({ t: 'spark', x: e.x, y: e.y, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, life: 40, max: 40, color: i % 2 ? e.f.char.color : '#fff', size: 6 });
          }
          this.shake = 26; this.flash = 10;
          this.panelShake[e.f.slot] = 30;
          sfx.ko();
          break;
        }
        case 'jump':
          if (!e.air) this.dust(e.x, e.y, 5);
          else this.particles.push({ t: 'ring', x: e.x, y: e.y, r: 8, vr: 3, life: 12, max: 12, color: 'rgba(255,255,255,0.8)', size: 3, flat: true });
          sfx.jump();
          break;
        case 'land': this.dust(e.x, e.y, 6); sfx.land(); break;
        case 'bounce': this.dust(e.x, e.y, 10); this.shake = Math.max(this.shake, 6); sfx.land(); break;
        case 'shockwave':
          this.dust(e.x, e.y, 16);
          this.particles.push({ t: 'ring', x: e.x, y: e.y - 10, r: 20, vr: 9, life: 16, max: 16, color: '#f2c14e', size: 8, flat: true });
          this.shake = Math.max(this.shake, 12);
          sfx.hit(120);
          break;
        case 'shieldhit': this.particles.push({ t: 'ring', x: e.x, y: e.y, r: 20, vr: 3, life: 10, max: 10, color: '#9fd8ff', size: 4 }); sfx.shield(); break;
        case 'shieldbreak':
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this.particles.push({ t: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 30, max: 30, color: '#9fd8ff', size: 5 }); }
          this.shake = 14;
          sfx.shieldBreak();
          break;
        case 'counter':
          this.particles.push({ t: 'text', x: e.x, y: e.y - 70, vy: -1, text: 'COUNTER!', life: 45, max: 45, color: '#7ff0ff', size: 34 });
          this.particles.push({ t: 'ring', x: e.x, y: e.y, r: 30, vr: 8, life: 14, max: 14, color: '#7ff0ff', size: 6 });
          sfx.counter();
          break;
        case 'respawn':
          this.particles.push({ t: 'ring', x: e.x, y: e.y - 40, r: 60, vr: -2, life: 25, max: 25, color: '#ffffff', size: 3 });
          break;
        case 'projectile': sfx.projectile(); break;
        case 'swing': sfx.swing(); break;
        case 'ledge': sfx.land(); break;
      }
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.particles.push({ t: 'dust', x: x + dir * Math.random() * 10, y: y - 4, vx: dir * (1 + Math.random() * 3), vy: -Math.random() * 1.5, life: 22, max: 22, color: 'rgba(230,230,240,0.8)', size: 6 + Math.random() * 8 });
    }
  }

  updateParticles() {
    for (const p of this.particles) {
      p.life--;
      if (p.vx !== undefined) { p.x += p.vx; p.y += p.vy; }
      if (p.t === 'spark') { p.vx *= 0.9; p.vy *= 0.9; }
      if (p.t === 'dust') { p.vx *= 0.92; p.size *= 1.02; }
      if (p.t === 'ring') p.r += p.vr;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
    if (this.flash > 0) this.flash--;
    for (let i = 0; i < 4; i++) if (this.panelShake[i] > 0) this.panelShake[i]--;
  }

  // ------------------------------------------------------------ カメラ
  updateCamera(game, instant = false) {
    const fs = game.fighters.filter((f) => f.alive);
    let minX = -500, maxX = 500, minY = -350, maxY = 80;
    if (fs.length) {
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      for (const f of fs) {
        const x = Math.max(-1000, Math.min(1000, f.x));
        const y = Math.max(-800, Math.min(600, f.y));
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y - f.h); maxY = Math.max(maxY, y);
      }
      minX = Math.min(minX, -300); maxX = Math.max(maxX, 300);
      minY = Math.min(minY, -330); maxY = Math.max(maxY, 40);
    }
    const padX = 200, padY = 120;
    const bw = maxX - minX + padX * 2, bh = maxY - minY + padY * 2;
    const vw = this.W / this.baseScale(), vh = this.H / this.baseScale();
    const z = Math.max(0.5, Math.min(1.3, Math.min(vw / bw, vh / bh)));
    const tx = (minX + maxX) / 2, ty = (minY + maxY) / 2 + 40;
    const k = instant ? 1 : 0.08;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.z += (z - this.cam.z) * k;
  }

  baseScale() { return this.H / 720; }
  scale() { return this.baseScale() * this.cam.z; }

  worldToScreen(x, y) {
    const s = this.scale();
    return [(x - this.cam.x) * s + this.W / 2, (y - this.cam.y) * s + this.H / 2];
  }

  // ------------------------------------------------------------ 描画
  draw(game, opts = {}) {
    this.ensureSize();
    const ctx = this.ctx;
    this.time++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground();

    const s = this.scale();
    const sx = (Math.random() - 0.5) * this.shake * this.baseScale();
    const sy = (Math.random() - 0.5) * this.shake * this.baseScale();
    ctx.setTransform(s, 0, 0, s, this.W / 2 - this.cam.x * s + sx, this.H / 2 - this.cam.y * s + sy);

    this.drawStage();
    for (const p of game.projectiles) this.drawProjectile(p);
    const order = [...game.fighters].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
    for (const f of order) if (f.alive) this.drawFighter(f, game);
    this.drawParticles();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOffscreen(game);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash / 20})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    this.drawHUD(game, opts);
    if (opts.banner) this.drawBanner(opts.banner, opts.bannerT ?? 1);
  }

  drawBackground() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0b2e');
    g.addColorStop(0.45, '#3b1f6b');
    g.addColorStop(0.8, '#c2527a');
    g.addColorStop(1, '#f39c6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 星
    const px = -this.cam.x * 0.02;
    for (const st of this.stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.02 + st.t));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      const x = (((st.x * W + px * this.dpr) % W) + W) % W;
      ctx.fillRect(x, st.y * H * 0.8, st.s * this.dpr, st.s * this.dpr);
    }
    // 月
    ctx.fillStyle = 'rgba(255,240,220,0.9)';
    ctx.beginPath();
    ctx.arc(W * 0.8 - this.cam.x * 0.03 * this.dpr, H * 0.2, H * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,220,0.15)';
    ctx.beginPath();
    ctx.arc(W * 0.8 - this.cam.x * 0.03 * this.dpr, H * 0.2, H * 0.11, 0, Math.PI * 2);
    ctx.fill();
    // 遠景の山
    const layer = (par, base, amp, col, seed) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, H);
      const off = -this.cam.x * par * this.dpr;
      for (let x = 0; x <= W + 20; x += 20) {
        const wx = (x - off) / (H * 0.5);
        const y = H * base - (Math.sin(wx * 1.3 + seed) * 0.5 + Math.sin(wx * 3.1 + seed * 2) * 0.25 + Math.sin(wx * 0.7) * 0.4) * H * amp;
        ctx.lineTo(x, y + (-this.cam.y - 180) * par * 0.5 * this.dpr);
      }
      ctx.lineTo(W, H);
      ctx.fill();
    };
    layer(0.05, 0.78, 0.08, 'rgba(60,30,90,0.75)', 1);
    layer(0.1, 0.86, 0.07, 'rgba(35,18,60,0.9)', 4);
    // 雲
    for (const c of this.clouds) {
      c.x += 0.00008;
      if (c.x > 1.2) c.x = -0.2;
      const x = c.x * W, y = c.y * H, r = H * 0.05 * c.s;
      ctx.fillStyle = 'rgba(255,200,220,0.12)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 3, r, 0, 0, Math.PI * 2);
      ctx.ellipse(x + r * 1.5, y - r * 0.4, r * 1.8, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawStage() {
    const ctx = this.ctx, S = STAGE.main;
    // 浮島本体
    ctx.save();
    const grad = ctx.createLinearGradient(0, S.top, 0, S.bottom + 160);
    grad.addColorStop(0, '#5b4a7a');
    grad.addColorStop(0.4, '#3a2c55');
    grad.addColorStop(1, '#1b1330');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(S.left, S.top);
    ctx.lineTo(S.right, S.top);
    ctx.lineTo(S.right, S.top + 40);
    ctx.quadraticCurveTo(S.right - 30, S.bottom, S.right - 150, S.bottom + 60);
    ctx.quadraticCurveTo(0, S.bottom + 230, -S.right + 150, S.bottom + 60);
    ctx.quadraticCurveTo(S.left + 30, S.bottom, S.left, S.top + 40);
    ctx.closePath();
    ctx.fill();
    // 岩の模様
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-300 + i * 110, 40 + (i % 3) * 25);
      ctx.lineTo(-260 + i * 110, 90 + (i % 2) * 40);
      ctx.stroke();
    }
    // 光るクリスタル
    const t = this.time * 0.05;
    for (const [x, y, s] of [[-200, 150, 1], [60, 210, 1.3], [230, 130, 0.8]]) {
      ctx.fillStyle = `rgba(127,240,255,${0.35 + 0.2 * Math.sin(t + x)})`;
      ctx.beginPath();
      ctx.moveTo(x, y - 30 * s); ctx.lineTo(x + 12 * s, y); ctx.lineTo(x, y + 30 * s); ctx.lineTo(x - 12 * s, y);
      ctx.fill();
    }
    // 上面
    ctx.fillStyle = '#8fe3b0';
    ctx.fillRect(S.left, S.top, S.right - S.left, 10);
    ctx.fillStyle = '#4cb87a';
    ctx.fillRect(S.left, S.top + 10, S.right - S.left, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(S.left, S.top, S.right - S.left, 2);
    // すり抜け床
    for (const p of STAGE.platforms) {
      ctx.fillStyle = 'rgba(127,240,255,0.18)';
      ctx.fillRect(p.left, p.y, p.right - p.left, 16);
      ctx.fillStyle = '#c9f6ff';
      ctx.fillRect(p.left, p.y, p.right - p.left, 5);
      ctx.fillStyle = 'rgba(127,240,255,0.5)';
      ctx.fillRect(p.left + 10, p.y + 16, 6, 6);
      ctx.fillRect(p.right - 16, p.y + 16, 6, 6);
    }
    ctx.restore();
  }

  drawProjectile(p) {
    const ctx = this.ctx;
    ctx.save();
    if (p.kind === 'fire') {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `rgba(255,${120 + i * 30},40,${0.25 + i * 0.1})`;
        ctx.beginPath();
        ctx.arc(p.x - p.vx * i * 1.3, p.y + Math.sin(p.age * 0.5 + i) * 3, p.r * (1 - i * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff5c0';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'wind') {
      ctx.strokeStyle = 'rgba(220,255,235,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x - p.facing * 10, p.y, p.r * 1.6, -Math.PI / 2.2, Math.PI / 2.2, p.facing < 0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(46,204,113,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x - p.facing * 22, p.y, p.r * 1.3, -Math.PI / 2.4, Math.PI / 2.4, p.facing < 0);
      ctx.stroke();
    } else if (p.kind === 'orb') {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 1.5);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#c9a3ff');
      g.addColorStop(1, 'rgba(166,107,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(127,240,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.3, p.r * 0.5, p.age * 0.1, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'shock') {
      ctx.strokeStyle = `rgba(242,193,78,${p.life / 6})`;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 15, p.r, p.r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  drawFighter(f, game, opts = {}) {
    const ctx = this.ctx, c = f.char, h = f.h, w = f.w;
    const t = game.frame;
    ctx.save();
    ctx.translate(f.x, f.y);

    // 影
    if (f.x > STAGE.main.left && f.x < STAGE.main.right && f.y <= STAGE.main.top + 1) {
      const dist = STAGE.main.top - f.y;
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.05, 0.3 - dist / 1500)})`;
      ctx.beginPath();
      ctx.ellipse(0, STAGE.main.top - f.y + 2, w * 0.7 * Math.max(0.4, 1 - dist / 600), 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (f.intangible && f.state !== 'respawn' && Math.floor(t / 3) % 2) ctx.globalAlpha = 0.55;
    if (f.state === 'respawn') {
      // 復活台
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.ellipse(0, 4, 50, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SLOT_COLORS[f.slot];
      ctx.beginPath(); ctx.ellipse(0, 4, 40, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.3);
    }

    // 姿勢パラメータ
    let rot = 0, squash = 1;
    const kbSpeed = Math.hypot(f.kbx, f.kby);
    if (f.state === 'hitstun' && kbSpeed > 7) rot = f.stateFrame * 0.35 * f.facing;
    if (f.state === 'jumpsquat') squash = 0.85;
    if (f.state === 'landlag') squash = 0.9;
    if (f.state === 'roll') rot = (f.stateFrame / 26) * Math.PI * 2 * (f.moveData.dir || 1);
    if (f.state === 'attack' && f.move && ['nair', 'cyclone'].includes(f.move.id) && f.moveFrame >= f.move.boxes[0].f0) rot = f.moveFrame * 0.45 * f.facing;
    if (f.state === 'attack' && f.move && f.move.id === 'uspecial' && c.id === 'zephyr' && f.moveFrame > 8) rot = f.moveFrame * 0.5;

    ctx.translate(0, -h / 2);
    ctx.rotate(rot);
    ctx.translate(0, h / 2);
    ctx.scale(f.facing, squash);
    if (f.state === 'spotdodge' && f.stateFrame > 2 && f.stateFrame < 17) ctx.globalAlpha *= 0.4;

    // 攻撃時の手足の目標
    let limb = null;
    if (f.state === 'attack' && f.move && f.move.boxes.length) {
      const b = f.move.boxes.find((bx) => f.moveFrame <= bx.f1) || f.move.boxes[f.move.boxes.length - 1];
      let e;
      if (f.moveFrame < b.f0) e = -0.3 * (f.moveFrame / b.f0);
      else if (f.moveFrame <= b.f1) e = 1;
      else e = Math.max(0, 1 - (f.moveFrame - b.f1) / 8);
      limb = { x: b.ox, y: b.oy, e, leg: b.oy > -25 || f.move.id === 'dair', active: f.moveFrame >= b.f0 && f.moveFrame <= b.f1 };
    }

    const hipY = -h * 0.38, shY = -h * 0.66, headY = -h * 0.82, headR = w * 0.42;
    const run = f.state === 'run' ? Math.sin(f.stateFrame * 0.45) : 0;
    const air = !f.grounded && f.state !== 'ledge';
    const limbW = Math.max(6, w * 0.2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 脚
    const drawLeg = (side, fx, fy) => {
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = limbW;
      ctx.beginPath();
      ctx.moveTo(side * w * 0.16, hipY);
      const kx = (side * w * 0.16 + fx) / 2 + 6, ky = (hipY + fy) / 2;
      ctx.quadraticCurveTo(kx, ky, fx, fy);
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.ellipse(fx + 4, fy - 2, limbW * 0.75, limbW * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    };
    let lf = [-w * 0.2 + run * 16, 0], rf = [w * 0.2 - run * 16, 0];
    if (air) { lf = [-w * 0.15, -h * 0.1]; rf = [w * 0.28, -h * 0.16]; }
    if (f.state === 'ledge') { lf = [w * 0.1, -h * 0.02]; rf = [w * 0.3, -h * 0.1]; }
    if (limb && limb.leg && limb.e > 0) {
      const tx = limb.x * 0.9, ty = Math.min(-4, limb.y);
      rf = [rf[0] + (tx - rf[0]) * limb.e, rf[1] + (ty - rf[1]) * limb.e];
    }
    if (c.id !== 'misty') {
      drawLeg(-1, lf[0], lf[1]);
      drawLeg(1, rf[0], rf[1]);
    } else {
      drawLeg(-1, lf[0] * 0.6, lf[1]);
      drawLeg(1, rf[0], rf[1]);
      // ローブ
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, shY + 8);
      ctx.lineTo(w * 0.35, shY + 8);
      ctx.lineTo(w * 0.55 + run * 3, -h * 0.12);
      ctx.lineTo(-w * 0.55 - run * 3, -h * 0.12);
      ctx.fill();
    }

    // 後ろの腕
    const drawArm = (side, hx, hy, front) => {
      ctx.strokeStyle = front ? c.color : c.dark;
      ctx.lineWidth = limbW * (c.id === 'gant' ? 1.3 : 1);
      ctx.beginPath();
      ctx.moveTo(side * w * 0.3, shY + 6);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.arc(hx, hy, limbW * (c.id === 'gant' ? 0.95 : 0.7), 0, Math.PI * 2); ctx.fill();
    };
    let bh = [-w * 0.45 - run * 10, shY + h * 0.24];
    let fh = [w * 0.45 + run * 10, shY + h * 0.24];
    if (air) { bh = [-w * 0.6, shY - h * 0.05]; fh = [w * 0.55, shY + h * 0.05]; }
    if (f.state === 'ledge') { bh = [w * 0.55, -h * 0.75 - 4]; fh = [w * 0.6, -h * 0.75]; }
    if (f.state === 'shield' || f.state === 'shieldstun') { fh = [w * 0.5, shY]; bh = [w * 0.35, shY + 8]; }
    if (f.state === 'hitstun') { bh = [-w * 0.6, shY - h * 0.15]; fh = [w * 0.1, shY - h * 0.25]; }
    if (limb && !limb.leg && limb.e !== 0) {
      const tx = limb.x * 0.85, ty = limb.y * 0.95;
      const e = limb.e;
      if (e < 0) fh = [fh[0] - 14 * -e * 3, fh[1]];
      else fh = [fh[0] + (tx - fh[0]) * e, fh[1] + (ty - fh[1]) * e];
    }
    drawArm(-1, bh[0], bh[1], false);

    // 胴体
    ctx.fillStyle = c.color;
    const tw = w * (c.id === 'gant' ? 0.95 : 0.78);
    roundRect(ctx, -tw / 2, shY - 4, tw, hipY - shY + 12, tw * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -tw / 2 + 4, shY, tw * 0.35, hipY - shY, tw * 0.2);
    ctx.fill();
    // ベルト
    ctx.fillStyle = c.accent;
    ctx.fillRect(-tw / 2, hipY - 4, tw, 6);
    if (c.id === 'gant') {
      ctx.fillStyle = '#9fb2c6';
      ctx.beginPath(); ctx.arc(-tw / 2, shY + 4, w * 0.2, 0, Math.PI * 2); ctx.arc(tw / 2, shY + 4, w * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // ゼファーのマフラー
    if (c.id === 'zephyr') {
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-2, shY);
      const wave = Math.sin(t * 0.3) * 6;
      const trail = Math.min(1, Math.abs(f.vx) / 6 + (air ? 0.6 : 0.2));
      ctx.quadraticCurveTo(-20 * trail - 10, shY - 4 + wave, -46 * trail - 10, shY + 6 - wave);
      ctx.stroke();
    }

    // 頭
    ctx.fillStyle = c.id === 'gant' ? '#9fb2c6' : '#ffe0c2';
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();

    // 目
    const blink = t % 180 < 6;
    const hurt = f.state === 'hitstun' || f.state === 'dizzy';
    ctx.fillStyle = '#111';
    if (c.id === 'gant') {
      ctx.fillStyle = '#34404f';
      roundRect(ctx, -headR * 0.2, headY - headR * 0.35, headR * 1.15, headR * 0.5, 4); ctx.fill();
      ctx.fillStyle = hurt ? '#ff5050' : '#6ff';
      ctx.fillRect(headR * 0.1, headY - headR * 0.2, headR * 0.7, headR * 0.18);
    } else if (hurt) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5;
      for (const ex of [headR * 0.15, headR * 0.6]) {
        ctx.beginPath(); ctx.moveTo(ex - 4, headY - 6); ctx.lineTo(ex + 4, headY + 2); ctx.moveTo(ex + 4, headY - 6); ctx.lineTo(ex - 4, headY + 2); ctx.stroke();
      }
    } else {
      for (const ex of [headR * 0.15, headR * 0.6]) {
        if (blink) ctx.fillRect(ex - 3, headY - 2, 7, 2);
        else { ctx.beginPath(); ctx.ellipse(ex, headY - 2, 3, 5.5, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    // キャラ別の頭部
    if (c.id === 'blaze') {
      ctx.fillStyle = '#ff7b2e';
      ctx.beginPath();
      ctx.moveTo(-headR, headY - 2);
      for (let i = 0; i <= 5; i++) {
        const a = Math.PI + (i / 5) * Math.PI;
        const r = headR * (i % 2 ? 1.05 : 1.6);
        ctx.lineTo(Math.cos(a) * r - 4, headY + Math.sin(a) * r - 2);
      }
      ctx.lineTo(headR, headY - headR * 0.4);
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.fillRect(-headR, headY - headR * 0.55, headR * 2, 5);
    } else if (c.id === 'zephyr') {
      ctx.fillStyle = c.dark;
      ctx.beginPath(); ctx.arc(0, headY, headR, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      ctx.fillStyle = '#123';
      ctx.fillRect(-headR * 0.2, headY + headR * 0.25, headR * 1.2, headR * 0.5);
    } else if (c.id === 'misty') {
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.ellipse(0, headY - headR * 0.5, headR * 1.6, headR * 0.35, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-headR * 0.9, headY - headR * 0.6);
      ctx.lineTo(headR * 0.9, headY - headR * 0.6);
      ctx.lineTo(-headR * 0.9 - Math.sin(t * 0.1) * 4, headY - headR * 2.6);
      ctx.fill();
      ctx.fillStyle = c.accent;
      star(ctx, -headR * 0.1, headY - headR * 1.2, 5);
      ctx.fillStyle = '#c9a3ff';
      ctx.fillRect(-headR, headY - headR * 0.3, headR * 0.4, headR * 1.4);
    } else if (c.id === 'gant') {
      ctx.fillStyle = c.accent;
      ctx.fillRect(-3, headY - headR - 8, 6, 10);
    }

    // 前の腕
    drawArm(1, fh[0], fh[1], true);

    ctx.restore();

    // 攻撃エフェクト（向きを反映したワールド座標）
    if (f.state === 'attack' && f.move) {
      for (const b of f.activeBoxes()) {
        ctx.save();
        const col = c.accent;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = col;
        ctx.lineWidth = 6;
        ctx.beginPath();
        const start = f.facing > 0 ? -Math.PI * 0.7 : Math.PI * 0.3;
        ctx.arc(b.cx, b.cy, b.r, start, start + Math.PI * 1.2);
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (f.move.counter && f.counterActive()) {
        ctx.save();
        ctx.strokeStyle = 'rgba(127,240,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y - h / 2, h * 0.65, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (f.move.id === 'uspecial' && f.moveFrame > 4 && f.moveFrame < 25) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = c.accent;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(f.x - f.vx * i * 2, f.y - h / 2 - f.vy * i * 2, w * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    // シールド
    if (f.state === 'shield' || f.state === 'shieldstun') {
      const r = (h * 0.32 + 22) * (0.35 + 0.65 * (f.shieldHP / SHIELD_MAX));
      ctx.save();
      const col = SLOT_COLORS[f.slot];
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(f.x, f.y - h / 2, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    // ピヨリ
    if (f.state === 'dizzy') {
      ctx.save();
      ctx.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) {
        const a = t * 0.12 + (i * Math.PI * 2) / 3;
        star(ctx, f.x + Math.cos(a) * 30, f.y - h - 12 + Math.sin(a) * 8, 7);
      }
      ctx.restore();
    }
    // 被弾フラッシュ
    if (f.flash > 0) {
      ctx.save();
      ctx.globalAlpha = f.flash / 12;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(f.x, f.y - h / 2, w * 0.8, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // プレイヤー表示
    if (opts.noTag) return;
    const tagY = f.y - h - (c.id === 'misty' ? 50 : 26);
    ctx.save();
    ctx.fillStyle = SLOT_COLORS[f.slot];
    ctx.beginPath();
    ctx.moveTo(f.x, tagY + 10); ctx.lineTo(f.x - 8, tagY); ctx.lineTo(f.x + 8, tagY);
    ctx.fill();
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const label = f.controller && f.controller.level ? 'CP' : `${f.slot + 1}P`;
    ctx.strokeText(label, f.x, tagY - 4);
    ctx.fillText(label, f.x, tagY - 4);
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = p.life / p.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      switch (p.t) {
        case 'spark':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5); ctx.stroke();
          break;
        case 'dust':
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * a;
          ctx.beginPath();
          if (p.flat) ctx.ellipse(p.x, p.y, Math.max(1, p.r), Math.max(1, p.r * 0.3), 0, 0, Math.PI * 2);
          else ctx.arc(p.x, p.y, Math.max(1, p.r), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'star':
          ctx.fillStyle = p.color;
          star(ctx, p.x, p.y, p.size * (1.2 - a * 0.4));
          break;
        case 'beam': {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          const len = 3000;
          const wdt = p.size * a;
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.3, p.color);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(len, -wdt); ctx.lineTo(len, wdt);
          ctx.fill();
          break;
        }
        case 'text':
          ctx.font = `900 ${p.size}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 6;
          ctx.strokeStyle = '#000';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
          break;
      }
      ctx.restore();
    }
  }

  drawOffscreen(game) {
    const ctx = this.ctx;
    const m = 40 * this.dpr;
    for (const f of game.fighters) {
      if (!f.alive || f.state === 'respawn') continue;
      const [sx, sy] = this.worldToScreen(f.x, f.y - f.h / 2);
      if (sx > 0 && sx < this.W && sy > 0 && sy < this.H) continue;
      const cx = Math.max(m, Math.min(this.W - m, sx));
      const cy = Math.max(m, Math.min(this.H - m, sy));
      const r = 26 * this.dpr;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeStyle = SLOT_COLORS[f.slot];
      ctx.lineWidth = 4 * this.dpr;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.fillStyle = SLOT_COLORS[f.slot];
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 12 * this.dpr), cy + Math.sin(a) * (r + 12 * this.dpr));
      ctx.lineTo(cx + Math.cos(a + 0.5) * r, cy + Math.sin(a + 0.5) * r);
      ctx.lineTo(cx + Math.cos(a - 0.5) * r, cy + Math.sin(a - 0.5) * r);
      ctx.fill();
      ctx.fillStyle = f.char.color;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  drawHUD(game, opts) {
    const ctx = this.ctx, d = this.dpr;
    const n = game.fighters.length;
    const compact = this.compact;
    const pw = Math.min(230 * d, (this.W - 40 * d) / n - 12 * d);
    const ph = (compact ? 62 : 84) * d;
    const total = n * pw + (n - 1) * 14 * d;
    let x0 = (this.W - total) / 2;
    const y0 = this.H - ph - (opts.hudBottom ?? 12) * d;
    for (const f of game.fighters) {
      const shake = this.panelShake[f.slot];
      const jx = shake ? (Math.random() - 0.5) * shake * d : 0;
      const jy = shake ? (Math.random() - 0.5) * shake * d : 0;
      const x = x0 + jx, y = y0 + jy;
      ctx.save();
      ctx.globalAlpha = f.state === 'out' ? 0.45 : 0.92;
      const g = ctx.createLinearGradient(x, y, x, y + ph);
      g.addColorStop(0, 'rgba(20,16,40,0.85)');
      g.addColorStop(1, 'rgba(10,8,20,0.85)');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, pw, ph, 12 * d); ctx.fill();
      ctx.fillStyle = SLOT_COLORS[f.slot];
      roundRect(ctx, x, y, 8 * d, ph, 4 * d); ctx.fill();
      // 顔アイコン
      const ir = ph * 0.3;
      ctx.fillStyle = f.char.color;
      ctx.beginPath(); ctx.arc(x + 12 * d + ir + 4 * d, y + ph / 2, ir, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(ir * 0.9)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.char.name[0], x + 12 * d + ir + 4 * d, y + ph / 2 + 1);
      // 名前
      const tx = x + 16 * d + ir * 2 + 10 * d;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${Math.round((compact ? 11 : 13) * d)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ddd';
      const tag = f.controller && f.controller.level ? `CP Lv${f.controller.level}` : `${f.slot + 1}P`;
      ctx.fillText(`${tag}  ${f.char.name}`, tx, y + (compact ? 16 : 20) * d);
      // ダメージ
      if (f.state === 'out') {
        ctx.font = `900 ${Math.round((compact ? 20 : 26) * d)}px system-ui, sans-serif`;
        ctx.fillStyle = '#888';
        ctx.fillText('OUT', tx, y + ph - 14 * d);
      } else {
        const pct = Math.floor(f.damage);
        ctx.font = `900 italic ${Math.round((compact ? 26 : 36) * d)}px system-ui, sans-serif`;
        ctx.lineWidth = 5 * d;
        ctx.strokeStyle = '#000';
        const s = `${pct}%`;
        const dy = y + ph - (compact ? 16 : 20) * d;
        ctx.strokeText(s, tx, dy);
        ctx.fillStyle = damageColor(pct);
        ctx.fillText(s, tx, dy);
      }
      // ストック
      const sr = 5 * d;
      for (let i = 0; i < Math.min(f.stocks, 8); i++) {
        ctx.fillStyle = f.char.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.arc(x + pw - 14 * d - i * sr * 2.6, y + ph - 12 * d, sr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      x0 += pw + 14 * d;
    }
  }

  drawBanner(text, t) {
    const ctx = this.ctx;
    ctx.save();
    const size = Math.min(this.W / (text.length * 0.7 + 1), this.H * 0.25);
    const sc = 1 + Math.max(0, 1 - t) * 0.6;
    ctx.translate(this.W / 2, this.H * 0.42);
    ctx.scale(sc, sc);
    ctx.font = `900 italic ${Math.round(size)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = '#1a0a2e';
    ctx.strokeText(text, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#fff7c2');
    g.addColorStop(0.5, '#ffd24d');
    g.addColorStop(1, '#ff7b2e');
    ctx.fillStyle = g;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

export function damageColor(p) {
  if (p < 35) return '#ffffff';
  if (p < 70) return '#ffe27a';
  if (p < 110) return '#ffa94d';
  if (p < 150) return '#ff5a3c';
  return '#d0132b';
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// キャラ選択画面用のポートレート描画
export function drawPortrait(canvas, char, frame = 0) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const fake = {
    char, w: char.w, h: char.h, x: 0, y: 0, facing: 1, state: 'idle', stateFrame: frame, grounded: true,
    kbx: 0, kby: 0, vx: 0, vy: 0, flash: 0, slot: 0, moveData: {}, intangible: false, alive: true,
    shieldHP: SHIELD_MAX, activeBoxes: () => [],
  };
  const self = Object.create(Renderer.prototype);
  self.ctx = ctx;
  const s = (H * 0.78) / 140;
  ctx.translate(W / 2, H * 0.95);
  ctx.scale(s, s);
  self.drawFighter(fake, { frame }, { noTag: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
