// デプロイ前チェック: 構文チェックと index.html の参照ファイル確認
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = 'public';
let failed = false;

for (const f of readdirSync(join(root, 'src'))) {
  if (!f.endsWith('.js')) continue;
  try {
    execFileSync(process.execPath, ['--check', join(root, 'src', f)], { stdio: 'pipe' });
    console.log(`✓ ${f}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${f}\n${e.stderr}`);
  }
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
  if (!existsSync(join(root, ref))) {
    failed = true;
    console.error(`✗ index.html が参照する ${ref} が見つかりません`);
  }
}

if (failed) process.exit(1);
console.log('すべてのチェックに合格しました');
