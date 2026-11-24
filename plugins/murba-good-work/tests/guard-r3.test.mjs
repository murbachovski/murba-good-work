// Regression tests for round-3 review bypasses (a1–a21, b1–b8, c1) and false positives. ADR 0003: natural forms only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpProj, runHook, bash, tool, sub, isDeny } from './helpers.mjs';

const proj = tmpProj();
fs.writeFileSync(path.join(proj, 'drop.sql'), 'DROP TABLE users;\n');
const decision = r => (r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision) || 'allow';
const deny = (input, msg) => { const r = runHook('guard', input, proj); assert.equal(r.code, 0, r.err); assert.ok(isDeny(r), `${msg || JSON.stringify(input.tool_input).slice(0, 120)}: expected deny, got ${r.out}`); };
const allow = (input, msg) => { const r = runHook('guard', input, proj); assert.equal(r.code, 0, r.err); assert.equal(decision(r), 'allow', `${msg || JSON.stringify(input.tool_input).slice(0, 120)}: unexpected ${r.out}`); };
const B = (c, who) => bash(proj, c, who ? sub(who) : {});
const W = (f, content, who) => tool(proj, 'Write', { file_path: path.join(proj, f), content }, who ? sub(who) : {});
const E = (f, old_string, new_string, who) => tool(proj, 'Edit', { file_path: path.join(proj, f), old_string, new_string }, who ? sub(who) : {});

test('a1–a4: command substitution keeps the outer command', () => {
  for (const c of ['find $(pwd) -delete', 'find `pwd` -delete', 'git -C $(pwd) push -f origin main', 'git -C `pwd` push -f',
    "mysql -u root -p$(cat .pw) -e 'DROP DATABASE app'", "psql $(cat .dburl) -c 'DROP TABLE users'", 'npm --prefix $(pwd) publish', 'vercel --cwd $(pwd) --prod']) deny(B(c));
});

test('a5/a6: package runners are unwrapped (npx, pnpm dlx, bunx, npm exec, shx, rimraf)', () => {
  for (const c of ['npx vercel --prod', 'npx -y vercel --prod --yes', 'npx -p vercel vercel --prod', 'pnpm dlx vercel --prod', 'bunx vercel --prod', 'npm exec -- vercel --prod',
    'npx netlify deploy --prod', 'npx netlify-cli deploy --prod', 'npx wrangler deploy', 'npx firebase deploy', 'npx serverless deploy',
    'npx rimraf ..', 'npx rimraf ~', 'npx shx rm -rf ~']) deny(B(c));
});

test('a7/b2: node -e / python -c literal deletes and DROP via drivers', () => {
  deny(B(`node -e "require('fs').rmSync('${process.env.HOME}', {recursive:true})"`));
  deny(B(`node -e "require('fs').rmSync('..', {recursive:true, force:true})"`));
  deny(B(`python3 -c "import shutil; shutil.rmtree('${process.env.HOME}')"`));
  deny(B(`python3 -c "import sqlite3; sqlite3.connect('app.db').execute('DROP TABLE users')"`));
  deny(B(`node -e "require('better-sqlite3')('app.db').exec('DROP TABLE users')"`));
});

test('a8–a12: find negation, xargs from file, find *, braces, parameter expansion', () => {
  for (const c of ["find . -mindepth 1 -not -name '.git' -delete", 'find . -mindepth 1 ! -name .git -exec rm -rf {} +', 'xargs rm -rf < dirs.txt', 'xargs -a dirs.txt rm -rf',
    'find * -delete', 'rm -rf {dist,..}', 'rm -rf ${PWD%/*}']) deny(B(c));
});

test('a13/a14: SQL piped from a file or echoed into a file first', () => {
  deny(B('cat drop.sql | sqlite3 app.db'));
  deny(B("echo 'DROP TABLE users;' > /tmp/d.sql && psql db -f /tmp/d.sql"));
  deny(B('sqlite3 app.db ".read drop.sql"'));
});

