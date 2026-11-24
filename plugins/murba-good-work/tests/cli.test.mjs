import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpProj, murbaCli as m, readState, write, setState } from './helpers.mjs';

const SPEC = '# spec\n- AC-001 WHEN add(1,2) THE SYSTEM SHALL return 3\n- AC-002 [browser] WHEN page loads THE SYSTEM SHALL show title\n';

function toApprove(p, { autoApprove = true } = {}) {
  write(p, '.murba/run-plan.json', '{"task_type":"feature"}');
  assert.equal(m(p, ['phase', 'grill']).code, 0);
  write(p, '.murba/spec.md', SPEC);
  assert.equal(m(p, ['phase', 'spec-review']).code, 0);
  write(p, '.murba/reports/spec-reviewer/review.md', 'ok');
  assert.equal(m(p, ['phase', 'revise']).code, 0);
  write(p, '.murba/ac-test-map.md', 'map');
  assert.equal(m(p, ['ac', 'sync']).code, 0);
  assert.equal(m(p, ['phase', 'approve']).code, 0);
}

test('init creates state, gitignore, refuses re-init', () => {
  const p = tmpProj();
  const st = readState(p);
  assert.equal(st.phase, 'triage'); assert.equal(st.auto, false);
  assert.match(fs.readFileSync(path.join(p, '.gitignore'), 'utf8'), /^\.murba\/$/m);
  assert.equal(m(p, ['init']).code, 1);
});

test('phase: invalid transition and missing requirement → exit 2', () => {
  const p = tmpProj();
  assert.equal(m(p, ['phase', 'build']).code, 2);
  assert.equal(m(p, ['phase', 'grill']).code, 2); // run-plan.json missing
  assert.equal(m(p, ['phase', 'nope']).code, 1);
});

test('approve: interactive allowed; headless needs --auto-approve', () => {
  const p = tmpProj(); toApprove(p);
  assert.equal(m(p, ['phase', 'setup']).code, 2);
  assert.equal(m(p, ['approve']).code, 0);
  assert.equal(readState(p).approved, true);
  assert.equal(m(p, ['phase', 'setup']).code, 0);
  assert.equal(readState(p).auto, true);

  const h = tmpProj({ murba: false });
  m(h, ['init', '--headless']); toApprove(h);
  assert.equal(m(h, ['approve']).code, 2);
  const h2 = tmpProj({ murba: false });
  m(h2, ['init', '--headless', '--auto-approve']); toApprove(h2);
  assert.equal(m(h2, ['approve']).code, 0);
  // headless detected from env
  const h3 = tmpProj({ murba: false });
  m(h3, ['init'], { env: { CLAUDE_CODE_SESSION_ATTENDED: '0' } });
  assert.equal(readState(h3).mode, 'headless');
});

test('ac sync after approval with edited AC → ACCEPTANCE_EDITED exit 2', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve']);
  write(p, '.murba/spec.md', SPEC.replace('return 3', 'return 4'));
  const r = m(p, ['ac', 'sync']);
  assert.equal(r.code, 2); assert.match(r.err, /ACCEPTANCE_EDITED/);
  assert.equal(readState(p).ac['AC-001'].text.includes('return 3'), true);
});

