import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  assert.equal(m(p, ['approve', '--human']).code, 0);
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
  const p = tmpProj(); toApprove(p); m(p, ['approve', '--human']);
  write(p, '.murba/spec.md', SPEC.replace('return 3', 'return 4'));
  const r = m(p, ['ac', 'sync']);
  assert.equal(r.code, 2); assert.match(r.err, /ACCEPTANCE_EDITED/);
  assert.equal(readState(p).ac['AC-001'].text.includes('return 3'), true);
});

test('full loop: build/evaluate/fix cap/hold/qa/browser/report', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve', '--human']); m(p, ['phase', 'setup']);
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
  const p = tmpProj(); toApprove(p); m(p, ['approve', '--human']); m(p, ['phase', 'setup']);
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
  const st = readState(p); st.budget.max_subagents = 1; write(p, '.murba/state.json', JSON.stringify(st));
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
  assert.equal(m(p, ['approve', '--human']).code, 0);
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
  // 구현 작업은 report로도 건너뛸 수 없다(예비 비교 결함). v0.1.1 2차: decide irreversible로도 풀리지 않는다
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청']).code, 2);
  assert.equal(m(p, ['decide', 'irreversible', 'DB 삭제 요청', '--why', '확인 필요']).code, 0);
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청']).code, 2);
  // 승인 없이 approve 뒤 단계에 있으면 ac sync 거부
  const q = tmpProj();
  setState(q, s => { s.phase = 'setup'; });
  write(q, '.murba/spec.md', SPEC);
  assert.equal(m(q, ['ac', 'sync']).code, 2);
  // 승인됐어도 테스트 잠금 없이 build 불가
  const t = tmpProj(); toApprove(t); m(t, ['approve', '--human']);
  setState(t, s => { s.phase = 'test-write'; });
  write(t, '.murba/handoff/test-write.md', 'x');
  setState(t, s => { s.test_hashes = {}; });
  assert.equal(m(t, ['phase', 'build']).code, 2);
});

test('review#6: launcher runs without ESM detection (Node 18/20 behaviour)', () => {
  // Node 18 has no detection (and no flag); newer Node gets the flag to mimic it
  const flags = process.allowedNodeEnvironmentFlags.has('--no-experimental-detect-module') ? ['--no-experimental-detect-module'] : [];
  const r = spawnSync(process.execPath, [...flags, path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'murba'), 'help'], { encoding: 'utf8' });
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
  const p = tmpProj(); toApprove(p); m(p, ['approve', '--human']);
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
  const p = tmpProj(); toApprove(p); m(p, ['approve', '--human']);
  write(p, '.murba/spec.md', SPEC + '\n추가 문장\n');
  const r = m(p, ['phase', 'setup']);
  assert.equal(r.code, 2); assert.match(r.err, /SPEC_EDITED/);
  assert.equal(m(p, ['report']).code, 0);
  assert.match(fs.readFileSync(path.join(p, '.murba/report.md'), 'utf8'), /SPEC_EDITED/);
  write(p, '.murba/spec.md', SPEC);
  assert.equal(m(p, ['phase', 'setup']).code, 0);
});

// ---- 실수 방지망(ADR 0003): CLI가 구조적으로 강제하는 것 ----
function toBuild(p) {
  toApprove(p); m(p, ['approve', '--human']); m(p, ['phase', 'setup']);
  m(p, ['handoff', 'setup'], { stdin: 's' }); write(p, '.murba/init.sh', 'x'); m(p, ['phase', 'test-write']);
  write(p, 'tests/a.test.js', 't'); m(p, ['lock-tests', 'tests/**']); m(p, ['handoff', 'test-write'], { stdin: 't' });
  assert.equal(m(p, ['phase', 'build']).code, 0);
}
const asCaller = (p, who) => fs.writeFileSync(path.join(p, '.murba', 'caller'), who + '\n');