test('a15/a16: written scripts go through full checks (approve, push, publish, Makefile, package.json, shebang)', () => {
  deny(W('.murba/reports/orchestrator/approve-flow.sh', 'murba ac sync\nmurba approve\nmurba phase setup\n'));
  deny(W('scripts/ok.mjs', "import {execSync} from 'node:child_process';\nexecSync('murba approve');\n"));
  deny(W('Makefile', 'deploy:\n\tgit push --force origin main\n'));
  deny(W('package.json', '{"scripts":{"release":"git push --force origin main && npm publish"}}'));
  deny(W('scripts/x.zsh', 'git push --force\n'));
  deny(W('scripts/x', '#!/bin/sh\ngit push --force\n'));
  deny(W('scripts/push3.mjs', "import {execa} from 'execa';\nawait execa('git', ['push', '--force']);\n"));
  deny(W('scripts/push4.mjs', "import {$} from 'zx';\nawait $`git push --force`;\n"));
  deny(W('scripts/push6.rb', "system('git push --force')\n"));
  deny(W('scripts/clean3.mjs', "const fs = require('fs-extra');\nfs.removeSync('..');\n"));
  deny(W('scripts/clean4.mjs', "import { rimraf } from 'rimraf';\nawait rimraf('..');\n"));
  deny(W('scripts/drop.py', "import sqlite3\ncon = sqlite3.connect('app.db')\ncon.execute('DROP TABLE users')\n"));
});

test('a17–a19: builder searches, script reads/writes, package.json via Bash, test paths', () => {
  for (const c of ['grep -r expect .', "grep -rn 'AC-001' . --include=*.js", 'rg -uu expect', "find . -path '*hidden*' -exec cat {} +",
    'ls .mur*/hidden', "sed -i '' 's/node --test/true/' package.json", 'jq \'.scripts.test="true"\' package.json > p && mv p package.json',
    'npm pkg set "scripts[test]"="exit 0"', 'npm set-script test "exit 0"', 'git restore --source=HEAD~1 test/']) deny(B(c, 'builder'), c);
  deny(W('.murba/reports/builder/fix.mjs', "import fs from 'node:fs';\nfs.writeFileSync('test/a.test.js', 'x');\n", 'builder'));
  deny(W('.murba/reports/builder/peek.mjs', "import fs from 'node:fs';\nconsole.log(fs.readFileSync('.murba/hidden/h.test.js','utf8'));\n", 'builder'));
  deny(W('.murba/reports/builder/pkg.mjs', "import {execSync} from 'node:child_process';\nexecSync(\"npm pkg set scripts.test='exit 0'\");\n", 'builder'));
  deny(W('.murba/reports/builder/cp.mjs', "import fs from 'node:fs';\nfs.copyFileSync('fixtures/pass.js', 'test/a.test.js');\n", 'builder'));
  for (const f of ['test_api.py', 'pkg/foo_test.go', 'spec/models/user_spec.rb', '.mocharc.json']) deny(E(f, 'a', 'b', 'builder'), f);
  fs.writeFileSync(path.join(proj, 'pyproject.toml'), '[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q"\n');
  deny(E('pyproject.toml', 'addopts = "-q"', 'addopts = "-q -k not_slow"', 'builder'));
  allow(E('pyproject.toml', 'name = "x"', 'name = "y"', 'builder'), 'pyproject non-test edit');
  fs.writeFileSync(path.join(proj, 'vite.config.ts'), 'export default { server: { port: 3000 }, test: { include: ["test/**"] } }\n');
  deny(E('vite.config.ts', 'include: ["test/**"]', 'include: []', 'builder'));
  allow(E('vite.config.ts', 'port: 3000', 'port: 3001', 'builder'), 'vite non-test edit');
  fs.writeFileSync(path.join(proj, 'package.json'), '{"name":"x","scripts":{"test":"node --test"},"jest":{"testPathIgnorePatterns":[]}}');
  deny(E('package.json', '"testPathIgnorePatterns":[]', '"testPathIgnorePatterns":["test"]', 'builder'));
});