test('full loop: build/evaluate/fix cap/hold/qa/browser/report', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve']); m(p, ['phase', 'setup']);
  m(p, ['handoff', 'setup'], { stdin: 'setup done' }); write(p, '.murba/init.sh', '#!/bin/sh');
  assert.equal(m(p, ['phase', 'test-write']).code, 0);
  assert.equal(m(p, ['phase', 'build']).code, 2); // no test hashes
  write(p, 'tests/a.test.js', 't');
  assert.equal(m(p, ['lock-tests', 'nomatch/**']).code, 2);
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  m(p, ['handoff', 'test-write'], { stdin: 'tw' });
  assert.equal(m(p, ['phase', 'build']).code, 0);
  assert.match(m(p, ['ac', 'next']).out, /AC-001/);
  m(p, ['handoff', 'build'], { stdin: 'b' });
  assert.equal(m(p, ['phase', 'evaluate']).code, 0);
  assert.equal(m(p, ['phase', 'qa']).code, 2); // no verdict
  m(p, ['ac', 'verdict', 'AC-001', 'NOT_VERIFIED', '--sha', 'a1']);
  assert.equal(m(p, ['phase', 'build']).code, 2); // not verified
  for (let i = 1; i <= 3; i++) assert.equal(m(p, ['fix-round', 'AC-001']).code, 0);
  assert.equal(m(p, ['fix-round', 'AC-001']).code, 3);
  assert.equal(m(p, ['phase', 'fix']).code, 3);
  m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'b2']);
  assert.equal(readState(p).ac['AC-001'].last_pass_sha, 'b2');
  assert.equal(m(p, ['phase', 'qa']).code, 2); // AC-002 remaining
  assert.equal(m(p, ['phase', 'build']).code, 0);
  assert.match(m(p, ['ac', 'next']).out, /AC-002/);
  m(p, ['phase', 'evaluate']);
  m(p, ['ac', 'verdict', 'AC-002', 'VERIFIED', '--sha', 'c3']);
  assert.equal(m(p, ['phase', 'build']).code, 2); // none remaining
  assert.equal(m(p, ['phase', 'qa']).code, 0);
  m(p, ['handoff', 'qa'], { stdin: 'qa' });
  assert.equal(m(p, ['phase', 'browser']).code, 2); // no final verdicts
  m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'c3', '--final']);
  m(p, ['ac', 'verdict', 'AC-002', 'VERIFIED', '--sha', 'c3', '--final']);
  assert.equal(m(p, ['phase', 'report']).code, 2); // browser AC requires browser phase
  assert.equal(m(p, ['phase', 'browser']).code, 0);
  m(p, ['handoff', 'browser'], { stdin: 'br' });
  assert.equal(m(p, ['phase', 'report']).code, 2); // no screenshot
  write(p, '.murba/evidence/run-20261124T000000Z/AC-002.png', 'png');
  assert.equal(m(p, ['phase', 'report']).code, 0);
  assert.equal(m(p, ['phase', 'done']).code, 2); // report.md missing
  assert.equal(m(p, ['report']).code, 0);
  const rep = fs.readFileSync(path.join(p, '.murba/report.md'), 'utf8');
  for (const h of ['## 요약', '## 먼저 볼 것', '| ❌ 실패·생략 |', '| ⚠️ 미검증 |', '| 범위 밖 변경 |', '## 단계별 결과', '## AC별 판정', '## 내가 내린 결정', '## 남은 질문']) assert.ok(rep.includes(h), h);
  const html = fs.readFileSync(path.join(p, '.murba/report.html'), 'utf8');
  assert.match(html, /prefers-color-scheme:dark/); assert.match(html, /<table>/); assert.match(html, /class="b ok"/);
  assert.equal(m(p, ['phase', 'done']).code, 0);
  assert.equal(readState(p).auto, false);
  assert.equal(m(p, ['phase', 'build', '--reason', 'x']).code, 2); // done has no next
});

test('evaluate: held current AC satisfies requirement', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve']); m(p, ['phase', 'setup']);
  m(p, ['handoff', 'setup'], { stdin: 's' }); write(p, '.murba/init.sh', 'x'); m(p, ['phase', 'test-write']);
  write(p, 'tests/a.test.js', 't'); m(p, ['lock-tests', 'tests/**']); m(p, ['handoff', 'test-write'], { stdin: 't' }); m(p, ['phase', 'build']);
  m(p, ['ac', 'next']); m(p, ['handoff', 'build'], { stdin: 'b' }); m(p, ['phase', 'evaluate']);
  assert.equal(m(p, ['ac', 'hold', 'AC-001', '--reason', 'blocked by API']).code, 0);
  assert.equal(m(p, ['phase', 'build']).code, 0);
  assert.match(m(p, ['ac', 'next']).out, /AC-002/);
});

