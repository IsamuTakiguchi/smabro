// ゲームロジック（DOM に依存しない純粋なシミュレーション）
// 1 ステップ = 1/60 秒。座標系は y 下向き、ステージ上面が y = 0。

export const FPS = 60;
export const KB_SCALE = 0.15; // ふっとばし値 → 初速
export const KB_DECAY = 0.3; // ふっとばし速度の毎フレーム減衰量
export const SHIELD_MAX = 50;

export const STAGE = {
  main: { left: -420, right: 420, top: 0, bottom: 170 },
  platforms: [
    { left: -300, right: -120, y: -150 },
    { left: 120, right: 300, y: -150 },
    { left: -90, right: 90, y: -290 },
  ],
  blast: { left: -1150, right: 1150, top: -950, bottom: 780 },
  spawns: [-300, 300, -110, 110],
};

// ---------------------------------------------------------------- キャラクター

export const CHARACTERS = [
  {
    id: 'blaze', name: 'ブレイズ', title: '炎の格闘家',
    desc: 'バランス型。火球と昇炎拳で戦う。',
    color: '#ff5a36', accent: '#ffd166', dark: '#8c1c0a',
    w: 44, h: 84, weight: 100, walk: 6.4, airSpeed: 4.9, airAccel: 0.5,
    jump: 17, dblJump: 15.5, jumps: 2, gravity: 0.85, maxFall: 13, fastFall: 19,
    power: 1.0, speed: 1.0, reach: 1.0,
    specials: { neutral: 'fireball', up: 'flameUpper', down: 'flameBurst' },
    specialNames: ['ファイアボール', '昇炎拳', 'フレイムバースト'],
  },
  {
    id: 'gant', name: 'ガント', title: '鋼鉄の巨漢',
    desc: '重量級。動きは遅いが一撃が重い。',
    color: '#7b8fa6', accent: '#f2c14e', dark: '#34404f',
    w: 58, h: 98, weight: 128, walk: 4.9, airSpeed: 4.1, airAccel: 0.38,
    jump: 16, dblJump: 14.5, jumps: 2, gravity: 0.95, maxFall: 15, fastFall: 21,
    power: 1.25, speed: 0.85, reach: 1.15,
    specials: { neutral: 'shockPunch', up: 'rocketJump', down: 'groundPound' },
    specialNames: ['ショックパンチ', 'ロケットジャンプ', 'グラウンドパウンド'],
  },
  {
    id: 'zephyr', name: 'ゼファー', title: '疾風の忍',
    desc: '軽量級。3段ジャンプと素早い連撃。',
    color: '#2ecc71', accent: '#e8fff0', dark: '#0f5c33',
    w: 38, h: 74, weight: 80, walk: 8, airSpeed: 5.9, airAccel: 0.62,
    jump: 16.5, dblJump: 14, jumps: 3, gravity: 0.78, maxFall: 11.5, fastFall: 17,
    power: 0.82, speed: 1.2, reach: 0.9,
    specials: { neutral: 'windBlade', up: 'galeDash', down: 'cyclone' },
    specialNames: ['ウィンドブレード', '疾風迅雷', 'サイクロン'],
  },
  {
    id: 'misty', name: 'ミスティ', title: '星詠みの魔導士',
    desc: 'ふわふわ浮遊。大きな魔法弾とカウンター。',
    color: '#a66bff', accent: '#7ff0ff', dark: '#4a2386',
    w: 40, h: 80, weight: 90, walk: 5.5, airSpeed: 5.1, airAccel: 0.48,
    jump: 15.5, dblJump: 14.5, jumps: 2, gravity: 0.6, maxFall: 9.5, fastFall: 15,
    power: 0.95, speed: 0.95, reach: 1.05,
    specials: { neutral: 'arcaneOrb', up: 'levitate', down: 'counter' },
    specialNames: ['アルカナオーブ', 'レビテート', 'ミラーカウンター'],
  },
];

// 滞空時間を本家に近づける：高さはほぼ保ったまま、重力を弱めてふわっと長く飛ぶ
// （重力×0.55・ジャンプ初速×0.78 → 滞空時間 約1.4倍、高さ 約1.1倍）
for (const c of CHARACTERS) {
  c.gravity *= 0.55;
  c.jump *= 0.78;
  c.dblJump *= 0.78;
  c.maxFall *= 0.8;
  c.fastFall *= 0.85;
}

export const FLICK_WINDOW = 5; // スティックをはじいてから何フレーム以内の攻撃を「必殺技」とみなすか
// 攻撃ボタンをスティックより少し早く押してしまっても必殺技になるよう、
// スティックを倒さずに押した攻撃はこのフレーム数だけ様子を見てから出す（その間にはじけば必殺技）
export const ATTACK_BUFFER = 6;

// ---------------------------------------------------------------- 技データ

function helpers(c) {
  const s = (v) => Math.max(1, Math.round(v / c.speed));
  const d = (v) => Math.round(v * c.power * 10) / 10;
  const R = (v) => v * c.reach;
  const box = (f0, f1, ox, oy, r, dmg, ang, bkb, kbg, extra = {}) => ({
    f0: s(f0), f1: s(f1), ox: R(ox), oy: R(oy), r: R(r), dmg: d(dmg), ang, bkb, kbg, ...extra,
  });
  return { s, d, R, box };
}

function spawnProjectile(g, f, p) {
  g.projectiles.push({
    owner: f, x: f.x + p.ox * f.facing, y: f.y + p.oy, vx: p.vx * f.facing, vy: p.vy || 0,
    r: p.r, dmg: p.dmg, ang: p.ang, bkb: p.bkb, kbg: p.kbg, life: p.life, gravity: p.gravity || 0,
    facing: f.facing, kind: p.kind, color: f.char.color, accent: f.char.accent, age: 0, grow: p.grow || 0,
  });
  g.emit('projectile', { x: f.x, y: f.y, kind: p.kind });
}

