// v0.1.2: init leaves the project .gitignore alone, skipped runs cannot change source, init-time dirty files are a baseline
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpProj, murbaCli as m, readState, write, setState } from './helpers.mjs';

const git = (p, ...a) => spawnSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', ...a], { cwd: p, encoding: 'utf8' });
function seeded(files = { 'src/id.js': 'export const id = 1;\n', 'test/id.test.js': '// seed\n' }) {
  const p = tmpProj({ murba: false });
  for (const [f, c] of Object.entries(files)) write(p, f, c);
  git(p, 'add', '-A'); git(p, 'commit', '-qm', 'seed');
  return p;
}
const toDone = p => { assert.equal(m(p, ['report']).code, 0); return m(p, ['phase', 'done']); };
const events = p => fs.readFileSync(path.join(p, '.murba', 'events.jsonl'), 'utf8');

test('v0.1.2: init keeps the working tree clean (no project .gitignore), .murba/ ignored by git and rg-style search', () => {
  const p = seeded();
  assert.equal(m(p, ['init']).code, 0);
  assert.equal(git(p, 'status', '--porcelain').stdout, '', 'git status clean after init');
  assert.equal(fs.existsSync(path.join(p, '.gitignore')), false);
  assert.equal(git(p, 'check-ignore', '-q', '.murba/hidden/x.test.js').status, 0, '.murba/hidden ignored');
  git(p, 'add', '-A');
  assert.equal(git(p, 'diff', '--cached', '--name-only').stdout, '', 'git add -A stages nothing from .murba');
  // an existing project .gitignore is left byte-for-byte
  const q = seeded({ '.gitignore': 'node_modules\n', 'src/a.js': 'x\n' });
  assert.equal(m(q, ['init']).code, 0);
  assert.equal(fs.readFileSync(path.join(q, '.gitignore'), 'utf8'), 'node_modules\n');
});

test('v0.1.2: investigation run that changes source cannot skip to report or finish', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'src/id.js', 'export const id = 2;\n'); // self-labelled investigation, then edits code
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2, r.out); assert.match(r.err, /SOURCE_CHANGED_IN_SKIPPED_RUN: src\/id\.js/);
  assert.equal(readState(p).phase, 'triage');
  write(p, 'src/id.js', 'export const id = 1;\n');
  write(p, 'INVESTIGATION.md', '# 원인\nsrc/id.js:1\n'); // the deliverable is not source
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0);
  // edits after landing in report: done is refused until reverted; new untracked code counts too
  write(p, 'repro.mjs', 'console.log(1)\n');
  const d = toDone(p);
  assert.equal(d.code, 2, d.out); assert.match(d.err, /repro\.mjs/);
  assert.equal(readState(p).phase, 'report');
  assert.match(events(p), /source_changed_in_skipped_run/);
  fs.rmSync(path.join(p, 'repro.mjs'));
  assert.equal(toDone(p).code, 0);
});

test('v0.1.2: risky report-only run that changes source cannot finish; non-git logs the skipped gate', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'refactor', risky: true }));
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청']).code, 0);
  fs.rmSync(path.join(p, 'src'), { recursive: true }); // deleted source counts as a change
  const d = toDone(p);
  assert.equal(d.code, 2); assert.match(d.err, /src\/id\.js/);
  const n = tmpProj({ murba: false }); fs.rmSync(path.join(n, '.git'), { recursive: true }); m(n, ['init']);
  write(n, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(n, 'src/a.js', 'x');
  assert.equal(m(n, ['phase', 'report', '--skip', '조사']).code, 0);
  assert.match(events(n), /source_gate_skipped.*not a git repo/);
});

