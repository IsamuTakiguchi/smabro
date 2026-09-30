import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, emptyInput } from '../public/src/engine.js';

// 1フレームごとの入力を配列で渡すコントローラ
function scripted(frames) {
  let n = 0;
  return { poll: () => ({ ...emptyInput(), ...(frames[n++] || {}) }) };
}
const idle = { poll: () => emptyInput() };

function setup(p1Frames, opts = {}) {
  const g = new Game({ stocks: 3, players: [{ char: 'blaze', controller: scripted(p1Frames) }, { char: 'gant', controller: opts.p2 || idle }] });
  const [a, d] = g.fighters;
  a.x = opts.ax ?? -40; a.facing = 1;
  d.x = opts.dx ?? 30; d.facing = -1;
  return { g, a, d };
}

test('ジャンプの滞空時間が長くなっている（大ジャンプ 55フレーム以上）', () => {
  const frames = Array.from({ length: 30 }, () => ({ jump: true }));
  const { g, a } = setup(frames, { dx: 400 });
  let airborne = 0, minY = 0;
  for (let i = 0; i < 200; i++) { g.step(); if (!a.grounded) airborne++; minY = Math.min(minY, a.y); if (i > 10 && a.grounded) break; }
  assert.ok(airborne >= 55, `airtime ${airborne}`);
  assert.ok(minY < -150 && minY > -260, `height ${minY}`);
});

test('スティックをはじくと同時に攻撃 → 必殺技、倒したままあとから攻撃 → 通常攻撃', () => {
  const flick = setup([{}, { x: 1 }, { x: 1, attack: true }], { dx: 400 });
  for (let i = 0; i < 3; i++) flick.g.step();
  assert.equal(flick.a.move?.id, 'nspecial');

  const hold = setup([{}, ...Array.from({ length: 10 }, () => ({ x: 1 })), { x: 1, attack: true }], { dx: 400 });
  for (let i = 0; i < 12; i++) hold.g.step();
  assert.equal(hold.a.move?.id, 'side');

  const up = setup([{}, { y: -1 }, { y: -1, attack: true }], { dx: 400 });
  for (let i = 0; i < 3; i++) up.g.step();
  assert.equal(up.a.move?.id, 'uspecial');
});

test('相手の近くで攻撃 → つかみ、もう一度攻撃 → 投げ（ガード中の相手もつかめる）', () => {
  const frames = [{}, { attack: true }];
  for (let i = 0; i < 20; i++) frames.push({});
  frames.push({ attack: true });
  const guard = { poll: () => ({ ...emptyInput(), shield: true }) };
  const { g, a, d } = setup(frames, { p2: guard });
  let grabbed = false;
  for (let i = 0; i < 21; i++) { g.step(); if (d.state === 'grabbed') grabbed = true; }
  assert.ok(grabbed, 'つかめていない');
  assert.equal(a.state, 'grabbing');
  for (let i = 0; i < 3; i++) g.step();
  assert.ok(d.damage > 0, '投げでダメージが入っていない');
  assert.ok(['hitstun', 'air'].includes(d.state) || d.hitlag > 0, d.state);
});

test('遠くで攻撃するとつかまずにパンチ', () => {
  const { g, a } = setup([{}, { attack: true }], { dx: 400 });
  g.step(); g.step();
  assert.equal(a.move?.id, 'jab');
});

test('つかまれても連打で抜け出せる', () => {
  const mash = { poll: (() => { let n = 0; return () => ({ ...emptyInput(), attack: (n++ % 2) === 0 }); })() };
  const { g, a, d } = setup([{}, { attack: true }], { p2: mash });
  let escaped = false, wasGrabbed = false;
  for (let i = 0; i < 120; i++) { g.step(); if (d.state === 'grabbed') wasGrabbed = true; else if (wasGrabbed) { escaped = true; break; } }
  assert.ok(wasGrabbed && escaped);
  assert.equal(a.grabbed, null);
});
