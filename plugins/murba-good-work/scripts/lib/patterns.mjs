// Path patterns and Bash command analysis for the guard.
//
// Threat model (ADR 0003): a safety net against a COOPERATIVE model's mistakes and test-gaming, not a sandbox.
// Handled: wrappers (timeout/nice/env/stdbuf/…), eval and `sh -c`-style payloads, cd within one command line,
// case-insensitive `.murba` paths, globs/braces that can reach `.murba`, $HOME/$PWD/$CLAUDE_PROJECT_DIR forms.
// Also: $(…)/backticks keep the outer command (placeholder word, inner analysed alone), package runners (npx/dlx/bunx/npm exec/shx/python -m),
// literal commands/deletes/SQL inside written scripts and `node -e`/`python -c` code, Makefile/package.json scripts/shebang files.
// Out of scope (deliberate obfuscation): quote splitting inside a word (`hid""den`), variable indirection (`m=murba; $m`),
// targets computed at run time in scripts (`os.homedir()`, `Path.home()`), files written by Bash and run later (the CLI's caller marker
// covers murba state changes), rewriting `.murba/caller`.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

export function matchAny(rel, globs) { return globs.some(g => globToRegex(g).test(rel)); }

export const TEST_GLOBS = [
  '**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**', '**/e2e/**', '**/spec/**',
  '**/test_*.py', '**/*_test.py', '**/*_test.go', '**/*_spec.rb',
  '**/conftest.py', '**/playwright.config.*', '**/vitest.config.*', '**/vitest.workspace.*', '**/jest.config.*', '**/pytest.ini',
  '**/.mocharc*', '**/karma.conf.*',
  'test/**', 'tests/**', 'e2e/**', '__tests__/**', 'spec/**', 'test_*.py', '*_test.py', '*_test.go', '*_spec.rb',
  'conftest.py', 'playwright.config.*', 'vitest.config.*', 'vitest.workspace.*', 'jest.config.*', 'pytest.ini', '.mocharc*', 'karma.conf.*',
];
// Shared configs whose TEST section is protected (the rest of the file stays editable): see guard changesRunnerConfig
export const RUNNER_SECTION_FILES = /(^|\/)(pyproject\.toml|setup\.cfg|tox\.ini|vite\.config\.[cm]?[jt]s)$/;
export const PROTECTED_GLOBS = ['.murba/**', '.claude/settings*.json', '**/.claude/settings*.json'];
export const SECRET_GLOBS = ['**/.env', '**/.env.*', '.env', '.env.*', '**/*.pem', '**/*.key', '**/id_rsa*', '**/credentials*', 'credentials*'];
export const DEFAULT_IMPL_GLOBS = ['src/**', 'app/**', 'lib/**', 'server/**', 'public/**'];
export const ARTIFACT_NAMES = ['node_modules', 'dist', 'build', '.next', 'coverage', '.venv', 'venv', '__pycache__', '.cache', 'target', 'out', '.turbo', '.pytest_cache', 'test-results', 'playwright-report'];
// Cache folders under the home directory that may be wiped (relative to $HOME)
const HOME_CACHE_DIRS = ['.npm/_cacache', '.npm/_npx', '.npm/_logs', '.cache', 'Library/Caches', '.yarn/cache', '.pnpm-store', '.bun/install/cache'];

export function toRel(proj, p) {
  if (!p) return '';
  const abs = path.isAbsolute(p) ? p : path.join(proj, p);
  const rel = path.relative(proj, path.normalize(abs));
  return rel.split(path.sep).join('/');
}

// realpath of the longest existing prefix (macOS /tmp → /private/tmp, symlinked project dirs)
function realish(abs) {
  let p = abs; const rest = [];
  for (let n = 0; n < 64 && p !== path.dirname(p); n++) {
    try { return path.join(fs.realpathSync(p), ...rest.reverse()); } catch { rest.push(path.basename(p)); p = path.dirname(p); }
  }
  return abs;
}

// $HOME/${HOME:?}/~/~user, $PWD, $CLAUDE_PROJECT_DIR → paths (best effort). Other variables stay as-is.
export function expandVars(t, proj, cwd) {
  const home = os.homedir();
  let x = String(t);
  x = x.replace(/\$\{HOME(?::?[-?=+][^}]*)?\}|\$HOME(?![A-Za-z0-9_])/g, home);
  if (proj) x = x.replace(/\$\{CLAUDE_PROJECT_DIR(?::?[-?=+][^}]*)?\}|\$CLAUDE_PROJECT_DIR(?![A-Za-z0-9_])/g, proj);
  if (cwd || proj) x = x.replace(/\$\{PWD(?::?[-?=+][^}]*)?\}|\$PWD(?![A-Za-z0-9_])/g, cwd || proj);
  if (x === '~' || x.startsWith('~/')) x = home + x.slice(1);
  else { const m = /^~([A-Za-z0-9_.-]+)(\/.*)?$/.exec(x); if (m) x = path.join(path.dirname(home), m[1]) + (m[2] || ''); }
  return x;
}

// Canonical project-relative path: vars expanded, relative to cwd, realpath'd prefix, `.murba/…` lowercased (case-insensitive FS).
export function canonRel(proj, p, cwd = proj) {
  if (!p) return '';
  const x = expandVars(p, proj, cwd);
  const abs = path.isAbsolute(x) ? path.normalize(x) : path.resolve(cwd || proj, x);
  let rel = toRel(realish(path.resolve(proj)), realish(abs));
  if (/^\.murba(\/|$)/i.test(rel)) rel = rel.toLowerCase();
  return rel;
}