test('v0.1.2: files already changed at init are a baseline — unchanged they pass, edited again they trip the gate', () => {
  const p = seeded({ 'src/a.js': 'a1\n', 'src/b.js': 'b1\n', 'test/t.test.js': '// seed\n' });
  write(p, 'src/a.js', 'a2-user-wip\n'); // user's uncommitted work before murba
  write(p, 'src/new.js', 'untracked wip\n');
  assert.equal(m(p, ['init']).code, 0);
  assert.deepEqual(Object.keys(readState(p).base_dirty).sort(), ['src/a.js', 'src/new.js']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0, 'pre-existing wip is not a change');
  write(p, 'src/a.js', 'a3-agent\n');
  const d = toDone(p);
  assert.equal(d.code, 2); assert.match(d.err, /src\/a\.js/); assert.doesNotMatch(d.err, /new\.js/);
});


// ---- PR #12 review round 1 ----
const SPEC1 = '# spec\n- AC-001 WHEN id() THE SYSTEM SHALL return 1\n';
function approveHeadless(p, plan) {
  const H = { env: { MURBA_HEADLESS: '1' } };
  write(p, '.murba/run-plan.json', JSON.stringify(plan));
  assert.equal(m(p, ['phase', 'grill'], H).code, 0);
  write(p, '.murba/spec.md', SPEC1);
  assert.equal(m(p, ['phase', 'spec-review'], H).code, 0);
  write(p, '.murba/reports/spec-reviewer/review.md', 'ok');
  assert.equal(m(p, ['phase', 'revise'], H).code, 0);
  write(p, '.murba/ac-test-map.md', 'map');
  assert.equal(m(p, ['ac', 'sync'], H).code, 0);
  assert.equal(m(p, ['phase', 'approve'], H).code, 0);
  const r = m(p, ['approve'], H); assert.equal(r.code, 0, r.err);
  assert.equal(readState(p).approved, true);
}

test('v0.1.2 r1: non-ASCII file names are gated (tracked and untracked)', () => {
  const p = seeded({ 'src/주문.js': 'export const a = 1;\n', 'test/t.test.js': '// seed\n' }); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'src/주문.js', 'export const a = 2;\n');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /src\/주문\.js/);
  write(p, 'src/주문.js', 'export const a = 1;\n');
  write(p, '재현.mjs', 'console.log(1)\n');
  const r2 = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r2.code, 2); assert.match(r2.err, /재현\.mjs/);
});

test('v0.1.2 r1: an approved run that skips build cannot change source (headless self-approval)', () => {
  const p = seeded(); assert.equal(m(p, ['init', '--headless', '--auto-approve'], { env: { MURBA_HEADLESS: '1' } }).code, 0);
  approveHeadless(p, { task_type: 'refactor', risky: true });
  write(p, 'src/id.js', 'export const id = 2;\n');
  const r = m(p, ['phase', 'report', '--skip', '위험 요청: 안전한 부분만'], { env: { MURBA_HEADLESS: '1' } });
  assert.equal(r.code, 2, r.out); assert.match(r.err, /SOURCE_CHANGED_IN_SKIPPED_RUN: src\/id\.js/);
  write(p, 'src/id.js', 'export const id = 1;\n');
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청'], { env: { MURBA_HEADLESS: '1' } }).code, 0);
  write(p, 'src/id.js', 'export const id = 3;\n');
  const d = toDone(p);
  assert.equal(d.code, 2); assert.match(d.err, /src\/id\.js/);
});

test('v0.1.2 r1: project in a subfolder of a git repo (monorepo) — baseline and gate use project-relative paths', () => {
  const root = seeded({ 'pkg/app/src/a.js': 'a1\n', 'pkg/app/test/t.test.js': '// seed\n', 'other/b.js': 'b\n' });
  const p = path.join(root, 'pkg', 'app');
  write(root, 'pkg/app/src/a.js', 'a2-wip\n');
  write(root, 'other/b.js', 'b-wip\n'); // outside the project: not ours
  assert.equal(m(p, ['init']).code, 0);
  assert.deepEqual(Object.keys(readState(p).base_dirty), ['src/a.js']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'src/a.js', 'a3-agent\n');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /src\/a\.js/); assert.doesNotMatch(r.err, /other/);
});

