import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpProj, runHook, fixture, isBlock, setState, readState, write } from './helpers.mjs';

const stopInput = (proj, extra = {}) => fixture('Stop-2.json', { cwd: proj, background_tasks: [], session_crons: [], last_assistant_message: '진행 중', ...extra });

function autoProj(phase = 'build') {
  const p = tmpProj();
  setState(p, s => { s.auto = true; s.phase = phase; s.approved = true; });
  return p;
}

test('stop-gate: not auto → allow', () => {
  const p = tmpProj();
  const r = runHook('stop-gate', stopInput(p), p);
  assert.equal(r.code, 0); assert.ok(!isBlock(r));
});

test('stop-gate: auto with missing handoff → block with next action', () => {
  const p = autoProj('build');
  const r = runHook('stop-gate', stopInput(p), p);
  assert.ok(isBlock(r), r.out);
  assert.match(r.json.reason, /handoff\/build\.md/);
  assert.equal(readState(p).counters.stop.build, 1);
});

test('stop-gate: real Stop-0 payload with running background task → allow (deferred)', () => {
  const p = autoProj('build');
  const r = runHook('stop-gate', fixture('Stop-0.json', { cwd: p }), p);
  assert.ok(!isBlock(r), r.out);
  assert.match(fs.readFileSync(path.join(p, '.murba/logs/hooks.jsonl'), 'utf8'), /deferred/);
});

test('stop-gate: real Stop-1 (stop_hook_active) still counted, exhausts at 3 per phase', () => {
  const p = autoProj('setup');
  const inp = fixture('Stop-1.json', { cwd: p });
  for (let i = 0; i < 3; i++) assert.ok(isBlock(runHook('stop-gate', inp, p)), `block #${i + 1}`);
  const r = runHook('stop-gate', inp, p);
  assert.ok(!isBlock(r), 'should release after 3');
  assert.match(fs.readFileSync(path.join(p, '.murba/decisions.tsv'), 'utf8'), /Stop 게이트 상한/);
  assert.match(fs.readFileSync(path.join(p, '.murba/logs/hooks.jsonl'), 'utf8'), /exhausted/);
});

test('stop-gate: total cap 12 across phases', () => {
  const p = autoProj('build');
  setState(p, s => { s.counters.stop_total = 12; });
  assert.ok(!isBlock(runHook('stop-gate', stopInput(p), p)));
});

test('stop-gate: question ending is recorded, not the sole reason', () => {
  const p = autoProj('build');
  const r = runHook('stop-gate', stopInput(p, { last_assistant_message: '다음 단계로 진행할까요?' }), p);
  assert.ok(isBlock(r));
  assert.match(fs.readFileSync(path.join(p, '.murba/decisions.tsv'), 'utf8'), /질문으로 턴 종료/);
});

test('stop-gate: requirements met but phase not advanced → block telling to advance', () => {
  const p = autoProj('setup');
  write(p, '.murba/handoff/setup.md', 'x'); write(p, '.murba/init.sh', '#!/bin/sh');
  const r = runHook('stop-gate', stopInput(p), p);
  assert.ok(isBlock(r)); assert.match(r.json.reason, /조건은 충족됨/);
});

test('stop-gate: done → allow; time budget exceeded → allow + decision', () => {
  const p = autoProj('done');
  assert.ok(!isBlock(runHook('stop-gate', stopInput(p), p)));
  const q = autoProj('build');
  setState(q, s => { s.started_at = '2000-01-01T00:00:00Z'; });
  assert.ok(!isBlock(runHook('stop-gate', stopInput(q), q)));
  assert.match(fs.readFileSync(path.join(q, '.murba/decisions.tsv'), 'utf8'), /시간 예산 초과/);
});

test('stop-gate: invalid input → fail-open', () => {
  const p = autoProj('build');
  const r = runHook('stop-gate', 'garbage', p);
  assert.equal(r.code, 0); assert.ok(!isBlock(r));
});

test('router: real SessionStart payload → additionalContext with phase first and last line', () => {
  const p = tmpProj();
  const r = runHook('router', fixture('SessionStart-0.json', { cwd: p, session_id: 's1' }), p);
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart');
  const lines = ctx.split('\n');
  assert.match(lines[0], /^\[murba\] phase=triage/);
  assert.match(lines[lines.length - 1], /다음 행동/);
  assert.ok(ctx.length <= 2000);
});
test('router: duplicate within 60s skipped, compact always injects', () => {
  const p = tmpProj();
  const a = fixture('SessionStart-0.json', { cwd: p, session_id: 's2' });
  assert.ok(runHook('router', a, p).json);
  assert.equal(runHook('router', a, p).out, '');
  assert.ok(runHook('router', { ...a, source: 'compact' }, p).json);
});
test('router: no .murba → silent', () => {
  const p = tmpProj({ murba: false });
  assert.equal(runHook('router', fixture('SessionStart-0.json', { cwd: p }), p).out, '');
});

test('review#13: stop cap exhaustion is recorded once, not on every Stop', () => {
  const p = autoProj('build');
  setState(p, s => { s.counters.stop = { build: 3 }; s.counters.stop_total = 3; });
  for (let i = 0; i < 4; i++) { const r = runHook('stop-gate', stopInput(p), p); assert.ok(!isBlock(r)); }
  const rows = fs.readFileSync(path.join(p, '.murba/decisions.tsv'), 'utf8').trim().split('\n').filter(l => /상한 도달/.test(l));
  assert.equal(rows.length, 1);
});
