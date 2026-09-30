import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, STAGES, STAGE, CHARACTERS, emptyInput } from '../public/src/engine.js';
import { CPUController } from '../public/src/ai.js';

test('すべてのステージで CPU 4人の乱闘が最後まで進む', () => {
  for (const st of STAGES) {
    const g = new Game({ stage: st.id, stocks: 1, seed: 7, players: CHARACTERS.map((c) => ({ char: c.id, controller: new CPUController(8) })) });
    assert.equal(g.stageId, st.id);
    assert.equal(g.ledges[0].x, st.main.left);
    let frames = 0;
    while (!g.over && frames < 60 * 60 * 6) { g.step(); g.events.length = 0; frames++; }
    assert.ok(g.over, `${st.id}: 6分以内に決着しない`);
    for (const f of g.fighters) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
  }
});

test('スポーン位置がそのステージの上にある', () => {
  for (const st of STAGES) {
    const idle = { poll: () => emptyInput() };
    const g = new Game({ stage: st.id, players: [{ char: 'blaze', controller: idle }, { char: 'gant', controller: idle }] });
    for (let i = 0; i < 120; i++) g.step();
    for (const f of g.fighters) { assert.ok(f.grounded, `${st.id}: ${f.char.id} が落ちた`); assert.equal(f.y, st.main.top); }
  }
});

test('マグマ峡谷の動く足場は乗っているキャラを運ぶ', () => {
  const idle = { poll: () => emptyInput() };
  const g = new Game({ stage: 'volcano', players: [{ char: 'blaze', controller: idle }, { char: 'gant', controller: idle }] });
  const mover = STAGE.platforms.find((p) => p.move);
  assert.ok(mover);
  const f = g.fighters[0];
  f.x = (mover.left + mover.right) / 2; f.y = mover.y - 30; f.grounded = false; f.state = 'air';
  for (let i = 0; i < 40; i++) g.step();
  assert.ok(f.grounded && f.platform === mover, '足場に乗れていない');
  const offset = f.x - mover.left;
  for (let i = 0; i < 90; i++) g.step();
  assert.ok(f.platform === mover, '足場から落ちた');
  assert.ok(Math.abs((f.x - mover.left) - offset) < 1, `足場との相対位置がずれた ${f.x - mover.left} vs ${offset}`);
});

test('デモと対戦で別ステージのゲームを交互に進めても混ざらない', () => {
  const idle = { poll: () => emptyInput() };
  const a = new Game({ stage: 'final', players: [{ char: 'blaze', controller: idle }, { char: 'gant', controller: idle }] });
  const b = new Game({ stage: 'forest', players: [{ char: 'blaze', controller: idle }, { char: 'gant', controller: idle }] });
  for (let i = 0; i < 60; i++) { a.step(); assert.equal(STAGE.id, 'final'); b.step(); assert.equal(STAGE.id, 'forest'); }
});

// ---------------------------------------------------------------- ギミック

import { hazardState } from '../public/src/engine.js';

function idleGame(stage) {
  const idle = { poll: () => emptyInput() };
  return new Game({ stage, stocks: 3, players: [{ char: 'blaze', controller: idle }, { char: 'gant', controller: idle }] });
}
function runTo(g, frame) { while (g.frame < frame) { g.step(); g.events.length = 0; } }

test('峠の街道：車が走ってきて、道路に立っているキャラをはね飛ばす', () => {
  const g = idleGame('highway');
  const h0 = hazardState('highway', 630);
  const f = g.fighters[0];
  runTo(g, 600);
  f.x = h0.dir > 0 ? -300 : 300; f.y = 0;
  g.fighters[1].x = h0.dir > 0 ? 600 : -600;
  let hit = false;
  for (let i = 0; i < 120 && !hit; i++) { g.step(); for (const e of g.events) if (e.type === 'hit' && e.d === f) hit = true; g.events.length = 0; }
  assert.ok(hit, '車に当たっていない');
  assert.ok(f.damage >= 18);
});

test('峠の街道は端がなく、歩いて画面外に出ると撃墜される', () => {
  const walker = { poll: () => ({ ...emptyInput(), x: 1 }) };
  const idle = { poll: () => emptyInput() };
  const g = new Game({ stage: 'highway', stocks: 2, players: [{ char: 'zephyr', controller: walker }, { char: 'gant', controller: idle }] });
  g.fighters[1].x = -300;
  let ko = false;
  for (let i = 0; i < 600 && !ko; i++) { g.step(); for (const e of g.events) if (e.type === 'ko') ko = true; g.events.length = 0; }
  assert.ok(ko);
});

test('マグマ峡谷：溶岩の柱に当たるとダメージ', () => {
  const g = idleGame('volcano');
  const h = hazardState('volcano', 790);
  runTo(g, 700);
  const f = g.fighters[0];
  f.x = h.x; g.fighters[1].x = h.x > 0 ? -300 : 300;
  runTo(g, 800);
  assert.ok(f.damage >= 14, `damage ${f.damage}`);
});

test('大樹の森：強風でキャラが流される', () => {
  const g = idleGame('forest');
  runTo(g, 890);
  const f = g.fighters[0];
  const x0 = f.x;
  runTo(g, 960);
  const dir = hazardState('forest', 950).dir;
  assert.ok((f.x - x0) * dir > 40, `moved ${f.x - x0}`);
});

test('変形スタジアム：形態が変わると足場が入れかわり、氷はすべる・月面は低重力', () => {
  const g = idleGame('stadium');
  assert.equal(STAGE.form, 0);
  const f = g.fighters[0];
  // 通常形態の足場に乗せておく
  const p0 = STAGE.platforms.find((p) => p.forms.includes(0));
  f.x = (p0.left + p0.right) / 2; f.y = p0.y - 20; f.grounded = false; f.state = 'air';
  runTo(g, 60);
  assert.equal(f.platform, p0);
  runTo(g, 1510); // タワーへ変化
  assert.equal(STAGE.form, 1);
  assert.ok(f.platform !== p0, '消えた足場に乗ったまま');
  runTo(g, 3010);
  assert.equal(STAGE.form, 2);
  assert.ok(STAGE.friction < 0.5);
  runTo(g, 4510);
  assert.equal(STAGE.form, 3);
  assert.ok(STAGE.gravityMul < 1);
});

test('飛空艇：上下に動く足場に乗り続けられる', () => {
  const g = idleGame('airship');
  const p = STAGE.platforms.find((x) => x.move && x.move.axis === 'y');
  const f = g.fighters[0];
  f.x = (p.left + p.right) / 2; f.y = p.y - 30; f.grounded = false; f.state = 'air';
  runTo(g, 60);
  assert.equal(f.platform, p);
  const ys = [];
  for (let i = 0; i < 300; i++) { g.step(); g.events.length = 0; ys.push(f.y); assert.equal(f.platform, p, `frame ${g.frame} で落ちた`); }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 100, '足場が上下していない');
});
