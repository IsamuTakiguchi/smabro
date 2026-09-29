import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, CHARACTERS } from '../public/src/engine.js';
import { CPUController } from '../public/src/ai.js';
import { NetController, packSnapshot, applySnapshot } from '../public/src/net.js';

test('ホストの状態が参加端末の表示用ゲームに正しく反映される', () => {
  const players = CHARACTERS.map((c) => ({ char: c.id }));
  const host = new Game({ stocks: 1, seed: 5, players: players.map((p) => ({ ...p, controller: new CPUController(9) })) });
  const guest = new Game({ stocks: 1, players: players.map((p) => ({ ...p, controller: null })) });
  let hits = 0;
  for (let i = 0; i < 60 * 60 * 5 && !host.over; i++) {
    host.step();
    const wire = JSON.parse(JSON.stringify(packSnapshot(host, host.events)));
    host.events.length = 0;
    const events = applySnapshot(guest, wire);
    for (const e of events) if (e.type === 'hit') { hits++; assert.ok(guest.fighters.includes(e.d)); }
    host.fighters.forEach((f, k) => {
      const g = guest.fighters[k];
      assert.ok(Math.abs(f.x - g.x) <= 0.06 && Math.abs(f.y - g.y) <= 0.06);
      assert.equal(f.state, g.state);
      assert.equal(f.stocks, g.stocks);
      assert.equal(f.move ? f.move.id : null, g.move ? g.move.id : null);
    });
    assert.equal(guest.projectiles.length, host.projectiles.length);
  }
  assert.ok(hits > 0);
  assert.equal(guest.over, host.over);
  assert.equal(guest.ranking()[0].char.id, host.ranking()[0].char.id);
});

test('一瞬だけ押されたボタンも取りこぼさない', () => {
  const c = new NetController();
  c.push({ x: 0, y: 0, attack: true });
  c.push({ x: 0, y: 0, attack: false });
  assert.equal(c.poll().attack, true);
  assert.equal(c.poll().attack, false);
});
