// Regressions found by scenario runs (smoke-s2, 2026-11-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  setState(proj, s => { s.phase = 'test-write'; });
  const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'murba');
  const out = execFileSync('node', [bin, 'lock-tests', '.murba/hidden/*.test.js'], { cwd: proj, env: { ...process.env, CLAUDE_PROJECT_DIR: proj }, encoding: 'utf8' });
  assert.match(out, /\.murba\/hidden\/h\.test\.js/);
});

// ---------- batch 1 (2026-11-24) ----------
import { murbaCli, setState, readState as rs, write, fixture, isBlock } from './helpers.mjs';

function projAt(phase, mutate = () => {}) {
  const p = tmpProj();
  write(p, 'tests/locked.test.js', 'locked');
  // 승인 후 단계는 승인 + 테스트 잠금이 전제(gateEntry)
  const approved = !['triage', 'grill', 'spec-review', 'revise', 'approve'].includes(phase);
  setState(p, s => { s.phase = phase; if (approved) { s.approved = true; s.test_hashes = { 'tests/locked.test.js': createHash('sha256').update('locked').digest('hex') }; } mutate(s); });
  return p;
}
function acState(s, ids, extra = {}) {
  s.ac_order = ids; s.ac = {};
  for (const id of ids) s.ac[id] = { text: `${id} text`, browser: false, held: false, verdicts: [], fix_rounds: 0, ...(extra[id] || {}) };
}
const V = (sha = 'abc') => ({ verdict: 'VERIFIED', sha, evidence: 'e', at: 'now', final: false });

// F3: current_ac null after `ac next` exhausted → evaluate → qa allowed (t086)
test('F3 evaluate→qa allowed when current_ac null and all ACs have verdicts', () => {
  const p = projAt('evaluate', s => { acState(s, ['AC-001', 'AC-002'], { 'AC-001': { verdicts: [V()] }, 'AC-002': { verdicts: [V()] } }); s.current_ac = 'AC-002'; });
  assert.equal(murbaCli(p, ['ac', 'next']).code, 2);
  assert.equal(rs(p).current_ac, null);
  const r = murbaCli(p, ['phase', 'qa']);
  assert.equal(r.code, 0, r.err + r.out);
});
test('F3 evaluate→qa refused when an AC has no verdict and current_ac null', () => {
  const p = projAt('evaluate', s => { acState(s, ['AC-001'], {}); s.current_ac = null; });
  assert.equal(murbaCli(p, ['phase', 'qa']).code, 2);
});

// F1: --skip along the default chain (t074 investigation, t091)
test('F1 investigation: triage → report --skip records skipped phases', () => {
  const p = projAt('triage');
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  const r = murbaCli(p, ['phase', 'report', '--skip', '읽기 전용 조사']);
  assert.equal(r.code, 0, r.err);
  const s = rs(p);
  assert.equal(s.phase, 'report');
  for (const ph of ['triage', 'grill', 'spec-review', 'revise', 'approve', 'setup', 'test-write', 'build', 'evaluate', 'qa', 'browser']) assert.equal(s.skipped[ph], '읽기 전용 조사', ph);
  assert.equal(s.auto, true);
  const rep = murbaCli(p, ['report']);
  assert.equal(rep.code, 0, rep.err);
  const md = fs.readFileSync(path.join(p, '.murba', 'report.md'), 'utf8');
  assert.match(md, /⏸ 생략: 읽기 전용 조사/);
});
test('F1 skip refuses backwards, past report, and approve for feature with ACs', () => {
  const p = projAt('build');
  assert.equal(murbaCli(p, ['phase', 'grill', '--skip', 'x']).code, 2);
  assert.equal(murbaCli(p, ['phase', 'done', '--skip', 'x']).code, 2);
  const q = projAt('revise', s => acState(s, ['AC-001']));
  write(q, '.murba/run-plan.json', JSON.stringify({ task_type: 'feature' }));
  assert.equal(murbaCli(q, ['phase', 'setup', '--skip', 'x']).code, 2);
  assert.equal(murbaCli(q, ['phase', 'approve', '--skip', 'x']).code, 0, 'skipping revise only is fine');
});