export const hasGlob = t => /[*?[]/.test(t);
export function expandBraces(s, depth = 0) {
  const m = /\{([^{}]*,[^{}]*)\}/.exec(s);
  if (!m || depth > 8) return [s];
  const pre = s.slice(0, m.index), post = s.slice(m.index + m[0].length);
  return m[1].split(',').flatMap(alt => expandBraces(pre + alt + post, depth + 1));
}
// Every path a token can stand for: brace-expanded, canonicalised (globs kept as patterns).
export function pathVariants(proj, token, cwd = proj) {
  return expandBraces(String(token)).map(t => canonRel(proj, t, cwd));
}

// Glob component matching. Pure-wildcard components (`*`, `**`, `?`) don't match dot-names (shell/ripgrep default).
function compMatch(pc, cc) {
  if (/^[*?]+$/.test(pc)) return !cc.startsWith('.');
  return globToRegex(pc.toLowerCase()).test(cc.toLowerCase());
}
function fullMatch(P, C, i = 0, j = 0) {
  if (i >= P.length) return j >= C.length;
  if (P[i] === '**') return fullMatch(P, C, i + 1, j) || (j < C.length && !C[j].startsWith('.') && fullMatch(P, C, i, j + 1));
  return j < C.length && compMatch(P[i], C[j]) && fullMatch(P, C, i + 1, j + 1);
}
function prefixMatch(P, C, i = 0, j = 0) {
  if (j >= C.length) return true;
  if (i >= P.length) return false;
  if (P[i] === '**') return prefixMatch(P, C, i + 1, j) || (!C[j].startsWith('.') && prefixMatch(P, C, i, j + 1));
  return compMatch(P[i], C[j]) && prefixMatch(P, C, i + 1, j + 1);
}
// rel (maybe a glob) can name exactly `concrete`
export function relIs(rel, concrete) { return hasGlob(rel) ? fullMatch(rel.split('/'), concrete.split('/')) : rel === concrete; }
// rel (maybe a glob) can name `dir` or something inside it
export function relUnder(rel, dir) { return hasGlob(rel) ? prefixMatch(rel.split('/'), dir.split('/')) : (rel === dir || rel.startsWith(dir + '/')); }

// a test file, or a folder that is itself a test folder (`test`, `e2e/` given as a directory)
export const isTestPath = rel => matchAny(rel, TEST_GLOBS) || (!!rel && !hasGlob(rel) && matchAny(rel + '/_', TEST_GLOBS));
export const isSecretPath = rel => matchAny(rel, SECRET_GLOBS);

// Split a shell command into segments on ; && || | and newlines, respecting quotes.
// Heredoc bodies are removed (they are data) but recorded.
export function splitSegments(cmd) {
  const heredocs = [];
  let text = cmd;
  const hdRe = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g;
  let m;
  const cuts = [];
  while ((m = hdRe.exec(text))) {
    const tag = m[2];
    const lineEnd = text.indexOf('\n', m.index);
    if (lineEnd < 0) break;
    const endRe = new RegExp('\\n[\\t ]*' + tag + '[\\t ]*(?:\\n|$)');
    const rest = text.slice(lineEnd);
    const em = endRe.exec(rest);
    const bodyEnd = em ? lineEnd + em.index + em[0].length : text.length;
    heredocs.push({ tag, body: text.slice(lineEnd + 1, em ? lineEnd + em.index : text.length) });
    cuts.push([lineEnd, bodyEnd]);
    hdRe.lastIndex = bodyEnd;
  }
  for (let i = cuts.length - 1; i >= 0; i--) text = text.slice(0, cuts[i][0]) + '\n' + text.slice(cuts[i][1]);

  const segs = [];
  const subs = [];
  let cur = '', q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    // command substitution $(…) / `…` (also inside "…"): the outer command keeps a placeholder word, the inner command is analysed on its own
    if (q !== "'" && ((c === '$' && text[i + 1] === '(') || c === '`')) {
      const [inner, end] = readSubst(text, i);
      if (!inner.startsWith('(')) subs.push(inner); // $((arithmetic)) is not a command
      cur += substWord(inner); i = end - 1; continue;
    }
    if (q) { cur += c; if (c === q) q = null; else if (c === '\\' && q === '"') { cur += text[++i] ?? ''; } continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '\\') { cur += c + (text[++i] ?? ''); continue; }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||') { segs.push({ text: cur, sep: two }); cur = ''; i++; continue; }
    if (c === ';' || c === '\n') { segs.push({ text: cur, sep: c }); cur = ''; continue; }
    if (c === '|') { segs.push({ text: cur, sep: '|' }); cur = ''; continue; }
    if (c === '&') { segs.push({ text: cur, sep: '&' }); cur = ''; continue; }
    // subshells and process substitution: analyse inner commands as their own segments
    if (c === '(' || c === ')') { segs.push({ text: cur, sep: c }); cur = ''; continue; }
    cur += c;
  }
  segs.push({ text: cur, sep: '' });
  const out = segs.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text);
  for (const sub of subs) { const r = splitSegments(sub); out.push(...r.segments.map(s => ({ ...s, subst: true }))); heredocs.push(...r.heredocs); }
  return { segments: out, heredocs };
}

// Placeholder for a command substitution's value: unknown at check time. `$(command -v murba)` stays recognisable as murba.
export const SUBST = '$(__subst__)';
function substWord(inner) { return /^\s*(command\s+-v|which|type\s+-p)\s+murba\s*$/.test(inner) ? 'murba' : SUBST; }
// text[i] is '$' (of "$(") or '`'. Returns [inner, endIndexExclusive]; nesting and quotes respected.
function readSubst(text, i) {
  if (text[i] === '`') {
    let k = i + 1, inner = '';
    while (k < text.length && text[k] !== '`') { if (text[k] === '\\') { inner += text[k + 1] ?? ''; k += 2; continue; } inner += text[k++]; }
    return [inner, k + 1];
  }
  let depth = 1, k = i + 2, q = null;
  for (; k < text.length; k++) {
    const c = text[k];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') k++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '\\') { k++; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) break;
  }
  return [text.slice(i + 2, k), k + 1];
}

export function tokenize(seg) {
  const out = []; let cur = '', q = null, has = false;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === '\\') { cur += seg[++i] ?? ''; has = true; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += c; has = true;
  }
  if (cur || has) out.push(cur);
  return out;
}

// Strip leading env assignments, shell keywords/grouping and wrapper commands (with their option values).
const KEYWORDS = ['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'done', 'fi'];
const XARGS_VALUE_OPTS = ['-I', '-i', '-n', '-P', '-L', '-l', '-d', '-s', '-E', '-e', '-a'];
const WRAPPERS = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-r', '-t', '-U', '-D', '-T'], doas: ['-u', '-C'],
  env: ['-u', '-C', '-S', '--unset', '--chdir', '--split-string'], command: [], builtin: [], nohup: [], time: ['-f', '-o'], exec: ['-a'],
  nice: ['-n', '--adjustment'], ionice: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata'],
  stdbuf: ['-i', '-o', '-e', '--input', '--output', '--error'], caffeinate: ['-t', '-w'], chronic: [], unbuffer: [],
  timeout: ['-s', '-k', '--signal', '--kill-after'], gtimeout: ['-s', '-k', '--signal', '--kill-after'], xargs: XARGS_VALUE_OPTS,
  watch: ['-n', '--interval', '-d'], 'cross-env': [], dotenv: ['-e', '-c', '-v'],
};
function stripWrappers(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
    if (KEYWORDS.includes(t)) { i++; continue; }
    const wname = t.split('/').pop();
    if (Object.prototype.hasOwnProperty.call(WRAPPERS, wname)) {
      const vopts = WRAPPERS[wname];
      i++;
      while (tokens[i] && tokens[i].startsWith('-') && tokens[i] !== '-') {
        if (tokens[i] === '--') { i++; break; }
        i += vopts.includes(tokens[i]) ? 2 : 1;
      }
      if ((wname === 'timeout' || wname === 'gtimeout') && tokens[i] && /^\d/.test(tokens[i])) i++; // duration
      continue;
    }
    break;
  }
  return i ? tokens.slice(i) : tokens;
}
// Package runners: `npx [-y] [-p pkg] cmd`, `pnpm dlx|exec cmd`, `yarn dlx|exec cmd`, `bunx cmd`, `npm exec [--] cmd`, `shx rm …`,
// `python -m twine …` → the command they run. Package names map to their CLI names.
const RUNNER_VALUE_OPTS = ['-p', '--package', '--registry', '--cache', '-w', '--workspace', '--prefix', '-C', '--dir', '--filter', '-F', '--userconfig'];
const PKG_CLI = { 'netlify-cli': 'netlify', 'firebase-tools': 'firebase', 'aws-cdk': 'cdk', 'sequelize-cli': 'sequelize', '@changesets/cli': 'changeset', '@vercel/cli': 'vercel', 'del-cli': 'del', 'rimraf-cli': 'rimraf', 'trash-cli': 'trash', '@railway/cli': 'railway', '@angular/cli': 'ng' };
function unwrapRunner(w) {
  const c0 = base(w[0]);
  let k = -1;
  if (['npx', 'bunx', 'pnpx'].includes(c0) || c0 === 'shx') k = 1;
  else if (['pnpm', 'yarn', 'bun'].includes(c0) && ['dlx', 'exec', 'x'].includes(w[1])) k = 2;
  else if (c0 === 'npm' && ['exec', 'x'].includes(w[1])) k = 2;
  else if (/^python[0-9.]*$/.test(c0) && w[1] === '-m' && w[2]) return [w[2], ...w.slice(3)];
  if (k < 0) return w;
  while (w[k] && w[k].startsWith('-') && w[k] !== '-') { if (w[k] === '--') { k++; break; } if (RUNNER_VALUE_OPTS.includes(w[k])) k++; k++; }
  if (!w[k]) return w;
  const pkg = w[k].replace(/(.)@[^/]*$/, '$1');
  return [PKG_CLI[pkg] || pkg.split('/').pop(), ...w.slice(k + 1)];
}
export function commandWords(tokens) {
  let w = tokens;
  for (let round = 0; round < 6; round++) {
    w = stripWrappers(w);
    const u = w.length ? unwrapRunner(w) : w;
    if (u === w) return w;
    w = u;
  }
  return w;
}

