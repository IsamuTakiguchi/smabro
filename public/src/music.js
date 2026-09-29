// BGM と観客の歓声（WebAudio でその場で合成するオリジナル曲。音源ファイル不要）
import { getAudio, onAudioUnlock } from './audio.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

let bus = null; // { music, crowd, delay }
let current = null; // 再生中の曲 { track, gain, step, next, timer }
let wanted = null;
let crowdBed = null;

function ensureBus() {
  const a = getAudio();
  if (!a) return null;
  if (bus) return a;
  const { ctx, master } = a;
  const music = ctx.createGain();
  music.gain.value = 0.55;
  music.connect(master);
  // リード用のエコー
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.3;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(music);
  const crowd = ctx.createGain();
  crowd.gain.value = 0.7;
  crowd.connect(master);
  bus = { music, crowd, delay };
  return a;
}

// ---------------------------------------------------------------- 楽器

function env(g, t, peak, a, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
}

function osc(ctx, type, freq, t, stop) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  return o;
}

const inst = {
  kick(a, out, t, vol = 0.9) {
    const { ctx } = a;
    const o = osc(ctx, 'sine', 150, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    env(g, t, vol, 0.003, 0.25);
    o.connect(g).connect(out);
  },
  snare(a, out, t, vol = 0.45) {
    const { ctx, noiseBuf } = a;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = ctx.createGain();
    env(g, t, vol, 0.002, 0.16);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
    const o = osc(ctx, 'triangle', 220, t, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g2 = ctx.createGain();
    env(g2, t, vol * 0.6, 0.002, 0.08);
    o.connect(g2).connect(out);
  },
  hat(a, out, t, open = false, vol = 0.12) {
    const { ctx, noiseBuf } = a;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain();
    env(g, t, vol, 0.001, open ? 0.18 : 0.04);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.25);
  },
  crash(a, out, t, vol = 0.18) {
    const { ctx, noiseBuf } = a;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 4000;
    const g = ctx.createGain();
    env(g, t, vol, 0.002, 1.4);
    n.connect(f).connect(g).connect(out);
    n.start(t); n.stop(t + 1.5);
  },
  bass(a, out, t, note, dur, vol = 0.32) {
    const { ctx } = a;
    const o = osc(ctx, 'sawtooth', midi(note), t, t + dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    env(g, t, vol, 0.005, dur, 0.05);
    g.gain.setValueAtTime(0.05, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(f).connect(g).connect(out);
  },
  // 金管っぽいリード（フィルタが立ち上がりで開く）
  brass(a, out, t, note, dur, vol = 0.16) {
    const { ctx } = a;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.04, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(3800, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(1800, t + dur);
    for (const [type, det] of [['sawtooth', -7], ['sawtooth', 7], ['square', 0]]) {
      const o = osc(ctx, type, midi(note), t, t + dur + 0.1);
      o.detune.value = det;
      // ビブラート
      const lfo = osc(ctx, 'sine', 5.5, t, t + dur + 0.1);
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(dur > 0.3 ? 8 : 0, t + dur);
      lfo.connect(lg).connect(o.detune);
      o.connect(f);
    }
    f.connect(g);
    g.connect(out);
    g.connect(bus.delay);
  },
  pad(a, out, t, notes, dur, vol = 0.045) {
    const { ctx } = a;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    g.gain.setValueAtTime(vol, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const n of notes) {
      for (const det of [-9, 9]) {
        const o = osc(ctx, 'sawtooth', midi(n), t, t + dur + 0.05);
        o.detune.value = det;
        o.connect(f);
      }
    }
    f.connect(g).connect(out);
  },
  stab(a, out, t, notes, vol = 0.07) {
    const { ctx } = a;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    const g = ctx.createGain();
    env(g, t, vol, 0.005, 0.3);
    for (const n of notes) osc(ctx, 'sawtooth', midi(n + 12), t, t + 0.35).connect(f);
    f.connect(g).connect(out);
  },
  pluck(a, out, t, note, vol = 0.1) {
    const { ctx } = a;
    const o = osc(ctx, 'triangle', midi(note), t, t + 0.3);
    const g = ctx.createGain();
    env(g, t, vol, 0.003, 0.25);
    o.connect(g).connect(out);
    g.connect(bus.delay);
  },
};

// ---------------------------------------------------------------- 曲データ
// 1小節 = 16ステップ。melody は [ステップ, 音, 長さ(ステップ)]

const CH = {
  Dm: [62, 65, 69], Bb: [58, 62, 65], C: [60, 64, 67], A: [57, 61, 64], F: [57, 60, 65],
  Gm: [55, 58, 62], Am: [57, 60, 64], G: [55, 59, 62], Em: [55, 59, 64],
};
const ROOT = { Dm: 38, Bb: 34, C: 36, A: 33, F: 41, Gm: 43, Am: 45, G: 43, Em: 40 };

const BATTLE = {
  bpm: 156,
  bars: [
    // A
    { c: 'Dm', m: [[0, 69, 2], [2, 74, 2], [4, 76, 2], [6, 77, 4], [10, 76, 2], [12, 74, 4]] },
    { c: 'Bb', m: [[0, 77, 4], [4, 74, 2], [6, 70, 4], [10, 72, 2], [12, 74, 4]] },
    { c: 'C', m: [[0, 76, 4], [4, 72, 2], [6, 67, 4], [10, 72, 2], [12, 76, 2], [14, 79, 2]] },
    { c: 'A', m: [[0, 81, 8], [8, 76, 2], [10, 73, 2], [12, 69, 4]] },
    { c: 'Dm', m: [[0, 69, 2], [2, 74, 2], [4, 76, 2], [6, 77, 4], [10, 79, 2], [12, 81, 4]] },
    { c: 'Bb', m: [[0, 82, 4], [4, 81, 2], [6, 77, 4], [10, 74, 2], [12, 77, 4]] },
    { c: 'C', m: [[0, 79, 4], [4, 76, 2], [6, 72, 4], [10, 76, 2], [12, 79, 4]] },
    { c: 'A', m: [[0, 81, 12], [12, 73, 4]], fill: true },
    // B（サビ）
    { c: 'F', m: [[0, 81, 2], [2, 79, 2], [4, 77, 4], [8, 72, 4], [12, 77, 2], [14, 81, 2]], crash: true },
    { c: 'C', m: [[0, 79, 4], [4, 76, 2], [6, 72, 4], [10, 67, 2], [12, 72, 2], [14, 76, 2]] },
    { c: 'Dm', m: [[0, 77, 2], [2, 76, 2], [4, 74, 4], [8, 69, 4], [12, 74, 2], [14, 77, 2]] },
    { c: 'Bb', m: [[0, 82, 4], [4, 81, 2], [6, 79, 2], [8, 77, 4], [12, 74, 4]] },
    { c: 'Gm', m: [[0, 79, 4], [4, 82, 4], [8, 86, 4], [12, 82, 4]] },
    { c: 'A', m: [[0, 85, 4], [4, 81, 4], [8, 76, 4], [12, 73, 4]] },
    { c: 'Dm', m: [[0, 86, 4], [4, 81, 2], [6, 77, 2], [8, 74, 4], [12, 77, 2], [14, 81, 2]] },
    { c: 'A', m: [[0, 76, 8], [8, 81, 8]], fill: true },
  ],
  play(a, out, step, t, spb) {
    const bar = this.bars[Math.floor(step / 16) % this.bars.length];
    const s = step % 16;
    const chorus = Math.floor(step / 16) % this.bars.length >= 8;
    // ドラム
    if (s === 0 || s === 8 || (chorus && s === 10) || (!chorus && s === 11)) inst.kick(a, out, t);
    if (s === 4 || s === 12) inst.snare(a, out, t);
    if (bar.fill && s >= 12) inst.snare(a, out, t, 0.25 + (s - 12) * 0.06);
    if (s % 2 === 0) inst.hat(a, out, t, s % 4 === 2 && chorus);
    if (s === 0 && (bar.crash || step % (16 * 8) === 0)) inst.crash(a, out, t);
    // ベース（8分でオクターブを行き来）
    if (s % 2 === 0) inst.bass(a, out, t, ROOT[bar.c] + (s % 4 === 2 ? 12 : 0), spb * 1.8);
    // コード
    if (s === 0) inst.pad(a, out, t, CH[bar.c], spb * 16);
    if (chorus && (s === 0 || s === 6 || s === 12)) inst.stab(a, out, t, CH[bar.c]);
    // メロディ
    for (const [ms, note, len] of bar.m) if (ms === s) inst.brass(a, out, t, note, spb * len * 0.92);
  },
};

const MENU = {
  bpm: 112,
  bars: [
    { c: 'C' }, { c: 'Am' }, { c: 'F' }, { c: 'G' },
    { c: 'C' }, { c: 'Em' }, { c: 'F' }, { c: 'G' },
  ],
  melody: [
    [[0, 76, 4], [4, 79, 4], [8, 84, 6], [14, 83, 2]],
    [[0, 81, 6], [6, 79, 2], [8, 76, 8]],
    [[0, 77, 4], [4, 81, 4], [8, 84, 4], [12, 81, 4]],
    [[0, 79, 12], [12, 74, 4]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 6], [14, 86, 2]],
    [[0, 88, 6], [6, 86, 2], [8, 83, 8]],
    [[0, 84, 4], [4, 81, 4], [8, 77, 4], [12, 81, 4]],
    [[0, 79, 16]],
  ],
  play(a, out, step, t, spb) {
    const bi = Math.floor(step / 16) % this.bars.length;
    const bar = this.bars[bi];
    const s = step % 16;
    const chord = CH[bar.c];
    const loop = Math.floor(step / (16 * this.bars.length));
    if (s === 0) inst.pad(a, out, t, chord, spb * 16, 0.035);
    // アルペジオ
    const arp = [0, 1, 2, 1];
    if (s % 2 === 0) inst.pluck(a, out, t, chord[arp[(s / 2) % 4]] + 12, 0.07);
    if (s % 4 === 0) inst.bass(a, out, t, ROOT[bar.c] + 12, spb * 3.5, 0.2);
    if (loop >= 1) {
      if (s === 0 || s === 8) inst.kick(a, out, t, 0.5);
      if (s === 4 || s === 12) inst.snare(a, out, t, 0.18);
      if (s % 2 === 0) inst.hat(a, out, t, false, 0.06);
      for (const [ms, note, len] of this.melody[bi]) if (ms === s) inst.brass(a, out, t, note, spb * len * 0.9, 0.09);
    }
  },
};

const TRACKS = { battle: BATTLE, menu: MENU };

// ---------------------------------------------------------------- 再生

function schedule() {
  const a = getAudio();
  if (!a || !current) return;
  const { ctx } = a;
  const spb = 60 / current.track.bpm / 4;
  // タブが裏に回って遅れたら、まとめて鳴らさずに今から再開
  if (current.next < ctx.currentTime - 0.1) current.next = ctx.currentTime + 0.05;
  while (current.next < ctx.currentTime + 0.2) {
    current.track.play(a, current.gain, current.step, current.next, spb);
    current.next += spb;
    current.step++;
  }
}

export function playMusic(name) {
  wanted = name;
  const a = ensureBus();
  if (!a) { onAudioUnlock(() => playMusic(wanted)); return; }
  if (current && current.name === name) return;
  stopMusic(0.4);
  if (!name) return;
  const { ctx } = a;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.3);
  gain.connect(bus.music);
  current = { name, track: TRACKS[name], gain, step: 0, next: ctx.currentTime + 0.08, timer: setInterval(schedule, 25) };
  schedule();
}

export function stopMusic(fade = 0.5) {
  const a = getAudio();
  if (!current || !a) { current = null; return; }
  const { ctx } = a;
  clearInterval(current.timer);
  const g = current.gain;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
  setTimeout(() => g.disconnect(), fade * 1000 + 300);
  current = null;
}

// ポーズ中などに BGM を小さくする
export function duckMusic(on) {
  const a = ensureBus();
  if (!a) return;
  bus.music.gain.setTargetAtTime(on ? 0.18 : 0.55, a.ctx.currentTime, 0.1);
}

// ---------------------------------------------------------------- 観客

// 対戦中ずっと流れる客席のざわめき
export function crowdAmbience(on) {
  const a = ensureBus();
  if (!a) { if (on) onAudioUnlock(() => crowdAmbience(true)); return; }
  const { ctx, noiseBuf } = a;
  if (on && !crowdBed) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.loop = true;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 0.8;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 1.5);
    // ゆらぎ
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23;
    const lg = ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    n.connect(f1).connect(f2).connect(g).connect(bus.crowd);
    n.start();
    crowdBed = { n, g, lfo };
  } else if (!on && crowdBed) {
    const b = crowdBed;
    crowdBed = null;
    b.g.gain.cancelScheduledValues(ctx.currentTime);
    b.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { b.n.stop(); b.lfo.stop(); }, 2000);
  }
}