const SPECIALS = {
  // --- ブレイズ
  fireball(c) {
    const { s, d, R } = helpers(c);
    return {
      name: 'ファイアボール', total: s(34), boxes: [], landLag: 8,
      tick(f, fr, g) {
        if (fr === s(12)) spawnProjectile(g, f, { kind: 'fire', ox: R(40), oy: -R(50), vx: 11, r: 15, dmg: d(6), ang: 30, bkb: 18, kbg: 40, life: 75 });
      },
    };
  },
  flameUpper(c) {
    const { s, box } = helpers(c);
    return {
      name: '昇炎拳', total: s(46), helplessAfter: true, landLag: 14,
      boxes: [box(4, 8, 22, -60, 32, 7, 80, 40, 40, { group: 1 }), box(9, 20, 10, -90, 32, 5, 85, 45, 70, { group: 2 })],
      tick(f, fr) {
        if (fr === s(4)) { f.vy = -15.5; f.vx = f.input.x * 4; f.grounded = false; f.upBUsed = true; }
      },
    };
  },
  flameBurst(c) {
    const { s, box } = helpers(c);
    return { name: 'フレイムバースト', total: s(52), landLag: 16, boxes: [box(18, 23, 0, -45, 72, 15, 50, 40, 92)], slowFall: true };
  },
  // --- ガント
  shockPunch(c) {
    const { s, box } = helpers(c);
    return {
      name: 'ショックパンチ', total: s(62), landLag: 16,
      boxes: [box(26, 31, 58, -50, 38, 19, 36, 40, 104)],
      tick(f, fr) {
        if (fr >= s(24) && fr <= s(30)) f.vx = 9 * f.facing;
      },
    };
  },
  rocketJump(c) {
    const { s, box } = helpers(c);
    return {
      name: 'ロケットジャンプ', total: s(44), helplessAfter: true, landLag: 16,
      boxes: [box(6, 18, 0, -50, 42, 9, 85, 35, 60)],
      tick(f, fr) {
        if (fr === s(6)) { f.vy = -15; f.vx = f.input.x * 5; f.grounded = false; f.upBUsed = true; }
      },
    };
  },
  groundPound(c) {
    const { s, box } = helpers(c);
    return {
      name: 'グラウンドパウンド', total: s(56), landLag: 20,
      boxes: [box(10, 55, 0, 0, 34, 12, 280, 20, 70, { airOnly: true }), box(16, 20, 0, -10, 85, 13, 60, 40, 80, { groundOnly: true })],
      tick(f, fr, g) {
        if (!f.grounded && fr === s(10)) { f.vy = 23; f.fastFalling = true; }
        if (!f.grounded && fr > s(10)) { f.moveFrame = Math.min(f.moveFrame, s(50)); }
        if (f.grounded && f.moveData.poundLanded !== true && fr > s(10) && f.moveData.fromAir) {
          f.moveData.poundLanded = true;
          g.spawnShockwave(f, { r: 90, dmg: 11 * c.power, ang: 55, bkb: 35, kbg: 75 });
          g.emit('shockwave', { x: f.x, y: f.y });
          f.moveFrame = s(50);
        }
      },
      start(f) { f.moveData.fromAir = !f.grounded; },
      noLandCancel: true,
    };
  },
  // --- ゼファー
  windBlade(c) {
    const { s, d, R } = helpers(c);
    return {
      name: 'ウィンドブレード', total: s(26), boxes: [], landLag: 6,
      tick(f, fr, g) {
        if (fr === s(8)) spawnProjectile(g, f, { kind: 'wind', ox: R(34), oy: -R(45), vx: 16, r: 11, dmg: d(4), ang: 25, bkb: 12, kbg: 30, life: 45 });
      },
    };
  },
  galeDash(c) {
    const { s, box } = helpers(c);
    return {
      name: '疾風迅雷', total: s(40), helplessAfter: true, landLag: 12,
      boxes: [box(9, 20, 0, -40, 32, 7, 70, 30, 55)],
      tick(f, fr) {
        if (fr === s(9)) {
          let ix = f.input.x, iy = f.input.y;
          if (Math.hypot(ix, iy) < 0.3) { ix = 0; iy = -1; }
          if (iy > 0.3 && f.grounded) iy = 0;
          const m = Math.hypot(ix, iy);
          f.vx = (ix / m) * 17; f.vy = (iy / m) * 17;
          if (ix !== 0) f.facing = Math.sign(ix);
          f.grounded = f.grounded && iy >= 0; f.upBUsed = true;
        }
        if (fr > s(9) && fr <= s(20)) f.noGravity = true;
        if (fr === s(21)) { f.vx *= 0.3; f.vy *= 0.3; }
      },
    };
  },
  cyclone(c) {
    const { s, box } = helpers(c);
    const boxes = [];
    for (let i = 0; i < 5; i++) boxes.push(box(8 + i * 6, 11 + i * 6, 0, -40, 46, 2, 88, 8, 10, { group: i }));
    boxes.push(box(38, 42, 0, -40, 52, 5, 50, 38, 90, { group: 9 }));
    return { name: 'サイクロン', total: s(54), landLag: 10, boxes, slowFall: true };
  },
  // --- ミスティ
  arcaneOrb(c) {
    const { s, d, R } = helpers(c);
    return {
      name: 'アルカナオーブ', total: s(44), boxes: [], landLag: 10,
      tick(f, fr, g) {
        if (fr === s(18)) spawnProjectile(g, f, { kind: 'orb', ox: R(40), oy: -R(48), vx: 5.5, r: 16, grow: 0.12, dmg: d(11), ang: 40, bkb: 30, kbg: 70, life: 140 });
      },
    };
  },
  levitate(c) {
    const { s, box } = helpers(c);
    return {
      name: 'レビテート', total: s(60), helplessAfter: true, landLag: 12,
      boxes: [box(6, 12, 0, -40, 38, 6, 80, 40, 50)],
      tick(f, fr) {
        if (fr === 1) { f.grounded = false; f.upBUsed = true; }
        if (fr >= 1 && fr <= s(42)) { f.vy = -8; f.vx = f.input.x * 5; f.noGravity = true; }
      },
    };
  },
  counter(c) {
    const { s } = helpers(c);
    return { name: 'ミラーカウンター', total: s(46), boxes: [], landLag: 10, counter: [s(5), s(28)], slowFall: true };
  },
};