test('a20/a21: test-writer Bash reads of implementation; evaluator formatters', () => {
  deny(B('cat src/app.js', 'test-writer'));
  deny(tool(proj, 'Grep', { pattern: 'x', path: 'src' }, sub('test-writer')));
  deny(B('npx prettier --write src', 'evaluator'));
  deny(B('npx eslint --fix src', 'evaluator'));
  allow(B('npx eslint src', 'evaluator'));
  allow(B('npx prettier --check src', 'evaluator'));
});

test('b1–b8: publish, deploy, release, migrations, gh writes', () => {
  for (const c of ['dropdb mydb', 'mysqladmin -u root drop mydb', 'cargo publish', 'twine upload dist/*', 'python -m twine upload dist/*', 'poetry publish', 'gem push x.gem',
    'npx changeset publish', 'npx semantic-release', 'npx np', 'gcloud app deploy', 'npx cdk deploy', 'aws s3 sync dist s3://b --delete', 'aws s3 rm s3://b --recursive',
    'helm upgrade --install x .', 'npx surge dist', 'npx gh-pages -d dist', 'git subtree push --prefix dist origin gh-pages', 'docker buildx build --push -t x .', 'podman push x',
    'gh release upload v1 a.zip', 'gh workflow run deploy.yml', 'gh api repos/o/r/merges -f base=main -f head=feat', 'gh api repos/o/r/releases -F tag_name=v1',
    'npm run deploy', 'make deploy', 'npm version patch', 'yarn version --patch', 'npx standard-version', 'npx release-it --ci',
    'python manage.py migrate', 'rails db:migrate', 'npx sequelize-cli db:migrate', 'npx typeorm migration:run', 'npx drizzle-kit push']) deny(B(c), c);
  for (const c of ['gh api repos/o/r/pulls', 'gh api -X GET repos/o/r -f per_page=1', 'npm run build', 'make test', 'npm version']) allow(B(c), c);
});

test('c1: recursive delete of an unset-variable path', () => {
  deny(B('rm -rf "$BUILD_DIR"/*'));
  deny(B('rm -rf "$OLDPWD"'));
  allow(B('rm -rf "${BUILD_DIR:?}"/*'));
});

test('bug 8: read-only git tag forms and builder reads of .murba (except hidden)', () => {
  for (const c of ['git tag --contains HEAD', 'git tag --points-at HEAD', 'git tag -l "v*"', 'git tag --merged main']) allow(B(c), c);
  deny(B('git tag v1.0.0'));
  for (const f of ['.murba/spec.md', '.murba/handoff/build.md', '.murba/ac-test-map.md', '.murba/reports/builder/AC-001.md']) allow(tool(proj, 'Read', { file_path: path.join(proj, f) }, sub('builder')), f);
  deny(tool(proj, 'Read', { file_path: path.join(proj, '.murba/hidden/h.test.js') }, sub('builder')));
  deny(tool(proj, 'Glob', { pattern: '.mur*/hidden/*' }, sub('builder')));
  deny(tool(proj, 'Grep', { pattern: 'x', path: '.', glob: '{.murba,src}/**' }, sub('builder')));
});

test('approve ask writes a fresh approve-token; agents cannot write it', () => {
  const p2 = tmpProj();
  const st = path.join(p2, '.murba', 'state.json');
  if (fs.existsSync(st)) { const s = JSON.parse(fs.readFileSync(st, 'utf8')); s.mode = 'interactive'; fs.writeFileSync(st, JSON.stringify(s)); }
  const r = runHook('guard', bash(p2, 'murba approve'), p2);
  assert.equal(decision(r), 'ask');
  const tok = JSON.parse(fs.readFileSync(path.join(p2, '.murba', 'approve-token'), 'utf8'));
  assert.ok(Math.abs(Date.now() - tok.ts) < 60_000);
  const d = runHook('guard', tool(p2, 'Write', { file_path: path.join(p2, '.murba/approve-token'), content: '{"ts":1}' }), p2);
  assert.ok(isDeny(d));
  assert.ok(isDeny(runHook('guard', bash(p2, `echo '{"ts":1}' > .murba/approve-token`), p2)));
});

