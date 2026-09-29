// オンライン対戦（WebRTC / PeerJS）
// 部屋をつくった端末（ホスト）がゲームを計算し、参加端末は入力を送って状態を受け取る。
import { Fighter, emptyInput } from './engine.js';

export const PEER_PREFIX = 'blastfighters-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

// ---------------------------------------------------------------- 通信手段

let peerLoader = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLoader) {
    peerLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = () => resolve(window.Peer);
      s.onerror = () => { peerLoader = null; reject(new Error('通信ライブラリを読み込めませんでした')); };
      document.head.appendChild(s);
    });
  }
  return peerLoader;
}

// テスト用: 同じブラウザ内のタブ同士を BroadcastChannel でつなぐ（?net=local）
class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this.h[ev] || []) fn(...a); }
}

class LocalConn extends Emitter {
  constructor(lp, remote, cid) { super(); this.lp = lp; this.peer = remote; this.cid = cid; this.open = false; }
  send(data) { this.lp.post({ to: this.peer, kind: 'data', cid: this.cid, data: JSON.parse(JSON.stringify(data)) }); }
  close() {
    if (!this.open) return;
    this.open = false;
    this.lp.post({ to: this.peer, kind: 'close', cid: this.cid });
    this.emit('close');
  }
}

class LocalPeer extends Emitter {
  constructor(id) {
    super();
    this.id = id || `guest-${Math.random().toString(36).slice(2, 10)}`;
    this.ch = new BroadcastChannel('blastfighters-local-net');
    this.conns = new Map();
    this.nonce = Math.random().toString(36).slice(2);
    this.ch.onmessage = (e) => this.onMsg(e.data);
    // 同じIDが既に使われていないか確認
    this.post({ to: this.id, kind: 'ping' });
    this.probe = setTimeout(() => this.emit('open', this.id), 150);
  }
  post(m) { this.ch.postMessage({ from: this.id, nonce: this.nonce, ...m }); }
  onMsg(m) {
    if (m.kind === 'ping') { if (m.to === this.id && m.nonce !== this.nonce) this.ch.postMessage({ kind: 'pong', toNonce: m.nonce }); return; }
    if (m.kind === 'pong') {
      if (m.toNonce !== this.nonce) return;
      clearTimeout(this.probe);
      const err = new Error('ID使用中'); err.type = 'unavailable-id';
      this.emit('error', err);
      return;
    }
    if (m.to !== this.id) return;
    if (m.kind === 'connect') {
      const c = new LocalConn(this, m.from, m.cid);
      this.conns.set(m.cid, c);
      this.post({ to: m.from, kind: 'accept', cid: m.cid });
      this.emit('connection', c);
      setTimeout(() => { c.open = true; c.emit('open'); }, 0);
    } else if (m.kind === 'accept') {
      const c = this.conns.get(m.cid);
      if (c) { c.open = true; c.emit('open'); }
    } else if (m.kind === 'data') {
      const c = this.conns.get(m.cid);
      if (c) c.emit('data', m.data);
    } else if (m.kind === 'close') {
      const c = this.conns.get(m.cid);
      if (c && c.open) { c.open = false; c.emit('close'); }
    }
  }
  connect(remote) {
    const cid = Math.random().toString(36).slice(2);
    const c = new LocalConn(this, remote, cid);
    this.conns.set(cid, c);
    this.post({ to: remote, kind: 'connect', cid });
    setTimeout(() => { if (!c.open) this.emit('error', Object.assign(new Error('見つかりません'), { type: 'peer-unavailable' })); }, 1500);
    return c;
  }
  destroy() {
    for (const c of this.conns.values()) c.close();
    this.ch.close();
  }
}

async function createPeer(id) {
  if (new URLSearchParams(location.search).get('net') === 'local') return new LocalPeer(id);
  const Peer = await loadPeerJS();
  return id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
}

function waitOpen(peer, ms = 12000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('通信サーバーに接続できませんでした')), ms);
    peer.on('open', () => { clearTimeout(t); resolve(); });
    peer.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

// ---------------------------------------------------------------- ホスト

export class NetHost extends Emitter {
  constructor() { super(); this.conns = new Map(); this.peer = null; this.code = ''; }

  async open() {
    for (let tries = 0; tries < 5; tries++) {
      const code = makeCode();
      const peer = await createPeer(PEER_PREFIX + code);
      try {
        await waitOpen(peer);
        this.peer = peer; this.code = code;
        peer.on('connection', (conn) => this.accept(conn));
        peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
        return code;
      } catch (e) {
        peer.destroy?.();
        if (e.type !== 'unavailable-id') throw e;
      }
    }
    throw new Error('部屋をつくれませんでした');
  }