// F2: headless stop gate (t091 asked A/B/C at triage and stopped)
const stopIn = (p, msg) => fixture('Stop-2.json', { cwd: p, background_tasks: [], session_crons: [], last_assistant_message: msg });
test('F2 headless + question at triage → block', () => {
  const p = projAt('triage', s => { s.mode = 'headless'; s.auto = false; });
  const r = runHook('stop-gate', stopIn(p, 'A, B, C 중 하나를 알려 주면 이어서 진행한다.'), p);
  assert.ok(isBlock(r), r.out);
  assert.match(r.json.reason, /headless/);
});
test('F2 headless without report → block even without question', () => {
  const p = projAt('grill', s => { s.mode = 'headless'; s.auto = false; });
  assert.ok(isBlock(runHook('stop-gate', stopIn(p, '기획서를 썼다.'), p)));
});
test('F2 headless waiting approval with report written → allow', () => {
  const p = projAt('approve', s => { s.mode = 'headless'; s.auto = false; });
  write(p, '.murba/report.md', '# r');
  assert.ok(!isBlock(runHook('stop-gate', stopIn(p, '승인 대기. 승인해 주세요.'), p)));
});
test('F2 interactive non-auto question → allow (unchanged)', () => {
  const p = projAt('triage', s => { s.mode = 'interactive'; s.auto = false; });
  assert.ok(!isBlock(runHook('stop-gate', stopIn(p, '어느 쪽으로 할까요?'), p)));
});
test('F2 headless blocks are capped per phase (3)', () => {
  const p = projAt('triage', s => { s.mode = 'headless'; s.auto = false; });
  for (let i = 0; i < 3; i++) assert.ok(isBlock(runHook('stop-gate', stopIn(p, '어떻게 할까요?'), p)));
  assert.ok(!isBlock(runHook('stop-gate', stopIn(p, '어떻게 할까요?'), p)));
});

// F5: AC dependencies, unhold, auto-unhold on final VERIFIED (t001/t021 held-for-dependency)
test('F5 ac sync parses [after:...] and ac next respects it', () => {
  const p = projAt('grill');
  write(p, '.murba/spec.md', '- AC-001 [after:AC-002] WHEN a THE SYSTEM SHALL b\n- AC-002 [browser] WHEN c THE SYSTEM SHALL d\n');
  assert.equal(murbaCli(p, ['ac', 'sync']).code, 0);
  const s = rs(p);
  assert.deepEqual(s.ac['AC-001'].after, ['AC-002']);
  assert.equal(s.ac['AC-001'].text, 'WHEN a THE SYSTEM SHALL b');
  assert.equal(s.ac['AC-002'].browser, true);
  setState(p, x => { x.phase = 'build'; });
  assert.match(murbaCli(p, ['ac', 'next']).out, /^AC-002/);
  setState(p, x => { x.ac['AC-002'].verdicts.push(V()); });
  assert.match(murbaCli(p, ['ac', 'next']).out, /^AC-001/);
});
test('F5 ac next reports blocked deps', () => {
  const p = projAt('build', s => { acState(s, ['AC-001'], { 'AC-001': { after: ['AC-009'] } }); s.ac['AC-009'] = { text: 'x', held: false, verdicts: [{ verdict: 'NOT_VERIFIED' }] }; });
  const r = murbaCli(p, ['ac', 'next']);
  assert.equal(r.code, 2);
  assert.match(r.err + r.out, /선행 AC/);
});
test('F5 unhold and auto-unhold by final VERIFIED', () => {
  const p = projAt('qa', s => acState(s, ['AC-001', 'AC-002'], { 'AC-001': { held: true, hold_reason: 'dep' }, 'AC-002': { held: true, hold_reason: 'dep' } }));
  assert.equal(murbaCli(p, ['ac', 'unhold', 'AC-001']).code, 0);
  assert.equal(rs(p).ac['AC-001'].held, false);
  assert.equal(murbaCli(p, ['ac', 'verdict', 'AC-002', 'VERIFIED', '--sha', 'abc', '--final']).code, 0);
  const s = rs(p);
  assert.equal(s.ac['AC-002'].held, false);
  assert.equal(s.ac['AC-002'].unheld_by_final, true);
});

// guard: sh -c / bash -c inner command analysed
for (const c of [`bash -c "rm -rf ~"`, `sh -c 'git push origin main'`, `zsh -c "rm -rf /"`]) test(`guard deny inner shell: ${c}`, () => {
  const p = tmpProj();
  assert.ok(isDeny(runHook('guard', bash(p, c), p)));
});
for (const c of [`bash -c "npm test"`, `sh -c 'node --test test/*.test.js'`]) test(`guard allow inner shell: ${c}`, () => {
  const p = tmpProj();
  assert.ok(!isDeny(runHook('guard', bash(p, c), p)));
});