test('check-tests detects tampering and deletion', () => {
  const p = tmpProj();
  write(p, 'tests/a.test.js', 'a'); write(p, 'tests/b.test.js', 'b');
  setState(p, s => { s.phase = 'test-write'; });
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  assert.equal(m(p, ['check-tests']).code, 0);
  write(p, 'tests/a.test.js', 'changed'); fs.rmSync(path.join(p, 'tests/b.test.js'));
  const r = m(p, ['check-tests']);
  assert.equal(r.code, 2); assert.match(r.err, /변경됨/); assert.match(r.err, /삭제됨/);
});

test('decide: validates class, sanitizes tsv (formula injection, tabs)', () => {
  const p = tmpProj();
  assert.equal(m(p, ['decide', 'bogus', 'x']).code, 1);
  assert.equal(m(p, ['decide', 'taste', '=cmd()\tx', '--why', 'a\nb', '--cost', '@x']).code, 0);
  const row = fs.readFileSync(path.join(p, '.murba/decisions.tsv'), 'utf8').trim().split('\n')[1].split('\t');
  assert.equal(row.length, 7);
  assert.equal(row[3], "'=cmd() x"); assert.equal(row[4], 'a b'); assert.equal(row[6], "'@x");
});

test('handoff requires stdin and valid phase; budget exceeded exit 3', () => {
  const p = tmpProj();
  assert.equal(m(p, ['handoff', 'build']).code, 1);
  assert.equal(m(p, ['handoff', 'nope'], { stdin: 'x' }).code, 1);
  const st = readState(p); st.budget.max_subagents = 1; fs.writeFileSync(path.join(p, '.murba/state.json'), JSON.stringify(st));
  assert.equal(m(p, ['budget', '--subagent']).code, 0);
  assert.equal(m(p, ['budget', '--subagent']).code, 3);
});

test('concurrent state updates do not lose writes (lock)', async () => {
  const p = tmpProj();
  const { spawn } = await import('node:child_process');
  const { P } = await import('./helpers.mjs');
  const runs = Array.from({ length: 8 }, () => new Promise(res => {
    const c = spawn('node', [path.join(P, 'bin', 'murba'), 'budget', '--subagent'], { cwd: p, env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
    c.on('close', res);
  }));
  await Promise.all(runs);
  assert.equal(readState(p).counters.subagents, 8);
  assert.ok(!fs.existsSync(path.join(p, '.murba/.lock')));
});

test('evidence-run creates fresh run dir and CURRENT pointer', () => {
  const p = tmpProj();
  const r = m(p, ['evidence-run']);
  assert.equal(r.code, 0);
  const rel = r.out.trim();
  assert.match(rel, /^\.murba\/evidence\/run-\d{8}T\d{6}Z$/);
  assert.ok(fs.statSync(path.join(p, rel)).isDirectory());
  assert.equal(fs.readFileSync(path.join(p, '.murba/evidence/CURRENT'), 'utf8').trim(), rel);
});

test('qa → fix --ac reopens a final NOT_VERIFIED AC within fix cap', () => {
  const p = tmpProj();
  toApprove(p);
  assert.equal(m(p, ['approve']).code, 0);
  const st0 = readState(p);
  assert.equal(st0.approved, true);
  write(p, '.murba/state.json', JSON.stringify({ ...st0, phase: 'qa', final_sha: 'abc',
    ac: { ...st0.ac, 'AC-001': { ...st0.ac['AC-001'], final_verdict: { verdict: 'NOT_VERIFIED', sha: 'abc' }, verdicts: [{ verdict: 'NOT_VERIFIED', sha: 'abc', final: true }] },
      'AC-002': { ...st0.ac['AC-002'], final_verdict: { verdict: 'VERIFIED', sha: 'abc' }, verdicts: [{ verdict: 'VERIFIED', sha: 'abc', final: true }] } } }));
  write(p, '.murba/handoff/qa.md', 'qa');
  write(p, 'tests/a.test.js', 'a');
  setState(p, s => { s.phase = 'test-write'; });
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  setState(p, s => { s.phase = 'qa'; });
  assert.equal(m(p, ['phase', 'fix']).code, 1);
  assert.equal(m(p, ['phase', 'fix', '--ac', 'AC-002']).code, 2);
  assert.equal(m(p, ['phase', 'fix', '--ac', 'AC-001']).code, 0);
  const st = readState(p);
  assert.equal(st.phase, 'fix'); assert.equal(st.current_ac, 'AC-001');
});

// ---------- PR #1 독립 리뷰 지적 ----------
test('review#2: --skip cannot bypass approval or test lock', () => {
  const p = tmpProj();
  const r = m(p, ['phase', 'build', '--skip', 'x']);
  assert.equal(r.code, 2, r.out);
  assert.equal(readState(p).phase, 'triage');
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'feature' }));
  assert.equal(m(p, ['phase', 'qa', '--skip', 'x']).code, 2);
  // 위험 요청은 report로 가서 끝낼 수 있다
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청']).code, 0);
  // 승인 없이 approve 뒤 단계에 있으면 ac sync 거부
  const q = tmpProj();
  setState(q, s => { s.phase = 'setup'; });
  write(q, '.murba/spec.md', SPEC);
  assert.equal(m(q, ['ac', 'sync']).code, 2);
  // 승인됐어도 테스트 잠금 없이 build 불가
  const t = tmpProj(); toApprove(t); m(t, ['approve']);
  setState(t, s => { s.phase = 'test-write'; });
  write(t, '.murba/handoff/test-write.md', 'x');
  setState(t, s => { s.test_hashes = {}; });
  assert.equal(m(t, ['phase', 'build']).code, 2);
});

