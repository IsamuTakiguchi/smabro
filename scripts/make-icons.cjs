// ホーム画面用アイコンを生成する（Playwright が必要。普段のビルドやCIでは使わない）
//   node scripts/make-icons.cjs  （public/ を http://localhost:8080 で配信した状態で実行）
const path = require('path');
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

const OUT = path.join(__dirname, '..', 'public', 'icons');
const SIZES = [
  ['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-64.png', 64],
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(process.env.ICON_URL || 'http://localhost:8080/');
  for (const [name, size] of SIZES) {
    const dataUrl = await p.evaluate(async ({ size, maskable }) => {
      const { drawPortrait } = await import('./src/render.js');
      const { CHARACTERS } = await import('./src/engine.js');
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const S = size, cx = S / 2, cy = S / 2;
      // 背景（夜空のグラデーション）
      const bg = ctx.createRadialGradient(cx, cy * 0.9, S * 0.05, cx, cy, S * 0.75);
      bg.addColorStop(0, '#6a2fb0'); bg.addColorStop(0.55, '#2b1460'); bg.addColorStop(1, '#0d0b2e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S, S);
      // 爆発の光
      const k = maskable ? 0.86 : 1;
      const outer = S * 0.46 * k, inner = S * 0.28 * k;
      ctx.beginPath();
      for (let i = 0; i < 32; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 16;
        const r = i % 2 ? inner : outer * (i % 4 === 0 ? 1 : 0.85);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      const burst = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
      burst.addColorStop(0, '#ffffff'); burst.addColorStop(0.5, '#fff3a0'); burst.addColorStop(1, '#ffc23a');
      ctx.fillStyle = burst;
      ctx.fill();
      // キャラクター（ブレイズ）
      const pc = document.createElement('canvas');
      pc.width = pc.height = 512;
      drawPortrait(pc, CHARACTERS[0], 30); // 30: まばたきしていないフレーム
      // 影をつけて背景から浮かせ、上半身を大きく見せる
      const ps = S * 1.0 * k;
      ctx.save();
      ctx.shadowColor = 'rgba(30,0,50,0.95)';
      ctx.shadowBlur = S * 0.035;
      for (let i = 0; i < 3; i++) ctx.drawImage(pc, cx - ps / 2, cy - ps * 0.5, ps, ps);
      ctx.restore();
      return c.toDataURL('image/png');
    }, { size, maskable: name.startsWith('maskable') });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', name);
  }
  await b.close();
})();
