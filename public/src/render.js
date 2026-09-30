// Canvas 描画
import { STAGE, SHIELD_MAX, setStage, updatePlatforms, hazardState, STADIUM_FORMS } from './engine.js';

export const SLOT_COLORS = ['#ff4d5e', '#4d8dff', '#ffc933', '#3ddc84'];

// ステージごとの見た目
const THEMES = {
  stadium: {
    sky: ['#0a1030', '#1b2a5c', '#3a4a8a', '#5a6ab0'], stars: 0.6, orb: 'none', crowd: true,
    body: ['#6a7488', '#4a5264', '#252a36'], top: ['#b8e986', '#7cb342'], plat: ['rgba(255,255,255,0.18)', '#e8f0ff'], deco: 'stadium', shape: 'block',
  },
  stadium_ice: {
    sky: ['#0b2238', '#1f4d73', '#6aa8d8', '#cfe9ff'], stars: 0, orb: 'none', crowd: true, snow: true,
    body: ['#9fc7e8', '#6f9fc8', '#3a6a96'], top: ['#f4fbff', '#bfe3ff'], plat: ['rgba(200,240,255,0.4)', '#ffffff'], deco: 'stadium', shape: 'block',
  },
  stadium_moon: {
    sky: ['#000005', '#050520', '#101035', '#1a1a45'], stars: 1.3, orb: 'earth', crowd: false,
    body: ['#9a9aa8', '#6a6a78', '#3a3a48'], top: ['#d8d8e0', '#a8a8b8'], plat: ['rgba(255,255,255,0.15)', '#e0e0ea'], deco: 'crater', shape: 'block',
  },
  highway: {
    sky: ['#2a1a4a', '#7a3a6a', '#e0705a', '#ffc070'], stars: 0.3, orb: 'sun', orbColor: 'rgba(255,200,120,0.95)', orbGlow: 'rgba(255,160,90,0.25)',
    hills: ['rgba(90,50,90,0.7)', 'rgba(50,30,60,0.9)'], hillAmp: 0.14, clouds: 'rgba(255,190,160,0.25)', cityLights: true,
    body: ['#3a3a44', '#26262e', '#141418'], top: ['#55555f', '#3a3a44'], plat: ['#2e6b3a', '#e8f5e9'], deco: 'road', shape: 'road',
  },
  airship: {
    sky: ['#3a8ad8', '#6ab4f0', '#aee0ff', '#e8f7ff'], stars: 0, orb: 'sun', orbColor: 'rgba(255,255,230,0.95)', orbGlow: 'rgba(255,250,200,0.3)',
    clouds: 'rgba(255,255,255,0.8)', cloudSpeed: 0.0012, seaOfClouds: true,
    body: ['#a0683a', '#7a4a24', '#4a2a10'], top: ['#d8a86a', '#b0804a'], plat: ['#8a5a2a', '#e0b070'], deco: 'ship', shape: 'ship',
  },
  sky: {
    sky: ['#0d0b2e', '#3b1f6b', '#c2527a', '#f39c6b'], stars: 1, orb: 'moon', orbColor: 'rgba(255,240,220,0.9)', orbGlow: 'rgba(255,240,220,0.15)',
    hills: ['rgba(60,30,90,0.75)', 'rgba(35,18,60,0.9)'], clouds: 'rgba(255,200,220,0.12)',
    body: ['#5b4a7a', '#3a2c55', '#1b1330'], top: ['#8fe3b0', '#4cb87a'], plat: ['rgba(127,240,255,0.18)', '#c9f6ff'], deco: 'crystal',
  },
  final: {
    sky: ['#02010a', '#0b0830', '#1d1452', '#2b1a66'], stars: 1.2, orb: 'planet',
    body: ['#3a4a7a', '#1f2850', '#0b1030'], top: ['#b8f4ff', '#4fb6d8'], plat: ['rgba(127,240,255,0.2)', '#c9f6ff'], deco: 'tech', shape: 'block',
  },
  forest: {
    sky: ['#5db8f5', '#9fd8ff', '#d8f1ff', '#fff3cf'], stars: 0, orb: 'sun', orbColor: 'rgba(255,250,210,0.95)', orbGlow: 'rgba(255,240,170,0.25)',
    hills: ['rgba(90,160,110,0.7)', 'rgba(50,120,70,0.85)'], hillAmp: 0.1, clouds: 'rgba(255,255,255,0.65)',
    body: ['#8a5a35', '#6b4423', '#3e2512'], top: ['#7ed957', '#4ea83a'], plat: ['#6b4423', '#9be07a'], deco: 'roots',
  },
  volcano: {
    sky: ['#1a0505', '#4a0d0d', '#a3260e', '#ff7a1a'], stars: 0, orb: 'none',
    hills: ['rgba(60,15,10,0.85)', 'rgba(30,8,6,0.95)'], hillAmp: 0.12, embers: true,
    body: ['#4a3530', '#2e201d', '#140c0a'], top: ['#9a7a6a', '#5a4038'], plat: ['#3a2a28', '#8a6a5a'], deco: 'lava',
  },
};

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
        case 'grab':
          this.particles.push({ t: 'ring', x: e.x, y: e.y, r: 12, vr: 3, life: 12, max: 12, color: '#ffffff', size: 4 });
          sfx.grab();
          break;
        case 'ledge': sfx.land(); break;
        case 'hazardWarn': sfx.warn(); break;
        case 'hazard':
          if (e.kind === 'lava') { sfx.roar(); this.shake = Math.max(this.shake, 14); }
          else if (e.kind === 'car') sfx.horn();
          else if (e.kind === 'wind') sfx.wind();
          break;
        case 'stageForm':
          this.flash = 14; this.shake = Math.max(this.shake, 8);
          sfx.transform();
          break;
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
    if (game.stageId) { setStage(game.stageId); updatePlatforms(game.frame); }
    this.gameFrame = game.frame || 0;
    const ctx = this.ctx;
    this.time++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground();

    const s = this.scale();
    const sx = (Math.random() - 0.5) * this.shake * this.baseScale();
    const sy = (Math.random() - 0.5) * this.shake * this.baseScale();
    ctx.setTransform(s, 0, 0, s, this.W / 2 - this.cam.x * s + sx, this.H / 2 - this.cam.y * s + sy);

    this.drawStage();
    this.drawHazards();
    for (const p of game.projectiles) this.drawProjectile(p);
    const order = [...game.fighters].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
    for (const f of order) if (f.alive) this.drawFighter(f, game);
    this.drawParticles();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOffscreen(game);
    this.drawHazardOverlay();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash / 20})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    this.drawHUD(game, opts);
    if (opts.banner) this.drawBanner(opts.banner, opts.bannerT ?? 1);
  }

  theme() {
    if (STAGE.id === 'stadium') return STAGE.form === 2 ? THEMES.stadium_ice : STAGE.form === 3 ? THEMES.stadium_moon : THEMES.stadium;
    return THEMES[STAGE.id] || THEMES.sky;
  }

  drawBackground() {
    const ctx = this.ctx, W = this.W, H = this.H, T = this.theme();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    T.sky.forEach((c, i) => g.addColorStop(i / (T.sky.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 星
    if (T.stars) {
      const px = -this.cam.x * 0.02;
      for (const st of this.stars) {
        const a = (0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.02 + st.t))) * T.stars;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        const x = (((st.x * W + px * this.dpr) % W) + W) % W;
        ctx.fillRect(x, st.y * H * 0.8, st.s * this.dpr, st.s * this.dpr);
      }
    }
    // 月・太陽・惑星
    const ox = W * 0.8 - this.cam.x * 0.03 * this.dpr, oy = H * 0.2, r = H * 0.07;
    if (T.orb === 'moon' || T.orb === 'sun') {
      ctx.fillStyle = T.orbColor;
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = T.orbGlow;
      ctx.beginPath(); ctx.arc(ox, oy, r * (T.orb === 'sun' ? 1.9 : 1.6), 0, Math.PI * 2); ctx.fill();
    } else if (T.orb === 'earth') {
      const eg = ctx.createRadialGradient(ox - r * 0.5, oy - r * 0.5, r * 0.3, ox, oy, r * 1.8);
      eg.addColorStop(0, '#9fe0ff'); eg.addColorStop(0.5, '#2f7fd0'); eg.addColorStop(1, '#0a2a60');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(ox, oy, r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(90,190,110,0.8)';
      ctx.beginPath(); ctx.ellipse(ox - r * 0.4, oy - r * 0.2, r * 0.6, r * 0.35, 0.5, 0, Math.PI * 2); ctx.ellipse(ox + r * 0.6, oy + r * 0.5, r * 0.5, r * 0.3, -0.3, 0, Math.PI * 2); ctx.fill();
    } else if (T.orb === 'planet') {
      const pg = ctx.createRadialGradient(ox - r * 0.4, oy - r * 0.4, r * 0.2, ox, oy, r * 1.6);
      pg.addColorStop(0, '#ffb3e6'); pg.addColorStop(0.6, '#7a3fb8'); pg.addColorStop(1, '#2a1150');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(ox, oy, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,255,0.55)';
      ctx.lineWidth = r * 0.18;
      ctx.beginPath(); ctx.ellipse(ox, oy, r * 2.8, r * 0.7, -0.35, 0, Math.PI * 2); ctx.stroke();
      // 銀河の帯
      ctx.save();
      ctx.globalAlpha = 0.18;
      const gg = ctx.createLinearGradient(0, H * 0.7, W, H * 0.1);
      gg.addColorStop(0, 'rgba(120,80,255,0)'); gg.addColorStop(0.5, '#b58cff'); gg.addColorStop(1, 'rgba(120,80,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.ellipse(W * 0.45, H * 0.4, W * 0.6, H * 0.1, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
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
    if (T.cityLights) {
      for (let i = 0; i < 70; i++) {
        const lx = ((i * 97.3 + 13) % 100) / 100 * W - this.cam.x * 0.04 * this.dpr;
        const ly = H * (0.74 + ((i * 37) % 10) / 100);
        ctx.fillStyle = `rgba(255,${200 + (i % 3) * 20},120,${0.4 + 0.4 * Math.abs(Math.sin(this.time * 0.03 + i))})`;
        ctx.fillRect(((lx % W) + W) % W, ly, 2.5 * this.dpr, 2.5 * this.dpr);
      }
    }
    if (T.crowd) {
      // スタジアムの観客席と大型ビジョン
      ctx.fillStyle = 'rgba(10,14,30,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.62);
      ctx.quadraticCurveTo(W / 2, H * 0.48, W, H * 0.62);
      ctx.lineTo(W, H); ctx.lineTo(0, H);
      ctx.fill();
      for (let i = 0; i < 160; i++) {
        const cx = (i / 160) * W;
        const cy = H * (0.6 - 0.1 * Math.sin((i / 160) * Math.PI)) + (i % 4) * H * 0.018 + Math.sin(this.time * 0.15 + i) * 1.5 * this.dpr;
        ctx.fillStyle = ['#e57373', '#64b5f6', '#ffd54f', '#81c784', '#ba68c8'][i % 5];
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(cx, cy, 3.2 * this.dpr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const bw = W * 0.2, bh = H * 0.12, bx = W / 2 - bw / 2, by = H * 0.08;
      ctx.fillStyle = '#111'; ctx.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
      ctx.fillStyle = '#1d3b6a'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(bh * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(STADIUM_FORMS[STAGE.form] || '', W / 2, by + bh / 2);
      for (const lx of [0.08, 0.92]) {
        ctx.fillStyle = 'rgba(255,255,220,0.9)';
        ctx.beginPath(); ctx.arc(W * lx, H * 0.1, 10 * this.dpr, 0, Math.PI * 2); ctx.fill();
        const bg = ctx.createRadialGradient(W * lx, H * 0.1, 0, W * lx, H * 0.1, H * 0.25);
        bg.addColorStop(0, 'rgba(255,255,220,0.25)'); bg.addColorStop(1, 'rgba(255,255,220,0)');
        ctx.fillStyle = bg; ctx.fillRect(W * lx - H * 0.25, 0, H * 0.5, H * 0.35);
      }
    }
    if (T.hills) {
      layer(0.05, 0.78, T.hillAmp || 0.08, T.hills[0], 1);
      layer(0.1, 0.86, (T.hillAmp || 0.08) * 0.9, T.hills[1], 4);
    }
    // 火山の光と火の粉
    if (T.embers) {
      const lg = ctx.createLinearGradient(0, H * 0.7, 0, H);
      lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, 'rgba(255,120,30,0.45)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
      for (const st of this.stars) {
        const yy = (((st.y * H - this.time * (0.6 + st.s) * this.dpr) % H) + H) % H;
        const xx = (st.x * W + Math.sin(this.time * 0.02 + st.t) * 20 * this.dpr) % W;
        ctx.fillStyle = `rgba(255,${140 + Math.floor(st.t * 15)},60,${0.3 + 0.5 * (yy / H)})`;
        ctx.fillRect(xx, yy, 2.5 * this.dpr, 2.5 * this.dpr);
      }
    }
    // 雲
    if (T.clouds) {
      for (const c of this.clouds) {
        c.x += T.cloudSpeed || 0.00008;
        if (c.x > 1.2) c.x = -0.2;
        const x = c.x * W, y = c.y * H, cr = H * 0.05 * c.s;
        ctx.fillStyle = T.clouds;
        ctx.beginPath();
        ctx.ellipse(x, y, cr * 3, cr, 0, 0, Math.PI * 2);
        ctx.ellipse(x + cr * 1.5, y - cr * 0.4, cr * 1.8, cr * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 雲海（飛空艇）
    if (T.seaOfClouds) {
      const off = (this.time * 3 * this.dpr) % (H * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let x = -H * 0.3; x < W + H * 0.3; x += H * 0.15) {
        ctx.beginPath(); ctx.arc(x - off, H * 0.95, H * 0.12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(230,240,255,0.95)';
      ctx.fillRect(0, H * 0.95, W, H * 0.05);
    }
    if (T.snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const st of this.stars) {
        const yy = (((st.y * H + this.time * (0.8 + st.s) * this.dpr) % H) + H) % H;
        const xx = (((st.x * W + Math.sin(this.time * 0.02 + st.t) * 15 * this.dpr) % W) + W) % W;
        ctx.beginPath(); ctx.arc(xx, yy, (1 + st.s) * this.dpr, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawStage() {
    const ctx = this.ctx, S = STAGE.main, T = this.theme();
    const t = this.time * 0.05;
    ctx.save();
    // マグマの海（見た目だけ）
    if (T.deco === 'lava') {
      const ly = S.bottom + 330;
      const lg = ctx.createLinearGradient(0, ly, 0, ly + 400);
      lg.addColorStop(0, '#ffcf4a'); lg.addColorStop(0.15, '#ff6a1a'); lg.addColorStop(1, '#5a0a00');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-2000, ly + 400);
      for (let x = -2000; x <= 2000; x += 40) ctx.lineTo(x, ly + Math.sin(x * 0.01 + t * 1.5) * 10);
      ctx.lineTo(2000, ly + 400);
      ctx.fill();
    }
    // 土台
    const grad = ctx.createLinearGradient(0, S.top, 0, S.bottom + 160);
    T.body.forEach((c, i) => grad.addColorStop(i / (T.body.length - 1), c));
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (T.shape === 'road') {
      ctx.moveTo(-2200, S.top); ctx.lineTo(2200, S.top); ctx.lineTo(2200, S.bottom + 400); ctx.lineTo(-2200, S.bottom + 400);
    } else if (T.shape === 'ship') {
      ctx.moveTo(S.left - 60, S.top - 20);
      ctx.lineTo(S.right + 90, S.top - 30);
      ctx.quadraticCurveTo(S.right + 20, S.bottom + 20, S.right - 120, S.bottom + 60);
      ctx.lineTo(S.left + 100, S.bottom + 60);
      ctx.quadraticCurveTo(S.left - 20, S.bottom, S.left - 60, S.top - 20);
    } else if (T.shape === 'block') {
      ctx.moveTo(S.left, S.top);
      ctx.lineTo(S.right, S.top);
      ctx.lineTo(S.right - 40, S.bottom);
      ctx.lineTo(S.right * 0.3, S.bottom + 120);
      ctx.lineTo(S.left * 0.3, S.bottom + 120);
      ctx.lineTo(S.left + 40, S.bottom);
    } else {
      ctx.moveTo(S.left, S.top);
      ctx.lineTo(S.right, S.top);
      ctx.lineTo(S.right, S.top + 40);
      ctx.quadraticCurveTo(S.right - 30, S.bottom, S.right - 150, S.bottom + 60);
      ctx.quadraticCurveTo(0, S.bottom + 230, -S.right + 150, S.bottom + 60);
      ctx.quadraticCurveTo(S.left + 30, S.bottom, S.left, S.top + 40);
    }
    ctx.closePath();
    ctx.fill();
    // 模様
    if (T.deco === 'crystal') {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(-300 + i * 110, 40 + (i % 3) * 25); ctx.lineTo(-260 + i * 110, 90 + (i % 2) * 40); ctx.stroke();
      }
      for (const [x, y, sc] of [[-200, 150, 1], [60, 210, 1.3], [230, 130, 0.8]]) {
        ctx.fillStyle = `rgba(127,240,255,${0.35 + 0.2 * Math.sin(t + x)})`;
        ctx.beginPath();
        ctx.moveTo(x, y - 30 * sc); ctx.lineTo(x + 12 * sc, y); ctx.lineTo(x, y + 30 * sc); ctx.lineTo(x - 12 * sc, y);
        ctx.fill();
      }
    } else if (T.deco === 'tech') {
      ctx.strokeStyle = `rgba(127,240,255,${0.35 + 0.15 * Math.sin(t)})`;
      ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * 120, 20); ctx.lineTo(i * 120 * 0.7, S.bottom + 60); ctx.stroke();
      }
      ctx.fillStyle = `rgba(127,240,255,${0.5 + 0.3 * Math.sin(t * 2)})`;
      ctx.beginPath(); ctx.arc(0, S.bottom + 40, 22, 0, Math.PI * 2); ctx.fill();
    } else if (T.deco === 'roots') {
      ctx.strokeStyle = 'rgba(60,35,15,0.6)';
      ctx.lineWidth = 10;
      for (const [x, d] of [[-250, -1], [-80, 1], [120, -1], [270, 1]]) {
        ctx.beginPath(); ctx.moveTo(x, 30); ctx.quadraticCurveTo(x + d * 60, 120, x + d * 30, S.bottom + 80); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,240,150,0.6)';
      for (let i = 0; i < 6; i++) {
        const fx = -300 + i * 120 + Math.sin(t + i) * 20, fy = -60 - i * 40 + Math.cos(t * 0.7 + i) * 25;
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + i);
        ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (T.deco === 'road') {
      ctx.fillStyle = '#ffffff';
      for (let x = -2200; x < 2200; x += 160) ctx.fillRect(x, S.top + 45, 80, 8);
      ctx.fillStyle = '#ffd24d';
      ctx.fillRect(-2200, S.top + 22, 4400, 4);
      ctx.fillStyle = '#8a8a96';
      for (let x = -2200; x < 2200; x += 120) ctx.fillRect(x, S.top - 34, 8, 34);
      ctx.fillStyle = '#c8c8d4';
      ctx.fillRect(-2200, S.top - 36, 4400, 8);
    } else if (T.deco === 'ship') {
      ctx.strokeStyle = 'rgba(60,30,10,0.5)';
      ctx.lineWidth = 3;
      for (let y = S.top + 30; y < S.bottom + 50; y += 26) { ctx.beginPath(); ctx.moveTo(S.left, y); ctx.lineTo(S.right, y); ctx.stroke(); }
      ctx.fillStyle = '#ffe9a8';
      for (const x of [-250, -120, 10, 140, 270]) { ctx.beginPath(); ctx.arc(x, S.top + 70, 11, 0, Math.PI * 2); ctx.fill(); }
      // プロペラ
      for (const [px, py] of [[S.left - 40, S.bottom + 10], [S.right + 40, S.bottom + 10]]) {
        ctx.fillStyle = '#555';
        ctx.fillRect(px - 8, py - 30, 16, 40);
        ctx.fillStyle = 'rgba(220,220,230,0.7)';
        const a = this.time * 0.8;
        ctx.beginPath(); ctx.ellipse(px, py + 20, 70 * Math.abs(Math.cos(a)), 10, 0, 0, Math.PI * 2); ctx.fill();
      }
      // マストと帆
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(-8, -330, 16, 330);
      ctx.fillStyle = 'rgba(255,250,235,0.92)';
      ctx.beginPath(); ctx.moveTo(10, -310); ctx.quadraticCurveTo(110 + Math.sin(t) * 8, -210, 10, -60); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, -300); ctx.quadraticCurveTo(-90 + Math.sin(t) * 6, -210, -10, -90); ctx.fill();
      ctx.fillStyle = '#e84a4a';
      ctx.beginPath(); ctx.moveTo(8, -440); ctx.lineTo(60 + Math.sin(t * 3) * 6, -425); ctx.lineTo(8, -410); ctx.fill();
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(-4, -440, 8, 110);
    } else if (T.deco === 'stadium') {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      for (let i = -3; i <= 3; i++) ctx.fillRect(i * 110 - 30, 30, 60, S.bottom - 20);
      ctx.fillStyle = `rgba(255,210,77,${0.5 + 0.3 * Math.sin(t * 2)})`;
      ctx.fillRect(S.left, S.top + 18, S.right - S.left, 4);
    } else if (T.deco === 'crater') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (const [x, y, r] of [[-250, 60, 30], [-40, 100, 45], [200, 70, 25], [300, 130, 20], [-300, 140, 18]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (T.deco === 'lava') {
      ctx.strokeStyle = `rgba(255,${110 + Math.floor(40 * Math.sin(t))},30,0.8)`;
      ctx.lineWidth = 4;
      for (const pts of [[[-300, 30], [-250, 70], [-270, 130]], [[-60, 20], [-20, 90], [30, 120], [10, 180]], [[220, 40], [260, 100], [240, 150]]]) {
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    // 上面
    ctx.fillStyle = T.top[0];
    ctx.fillRect(S.left, S.top, S.right - S.left, 10);
    ctx.fillStyle = T.top[1];
    ctx.fillRect(S.left, S.top + 10, S.right - S.left, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(S.left, S.top, S.right - S.left, 2);
    if (T.deco === 'roots') {
      ctx.fillStyle = T.top[0];
      for (let x = S.left; x < S.right; x += 18) { ctx.beginPath(); ctx.moveTo(x, S.top + 10); ctx.lineTo(x + 9, S.top + 22); ctx.lineTo(x + 18, S.top + 10); ctx.fill(); }
    }
    // すり抜け床
    const hz = hazardState(STAGE.id, this.gameFrame || 0);
    for (const p of STAGE.platforms) {
      const pw = p.right - p.left;
      if (p.active === false) {
        // 変形の予告：次に出る足場を点線で見せる
        if (hz.kind === 'forms' && hz.phase === 'warn' && p.forms.includes(hz.next) && Math.floor(this.time / 8) % 2) {
          ctx.setLineDash([10, 8]);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeRect(p.left, p.y, pw, 14);
          ctx.setLineDash([]);
        }
        continue;
      }
      if (hz.kind === 'forms' && hz.phase === 'warn' && !p.forms.includes(hz.next)) ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(this.time * 0.25));
      if (T.deco === 'ship') {
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(p.left, p.y, pw, 12);
        ctx.fillStyle = '#e0b070';
        ctx.fillRect(p.left, p.y, pw, 4);
        ctx.strokeStyle = 'rgba(80,50,20,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.left + 8, p.y + 12); ctx.lineTo(p.left + 8, p.y + 60); ctx.moveTo(p.right - 8, p.y + 12); ctx.lineTo(p.right - 8, p.y + 60); ctx.stroke();
      } else if (T.deco === 'road') {
        ctx.fillStyle = '#777';
        ctx.fillRect(p.left + 20, p.y + 40, 10, -p.y - 40);
        ctx.fillRect(p.right - 30, p.y + 40, 10, -p.y - 40);
        ctx.fillStyle = '#2e6b3a';
        ctx.fillRect(p.left, p.y, pw, 44);
        ctx.strokeStyle = '#e8f5e9'; ctx.lineWidth = 3;
        ctx.strokeRect(p.left + 4, p.y + 4, pw - 8, 36);
        ctx.fillStyle = '#e8f5e9';
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('← 峠 BLAST →', (p.left + p.right) / 2, p.y + 23);
      } else if (T.deco === 'roots') {
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(p.left, p.y, pw, 14);
        ctx.fillStyle = 'rgba(80,180,90,0.9)';
        for (let x = p.left - 10; x < p.right + 10; x += 26) { ctx.beginPath(); ctx.arc(x + 13, p.y - 4, 14, Math.PI, 0); ctx.fill(); }
        ctx.fillStyle = '#9be07a';
        ctx.fillRect(p.left, p.y, pw, 4);
      } else if (T.deco === 'lava') {
        ctx.fillStyle = '#3a2a28';
        ctx.fillRect(p.left, p.y, pw, 18);
        ctx.fillStyle = p.move ? '#ffb347' : '#8a6a5a';
        ctx.fillRect(p.left, p.y, pw, 5);
        if (p.move) {
          ctx.fillStyle = `rgba(255,140,40,${0.5 + 0.3 * Math.sin(t * 3)})`;
          ctx.beginPath(); ctx.moveTo(p.left + pw * 0.3, p.y + 18); ctx.lineTo(p.left + pw * 0.5, p.y + 40 + Math.sin(t * 5) * 6); ctx.lineTo(p.left + pw * 0.7, p.y + 18); ctx.fill();
        }
      } else {
        ctx.fillStyle = T.plat[0];
        ctx.fillRect(p.left, p.y, pw, 16);
        ctx.fillStyle = T.plat[1];
        ctx.fillRect(p.left, p.y, pw, 5);
        ctx.fillStyle = T.plat[0];
        ctx.fillRect(p.left + 10, p.y + 16, 6, 6);
        ctx.fillRect(p.right - 16, p.y + 16, 6, 6);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ステージギミック（ワールド座標）
  drawHazards() {
    const ctx = this.ctx, S = STAGE.main;
    const h = hazardState(STAGE.id, this.gameFrame || 0);
    if (h.phase === 'idle') return;
    const t = this.time;
    ctx.save();
    if (h.kind === 'lava') {
      if (h.phase === 'warn') {
        // ぶくぶく泡立つ予告
        const k = (h.t - 690) / 90;
        ctx.fillStyle = `rgba(255,120,30,${0.3 + 0.4 * k})`;
        ctx.beginPath(); ctx.ellipse(h.x, S.top + 4, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 6; i++) {
          const bx = h.x + Math.sin(i * 2.1 + t * 0.2) * 50;
          const by = S.top - ((t * 2 + i * 17) % (30 + k * 80));
          ctx.fillStyle = 'rgba(255,200,80,0.8)';
          ctx.beginPath(); ctx.arc(bx, by, 5 + k * 4, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const top = S.top - 540 * Math.min(1, h.progress * 4);
        const fade = h.progress > 0.8 ? (1 - h.progress) / 0.2 : 1;
        ctx.globalAlpha = fade;
        const g = ctx.createLinearGradient(h.x - 65, 0, h.x + 65, 0);
        g.addColorStop(0, '#ff4a0a'); g.addColorStop(0.5, '#ffd24a'); g.addColorStop(1, '#ff4a0a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(h.x - 65, S.top + 10);
        for (let y = S.top; y > top; y -= 30) ctx.lineTo(h.x - 65 + Math.sin(y * 0.05 + t * 0.4) * 10, y);
        ctx.quadraticCurveTo(h.x, top - 50, h.x + 65, top);
        for (let y = top; y < S.top; y += 30) ctx.lineTo(h.x + 65 + Math.sin(y * 0.05 + t * 0.4 + 2) * 10, y);
        ctx.lineTo(h.x + 65, S.top + 10);
        ctx.fill();
      }
    } else if (h.kind === 'wind') {
      const k = h.phase === 'warn' ? 0.3 : 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const y = -600 + ((i * 53) % 640);
        const len = 80 + (i % 4) * 40;
        const x = ((((i * 211 + t * 22 * h.dir) % 2400) + 2400) % 2400) - 1200;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - h.dir * len, y); ctx.stroke();
      }
      ctx.fillStyle = `rgba(110,190,90,${0.8 * k})`;
      for (let i = 0; i < 14; i++) {
        const x = ((((i * 173 + t * 16 * h.dir) % 2400) + 2400) % 2400) - 1200;
        const y = -520 + ((i * 71) % 520) + Math.sin(t * 0.1 + i) * 20;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.2 + i);
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else if (h.kind === 'car' && h.phase === 'active') {
      ctx.translate(h.x, S.top);
      ctx.scale(h.dir, 1);
      // スピード線
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-130 - i * 20, -15 - i * 14); ctx.lineTo(-260 - i * 30, -15 - i * 14); ctx.stroke(); }
      // トラック
      ctx.fillStyle = '#d83a3a';
      ctx.fillRect(-110, -80, 150, 62);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-104, -74, 138, 40);
      ctx.fillStyle = '#d83a3a';
      ctx.font = '900 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.scale(h.dir, 1); ctx.fillText('BLAST便', -35 * h.dir, -54); ctx.restore();
      ctx.fillStyle = '#2a5ad8';
      ctx.beginPath(); ctx.moveTo(40, -18); ctx.lineTo(40, -70); ctx.lineTo(85, -70); ctx.lineTo(110, -40); ctx.lineTo(110, -18); ctx.fill();
      ctx.fillStyle = '#bfe6ff';
      ctx.fillRect(50, -64, 30, 22);
      ctx.fillStyle = '#fff6a0';
      ctx.beginPath(); ctx.arc(106, -28, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      for (const wx of [-80, 0, 80]) { ctx.beginPath(); ctx.arc(wx, -14, 16, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#999';
      for (const wx of [-80, 0, 80]) { ctx.beginPath(); ctx.arc(wx, -14, 6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  // ギミックの予告表示（画面座標）
  drawHazardOverlay() {
    const h = hazardState(STAGE.id, this.gameFrame || 0);
    if (h.phase === 'idle') return;
    const ctx = this.ctx, d = this.dpr;
    const blink = Math.floor(this.time / 8) % 2;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (h.kind === 'car' && h.phase === 'warn') {
      // 車が来る側に「！」
      const x = h.dir > 0 ? 60 * d : this.W - 60 * d, y = this.H * 0.55;
      if (blink) {
        ctx.fillStyle = '#ffd24d';
        ctx.beginPath(); ctx.moveTo(x, y - 40 * d); ctx.lineTo(x + 40 * d, y + 30 * d); ctx.lineTo(x - 40 * d, y + 30 * d); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.font = `900 ${Math.round(44 * d)}px system-ui, sans-serif`;
        ctx.fillText('!', x, y + 6 * d);
      }
      ctx.font = `900 ${Math.round(18 * d)}px system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * d;
      ctx.strokeText(h.dir > 0 ? '車が来る！ →' : '← 車が来る！', this.W / 2, 70 * d);
      ctx.fillText(h.dir > 0 ? '車が来る！ →' : '← 車が来る！', this.W / 2, 70 * d);
    } else if (h.kind === 'forms' && h.phase === 'warn') {
      const text = `ステージ変化！ → ${STADIUM_FORMS[h.next]}`;
      ctx.font = `900 ${Math.round(28 * d)}px system-ui, sans-serif`;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 6 * d;
      ctx.strokeText(text, this.W / 2, this.H * 0.27);
      ctx.fillStyle = blink ? '#ffd24d' : '#fff';
      ctx.fillText(text, this.W / 2, this.H * 0.27);
    } else if (h.kind === 'wind' && h.phase === 'warn') {
      ctx.font = `900 ${Math.round(22 * d)}px system-ui, sans-serif`;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 5 * d;
      const text = h.dir > 0 ? '強風注意！ →→' : '←← 強風注意！';
      ctx.strokeText(text, this.W / 2, 80 * d);
      ctx.fillStyle = '#e8ffe0';
      ctx.fillText(text, this.W / 2, 80 * d);
    } else if (h.kind === 'lava' && h.phase === 'warn') {
      ctx.font = `900 ${Math.round(22 * d)}px system-ui, sans-serif`;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 5 * d;
      ctx.strokeText('溶岩が噴き出す！', this.W / 2, 80 * d);
      ctx.fillStyle = blink ? '#ffb347' : '#fff';
      ctx.fillText('溶岩が噴き出す！', this.W / 2, 80 * d);
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
    if (f.state === 'grabbing') { fh = [w * 0.75, shY + h * 0.12]; bh = [w * 0.6, shY + h * 0.2]; }
    if (f.state === 'grabbed') { fh = [-w * 0.1, shY - h * 0.3]; bh = [-w * 0.5, shY - h * 0.25]; }
    if (f.state === 'attack' && f.move && f.move.id === 'throw') {
      const k = f.moveData.throwKind;
      const e = Math.min(1, f.moveFrame / 6);
      if (k === 'up') fh = [w * 0.2, shY - h * 0.45 * e];
      else if (k === 'down') fh = [w * 0.6, -h * 0.1];
      else if (k === 'back') { fh = [-w * 0.9 * e, shY]; bh = [-w * 0.7 * e, shY + 6]; }
      else fh = [w * 0.95 * e, shY];
    }
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
    const hurt = f.state === 'hitstun' || f.state === 'dizzy' || f.state === 'grabbed';
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
        if (b.grab) continue;
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
