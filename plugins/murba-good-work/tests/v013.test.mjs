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

// ---- PR #14 review round 2 ----
test('v0.1.3 r2: a new .gitignore inside a tracked folder named build/out is seen', () => {
  const p = tmpProj({ murba: false });
  write(p, 'build/tool.js', 't\n'); write(p, 'src/out/x.js', 'x\n'); git(p, 'add', '-A'); git(p, 'commit', '-qm', 'seed');
  m(p, ['init']); inv(p);
  write(p, 'build/.gitignore', 'hidden.js\n'); write(p, 'build/hidden.js', 'h\n');
  write(p, 'src/out/.gitignore', '*\n'); write(p, 'src/out/hidden.js', 'h\n');
  const r = skip(p); assert.equal(r.code, 2); assert.match(r.err, /build\/\.gitignore/); assert.match(r.err, /src\/out\/\.gitignore/);
});

test('v0.1.3 r2: tool caches and venvs with their own .gitignore are not changes (before or after init, deleted or not)', () => {
  const p = seeded();
  write(p, '.mypy_cache/.gitignore', '*\n'); write(p, '.mypy_cache/CACHEDIR.TAG', 'Signature: 8a477f597d28d172789f06886806bc55\n'); // existed before init
  m(p, ['init']); inv(p);
  write(p, '.ruff_cache/.gitignore', '*\n'); write(p, '.ruff_cache/CACHEDIR.TAG', 'x');
  write(p, 'env/pyvenv.cfg', 'home = /usr/bin\n'); write(p, 'env/.gitignore', '*\n');
  write(p, '.tox/py311/.gitignore', '*\n');
  fs.rmSync(path.join(p, '.mypy_cache'), { recursive: true }); // --cache-clear
  const r = skip(p); assert.equal(r.code, 0, r.err);
});

test('v0.1.3 r2: monorepo parent .gitignore cannot hide project files; guard protects it before approval', () => {
  const root = tmpProj({ murba: false });
  write(root, 'pkg/src/a.js', 'a\n'); write(root, '.gitignore', 'node_modules/\n'); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'seed');
  const p = path.join(root, 'pkg');
  m(p, ['init']); inv(p);
  fs.appendFileSync(path.join(root, '.gitignore'), 'pkg/src/hidden.js\n'); write(p, 'src/hidden.js', 'h\n');
  const r = skip(p); assert.equal(r.code, 2); assert.match(r.err, /\.\.\/\.gitignore/);
  const q = tmpProj({ murba: false });
  write(q, 'pkg/src/a.js', 'a\n'); git(q, 'add', '-A'); git(q, 'commit', '-qm', 'seed');
  const qp = path.join(q, 'pkg'); m(qp, ['init']);
  write(qp, '.murba/run-plan.json', JSON.stringify({ task_type: 'bug-fix' })); m(qp, ['phase', 'grill']);
  const g = runHook('guard', tool(qp, 'Bash', { command: 'echo pkg/src/hidden.js >> ../.gitignore', description: 't' }), qp);
  assert.ok(isDeny(g), g.out);
});

test('v0.1.3 r2: flagged symlinks compare link text; many flagged files stay fast', () => {
  const p = seeded();
  fs.symlinkSync('id.js', path.join(p, 'src/flink.js')); fs.mkdirSync(path.join(p, 'lib')); fs.symlinkSync('../src', path.join(p, 'lib/dlink'));
  for (let i = 0; i < 2000; i++) write(p, `data/f${i}.txt`, `${i}\n`);
  git(p, 'add', '-A'); git(p, 'commit', '-qm', 'links');
  m(p, ['init']); inv(p);
  git(p, 'update-index', '--assume-unchanged', 'src/flink.js', 'lib/dlink');
  git(p, 'ls-files', '-z'); spawnSync('sh', ['-c', 'git ls-files data | xargs git update-index --assume-unchanged'], { cwd: p });
  const t0 = Date.now(); const r = skip(p);
  assert.equal(r.code, 0, r.err); assert.ok(Date.now() - t0 < 10000, `took ${Date.now() - t0}ms`);
});

test('v0.1.3 r2: a new untracked folder whose own .gitignore ignores everything is still seen; parent rules still exempt', () => {
  const p = seeded(); m(p, ['init']); inv(p);
  write(p, 'newmod/.gitignore', '*\n'); write(p, 'newmod/x.js', 'x\n');
  const r = skip(p); assert.equal(r.code, 2); assert.match(r.err, /newmod\/\.gitignore/);
  const q = tmpProj({ murba: false });
  write(q, 'src/id.js', 'x\n'); write(q, '.gitignore', 'gen/\n'); git(q, 'add', '-A'); git(q, 'commit', '-qm', 'seed');
  m(q, ['init']); inv(q);
  write(q, 'gen/.gitignore', '*\n'); // inside a folder the user already ignores
  assert.equal(skip(q).code, 0);
});