// 歓声（power: 0〜1）
export function cheer(power = 0.6) {
  const a = ensureBus();
  if (!a) return;
  const { ctx, noiseBuf } = a;
  const t = ctx.currentTime;
  const dur = 1.2 + power * 1.8;
  const peak = 0.12 + power * 0.3;
  // 「わーっ」という声の帯域を重ねる
  for (const [freq, q, v] of [[500, 1.2, 1], [1100, 1.5, 0.8], [2400, 2, 0.35]]) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq * 0.85, t);
    f.frequency.linearRampToValueAtTime(freq * 1.1, t + 0.4);
    f.frequency.linearRampToValueAtTime(freq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * v, t + 0.18);
    g.gain.setValueAtTime(peak * v * 0.85, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(bus.crowd);
    n.start(t, Math.random()); n.stop(t + dur + 0.1);
  }
  // 口笛・「フゥー！」
  const whistles = Math.round(power * 4);
  for (let i = 0; i < whistles; i++) {
    const st = t + 0.1 + Math.random() * 0.6;
    const o = osc(ctx, 'sine', 1300 + Math.random() * 500, st, st + 0.6);
    o.frequency.linearRampToValueAtTime(2100 + Math.random() * 600, st + 0.25);
    o.frequency.linearRampToValueAtTime(1500, st + 0.55);
    const g = ctx.createGain();
    env(g, st, 0.025 + power * 0.02, 0.05, 0.5);
    o.connect(g).connect(bus.crowd);
  }
}

