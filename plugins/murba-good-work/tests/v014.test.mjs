// v0.1.4: independent test-writer and evaluator are enforced (lock-tests and leaving qa need their own reports; main session cannot write them)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
  // amend in evaluate, then enter qa: a report left over from before this qa round does not count
  setState(p, s => { s.phase = 'evaluate'; s.current_ac = 'AC-001'; });
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

// ---- PR #16 review round 2 ----
test('v0.1.4 r2: sh -c / eval payloads keep the outer cd; escaped quotes and `--` are followed', () => {
  const p = tmpProj(); approved(p);
  setState(p, s => { s.phase = 'qa'; });
  for (const c of ["cd .murba && sh -c 'echo ok > reports/evaluator/qa.md'", 'cd .murba/reports && bash -c "cp ../../x.md evaluator/qa.md"', "pushd .murba/reports/evaluator && sh -c 'echo ok > qa.md'",
    "cd .murba && sh -c 'echo x >> events.jsonl'", 'bash -c -- "echo ok > .murba/reports/evaluator/qa.md"',
    `bash -c "node -e \\"require('fs').writeFileSync('.murba/reports/evaluator/qa.md','ok')\\""`])
    deny(p, bash(p, c), c);
  allow(p, bash(p, "cd .murba/evidence && sh -c 'npm test > run.log'", sub('evaluator')), 'evaluator writes evidence via sh -c after cd');
  allow(p, bash(p, "cd .murba/reports/qa && sh -c 'npm test > x.log'"), 'main writes own qa folder via sh -c after cd');
});

test('v0.1.4 r2: a risky run that locked tests cannot skip from evaluate past qa without the evaluator', () => {
  const H = { env: { MURBA_HEADLESS: '1' } };
  const p = tmpProj({ murba: false }); assert.equal(m(p, ['init', '--headless', '--auto-approve'], H).code, 0);
  approved(p, '{"task_type":"feature","risky":true}');
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; }); agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  setState(p, s => { s.phase = 'evaluate'; s.current_ac = 'AC-001'; });
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'a']).code, 0);
  m(p, ['handoff', 'evaluate'], { stdin: 'ev' });
  const r = m(p, ['phase', 'report', '--skip', '위험 요청'], H);
  assert.equal(r.code, 2, r.out); assert.match(r.err, /EVALUATOR_REPORT_MISSING/);
  write(p, '.murba/reports/evaluator/repro.mjs', 'process.exit(0)'); // helper script is not a report
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청'], H).code, 2);
  agentReport(p, 'evaluator', 'qa.md');
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청'], H).code, 0);
});

test('v0.1.4 r2: the real lock stamps its time; --amend on an old ledger uses the last lock event', () => {
  const p = tmpProj(); approved(p);
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; });
  agentReport(p, 'test-writer'); // written before the lock (the CLI process starts later)
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  assert.ok(readState(p).tests_locked_at, 'lock-tests records tests_locked_at');
  setState(p, s => { s.phase = 'build'; });
  write(p, 'tests/a.test.js', '// AC-001 v2\n');
  assert.match(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r']).err, /TEST_WRITER_REPORT_MISSING/, 'report from before the lock');
  setState(p, s => { delete s.tests_locked_at; }); // v0.1.3 ledger: no stamp → last lock_tests event
  assert.match(m(p, ['lock-tests', '--amend', 'tests/a.test.js', '--reason', 'r']).err, /TEST_WRITER_REPORT_MISSING/, 'old ledger falls back to the lock event');
});

