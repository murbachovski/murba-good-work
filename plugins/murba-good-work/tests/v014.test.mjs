// v0.1.4: independent test-writer and evaluator are enforced (lock-tests and leaving qa need their own reports; main session cannot write them)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpProj, murbaCli as m, readState, write, setState, agentReport, runHook, tool, bash, sub, isDeny } from './helpers.mjs';

const SPEC = '# spec\n- AC-001 WHEN add(1,2) THE SYSTEM SHALL return 3\n';
function approved(p) {
  write(p, '.murba/run-plan.json', '{"task_type":"feature"}');
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
