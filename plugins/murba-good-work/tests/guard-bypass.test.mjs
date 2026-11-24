// Regression tests for bypasses found by the independent PR #1 review (findings 1, 3, 4, 5, 7, 9, 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpProj, runHook, bash, tool, sub, isDeny, setState, P } from './helpers.mjs';

const proj = tmpProj();
const deny = (input, msg) => { const r = runHook('guard', input, proj); assert.equal(r.code, 0, r.err); assert.ok(isDeny(r), `${msg || ''} expected deny, got ${r.out}`); };
const allow = (input, msg) => { const r = runHook('guard', input, proj); assert.equal(r.code, 0, r.err); assert.ok(!isDeny(r), `${msg || ''} unexpected deny: ${r.out}`); };
const isAsk = r => !!(r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision === 'ask');

test('F1: nobody can create .murba/disable or remove/move .murba', () => {
  deny(bash(proj, 'touch .murba/disable'));
  deny(bash(proj, 'echo 1 > .murba/disable'));
  deny(bash(proj, 'cp /dev/null .murba/disable'));
  deny(tool(proj, 'Write', { file_path: path.join(proj, '.murba/disable'), content: '' }));
  deny(bash(proj, 'touch .murba/disable', sub('builder')));
  deny(bash(proj, 'rm -rf .murba', sub('builder')));
  deny(bash(proj, 'rm -rf .murba/', sub('builder')));
  deny(bash(proj, 'mv .murba .m', sub('builder')));
  deny(bash(proj, `rm -rf ${proj}/.murba`));
  deny(bash(proj, 'find .murba -delete'));
});

test('F3: subagents cannot run state-changing murba however invoked', () => {
  for (const c of [
    `${P}/bin/murba ac verdict AC-001 VERIFIED --sha x --final`, 'murba ac verdict AC-001 VERIFIED --sha x',
    'murba ac unhold AC-001', 'murba ac next', 'murba init', 'murba phase build', 'murba lock-tests "**"',
    'murba budget --subagent', 'murba evidence-run', `node ${P}/bin/murba approve`, 'sh -c "murba approve"', 'echo $(murba phase qa)',
  ]) deny(bash(proj, c, sub('builder')), c);
  for (const c of ['murba status', 'murba check-tests', 'murba budget', 'murba help']) allow(bash(proj, c, sub('builder')), c);
  allow(bash(proj, 'murba evidence-run', sub('evaluator')));
});

test('F4: git push hidden behind global options or shell grouping is denied', () => {
  for (const c of ['git -C . push --force origin main', 'git -c core.x=1 push -f', 'git --git-dir=.git push -f',
    '(git push)', '{ git push; }', 'if true; then git push; fi', 'echo `git push`', 'x=$(git push origin main)']) deny(bash(proj, c), c);
  for (const c of ['git -C . status', 'git -c color.ui=never log --oneline', 'git -C sub tag -l']) allow(bash(proj, c), c);
  deny(bash(proj, 'git -C . tag v1.0.0'));
});

test('F5: DROP/TRUNCATE inside a heredoc or here-string fed to a DB client is denied', () => {
  for (const c of ["psql db <<'SQL'\nDROP TABLE users;\nSQL", 'sqlite3 app.db <<EOF\nDROP TABLE users;\nEOF',
    'mysql -u x <<EOF\ntruncate table logs;\nEOF', 'psql db <<< "DROP TABLE users"', 'docker exec db psql -c "DROP TABLE users"']) deny(bash(proj, c), c);
  allow(bash(proj, "sqlite3 app.db <<'SQL'\nSELECT * FROM users;\nSQL"));
  allow(bash(proj, "cat > notes.md <<'EOF'\nDROP TABLE is forbidden\nEOF"));
});

test('F7: ledger files cannot be changed through Bash; interactive approve asks a human', () => {
  for (const c of ["sed -i '' 's/a/b/' .murba/state.json", 'echo x > .murba/state.json', 'echo x >> .murba/events.jsonl',
    'cp /tmp/x .murba/decisions.tsv', 'tee .murba/state.json < /tmp/x', `node -e "require('fs').writeFileSync('.murba/state.json','{}')"`,
    'mv .murba/state.json /tmp/s', 'rm .murba/logs/hooks.jsonl']) deny(bash(proj, c), c);
  allow(bash(proj, 'cat .murba/state.json'));
  allow(bash(proj, 'murba phase build'));
  const p2 = tmpProj();
  const r = runHook('guard', bash(p2, 'murba approve'), p2);
  assert.ok(isAsk(r), `interactive approve should ask: ${r.out}`);
  const p3 = tmpProj();
  setState(p3, s => { s.mode = 'headless'; });
  const r3 = runHook('guard', bash(p3, 'murba approve'), p3);
  assert.ok(!isAsk(r3) && !isDeny(r3), `headless approve is decided by the CLI: ${r3.out}`);
});