test('false positives stay allowed', () => {
  for (const c of ['npm test', 'node --test', 'timeout 60 npm test', 'env CI=1 npm test', 'npx playwright test', 'git add -A', 'git checkout -b feat/x',
    `git commit -m "$(cat <<'EOF'\nfeat: x\nEOF\n)"`, 'rm -rf node_modules dist .next', 'rm -rf ~/.npm/_cacache', 'murba phase build', 'murba decide taste "x" --why "y"',
    "murba handoff build <<'EOF'\nrm -rf ~ and git push -f\nEOF", 'find . -type d -name __pycache__ -exec rm -rf {} +', 'find dist -type f -delete',
    'sqlite3 app.db .schema', 'echo "SELECT 1" | psql db', 'bash -lc \'npm test\'', 'cd src && rm -rf dist', 'python3 -m pytest -q', 'git tag']) allow(B(c), c);
  for (const c of ['npm test', 'timeout 60 npm test', 'rm -rf dist node_modules/.cache', 'murba status', 'grep -rn foo src', 'rg foo', 'find . -name "*.js" -not -path "./node_modules/*"', 'cat .murba/handoff/build.md']) allow(B(c, 'builder'), c);
  allow(tool(proj, 'Grep', { pattern: 'export', path: 'src' }, sub('builder')));
  allow(W('scripts/check.sh', '#!/bin/sh\nset -e\nrm -rf dist\nnpm test\n'));
  allow(W('scripts/seed.mjs', "import fs from 'node:fs';\nfs.rmSync('dist', {recursive:true, force:true});\nfs.writeFileSync('.murba/reports/x.md', 'y');\n"));
  allow(W('.murba/reports/builder/run.mjs', "import {execSync} from 'node:child_process';\nexecSync('npm test', {stdio:'inherit'});\n", 'builder'));
  fs.writeFileSync(path.join(proj, 'package.json'), '{"name":"x","scripts":{"deploy":"vercel --prod","test":"node --test"}}');
  allow(E('package.json', '"name":"x"', '"name":"y"'), 'existing deploy script not re-checked');
});

test('G4: git history, docker volumes, unscoped DELETE/UPDATE, DB files, prisma migrate dev', () => {
  for (const c of ['rm -rf .git', 'rm -rf ./.git/', 'find . -name .git -prune -exec rm -rf {} +', 'find . -name .git -delete',
    'docker compose down -v', 'docker compose -f dc.yml down --volumes', 'docker-compose down -v', 'docker volume rm pgdata', 'docker volume prune -f', 'docker system prune -a --volumes',
    "psql db -c 'DELETE FROM users'", 'psql db -c "UPDATE users SET admin=true"', "sqlite3 app.db 'delete from orders;'",
    'rm app.db', 'rm -f prisma/dev.db', 'unlink data.sqlite', 'rm -rf db/app.sqlite3', "find . -name '*.db' -delete",
    'npx prisma migrate dev', 'npx prisma migrate reset --force', 'npx prisma db push --force-reset']) deny(B(c), c);
  for (const c of ['rm -rf node_modules', 'find . -type d -name __pycache__ -exec rm -rf {} +', 'psql db -c "SELECT count(*) FROM drop_log"',
    'sqlite3 app.db .schema', 'psql -c "DELETE FROM users WHERE id=1"', 'psql -c "UPDATE users SET a=1 WHERE id=2"', 'docker compose down', 'git rm test/old.js', 'rm -rf ~/build']) allow(B(c), c);
});