// git: skip global options (and their values) to find the subcommand index
const GIT_VALUE_OPTS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--exec-path', '--config-env'];
export function gitSubIndex(w) {
  for (let i = 1; i < w.length; i++) {
    const t = w[i];
    if (GIT_VALUE_OPTS.includes(t)) { i++; continue; }
    if (t.startsWith('-')) continue;
    return i;
  }
  return -1;
}

const SHELLS = ['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish'];
const base = t => (t || '').split('/').pop();
// `bash -c X`, `bash -lc X`, `sh -ec X`: the payload string, or null
export function shellPayload(w) {
  if (!SHELLS.includes(base(w[0]))) return null;
  const ci = w.findIndex((t, k) => k > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(t));
  return ci > 0 && w[ci + 1] !== undefined ? w[ci + 1] : null;
}

// Segments with their words and the working directory they run in (tracks `cd` within one command line).
export function walkSegments(cmd, proj) {
  const { segments, heredocs } = splitSegments(String(cmd || ''));
  let cwd = proj || null;
  const out = [];
  for (const s of segments) {
    const words = commandWords(tokenize(s.text));
    const c0 = base(words[0]);
    out.push({ ...s, words, c0, cwd });
    if (c0 === 'cd' || c0 === 'pushd') {
      const t = words.slice(1).find(x => !x.startsWith('-'));
      if (!t) cwd = os.homedir();
      else { const x = expandVars(t, proj, cwd); if (!/\$/.test(x)) cwd = path.resolve(cwd || '/', x); }
    }
  }
  return { segs: out, heredocs };
}

// Quote-aware: `>` inside '...' or "..." (JS arrows, comparisons in `node -e`) is not a redirect.
function maskQuotes(seg) {
  let out = '', q = null;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) { if (c === q) { q = null; out += c; } else if (c === '\\' && q === '"') { out += '__'; i++; } else out += '_'; continue; }
    if (c === "'" || c === '"') { q = c; out += c; continue; }
    if (c === '\\') { out += '__'; i++; continue; }
    out += c;
  }
  return out;
}

export function redirectTargets(seg) {
  const targets = [];
  const masked = maskQuotes(seg);
  const re = /(?:^|[^<>&0-9=])(?:[0-9]?>>?|&>>?)(?!&)\s*/g;
  let m;
  while ((m = re.exec(masked))) {
    const start = m.index + m[0].length;
    const tok = tokenize(seg.slice(start))[0];
    if (tok) targets.push(tok);
  }
  return targets;
}
// `< file` input redirects (not heredocs)
function inputRedirects(seg) {
  const out = []; const masked = maskQuotes(seg);
  const re = /(?:^|[^<])<(?!<)\s*/g; let m;
  while ((m = re.exec(masked))) { const tok = tokenize(seg.slice(m.index + m[0].length))[0]; if (tok) out.push(tok); }
  return out;
}