// 拍手
export function applause(seconds = 3, power = 1) {
  const a = ensureBus();
  if (!a) return;
  const { ctx, noiseBuf } = a;
  const t0 = ctx.currentTime;
  const claps = Math.round(seconds * 45 * power);
  for (let i = 0; i < claps; i++) {
    const t = t0 + Math.random() * seconds * (0.4 + 0.6 * Math.random());
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 1800; f.Q.value = 1.5;
    const g = ctx.createGain();
    const fade = 1 - (t - t0) / seconds;
    env(g, t, (0.04 + Math.random() * 0.05) * Math.max(0.2, fade), 0.001, 0.05);
    n.connect(f).connect(g).connect(bus.crowd);
    n.start(t, Math.random() * 0.8); n.stop(t + 0.08);
  }
}

// 勝利ファンファーレ
export function victoryFanfare() {
  const a = ensureBus();
  if (!a) return;
  const t = a.ctx.currentTime + 0.05;
  const b = 0.13;
  const notes = [[0, 67, 1], [1, 67, 1], [2, 67, 1], [3, 72, 5], [8, 70, 2], [10, 72, 2], [12, 76, 8]];
  for (const [s, n, l] of notes) {
    inst.brass(a, bus.music, t + s * b, n + 5, l * b * 0.95, 0.14);
    inst.brass(a, bus.music, t + s * b, n + 5 - 12, l * b * 0.95, 0.08);
  }
  inst.pad(a, bus.music, t + 12 * b, [65, 69, 72, 77], 1.6, 0.05);
  inst.kick(a, bus.music, t + 12 * b, 0.8);
  inst.crash(a, bus.music, t + 12 * b, 0.2);
}
