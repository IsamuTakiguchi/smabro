// 画面遷移・ゲームループ
import { Game, CHARACTERS, FPS } from './engine.js';
import { CPUController } from './ai.js';
import { HumanController, initKeyboard, initTouch, isKeyDown, gamepadSnapshot } from './input.js';
import { Renderer, SLOT_COLORS, drawPortrait } from './render.js';
import { sfx, unlockAudio, setMuted, muted, suspendAudio } from './audio.js';
import { playMusic, stopMusic, duckMusic, crowdAmbience, cheer, applause, victoryFanfare } from './music.js';
import { NetHost, NetGuest, NetController, packSnapshot, applySnapshot, normalizeCode } from './net.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const renderer = new Renderer(canvas);
const silent = new Proxy({}, { get: () => () => {} });

// タップでの切りかえ順。3P・4P はキーボードがないので「なし」→「CPU」を先にする
const nextType = (i, t) => {
  const order = i === 0 ? ['human', 'cpu', 'off'] : ['cpu', 'human', 'off'];
  return order[(order.indexOf(t) + 1) % order.length];
};
const TYPE_LABEL = { human: 'プレイヤー', cpu: 'CPU', off: 'なし', host: 'ホスト', remote: 'オンライン' };
const config = loadConfig();

let screen = 'title';
let game = null;
let demo = null;
let countdown = 0;
let goTimer = 0;
let endTimer = 0;
let slowTick = 0;

// オンライン対戦の状態（null ならオフライン）
// { role: 'host'|'guest', host|guest, code, lobby, mySlot, remoteCtrls, snaps, localCtrl, lastSent }
let net = null;
const cfg = () => (net ? net.lobby : config);
const isHost = () => net?.role === 'host';
const isGuest = () => net?.role === 'guest';

// ---------------------------------------------------------------- 設定

function loadConfig() {
  const def = {
    stocks: 3, level: 5,
    slots: [
      { type: 'human', char: 0 },
      { type: 'cpu', char: 1 },
      { type: 'off', char: 2 },
      { type: 'off', char: 3 },
    ],
  };
  try {
    const saved = JSON.parse(localStorage.getItem('blast-config') || 'null');
    if (saved && Array.isArray(saved.slots) && saved.slots.length === 4) return { ...def, ...saved };
  } catch { /* 保存データなし */ }
  return def;
}

function saveConfig() {
  try { localStorage.setItem('blast-config', JSON.stringify(config)); } catch { /* 保存不可 */ }
}

// ---------------------------------------------------------------- 画面

function setScreen(s) {
  const prev = screen;
  screen = s;
  document.body.dataset.screen = s;
  updateSound(prev, s);
  if (isHost() && (s === 'select' || s === 'pause' || s === 'battle')) net.host.broadcast({ t: 'screen', s });
  if (s === 'battle') touch.reset();
  if (s === 'select') buildSlots();
  if (s === 'title' || s === 'select' || s === 'howto' || s === 'online') ensureDemo();
}

// 画面に合わせて BGM・観客の音を切りかえる
function updateSound(prev, s) {
  if (s === 'battle') {
    duckMusic(false);
    if (prev !== 'pause') playMusic('battle');
    crowdAmbience(true);
  } else if (s === 'pause') {
    duckMusic(true);
  } else if (s === 'result') {
    stopMusic(1.2);
    crowdAmbience(false);
    victoryFanfare();
    cheer(1);
    applause(4.5, 1);
  } else {
    duckMusic(false);
    crowdAmbience(false);
    playMusic('menu');
  }
}

// 大きな一撃や撃墜で観客がわく
function crowdReact(events) {
  for (const e of events) {
    if (e.type === 'hit' && e.kb > 150) cheer(Math.min(0.7, 0.3 + (e.kb - 150) / 250));
    else if (e.type === 'ko') { cheer(0.9); applause(1.8, 0.5); }
    else if (e.type === 'counter' || e.type === 'shieldbreak') cheer(0.4);
  }
}

function ensureDemo() {
  if (demo && !demo.over) return;
  const ids = [...CHARACTERS].sort(() => Math.random() - 0.5).map((c) => c.id);
  demo = new Game({
    stocks: 2,
    players: ids.map((id) => ({ char: id, controller: new CPUController(6 + Math.floor(Math.random() * 4)) })),
  });
  renderer.updateCamera(demo, true);
}