  accept(conn) {
    const id = `${conn.peer}:${conn.connectionId || conn.cid || Math.random().toString(36).slice(2)}`;
    conn.on('open', () => {
      this.conns.set(id, conn);
      this.emit('join', id);
    });
    conn.on('data', (d) => this.emit('message', id, d));
    conn.on('close', () => { if (this.conns.delete(id)) this.emit('leave', id); });
    conn.on('error', () => { if (this.conns.delete(id)) this.emit('leave', id); });
  }

  send(id, msg) { const c = this.conns.get(id); if (c && c.open !== false) c.send(msg); }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open !== false) c.send(msg); }
  kick(id) { const c = this.conns.get(id); this.conns.delete(id); c?.close(); }
  close() { for (const c of this.conns.values()) c.close(); this.conns.clear(); this.peer?.destroy(); }
}

// ---------------------------------------------------------------- 参加者

export class NetGuest extends Emitter {
  constructor() { super(); this.peer = null; this.conn = null; }

  async join(code) {
    const peer = await createPeer(null);
    await waitOpen(peer);
    this.peer = peer;
    return new Promise((resolve, reject) => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      const t = setTimeout(() => reject(new Error('部屋が見つかりません')), 12000);
      peer.on('error', (e) => {
        clearTimeout(t);
        reject(e.type === 'peer-unavailable' ? new Error('部屋が見つかりません。コードを確認してください') : e);
      });
      conn.on('open', () => { clearTimeout(t); this.conn = conn; resolve(); });
      conn.on('data', (d) => this.emit('message', d));
      conn.on('close', () => this.emit('close'));
    });
  }

  send(msg) { if (this.conn && this.conn.open !== false) this.conn.send(msg); }
  close() { this.conn?.close(); this.peer?.destroy(); }
}

// ---------------------------------------------------------------- 遠隔プレイヤーの入力

const BUTTONS = ['jump', 'attack', 'special', 'shield'];

// 通信のゆらぎで一瞬の押下を取りこぼさないよう、押された事実を次の poll まで保持する
export class NetController {
  constructor() { this.cur = emptyInput(); this.latch = {}; this.remote = true; }
  push(i) {
    this.cur = { ...emptyInput(), ...i };
    for (const k of BUTTONS) if (i[k]) this.latch[k] = true;
  }
  poll() {
    const o = { ...this.cur };
    for (const k of BUTTONS) if (this.latch[k]) o[k] = true;
    this.latch = {};
    return o;
  }
}

// ---------------------------------------------------------------- 状態の同期

const r1 = (v) => Math.round(v * 10) / 10;
const FIELDS = ['x', 'y', 'vx', 'vy', 'kbx', 'kby', 'facing', 'state', 'stateFrame', 'grounded', 'damage', 'stocks',
  'moveFrame', 'hitlag', 'invuln', 'shieldHP', 'flash', 'eliminatedAt', 'hitstun'];
const ROUND = new Set(['x', 'y', 'vx', 'vy', 'kbx', 'kby', 'damage', 'shieldHP']);

function packValue(v, game) {
  if (v instanceof Fighter) return { $f: game.fighters.indexOf(v) };
  return v;
}

export function packSnapshot(game, events) {
  return {
    fr: game.frame,
    over: game.over,
    win: game.winner ? game.fighters.indexOf(game.winner) : -1,
    f: game.fighters.map((f) => {
      const o = {};
      for (const k of FIELDS) o[k] = ROUND.has(k) ? r1(f[k]) : f[k];
      o.mv = f.move ? f.move.id : null;
      o.dir = f.moveData && f.moveData.dir;
      o.st = f.stats;
      return o;
    }),
    p: game.projectiles.map((p) => ({
      o: game.fighters.indexOf(p.owner), x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), r: r1(p.r),
      kind: p.kind, facing: p.facing, age: p.age, life: p.life,
    })),
    e: events.map((ev) => {
      const o = {};
      for (const [k, v] of Object.entries(ev)) o[k] = packValue(v, game);
      return o;
    }),
  };
}

export function applySnapshot(game, s) {
  game.frame = s.fr;
  s.f.forEach((o, i) => {
    const f = game.fighters[i];
    if (!f) return;
    for (const k of FIELDS) f[k] = o[k];
    f.move = o.mv ? f.moves[o.mv] : null;
    f.moveData = { dir: o.dir };
    f.stats = o.st;
  });
  game.projectiles = s.p.map((p) => {
    const owner = game.fighters[p.o];
    return { ...p, owner, color: owner?.char.color, accent: owner?.char.accent };
  });
  game.over = s.over;
  game.winner = s.win >= 0 ? game.fighters[s.win] : null;
  return s.e.map((ev) => {
    const o = {};
    for (const [k, v] of Object.entries(ev)) o[k] = v && typeof v === 'object' && '$f' in v ? game.fighters[v.$f] : v;
    return o;
  });
}
