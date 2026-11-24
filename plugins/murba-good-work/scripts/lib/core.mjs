// Shared core for murba-good-work: paths, state (lock + atomic write), events, decisions, logs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PLUGIN_NAME = 'murba-good-work';
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readJsonFile(p, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

export const MACHINE = readJsonFile(path.join(PLUGIN_ROOT, 'assets', 'state-machine.json'));

export function pluginVersion() {
  const m = readJsonFile(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), {});
  return m.version || '0.0.0';
}

export function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
}

export function murbaDir(proj) { return path.join(proj, '.murba'); }
export function statePath(proj) { return path.join(murbaDir(proj), 'state.json'); }

export function isHeadless() {
  return process.env.MURBA_HEADLESS === '1' || process.env.CLAUDE_CODE_SESSION_ATTENDED === '0';
}

export function nowIso() { return new Date().toISOString(); }

export function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
export function sha256Text(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

export function readState(proj) { return readJsonFile(statePath(proj)); }

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// Lock via mkdir (atomic). Stale locks (>10s) are broken.
export function withLock(proj, fn) {
  const lock = path.join(murbaDir(proj), '.lock');
  const start = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > 10000) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      } catch { continue; }
      if (Date.now() - start > 5000) throw new Error('state lock timeout');
      sleepSync(25);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

