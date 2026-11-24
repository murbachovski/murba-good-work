// v0.1.1: main session may not edit sources before approval (pilot defect); git reset --hard / git clean -f[dx] are irreversible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpProj, runHook, bash, tool, sub, isDeny, setState, write } from './helpers.mjs';

const decision = r => (r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision) || 'allow';
const deny = (proj, input, msg) => { const r = runHook('guard', input, proj); assert.equal(r.code, 0, r.err); assert.ok(isDeny(r), `${msg || JSON.stringify(input.tool_input).slice(0, 120)}: expected deny, got ${r.out}`); };
const allow = (proj, input, msg) => { const r = runHook('guard', input, proj); assert.equal(r.code, 0, r.err); assert.equal(decision(r), 'allow', `${msg || JSON.stringify(input.tool_input).slice(0, 120)}: unexpected ${r.out}`); };
const W = (proj, f, who) => tool(proj, 'Write', { file_path: path.join(proj, f), content: 'x' }, who ? sub(who) : {});
const E = (proj, f) => tool(proj, 'Edit', { file_path: path.join(proj, f), old_string: 'a', new_string: 'b' });

function projAt(phase, taskType) {
  const p = tmpProj();
  if (taskType) write(p, '.murba/run-plan.json', JSON.stringify({ task_type: taskType }));
  setState(p, st => { st.phase = phase; });
  return p;
}

test('pre-approval: main session cannot edit project sources (Write/Edit/Bash) in triage..approve', () => {
  for (const phase of ['triage', 'grill', 'spec-review', 'revise', 'approve']) {
    const p = projAt(phase, 'bug-fix');
    deny(p, W(p, 'src/cart.js'), `${phase} Write src`);
    deny(p, E(p, 'src/cart.js'), `${phase} Edit src`);
    deny(p, W(p, 'INVESTIGATION.md'), `${phase} Write root file`);
    deny(p, bash(p, "sed -i '' 's/>/>=/' src/cart.js"), `${phase} sed -i`);
    deny(p, bash(p, 'echo x > src/new.js'), `${phase} redirect`);
    deny(p, bash(p, 'cp /dev/null test/a.test.js'), `${phase} cp`);
    // allowed in the same phase: the plugin's own files, reads, branch creation, temp files
    allow(p, W(p, '.murba/spec.md'), `${phase} spec`);
    allow(p, bash(p, "cat > .murba/spec.md <<'EOF'\n# spec\nEOF"), `${phase} spec heredoc`);
    allow(p, tool(p, 'Read', { file_path: path.join(p, 'src/cart.js') }), `${phase} read`);
    allow(p, bash(p, 'git checkout -b feat/free-shipping'), `${phase} branch`);
    allow(p, bash(p, 'node --test test/ 2>/dev/null'), `${phase} test run`);
    allow(p, bash(p, 'echo hi > /tmp/murba-scratch.txt'), `${phase} tmp file`);
  }
});

test('pre-approval rule: exemptions and later phases', () => {
  const inv = projAt('grill', 'investigation');
  allow(inv, W(inv, 'INVESTIGATION.md'), 'investigation writes its report');
  const noPlan = projAt('triage', null);
  allow(noPlan, W(noPlan, 'src/cart.js'), 'no run-plan yet → rule not applied');
  const bad = projAt('grill', null); write(bad, '.murba/run-plan.json', '{not json');
  deny(bad, W(bad, 'src/cart.js'), 'unreadable run-plan keeps the rule on');
  for (const phase of ['setup', 'build', 'fix', 'qa', 'report']) {
    const p = projAt(phase, 'feature');
    allow(p, W(p, 'src/cart.js'), `${phase} main may edit`);
  }
  const b = projAt('build', 'feature');
  allow(b, W(b, 'src/cart.js', 'builder'), 'builder in build edits impl');
  deny(b, W(b, 'test/a.test.js', 'builder'), 'builder still cannot edit tests');
  const g = projAt('grill', 'feature');
  allow(g, W(g, '.murba/reports/test-writer/r.md', 'test-writer'), 'subagents follow their own rules');
});

test('git reset --hard and git clean -f with -d/-x/-X are irreversible; safe forms allowed', () => {
  const p = projAt('build', 'feature');
  for (const c of ['git reset --hard', 'git reset --hard HEAD~1', 'git reset --hard origin/main', 'git -C . reset --hard', 'timeout 9 git reset --hard',
    'git clean -fdx', 'git clean -fd', 'git clean -xdf', 'git clean -f -d', 'git clean -fX', 'git clean --force -d', 'cd src && git clean -fdx'])
    deny(p, bash(p, c), c);
  for (const c of ['git reset --soft HEAD~1', 'git reset --mixed HEAD~1', 'git reset HEAD src/a.js', 'git reset', 'git clean -n', 'git clean -nd', 'git clean --dry-run -fdx', 'git clean -fdxn', 'git status', 'git checkout -b feat/x'])
    allow(p, bash(p, c), c);
});
