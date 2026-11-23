// Path patterns and Bash command analysis for the guard.
import path from 'node:path';

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

export function toRel(proj, p) {
  if (!p) return '';
  const abs = path.isAbsolute(p) ? p : path.join(proj, p);
  const rel = path.relative(proj, path.normalize(abs));
  return rel.split(path.sep).join('/');
}

export const isTestPath = rel => matchAny(rel, TEST_GLOBS);
export const isSecretPath = rel => matchAny(rel, SECRET_GLOBS);

// Split a shell command into segments on ; && || | and newlines, respecting quotes.
// Heredoc bodies are removed (they are data) but recorded.
export function splitSegments(cmd) {
  const heredocs = [];
  // Extract heredoc bodies: <<[-]['"]?TAG['"]? ... \nTAG
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

// Strip leading env assignments and wrappers (sudo, env, command, nohup, time, xargs)
export function commandWords(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
    if (['sudo', 'env', 'command', 'nohup', 'time', 'exec', 'nice'].includes(t)) { i++; while (tokens[i] && tokens[i].startsWith('-')) i++; continue; }
    break;
  }
  return tokens.slice(i);
}

const SHELLS = ['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish'];
const base = t => (t || '').split('/').pop();

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

const DANGEROUS_RM_TARGETS = new Set(['/', '/*', '~', '~/', '~/*', '$HOME', '${HOME}', '$HOME/', '$HOME/*', '.', './', '..', '../', '*', '/Users', '/home', '/etc', '/usr', '/var', '/System', '/bin', '/opt', '/Library', '/private', '/root']);

function isTmpPath(t) { return /^(\/tmp|\/private\/tmp|\/var\/folders|\$TMPDIR|\$\{TMPDIR\})(\/|$)/.test(t); }
function isArtifact(t) {
  const parts = t.replace(/\/+$/, '').split('/');
  return parts.some(p => ARTIFACT_NAMES.includes(p));
}

