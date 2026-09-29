// 画面遷移・ゲームループ
import { Game, CHARACTERS, FPS } from './engine.js';
import { CPUController } from './ai.js';
import { HumanController, initKeyboard, initTouch, isKeyDown, gamepadSnapshot } from './input.js';
import { Renderer, SLOT_COLORS, drawPortrait } from './render.js';
import { sfx, unlockAudio, setMuted, muted } from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const renderer = new Renderer(canvas);
const silent = new Proxy({}, { get: () => () => {} });

const TYPES = ['human', 'cpu', 'off'];
const TYPE_LABEL = { human: 'プレイヤー', cpu: 'CPU', off: 'なし' };
const config = loadConfig();

let screen = 'title';
let game = null;
let demo = null;
let countdown = 0;
let goTimer = 0;
let endTimer = 0;
let slowTick = 0;

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
  screen = s;
  document.body.dataset.screen = s;
  if (s === 'battle') touch.reset();
  if (s === 'select') buildSlots();
  if (s === 'title' || s === 'select' || s === 'howto') ensureDemo();
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
  config.slots.forEach((slot, i) => {
    const c = CHARACTERS[slot.char];
    const el = document.createElement('div');
    el.className = `slot ${slot.type === 'off' ? 'off' : ''}`;
    el.style.setProperty('--slot', SLOT_COLORS[i]);
    el.style.setProperty('--char', c.color);
    el.innerHTML = `
      <div class="slot-top">
        <span class="slot-label">${slot.type === 'cpu' ? 'CP' : `${i + 1}P`}</span>
        <button class="type-btn">${TYPE_LABEL[slot.type]}</button>
      </div>
      <canvas class="portrait" width="240" height="240"></canvas>
      <div class="char-row">
        <button class="prev" aria-label="前のキャラ">◀</button>
        <span class="char-name">${c.name}</span>
        <button class="next" aria-label="次のキャラ">▶</button>
      </div>
      <div class="char-info">
        <div class="title">${c.title}</div>
        <div>${c.desc}</div>
        <div class="specials">必殺: ${c.specialNames.join(' / ')}</div>
      </div>`;
    el.querySelector('.type-btn').onclick = () => {
      slot.type = TYPES[(TYPES.indexOf(slot.type) + 1) % TYPES.length];
      sfx.select(); saveConfig(); buildSlots();
    };
    el.querySelector('.prev').onclick = () => changeChar(i, -1);
    el.querySelector('.next').onclick = () => changeChar(i, 1);
    root.appendChild(el);
  });
  $('#rule-stocks').textContent = config.stocks;
  $('#rule-level').textContent = config.level;
  drawPortraits();
}

function changeChar(i, d) {
  const s = config.slots[i];
  s.char = (s.char + d + CHARACTERS.length) % CHARACTERS.length;
  if (s.type === 'off') s.type = i === 0 ? 'human' : 'cpu';
  sfx.select(); saveConfig(); buildSlots();
}

let portraitFrame = 0;
function drawPortraits() {
  portraitFrame++;
  document.querySelectorAll('#slots .portrait').forEach((cv, i) => {
    drawPortrait(cv, CHARACTERS[config.slots[i].char], portraitFrame);
  });
}

// ---------------------------------------------------------------- 対戦

function startBattle() {
  const players = [];
  config.slots.forEach((s, i) => {
    if (s.type === 'off') return;
    players.push({
      slot: i,
      char: CHARACTERS[s.char].id,
      controller: s.type === 'human' ? new HumanController(i) : new CPUController(config.level),
    });
  });
  if (players.length < 2) {
    alert('2人以上そろえてね！（「なし」をタップしてCPUにできます）');
    return;
  }
  unlockAudio();
  game = new Game({ players, stocks: config.stocks });
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

// ---------------------------------------------------------------- ループ

function tick() {
  if (screen === 'battle') {
    if (countdown > 0) {
      const before = Math.ceil(countdown / FPS);
      countdown--;
      const after = Math.ceil(countdown / FPS);
      if (countdown === FPS * 3 - 1) sfx.count();
      else if (after !== before && after > 0) sfx.count();
      if (countdown === 0) { sfx.go(); goTimer = 50; }
      renderer.updateCamera(game);
      renderer.updateParticles();
      return;
    }
    if (goTimer > 0) goTimer--;
    if (game.over) {
      endTimer++;
      if (endTimer === 1) sfx.game();
      slowTick++;
      if (endTimer < 60 && slowTick % 3 !== 0) { renderer.updateParticles(); return; }
      if (endTimer > 170) { showResult(); return; }
    }
    game.step();
    renderer.handleEvents(game.events, sfx);
    game.events.length = 0;
    renderer.updateParticles();
    renderer.updateCamera(game);
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
    if (b && !p.b && screen === 'select') setScreen('title');
    if (screen === 'select') {
      if (left && !p.left) changeChar(i, -1);
      if (right && !p.right) changeChar(i, 1);
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
    const d = Number(btn.dataset.d);
    if (btn.dataset.rule === 'stocks') config.stocks = Math.max(1, Math.min(9, config.stocks + d));
    if (btn.dataset.rule === 'level') config.level = Math.max(1, Math.min(9, config.level + d));
    $('#rule-stocks').textContent = config.stocks;
    $('#rule-level').textContent = config.level;
    sfx.select(); saveConfig();
    return;
  }
  const act = btn.dataset.action;
  sfx.select();
  if (act === 'to-select') setScreen('select');
  else if (act === 'to-title') setScreen('title');
  else if (act === 'to-howto') setScreen('howto');
  else if (act === 'start') startBattle();
  else if (act === 'resume') togglePause();
});

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'battle' || screen === 'pause') togglePause();
    else if (screen === 'select' || screen === 'howto') setScreen('title');
    return;
  }
  if (e.code === 'Enter') {
    if (screen === 'title') { sfx.select(); setScreen('select'); }
    else if (screen === 'select' || screen === 'result') startBattle();
    return;
  }
  if (screen === 'select') {
    if (e.code === 'KeyA') changeChar(0, -1);
    if (e.code === 'KeyD') changeChar(0, 1);
    if (e.code === 'ArrowLeft') changeChar(1, -1);
    if (e.code === 'ArrowRight') changeChar(1, 1);
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
  if (document.hidden && screen === 'battle') togglePause();
});

// ---------------------------------------------------------------- 起動

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');
initKeyboard();
const touch = initTouch($('#touch'));
window.addEventListener('resize', () => renderer.resize());
setScreen('title');
requestAnimationFrame(frame);

// デバッグ用
window.__blast = { get game() { return game; }, isKeyDown };
