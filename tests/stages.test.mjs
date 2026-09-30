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
