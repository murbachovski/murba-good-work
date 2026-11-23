// Regressions found by scenario runs (smoke-s2, 2026-11-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpProj, runHook, bash, sub, isDeny } from './helpers.mjs';
import { bashWriteTargets } from '../scripts/lib/patterns.mjs';

// R1: `>` inside quotes (JS arrows / comparisons in `node -e`) is not a redirect.
const QUOTED = [
  [`node -e 'console.log(r.invalid.some(i=>i.reason==="missing:qty"))'`, []],
  [`node -e "console.log(r > 0 ? 'missing:qty' : 1)"`, []],
  [`node a.js | node -e "let s='';process.stdin.on('data',d=>s+=d)"`, []],
  ['echo "a > b" > c.txt', ['c.txt']],
  ['echo hi >> "my file.txt"', ['my file.txt']],
  ['cmd 2>&1 | tee log', ['log']],
  ['cmd &> all.log', ['all.log']],
];
for (const [c, want] of QUOTED) test(`R1 write targets: ${c}`, () => assert.deepEqual(bashWriteTargets(c), want));

test('R1 evaluator node -e with arrow is allowed', () => {
  const proj = tmpProj();
  const r = runHook('guard', { ...bash(proj, `node report.js t.csv | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).invalid.some(i=>i.reason==='missing:qty')))"`), ...sub('evaluator') }, proj);
  assert.equal(isDeny(r), false, r.out);
});

// R2: hidden checks under .murba/hidden/ can be locked.
test('R2 lock-tests includes .murba/hidden', () => {
  const proj = tmpProj();
  fs.mkdirSync(path.join(proj, '.murba', 'hidden'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.murba', 'hidden', 'h.test.js'), 'x');
  const bin = path.resolve(import.meta.dirname, '..', 'bin', 'murba');
  const out = execFileSync('node', [bin, 'lock-tests', '.murba/hidden/*.test.js'], { cwd: proj, env: { ...process.env, CLAUDE_PROJECT_DIR: proj }, encoding: 'utf8' });
  assert.match(out, /\.murba\/hidden\/h\.test\.js/);
});
