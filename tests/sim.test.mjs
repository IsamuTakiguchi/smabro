import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, CHARACTERS, STAGE, emptyInput } from '../public/src/engine.js';
import { CPUController } from '../public/src/ai.js';

function finite(f) {
  for (const k of ['x', 'y', 'vx', 'vy', 'kbx', 'kby', 'damage']) {
    assert.ok(Number.isFinite(f[k]), `${f.char.id}.${k} is ${f[k]}`);
  }
}

test('全キャラの CPU 対戦が最後まで進行し、勝者が決まる', () => {
  for (const [i, a] of CHARACTERS.entries()) {
    const b = CHARACTERS[(i + 1) % CHARACTERS.length];
    const g = new Game({
      stocks: 2,
      seed: 1234 + i,
      players: [
        { char: a.id, controller: new CPUController(9) },
        { char: b.id, controller: new CPUController(9) },
      ],
    });
    let frames = 0;
    while (!g.over && frames < 60 * 60 * 8) {
      g.step();
      g.events.length = 0;
      for (const f of g.fighters) finite(f);
      frames++;
    }
    assert.ok(g.over, `${a.id} vs ${b.id}: 8分以内に決着しない`);
    assert.ok(g.winner, 'winner');
  }
});

test('4人乱闘でも例外なく進行する', () => {
  const g = new Game({
    stocks: 1,
    seed: 99,
    players: CHARACTERS.map((c) => ({ char: c.id, controller: new CPUController(7) })),
  });
  for (let i = 0; i < 60 * 60 * 5 && !g.over; i++) { g.step(); g.events.length = 0; }
  assert.equal(g.ranking().length, 4);
});

test('ダメージが高いほど遠くへふっとぶ（横スマッシュで撃墜できる）', () => {
  const idle = { poll: () => emptyInput() };
  const distances = [];
  for (const pct of [0, 60, 150]) {
    let n = 0;
    const atk = { poll: () => { n++; const i = emptyInput(); if (n === 5) { i.x = 1; i.attack = true; } return i; } };
    const g = new Game({ stocks: 1, players: [{ char: 'blaze', controller: atk }, { char: 'blaze', controller: idle }] });
    const [a, d] = g.fighters;
    a.x = 0; a.facing = 1; d.x = 60; d.damage = pct;
    let maxX = d.x;
    for (let i = 0; i < 240 && !g.over; i++) { g.step(); maxX = Math.max(maxX, d.x); }
    distances.push({ pct, maxX, ko: d.stocks === 0 });
  }
  assert.ok(distances[0].maxX < distances[1].maxX, JSON.stringify(distances));
  assert.ok(!distances[0].ko && distances[2].ko, JSON.stringify(distances));
});

test('ステージ上に立ったまま落ちない', () => {
  const idle = { poll: () => emptyInput() };
  const g = new Game({ stocks: 1, players: [{ char: 'gant', controller: idle }, { char: 'misty', controller: idle }] });
  for (let i = 0; i < 300; i++) g.step();
  for (const f of g.fighters) {
    assert.equal(f.y, STAGE.main.top);
    assert.ok(f.grounded);
  }
});
