// Path patterns and Bash command analysis for the guard.
//
// Threat model (ADR 0003): a safety net against a COOPERATIVE model's mistakes and test-gaming, not a sandbox.
// Handled: wrappers (timeout/nice/env/stdbuf/…), eval and `sh -c`-style payloads, cd within one command line,
// case-insensitive `.murba` paths, globs/braces that can reach `.murba`, $HOME/$PWD/$CLAUDE_PROJECT_DIR forms.
// Out of scope (deliberate obfuscation): quote splitting inside a word (`hid""den`), variable indirection (`m=murba; $m`),
// scripts written to disk and run later (the CLI's caller marker covers murba state changes), rewriting `.murba/caller`.
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
  '**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**', '**/e2e/**',
  '**/conftest.py', '**/playwright.config.*', '**/vitest.config.*', '**/jest.config.*', '**/pytest.ini',
  'test/**', 'tests/**', 'e2e/**', '__tests__/**', 'conftest.py', 'playwright.config.*', 'vitest.config.*', 'jest.config.*', 'pytest.ini',
];
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

export const isTestPath = rel => matchAny(rel, TEST_GLOBS);
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
  let cur = '', q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { cur += c; if (c === q) q = null; else if (c === '\\' && q === '"') { cur += text[++i] ?? ''; } continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '\\') { cur += c + (text[++i] ?? ''); continue; }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||') { segs.push({ text: cur, sep: two }); cur = ''; i++; continue; }
    if (c === ';' || c === '\n') { segs.push({ text: cur, sep: c }); cur = ''; continue; }
    if (c === '|') { segs.push({ text: cur, sep: '|' }); cur = ''; continue; }
    if (c === '&') { segs.push({ text: cur, sep: '&' }); cur = ''; continue; }
    // subshells, command substitution, backticks: analyse inner commands as their own segments
    if (c === '(' || c === ')' || c === '`') { segs.push({ text: cur, sep: c }); cur = ''; continue; }
    cur += c;
  }
  segs.push({ text: cur, sep: '' });
  return { segments: segs.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text), heredocs };
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
};
export function commandWords(tokens) {
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
  return tokens.slice(i);
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
const DB_DROP_RE = /\b(drop\s+(table|database|schema|collection)|truncate\s+(table\s+)?\w|\.drop(Database)?\s*\()/i;
const FIND_FILTERS = ['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-newer', '-mtime', '-mmin', '-atime', '-amin', '-ctime', '-cmin', '-size', '-empty', '-user', '-group', '-perm', '-links', '-inum', '-samefile', '-lname', '-ilname'];

// find <roots…> <expression>: roots are the args before the first option/expression token
export function findRoots(w) {
  const roots = [];
  for (let k = 1; k < w.length; k++) { const t = w[k]; if (/^[-(!]/.test(t) || t === '\\(') break; roots.push(t); }
  return roots.length ? roots : ['.'];
}
export const findHasFilter = w => w.some(t => FIND_FILTERS.includes(t));
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
  if (/\$/.test(x)) return null; // other variables: unknown, left to the user
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
function segmentSql(s, heredocs, proj) {
  const parts = [s.text];
  if (/<</.test(s.text)) parts.push(...heredocs.map(h => h.body));
  const files = inputRedirects(s.text);
  for (let k = 0; k < s.words.length - 1; k++) if (['-f', '--file'].includes(s.words[k])) files.push(s.words[k + 1]);
  for (const f of files) {
    try { const p = path.resolve(s.cwd || proj || process.cwd(), expandVars(f, proj, s.cwd)); if (fs.statSync(p).size < 2_000_000) parts.push(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return parts.join('\n');
}

// Returns {deny:true, reason, cls} or null. Irreversible / obfuscation rules (apply to every agent).
export function analyzeBash(cmd, proj = null, depth = 0) {
  const raw = String(cmd || '');
  if (/\$\{IFS\}|\$IFS\b/.test(raw)) return { deny: true, reason: '난독화된 명령(${IFS})', rule: 'obfuscation' };
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(raw)) return { deny: true, reason: 'fork bomb', rule: 'obfuscation' };
  const { segs, heredocs } = walkSegments(raw, proj);

  // heredoc feeding a shell interpreter
  for (const s of segs) {
    if (/<</.test(s.text) && s.words.length && (SHELLS.includes(s.c0) || s.c0 === 'eval') && !shellPayload(s.words)) return { deny: true, reason: 'heredoc을 셸로 실행', rule: 'obfuscation' };
  }

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const w = s.words;
    if (!w.length) continue;
    const c0 = s.c0;
    const cwd = s.cwd;
    const prev = segs[i - 1];
    const pipedIn = prev && prev.sep === '|';

    // piping into a shell or eval
    if (pipedIn && (SHELLS.includes(c0) || c0 === 'eval') && !shellPayload(w)) {
      const p0 = prev.c0;
      if (['curl', 'wget'].includes(p0)) return { deny: true, reason: '원격 스크립트를 셸로 실행(curl|sh)', rule: 'remote-exec' };
      if (p0 === 'base64' || /base64\s+(-d|--decode|-D)/.test(prev.text) || ['xxd', 'openssl', 'printf', 'echo'].includes(p0)) return { deny: true, reason: '디코딩한 내용을 셸로 실행', rule: 'obfuscation' };
      return { deny: true, reason: '파이프 입력을 셸로 실행', rule: 'obfuscation' };
    }
    if (c0 === 'eval' && /base64|\\x[0-9a-f]{2}/i.test(s.text)) return { deny: true, reason: 'eval 난독화', rule: 'obfuscation' };
    const payload = shellPayload(w);
    if (payload !== null && /base64|\$\(.*curl|\\x[0-9a-f]{2}/i.test(s.text)) return { deny: true, reason: '셸 -c 난독화', rule: 'obfuscation' };
    // eval / sh -c payloads are analysed as commands
    const inner = payload !== null ? payload : (c0 === 'eval' ? w.slice(1).join(' ') : null);
    if (inner && depth < 4) { const r = analyzeBash(inner, proj, depth + 1); if (r && r.deny) return { ...r, reason: `${c0} 안: ${r.reason}` }; }

    // rm (also via xargs: targets come from the piped-in echo/printf/find)
    if (c0 === 'rm') {
      const flags = w.slice(1).filter(t => t.startsWith('-'));
      const recursive = flags.some(f => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive');
      const targets = w.slice(1).filter(t => !t.startsWith('-'));
      // `rm -rf $(…)` / `rm -rf \`…\``: the target is a command substitution that the splitter cut off
      if (recursive && (s.sep === '`' || (s.sep === '(' && /\$$/.test(s.text)))) return { deny: true, reason: '명령 치환 결과를 재귀 삭제 — 대상이 불확실', rule: 'rm-root' };
      let findMode = false;
      if (pipedIn && /(^|\s)xargs(\s|$)/.test(s.text)) {
        const pw = prev.words;
        if (['echo', 'printf'].includes(prev.c0)) targets.push(...pw.slice(1).filter(t => !t.startsWith('-')));
        if (prev.c0 === 'find') {
          targets.push(...findRoots(pw)); findMode = true;
          for (const r of findRoots(pw)) if (!findHasFilter(pw) && !badDeleteTarget(r, proj, { findMode: true, cwd: prev.cwd }) && proj && path.resolve(prev.cwd || proj, expandVars(r, proj, prev.cwd)) === path.resolve(proj)) return { deny: true, reason: `find ${r} | xargs rm: 조건(-name 등) 없이 프로젝트 전체 삭제`, rule: 'rm-root' };
        }
        if (!['echo', 'printf', 'find'].includes(prev.c0) && recursive && !targets.length) return { deny: true, reason: '입력으로 받은 대상을 재귀 삭제(xargs rm) — 대상이 불확실', rule: 'rm-root' };
      }
      if (recursive) {
        for (const t of targets) {
          const why = badDeleteTarget(t, proj, { findMode, cwd: findMode ? prev.cwd : cwd });
          if (why) return { deny: true, reason: why, rule: why.startsWith('홈') ? 'rm-home' : 'rm-root' };
        }
      }
    }
    // find … -delete / -exec rm
    if (c0 === 'find' && findDeletes(w)) {
      for (const t of findRoots(w)) {
        const why = badDeleteTarget(t, proj, { findMode: true, cwd });
        if (why) return { deny: true, reason: why, rule: 'rm-root' };
        if (proj && !findHasFilter(w) && path.resolve(cwd || proj, expandVars(t, proj, cwd)) === path.resolve(proj)) return { deny: true, reason: `find ${t} -delete: 조건(-name 등) 없이 프로젝트 전체 삭제`, rule: 'rm-root' };
      }
    }

    // git (global options like -C dir / -c k=v are skipped to find the subcommand)
    if (c0 === 'git') {
      const si = gitSubIndex(w);
      for (let k = 1; k < (si > 0 ? si : w.length); k++) if (w[k] === '-c' && /^alias\./i.test(w[k + 1] || '')) return { deny: true, reason: 'git -c alias.*(별칭으로 명령 우회)', rule: 'git-alias' };
      const sub = si > 0 ? w[si] : null;
      if (sub === 'push') return { deny: true, reason: 'git push는 v0.1에서 비가역 작업(결정 큐로)', rule: 'git-push' };
      if (sub === 'tag' && w.slice(si + 1).some(t => !t.startsWith('-')) && !w.includes('-l') && !w.includes('--list')) return { deny: true, reason: 'git tag 생성은 사용자 승인 필요', rule: 'git-tag' };
      if (sub === 'config' && w.slice(si + 1).some((t, k, a) => /^alias\./i.test(t) && /\bpush\b/.test(a.slice(k + 1).join(' ')))) return { deny: true, reason: 'push 별칭 설정', rule: 'git-alias' };
    }
    if (c0 === 'gh') {
      const a = w.slice(1).join(' ');
      if (/^(release\s+(create|delete|edit)|pr\s+merge|repo\s+(delete|create|edit|rename|archive)|api\b.*(-X|--method)[=\s]*['"]?(POST|PUT|PATCH|DELETE))/i.test(a)) return { deny: true, reason: `외부 게시·변경(gh ${w[1]} ${w[2] || ''})`, rule: 'gh-publish' };
      if (/^repo\s+sync\b/.test(a) && /(^|\s)(--force|-f)(\s|$)/.test(a)) return { deny: true, reason: 'gh repo sync --force', rule: 'gh-publish' };
    }
    // publish / deploy
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(c0) && w.includes('publish')) return { deny: true, reason: '패키지 게시', rule: 'publish' };
    if (c0 === 'npx' && w.slice(1).some((t, k, a) => ['npm', 'pnpm', 'yarn'].includes(t) && a[k + 1] === 'publish')) return { deny: true, reason: '패키지 게시', rule: 'publish' };
    if (c0 === 'vercel' && (w.includes('--prod') || w.includes('deploy') || w.includes('promote') || w.length === 1)) return { deny: true, reason: '배포(vercel)', rule: 'deploy' };
    if (['netlify', 'firebase', 'fly', 'flyctl', 'heroku', 'railway', 'wrangler', 'serverless', 'sls'].includes(c0) && w.some(t => /^(deploy|publish|release)$/.test(t))) return { deny: true, reason: `배포(${c0})`, rule: 'deploy' };
    if (c0 === 'terraform' && w.some(t => ['apply', 'destroy'].includes(t))) return { deny: true, reason: 'terraform apply/destroy', rule: 'deploy' };
    if (c0 === 'kubectl' && w.some(t => ['apply', 'delete', 'replace', 'rollout'].includes(t))) return { deny: true, reason: 'kubectl 변경', rule: 'deploy' };
    if (c0 === 'docker' && w.includes('push')) return { deny: true, reason: 'docker push', rule: 'publish' };
    // DB: SQL in the segment of a DB client (text, heredoc, < file, -f file) or piped into one
    const isDbClient = w.some(t => DB_CLIENTS.includes(base(t)));
    const next = segs[i + 1];
    const pipesToDb = s.sep === '|' && next && next.words.some(t => DB_CLIENTS.includes(base(t)));
    if ((isDbClient || pipesToDb) && DB_DROP_RE.test(segmentSql(s, heredocs, proj))) return { deny: true, reason: 'DB 데이터 삭제(DROP/TRUNCATE)', rule: 'db-drop' };
    if (c0 === 'redis-cli' && w.some(t => /^flush(all|db)$/i.test(t))) return { deny: true, reason: 'redis FLUSH', rule: 'db-drop' };
    const joined = w.join(' ');
    if (/\bprisma\s+(migrate\s+(deploy|reset)|db\s+push)/.test(joined) || /\balembic\s+(upgrade|downgrade)\b/.test(joined) || /\b(db:drop|db:reset|migrate:fresh|migrate:reset)\b/.test(joined) || /\bsupabase\s+db\s+(push|reset)\b/.test(joined) || /\bknex\s+migrate:(latest|rollback)\b/.test(joined)) return { deny: true, reason: 'DB 마이그레이션 적용·초기화', rule: 'db-migrate' };
    // disk
    if (c0 === 'dd' && w.some(t => /^of=\/dev\//.test(t))) return { deny: true, reason: '디스크 직접 쓰기', rule: 'disk' };
    if (/^mkfs/.test(c0)) return { deny: true, reason: '파일시스템 포맷', rule: 'disk' };
    if (c0 === 'chmod' && w.includes('-R') && w.some(t => t === '/' || t === '~')) return { deny: true, reason: '루트·홈 권한 일괄 변경', rule: 'disk' };
    // secrets via redirect
    for (const t of redirectTargets(s.text)) {
      const rel = t.replace(/^\.\//, '');
      if (matchAny(rel, SECRET_GLOBS)) return { deny: true, reason: `비밀 파일 쓰기(${t})`, rule: 'secret-write' };
    }
    if (['tee', 'cp', 'mv'].includes(c0)) {
      const dst = w[w.length - 1];
      if (dst && matchAny(dst.replace(/^\.\//, ''), SECRET_GLOBS) && w.length > 1) return { deny: true, reason: `비밀 파일 쓰기(${dst})`, rule: 'secret-write' };
    }
  }
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
export const SCRIPT_EXT_RE = /\.(m?js|cjs|ts|mts|cts|py|sh|bash)$/i;
export function deleteTargetReason(t, proj) { return badDeleteTarget(t, proj, { cwd: proj }); }

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

const EXEC_CALL_RE = /\b(?:execSync|execFileSync|execFile|exec|spawnSync|spawn|fork|subprocess\.(?:run|call|check_call|check_output|Popen)|os\.system|os\.popen|Bun\.spawn(?:Sync)?|Deno\.Command)\s*\(\s*/g;
const RM_CALL_RE = /\b(?:fs\.|fsp\.|promises\.)?(rmSync|rmdirSync|rm|rmdir)\s*\(\s*|\bshutil\.rmtree\s*\(\s*/g;

// → { commands: [shell command strings], deletes: [{target, recursive}], writes: [literal paths] }
export function scanScript(content, rel) {
  const src = String(content || '');
  const res = { commands: [], deletes: [], writes: [] };
  if (/\.(sh|bash)$/i.test(rel)) { res.commands.push(src); return res; }
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
  RM_CALL_RE.lastIndex = 0;
  while ((m = RM_CALL_RE.exec(src))) {
    const lit = readLiteral(src, m.index + m[0].length); if (!lit) continue;
    const tail = src.slice(lit[1], lit[1] + 200);
    const recursive = /rmtree/.test(m[0]) || /^\s*,\s*\{[^}]*recursive\s*:\s*true/.test(tail);
    res.deletes.push({ target: lit[0], recursive });
  }
  res.writes.push(...codeWrites(src));
  return res;
}