function buildSlots() {
  const root = $('#slots');
  root.innerHTML = '';
  const c0 = cfg();
  if (!c0) return;
  updateRoomInfo();
  c0.slots.forEach((slot, i) => {
    const c = CHARACTERS[slot.char];
    const el = document.createElement('div');
    el.className = `slot ${slot.type === 'off' ? 'off' : ''}`;
    el.style.setProperty('--slot', SLOT_COLORS[i]);
    el.style.setProperty('--char', c.color);
    el.innerHTML = `
      <div class="slot-top">
        <span class="slot-label">${slot.type === 'cpu' ? 'CP' : `${i + 1}P`}</span>
        <button class="type-btn" ${canEditType(i) ? '' : 'disabled'}>${net && i === net.mySlot ? 'あなた' : (slot.type === 'human' && i >= 2 ? 'プレイヤー(パッド)' : TYPE_LABEL[slot.type])}</button>
      </div>
      <canvas class="portrait" width="240" height="240"></canvas>
      <div class="char-row">
        <button class="prev" aria-label="前のキャラ" ${canEditChar(i) ? '' : 'disabled'}>◀</button>
        <span class="char-name">${c.name}</span>
        <button class="next" aria-label="次のキャラ" ${canEditChar(i) ? '' : 'disabled'}>▶</button>
      </div>
      <div class="char-info">
        <div class="title">${c.title}</div>
        <div>${c.desc}</div>
        <div class="specials">必殺: ${c.specialNames.join(' / ')}</div>
      </div>`;
    if (net && i === net.mySlot) el.classList.add('mine');
    el.querySelector('.type-btn').onclick = () => {
      if (!canEditType(i)) return;
      slot.type = nextType(i, slot.type);
      sfx.select(); lobbyChanged();
    };
    if (slot.type === 'off') {
      // 空き枠はカードのどこをタップしても CPU で参戦
      el.addEventListener('click', (e) => {
        if (e.target.closest('button') || !canEditType(i)) return;
        slot.type = 'cpu'; sfx.select(); lobbyChanged();
      });
      el.insertAdjacentHTML('beforeend', canEditType(i) ? '<div class="join-hint">タップでCPU参戦</div>' : '');
    }
    el.querySelector('.prev').onclick = () => changeChar(i, -1);
    el.querySelector('.next').onclick = () => changeChar(i, 1);
    root.appendChild(el);
  });
  $('#rule-stocks').textContent = c0.stocks;
  $('#rule-level').textContent = c0.level;
  drawPortraits();
}

function canEditType(i) {
  if (!net) return true;
  if (isGuest()) return false;
  return !['host', 'remote'].includes(net.lobby.slots[i].type);
}

function canEditChar(i) {
  if (!net) return true;
  if (isGuest()) return i === net.mySlot;
  return net.lobby.slots[i].type !== 'remote';
}

// 設定が変わったときの保存・同期
function lobbyChanged() {
  if (!net) saveConfig();
  else if (isHost()) net.host.broadcast({ t: 'lobby', lobby: net.lobby });
  if (screen === 'select') buildSlots();
}

function changeChar(i, d) {
  if (!cfg() || !canEditChar(i)) return;
  const s = cfg().slots[i];
  s.char = (s.char + d + CHARACTERS.length) % CHARACTERS.length;
  if (s.type === 'off' && !isGuest()) s.type = i === 0 ? 'human' : 'cpu';
  sfx.select();
  if (isGuest()) { net.guest.send({ t: 'char', char: s.char }); buildSlots(); } else lobbyChanged();
}

let portraitFrame = 0;
function drawPortraits() {
  portraitFrame++;
  document.querySelectorAll('#slots .portrait').forEach((cv, i) => {
    drawPortrait(cv, CHARACTERS[cfg().slots[i].char], portraitFrame);
  });
}

// ---------------------------------------------------------------- 対戦

function makePlayers(l, makeController) {
  const players = [];
  l.slots.forEach((s, i) => {
    if (s.type === 'off') return;
    players.push({ slot: i, char: CHARACTERS[s.char].id, controller: makeController(s, i) });
  });
  return players;
}

