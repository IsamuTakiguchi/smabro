// キーボード・ゲームパッド・タッチ入力
import { emptyInput } from './engine.js';

const keys = new Set();
const GAME_KEYS = new Set();

export const KEYMAPS = [
  { // P1
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['Space'], attack: ['KeyF'], special: ['KeyG'], shield: ['KeyH'],
  },
  { // P2
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['Numpad0'], attack: ['Comma', 'Numpad1'], special: ['Period', 'Numpad2'], shield: ['Slash', 'Numpad3'],
  },
];
for (const m of KEYMAPS) for (const list of Object.values(m)) for (const k of list) GAME_KEYS.add(k);

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (GAME_KEYS.has(e.code) && document.body.dataset.screen === 'battle') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}

const any = (list) => list.some((k) => keys.has(k));

function readKeyboard(map, out) {
  if (any(map.left)) out.x -= 1;
  if (any(map.right)) out.x += 1;
  if (any(map.up)) out.y -= 1;
  if (any(map.down)) out.y += 1;
  out.jump ||= any(map.jump);
  out.attack ||= any(map.attack);
  out.special ||= any(map.special);
  out.shield ||= any(map.shield);
}

function readGamepad(index, out) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[index];
  if (!gp) return;
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.abs(ax) > 0.3) out.x += ax;
  if (Math.abs(ay) > 0.3) out.y += ay;
  if (b(14)) out.x -= 1;
  if (b(15)) out.x += 1;
  if (b(12)) out.y -= 1;
  if (b(13)) out.y += 1;
  out.attack ||= b(0);
  out.special ||= b(1);
  out.jump ||= b(2) || b(3);
  out.shield ||= b(4) || b(5) || b(6) || b(7);
}

export function gamepadSnapshot(index) {
  const out = emptyInput();
  readGamepad(index, out);
  return out;
}

// ---------------------------------------------------------------- タッチ
// 左半分: 指を置いた場所に出るフローティングスティック（指が離れすぎると台座がついてくる）
// 右半分: タップ位置にいちばん近いボタンが反応。指をすべらせるとボタンが切りかわる

export const touchState = emptyInput();
const STICK_DEAD = 0.18; // 半径に対する遊び
const BTN_MAX_DIST = 2.6; // ボタン半径の何倍まで反応するか

export function initTouch(root) {
  const stickEl = root.querySelector('.stick');
  const knobEl = stickEl.querySelector('.knob');
  const btnEls = [...root.querySelectorAll('[data-btn]')];
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const btnPointers = new Map(); // pointerId -> ボタン名

  const radius = () => stickEl.offsetWidth / 2 || 64;

  const placeIdleStick = () => {
    const r = radius();
    stickEl.style.left = `${Math.max(r + 24, window.innerWidth * 0.14)}px`;
    stickEl.style.top = `${window.innerHeight - r - Math.min(150, window.innerHeight * 0.22)}px`;
    knobEl.style.transform = '';
    stickEl.classList.add('idle');
  };

  const nearestButton = (x, y) => {
    let best = null, bestD = Infinity;
    for (const el of btnEls) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(x - cx, y - cy) / (r.width / 2);
      if (d < bestD) { bestD = d; best = el.dataset.btn; }
    }
    return bestD <= BTN_MAX_DIST ? best : null;
  };

  const sync = () => {
    touchState.x = stick.x;
    touchState.y = stick.y;
    const held = new Set(btnPointers.values());
    for (const k of ['attack', 'special', 'jump', 'shield']) touchState[k] = held.has(k);
    for (const el of btnEls) el.classList.toggle('on', held.has(el.dataset.btn));
  };

  const moveStick = (x, y) => {
    const r = radius();
    let dx = x - stick.ox, dy = y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > r) { // 台座を指に追従させる
      stick.ox = x - (dx / d) * r;
      stick.oy = y - (dy / d) * r;
      dx = x - stick.ox; dy = y - stick.oy;
      stickEl.style.left = `${stick.ox}px`;
      stickEl.style.top = `${stick.oy}px`;
    }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy) / r;
    if (m < STICK_DEAD) { stick.x = 0; stick.y = 0; return; }
    // 少し傾けただけでしっかり入るよう増幅
    const k = Math.min(1, ((m - STICK_DEAD) / (0.7 - STICK_DEAD))) / m;
    stick.x = Math.max(-1, Math.min(1, (dx / r) * k));
    stick.y = Math.max(-1, Math.min(1, (dy / r) * k));
  };

  const left = root.querySelector('.left-zone');
  left.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stick.id !== null) return;
    left.setPointerCapture?.(e.pointerId);
    stick.id = e.pointerId;
    stick.ox = e.clientX; stick.oy = e.clientY;
    stickEl.style.left = `${stick.ox}px`;
    stickEl.style.top = `${stick.oy}px`;
    stickEl.classList.remove('idle');
    moveStick(e.clientX, e.clientY);
    sync();
  });
  left.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    moveStick(e.clientX, e.clientY);
    sync();
  });
  const endStick = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.x = 0; stick.y = 0;
    placeIdleStick();
    sync();
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) left.addEventListener(ev, endStick);

  const right = root.querySelector('.right-zone');
  right.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    right.setPointerCapture?.(e.pointerId);
    const b = nearestButton(e.clientX, e.clientY);
    btnPointers.set(e.pointerId, b);
    if (b) navigator.vibrate?.(8);
    sync();
  });
  right.addEventListener('pointermove', (e) => {
    if (!btnPointers.has(e.pointerId)) return;
    const b = nearestButton(e.clientX, e.clientY);
    if (b !== btnPointers.get(e.pointerId)) {
      btnPointers.set(e.pointerId, b);
      if (b) navigator.vibrate?.(6);
      sync();
    }
  });
  const endBtn = (e) => {
    if (!btnPointers.delete(e.pointerId)) return;
    sync();
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) right.addEventListener(ev, endBtn);

  window.addEventListener('resize', () => { if (stick.id === null) placeIdleStick(); });
  placeIdleStick();
  return { reset: () => { stick.id = null; stick.x = stick.y = 0; btnPointers.clear(); placeIdleStick(); sync(); } };
}

// ---------------------------------------------------------------- コントローラ

export class HumanController {
  constructor(slot) {
    this.slot = slot;
  }

  poll() {
    const out = emptyInput();
    if (KEYMAPS[this.slot]) readKeyboard(KEYMAPS[this.slot], out);
    readGamepad(this.slot, out);
    if (this.slot === 0) {
      out.x += touchState.x; out.y += touchState.y;
      out.jump ||= touchState.jump; out.attack ||= touchState.attack;
      out.special ||= touchState.special; out.shield ||= touchState.shield;
    }
    out.x = Math.max(-1, Math.min(1, out.x));
    out.y = Math.max(-1, Math.min(1, out.y));
    return out;
  }
}

export function isKeyDown(code) {
  return keys.has(code);
}
