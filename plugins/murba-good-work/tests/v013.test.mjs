// v0.1.3: no timed self-wakeups in a murba run; .gitignore cannot hide source from the gates
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpProj, murbaCli as m, write, runHook, tool, isDeny } from './helpers.mjs';

const git = (p, ...a) => spawnSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', ...a], { cwd: p, encoding: 'utf8' });
function seeded() {
  const p = tmpProj({ murba: false });
  write(p, 'src/id.js', 'export const id = 1;\n'); write(p, 'test/id.test.js', '// seed\n');
  git(p, 'add', '-A'); git(p, 'commit', '-qm', 'seed');
  return p;
}

test('v0.1.3: ScheduleWakeup and CronCreate are denied inside a murba project, untouched elsewhere', () => {
  const p = tmpProj();
  for (const t of ['ScheduleWakeup', 'CronCreate']) {
    const r = runHook('guard', tool(p, t, { delaySeconds: 120, prompt: 'x', reason: 'wait for builder' }), p);
    assert.equal(r.code, 0, r.err); assert.ok(isDeny(r), `${t}: ${r.out}`);
    assert.match(r.out, /완료 알림/);
  }
  const plain = tmpProj({ murba: false });
  const r = runHook('guard', tool(plain, 'ScheduleWakeup', { delaySeconds: 60, prompt: 'x', reason: 'y' }), plain);
  assert.equal(r.code, 0); assert.equal(isDeny(r), false);
});

test('v0.1.3: a skipped run cannot hide a new source file with an ignore line, nor change any .gitignore', () => {
  const p = seeded(); m(p, ['init']);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  write(p, 'src/hidden.js', 'x\n'); write(p, '.gitignore', 'src/hidden.js\n');
  const r = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r.code, 2); assert.match(r.err, /SOURCE_CHANGED_IN_SKIPPED_RUN: .*\.gitignore/);
  fs.rmSync(path.join(p, '.gitignore'));
  const r2 = m(p, ['phase', 'report', '--skip', '조사']);
  assert.equal(r2.code, 2); assert.match(r2.err, /src\/hidden\.js/, 'once the ignore line is gone the file is visible again');
  fs.rmSync(path.join(p, 'src/hidden.js'));
  write(p, 'lib/.gitignore', '*.tmp\n'); // nested ignore files count too
  assert.match(m(p, ['phase', 'report', '--skip', '조사']).err, /lib\/\.gitignore/);
  fs.rmSync(path.join(p, 'lib'), { recursive: true });
  assert.equal(m(p, ['phase', 'report', '--skip', '조사']).code, 0);
});

// ---- PR #14 review ----
const inv = p => write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
const skip = p => m(p, ['phase', 'report', '--skip', '조사']);

test('v0.1.3 r1: a .gitignore that ignores itself is still seen (new nested and new root)', () => {
  const a = seeded(); m(a, ['init']); inv(a);
  write(a, 'src/.gitignore', '*\n'); write(a, 'src/hidden.js', 'x\n');
  const r = skip(a); assert.equal(r.code, 2); assert.match(r.err, /src\/\.gitignore/);
  const b = seeded(); m(b, ['init']); inv(b);
  write(b, '.gitignore', '.gitignore\nsrc/hidden.js\n'); write(b, 'src/hidden.js', 'x\n');
  const r2 = skip(b); assert.equal(r2.code, 2); assert.match(r2.err, /\.gitignore/);
});

test('v0.1.3 r1: .gitignore work the user had before init is a baseline; editing a tracked .gitignore during the run counts', () => {
  const p = tmpProj({ murba: false });
  write(p, 'src/id.js', 'x\n'); write(p, '.gitignore', 'node_modules/\n');
  git(p, 'add', '-A'); git(p, 'commit', '-qm', 'seed');
  write(p, '.gitignore', 'node_modules/\ncoverage/\n'); // user's uncommitted tweak
  write(p, 'docs/.gitignore', '*.tmp\n');               // user's untracked nested file
  assert.equal(m(p, ['init']).code, 0); inv(p);
  assert.equal(skip(p).code, 0, 'pre-existing .gitignore work is not a change');
  const q = tmpProj({ murba: false });
  write(q, 'src/id.js', 'x\n'); write(q, '.gitignore', 'node_modules/\n');
  git(q, 'add', '-A'); git(q, 'commit', '-qm', 'seed');
  m(q, ['init']); inv(q);
  write(q, '.gitignore', 'node_modules/\nsrc/new.js\n');
  const r = skip(q); assert.equal(r.code, 2); assert.match(r.err, /\.gitignore/);
});

test('v0.1.3 r1: tracked files hidden with assume-unchanged or skip-worktree are still compared', () => {
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    const p = seeded(); m(p, ['init']); inv(p);
    git(p, 'update-index', flag, 'src/id.js');
    write(p, 'src/id.js', 'export const id = 9;\n');
    const r = skip(p); assert.equal(r.code, 2, flag); assert.match(r.err, /src\/id\.js/);
  }
});

test('v0.1.3 r1: scheduled calls are allowed once the murba run is done', () => {
  const p = seeded(); m(p, ['init']); inv(p);
  assert.equal(skip(p).code, 0); assert.equal(m(p, ['report']).code, 0); assert.equal(m(p, ['phase', 'done']).code, 0);
  const r = runHook('guard', tool(p, 'ScheduleWakeup', { delaySeconds: 60, prompt: 'x', reason: 'user /loop' }), p);
  assert.equal(r.code, 0); assert.equal(isDeny(r), false);
});