const DB_CLIENTS = ['psql', 'mysql', 'sqlite3', 'mongosh', 'mongo', 'redis-cli', 'mariadb', 'duckdb', 'sqlcmd', 'clickhouse-client', 'cockroach'];
const DB_DROP_BASE = /\b(drop\s+(table|database|schema|collection)|truncate\s+(table\s+)?\w|\.drop(Database)?\s*\()/i;
// DROP/TRUNCATE, or DELETE FROM / UPDATE … SET without WHERE in the same statement
const DB_DROP_RE = { test: sql => DB_DROP_BASE.test(sql) || String(sql).split(';').some(st => (/\bdelete\s+from\s+\S/i.test(st) || /\bupdate\s+\S+\s+set\b/i.test(st)) && !/\bwhere\b/i.test(st)) };
const DB_FILE_RE = /\.(db|sqlite|sqlite3|db3)$/i;
const FIND_FILTERS = ['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-newer', '-mtime', '-mmin', '-atime', '-amin', '-ctime', '-cmin', '-size', '-empty', '-user', '-group', '-perm', '-links', '-inum', '-samefile', '-lname', '-ilname'];

// find <roots…> <expression>: roots are the args before the first option/expression token
export function findRoots(w) {
  const roots = [];
  for (let k = 1; k < w.length; k++) { const t = w[k]; if (/^[-(!]/.test(t) || t === '\\(') break; roots.push(t); }
  return roots.length ? roots : ['.'];
}
// a selecting predicate; negated ones (`! -name .git`, `-not -name x`) don't narrow "everything but x" enough to count
export const findHasFilter = w => w.some((t, k) => FIND_FILTERS.includes(t) && !['!', '-not', '\\!'].includes(w[k - 1]));
// `.`, `*`, `./*`, $PWD … resolving to the project root
function isProjRoot(t, proj, cwd) {
  if (!proj) return false;
  const x = expandVars(t, proj, cwd);
  if (/\$/.test(x)) return false;
  const s = (x === '*' || x === './*') ? '.' : x.replace(/\/\*$/, '');
  const a = path.resolve(cwd || proj, s), p = path.resolve(proj);
  return a === p || realish(a) === realish(p);
}
export const findDeletes = w => w.includes('-delete') || w.some((t, k) => ['-exec', '-execdir', '-ok', '-okdir'].includes(t) && base(w[k + 1]) === 'rm');
// -name/-path patterns of a find command
export function findNamePatterns(w) { const out = []; for (let k = 1; k < w.length - 1; k++) if (['-name', '-iname', '-path', '-ipath', '-wholename'].includes(w[k])) out.push(w[k + 1]); return out; }

function isTmpPath(abs) {
  const tmp = [os.tmpdir(), realish(os.tmpdir()), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'];
  return tmp.some(d => abs === d || abs.startsWith(d.replace(/\/+$/, '') + '/')) || /^(\$TMPDIR|\$\{TMPDIR\})(\/|$)/.test(abs);
}

// Recursive delete target check, relative to cwd. Returns a reason or null.
// findMode: the root of `find … -delete` (the root itself is not removed; the caller requires a filter for the project root).
function badDeleteTarget(t, proj, { findMode = false, cwd = proj } = {}) {
  if (/\$\(|`/.test(t)) return `명령 치환 결과를 재귀 삭제(${t}) — 대상이 불확실`;
  const x = expandVars(t, proj, cwd);
  if (/\$/.test(x)) {
    // other variables are unknown and left to the user, except the classic mistakes
    if (/\$\{[A-Za-z_]\w*[%#/^,]/.test(x)) return `매개변수 확장으로 만든 경로를 재귀 삭제(${t}) — 대상이 불확실`;
    if (/^\$(\{OLDPWD\}|OLDPWD)\/?$/.test(x)) return `이전 디렉터리($OLDPWD) 재귀 삭제`;
    if (/^\$(\{PWD\}|PWD)\/?\*?$/.test(x)) return `현재 디렉터리 재귀 삭제(${t})`;
    if (/^\$(\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)\/\*?$/.test(x)) return `변수가 비면 루트가 되는 경로 재귀 삭제(${t}) — \${VAR:?}로 쓰세요`;
    return null;
  }
  if (!proj && !cwd && !path.isAbsolute(x)) return (['.', './', '*', './*'].includes(x) || /^\.\.(\/|$)/.test(x)) ? `현재·상위 경로 재귀 삭제(${t})` : null;
  const home = os.homedir();
  const stripped = (x === '*' || x === './*') ? '.' : x.replace(/\/\*$/, '');
  const abs = path.resolve(cwd || proj || '/', stripped);
  if (abs === '/') return `루트 재귀 삭제(${t})`;
  if (abs === home || home.startsWith(abs + '/')) return `홈 디렉터리 재귀 삭제(${t})`;
  if (/^\/(Users|home)\/[^/]+$/.test(abs)) return `홈 디렉터리 재귀 삭제(${t})`;
  if (proj) {
    const pr = path.resolve(proj);
    const rabs = realish(abs), rpr = realish(pr);
    if (abs === pr || rabs === rpr) return findMode ? null : `프로젝트 루트 재귀 삭제(${t})`;
    if (pr.startsWith(abs + '/') || rpr.startsWith(rabs + '/')) return `프로젝트 상위 경로 재귀 삭제(${t})`;
    if (abs.startsWith(pr + '/') || rabs.startsWith(rpr + '/')) return null;
    // a sibling of the project (same parent folder), e.g. `node_modules/../../other`
    if ((abs.startsWith(path.dirname(pr) + '/') || rabs.startsWith(path.dirname(rpr) + '/')) && !ARTIFACT_NAMES.includes(path.basename(abs))) return `프로젝트 밖 경로 재귀 삭제(${t})`;
  }
  if (/^\/[^/]+$/.test(abs) && !isTmpPath(abs)) return `루트·시스템 경로 재귀 삭제(${t})`;
  if (isTmpPath(abs)) return null;
  if (abs.startsWith(home + '/')) {
    const relH = abs.slice(home.length + 1);
    if (HOME_CACHE_DIRS.some(c => relH === c || relH.startsWith(c + '/'))) return null;
    if (ARTIFACT_NAMES.includes(path.basename(abs))) return null;
    return `홈 디렉터리 하위 재귀 삭제(${t})`;
  }
  if (ARTIFACT_NAMES.includes(path.basename(abs))) return null;
  return proj ? `프로젝트 밖 경로 재귀 삭제(${t})` : null;
}

// SQL a segment carries: its own text, heredoc bodies (when it has <<), input-redirect / -f files (when small)
// written: literal content echoed into files earlier in the same command line (path → text)
function segmentSql(s, heredocs, proj, written = {}) {
  const parts = [s.text];
  if (/<</.test(s.text)) parts.push(...heredocs.map(h => h.body));
  const files = inputRedirects(s.text);
  for (let k = 0; k < s.words.length - 1; k++) if (['-f', '--file'].includes(s.words[k])) files.push(s.words[k + 1]);
  if (s.c0 === 'cat') files.push(...s.words.slice(1).filter(t => !t.startsWith('-')));
  for (const t of s.words) { const m = /^\.read\s+(\S+)/.exec(t); if (m) files.push(m[1]); }
  for (const f of files) {
    const p = path.resolve(s.cwd || proj || process.cwd(), expandVars(f, proj, s.cwd));
    if (written[p] != null) { parts.push(written[p]); continue; }
    try { if (fs.statSync(p).size < 2_000_000) parts.push(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return parts.join('\n');
}

// Returns {deny:true, reason, cls} or null. Irreversible / obfuscation rules (apply to every agent).
const RM_LIKE = ['rimraf', 'del', 'trash', 'trash-put', 'shred'];
const EXEC_SUBCMD_MUTATING = /^(POST|PUT|PATCH|DELETE)$/i;
function ghApiMutates(w) {
  let method = null; let fields = false;
  for (let k = 2; k < w.length; k++) {
    const t = w[k];
    if (t === '-X' || t === '--method') method = w[k + 1] || '';
    else if (/^(-X|--method=)/.test(t) && t.length > 2) method = t.replace(/^(-X|--method=)/, '');
    if (/^(-f|-F|--field|--raw-field|--input)(=|$)/.test(t) || /^-[fF]./.test(t)) fields = true;
  }
  if (method) return EXEC_SUBCMD_MUTATING.test(method.replace(/['"]/g, ''));
  return fields; // gh api defaults to POST when fields or input are given
}
function deny(reason, rule) { return { deny: true, reason, rule }; }
// words minus redirections (`< file`, `>out`, `2>&1`): they are not arguments
function dropRedirects(words) {
  const out = [];
  for (let k = 0; k < words.length; k++) {
    const t = words[k];
    if (/^[0-9]*(<<?<?|>>?|&>>?)$/.test(t)) { k++; continue; }
    if (/^[0-9]*(<|>>?|&>>?)./.test(t)) continue;
    out.push(t);
  }
  return out;
}

// node -e / python -c code and heredoc bodies fed to an interpreter, as [code, kind]
function inlineCodes(s, heredocs) {
  const kind = INLINE_KIND[s.c0];
  if (!kind) return [];
  const out = [];
  for (let k = 1; k < s.words.length - 1; k++) if (['-e', '-c', '-p', '--eval', '--print', '-E'].includes(s.words[k])) out.push([s.words[k + 1], kind]);
  if (/<</.test(s.text)) for (const h of heredocs) out.push([h.body, kind]);
  return out;
}

export function analyzeBash(cmd, proj = null, depth = 0) {
  const raw = String(cmd || '');
  if (/\$\{IFS\}|\$IFS\b/.test(raw)) return deny('난독화된 명령(${IFS})', 'obfuscation');
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(raw)) return deny('fork bomb', 'obfuscation');
  const { segs, heredocs } = walkSegments(raw, proj);

  // heredoc feeding a shell interpreter
  for (const s of segs) {
    if (/<</.test(s.text) && s.words.length && (SHELLS.includes(s.c0) || s.c0 === 'eval') && !shellPayload(s.words)) return deny('heredoc을 셸로 실행', 'obfuscation');
  }
  // literal content echoed into files in this command line (for `echo 'DROP …' > f && psql -f f`)
  const written = {};
  for (const s of segs) if (['echo', 'printf'].includes(s.c0)) for (const t of redirectTargets(s.text)) written[path.resolve(s.cwd || proj || process.cwd(), expandVars(t, proj, s.cwd))] = s.text;

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const w = s.words;
    if (!w.length) continue;
    const c0 = s.c0;
    const cwd = s.cwd;
    const prev = segs[i - 1];
    const pipedIn = prev && prev.sep === '|' && !s.subst;

    // piping into a shell or eval
    if (pipedIn && (SHELLS.includes(c0) || c0 === 'eval') && !shellPayload(w)) {
      const p0 = prev.c0;
      if (['curl', 'wget'].includes(p0)) return deny('원격 스크립트를 셸로 실행(curl|sh)', 'remote-exec');
      if (p0 === 'base64' || /base64\s+(-d|--decode|-D)/.test(prev.text) || ['xxd', 'openssl', 'printf', 'echo'].includes(p0)) return deny('디코딩한 내용을 셸로 실행', 'obfuscation');
      return deny('파이프 입력을 셸로 실행', 'obfuscation');
    }
    if (c0 === 'eval' && /base64|\\x[0-9a-f]{2}/i.test(s.text)) return deny('eval 난독화', 'obfuscation');
    const payload = shellPayload(w);
    if (payload !== null && /base64|\$\(.*curl|\\x[0-9a-f]{2}/i.test(s.text)) return deny('셸 -c 난독화', 'obfuscation');
    // eval / sh -c payloads are analysed as commands
    const inner = payload !== null ? payload : (c0 === 'eval' ? w.slice(1).join(' ') : null);
    if (inner && depth < 4) { const r = analyzeBash(inner, proj, depth + 1); if (r && r.deny) return { ...r, reason: `${c0} 안: ${r.reason}` }; }
    // node -e / python -c / interpreter heredocs: literal commands, deletes and SQL inside the code
    if (depth < 4) for (const [code, kind] of inlineCodes(s, heredocs)) { const r = analyzeScriptContent(code, kind, proj, depth + 1); if (r) return { ...r, reason: `${c0} 코드 안: ${r.reason}` }; }

    // rm and rm-like tools (also via xargs: targets come from the piped-in echo/printf/find, or are unknown)
    if (c0 === 'unlink' && w.slice(1).some(t => DB_FILE_RE.test(t))) return deny('DB 파일 삭제', 'db-drop');
    if (c0 === 'rm' || RM_LIKE.includes(c0)) {
      const flags = w.slice(1).filter(t => t.startsWith('-'));
      const recursive = c0 !== 'rm' || flags.some(f => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive');
      const targets = dropRedirects(w.slice(1)).filter(t => !t.startsWith('-'));
      for (const t of targets) {
        if (DB_FILE_RE.test(t)) return deny(`DB 파일 삭제(${t})`, 'db-drop');
        if (recursive && path.basename(t.replace(/\/+$/, '')) === '.git') return deny(`git 기록 삭제(${t})`, 'rm-root');
      }
      let findMode = false;
      const viaXargs = /(^|\s)xargs(\s|$)/.test(s.text);
      const fromList = pipedIn && ['echo', 'printf', 'find'].includes(prev.c0);
      if (viaXargs && pipedIn) {
        const pw = prev.words;
        if (['echo', 'printf'].includes(prev.c0)) targets.push(...pw.slice(1).filter(t => !t.startsWith('-')));
        if (prev.c0 === 'find') {
          targets.push(...findRoots(pw)); findMode = true;
          for (const r of findRoots(pw)) if (!findHasFilter(pw) && isProjRoot(r, proj, prev.cwd)) return deny(`find ${r} | xargs rm: 조건(-name 등) 없이 프로젝트 전체 삭제`, 'rm-root');
        }
      }
      if (viaXargs && recursive && !fromList && !targets.length) return deny('입력으로 받은 대상을 재귀 삭제(xargs rm) — 대상이 불확실', 'rm-root');
      if (recursive) {
        for (const t0 of targets) for (const t of expandBraces(t0)) {
          const why = badDeleteTarget(t, proj, { findMode, cwd: findMode ? prev.cwd : cwd });
          if (why) return deny(why, why.startsWith('홈') ? 'rm-home' : 'rm-root');
        }
      }
    }
    // find … -delete / -exec rm
    if (c0 === 'find' && findDeletes(w)) {
      const names = w.filter((t, k) => ['-name', '-iname'].includes(w[k - 1])).map(t => t.replace(/^['"]|['"]$/g, ''));
      if (names.includes('.git')) return deny('git 기록 삭제(find -name .git)', 'rm-root');
      if (names.some(n => DB_FILE_RE.test(n))) return deny('DB 파일 삭제(find)', 'db-drop');
      for (const t of findRoots(w)) {
        const why = badDeleteTarget(t, proj, { findMode: true, cwd });
        if (why) return deny(why, 'rm-root');
        if (!findHasFilter(w) && isProjRoot(t, proj, cwd)) return deny(`find ${t} -delete: 조건(-name 등) 없이 프로젝트 전체 삭제`, 'rm-root');
      }
    }
    // rsync --delete into home / outside the project
    if (c0 === 'rsync' && w.some(t => /^--delete/.test(t))) {
      const args = w.slice(1).filter(t => !t.startsWith('-'));
      const why = args.length >= 2 ? badDeleteTarget(args[args.length - 1], proj, { cwd }) : null;
      if (why) return deny(`rsync --delete 대상: ${why}`, 'rm-root');
    }
    if (c0 === 'mv') {
      const args = w.slice(1).filter(t => !t.startsWith('-'));
      for (const t of args.slice(0, -1)) { const why = badDeleteTarget(t, proj, { cwd }); if (why && /^(홈 디렉터리 재귀|프로젝트 루트|프로젝트 상위|루트)/.test(why)) return deny(`옮기기(mv)로 ${why}`, 'rm-home'); }
    }

    // git (global options like -C dir / -c k=v are skipped to find the subcommand)
    if (c0 === 'git') {
      const si = gitSubIndex(w);
      for (let k = 1; k < (si > 0 ? si : w.length); k++) if (w[k] === '-c' && /^alias\./i.test(w[k + 1] || '')) return deny('git -c alias.*(별칭으로 명령 우회)', 'git-alias');
      const sub = si > 0 ? w[si] : null;
      if (sub === 'push') return deny('git push는 v0.1에서 비가역 작업(결정 큐로)', 'git-push');
      if (sub === 'subtree' && w[si + 1] === 'push') return deny('git subtree push', 'git-push');
      if (sub === 'tag') {
        const rest = w.slice(si + 1);
        const listMode = rest.some(t => TAG_LIST_OPTS.includes(t.split('=')[0]) || /^-n\d*$/.test(t));
        if (!listMode && rest.some(t => !t.startsWith('-'))) return deny('git tag 생성은 사용자 승인 필요', 'git-tag');
      }
      if (sub === 'config' && w.slice(si + 1).some((t, k, a) => /^alias\./i.test(t) && /\bpush\b/.test(a.slice(k + 1).join(' ')))) return deny('push 별칭 설정', 'git-alias');
    }
    if (c0 === 'gh') {
      const a = w.slice(1).join(' ');
      if (/^(release\s+(create|delete|edit|upload)|pr\s+merge|repo\s+(delete|create|edit|rename|archive)|workflow\s+run)\b/i.test(a)) return deny(`외부 게시·변경(gh ${w[1]} ${w[2] || ''})`, 'gh-publish');
      if (w[1] === 'api' && ghApiMutates(w)) return deny('외부 변경(gh api 쓰기 요청)', 'gh-publish');
      if (/^repo\s+sync\b/.test(a) && /(^|\s)(--force|-f)(\s|$)/.test(a)) return deny('gh repo sync --force', 'gh-publish');
    }
    // publish / deploy / release
    const r = publishDeploy(c0, w);
    if (r) return deny(r, /배포|deploy/.test(r) ? 'deploy' : 'publish');
    // DB: SQL in the segment of a DB client (text, heredoc, < file, -f file) or piped into one
    const isDbClient = w.some(t => DB_CLIENTS.includes(base(t)));
    const next = segs[i + 1];
    const pipesToDb = s.sep === '|' && next && !next.subst && next.words.some(t => DB_CLIENTS.includes(base(t)));
    if ((isDbClient || pipesToDb) && DB_DROP_RE.test(segmentSql(s, heredocs, proj, written))) return deny('DB 데이터 삭제(DROP/TRUNCATE)', 'db-drop');
    if (c0 === 'dropdb' || (c0 === 'mysqladmin' && w.some(t => /^drop$/i.test(t)))) return deny(`DB 삭제(${c0})`, 'db-drop');
    if (c0 === 'redis-cli' && w.some(t => /^flush(all|db)$/i.test(t))) return deny('redis FLUSH', 'db-drop');
    const joined = w.join(' ');
    if (MIGRATE_RES.some(re => re.test(joined))) return deny('DB 마이그레이션 적용·초기화', 'db-migrate');
    // disk
    if (c0 === 'dd' && w.some(t => /^of=\/dev\//.test(t))) return deny('디스크 직접 쓰기', 'disk');
    if (/^mkfs/.test(c0)) return deny('파일시스템 포맷', 'disk');
    if (c0 === 'chmod' && w.includes('-R') && w.some(t => t === '/' || t === '~')) return deny('루트·홈 권한 일괄 변경', 'disk');
    // secrets via redirect
    for (const t of redirectTargets(s.text)) {
      const rel = t.replace(/^\.\//, '');
      if (matchAny(rel, SECRET_GLOBS)) return deny(`비밀 파일 쓰기(${t})`, 'secret-write');
    }
    if (['tee', 'cp', 'mv'].includes(c0)) {
      const dst = w[w.length - 1];
      if (dst && matchAny(dst.replace(/^\.\//, ''), SECRET_GLOBS) && w.length > 1) return deny(`비밀 파일 쓰기(${dst})`, 'secret-write');
    }
  }
  return null;
}

const TAG_LIST_OPTS = ['-l', '--list', '--contains', '--no-contains', '--points-at', '--merged', '--no-merged', '--sort', '--column', '--no-column', '--format', '-v', '--verify', '-i', '--ignore-case'];
const MIGRATE_RES = [
  /\bprisma\s+migrate\s+dev\b/,
  /\bprisma\s+(migrate\s+(deploy|reset)|db\s+push)/, /\balembic\s+(upgrade|downgrade)\b/, /\b(db:drop|db:reset|migrate:fresh|migrate:reset)\b/,
  /\bsupabase\s+db\s+(push|reset)\b/, /\bknex\s+migrate:(latest|rollback|up|down)\b/,
  /\bmanage\.py\s+(migrate|flush|sqlflush|reset_db)\b/, /\b(rails|rake)\s+db:(migrate|rollback|schema:load|setup)\b/,
  /\bsequelize(-cli)?\s+db:(migrate|seed)/, /\btypeorm(-ts-node-\w+)?\s+migration:(run|revert)\b/, /\bdrizzle-kit\s+(push|migrate|drop)\b/,
  /\bflyway\b.*\b(migrate|clean|baseline)\b/, /\bgoose\b.*\s(up|down|reset|redo)(\s|$)/,
];
// name-based: `npm run deploy`, `make release` … (the script body is not visible here)
const RELEASE_NAME = /^(deploy|release|publish)([:._-].*)?$/;
function publishDeploy(c0, w) {
  const a1 = w[1];
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(c0)) {
    if (w.includes('publish')) return '패키지 게시';
    if (a1 === 'version' && w.length > 2) return '버전 올리기·tag 생성(npm version)';
    const name = ['run', 'run-script'].includes(a1) ? w[2] : (c0 !== 'npm' ? a1 : null);
    if (name && RELEASE_NAME.test(name)) return `배포·게시 스크립트 실행(${c0} ${a1 === 'run' ? 'run ' : ''}${name})`;
  }
  if (c0 === 'make' && w.slice(1).some(t => !t.startsWith('-') && !t.includes('=') && RELEASE_NAME.test(t))) return '배포·게시 대상 실행(make)';
  if (c0 === 'vercel' && (w.includes('--prod') || w.includes('deploy') || w.includes('promote') || w.length === 1)) return '배포(vercel)';
  if (['netlify', 'firebase', 'fly', 'flyctl', 'railway', 'wrangler', 'serverless', 'sls'].includes(c0) && w.some(t => /^(deploy|publish|release)$/.test(t))) return `배포(${c0})`;
  if (c0 === 'heroku' && w.some(t => /^(container:(push|release)|releases:rollback|deploy)/.test(t))) return '배포(heroku)';
  if (c0 === 'gcloud' && w.some(t => t === 'deploy')) return '배포(gcloud)';
  if (c0 === 'cdk' && w.some(t => ['deploy', 'destroy'].includes(t))) return '배포(cdk)';
  if (c0 === 'aws' && w[1] === 's3' && ((w[2] === 'sync' && w.some(t => t === '--delete')) || (w[2] === 'rm' && w.some(t => t === '--recursive')) || w[2] === 'rb')) return 'S3 삭제·덮어쓰기(aws s3)';
  if (['docker', 'podman'].includes(c0) || c0 === 'docker-compose') {
    const sub = c0 === 'docker-compose' ? ['compose', ...w.slice(1)] : w.slice(1);
    if (sub[0] === 'compose' && sub.includes('down') && sub.some(t => t === '-v' || t === '--volumes')) return 'Docker 볼륨 삭제(compose down -v)';
    if (sub[0] === 'volume' && ['rm', 'prune'].includes(sub[1])) return `Docker 볼륨 삭제(volume ${sub[1]})`;
    if (sub[0] === 'system' && sub[1] === 'prune' && sub.includes('--volumes')) return 'Docker 볼륨 삭제(system prune --volumes)';
  }
  if (c0 === 'helm' && ['install', 'upgrade', 'uninstall', 'delete', 'rollback'].includes(w[1])) return `배포(helm ${w[1]})`;
  if (['surge', 'gh-pages'].includes(c0)) return `배포(${c0})`;
  if (c0 === 'terraform' && w.some(t => ['apply', 'destroy'].includes(t))) return '배포(terraform apply/destroy)';
  if (c0 === 'kubectl' && w.some(t => ['apply', 'delete', 'replace', 'rollout'].includes(t))) return '배포(kubectl 변경)';
  if (['docker', 'podman'].includes(c0) && (w.includes('push') || w.includes('--push'))) return `이미지 게시(${c0} push)`;
  if (c0 === 'cargo' && a1 === 'publish') return '패키지 게시(cargo)';
  if (c0 === 'twine' && a1 === 'upload') return '패키지 게시(twine)';
  if (c0 === 'poetry' && a1 === 'publish') return '패키지 게시(poetry)';
  if (c0 === 'gem' && a1 === 'push') return '패키지 게시(gem)';
  if (c0 === 'changeset' && a1 === 'publish') return '패키지 게시(changeset)';
  if (['semantic-release', 'np', 'standard-version', 'release-it', 'lerna'].includes(c0) && (c0 !== 'lerna' || ['publish', 'version'].includes(a1))) return `릴리스·게시(${c0})`;
  return null;
}

// Paths one segment writes to (best effort): redirects, tee, sed -i, cp/mv dest, rm targets, touch, dd of=, sponge, inline code.
function segWriteTargets(text, w, heredocBodies = []) {
  const out = [...redirectTargets(text)];
  if (!w.length) return out;
  const c0 = base(w[0]);
  const args = w.slice(1).filter(t => !t.startsWith('-'));
  if (c0 === 'tee' || c0 === 'sponge') out.push(...args);
  if (c0 === 'sed' && w.some(t => /^-i/.test(t) || t === '--in-place')) out.push(...args.slice(1));
  if (c0 === 'perl' && w.some(t => /^-[a-z]*i/.test(t))) out.push(...args.slice(1));
  if (['cp', 'mv', 'install', 'ln', 'rsync'].includes(c0) && args.length >= 2) out.push(args[args.length - 1]);
  if (['mv', 'rsync'].includes(c0) && args.length >= 2) out.push(...args.slice(0, -1)); // moving a file away also changes it
  if (c0 === 'dd') for (const t of w) if (t.startsWith('of=')) out.push(t.slice(3));
  out.push(...inlineCodeWrites(w));
  if (INLINE_RUNNERS.includes(c0) && /<</.test(text)) for (const b of heredocBodies) out.push(...codeWrites(b));
  if (['rm', 'unlink', 'truncate', 'touch'].includes(c0)) out.push(...args);
  if (c0 === 'git' && ['checkout', 'restore'].includes(w[1])) out.push(...args.slice(1));
  return out;
}

// Raw write-target tokens (kept for callers/tests that want tokens, not resolved paths)
export function bashWriteTargets(cmd) {
  const { segments, heredocs } = splitSegments(String(cmd || ''));
  const out = [];
  for (const s of segments) out.push(...segWriteTargets(s.text, commandWords(tokenize(s.text)), heredocs.map(h => h.body)));
  return out;
}

// Write targets as canonical project-relative paths (cd-aware; globs/braces kept as patterns for relIs/relUnder)
export function bashWriteRels(cmd, proj) {
  const { segs, heredocs } = walkSegments(cmd, proj);
  const out = [];
  for (const s of segs) for (const t of segWriteTargets(s.text, s.words, heredocs.map(h => h.body))) out.push(...pathVariants(proj, t, s.cwd));
  return out;
}

// Every non-option argument of every segment, as canonical paths (cd-aware), plus each segment's cwd
export function bashPathArgs(cmd, proj) {
  const { segs } = walkSegments(cmd, proj);
  const out = [];
  for (const s of segs) {
    if (s.cwd && proj) out.push(canonRel(proj, s.cwd));
    for (const t of s.words.slice(1)) if (t && !t.startsWith('-') && t.length < 4096) out.push(...pathVariants(proj, t, s.cwd));
  }
  return out;
}

// node -e / python -c inline code: string literals passed to file-writing APIs are write targets (best effort)
const INLINE_RUNNERS = ['node', 'nodejs', 'deno', 'bun', 'python', 'python3', 'ruby', 'perl'];
function codeWrites(code) {
  const out = []; let m;
  const first = /(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|rmSync|rmdirSync|unlinkSync|unlink|truncateSync|openSync|mkdirSync|writeTextFile|Bun\.write|os\.remove|os\.unlink|shutil\.rmtree)\s*\(\s*(['"`])([^'"`]+)\1/g;
  while ((m = first.exec(code))) out.push(m[2]);
  const second = /(?:renameSync|rename|copyFileSync|copyFile|cpSync|symlinkSync|shutil\.(?:copy|copyfile|move))\s*\(\s*(['"`])[^'"`]+\1\s*,\s*(['"`])([^'"`]+)\2/g;
  while ((m = second.exec(code))) out.push(m[3]);
  const pyOpen = /open\(\s*(['"])([^'"]+)\1\s*,\s*(['"])[^'"]*[wax+]/g;
  while ((m = pyOpen.exec(code))) out.push(m[2]);
  return out;
}
export function inlineCodeWrites(w) {
  const out = [];
  if (!INLINE_RUNNERS.includes(base(w[0]))) return out;
  for (let k = 1; k < w.length - 1; k++) if (['-e', '-c', '-p', '--eval', '--print', '-E'].includes(w[k])) out.push(...codeWrites(w[k + 1]));
  return out;
}

// murba CLI invocations → list of argument arrays. Covers wrappers, `xargs murba`, `$(command -v murba)`,
// `node [opts] …/murba(-cli.mjs)`, `sh -c`/`bash -lc`/eval payloads, `find -exec murba`, and murba calls inside inline code.
// '<stdin>' marks a subcommand that comes from stdin (unknown).
const NODE_VALUE_OPTS = ['-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions', '--input-type', '--env-file', '--title'];
const isMurbaWord = t => { const b = base(t); return b === 'murba' || /^murba-cli\.m?js$/.test(b) || /^(\$\(|`)\s*(command\s+-v|which|type\s+-p)\s+murba\s*(\)|`)$/.test(t); };
const INLINE_MURBA_RE = /\bmurba(?:-cli\.m?js)?['"`]?\s*(?:,\s*\[?\s*)?['"`]?\s*([a-z][a-z-]*)/g;
export function murbaInvocations(cmd, depth = 0) {
  const out = [];
  if (depth > 3) return out;
  const { segments, heredocs } = splitSegments(String(cmd || ''));
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const tokens = tokenize(s.text);
    const w = commandWords(tokens);
    if (!w.length) continue;
    const c0 = base(w[0]);
    const prev = segments[i - 1];
    if (isMurbaWord(w[0])) {
      let args = w.slice(1);
      // `$(command -v murba) ac …`: the splitter cut the substitution off; the args are the next segment
      if (!args.length && [')', '`'].includes(s.sep) && segments[i + 1]) args = tokenize(segments[i + 1].text);
      const xi = tokens.indexOf('xargs');
      if (xi >= 0 && xi < tokens.findIndex(isMurbaWord)) {
        const pw = prev && prev.sep === '|' ? commandWords(tokenize(prev.text)) : [];
        if (['echo', 'printf'].includes(base(pw[0]))) args = args.concat(pw.slice(1).filter(x => !x.startsWith('-')));
        else if (!args.length) args = ['<stdin>'];
      }
      out.push(args);
    } else if (['node', 'nodejs', 'bun', 'deno', ...SHELLS].includes(c0) && shellPayload(w) === null) {
      let k = 1;
      while (w[k] && w[k].startsWith('-') && !['-e', '-p', '--eval', '--print'].includes(w[k])) { if (NODE_VALUE_OPTS.includes(w[k])) k++; k++; }
      if (w[k] && isMurbaWord(w[k])) out.push(w.slice(k + 1));
    }
    const payload = shellPayload(w);
    if (payload !== null) out.push(...murbaInvocations(payload, depth + 1));
    if (c0 === 'eval') out.push(...murbaInvocations(w.slice(1).join(' '), depth + 1));
    if (c0 === 'find') {
      for (let k = 1; k < w.length; k++) if (['-exec', '-execdir', '-ok', '-okdir'].includes(w[k]) && isMurbaWord(w[k + 1] || '')) {
        const rest = []; for (let j = k + 2; j < w.length && ![';', '+', '\\;'].includes(w[j]); j++) rest.push(w[j]);
        out.push(rest);
      }
    }
    if (INLINE_RUNNERS.includes(c0)) {
      const codes = [];
      for (let k = 1; k < w.length - 1; k++) if (['-e', '-c', '-p', '--eval', '--print', '-E'].includes(w[k])) codes.push(w[k + 1]);
      if (/<</.test(s.text)) codes.push(...heredocs.map(h => h.body));
      for (const code of codes) { let m; INLINE_MURBA_RE.lastIndex = 0; while ((m = INLINE_MURBA_RE.exec(code))) out.push([m[1]]); }
    }
  }
  return out;
}

export function bashMentions(cmd, needle) { return String(cmd || '').includes(needle); }

// ---- Script files written by an agent (best effort, literals only; computed strings are out of scope) ----
export const SCRIPT_EXT_RE = /\.(m?js|cjs|jsx|tsx?|mts|cts|py|sh|bash|zsh|ksh|rb|pl)$/i;
export function deleteTargetReason(t, proj) { return badDeleteTarget(t, proj, { cwd: proj }); }
const INLINE_KIND = { node: 'js', nodejs: 'js', deno: 'js', bun: 'js', python: 'py', python3: 'py', ruby: 'rb', perl: 'pl' };

// What kind of script a file is: 'sh' | 'make' | 'pkg' | 'js' | 'py' | 'rb' | 'pl' | null
export function scriptKind(rel, content) {
  const b = String(rel || '').split('/').pop();
  if (/\.(sh|bash|zsh|ksh)$/i.test(b)) return 'sh';
  if (/^(GNUmakefile|[Mm]akefile)$|\.mk$/.test(b)) return 'make';
  if (b === 'package.json') return 'pkg';
  if (/\.(m?js|cjs|jsx|tsx?|mts|cts)$/i.test(b)) return 'js';
  if (/\.py$/i.test(b)) return 'py';
  if (/\.rb$/i.test(b) || b === 'Rakefile') return 'rb';
  if (/\.pl$/i.test(b)) return 'pl';
  const first = String(content || '').split('\n')[0];
  if (!b.includes('.') && /^#!/.test(first)) {
    if (/node|deno|bun/.test(first)) return 'js';
    if (/python/.test(first)) return 'py';
    if (/ruby/.test(first)) return 'rb';
    if (/perl/.test(first)) return 'pl';
    return 'sh';
  }
  return null;
}

// Read a JS/Python string literal at s[i] (quote char). Returns [value, endIndex] or null (template with ${…} → null).
function readLiteral(s, i) {
  const q = s[i]; if (!["'", '"', '`'].includes(q)) return null;
  let v = '';
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { v += s[k + 1] ?? ''; k++; continue; }
    if (q === '`' && c === '$' && s[k + 1] === '{') return null;
    if (c === q) return [v, k + 1];
    v += c;
  }
  return null;
}
// Array literal of string literals at s[i] ('[') → [items, endIndex] or null if any item is not a literal
function readLiteralArray(s, i) {
  if (s[i] !== '[') return null;
  const items = []; let k = i + 1;
  for (;;) {
    while (/[\s,]/.test(s[k] || '')) k++;
    if (s[k] === ']') return [items, k + 1];
    const lit = readLiteral(s, k); if (!lit) return null;
    items.push(lit[0]); k = lit[1];
  }
}

const EXEC_CALL_RE = /\b(?:execSync|execFileSync|execFile|exec|spawnSync|spawn|fork|execa(?:Sync|Command(?:Sync)?|Node)?|subprocess\.(?:run|call|check_call|check_output|Popen)|os\.system|os\.popen|system|Kernel\.(?:system|exec)|Open3\.\w+|IO\.popen|Bun\.spawn(?:Sync)?|Deno\.Command)\s*\(\s*/g;
// recursive-by-nature deleters (fs-extra, rimraf, del) and fs.rm/rmSync (recursive when {recursive:true})
const RM_CALL_RE = /\b(?:fs\.|fsp\.|promises\.|fse\.)?(rmSync|rmdirSync|rm|rmdir|removeSync|remove|emptyDirSync|emptyDir|rimrafSync|rimraf|deleteSync|deleteAsync|shutil\.rmtree)\s*\(\s*/g;
const ALWAYS_RECURSIVE = ['removeSync', 'remove', 'emptyDirSync', 'emptyDir', 'rimrafSync', 'rimraf', 'deleteSync', 'deleteAsync', 'shutil.rmtree'];
const READ_CALL_RE = /\b(?:readFileSync|readFile|createReadStream|readdirSync|readdir|opendirSync|copyFileSync|copyFile|cpSync)\s*\(\s*(['"`])([^'"`]+)\1|\bopen\(\s*(['"])([^'"]+)\3\s*(?:\)|,\s*(['"])r)/g;
const DB_CALL_RE = /\.(exec|execute|executescript|executemany|query|run|prepare|raw|\$executeRaw\w*|\$queryRaw\w*)\s*\(|sqlite3|better-sqlite3|psycopg|pymysql|mysql|\bpg\b|knex|sequelize|duckdb/;

// → { commands, deletes: [{target, recursive}], writes, reads, sql: bool }
export function scanScript(content, rel, kind = scriptKind(rel, content)) {
  const src = String(content || '');
  const res = { commands: [], deletes: [], writes: [], reads: [], sql: false };
  if (kind === 'sh') { res.commands.push(src); return res; }
  if (kind === 'make') { for (const line of src.split('\n')) if (/^\t/.test(line)) res.commands.push(line.replace(/^\t[@+-]*/, '')); return res; }
  if (kind === 'pkg') {
    try { const j = JSON.parse(src); for (const v of Object.values((j && j.scripts) || {})) if (typeof v === 'string') res.commands.push(v); }
    catch { let m; const re = /"[^"\n]+"\s*:\s*"((?:[^"\\\n]|\\.)*)"/g; while ((m = re.exec(src))) res.commands.push(m[1].replace(/\\(.)/g, '$1')); }
    return res;
  }
  let m;
  EXEC_CALL_RE.lastIndex = 0;
  while ((m = EXEC_CALL_RE.exec(src))) {
    let k = m.index + m[0].length;
    const arr0 = readLiteralArray(src, k);
    if (arr0) { res.commands.push(arr0[0].join(' ')); continue; }
    const lit = readLiteral(src, k); if (!lit) continue;
    let cmd = lit[0]; k = lit[1];
    const after = /^\s*,\s*/.exec(src.slice(k));
    if (after) { const arr = readLiteralArray(src, k + after[0].length); if (arr) cmd += ' ' + arr[0].join(' '); }
    res.commands.push(cmd);
  }
  // zx: $`cmd` (no interpolation); ruby/perl backticks and %x(…)
  const zx = /\$`([^`$]*)`/g; while ((m = zx.exec(src))) res.commands.push(m[1]);
  if (kind === 'rb' || kind === 'pl') { const bt = /(?<!\$)`([^`]*)`|%x\(([^)]*)\)/g; while ((m = bt.exec(src))) res.commands.push(m[1] ?? m[2]); }
  RM_CALL_RE.lastIndex = 0;
  while ((m = RM_CALL_RE.exec(src))) {
    const lit = readLiteral(src, m.index + m[0].length); if (!lit) continue;
    const tail = src.slice(lit[1], lit[1] + 200);
    const recursive = ALWAYS_RECURSIVE.includes(m[1]) || /^\s*,\s*\{[^}]*recursive\s*:\s*true/.test(tail);
    res.deletes.push({ target: lit[0], recursive });
  }
  res.writes.push(...codeWrites(src));
  READ_CALL_RE.lastIndex = 0;
  while ((m = READ_CALL_RE.exec(src))) res.reads.push(m[2] ?? m[4]);
  if (DB_CALL_RE.test(src)) {
    const lits = /(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g;
    while ((m = lits.exec(src))) if (DB_DROP_RE.test(m[2])) { res.sql = true; break; }
  }
  return res;
}

// Irreversible rules applied to script content: literal commands (as Bash), recursive deletes, DROP/TRUNCATE via a DB driver.
export function analyzeScriptContent(content, kind, proj, depth = 0) {
  const sc = scanScript(content, '', kind);
  for (const c of sc.commands) { const r = depth < 5 ? analyzeBash(c, proj, depth + 1) : null; if (r) return r; }
  for (const d of sc.deletes) { const why = d.recursive ? badDeleteTarget(d.target, proj, { cwd: proj }) : null; if (why) return { deny: true, reason: why, rule: 'rm-root' }; }
  if (sc.sql) return { deny: true, reason: 'DB 데이터 삭제(DROP/TRUNCATE) SQL 실행', rule: 'db-drop' };
  return null;
}