function buildMoves(c) {
  const { s, box } = helpers(c);
  const m = {
    jab: { name: 'パンチ', total: s(18), boxes: [box(3, 5, 34, -50, 22, 3, 45, 14, 40)] },
    side: { name: 'スマッシュ', total: s(44), boxes: [box(14, 18, 52, -45, 30, 15, 38, 32, 102)], lunge: 3 },
    up: { name: 'アッパー', total: s(30), boxes: [box(7, 12, 8, -95, 32, 9, 88, 28, 95)] },
    down: { name: 'ローキック', total: s(26), boxes: [box(6, 9, 44, -12, 24, 7, 22, 24, 75)] },
    nair: { name: '空中回転', total: s(30), landLag: 6, boxes: [box(4, 14, 0, -45, 44, 8, 50, 20, 75)] },
    fair: { name: '空中前', total: s(34), landLag: 10, boxes: [box(9, 13, 44, -45, 30, 12, 42, 26, 94)] },
    bair: { name: '空中後ろ', total: s(30), landLag: 10, boxes: [box(7, 11, -46, -45, 30, 13, 140, 28, 96)] },
    uair: { name: '空中上', total: s(28), landLag: 8, boxes: [box(5, 10, 0, -100, 32, 9, 85, 25, 90)] },
    dair: { name: 'メテオ', total: s(38), landLag: 14, boxes: [box(12, 16, 0, 4, 30, 13, 280, 20, 85)] },
    ledgeAttack: { name: 'ガケのぼり攻撃', total: s(30), boxes: [box(8, 12, 40, -30, 36, 8, 40, 30, 60)] },
    counterHit: { name: 'カウンター', total: s(34), boxes: [box(3, 7, 50, -45, 48, 10, 40, 45, 90)] },
    grab: { name: 'つかみ', total: s(30), boxes: [box(6, 9, 36, -45, 30, 0, 0, 0, 0, { grab: true })] },
    throw: { name: '投げ', total: s(20), boxes: [] },
  };
  m.nspecial = SPECIALS[c.specials.neutral](c);
  m.uspecial = SPECIALS[c.specials.up](c);
  m.dspecial = SPECIALS[c.specials.down](c);
  for (const k of Object.keys(m)) m[k].id = k;
  return m;
}

// ---------------------------------------------------------------- ユーティリティ

