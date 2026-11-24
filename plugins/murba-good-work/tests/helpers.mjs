// Test helpers: run the REAL hook wrapper and CLI as child processes.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REAL = path.join(P, 'tests', 'fixtures', 'real');

export function tmpProj({ murba = true } = {}) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'murba-test-')));
  spawnSync('git', ['init', '-q'], { cwd: d });
  if (murba) murbaCli(d, ['init']);
  return d;
}

export function murbaCli(proj, args, { stdin = '', env = {} } = {}) {
  const r = spawnSync('node', [path.join(P, 'bin', 'murba'), ...args], {
    cwd: proj, input: stdin, encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: proj, MURBA_HEADLESS: '', CLAUDE_CODE_SESSION_ATTENDED: '', ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// Build an input from a real captured payload, overriding fields.
export function fixture(name, overrides = {}) {
  const base = JSON.parse(fs.readFileSync(path.join(REAL, name), 'utf8'));
  return { ...base, ...overrides };
}

export function runHook(hook, input, proj, env = {}) {
  const r = spawnSync('/bin/sh', [path.join(P, 'scripts', 'run-hook.sh'), hook], {
    cwd: proj, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: proj, ...env },
  });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { json = { _raw: r.stdout }; }
  return { code: r.status, out: r.stdout, err: r.stderr, json };
}

export function bash(proj, command, extra = {}) {
  return fixture('PreToolUse-0.json', { cwd: proj, tool_name: 'Bash', tool_input: { command, description: 't' }, ...extra });
}
export function tool(proj, tool_name, tool_input, extra = {}) {
  const f = fixture('PreToolUse-0.json', { cwd: proj, tool_name, tool_input, ...extra });
  return f;
}
export const sub = name => ({ agent_id: 'a1', agent_type: `murba-good-work:${name}` });

export const isDeny = r => !!(r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision === 'deny');
export const isBlock = r => !!(r.json && r.json.decision === 'block');

export function readState(proj) { return JSON.parse(fs.readFileSync(path.join(proj, '.murba', 'state.json'), 'utf8')); }
export function setState(proj, fn) {
  const p = path.join(proj, '.murba', 'state.json');
  const s = JSON.parse(fs.readFileSync(p, 'utf8')); fn(s); fs.writeFileSync(p, JSON.stringify(s));
  signState(proj);
}
// 테스트 준비용: state.json을 직접 고친 뒤 원장 해시를 맞춘다(CLI가 쓴 것처럼). 변조 테스트에서는 부르지 않는다
export function signState(proj) {
  const p = path.join(proj, '.murba', 'state.json');
  fs.writeFileSync(path.join(proj, '.murba', 'state.sha256'), crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') + '\n');
}
export function write(proj, rel, body = 'x') {
  const p = path.join(proj, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body);
  if (rel === '.murba/state.json') signState(proj);
}
