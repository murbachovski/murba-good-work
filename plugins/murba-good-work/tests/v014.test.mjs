// v0.1.4: independent test-writer and evaluator are enforced (lock-tests and leaving qa need their own reports; main session cannot write them)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpProj, murbaCli as m, readState, write, setState, agentReport, runHook, tool, bash, sub, isDeny } from './helpers.mjs';

const SPEC = '# spec\n- AC-001 WHEN add(1,2) THE SYSTEM SHALL return 3\n';
function approved(p, plan = '{"task_type":"feature"}') {
  write(p, '.murba/run-plan.json', plan);
  assert.equal(m(p, ['phase', 'grill']).code, 0);
  write(p, '.murba/spec.md', SPEC);
  assert.equal(m(p, ['phase', 'spec-review']).code, 0);
  write(p, '.murba/reports/spec-reviewer/review.md', 'ok');
  assert.equal(m(p, ['phase', 'revise']).code, 0);
  write(p, '.murba/ac-test-map.md', 'map');
  assert.equal(m(p, ['ac', 'sync']).code, 0);
  assert.equal(m(p, ['phase', 'approve']).code, 0);
  assert.equal(m(p, ['approve', '--human']).code, 0);
}
const age = (p, rel, ms) => { const f = path.join(p, rel); const t = new Date(Date.now() - ms); fs.utimesSync(f, t, t); };

test('v0.1.4: lock-tests needs a test-writer report written after approval', () => {
  const p = tmpProj();
  agentReport(p, 'test-writer', 'old.md'); age(p, '.murba/reports/test-writer/old.md', 60_000); // from before approval
  approved(p);
  setState(p, s => { s.phase = 'test-write'; });
  write(p, 'tests/a.test.js', '// AC-001\n');
  const r = m(p, ['lock-tests', 'tests/**']);
  assert.equal(r.code, 2); assert.match(r.err, /TEST_WRITER_REPORT_MISSING/);
  agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  // --amend needs a fresh test-writer report after the lock
  setState(p, s => { s.phase = 'build'; });
  age(p, '.murba/reports/test-writer/report.md', 60_000);
  write(p, 'tests/a.test.js', '// AC-001 fixed\n');
  const a = m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'AC-001 테스트 결함']);
  assert.equal(a.code, 2); assert.match(a.err, /TEST_WRITER_REPORT_MISSING/);
  agentReport(p, 'test-writer', 'amend.md');
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'AC-001 테스트 결함']).code, 0);
});

test('v0.1.4: leaving qa needs an evaluator report written in this qa round', () => {
  const p = tmpProj(); approved(p);
  agentReport(p, 'evaluator', 'old.md'); age(p, '.murba/reports/evaluator/old.md', 60_000); // earlier round
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; }); agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  setState(p, s => { s.phase = 'evaluate'; s.current_ac = 'AC-001'; });
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a']).code, 0);
  m(p, ['handoff', 'evaluate'], { stdin: 'ev' });
  const q = m(p, ['phase', 'qa']); assert.equal(q.code, 0, q.err); // the transition stamps the qa round
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a', '--final']).code, 0);
  m(p, ['handoff', 'qa'], { stdin: 'qa' });
  const r = m(p, ['phase', 'report']);
  assert.equal(r.code, 2, r.out); assert.match(r.err, /EVALUATOR_REPORT_MISSING/);
  agentReport(p, 'evaluator', 'qa.md');
  const ok = m(p, ['phase', 'report']); assert.equal(ok.code, 0, ok.err);
});

test('v0.1.4: main session cannot write subagent report folders or tests during test-write; the subagents can', () => {
  const p = tmpProj(); approved(p);
  setState(p, s => { s.phase = 'test-write'; });
  for (const a of ['test-writer', 'builder', 'evaluator', 'pr-reviewer']) {
    assert.ok(isDeny(runHook('guard', tool(p, 'Write', { file_path: path.join(p, `.murba/reports/${a}/r.md`), content: 'x' }), p)), `Write ${a}`);
    assert.ok(isDeny(runHook('guard', bash(p, `echo done > .murba/reports/${a}/r.md`), p)), `Bash ${a}`);
  }
  assert.ok(isDeny(runHook('guard', tool(p, 'Write', { file_path: path.join(p, 'tests/a.test.js'), content: 'x' }), p)), 'main writes tests in test-write');
  assert.equal(isDeny(runHook('guard', tool(p, 'Write', { file_path: path.join(p, '.murba/reports/qa/regression.log'), content: 'x' }), p)), false, 'own qa folder ok');
  assert.equal(isDeny(runHook('guard', tool(p, 'Write', { file_path: path.join(p, '.murba/reports/test-writer/tests.md'), content: 'x' }, sub('test-writer')), p)), false, 'test-writer writes its report');
  assert.equal(isDeny(runHook('guard', tool(p, 'Write', { file_path: path.join(p, 'tests/a.test.js'), content: 'x' }, sub('test-writer')), p)), false, 'test-writer writes tests');
  setState(p, s => { s.phase = 'qa'; });
  assert.equal(isDeny(runHook('guard', tool(p, 'Write', { file_path: path.join(p, '.murba/reports/evaluator/qa.md'), content: 'x' }, sub('evaluator')), p)), false, 'evaluator writes its report');
});

// ---- PR #16 review ----
const deny = (p, input, msg) => assert.ok(isDeny(runHook('guard', input, p)), msg);
const allow = (p, input, msg) => assert.equal(isDeny(runHook('guard', input, p)), false, msg);