const approach = (v, target, amt) => (v < target ? Math.min(target, v + amt) : Math.max(target, v - amt));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function emptyInput() {
  return { x: 0, y: 0, jump: false, attack: false, special: false, shield: false };
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

// ---------------------------------------------------------------- ファイター

let fighterUid = 0;

export class Fighter {
  constructor(slot, char, controller, stocks) {
    this.uid = ++fighterUid;
    this.slot = slot;
    this.char = char;
    this.moves = buildMoves(char);
    this.controller = controller;
    this.w = char.w; this.h = char.h;
    this.stocks = stocks;
    this.damage = 0;
    this.stats = { kos: 0, falls: 0, dealt: 0, sds: 0 };
    this.input = emptyInput();
    this.prevInput = emptyInput();
    this.pressed = emptyInput();
    this.eliminatedAt = -1;
    this.reset(STAGE.spawns[slot % STAGE.spawns.length], STAGE.main.top);
    this.facing = this.x < 0 ? 1 : -1;
  }

  reset(x, y) {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
    this.grounded = true; this.platform = null;
    this.jumpsLeft = this.char.jumps - 1;
    this.state = 'idle'; this.stateFrame = 0;
    this.move = null; this.moveFrame = 0; this.moveData = {}; this.attackId = 0;
    this.hitstun = 0; this.hitlag = 0; this.invuln = 0;
    this.shieldHP = SHIELD_MAX;
    this.upBUsed = false; this.airDodgeUsed = false; this.fastFalling = false;
    this.dropTimer = 0; this.ledge = null; this.ledgeCooldown = 0;
    this.respawnTimer = 0; this.timer = 0; this.lastHitter = null; this.lastHitFrame = -9999;
    this.hitRegistry = new Map();
    this.noGravity = false; this.flash = 0;
    this.flickAge = 99; this.flickDir = null; this.flickX = 0; this.pendingAttack = null;
    this.grabbed = null; this.grabbedBy = null; this.escape = 0;
  }

  get alive() { return this.state !== 'dead' && this.state !== 'out'; }
  get actionable() { return ['idle', 'run', 'air'].includes(this.state); }
  get intangible() {
    if (this.invuln > 0 || this.state === 'dead' || this.state === 'out') return true;
    const f = this.stateFrame;
    if (this.state === 'roll') return f >= 4 && f <= 16;
    if (this.state === 'spotdodge') return f >= 3 && f <= 16;
    if (this.state === 'airdodge') return f >= 3 && f <= 22;
    if (this.state === 'climb') return true;
    return false;
  }

  setState(s) { this.state = s; this.stateFrame = 0; }

  readInput(g) {
    const raw = this.controller ? this.controller.poll(g, this) : emptyInput();
    this.prevInput = this.input;
    this.input = raw;
    const p = this.prevInput;
    this.pressed = {
      jump: raw.jump && !p.jump,
      up: raw.y < -0.5 && !(p.y < -0.5),
      down: raw.y > 0.5 && !(p.y > 0.5),
      left: raw.x < -0.5 && !(p.x < -0.5),
      right: raw.x > 0.5 && !(p.x > 0.5),
      attack: raw.attack && !p.attack,
      special: raw.special && !p.special,
      shield: raw.shield && !p.shield,
    };
    // スティックをはじいた瞬間を記録（はじき＋攻撃 = 必殺技）
    const pr = this.pressed;
    if (pr.up || pr.down || pr.left || pr.right) {
      this.flickAge = 0;
      this.flickDir = pr.up ? 'up' : pr.down ? 'down' : 'side';
      this.flickX = pr.left ? -1 : pr.right ? 1 : sign(raw.x);
    } else if (this.flickAge < 99) this.flickAge++;
  }

  dirOf() {
    const { x, y } = this.input;
    if (y < -0.5 && Math.abs(y) >= Math.abs(x) * 0.8) return 'up';
    if (y > 0.5 && Math.abs(y) >= Math.abs(x) * 0.8) return 'down';
    if (Math.abs(x) > 0.5) return 'side';
    return 'neutral';
  }

  startMove(g, id) {
    this.pendingAttack = null;
    const mv = this.moves[id];
    this.move = mv; this.moveFrame = 0; this.moveData = {};
    this.attackId++;
    this.setState('attack');
    if (mv.start) mv.start(this, g);
    g.emit('swing', { f: this, move: id });
  }

  startSpecial(g, sdir, sx) {
    this.pendingAttack = null;
    if (sdir === 'up' && this.upBUsed && !this.grounded) return false;
    if (sdir === 'side' && sx !== 0) this.facing = sx;
    const id = sdir === 'up' ? 'uspecial' : sdir === 'down' ? 'dspecial' : 'nspecial';
    this.startMove(g, id);
    return true;
  }

  tryAttack(g) {
    const dir = this.dirOf();
    // 先に押された攻撃の様子見中：はじけば必殺技、時間切れなら通常攻撃
    if (this.pendingAttack !== null && g.frame - this.pendingAttack > ATTACK_BUFFER + 2) this.pendingAttack = null; // 古い入力は捨てる
    if (this.pendingAttack !== null) {
      if (this.flickAge === 0 && this.flickDir) return this.startSpecial(g, this.flickDir, this.flickX);
      if (g.frame - this.pendingAttack >= ATTACK_BUFFER) { this.pendingAttack = null; return this.normalAttack(g, 'neutral'); }
      if (!this.pressed.attack && !this.pressed.special) return false;
      this.pendingAttack = null;
    }
    // 必殺技：必殺ボタン、またはスティックをはじくと同時に攻撃
    const flick = this.pressed.attack && this.flickAge <= FLICK_WINDOW && this.flickDir;
    if (this.pressed.special) return this.startSpecial(g, dir, sign(this.input.x));
    if (flick) return this.startSpecial(g, this.flickDir, this.flickX);
    if (this.pressed.attack) {
      // スティックを倒さずに押した → 少しだけ待つ（CPU はそのまま出す）
      if (dir === 'neutral' && !(this.controller && this.controller.level)) { this.pendingAttack = g.frame; return false; }
      return this.normalAttack(g, dir);
    }
    return false;
  }

  normalAttack(g, dir) {
    let id;
    if (this.grounded) {
      if (dir === 'side') this.facing = sign(this.input.x);
      // 相手の近くでスティックを倒さずに攻撃 → つかみ
      if (dir === 'neutral' && this.grabTarget(g)) { this.startMove(g, 'grab'); return true; }
      id = dir === 'up' ? 'up' : dir === 'down' ? 'down' : dir === 'side' ? 'side' : 'jab';
    } else if (dir === 'up') id = 'uair';
    else if (dir === 'down') id = 'dair';
    else if (dir === 'side') id = sign(this.input.x) === this.facing ? 'fair' : 'bair';
    else id = 'nair';
    this.startMove(g, id);
    return true;
  }

  // つかめる距離に相手がいるか
  grabTarget(g) {
    for (const o of g.fighters) {
      if (o === this || !o.alive || o.intangible || ['respawn', 'ledge', 'grabbed', 'grabbing'].includes(o.state)) continue;
      const dx = o.x - this.x;
      if (Math.abs(dx) > this.w / 2 + o.w / 2 + 34 * this.char.reach || Math.abs(o.y - this.y) > 50) continue;
      if (Math.abs(dx) < 12 || sign(dx) === this.facing) return o;
    }
    return null;
  }

  land(g) {
    const hardFall = this.vy > 8;
    this.grounded = true;
    this.fastFalling = false;
    this.jumpsLeft = this.char.jumps - 1;
    this.airDodgeUsed = false;
    this.upBUsed = false;
    this.vy = 0;
    if (this.state === 'hitstun') {
      if (this.kby > 5) { // 地面バウンド
        this.kby = -this.kby * 0.55;
        this.grounded = false;
        g.emit('bounce', { x: this.x, y: this.y });
        return;
      }
      this.kbx *= 0.5; this.kby = 0;
      this.hitstun = 0;
      this.setState('landlag'); this.timer = 18;
    } else if (this.state === 'attack') {
      if (this.move.noLandCancel) { this.kby = 0; return; }
      this.timer = this.move.landLag || 6;
      this.move = null;
      this.setState('landlag');
    } else if (this.state === 'helpless' || this.state === 'airdodge') {
      this.timer = this.state === 'helpless' ? 14 : 10;
      this.setState('landlag');
    } else if (this.state === 'dizzy') {
      // 継続
    } else {
      this.setState('idle');
    }
    this.kby = 0;
    if (hardFall) g.emit('land', { x: this.x, y: this.y });
  }

  // 1 フレーム分の状態更新
  update(g) {
    if (this.state === 'out') return;
    if (this.state === 'dead') {
      if (--this.respawnTimer <= 0) this.respawn(g);
      return;
    }
    if (this.hitlag > 0) { this.hitlag--; return; }
    if (this.invuln > 0) this.invuln--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    if (this.dropTimer > 0) this.dropTimer--;
    if (this.flash > 0) this.flash--;
    this.stateFrame++;
    this.noGravity = false;
    const c = this.char, inp = this.input, pr = this.pressed;
    const jumpPressed = pr.jump || pr.up;

    if (this.state !== 'shield' && this.state !== 'shieldstun') {
      this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + 0.09);
    }

    switch (this.state) {
      case 'idle':
      case 'run': {
        if (this.tryAttack(g)) break;
        if (inp.shield) { this.setState('shield'); break; }
        if (jumpPressed) { this.setState('jumpsquat'); break; }
        if (pr.down && this.platform) { this.dropThrough(); break; }
        if (Math.abs(inp.x) > 0.3) {
          this.facing = sign(inp.x);
          this.vx = approach(this.vx, inp.x * c.walk, 1.1);
          if (this.state !== 'run') this.setState('run');
        } else {
          this.vx = approach(this.vx, 0, 0.9);
          if (this.state !== 'idle') this.setState('idle');
        }
        break;
      }
      case 'jumpsquat': {
        this.vx = approach(this.vx, 0, 0.4);
        if (this.tryAttack(g)) break;
        if (this.stateFrame >= 4) {
          const full = inp.jump || inp.y < -0.5;
          this.vy = -(full ? c.jump : c.jump * 0.68);
          if (Math.abs(inp.x) > 0.3) this.vx = inp.x * c.airSpeed;
          this.grounded = false; this.platform = null;
          this.setState('air');
          g.emit('jump', { x: this.x, y: this.y, f: this });
        }
        break;
      }
      case 'air': {
        this.airDrift(1);
        if (this.tryAttack(g)) break;
        if (jumpPressed && this.jumpsLeft > 0) {
          this.jumpsLeft--;
          this.vy = -c.dblJump;
          this.vx = inp.x * c.airSpeed;
          this.kbx = 0; this.kby = 0;
          this.fastFalling = false;
          if (Math.abs(inp.x) > 0.3) this.facing = sign(inp.x);
          g.emit('jump', { x: this.x, y: this.y, f: this, air: true });
          break;
        }
        if (pr.shield && !this.airDodgeUsed) {
          this.airDodgeUsed = true;
          this.setState('airdodge');
          const m = Math.hypot(inp.x, inp.y);
          if (m > 0.4) { this.vx = (inp.x / m) * 11; this.vy = (inp.y / m) * 11; } else { this.vx *= 0.3; this.vy = Math.min(this.vy, 0) * 0.3; }
          this.kbx = 0; this.kby = 0;
          break;
        }
        if (pr.down && this.vy > -3) this.fastFalling = true;
        this.checkLedge(g);
        break;
      }
      case 'helpless': {
        this.airDrift(0.6);
        if (pr.down && this.vy > -3) this.fastFalling = true;
        this.checkLedge(g);
        break;
      }
      case 'attack': {
        const mv = this.move;
        this.moveFrame++;
        if (this.grounded) this.vx = approach(this.vx, 0, 0.7);
        else {
          this.airDrift(mv.id.endsWith('special') ? 0.5 : 1);
          if (pr.down && this.vy > -3) this.fastFalling = true;
          if (mv.slowFall && this.vy > 2) this.vy = 2;
        }
        if (mv.lunge && this.moveFrame < mv.boxes[0].f0) this.vx = mv.lunge * this.facing;
        if (mv.tick) mv.tick(this, this.moveFrame, g);
        if (this.state !== 'attack') break;
        if (this.moveFrame >= mv.total) {
          this.move = null;
          if (this.grounded) this.setState('idle');
          else this.setState(mv.helplessAfter ? 'helpless' : 'air');
        }
        break;
      }
      case 'landlag':
      case 'shieldstun':
      case 'climb': {
        this.vx = approach(this.vx, 0, 0.8);
        if (--this.timer <= 0) {
          if (this.state === 'climb') {
            this.finishClimb(g);
          } else if (this.state === 'shieldstun') this.setState(this.input.shield ? 'shield' : 'idle');
          else this.setState('idle');
        }
        break;
      }
      case 'shield': {
        this.vx = approach(this.vx, 0, 1);
        this.shieldHP -= 0.14;
        if (this.shieldHP <= 0) { this.breakShield(g); break; }
        if (pr.attack) { this.startMove(g, 'grab'); break; } // ガード＋攻撃 = つかみ
        if (jumpPressed && this.stateFrame > 1) { this.setState('jumpsquat'); break; }
        if (pr.left || pr.right) {
          this.setState('roll');
          this.moveData.dir = pr.left ? -1 : 1;
          this.facing = -this.moveData.dir;
          break;
        }
        if (pr.down) { this.setState('spotdodge'); break; }
        if (!inp.shield) this.setState('idle');
        break;
      }
      case 'roll': {
        this.vx = this.stateFrame <= 18 ? this.moveData.dir * 9 : 0;
        if (this.stateFrame >= 26) { this.vx = 0; this.setState('idle'); }
        break;
      }
      case 'spotdodge': {
        this.vx = 0;
        if (this.stateFrame >= 22) this.setState('idle');
        break;
      }
      case 'airdodge': {
        this.noGravity = this.stateFrame < 20 && Math.hypot(this.vx, this.vy) > 1;
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.stateFrame >= 30) this.setState('air');
        break;
      }
      case 'hitstun': {
        if (--this.hitstun <= 0) this.setState(this.grounded ? 'idle' : 'air');
        else if (!this.grounded) this.airDrift(0.35);
        break;
      }
      case 'grabbing': {
        const v = this.grabbed;
        if (!v || v.state !== 'grabbed' || v.grabbedBy !== this) { this.grabbed = null; this.setState('idle'); break; }
        this.vx = approach(this.vx, 0, 1);
        if (this.stateFrame > 6) {
          // もう一度攻撃（またはスティックをはじく）で投げ。向きで投げ方が変わる
          if (pr.attack || pr.special) { g.throwGrabbed(this, this.dirOf(), sign(inp.x)); break; }
          if (pr.up) { g.throwGrabbed(this, 'up', 0); break; }
          if (pr.down) { g.throwGrabbed(this, 'down', 0); break; }
          if (pr.left || pr.right) { g.throwGrabbed(this, 'side', pr.left ? -1 : 1); break; }
        }
        if (this.stateFrame > 160) g.releaseGrab(this);
        break;
      }
      case 'grabbed': {
        const a = this.grabbedBy;
        if (!a || a.state !== 'grabbing' || a.grabbed !== this) { this.grabbedBy = null; this.setState(this.grounded ? 'idle' : 'air'); break; }
        this.x = a.x + a.facing * (a.w / 2 + this.w / 2 + 4);
        this.y = a.y; this.grounded = a.grounded; this.platform = a.platform;
        this.vx = this.vy = this.kbx = this.kby = 0;
        this.facing = -a.facing;
        // レバガチャ・ボタン連打で早く抜けられる
        const mash = pr.attack || pr.special || pr.jump || pr.shield || pr.left || pr.right || pr.up || pr.down;
        this.escape -= mash ? 5 : 1;
        if (this.escape <= 0) g.releaseGrab(a);
        return; // 物理演算しない
      }
      case 'dizzy': {
        this.vx = approach(this.vx, 0, 0.5);
        if (--this.timer <= 0) this.setState(this.grounded ? 'idle' : 'air');
        break;
      }
      case 'ledge': {
        this.vx = 0; this.vy = 0;
        const L = this.ledge;
        const toward = sign(inp.x) === -L.dir && Math.abs(inp.x) > 0.5;
        const away = sign(inp.x) === L.dir && Math.abs(inp.x) > 0.5;
        if (this.stateFrame > 8) {
          if (pr.jump) { this.ledgeJump(g); break; }
          if (pr.attack || pr.special) { this.startClimb(true); break; }
          if (pr.up || (toward && this.stateFrame > 14)) { this.startClimb(false); break; }
          if (pr.down || away) { this.releaseLedge(); break; }
        }
        if (this.stateFrame > 300) this.releaseLedge();
        break;
      }
      case 'respawn': {
        this.vx = 0; this.vy = 0;
        this.invuln = Math.max(this.invuln, 90);
        const moved = Math.abs(inp.x) > 0.5 || pr.down || pr.jump || pr.attack || pr.special;
        if (moved || this.stateFrame > 240) {
          this.grounded = false;
          this.setState('air');
          if (pr.jump) { this.vy = -c.dblJump; }
        }
        return; // 物理演算しない
      }
    }

    this.physics(g);
  }

  airDrift(mult) {
    const c = this.char;
    const target = this.input.x * c.airSpeed * mult;
    if (Math.abs(this.input.x) > 0.2) this.vx = approach(this.vx, target, c.airAccel);
    else this.vx = approach(this.vx, 0, c.airAccel * 0.25);
  }

  dropThrough() {
    this.grounded = false; this.platform = null;
    this.dropTimer = 12; this.y += 2;
    this.vy = 2;
    this.setState('air');
  }

  breakShield(g) {
    this.shieldHP = SHIELD_MAX * 0.4;
    this.setState('dizzy'); this.timer = 190;
    this.vy = -13; this.grounded = false; this.platform = null;
    g.emit('shieldbreak', { x: this.x, y: this.y - this.h / 2, f: this });
  }

  checkLedge(g) {
    if (this.ledgeCooldown > 0 || this.vy < 0) return;
    const S = STAGE.main;
    for (const L of g.ledges) {
      if (L.owner && L.owner !== this) continue;
      const hx = L.x + L.dir * (this.w / 2);
      const hy = S.top + this.h * 0.75;
      if (Math.abs(this.x - hx) < 42 && this.y > S.top + 10 && this.y < S.top + this.h + 50) {
        this.ledge = L; L.owner = this;
        this.x = hx; this.y = hy;
        this.vx = this.vy = this.kbx = this.kby = 0;
        this.facing = -L.dir;
        this.fastFalling = false;
        this.jumpsLeft = this.char.jumps - 1;
        this.upBUsed = false; this.airDodgeUsed = false;
        this.move = null;
        this.setState('ledge');
        this.invuln = Math.max(this.invuln, 36);
        g.emit('ledge', { x: this.x, y: S.top, f: this });
        return;
      }
    }
  }

  releaseLedge() {
    if (this.ledge) this.ledge.owner = null;
    this.ledge = null;
    this.ledgeCooldown = 40;
    this.x += this.facing * -6;
    this.setState('air');
  }

  startClimb(withAttack) {
    this.setState('climb');
    this.timer = 16;
    this.moveData = { climbAttack: withAttack };
  }

  finishClimb(g) {
    const L = this.ledge;
    if (L) { L.owner = null; this.x = L.x - L.dir * (this.w / 2 + 12); }
    this.ledge = null;
    this.y = STAGE.main.top; this.grounded = true; this.platform = null;
    this.vx = 0; this.vy = 0;
    this.ledgeCooldown = 20;
    if (this.moveData.climbAttack) this.startMove(g, 'ledgeAttack');
    else this.setState('idle');
  }

  ledgeJump(g) {
    const L = this.ledge;
    if (L) { L.owner = null; this.x = L.x - L.dir * (this.w / 2 + 4); }
    this.ledge = null;
    this.y = STAGE.main.top - 4;
    this.vy = -this.char.jump; this.vx = -L.dir * 2;
    this.grounded = false;
    this.ledgeCooldown = 30;
    this.setState('air');
    g.emit('jump', { x: this.x, y: this.y, f: this });
  }

  physics(g) {
    const c = this.char;
    this.prevX = this.x; this.prevY = this.y;
    if (this.state === 'ledge' || this.state === 'climb') return;

    const kbSpeed = Math.hypot(this.kbx, this.kby);
    if (!this.grounded && !this.noGravity && !(this.state === 'hitstun' && kbSpeed > 2)) {
      this.vy += c.gravity;
      const cap = this.fastFalling ? c.fastFall : c.maxFall;
      if (this.fastFalling) this.vy = Math.max(this.vy, c.fastFall * 0.8);
      if (this.vy > cap) this.vy = cap;
    }
    if (kbSpeed > 0) {
      const ns = Math.max(0, kbSpeed - KB_DECAY);
      this.kbx *= ns / kbSpeed; this.kby *= ns / kbSpeed;
      if (this.grounded) this.kbx = approach(this.kbx, 0, 0.6);
    }

    this.x += this.vx + this.kbx;
    this.y += this.vy + this.kby;

    const S = STAGE.main;
    const vyTotal = this.vy + this.kby;

    if (this.grounded) {
      // 足場が残っているかチェック
      const surf = this.platform || S;
      if (this.x < surf.left || this.x > surf.right) {
        this.grounded = false; this.platform = null;
        if (this.state === 'idle' || this.state === 'run') this.setState('air');
        if (this.state === 'shield' || this.state === 'shieldstun' || this.state === 'landlag' || this.state === 'roll' || this.state === 'spotdodge') this.setState('air');
      } else {
        this.y = this.platform ? this.platform.y : S.top;
        if (this.kby < -2) { this.grounded = false; this.platform = null; }
      }
    }

    if (!this.grounded && vyTotal >= 0) {
      // メインステージ上面への着地
      if (this.prevY <= S.top + 0.01 && this.y >= S.top && this.x >= S.left && this.x <= S.right) {
        this.y = S.top; this.platform = null; this.land(g);
      } else if (this.dropTimer <= 0 && !(this.input.y > 0.5 && this.state === 'air' && this.fastFalling)) {
        for (const p of STAGE.platforms) {
          if (this.prevY <= p.y + 0.01 && this.y >= p.y && this.x >= p.left && this.x <= p.right) {
            this.y = p.y; this.platform = p; this.land(g); break;
          }
        }
      }
    }

    // メインステージ側面・底面
    const hw = this.w / 2;
    if (this.y > S.top + 1 && this.y - this.h < S.bottom && this.x + hw > S.left && this.x - hw < S.right) {
      if (this.prevY - this.h >= S.bottom - 1) {
        this.y = S.bottom + this.h; this.vy = Math.max(this.vy, 0); this.kby = Math.abs(this.kby) * 0.5;
      } else if (this.x < 0) {
        this.x = S.left - hw; this.vx = Math.min(0, this.vx); this.kbx = -Math.abs(this.kbx) * 0.5;
      } else {
        this.x = S.right + hw; this.vx = Math.max(0, this.vx); this.kbx = Math.abs(this.kbx) * 0.5;
      }
    }
  }

  // 現在有効な攻撃判定（ワールド座標）
  activeBoxes() {
    if (this.state !== 'attack' || !this.move || this.hitlag > 0) return [];
    const out = [];
    for (const b of this.move.boxes) {
      if (this.moveFrame < b.f0 || this.moveFrame > b.f1) continue;
      if (b.airOnly && this.grounded) continue;
      if (b.groundOnly && !this.grounded) continue;
      out.push({ ...b, cx: this.x + b.ox * this.facing, cy: this.y + b.oy });
    }
    return out;
  }

  hurtRect() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  respawn(g) {
    const x = g.respawnX(this);
    this.reset(x, -420);
    this.grounded = false;
    this.setState('respawn');
    this.invuln = 150;
    this.facing = x <= 0 ? 1 : -1;
    g.emit('respawn', { f: this, x, y: -420 });
  }

  counterActive() {
    if (this.state !== 'attack' || !this.move || !this.move.counter) return false;
    const [a, b] = this.move.counter;
    return this.moveFrame >= a && this.moveFrame <= b;
  }
}

