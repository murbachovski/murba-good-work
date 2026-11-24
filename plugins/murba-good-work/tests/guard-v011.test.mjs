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

const POST = ['setup', 'test-write', 'build', 'evaluate', 'fix', 'qa', 'browser', 'report', 'done'];
function projAt(phase, taskType, { approved = POST.includes(phase), lockedType } = {}) {
  const p = tmpProj();
  if (taskType) write(p, '.murba/run-plan.json', JSON.stringify({ task_type: taskType }));
  setState(p, st => { st.phase = phase; st.approved = approved; if (lockedType) st.task_type = lockedType; });
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

test('v0.1.1 r2 #4: rule keyed on approval, not phase — skipping to report without approval keeps it on', () => {
  for (const phase of ['report', 'build', 'setup']) {
    const p = projAt(phase, 'bug-fix', { approved: false });
    deny(p, W(p, 'src/cart.js'), `${phase} unapproved Write`);
    deny(p, bash(p, 'echo x > src/cart.js'), `${phase} unapproved redirect`);
  }
  const ok = projAt('report', 'bug-fix', { approved: true });
  allow(ok, W(ok, 'src/cart.js'), 'approved report may edit');
  const done = projAt('done', 'bug-fix', { approved: false });
  allow(done, W(done, 'src/cart.js'), 'done: rule off');
  // locked task type wins over a rewritten run-plan
  const t = projAt('grill', 'investigation', { lockedType: 'bug-fix' });
  deny(t, W(t, 'src/cart.js'), 'run-plan rewritten to investigation does not unlock edits');
  const inv = projAt('grill', 'bug-fix', { lockedType: 'investigation' });
  allow(inv, W(inv, 'INVESTIGATION.md'), 'locked investigation exempt');
});

test('v0.1.1 r2 #5: git argument exception only within the git segment', () => {
  const p = projAt('grill', 'bug-fix');
  write(p, 'src/cart.js', 'x');
  for (const c of ['echo fix > src/cart.js && git add src/cart.js', 'git diff src/cart.js; cp /dev/null src/cart.js', "perl -pi -e 's/a/b/' src/cart.js && git status src/cart.js", 'git checkout -- src/cart.js', 'git restore src/cart.js', 'git checkout src/cart.js'])
    deny(p, bash(p, c), c);
  for (const c of ['git checkout -b feat/x', 'git switch -c feat/y', 'git add -A', 'git commit -m "wip (x) > y"', 'git status src/cart.js', 'git diff src/cart.js', 'git checkout main', 'git restore --staged src/cart.js', 'npm test', 'node --test test/ > .murba/reports/qa/r.log 2>&1'])
    allow(p, bash(p, c), c);
});

test('v0.1.1 r2 #6: scripts and inline code that write sources are denied before approval', () => {
  const p = projAt('grill', 'bug-fix');
  deny(p, tool(p, 'Write', { file_path: path.join(p, '.murba/reports/x/fix.mjs'), content: "import fs from 'node:fs';\nfs.writeFileSync('src/cart.js', 'y');\n" }), 'script writes src');
  deny(p, tool(p, 'Write', { file_path: path.join(p, '.murba/reports/x/fix.mjs'), content: "import { execSync } from 'node:child_process';\nexecSync(\"sed -i '' 's/a/b/' src/cart.js\");\n" }), 'script runs sed -i on src');
  deny(p, bash(p, `node -e "require('fs').writeFileSync('src/cart.js','y')"`), 'node -e writes src');
  deny(p, bash(p, `python3 -c "open('src/cart.js','w').write('y')"`), 'python -c writes src');
  allow(p, tool(p, 'Write', { file_path: path.join(p, '.murba/reports/x/probe.mjs'), content: "import fs from 'node:fs';\nfs.writeFileSync('.murba/reports/x/out.json', '{}');\nconsole.log(fs.readFileSync('src/cart.js','utf8'));\n" }), 'script writing only .murba');
  const b = projAt('build', 'bug-fix');
  allow(b, tool(b, 'Write', { file_path: path.join(b, '.murba/reports/builder/fix.mjs'), content: "import fs from 'node:fs';\nfs.writeFileSync('src/cart.js', 'y');\n" }, sub('builder')), 'after approval scripts may write src');
});

test('v0.1.1 r2 #7: subagents cannot write sources before approval', () => {
  const p = projAt('grill', 'feature');
  deny(p, W(p, 'src/cart.js', 'builder'), 'builder in grill');
  deny(p, tool(p, 'Bash', { command: 'echo x > src/a.js' }, sub('builder')), 'builder Bash in grill');
  allow(p, W(p, '.murba/reports/builder/r.md', 'builder'), 'builder own report');
  allow(p, W(p, '.murba/reports/spec-reviewer/review.md', 'spec-reviewer'), 'reviewer report');
});

test('v0.1.1 r2 #10: apply/patch/formatters/mkdir count as writes before approval', () => {
  const p = projAt('revise', 'bug-fix');
  for (const c of ['git apply fix.diff', 'git am 0001.patch', 'patch -p1 < fix.diff', 'patch src/cart.js fix.diff', 'npx prettier --write src', 'npx eslint --fix .', 'black .', 'ruff check --fix', 'gofmt -w main.go', 'mkdir -p src/x'])
    deny(p, bash(p, c), c);
  for (const c of ['git apply --check fix.diff', 'npx prettier --check src', 'npx eslint src', 'mkdir -p .murba/reports/qa', 'mkdir -p /tmp/murba-x'])
    allow(p, bash(p, c), c);
});

test('v0.1.1 r2 #11: whole-tree discards, stash drop/clear, git clean -f are irreversible', () => {
  const p = projAt('build', 'feature');
  for (const c of ['git checkout -- .', 'git checkout .', 'git checkout HEAD -- .', 'git restore .', 'git restore --source=HEAD~1 .', 'git stash drop', 'git stash clear', 'git clean -f', 'git clean --force'])
    deny(p, bash(p, c), c);
  write(p, 'src/a.js', 'x');
  for (const c of ['git checkout -- src/a.js', 'git restore src/a.js', 'git restore --staged .', 'git stash', 'git stash pop', 'git clean -n', 'git checkout -b feat/z'])
    allow(p, bash(p, c), c);
});

test('v0.1.3: .gitignore is a project file before approval (an ignore line could hide a new source file); .murba/ files stay writable', () => {
  const p = projAt('grill', 'bug-fix');
  deny(p, W(p, '.gitignore'), 'Write .gitignore');
  deny(p, bash(p, 'echo src/x.js >> .gitignore'), 'append .gitignore');
  allow(p, bash(p, "cat > .murba/brief.md <<'EOF'\nbrief\nEOF"), 'brief heredoc');
});