function startBattle() {
  if (isGuest()) return;
  const l = cfg();
  if (isHost()) net.remoteCtrls = {};
  const players = makePlayers(l, (s, i) => {
    if (s.type === 'cpu') return new CPUController(l.level);
    if (s.type === 'remote') return (net.remoteCtrls[i] = new NetController());
    return new HumanController(s.type === 'host' ? 0 : i);
  });
  if (players.length < 2) {
    alert(net ? '2人以上そろえてね！（参加を待つか「なし」をタップしてCPUにできます）' : '2人以上そろえてね！（「なし」をタップしてCPUにできます）');
    return;
  }
  if (isHost()) net.host.broadcast({ t: 'start', lobby: l });
  beginBattle(new Game({ players, stocks: l.stocks }));
}

// 参加端末: ホストから届いた設定で表示用のゲームを組み立てる（計算はしない）
function startGuestBattle(l) {
  net.lobby = l;
  net.snaps = [];
  net.lastSent = '';
  const players = makePlayers(l, (s) => (s.type === 'cpu' ? new CPUController(l.level) : null));
  beginBattle(new Game({ players, stocks: l.stocks }));
}

function beginBattle(g) {
  unlockAudio();
  game = g;
  renderer.particles = [];
  renderer.updateCamera(game, true);
  countdown = FPS * 3;
  goTimer = 0;
  endTimer = 0;
  setScreen('battle');
}

function showResult() {
  const rank = game.ranking();
  const w = game.winner || rank[0];
  $('#winner-name').textContent = w ? `${w.char.name}` : 'DRAW';
  $('#winner-name').style.color = w ? w.char.color : '';
  if (w) drawPortrait($('#winner-portrait'), w.char, 0);
  const body = $('#result-body');
  body.innerHTML = '';
  rank.forEach((f, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'rank-1';
    const label = f.controller instanceof CPUController ? 'CP' : `${f.slot + 1}P`;
    tr.innerHTML = `<td>${i + 1}</td><td><span class="dot" style="background:${SLOT_COLORS[f.slot]}"></span>${label} ${f.char.name}</td><td>${f.stats.kos}</td><td>${f.stats.falls}</td><td>${Math.round(f.stats.dealt)}%</td>`;
    body.appendChild(tr);
  });
  setScreen('result');
}

function togglePause() {
  if (screen === 'battle') { setScreen('pause'); sfx.back(); }
  else if (screen === 'pause') { setScreen('battle'); sfx.select(); }
}

// ---------------------------------------------------------------- オンライン

function setNetClasses() {
  document.body.classList.toggle('net', !!net);
  document.body.classList.toggle('net-host', isHost());
  document.body.classList.toggle('net-guest', isGuest());
}

function onlineStatus(msg, err = false) {
  const el = $('#online-status');
  el.textContent = msg;
  el.classList.toggle('error', err);
}

function shareUrl(code) {
  const u = new URL(location.href);
  u.search = '';
  if (new URLSearchParams(location.search).get('net') === 'local') u.searchParams.set('net', 'local');
  u.searchParams.set('room', code);
  return u.toString();
}

function updateRoomInfo() {
  if (!net) return;
  $('#room-code').textContent = net.code;
  const n = net.lobby.slots.filter((s) => s.type === 'remote' || s.type === 'host').length;
  $('#room-count').textContent = `${n}人接続中`;
}