// ---------------------------------------------------------------- ゲーム

export class Game {
  constructor({ players, stocks = 3, seed = Date.now() }) {
    this.frame = 0;
    this.events = [];
    this.projectiles = [];
    this.ledges = [
      { x: STAGE.main.left, dir: -1, owner: null },
      { x: STAGE.main.right, dir: 1, owner: null },
    ];
    this.stocks = stocks;
    this.fighters = players.map((p, i) => new Fighter(p.slot ?? i, CHARACTERS.find((c) => c.id === p.char) || CHARACTERS[0], p.controller, stocks));
    this.over = false;
    this.winner = null;
    this.rngState = seed >>> 0 || 1;
    this.eliminations = 0;
  }

  rand() {
    // xorshift32（テストでの再現性用）
    let x = this.rngState;
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    this.rngState = x;
    return x / 4294967296;
  }

  emit(type, data = {}) { this.events.push({ type, frame: this.frame, ...data }); }

  respawnX(f) {
    const xs = [0, -160, 160, -80, 80];
    let best = 0, bestD = -1;
    for (const x of xs) {
      let d = Infinity;
      for (const o of this.fighters) if (o !== f && o.alive) d = Math.min(d, Math.abs(o.x - x));
      if (d > bestD) { bestD = d; best = x; }
    }
    return best;
  }