test('v0.1.4 r1: main-session writes through sh -c / eval / scripts / wildcards / Edit are denied', () => {
  const p = tmpProj(); approved(p);
  setState(p, s => { s.phase = 'qa'; });
  for (const c of ['bash -c "echo ok > .murba/reports/evaluator/qa.md"', "sh -c 'cp x.md .murba/reports/evaluator/qa.md'", 'eval "echo ok > .murba/reports/evaluator/qa.md"',
    'echo ok > .murba/reports/eval*/qa.md', 'cp x.md .murba/reports/*/qa.md', 'cp x.md .murba/reports/evaluat?r/qa.md'])
    deny(p, bash(p, c), c);
  deny(p, tool(p, 'Write', { file_path: path.join(p, '.murba/reports/qa/mk.mjs'), content: "import fs from 'node:fs';\nfs.writeFileSync('.murba/reports/evaluator/qa.md', 'ok');\n" }), 'script writes evaluator report');
  deny(p, tool(p, 'Write', { file_path: path.join(p, '.murba/reports/qa/mk.sh'), content: '#!/bin/sh\ncp x.md .murba/reports/evaluator/qa.md\n' }), 'shell script copies into evaluator folder');
  write(p, '.murba/reports/evaluator/qa.md', 'from evaluator');
  deny(p, tool(p, 'Edit', { file_path: path.join(p, '.murba/reports/evaluator/qa.md'), old_string: 'from', new_string: 'by' }), 'Edit evaluator report');
  setState(p, s => { s.phase = 'test-write'; });
  for (const c of ['bash -c "echo t > tests/a.test.js"', "sh -c 'cp x.md e2e/AC-001.spec.js'"]) deny(p, bash(p, c), c);
  deny(p, tool(p, 'Write', { file_path: path.join(p, '.murba/hidden/h.test.js'), content: 'x' }), 'main writes hidden checks');
  allow(p, tool(p, 'Write', { file_path: path.join(p, '.murba/hidden/h.test.js'), content: 'x' }, sub('test-writer')), 'test-writer writes hidden checks');
  allow(p, bash(p, 'npm test > .murba/reports/test-write/red.log 2>&1'), 'RED log in own folder');
});

test('v0.1.4 r1: each qa round and each amend needs its own fresh report; empty files do not count', () => {
  const p = tmpProj(); approved(p);
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; });
  write(p, '.murba/reports/test-writer/empty.md', '');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 2, 'empty report does not count');
  agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  setState(p, s => { s.phase = 'build'; s.tests_locked_at = new Date(Date.now() - 3600_000).toISOString(); }); // first lock an hour ago
  age(p, '.murba/reports/test-writer/report.md', 2 * 3600_000);
  write(p, 'tests/a.test.js', '// AC-001 v2\n'); agentReport(p, 'test-writer', 'amend1.md'); age(p, '.murba/reports/test-writer/amend1.md', 1000);
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r1']).code, 0);
  write(p, 'tests/a.test.js', '// AC-001 v3\n');
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r2']).code, 2, 'second amend cannot reuse the first report');
  // qa round 2 after a fix needs a new evaluator report
  setState(p, s => { s.phase = 'evaluate'; s.current_ac = 'AC-001'; s.test_hashes = Object.fromEntries(Object.keys(s.test_hashes).map(k => [k, s.test_hashes[k]])); });
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r2']).code, 2);
  agentReport(p, 'test-writer', 'amend2.md');
  assert.equal(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r2']).code, 0);
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a']).code, 0);
  m(p, ['handoff', 'evaluate'], { stdin: 'ev' });
  assert.equal(m(p, ['phase', 'qa']).code, 0);
  agentReport(p, 'evaluator', 'qa.md'); age(p, '.murba/reports/evaluator/qa.md', 60_000); // left over from an earlier round
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a', '--final']).code, 0);
  m(p, ['handoff', 'qa'], { stdin: 'qa' });
  assert.match(m(p, ['phase', 'report']).err, /EVALUATOR_REPORT_MISSING/);
});

test('v0.1.4 r1: a risky run cannot skip out of qa without the evaluator; old ledgers without qa_entered_at use the event log', () => {
  const H = { env: { MURBA_HEADLESS: '1' } };
  const p = tmpProj({ murba: false }); assert.equal(m(p, ['init', '--headless', '--auto-approve'], H).code, 0);
  approved(p, '{"task_type":"feature","risky":true}');
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; }); agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  setState(p, s => { s.phase = 'evaluate'; s.current_ac = 'AC-001'; });
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a']).code, 0);
  m(p, ['handoff', 'evaluate'], { stdin: 'ev' });
  assert.equal(m(p, ['phase', 'qa']).code, 0);
  const r = m(p, ['phase', 'report', '--skip', '위험 요청'], H);
  assert.equal(r.code, 2); assert.match(r.err, /EVALUATOR_REPORT_MISSING/);
  // v0.1.3 ledger upgraded mid-qa: no qa_entered_at → the last 'phase → qa' event is the round start
  setState(p, s => { delete s.qa_entered_at; s.approved_at = new Date(Date.now() - 2 * 24 * 3600_000).toISOString(); }); // approved two days ago
  agentReport(p, 'evaluator', 'old.md'); age(p, '.murba/reports/evaluator/old.md', 24 * 3600_000);
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a', '--final']).code, 0);
  m(p, ['handoff', 'qa'], { stdin: 'qa' });
  assert.match(m(p, ['phase', 'report']).err, /EVALUATOR_REPORT_MISSING/);
});
