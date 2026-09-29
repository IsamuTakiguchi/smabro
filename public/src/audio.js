// WebAudio による効果音（音源ファイル不要）
let ctx = null;
let master = null;
let noiseBuf = null;
export let muted = false;
const unlockHooks = [];

// BGM・歓声（music.js）から共通の出力先を使うための入口
export function getAudio() { return ctx ? { ctx, master, noiseBuf } : null; }
export function onAudioUnlock(fn) { if (ctx) fn(); else unlockHooks.push(fn); }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const fn of unlockHooks.splice(0)) fn();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function suspendAudio(hidden) {
  if (!ctx) return;
  if (hidden) ctx.suspend(); else ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

function tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.3, freq = 1500, q = 1, delay = 0, type = 'bandpass' }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  hit(kb) {
    const p = Math.min(1, kb / 180);
    noise({ dur: 0.08 + p * 0.25, vol: 0.25 + p * 0.35, freq: 2200 - p * 1500, q: 0.8 });
    tone({ type: 'square', f0: 300 - p * 150, f1: 60, dur: 0.08 + p * 0.2, vol: 0.18 + p * 0.2 });
  },
  swing() { noise({ dur: 0.07, vol: 0.08, freq: 3500, q: 2, type: 'highpass' }); },
  jump() { tone({ type: 'triangle', f0: 280, f1: 560, dur: 0.09, vol: 0.15 }); },
  land() { noise({ dur: 0.06, vol: 0.1, freq: 400, q: 1 }); },
  shield() { tone({ type: 'sine', f0: 900, f1: 700, dur: 0.1, vol: 0.18 }); },
  shieldBreak() { tone({ type: 'sawtooth', f0: 800, f1: 90, dur: 0.6, vol: 0.25 }); noise({ dur: 0.4, vol: 0.3, freq: 1200 }); },
  ko() {
    noise({ dur: 0.9, vol: 0.5, freq: 500, q: 0.5, type: 'lowpass' });
    tone({ type: 'sawtooth', f0: 1200, f1: 80, dur: 0.7, vol: 0.25 });
    tone({ type: 'square', f0: 90, f1: 40, dur: 0.8, vol: 0.3, delay: 0.05 });
  },
  projectile() { tone({ type: 'sawtooth', f0: 500, f1: 900, dur: 0.12, vol: 0.1 }); },
  counter() { tone({ type: 'square', f0: 1200, f1: 1800, dur: 0.15, vol: 0.2 }); tone({ type: 'square', f0: 1800, f1: 2400, dur: 0.15, vol: 0.15, delay: 0.08 }); },
  select() { tone({ type: 'square', f0: 660, f1: 990, dur: 0.07, vol: 0.12 }); },
  back() { tone({ type: 'square', f0: 500, f1: 300, dur: 0.07, vol: 0.12 }); },
  count() { tone({ type: 'square', f0: 520, f1: 520, dur: 0.15, vol: 0.18 }); },
  go() { tone({ type: 'square', f0: 1040, f1: 1040, dur: 0.4, vol: 0.2 }); tone({ type: 'triangle', f0: 523, f1: 523, dur: 0.4, vol: 0.15 }); },
  game() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', f0: f, f1: f, dur: 0.22, vol: 0.15, delay: i * 0.12 }));
  },
};