test('review#6: launcher runs without ESM detection (Node 18/20 behaviour)', () => {
  const r = spawnSync('node', ['--no-experimental-detect-module', path.join(import.meta.dirname, '..', 'bin', 'murba'), 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /murba </);
});

test('review#7: headless approve uses pre-approval stored at init, not env at approve time', () => {
  const h = tmpProj({ murba: false });
  m(h, ['init', '--headless']); toApprove(h);
  assert.equal(m(h, ['approve'], { env: { MURBA_HEADLESS: '1' } }).code, 2);
  assert.equal(readState(h).approved, false);
  const h2 = tmpProj({ murba: false });
  m(h2, ['init'], { env: { MURBA_HEADLESS: '1' } }); toApprove(h2);
  assert.equal(m(h2, ['approve']).code, 0);
});

test('review#8: lock-tests only in setup/test-write; leaving build with changed tests refused', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve']);
  write(p, 'tests/a.test.js', 'a');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 2);
  setState(p, s => { s.phase = 'test-write'; });
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  write(p, '.murba/handoff/test-write.md', 'x');
  assert.equal(m(p, ['phase', 'build']).code, 0);
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 2);
  write(p, '.murba/handoff/build.md', 'x');
  write(p, 'tests/a.test.js', 'weakened');
  const r = m(p, ['phase', 'evaluate']);
  assert.equal(r.code, 2); assert.match(r.err, /TESTS_CHANGED/);
  write(p, 'tests/a.test.js', 'a');
  assert.equal(m(p, ['phase', 'evaluate']).code, 0);
});

test('review#12: spec edited after approval blocks transitions and shows in report', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve']);
  write(p, '.murba/spec.md', SPEC + '\n추가 문장\n');
  const r = m(p, ['phase', 'setup']);
  assert.equal(r.code, 2); assert.match(r.err, /SPEC_EDITED/);
  assert.equal(m(p, ['report']).code, 0);
  assert.match(fs.readFileSync(path.join(p, '.murba/report.md'), 'utf8'), /SPEC_EDITED/);
  write(p, '.murba/spec.md', SPEC);
  assert.equal(m(p, ['phase', 'setup']).code, 0);
});