test('v0.1.2 r1: staged or committed renames show the old path as deleted', () => {
  const p = seeded({ 'src/id.js': 'export const id = 1;\n', 'test/t.test.js': '// seed\n' }); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  git(p, 'mv', 'src/id.js', 'docs-id.md');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /src\/id\.js/);
  git(p, 'commit', '-qm', 'rename');
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 2);
});

test('v0.1.2 r1: dependency folders are not source; reverting the user\'s init-time WIP is a change', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'node_modules/lodash/index.js', 'x'); write(p, '.venv/lib/site-packages/pkg/__init__.py', 'x');
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0, 'npm install / venv in an investigation is fine');
  const q = seeded(); write(q, 'src/id.js', 'export const id = 42; // user wip\n'); write(q, 'src/draft.js', 'draft\n');
  m(q, ['init']);
  write(q, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  git(q, 'checkout', '--', 'src/id.js'); fs.rmSync(path.join(q, 'src/draft.js'));
  const r = m(q, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /src\/id\.js/); assert.match(r.err, /src\/draft\.js/);
});


test('v0.1.2 r1: no-commit repo records the real reason; ripgrep (if installed) does not list .murba/hidden', (t) => {
  const p = tmpProj();
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0);
  assert.match(events(p), /source_gate_skipped.*no commit at init/);
  const rg = spawnSync('rg', ['--version']);
  if (rg.status !== 0) { t.skip('rg not installed'); return; }
  const q = seeded(); m(q, ['init']);
  write(q, '.murba/hidden/h.test.js', 'HIDDEN_MARK\n'); write(q, 'src/x.js', 'HIDDEN_MARK\n');
  const out = spawnSync('rg', ['-l', 'HIDDEN_MARK'], { cwd: q, encoding: 'utf8' }).stdout;
  assert.match(out, /src\/x\.js/); assert.doesNotMatch(out, /\.murba/);
});

// ---- PR #12 review round 2 ----
test('v0.1.2 r2: a large untracked dependency folder neither hides changes nor errors the gate open', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  const nm = path.join(p, 'node_modules');
  for (let i = 0; i < 400; i++) { const d = path.join(nm, `pkg-with-a-long-enough-name-${i}`); fs.mkdirSync(d, { recursive: true }); for (let j = 0; j < 100; j++) fs.writeFileSync(path.join(d, `file-${j}.js`), ''); }
  write(p, 'src/id.js', 'export const id = 2;\n');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2, r.out + r.err); assert.match(r.err, /SOURCE_CHANGED_IN_SKIPPED_RUN: src\/id\.js —/);
  write(p, 'src/id.js', 'export const id = 1;\n');
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0, '40k dependency files alone are not source');
});

test('v0.1.2 r2: tracked sources under folders named build/out/target are still source', () => {
  const p = seeded({ 'src/build/compile.js': 'a\n', 'cmd/target/main.go': 'package main\n', 'test/t.test.js': '// seed\n' }); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'src/build/compile.js', 'b\n'); write(p, 'cmd/target/main.go', 'package main // x\n');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /src\/build\/compile\.js/); assert.match(r.err, /cmd\/target\/main\.go/);
});

test('v0.1.2 r2: git failing with a base commit closes the gate', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  fs.renameSync(path.join(p, '.git'), path.join(p, '.git-moved')); // git now fails for this project
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /SOURCE_GATE_ERROR/);
});