async function hostRoom() {
  if (net) return;
  onlineStatus('部屋をつくっています…');
  const host = new NetHost();
  net = {
    role: 'host', host, code: '', mySlot: 0, remoteCtrls: {},
    lobby: {
      stocks: config.stocks, level: config.level,
      slots: [
        { type: 'host', char: config.slots[0].char },
        { type: 'off', char: 1 }, { type: 'off', char: 2 }, { type: 'off', char: 3 },
      ],
    },
  };
  host.on('join', (id) => {
    const free = net.lobby.slots.findIndex((s, i) => i > 0 && s.type === 'off');
    const free2 = free >= 0 ? free : net.lobby.slots.findIndex((s, i) => i > 0 && s.type === 'cpu');
    if (screen !== 'select' || free2 < 0) {
      host.send(id, { t: 'reject', reason: free2 < 0 ? '部屋がいっぱいです' : '対戦中です。終わるまで待ってね' });
      setTimeout(() => host.kick(id), 300);
      return;
    }
    net.lobby.slots[free2] = { type: 'remote', char: net.lobby.slots[free2].char, peer: id };
    host.send(id, { t: 'welcome', slot: free2, lobby: net.lobby, code: net.code });
    sfx.select();
    lobbyChanged();
  });
  host.on('message', (id, m) => {
    const slot = net.lobby.slots.findIndex((s) => s.peer === id);
    if (slot < 0) return;
    if (m.t === 'in') net.remoteCtrls[slot]?.push(m.i);
    else if (m.t === 'char' && screen === 'select') {
      net.lobby.slots[slot].char = ((m.char | 0) % CHARACTERS.length + CHARACTERS.length) % CHARACTERS.length;
      lobbyChanged();
    }
  });
  host.on('leave', (id) => {
    if (!net) return;
    const slot = net.lobby.slots.findIndex((s) => s.peer === id);
    if (slot < 0) return;
    const inBattle = game && !game.over && (screen === 'battle' || screen === 'pause');
    // 対戦中に抜けたプレイヤーは CPU が引きつぐ
    net.lobby.slots[slot] = { type: inBattle ? 'cpu' : 'off', char: net.lobby.slots[slot].char };
    if (inBattle) {
      const f = game.fighters.find((x) => x.slot === slot);
      if (f) f.controller = new CPUController(net.lobby.level);
    }
    delete net.remoteCtrls[slot];
    lobbyChanged();
  });
  try {
    net.code = await host.open();
    setNetClasses();
    onlineStatus('');
    setScreen('select');
  } catch (e) {
    host.close();
    net = null;
    onlineStatus(`部屋をつくれませんでした（${e.message || e.type || e}）`, true);
  }
}

async function joinRoom(raw) {
  if (net) return;
  const code = normalizeCode(raw);
  if (code.length !== 4) { onlineStatus('4文字の部屋コードを入力してね', true); return; }
  onlineStatus(`部屋 ${code} に接続しています…`);
  const guest = new NetGuest();
  net = { role: 'guest', guest, code, mySlot: -1, lobby: null, snaps: [], localCtrl: new HumanController(0), lastSent: '' };
  guest.on('message', (m) => {
    if (!net || net.guest !== guest) return;
    if (m.t === 'welcome') {
      net.mySlot = m.slot; net.lobby = m.lobby;
      setNetClasses();
      onlineStatus('');
      sfx.select();
      setScreen('select');
    } else if (m.t === 'reject') {
      leaveOnline(m.reason);
    } else if (m.t === 'lobby') {
      net.lobby = m.lobby;
      if (screen === 'select') buildSlots();
    } else if (m.t === 'start') {
      startGuestBattle(m.lobby);
    } else if (m.t === 'snap') {
      if (game) { net.snaps.push(m.s); if (net.snaps.length > 30) net.snaps.splice(0, net.snaps.length - 30); }
    } else if (m.t === 'screen') {
      if (m.s === 'select') setScreen('select');
      else if (m.s === 'pause' && screen === 'battle') setScreen('pause');
      else if (m.s === 'battle' && screen === 'pause') setScreen('battle');
    }
  });
  guest.on('close', () => { if (net && net.guest === guest) leaveOnline('ホストとの接続が切れました'); });
  try {
    await guest.join(code);
  } catch (e) {
    guest.close();
    if (net && net.guest === guest) net = null;
    onlineStatus(e.message || '接続できませんでした', true);
  }
}

function leaveOnline(message) {
  if (!net) return;
  const n = net;
  net = null;
  if (n.host) n.host.close();
  if (n.guest) n.guest.close();
  setNetClasses();
  if (new URLSearchParams(location.search).has('room')) {
    const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u);
  }
  setScreen(message ? 'online' : 'title');
  if (message) onlineStatus(message, true);
}

function confirmLeave() {
  if (!net) return true;
  if (!confirm(isHost() ? '部屋を閉じますか？（参加者との接続が切れます）' : '部屋から退出しますか？')) return false;
  leaveOnline();
  return true;
}