test('F9: builder cannot reach hidden checks through .murba searches', () => {
  deny(tool(proj, 'Grep', { pattern: 'expect', path: '.murba' }, sub('builder')));
  deny(tool(proj, 'Glob', { pattern: '.murba/**' }, sub('builder')));
  deny(tool(proj, 'Glob', { pattern: '**/*.test.js', path: path.join(proj, '.murba') }, sub('builder')));
  deny(tool(proj, 'Glob', { pattern: '**/.murba/**' }, sub('builder')));
  deny(tool(proj, 'Grep', { pattern: 'x', glob: '.murba/**' }, sub('builder')));
  deny(bash(proj, 'ls .murba', sub('builder')));
  deny(bash(proj, 'grep -r expect .murba', sub('builder')));
  deny(bash(proj, `node -e "require('fs').writeFileSync('test/a.test.js','')"`, sub('builder')));
  allow(tool(proj, 'Grep', { pattern: 'export', path: 'src' }, sub('builder')));
  allow(tool(proj, 'Grep', { pattern: 'export' }, sub('builder')));
  allow(tool(proj, 'Glob', { pattern: 'src/**/*.js' }, sub('builder')));
  allow(tool(proj, 'Read', { file_path: path.join(proj, 'src/app.js') }, sub('builder')));
});

test('F10: recursive deletes of home, outside-project, project root and $PWD are denied', () => {
  for (const c of ['rm -rf /Users/someone', 'rm -rf /home/someone/', 'rm -rf ../..', 'rm -rf ..', 'rm -rf $PWD', 'rm -rf "$(pwd)"',
    `rm -rf ${proj}`, 'echo / | xargs rm -rf', 'printf "%s" ~ | xargs -I{} rm -rf {}', 'find ~ -delete', 'find / -exec rm -rf {} +',
    'find .. -name x -delete', `rm -rf ${path.dirname(proj)}`]) deny(bash(proj, c), c);
  for (const c of ['rm -rf node_modules', 'rm -rf dist', 'rm -rf ./build coverage', 'rm -rf src/old', 'find . -name "*.tmp" -delete',
    'find . -type d -name node_modules | xargs rm -rf', 'rm -rf /tmp/x', 'rm -rf ~/proj/node_modules', `rm -rf ${proj}/dist`]) allow(bash(proj, c), c);
});

test('negative controls: everyday commands still pass', () => {
  for (const c of ['git status', 'node -e "const f = a => a > 1; console.log(f(2))"', 'npm test', 'git add -A', 'git commit -m "x"',
    'npx playwright test > .murba/evidence/run-1/p.log 2>&1', "murba handoff build <<'EOF'\nok\nEOF"]) allow(bash(proj, c), c);
  allow(bash(proj, 'murba status', sub('evaluator')));
});

test('builder cannot change package.json test scripts; other edits allowed', () => {
  const fs = { w: (p, s) => import('node:fs').then(m => m.writeFileSync(p, s)) };
  return fs.w(path.join(proj, 'package.json'), '{"name":"x","scripts":{"test":"node --test","start":"node a.js"}}').then(() => {
    const pj = path.join(proj, 'package.json');
    deny(tool(proj, 'Edit', { file_path: pj, old_string: '"test":"node --test"', new_string: '"test":"true"' }, sub('builder')));
    deny(tool(proj, 'Write', { file_path: pj, content: '{"name":"x","scripts":{"test":"exit 0","start":"node a.js"}}' }, sub('builder')));
    allow(tool(proj, 'Edit', { file_path: pj, old_string: '"start":"node a.js"', new_string: '"start":"node b.js"' }, sub('builder')));
    allow(tool(proj, 'Write', { file_path: pj, content: '{"name":"x","scripts":{"test":"node --test","start":"node b.js"},"dependencies":{}}' }, sub('builder')));
  });
});