  spawnShockwave(f, p) {
    this.projectiles.push({
      owner: f, x: f.x, y: f.y - 20, vx: 0, vy: 0, r: p.r, dmg: p.dmg, ang: p.ang, bkb: p.bkb, kbg: p.kbg,
      life: 6, gravity: 0, facing: f.facing, kind: 'shock', color: f.char.color, accent: f.char.accent, age: 0, radial: true,
    });
  }

  step() {
    if (this.over) { this.frame++; return; }
    this.frame++;
    for (const f of this.fighters) f.readInput(this);
    for (const f of this.fighters) f.update(this);
    this.updateProjectiles();
    this.resolveHits();
    this.checkBlastZones();
    this.checkGameOver();
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      p.age++;
      p.vy += p.gravity;
      p.x += p.vx; p.y += p.vy;
      if (p.grow) p.r += p.grow;
      p.life--;
      const S = STAGE.main;
      if (p.kind !== 'shock' && p.y > S.top && p.y < S.bottom && p.x > S.left && p.x < S.right) p.life = 0;
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  resolveHits() {
    const hits = [];
    for (const a of this.fighters) {
      if (!a.alive) continue;
      for (const b of a.activeBoxes()) {
        for (const d of this.fighters) {
          if (d === a || d.intangible || d.state === 'respawn') continue;
          if (b.grab && ['ledge', 'grabbed', 'grabbing'].includes(d.state)) continue;
          const reg = d.hitRegistry.get(a.uid);
          if (reg && reg.attackId === a.attackId && reg.groups.has(b.group ?? 0)) continue;
          const r = d.hurtRect();
          if (!circleRect(b.cx, b.cy, b.r, r.x, r.y, r.w, r.h)) continue;
          hits.push({ a, d, box: b, facing: a.facing, proj: null });
        }
      }
    }
    for (const p of this.projectiles) {
      for (const d of this.fighters) {
        if (d === p.owner || d.intangible || d.state === 'respawn' || p.life <= 0) continue;
        if (p.radial && p.hit && p.hit.has(d)) continue;
        const r = d.hurtRect();
        if (!circleRect(p.x, p.y, p.r, r.x, r.y, r.w, r.h)) continue;
        const facing = p.radial ? (d.x >= p.x ? 1 : -1) : p.facing;
        hits.push({ a: p.owner, d, box: p, facing, proj: p });
      }
    }
    for (const h of hits) this.applyHit(h);
  }

  applyHit({ a, d, box, facing, proj, thrown }) {
    if (box.grab) {
      // つかみはガード・カウンターで防げない。1回の技でつかむのは1人だけ
      if (a.state === 'attack' && a.move && a.move.id === 'grab' && d.alive) this.startGrab(a, d);
      return;
    }
    if (thrown) {
      // 投げはガード・カウンター無視
    } else if (proj) {
      if (proj.life <= 0 && !proj.radial) return;
      if (proj.radial) { proj.hit = proj.hit || new Set(); proj.hit.add(d); } else proj.life = 0;
    } else {
      let reg = d.hitRegistry.get(a.uid);
      if (!reg || reg.attackId !== a.attackId) { reg = { attackId: a.attackId, groups: new Set() }; d.hitRegistry.set(a.uid, reg); }
      reg.groups.add(box.group ?? 0);
    }

    // カウンター
    if (!thrown && d.counterActive()) {
      const cm = d.moves.counterHit;
      const dmg = Math.max(8, Math.round(box.dmg * 1.3));
      cm.boxes[0].dmg = dmg;
      d.facing = a.x >= d.x ? 1 : -1;
      if (proj) d.facing = -facing;
      d.startMove(this, 'counterHit');
      d.invuln = 12;
      if (!proj) a.hitlag = 16;
      d.hitlag = 10;
      this.emit('counter', { x: d.x, y: d.y - d.h / 2, f: d });
      return;
    }

    // シールド
    if (!thrown && (d.state === 'shield' || d.state === 'shieldstun')) {
      d.shieldHP -= box.dmg * 1.3;
      const lag = Math.floor(box.dmg * 0.35 + 3);
      d.hitlag = lag;
      if (!proj) a.hitlag = lag;
      d.vx = facing * Math.min(9, 2 + box.dmg * 0.4);
      if (d.shieldHP <= 0) { this.emit('shieldhit', { x: d.x, y: d.y - d.h / 2, dmg: box.dmg }); d.breakShield(this); return; }
      d.setState('shieldstun');
      d.timer = Math.floor(box.dmg * 0.8) + 3;
      this.emit('shieldhit', { x: d.x, y: d.y - d.h / 2, dmg: box.dmg });
      return;
    }

    // つかみ中・つかまれ中に攻撃を受けたら解除
    this.clearGrab(d);
    d.pendingAttack = null;

    // ダメージとふっとばし
    const dmg = box.dmg;
    d.damage = Math.min(999, d.damage + dmg);
    a.stats.dealt += dmg;
    const p = d.damage;
    const kb = ((p / 10 + (p * dmg) / 20) * (200 / (d.char.weight + 100)) * 1.4 + 18) * (box.kbg / 100) + box.bkb;
    const rad = (box.ang * Math.PI) / 180;
    let dx = Math.cos(rad) * facing;
    let dy = -Math.sin(rad);
    if (d.grounded && dy > 0) dy = -dy * 0.8; // 地上メテオは上へバウンド
    const speed = kb * KB_SCALE;
    d.kbx = dx * speed; d.kby = dy * speed;
    d.vx = 0; d.vy = 0;
    if (d.grounded && kb < 55) d.kby = 0; // 軽い攻撃はのけぞりのみ
    else if (d.kby < 0) { d.grounded = false; d.platform = null; }
    if (d.ledge) { d.ledge.owner = null; d.ledge = null; }
    d.move = null;
    d.hitstun = Math.floor(kb * 0.42);
    d.setState('hitstun');
    d.fastFalling = false;
    d.upBUsed = false;
    d.airDodgeUsed = false;
    d.flash = 8;
    const lag = Math.floor(dmg * 0.4 + 4);
    d.hitlag = lag;
    if (!proj) a.hitlag = lag;
    d.lastHitter = a; d.lastHitFrame = this.frame;
    this.emit('hit', { a, d, x: proj ? proj.x : box.cx, y: proj ? proj.y : box.cy, dmg, kb, dx, dy, strong: kb > 130, thrown: !!thrown });
  }

  // ---------------------------------------------------------------- つかみ・投げ

  startGrab(a, d) {
    this.clearGrab(d);
    if (d.ledge) { d.ledge.owner = null; d.ledge = null; }
    a.move = null; a.vx = 0;
    a.setState('grabbing');
    a.grabbed = d;
    d.move = null;
    d.setState('grabbed');
    d.grabbedBy = a;
    d.vx = d.vy = d.kbx = d.kby = 0;
    d.hitlag = 0;
    d.escape = 55 + d.damage * 0.6;
    this.emit('grab', { a, d, x: d.x, y: d.y - d.h / 2 });
  }

  // つかんだ手を離す（抜けられた・時間切れ）
  releaseGrab(a) {
    const v = a.grabbed;
    a.grabbed = null;
    if (v && v.grabbedBy === a) {
      v.grabbedBy = null;
      v.setState(v.grounded ? 'idle' : 'air');
      v.vx = a.facing * 7;
      v.invuln = Math.max(v.invuln, 10);
    }
    if (a.state === 'grabbing') {
      a.setState('landlag');
      a.timer = 16;
      a.vx = -a.facing * 5;
    }
  }

  // 攻撃を受けた・撃墜されたときにつかみ関係を解除
  clearGrab(f) {
    if (f.state === 'grabbing' || f.grabbed) this.releaseGrab(f);
    if (f.grabbedBy) {
      const a = f.grabbedBy;
      f.grabbedBy = null;
      if (a.grabbed === f) { a.grabbed = null; if (a.state === 'grabbing') { a.setState('landlag'); a.timer = 10; } }
    }
  }

  throwGrabbed(a, dir, sx) {
    const v = a.grabbed;
    if (!v) return;
    const kind = dir === 'up' ? 'up' : dir === 'down' ? 'down' : dir === 'side' && sx === -a.facing ? 'back' : 'forward';
    const T = {
      forward: { dmg: 8, ang: 40, bkb: 60, kbg: 62 },
      back: { dmg: 10, ang: 140, bkb: 62, kbg: 72 },
      up: { dmg: 7, ang: 88, bkb: 65, kbg: 66 },
      down: { dmg: 6, ang: 76, bkb: 45, kbg: 40 },
    }[kind];
    a.grabbed = null;
    v.grabbedBy = null;
    a.startMove(this, 'throw');
    a.moveData.throwKind = kind;
    v.setState('idle');
    if (kind === 'back') v.x = a.x - a.facing * (a.w / 2 + v.w / 2 - 10);
    const box = { dmg: Math.round(T.dmg * a.char.power * 10) / 10, ang: T.ang, bkb: T.bkb, kbg: T.kbg, cx: v.x, cy: v.y - v.h / 2 };
    this.applyHit({ a, d: v, box, facing: a.facing, proj: null, thrown: true });
    this.emit('throw', { a, d: v, kind, x: v.x, y: v.y - v.h / 2 });
  }

  checkBlastZones() {
    const B = STAGE.blast;
    for (const f of this.fighters) {
      if (!f.alive || f.state === 'respawn') continue;
      if (f.x < B.left || f.x > B.right || f.y > B.bottom || f.y - f.h < B.top) {
        this.ko(f);
      }
    }
  }

  ko(f) {
    this.clearGrab(f);
    const killer = f.lastHitter && this.frame - f.lastHitFrame < 600 ? f.lastHitter : null;
    if (killer) killer.stats.kos++;
    else f.stats.sds++;
    f.stats.falls++;
    if (f.ledge) { f.ledge.owner = null; f.ledge = null; }
    this.emit('ko', { f, x: f.x, y: f.y - f.h / 2, killer, pct: f.damage });
    f.stocks--;
    f.move = null;
    if (f.stocks <= 0) {
      f.state = 'out';
      f.eliminatedAt = ++this.eliminations;
      this.emit('eliminated', { f });
    } else {
      f.state = 'dead';
      f.respawnTimer = 70;
    }
    f.damage = 0;
  }

  checkGameOver() {
    const left = this.fighters.filter((f) => f.state !== 'out');
    if (left.length <= 1 && this.fighters.length > 1) {
      this.over = true;
      this.winner = left[0] || null;
      this.emit('gameover', { winner: this.winner });
    }
  }

  // 順位（1位から）
  ranking() {
    return [...this.fighters].sort((a, b) => {
      const ea = a.state === 'out' ? a.eliminatedAt : Infinity;
      const eb = b.state === 'out' ? b.eliminatedAt : Infinity;
      if (ea !== eb) return eb - ea;
      if (a.stocks !== b.stocks) return b.stocks - a.stocks;
      return a.damage - b.damage;
    });
  }
}