// 参加端末: 自分の入力を送り、届いた状態を反映する
function guestTick(withEffects) {
  if (screen === 'battle') {
    const i = net.localCtrl.poll();
    const key = JSON.stringify(i);
    if (key !== net.lastSent) { net.guest.send({ t: 'in', i }); net.lastSent = key; }
  }
  const snaps = net.snaps;
  net.snaps = [];
  for (const s of snaps) {
    const ev = applySnapshot(game, s);
    if (withEffects) { renderer.handleEvents(ev, sfx); crowdReact(ev); }
  }
}

// ---------------------------------------------------------------- ループ

function tick() {
  if (screen === 'battle') {
    if (countdown > 0) {
      const before = Math.ceil(countdown / FPS);
      countdown--;
      const after = Math.ceil(countdown / FPS);
      if (countdown === FPS * 3 - 1) sfx.count();
      else if (after !== before && after > 0) sfx.count();
      if (countdown === 0) { sfx.go(); cheer(0.5); goTimer = 50; }
      renderer.updateCamera(game);
      renderer.updateParticles();
      return;
    }
    if (goTimer > 0) goTimer--;
    if (isGuest()) {
      guestTick(true);
      if (game.over) {
        endTimer++;
        if (endTimer === 1) sfx.game();
        if (endTimer > 170) { showResult(); return; }
      }
      renderer.updateParticles();
      renderer.updateCamera(game);
      return;
    }
    if (game.over) {
      endTimer++;
      if (endTimer === 1) sfx.game();
      slowTick++;
      if (endTimer < 60 && slowTick % 3 !== 0) { renderer.updateParticles(); return; }
      if (endTimer > 170) { showResult(); return; }
    }
    game.step();
    if (isHost()) net.host.broadcast({ t: 'snap', s: packSnapshot(game, game.events) });
    renderer.handleEvents(game.events, sfx);
    crowdReact(game.events);
    game.events.length = 0;
    renderer.updateParticles();
    renderer.updateCamera(game);
  } else if (screen === 'pause' && isGuest() && game) {
    guestTick(false);
  } else if (screen !== 'pause' && screen !== 'result') {
    ensureDemo();
    demo.step();
    renderer.handleEvents(demo.events, silent);
    demo.events.length = 0;
    renderer.updateParticles();
    renderer.updateCamera(demo);
    if (screen === 'select' && demo.frame % 2 === 0) drawPortraits();
  }
}

