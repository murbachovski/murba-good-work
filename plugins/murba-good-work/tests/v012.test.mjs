// v0.1.2: init leaves the project .gitignore alone, skipped runs cannot change source, init-time dirty files are a baseline
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpProj, murbaCli as m, readState, write } from './helpers.mjs';

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

test('v0.1.2: init --force keeps the first baseline (cannot launder edits made during the run)', () => {
  const p = seeded();
  assert.equal(m(p, ['init']).code, 0);
  write(p, 'src/id.js', 'export const id = 99;\n');
  assert.equal(m(p, ['init', '--force']).code, 0);
  assert.deepEqual(readState(p).base_dirty, {});
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /src\/id\.js/);
});