test('caller: subagent cannot run state-changing murba (any invocation form)', () => {
  const p = tmpProj(); toBuild(p); m(p, ['ac', 'next']);
  asCaller(p, 'murba-good-work:builder');
  for (const args of [['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'x', '--final'], ['ac', 'unhold', 'AC-001'], ['phase', 'evaluate'], ['approve'], ['decide', 'taste', 'x', '--why', 'y'], ['handoff', 'build'], ['lock-tests', '--amend', 'tests/**', '--reason', 'r'], ['evidence-run'], ['budget', '--subagent'], ['init', '--force'], ['report']]) {
    const r = m(p, args, { stdin: 'x' }); assert.equal(r.code, 2, args.join(' ')); assert.match(r.err, /CALLER_SUBAGENT/);
  }
  // node로 CLI 파일을 직접 불러도 같은 검사(표식은 CLI가 읽음)
  const r2 = spawnSync('node', [path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'murba-cli.mjs'), 'ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'x'], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r2.status, 2); assert.match(r2.stderr, /CALLER_SUBAGENT/);
  for (const args of [['status'], ['check-tests'], ['budget'], ['help']]) assert.equal(m(p, args).code, 0, args.join(' '));
  asCaller(p, 'murba-good-work:evaluator'); assert.equal(m(p, ['evidence-run']).code, 0);
  asCaller(p, 'main'); assert.equal(m(p, ['handoff', 'build'], { stdin: 'b' }).code, 0);
  assert.equal(readState(p).ac['AC-001'].verdicts.length, 0);
});

test('ledger: edit outside CLI → LEDGER_TAMPERED on next command, report flags it', () => {
  const p = tmpProj(); toApprove(p);
  const sp = path.join(p, '.murba', 'state.json');
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace('"approved": false', '"approved": true'));
  const r = m(p, ['phase', 'setup']); assert.equal(r.code, 2); assert.match(r.err, /LEDGER_TAMPERED/);
  assert.equal(m(p, ['approve']).code, 2);
  assert.match(m(p, ['status']).out, /LEDGER_TAMPERED/);
  assert.equal(m(p, ['report']).code, 0);
  assert.match(fs.readFileSync(path.join(p, '.murba', 'report.md'), 'utf8'), /❌ 실패·생략 \| [^\n]*LEDGER_TAMPERED/);
  const evs = fs.readFileSync(path.join(p, '.murba', 'events.jsonl'), 'utf8').split('\n').filter(l => l.includes('ledger_tampered'));
  assert.equal(evs.length, 1);
});

test('re-init: interactive run cannot become headless/auto-approve; --force never approves', () => {
  const p = tmpProj(); toApprove(p); m(p, ['approve', '--human']);
  assert.equal(m(p, ['init', '--force', '--headless', '--auto-approve']).code, 2);
  assert.equal(m(p, ['init', '--force'], { env: { MURBA_HEADLESS: '1' } }).code, 2);
  assert.equal(m(p, ['init', '--force']).code, 0);
  const st = readState(p); assert.equal(st.approved, false); assert.equal(st.mode, 'interactive'); assert.deepEqual(st.test_hashes, {});
  assert.match(fs.readFileSync(path.join(p, '.murba', 'decisions.tsv'), 'utf8'), /init --force/);
});

test('locked tests checked on every transition (browser/report too) and shown in report', () => {
  const p = tmpProj(); toBuild(p);
  setState(p, s => { s.phase = 'browser'; });
  write(p, 'tests/a.test.js', 'tampered');
  const r = m(p, ['phase', 'report']); assert.equal(r.code, 2); assert.match(r.err, /TESTS_CHANGED/);
  m(p, ['report']);
  assert.match(fs.readFileSync(path.join(p, '.murba', 'report.md'), 'utf8'), /❌ 실패·생략 \| [^\n]*TESTS_CHANGED: tests\/a\.test\.js/);
});

test('lock-tests --amend: only in build/fix/evaluate, only locked files, needs reason; recorded as TEST_AMENDED', () => {
  const p = tmpProj(); toBuild(p);
  write(p, 'tests/a.test.js', 'fixed defect');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 2);
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/**']).code, 1);
  write(p, 'tests/new.test.js', 'n');
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/**', '--reason', 'AC-001 테스트가 AC-006 동작을 기대']).code, 2); // new.test.js 미고정
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'AC-001 테스트가 AC-006 동작을 기대']).code, 0);
  assert.equal(m(p, ['check-tests']).code, 0);
  assert.match(fs.readFileSync(path.join(p, '.murba', 'decisions.tsv'), 'utf8'), /TEST_AMENDED: tests\/a\.test\.js/);
  m(p, ['report']);
  assert.match(fs.readFileSync(path.join(p, '.murba', 'report.md'), 'utf8'), /⚠️ 미검증 \| [^\n]*TEST_AMENDED: tests\/a\.test\.js/);
  setState(p, s => { s.phase = 'qa'; });
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r']).code, 2);
});

test('r3 bug3: interactive approve needs a fresh hook token (script route refused)', () => {
  const tok = p => path.join(p, '.murba', 'approve-token');
  // hook이 돈 적 있는 프로젝트(caller 있음): 토큰 없으면 거부, --human도 무효
  const p = tmpProj(); toApprove(p); asCaller(p, 'main');
  let r = m(p, ['approve']); assert.equal(r.code, 2); assert.match(r.err, /APPROVE_NEEDS_HUMAN/);
  assert.equal(m(p, ['approve', '--human']).code, 2);
  // 오래된 토큰 거부
  fs.writeFileSync(tok(p), JSON.stringify({ ts: new Date(Date.now() - 11 * 60_000).toISOString() }));
  assert.equal(m(p, ['approve']).code, 2); assert.equal(readState(p).approved, false);
  // 새 토큰: 승인되고 토큰 소비
  fs.writeFileSync(tok(p), JSON.stringify({ ts: new Date().toISOString() }));
  r = m(p, ['approve']); assert.equal(r.code, 0, r.err);
  assert.equal(readState(p).approved, true); assert.equal(fs.existsSync(tok(p)), false);
  // hook이 돈 적 없는 곳(caller 없음)에서는 --human 허용, 그냥 approve는 거부
  const q = tmpProj(); toApprove(q);
  assert.equal(m(q, ['approve']).code, 2);
  assert.equal(m(q, ['approve', '--human']).code, 0);
});

test('r3 bug1: deleting state.sha256 then editing state → LEDGER_TAMPERED (never re-hashed)', () => {
  const p = tmpProj(); toApprove(p);
  assert.equal(readState(p).ledger_hash, true);
  fs.rmSync(path.join(p, '.murba', 'state.sha256'));
  const sp = path.join(p, '.murba', 'state.json');
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace('"approved": false', '"approved": true'));
  const r = m(p, ['phase', 'setup']); assert.equal(r.code, 2); assert.match(r.err, /LEDGER_TAMPERED/);
  assert.equal(fs.existsSync(path.join(p, '.murba', 'state.sha256')), false);
  assert.match(m(p, ['status']).out, /LEDGER_TAMPERED/);
  assert.equal(m(p, ['report']).code, 0);
  assert.match(fs.readFileSync(path.join(p, '.murba', 'report.md'), 'utf8'), /LEDGER_TAMPERED/);
});

test('r3 bug2: re-init cannot turn on auto-approve when the previous run had none', () => {
  const h = tmpProj({ murba: false });
  m(h, ['init', '--headless']);
  let r = m(h, ['init', '--force', '--headless', '--auto-approve']); assert.equal(r.code, 2); assert.match(r.err, /재초기화 거부/);
  r = m(h, ['init', '--force'], { env: { MURBA_HEADLESS: '1' } }); assert.equal(r.code, 2);
  assert.equal(readState(h).auto_approve, false);
  // 처음부터 사전 승인이 있던 실행은 재초기화해도 유지 가능
  const h2 = tmpProj({ murba: false });
  m(h2, ['init', '--headless', '--auto-approve']);
  assert.equal(m(h2, ['init', '--force', '--headless', '--auto-approve']).code, 0);
});

test('v0.1.1: implementation tasks cannot skip the pipeline (pilot defect); investigation and recorded risky requests can', () => {
  for (const tt of ['bug-fix', 'feature', 'refactor', 'perf']) {
    const p = tmpProj();
    write(p, '.murba/run-plan.json', JSON.stringify({ task_type: tt }));
    const r = m(p, ['phase', 'report', '--skip', '소규모']);
    assert.equal(r.code, 2, tt + ' should be refused');
    assert.match(r.err, /건너뛸 수 없다/);
    assert.equal(readState(p).phase, 'triage');
  }
  const inv = tmpProj();
  write(inv, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation' }));
  assert.equal(m(inv, ['phase', 'report', '--skip', '조사']).code, 0);
  const risky = tmpProj();
  write(risky, '.murba/run-plan.json', JSON.stringify({ task_type: 'bug-fix', risky: true }));
  assert.equal(m(risky, ['phase', 'build', '--skip', 'x']).code, 2, 'risky skip only to report');
  assert.equal(m(risky, ['phase', 'report', '--skip', '위험 요청']).code, 0);
  assert.equal(readState(risky).risky, true);
});

test('v0.1.1 r2: skip after approval, guard/fake irreversible rows, rewritten run-plan — all refused', () => {
  // reviewer #1: approve 후 report로 건너뛰기(평가·qa 생략)
  const a = tmpProj(); write(a, '.murba/run-plan.json', JSON.stringify({ task_type: 'bug-fix' })); toApprove(a);
  assert.equal(m(a, ['approve', '--human']).code, 0);
  assert.equal(m(a, ['phase', 'report', '--skip', '작은 수정']).code, 2);
  assert.equal(readState(a).task_type, 'feature'); // toApprove가 쓴 run-plan이 grill에서 고정됨
  // reviewer #2·#3: guard가 남긴 irreversible 행이나 가짜 decide는 생략을 풀지 않는다
  const b = tmpProj(); write(b, '.murba/run-plan.json', JSON.stringify({ task_type: 'bug-fix' }));
  fs.appendFileSync(path.join(b, '.murba/decisions.tsv'), `${new Date().toISOString()}\tbuild\tirreversible\tgit reset --hard 차단\tguard 규칙 git-discard\t\t\n`);
  m(b, ['decide', 'irreversible', '가짜', '--why', 'x']);
  assert.equal(m(b, ['phase', 'report', '--skip', 'x']).code, 2);
  // reviewer #9: grill 뒤 run-plan을 investigation으로 고쳐도 원장 값은 그대로
  const c = tmpProj(); write(c, '.murba/run-plan.json', JSON.stringify({ task_type: 'bug-fix' }));
  assert.equal(m(c, ['phase', 'grill']).code, 0);
  write(c, '.murba/run-plan.json', JSON.stringify({ task_type: 'investigation', risky: true }));
  assert.equal(m(c, ['phase', 'report', '--skip', '조사']).code, 2);
  assert.equal(readState(c).task_type, 'bug-fix');
});

test('v0.1.1 r2: source edited before tests → approve and lock-tests refused (any route)', () => {
  const p = tmpProj({ murba: false });
  write(p, 'src/cart.js', 'export const f = x => x > 1;\n'); write(p, 'test/old.test.js', '// seed\n');
  spawnSync('git', ['add', '-A'], { cwd: p }); spawnSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-qm', 'seed'], { cwd: p });
  assert.equal(m(p, ['init']).code, 0);
  write(p, '.murba/run-plan.json', JSON.stringify({ task_type: 'bug-fix' }));
  toApprove(p);
  write(p, 'src/cart.js', 'export const f = x => x >= 1;\n'); // 테스트보다 먼저 고침(Bash·스크립트·서브에이전트 어느 경로든 결과는 같다)
  const r = m(p, ['approve', '--human']);
  assert.equal(r.code, 2, r.out); assert.match(r.err, /SOURCE_CHANGED_BEFORE_TESTS: src\/cart\.js/);
  write(p, 'src/cart.js', 'export const f = x => x > 1;\n'); // 되돌리면 통과
  assert.equal(m(p, ['approve', '--human']).code, 0);
  // setup에서 설정 파일·테스트를 만드는 정상 흐름은 lock-tests 통과, 구현 파일을 먼저 고치면 거부
  setState(p, s => { s.phase = 'test-write'; });
  write(p, 'package.json', '{"scripts":{"test":"node --test"}}'); write(p, 'vitest.config.mjs', 'export default {}'); write(p, 'test/cart.test.js', '// AC-001\n');
  assert.equal(m(p, ['lock-tests', 'test/**']).code, 0);
  write(p, 'lib/new.js', 'x'); // 새 구현 파일(추적 안 됨)
  const r2 = m(p, ['lock-tests', 'test/**']);
  assert.equal(r2.code, 2); assert.match(r2.err, /lib\/new\.js/);
});

test('v0.1.1: init creates per-agent report folders', () => {
  const p = tmpProj();
  for (const a of ['triage', 'spec-reviewer', 'test-writer', 'builder', 'evaluator', 'pr-reviewer'])
    assert.ok(fs.statSync(path.join(p, '.murba', 'reports', a)).isDirectory(), a);
});
