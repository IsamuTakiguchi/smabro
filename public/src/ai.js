// CPU プレイヤー
import { STAGE, emptyInput } from './engine.js';

export class CPUController {
  constructor(level = 5) {
    this.level = Math.max(1, Math.min(9, level));
    this.hold = emptyInput();
    this.timer = 0;
    this.shieldTimer = 0;
    this.toggle = false;
    this.ledgeWait = 0;
  }

  poll(g, f) {
    const inp = emptyInput();
    if (!f.alive) return inp;
    const S = STAGE.main;
    const rnd = () => g.rand();
    this.toggle = !this.toggle;

    if (f.state === 'respawn') {
      if (f.stateFrame > 30 + rnd() * 60) inp.x = f.x > 0 ? -1 : 1;
      return inp;
    }

    // ガケつかまり
    if (f.state === 'ledge') {
      if (this.ledgeWait <= 0) this.ledgeWait = 10 + Math.floor(rnd() * 40);
      if (f.stateFrame > this.ledgeWait) {
        const r = rnd();
        if (r < 0.4) inp.y = -1;
        else if (r < 0.7) inp.jump = true;
        else inp.attack = true;
        this.ledgeWait = 0;
      }
      return inp;
    }

    // 復帰
    const offstage = !f.grounded && (f.x < S.left - 5 || f.x > S.right + 5);
    if (offstage || (!f.grounded && f.y > S.top + 10)) {
      const toward = f.x < 0 ? 1 : -1;
      inp.x = toward;
      if (f.state === 'air' || f.state === 'hitstun') {
        const edgeDist = Math.abs(f.x) - S.right;
        const needHeight = f.y > -40 || (f.vy > 0 && f.y > -140);
        if (needHeight && f.vy > -3 && f.jumpsLeft > 0 && f.state === 'air') {
          inp.jump = this.toggle;
          return inp;
        }
        if (f.state === 'air' && !f.upBUsed && f.jumpsLeft === 0 && (f.y > S.top - 20 || edgeDist > 260) && f.vy > 0) {
          inp.y = -1;
          inp.special = true;
          return inp;
        }
      }
      if (f.state === 'attack' && f.move && f.move.id === 'uspecial') { inp.y = -0.7; }
      return inp;
    }

    // ターゲット選択
    let target = null, best = Infinity;
    for (const o of g.fighters) {
      if (o === f || !o.alive || o.state === 'respawn') continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d < best) { best = d; target = o; }
    }
    if (!target) return inp;

    const dx = target.x - f.x;
    const dy = (target.y - target.h / 2) - (f.y - f.h / 2);
    const adx = Math.abs(dx);
    const reach = 60 * f.char.reach + f.w / 2;

    // 防御
    if (this.shieldTimer > 0) {
      this.shieldTimer--;
      inp.shield = true;
      if (this.shieldTimer === 0 && rnd() < 0.2 * (this.level / 9)) inp.y = 0.8;
      return inp;
    }
    const threat = target.state === 'attack' && adx < 130 && Math.abs(dy) < 90;
    const incoming = g.projectiles.some((p) => p.owner !== f && Math.abs(p.x - f.x) < 110 && Math.abs(p.y - (f.y - f.h / 2)) < 70 && Math.sign(p.vx) === Math.sign(f.x - p.x));
    if ((threat || incoming) && f.grounded && f.actionable && rnd() < this.level * 0.006) {
      this.shieldTimer = 8 + Math.floor(rnd() * 14);
      inp.shield = true;
      return inp;
    }

    // 判断タイミング
    this.timer--;
    if (this.timer > 0) {
      inp.x = this.hold.x; inp.y = this.hold.y;
      if (f.grounded) this.keepOnStage(f, inp);
      return inp;
    }
    this.timer = Math.max(2, 20 - this.level * 2) + Math.floor(rnd() * 6);
    this.hold = emptyInput();

    if (!f.actionable && f.state !== 'jumpsquat') return inp;
    if (rnd() < (9 - this.level) * 0.045) return inp; // ぼんやり

    const facingTarget = Math.sign(dx) === f.facing || adx < 8;

    if (adx < reach + 10 && Math.abs(dy) < 55) {
      const r = rnd();
      if (f.grounded) {
        if (r < 0.3) { inp.x = Math.sign(dx); inp.attack = true; }
        else if (r < 0.55) { if (facingTarget) inp.attack = true; else inp.x = Math.sign(dx); }
        else if (r < 0.72) { inp.y = 1; inp.attack = true; }
        else if (r < 0.84) { inp.y = 1; inp.special = true; }
        else { inp.jump = true; }
      } else {
        if (r < 0.5) { inp.x = Math.sign(dx); inp.attack = true; }
        else if (r < 0.8) inp.attack = true;
        else { inp.x = Math.sign(dx); }
      }
    } else if (adx < reach && dy < -50 && dy > -200) {
      inp.y = -1;
      if (f.grounded && dy > -130) inp.attack = true;
      else if (!f.grounded) inp.attack = true;
      else inp.jump = true;
    } else if (adx < reach && dy > 50 && !f.grounded) {
      inp.y = 1; inp.attack = true;
    } else if (adx > 320 && Math.abs(dy) < 120 && rnd() < 0.25) {
      if (!facingTarget) inp.x = Math.sign(dx);
      else inp.special = true;
    } else {
      inp.x = Math.sign(dx);
      if (dy < -110 && f.grounded && rnd() < 0.6) inp.jump = true;
      if (dy > 90 && f.grounded && f.platform && rnd() < 0.5) { inp.x = 0; inp.y = 1; }
      if (!f.grounded && dy < -60 && f.jumpsLeft > 0 && rnd() < 0.2) inp.jump = true;
      this.hold.x = inp.x;
      this.hold.y = inp.y > 0 ? 0 : inp.y;
    }
    if (f.grounded) this.keepOnStage(f, inp);
    return inp;
  }

  keepOnStage(f, inp) {
    const S = STAGE.main;
    if ((f.x < S.left + 50 && inp.x < 0) || (f.x > S.right - 50 && inp.x > 0)) {
      if (!inp.attack && !inp.special) inp.x = 0;
    }
  }
}
