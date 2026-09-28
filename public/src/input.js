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

export const touchState = emptyInput();
const touchHeld = { left: new Set(), right: new Set(), up: new Set(), down: new Set(), jump: new Set(), attack: new Set(), special: new Set(), shield: new Set() };

export function initTouch(root) {
  const buttons = root.querySelectorAll('[data-touch]');
  const sync = () => {
    touchState.x = (touchHeld.right.size ? 1 : 0) - (touchHeld.left.size ? 1 : 0);
    touchState.y = (touchHeld.down.size ? 1 : 0) - (touchHeld.up.size ? 1 : 0);
    touchState.jump = touchHeld.jump.size > 0;
    touchState.attack = touchHeld.attack.size > 0;
    touchState.special = touchHeld.special.size > 0;
    touchState.shield = touchHeld.shield.size > 0;
    for (const el of buttons) {
      const on = el.dataset.touch.split(' ').every((k) => touchHeld[k].size > 0);
      el.classList.toggle('on', on);
    }
  };
  for (const el of buttons) {
    const names = el.dataset.touch.split(' ');
    const down = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      for (const n of names) touchHeld[n].add(e.pointerId);
      sync();
      navigator.vibrate?.(8);
    };
    const up = (e) => {
      for (const n of names) touchHeld[n].delete(e.pointerId);
      sync();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }
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
