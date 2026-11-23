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

// Read-modify-write state under lock. mutator returns nothing (mutates) or a new object.
export function updateState(proj, mutator) {
  return withLock(proj, () => {
    const st = readState(proj);
    if (!st) throw new Error('state.json missing — run `murba init`');
    const r = mutator(st);
    const out = r === undefined ? st : r;
    writeJsonAtomic(statePath(proj), out);
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
      const ac = st.current_ac && st.ac[st.current_ac];
      if (!ac || (!ac.held && (!ac.verdicts || !ac.verdicts.length))) miss.push(`판정(murba ac verdict ${st.current_ac || '<AC>'})`);
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