test('v0.1.4 r3: find -exec / -execdir / -ok with {} and both terminators', () => {
  const p = tmpProj(); approved(p);
  setState(p, s => { s.phase = 'qa'; });
  for (const c of [String.raw`find . -name x.md -exec sh -c 'cp "$1" .murba/reports/evaluator/qa.md' _ {} \;`, String.raw`find . -name x.md -exec cp {} .murba/reports/evaluator/qa.md \; -print`,
    String.raw`find .murba/reports/evaluator -maxdepth 0 -exec cp x.md {}/qa.md \;`, String.raw`find .murba/reports -maxdepth 1 -name evaluator -execdir sh -c 'echo ok > evaluator/qa.md' \;`,
    String.raw`find .murba/reports/evaluator -maxdepth 0 -ok cp x.md {}/qa.md \;`, 'find .murba/reports/evaluator -name "*.md" -exec cp x.md {} +'])
    deny(p, bash(p, c), c);
  allow(p, bash(p, String.raw`find . -name "*.log" -exec cat {} \;`), 'find -exec cat');
  for (const c of ["find .murba/evidence -name '*.tmp' -exec rm {} +", String.raw`find .murba/reports/evaluator -name '*.tmp' -exec rm -f {} \;`, "find /tmp/murba-x -name '*.log' -exec rm {} +",
    String.raw`find .murba/evidence -name '*.log' -exec cp {} .murba/reports/evaluator/ \;`, 'cp a.log .murba/reports/evaluator/'])
    allow(p, bash(p, c, sub('evaluator')), `evaluator: ${c}`);
  deny(p, bash(p, 'find tests -name "*.test.js" -exec rm {} +', sub('builder')), 'builder deletes tests via find -exec');
});

test('v0.1.4 r3: destructive checks follow the outer cd and find -exec; bash -c -x payload; cd -', () => {
  const p = tmpProj(); approved(p);
  setState(p, s => { s.phase = 'build'; });
  for (const c of ["cd ~ && sh -c 'rm -rf Documents'", "cd ~ && eval 'rm -rf Documents'", String.raw`find . -maxdepth 0 -exec git push --force \;`, String.raw`find . -maxdepth 0 -exec sh -c 'rm -rf ~' \;`])
    deny(p, bash(p, c), c);
  setState(p, s => { s.phase = 'qa'; });
  for (const c of ['bash -c -x "echo ok > .murba/reports/evaluator/qa.md"', 'bash -c -e "echo ok > .murba/reports/evaluator/qa.md"', 'cd .murba && cd reports && cd - && echo ok > reports/evaluator/qa.md'])
    deny(p, bash(p, c), c);
});

test('v0.1.4 r3: a risky skip after fix needs an evaluator report newer than the fix', () => {
  const H = { env: { MURBA_HEADLESS: '1' } };
  const p = tmpProj({ murba: false }); assert.equal(m(p, ['init', '--headless', '--auto-approve'], H).code, 0);
  approved(p, '{"task_type":"bug-fix","risky":true}');
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; }); agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  agentReport(p, 'evaluator', 'qa.md'); // after approval and lock, before the fix (an earlier qa round)
  execFileSync('sleep', ['0.1']); // the fix below starts strictly later
  setState(p, s => { s.phase = 'evaluate'; s.current_ac = 'AC-001'; });
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'NOT_VERIFIED', '--sha', 'a']).code, 0);
  m(p, ['handoff', 'evaluate'], { stdin: 'ev' });
  assert.equal(m(p, ['phase', 'fix']).code, 0);
  m(p, ['handoff', 'fix'], { stdin: 'fx' });
  assert.equal(m(p, ['phase', 'evaluate']).code, 0);
  assert.equal(m(p, ['ac', 'verdict', 'AC-001', 'VERIFIED', '--sha', 'b']).code, 0);
  m(p, ['handoff', 'evaluate'], { stdin: 'ev2' });
  assert.match(m(p, ['phase', 'report', '--skip', '위험 요청'], H).err, /EVALUATOR_REPORT_MISSING/);
  agentReport(p, 'evaluator', 'qa2.md');
  assert.equal(m(p, ['phase', 'report', '--skip', '위험 요청'], H).code, 0);
});

test('v0.1.4 r3: a risky run that locked tests but built nothing can still stop', () => {
  const H = { env: { MURBA_HEADLESS: '1' } };
  const p = tmpProj({ murba: false }); assert.equal(m(p, ['init', '--headless', '--auto-approve'], H).code, 0);
  approved(p, '{"task_type":"feature","risky":true}');
  write(p, 'tests/a.test.js', '// AC-001\n'); setState(p, s => { s.phase = 'test-write'; }); agentReport(p, 'test-writer');
  assert.equal(m(p, ['lock-tests', 'tests/**']).code, 0);
  m(p, ['handoff', 'test-write'], { stdin: 'tw' });
  const r = m(p, ['phase', 'report', '--skip', '위험 요청'], H); assert.equal(r.code, 0, r.err);
});