test('v0.1.2 r2: risky run reworked through build after a report-only skip can finish; skipping evaluate with unverified ACs cannot', () => {
  const H = { env: { MURBA_HEADLESS: '1' } };
  const p = seeded(); m(p, ['init', '--headless', '--auto-approve'], H);
  approveHeadless(p, { task_type: 'refactor', risky: true });
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청'], H).code, 0);
  assert.ok(readState(p).skipped.build);
  assert.equal(m(p, ['report'], H).code, 0);
  const th = crypto.createHash('sha256').update(fs.readFileSync(path.join(p, 'test/id.test.js'))).digest('hex');
  setState(p, s => { s.test_hashes = { 'test/id.test.js': th }; }); // tests locked earlier in the run
  const rb = m(p, ['phase', 'build', '--reason', '안전한 부분 구현'], H); assert.equal(rb.code, 0, rb.err);
  assert.equal(readState(p).skipped.build, undefined, 'rework clears skipped build and later');
  write(p, 'src/id.js', 'export const id = 2;\n'); // implemented in build
  // skipping from evaluate with an unverified AC is refused
  setState(p, s => { s.phase = 'evaluate'; });
  const r = m(p, ['phase', 'report', '--skip', '위험 요청'], H);
  assert.equal(r.code, 2); assert.match(r.err, /src\/id\.js/);
  // once every AC is VERIFIED the run can finish with its source change
  setState(p, s => { for (const id of s.ac_order) s.ac[id].verdicts = [{ verdict: 'VERIFIED', final: true }]; s.phase = 'report'; });
  const d = toDone(p);
  assert.equal(d.code, 0, d.err);
});


test('v0.1.2 r2: many untracked non-source files (git output over 1 MiB) do not trip the gate', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  for (let i = 0; i < 400; i++) { const d = path.join(p, 'data', `batch-with-a-long-enough-name-${i}`); fs.mkdirSync(d, { recursive: true }); for (let j = 0; j < 100; j++) fs.writeFileSync(path.join(d, `row-${j}.csv`), ''); }
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 0, r.err);
});

// ---- PR #12 review round 3 ----
test('v0.1.2 r3: init --force starts a new run with a fresh baseline (second run, greenfield first commit)', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0);
  assert.equal(toDone(p).code, 0);
  write(p, 'src/id.js', 'export const id = 2;\n'); git(p, 'commit', '-qam', 'earlier finished work');
  write(p, 'src/wip.js', 'user wip\n');
  assert.equal(m(p, ['init', '--force']).code, 0);
  const st = readState(p);
  assert.equal(st.base_sha, git(p, 'rev-parse', 'HEAD').stdout.trim(), 'new run: base is the current HEAD');
  assert.deepEqual(Object.keys(st.base_dirty), ['src/wip.js']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0, 'earlier work and init-time wip are not this run\'s changes');
  // greenfield: init before the first commit, then re-init turns the gate on
  const g = tmpProj();
  assert.equal(readState(g).base_sha, null);
  write(g, 'src/a.js', 'a\n'); git(g, 'add', '-A'); git(g, 'commit', '-qm', 'first');
  assert.equal(m(g, ['init', '--force']).code, 0);
  assert.ok(readState(g).base_sha);
  write(g, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(g, 'src/a.js', 'b\n');
  assert.equal(m(g, ['phase', 'report', '--skip', '조사']).code, 2);
});

test('v0.1.2 r3: new files in tracked folders named build/out/target are source; wholly new dependency folders are not', () => {
  const p = seeded({ 'src/build/compile.js': 'a\n', 'lib/out/keep.js': 'k\n', 'test/t.test.js': '// seed\n' }); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'src/build/helper.js', 'h\n'); write(p, 'lib/out/new.js', 'n\n'); write(p, 'src/newmod/x.js', 'x\n');
  write(p, 'node_modules/a/index.js', 'x'); write(p, 'dist/bundle.js', 'x'); write(p, 'pkg2/node_modules/b/index.js', 'x');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2);
  for (const f of ['src/build/helper.js', 'lib/out/new.js', 'src/newmod/x.js']) assert.match(r.err, new RegExp(f.replace(/[./]/g, '\\$&')));
  for (const f of ['node_modules', 'dist/bundle', 'pkg2/node_modules']) assert.doesNotMatch(r.err, new RegExp(f.replace(/[./]/g, '\\$&')));
});