// Returns {deny:true, reason, cls} or null. Irreversible / obfuscation rules (apply to every agent).
export function analyzeBash(cmd) {
  const raw = String(cmd || '');
  if (/\$\{IFS\}|\$IFS\b/.test(raw)) return { deny: true, reason: '난독화된 명령(${IFS})', rule: 'obfuscation' };
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(raw)) return { deny: true, reason: 'fork bomb', rule: 'obfuscation' };
  const { segments, heredocs } = splitSegments(raw);

  // heredoc feeding a shell interpreter
  for (const s of segments) {
    const w = commandWords(tokenize(s.text));
    if (/<</.test(s.text) && w.length && (SHELLS.includes(base(w[0])) || base(w[0]) === 'eval')) return { deny: true, reason: 'heredoc을 셸로 실행', rule: 'obfuscation' };
  }

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const tokens = tokenize(s.text);
    const w = commandWords(tokens);
    if (!w.length) continue;
    const c0 = base(w[0]);
    const prev = segments[i - 1];
    const pipedIn = prev && prev.sep === '|';

    // piping into a shell or eval
    if (pipedIn && (SHELLS.includes(c0) || c0 === 'eval')) {
      const pw = commandWords(tokenize(prev.text));
      const p0 = base(pw[0]);
      if (['curl', 'wget'].includes(p0)) return { deny: true, reason: '원격 스크립트를 셸로 실행(curl|sh)', rule: 'remote-exec' };
      if (p0 === 'base64' || /base64\s+(-d|--decode|-D)/.test(prev.text) || ['xxd', 'openssl', 'printf', 'echo'].includes(p0)) return { deny: true, reason: '디코딩한 내용을 셸로 실행', rule: 'obfuscation' };
      return { deny: true, reason: '파이프 입력을 셸로 실행', rule: 'obfuscation' };
    }
    if (c0 === 'eval' && /base64|\\x[0-9a-f]{2}/i.test(s.text)) return { deny: true, reason: 'eval 난독화', rule: 'obfuscation' };
    if (SHELLS.includes(c0) && w.includes('-c') && /base64|\$\(.*curl|\\x[0-9a-f]{2}/i.test(s.text)) return { deny: true, reason: '셸 -c 난독화', rule: 'obfuscation' };
    if (SHELLS.includes(c0) && w.includes('-c')) {
      const inner = w[w.indexOf('-c') + 1];
      if (inner) { const r = analyzeBash(inner); if (r && r.deny) return { ...r, reason: `${c0} -c 안: ${r.reason}` }; }
    }

    // rm
    if (c0 === 'rm') {
      const flags = w.slice(1).filter(t => t.startsWith('-'));
      const recursive = flags.some(f => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive');
      const targets = w.slice(1).filter(t => !t.startsWith('-'));
      if (recursive) {
        for (const t of targets) {
          const tn = t.replace(/\/+$/, '') || '/';
          if (DANGEROUS_RM_TARGETS.has(t) || DANGEROUS_RM_TARGETS.has(tn) || /^~\/?$/.test(t) || /^\/[^/]*\/?\*?$/.test(t) && !isTmpPath(t)) {
            if (isTmpPath(t) || isArtifact(t)) continue;
            return { deny: true, reason: `루트·홈·시스템 경로 재귀 삭제(rm ${t})`, rule: 'rm-root' };
          }
          if (/^(\$HOME|~)\//.test(t) && !isArtifact(t)) return { deny: true, reason: `홈 디렉터리 하위 재귀 삭제(rm ${t})`, rule: 'rm-home' };
        }
      }
    }

    // git
    if (c0 === 'git') {
      const sub = w.slice(1).find(t => !t.startsWith('-'));
      if (sub === 'push') return { deny: true, reason: 'git push는 v0.1에서 비가역 작업(결정 큐로)', rule: 'git-push' };
      if (sub === 'tag' && w.slice(2).some(t => !t.startsWith('-')) && !w.includes('-l') && !w.includes('--list')) return { deny: true, reason: 'git tag 생성은 사용자 승인 필요', rule: 'git-tag' };
    }
    if (c0 === 'gh') {
      const a = w.slice(1).join(' ');
      if (/^(release\s+(create|delete|edit)|pr\s+merge|repo\s+(delete|create|edit|rename|archive)|api\b.*-X\s*(POST|PUT|PATCH|DELETE)|api\b.*--method\s*(POST|PUT|PATCH|DELETE))/i.test(a)) return { deny: true, reason: `외부 게시·변경(gh ${w[1]} ${w[2] || ''})`, rule: 'gh-publish' };
    }
    // publish / deploy
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(c0) && w.includes('publish')) return { deny: true, reason: '패키지 게시', rule: 'publish' };
    if (c0 === 'vercel' && (w.includes('--prod') || w.includes('deploy') || w.includes('promote') || w.length === 1)) return { deny: true, reason: '배포(vercel)', rule: 'deploy' };
    if (['netlify', 'firebase', 'fly', 'flyctl', 'heroku', 'railway', 'wrangler', 'serverless', 'sls'].includes(c0) && w.some(t => /^(deploy|publish|release)$/.test(t))) return { deny: true, reason: `배포(${c0})`, rule: 'deploy' };
    if (c0 === 'terraform' && w.some(t => ['apply', 'destroy'].includes(t))) return { deny: true, reason: 'terraform apply/destroy', rule: 'deploy' };
    if (c0 === 'kubectl' && w.some(t => ['apply', 'delete', 'replace', 'rollout'].includes(t))) return { deny: true, reason: 'kubectl 변경', rule: 'deploy' };
    if (c0 === 'docker' && w.includes('push')) return { deny: true, reason: 'docker push', rule: 'publish' };
    // DB
    const DB_CLIENTS = ['psql', 'mysql', 'sqlite3', 'mongosh', 'mongo', 'redis-cli', 'mariadb', 'duckdb'];
    if (/\b(drop\s+(table|database|schema)|truncate\s+(table\s+)?\w)/i.test(s.text)) {
      const nextSeg = segments[i + 1];
      const nextCmd = nextSeg && s.sep === '|' ? base(commandWords(tokenize(nextSeg.text))[0]) : '';
      if (DB_CLIENTS.includes(c0) || (['echo', 'printf', 'cat'].includes(c0) && DB_CLIENTS.includes(nextCmd))) return { deny: true, reason: 'DB 데이터 삭제(DROP/TRUNCATE)', rule: 'db-drop' };
    }
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

// Paths a Bash command writes to (best effort): redirects, tee, sed -i, cp/mv dest, rm targets, touch, mkdir excluded.
export function bashWriteTargets(cmd) {
  const { segments } = splitSegments(String(cmd || ''));
  const out = [];
  for (const s of segments) {
    out.push(...redirectTargets(s.text));
    const w = commandWords(tokenize(s.text));
    if (!w.length) continue;
    const c0 = base(w[0]);
    const args = w.slice(1).filter(t => !t.startsWith('-'));
    if (c0 === 'tee') out.push(...args);
    if (c0 === 'sed' && w.some(t => /^-i/.test(t) || t === '--in-place')) out.push(...args.slice(1));
    if (c0 === 'perl' && w.some(t => /^-[a-z]*i/.test(t))) out.push(...args.slice(1));
    if (['cp', 'mv', 'install', 'ln'].includes(c0) && args.length >= 2) out.push(args[args.length - 1]);
    if (['rm', 'unlink', 'truncate', 'touch'].includes(c0)) out.push(...args);
    if (c0 === 'git' && ['checkout', 'restore'].includes(w[1])) out.push(...args.slice(1));
  }
  return out;
}

export function bashMentions(cmd, needle) { return String(cmd || '').includes(needle); }