function draw() {
  if (screen === 'battle' || screen === 'pause' || screen === 'result') {
    let banner = null, bannerT = 1;
    if (screen === 'battle' && countdown > 0) {
      banner = String(Math.ceil(countdown / FPS));
      bannerT = (countdown % FPS) / FPS;
      bannerT = 1 - bannerT;
    } else if (screen === 'battle' && goTimer > 0) {
      banner = 'GO!';
      bannerT = 1 - goTimer / 50 + 0.4;
    } else if (screen === 'battle' && game && game.over) {
      banner = 'GAME!';
      bannerT = Math.min(1, endTimer / 20);
    }
    renderer.draw(game, { banner, bannerT: Math.min(1, bannerT * 3), hudBottom: document.body.classList.contains('touch') ? 12 : 12 });
  } else if (demo) {
    renderer.draw(demo, { hudBottom: -400 });
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  pollGamepadMenu();
  while (acc >= 1 / FPS) {
    tick();
    acc -= 1 / FPS;
  }
  draw();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- メニュー操作

const padPrev = [{}, {}, {}, {}];
function pollGamepadMenu() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  for (let i = 0; i < 4; i++) {
    const gp = pads[i];
    if (!gp) continue;
    const start = !!gp.buttons[9]?.pressed;
    const a = !!gp.buttons[0]?.pressed;
    const b = !!gp.buttons[1]?.pressed;
    const inp = gamepadSnapshot(i);
    const left = inp.x < -0.5, right = inp.x > 0.5;
    const p = padPrev[i];
    if (start && !p.start) {
      if (screen === 'battle' || screen === 'pause') togglePause();
      else if (screen === 'title') setScreen('select');
      else if (screen === 'select' || screen === 'result') startBattle();
    }
    if (a && !p.a) {
      if (screen === 'title') { unlockAudio(); setScreen('select'); }
      else if (screen === 'result') startBattle();
    }
    if (b && !p.b && screen === 'select' && !net) setScreen('title');
    if (screen === 'select') {
      const target = net ? (i === 0 ? net.mySlot : -1) : i;
      if (target >= 0 && left && !p.left) changeChar(target, -1);
      if (target >= 0 && right && !p.right) changeChar(target, 1);
    }
    padPrev[i] = { start, a, b, left, right };
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action], [data-rule]');
  unlockAudio();
  if (!btn) {
    if (screen === 'title' && !e.target.closest('button')) { sfx.select(); setScreen('select'); }
    return;
  }
  if (btn.dataset.rule) {
    if (isGuest()) return;
    const c0 = cfg();
    const d = Number(btn.dataset.d);
    if (btn.dataset.rule === 'stocks') c0.stocks = Math.max(1, Math.min(9, c0.stocks + d));
    if (btn.dataset.rule === 'level') c0.level = Math.max(1, Math.min(9, c0.level + d));
    $('#rule-stocks').textContent = c0.stocks;
    $('#rule-level').textContent = c0.level;
    sfx.select(); lobbyChanged();
    return;
  }
  const act = btn.dataset.action;
  sfx.select();
  if (act === 'to-select') { if (!isGuest()) setScreen('select'); }
  else if (act === 'to-title') { if (confirmLeave()) setScreen('title'); }
  else if (act === 'to-howto') setScreen('howto');
  else if (act === 'to-online') { setScreen('online'); onlineStatus(''); }
  else if (act === 'host') hostRoom();
  else if (act === 'join') joinRoom($('#join-code').value);
  else if (act === 'leave') confirmLeave();
  else if (act === 'share') shareRoom();
  else if (act === 'start') startBattle();
  else if (act === 'resume') { if (isGuest()) setScreen('battle'); else togglePause(); }
});

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.repeat) return;
  if (e.target.closest && e.target.closest('input')) {
    if (e.code === 'Enter' && e.target.id === 'join-code') joinRoom(e.target.value);
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'battle' || screen === 'pause') togglePause();
    else if ((screen === 'select' && !net) || screen === 'howto' || screen === 'online') setScreen('title');
    return;
  }
  if (e.code === 'Enter') {
    if (screen === 'title') { sfx.select(); setScreen('select'); }
    else if (screen === 'select' || screen === 'result') startBattle();
    return;
  }
  if (screen === 'select') {
    const mine = net ? net.mySlot : 0;
    if (e.code === 'KeyA') changeChar(mine, -1);
    if (e.code === 'KeyD') changeChar(mine, 1);
    if (!net && e.code === 'ArrowLeft') changeChar(1, -1);
    if (!net && e.code === 'ArrowRight') changeChar(1, 1);
  }
});

$('#touch-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); togglePause(); });

const muteBtn = $('#mute');
const applyMute = (m) => { setMuted(m); muteBtn.textContent = m ? '🔇' : '🔊'; };
try { applyMute(localStorage.getItem('blast-muted') === '1'); } catch { /* ignore */ }
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  unlockAudio();
  applyMute(!muted);
  try { localStorage.setItem('blast-muted', muted ? '1' : '0'); } catch { /* ignore */ }
});

document.addEventListener('visibilitychange', () => {
  suspendAudio(document.hidden);
  if (document.hidden && screen === 'battle' && !isGuest()) togglePause();
});

async function shareRoom() {
  if (!net) return;
  const url = shareUrl(net.code);
  try {
    if (navigator.share) { await navigator.share({ title: '大乱闘ブラストファイターズ', text: `部屋コード ${net.code} で対戦しよう！`, url }); return; }
  } catch { /* キャンセル */ }
  try { await navigator.clipboard.writeText(url); $('#share-btn').textContent = 'コピーしました'; } catch { prompt('このURLを送ってね', url); }
  setTimeout(() => { $('#share-btn').textContent = '招待URLを共有'; }, 2000);
}

// ---------------------------------------------------------------- 起動

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');
initKeyboard();
const touch = initTouch($('#touch'));
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 250));
const roomParam = normalizeCode(new URLSearchParams(location.search).get('room'));
if (roomParam.length === 4) {
  setScreen('online');
  $('#join-code').value = roomParam;
  joinRoom(roomParam);
} else {
  setScreen('title');
}
requestAnimationFrame(frame);

// デバッグ用
window.__blast = { get game() { return game; }, get net() { return net; }, get screen() { return screen; }, isKeyDown };