export function writeJsonAtomic(p, obj) {
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

// 원장 무결성: CLI·hook이 쓴 state.json의 sha256을 .murba/state.sha256에 둔다.
// 다른 경로(sed·리디렉션 등)로 state.json이 바뀌면 해시가 어긋난다 → LEDGER_TAMPERED
export function stateShaPath(proj) { return path.join(murbaDir(proj), 'state.sha256'); }
export function ledgerTampered(proj) {
  const sp = stateShaPath(proj), p = statePath(proj);
  if (!fs.existsSync(p)) return false;
  if (!fs.existsSync(sp)) {
    // init이 ledger_hash:true를 남긴 원장인데 해시 파일이 없으면 변조(지운 뒤 고쳐 쓰기). 표시 없는 옛 원장은 해시 없음 허용
    try { return JSON.parse(fs.readFileSync(p, 'utf8')).ledger_hash === true; } catch { return true; }
  }
  return fs.readFileSync(sp, 'utf8').trim() !== sha256File(p);
}
// state를 쓰고 해시를 갱신. 이미 변조된 원장이면 해시를 갱신하지 않는다(변조를 덮어 합법화하지 않음)
export function writeState(proj, obj, { fresh = false } = {}) {
  const tampered = !fresh && ledgerTampered(proj);
  writeJsonAtomic(statePath(proj), obj);
  if (!tampered) {
    const tmp = `${stateShaPath(proj)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, sha256File(statePath(proj)) + '\n');
    fs.renameSync(tmp, stateShaPath(proj));
  }
}

// Read-modify-write state under lock. mutator returns nothing (mutates) or a new object.
export function updateState(proj, mutator) {
  return withLock(proj, () => {
    const st = readState(proj);
    if (!st) throw new Error('state.json missing — run `murba init`');
    const r = mutator(st);
    const out = r === undefined ? st : r;
    writeState(proj, out);
    return out;
  });
}

function appendLine(p, line) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, line + '\n');
}

export function appendEvent(proj, kind, data = {}) {
  appendLine(path.join(murbaDir(proj), 'events.jsonl'), JSON.stringify({ ts: nowIso(), kind, ...data }));
}

export function logHook(proj, hook, event, data = {}) {
  try {
    appendLine(path.join(murbaDir(proj), 'logs', 'hooks.jsonl'), JSON.stringify({ ts: nowIso(), hook, event, ...data }));
  } catch { /* logging must never break a hook */ }
}

export const DECISION_CLASSES = ['mechanical', 'taste', 'user-direction', 'irreversible'];
export const DECISION_HEADER = ['ts', 'phase', 'class', 'decision', 'why', 'evidence', 'cost_if_wrong'];

export function tsvCell(v) {
  let s = String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

export function appendDecision(proj, { phase, cls, decision, why = '', evidence = '', cost = '' }) {
  const p = path.join(murbaDir(proj), 'decisions.tsv');
  if (!fs.existsSync(p)) appendLine(p, DECISION_HEADER.join('\t'));
  appendLine(p, [nowIso(), phase, cls, decision, why, evidence, cost].map(tsvCell).join('\t'));
}

export function readDecisions(proj) {
  const p = path.join(murbaDir(proj), 'decisions.tsv');
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  return lines.slice(1).map(l => {
    const c = l.split('\t');
    return Object.fromEntries(DECISION_HEADER.map((k, i) => [k, c[i] ?? '']));
  });
}

export function readEvents(proj) {
  const p = path.join(murbaDir(proj), 'events.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// ---- requirement checks shared by CLI and stop-gate ----
export function lastVerdict(ac) { return ac && ac.verdicts && ac.verdicts.length ? ac.verdicts[ac.verdicts.length - 1].verdict : null; }

export function nonHeldAcs(st) { return (st.ac_order || []).filter(id => st.ac[id] && !st.ac[id].held); }

function latestEvidenceRun(proj) {
  const d = path.join(murbaDir(proj), 'evidence');
  if (!fs.existsSync(d)) return null;
  const runs = fs.readdirSync(d).filter(n => n.startsWith('run-')).sort();
  return runs.length ? path.join(d, runs[runs.length - 1]) : null;
}

export function missingRequires(proj, st, phase = st.phase) {
  const def = MACHINE.phases[phase];
  if (!def) return [`unknown phase ${phase}`];
  const miss = [];
  for (const r of def.requires) {
    if (!r.startsWith('@')) {
      if (!fs.existsSync(path.join(murbaDir(proj), r))) miss.push(r);
      continue;
    }
    if (r === '@approved' && !st.approved) miss.push('승인(murba approve)');
    if (r === '@test_hashes' && !Object.keys(st.test_hashes || {}).length) miss.push('테스트 해시(murba lock-tests)');
    if (r === '@current_ac_verdict') {
      if (!st.current_ac) {
        // after `murba ac next` exhausted the queue: satisfied when every non-held AC has a verdict
        const noVerdict = nonHeldAcs(st).filter(id => !st.ac[id].verdicts || !st.ac[id].verdicts.length);
        if (noVerdict.length) miss.push(`판정 없는 AC: ${noVerdict.join(',')}`);
      } else {
        const ac = st.ac[st.current_ac];
        if (!ac || (!ac.held && (!ac.verdicts || !ac.verdicts.length))) miss.push(`판정(murba ac verdict ${st.current_ac})`);
      }
    }
    if (r === '@final_verdicts') {
      const bad = nonHeldAcs(st).filter(id => !st.ac[id].final_verdict || st.ac[id].final_verdict.sha !== st.final_sha);
      if (!st.final_sha || bad.length) miss.push(`최종 판정(--final) 누락: ${bad.join(',') || 'final_sha'}`);
    }
    if (r === '@browser_evidence') {
      const run = latestEvidenceRun(proj);
      const need = nonHeldAcs(st).filter(id => st.ac[id].browser);
      const lack = need.filter(id => !run || !fs.existsSync(path.join(run, `${id}.png`)));
      if (lack.length) miss.push(`브라우저 증거 누락: ${lack.join(',')}`);
    }
  }
  return miss;
}

// The orchestrator's next action hint for a phase.
export function nextActionHint(st) {
  const def = MACHINE.phases[st.phase];
  if (!def) return '';
  const nx = def.next.join(' | ') || '(끝)';
  return `phase=${st.phase} (${def.flow}, 담당 ${def.owner}) → 조건 충족 후 \`murba phase <${nx}>\``;
}

// Linear default order used by `murba phase <target> --skip` (fix is a loop, not on the chain).
export const CHAIN = MACHINE.chain || ['triage', 'grill', 'spec-review', 'revise', 'approve', 'setup', 'test-write', 'build', 'evaluate', 'qa', 'browser', 'report', 'done'];

// Question-ending detector for headless stop gate.
export function endsWithQuestion(msg) {
  const tail = String(msg || '').replace(/[\s*_`>|]+$/g, '').slice(-300);
  if (/[?？]$/.test(tail)) return true;
  const last = tail.split('\n').filter(l => l.trim()).slice(-3).join('\n');
  return /(알려\s*주세요|알려\s*주시면|선택해\s*주세요|골라\s*주세요|말씀해\s*주세요|정해\s*주세요|승인해\s*주세요|할까요|하시겠습니까|원하시나요|어느 쪽|which (one|option)|would you like|let me know|please (choose|confirm)|\bA\s*\/\s*B(\s*\/\s*C)?\b|A, B, C 중)/i.test(last);
}

