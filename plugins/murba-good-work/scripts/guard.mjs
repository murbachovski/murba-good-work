// PreToolUse guard: irreversible commands + agent_type path rules. Fail-closed.
import path from 'node:path';
import fs from 'node:fs';
import { PLUGIN_NAME, projectDir, readState, readStdin, appendEvent, appendDecision, logHook, murbaDir } from './lib/core.mjs';
import { analyzeBash, bashWriteTargets, toRel, isTestPath, isSecretPath, matchAny, DEFAULT_IMPL_GLOBS, splitSegments, tokenize, commandWords, murbaInvocations } from './lib/patterns.mjs';

// Ledger files: only the murba CLI changes them (Write/Edit and Bash writes are refused for everyone).
const isStateFile = rel => ['.murba/state.json', '.murba/events.jsonl', '.murba/decisions.tsv'].includes(rel) || rel === '.murba/logs' || rel.startsWith('.murba/logs/');
// `.murba/disable` is a human-only kill switch (create it outside Claude). Agents may not create it or remove `.murba` itself.
const isKillSwitch = rel => rel === '.murba/disable';
const isMurbaRoot = rel => rel === '.murba' || rel === '.murba/*' || rel === '.murba/**';
// murba subcommands a subagent may run (read-only). evaluator may also create an evidence run folder.
const MURBA_READONLY = ['status', 'check-tests', 'help', '--help', '-h'];

function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

function agentName(input) {
  const t = input.agent_type || '';
  const pre = PLUGIN_NAME + ':';
  return t.startsWith(pre) ? t.slice(pre.length) : null; // bare/other agents → not ours
}

function toolPaths(tool, ti) {
  const ps = [];
  if (!ti) return ps;
  for (const k of ['file_path', 'notebook_path', 'path']) if (typeof ti[k] === 'string') ps.push(ti[k]);
  if (tool === 'Glob' && typeof ti.pattern === 'string') ps.push(ti.pattern);
  if (tool === 'Grep' && typeof ti.glob === 'string') ps.push(ti.glob);
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && e.file_path) ps.push(e.file_path);
  return ps;
}

const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const READ_TOOLS = ['Read', 'Grep', 'Glob'];

function checkAgentRules(name, tool, ti, proj, st) {
  const self = name;
  const ownReports = `.murba/reports/${self}/`;
  const implGlobs = (st && st.impl_globs) || DEFAULT_IMPL_GLOBS;
  const rels = toolPaths(tool, ti).map(p => toRel(proj, p));
  const isWrite = WRITE_TOOLS.includes(tool);
  const isRead = READ_TOOLS.includes(tool);
  const allowedMurbaWrite = rel => rel.startsWith(ownReports) || (self === 'test-writer' && rel.startsWith('.murba/hidden/')) || (self === 'evaluator' && rel.startsWith('.murba/evidence/'));

  if (isWrite) {
    for (const rel of rels) {
      if (rel.startsWith('.murba/') && !allowedMurbaWrite(rel)) return `서브에이전트(${self})는 .murba/ 중 자기 보고 경로(${ownReports})에만 쓸 수 있음`;
      if (self === 'builder' && (isTestPath(rel) || /^\.claude\/settings/.test(rel))) return `builder는 테스트·러너 설정·보호 파일을 수정할 수 없음(${rel}). 실패한 AC는 구현으로 해결`;
      if (self === 'builder' && /(^|\/)package\.json$/.test(rel) && changesTestScript(proj, rel, tool, ti)) return 'builder는 package.json의 test 스크립트를 바꿀 수 없음';
      if (['evaluator', 'pr-reviewer', 'triage', 'spec-reviewer'].includes(self) && !rel.startsWith(ownReports) && !(self === 'evaluator' && rel.startsWith('.murba/evidence/'))) return `${self}는 코드를 수정하지 않음. 보고는 ${ownReports}에`;
    }
  }
  if (isRead && self === 'builder') {
    // .murba itself, anything under hidden, or a glob that names .murba (project-root search is fine: .murba/ is gitignored)
    const raw = toolPaths(tool, ti);
    for (const rel of rels) if (rel === '.murba' || rel.startsWith('.murba/hidden') || rel.startsWith('.murba/*')) return 'builder는 숨긴 검사에 접근할 수 없음';
    if (raw.some(p => /(^|\/)\.murba(\/|$)|\.murba\*|\*\*\/\.murba/.test(p) && !/\.murba\/(reports|handoff)\/[^*]+$/.test(p))) return 'builder는 숨긴 검사에 접근할 수 없음(.murba 검색)';
  }
  if (isRead && self === 'test-writer') {
    for (const rel of rels) if (rel && !isTestPath(rel) && matchAny(rel, implGlobs)) return `test-writer는 구현 코드를 읽지 않고 AC만 보고 테스트를 씀(${rel})`;
  }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    for (const args of murbaInvocations(cmd)) {
      const sc = args[0] || 'help';
      const ok = MURBA_READONLY.includes(sc) || (sc === 'budget' && !args.includes('--subagent')) || (sc === 'evidence-run' && self === 'evaluator');
      if (!ok) return `서브에이전트(${self})는 murba 상태 변경 명령(${sc})을 쓸 수 없음. 결과는 응답으로 보고`;
    }
    if (self === 'builder') {
      if (cmd.includes('.murba/hidden') || /\.murba\/h[^\s/]*\*/.test(cmd)) return 'builder는 숨긴 검사에 접근할 수 없음';
      const { segments } = splitSegments(cmd);
      for (const sg of segments) for (const t of commandWords(tokenize(sg.text)).slice(1)) {
        const rel = toRel(proj, t);
        if (rel === '.murba' || rel === '.murba/*') return 'builder는 숨긴 검사에 접근할 수 없음(.murba 탐색)';
      }
    }
    const targets = bashWriteTargets(cmd).map(t => toRel(proj, t));
    for (const rel of targets) {
      if (rel.startsWith('.murba/') && !allowedMurbaWrite(rel)) return `서브에이전트(${self})는 .murba/ 중 자기 보고 경로에만 쓸 수 있음(${rel})`;
      if (self === 'builder' && isTestPath(rel)) return `builder는 테스트·러너 설정을 수정할 수 없음(${rel})`;
      if (['evaluator', 'pr-reviewer'].includes(self) && !rel.startsWith('.murba/') && !rel.startsWith('..') && !path.isAbsolute(rel)) return `${self}는 코드를 수정하지 않음(${rel})`;
    }
    if (self === 'builder' && /\b(npm|pnpm|yarn)\s+pkg\s+set\s+scripts\.test/.test(cmd)) return 'builder는 test 스크립트를 바꿀 수 없음';
  }
  return null;
}

function main() {
  const raw = readStdin();
  const input = JSON.parse(raw); // parse error → catch → deny (fail-closed)
  const proj = projectDir(input);
  if (!fs.existsSync(murbaDir(proj)) || fs.existsSync(path.join(murbaDir(proj), 'disable'))) process.exit(0);
  const st = readState(proj) || {};
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const name = agentName(input);
  const phase = st.phase || '?';

  const block = (reason, rule, cls) => {
    logHook(proj, 'guard', 'blocked', { tool, rule, agent: input.agent_type || 'main', reason });
    appendEvent(proj, 'guard_deny', { tool, rule, agent: input.agent_type || 'main', reason });
    if (cls) appendDecision(proj, { phase, cls, decision: `차단됨: ${reason}`, why: `guard 규칙 ${rule}`, evidence: tool === 'Bash' ? String(ti.command).slice(0, 200) : toolPaths(tool, ti).join(','), cost: '사용자가 승인하면 수동 실행' });
    deny(`[murba guard] ${reason}. 이 작업은 하지 말고 다른 작업을 계속하세요.` + (cls ? ' 결정 큐에 기록됨.' : ''));
  };

  // 1) irreversible commands — everyone
  if (tool === 'Bash') {
    const r = analyzeBash(ti.command, proj);
    if (r) block(r.reason, r.rule, 'irreversible');
  }
  // 2) secrets, ledger files, kill switch — everyone
  if (WRITE_TOOLS.includes(tool)) {
    for (const p of toolPaths(tool, ti)) {
      const rel = toRel(proj, p);
      if (isSecretPath(rel)) block(`비밀 파일 쓰기(${rel})`, 'secret-write', 'irreversible');
      if (isStateFile(rel)) block(`${rel}은 murba CLI로만 변경`, 'state-file', null);
      if (isKillSwitch(rel)) block('.murba/disable은 사람만 만든다', 'kill-switch', null);
    }
  }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    for (const t of bashWriteTargets(cmd)) {
      const rel = toRel(proj, t);
      if (isStateFile(rel)) block(`${rel}은 murba CLI로만 변경(Bash 쓰기 금지)`, 'state-file', null);
      if (isKillSwitch(rel)) block('.murba/disable은 사람만 만든다', 'kill-switch', null);
    }
    // removing/moving/copying over the .murba folder itself
    const { segments } = splitSegments(cmd);
    for (const sg of segments) {
      const w = commandWords(tokenize(sg.text));
      const c0 = (w[0] || '').split('/').pop();
      const args = w.slice(1).filter(x => !x.startsWith('-'));
      let check = [];
      if (['rm', 'mv', 'rsync', 'rmdir', 'unlink'].includes(c0)) check = args;
      else if (['cp', 'ln'].includes(c0)) check = args.slice(-1);
      else if (c0 === 'find' && (w.includes('-delete') || w.includes('-exec') || w.includes('-execdir'))) check = args;
      for (const t of check) {
        const rel = toRel(proj, t);
        if (isMurbaRoot(rel) || isKillSwitch(rel)) block(`.murba 폴더 자체를 지우거나 옮길 수 없음(${t})`, 'murba-root', null);
      }
    }
    // interactive approval needs a human click
    if (!name && st.mode !== 'headless' && murbaInvocations(cmd).some(a => a[0] === 'approve')) {
      logHook(proj, 'guard', 'ask', { tool, rule: 'approve-human' });
      ask('[murba guard] 기획서 승인은 사람이 확인합니다. 기획서·AC 요약을 보고 승인하려면 허용하세요.');
    }
  }
  // 3) agent rules
  if (name) {
    const r = checkAgentRules(name, tool, ti, proj, st);
    if (r) block(r, `agent:${name}`, null);
  }
  logHook(proj, 'guard', 'released', { tool, agent: input.agent_type || 'main' });
  process.exit(0);
}

try { main(); } catch (e) {
  try { logHook(projectDir(null), 'guard', 'error', { error: String(e && e.message || e) }); } catch {}
  deny(`[murba guard] 검사 오류로 차단(fail-closed): ${String(e && e.message || e).slice(0, 200)}`);
}

// package.json의 scripts.test(및 test:*)가 바뀌는 편집인지. 판단 불가면 true(차단 쪽)
function changesTestScript(proj, rel, tool, ti) {
  const testKeys = j => { const sc = (j && j.scripts) || {}; return JSON.stringify(Object.keys(sc).filter(k => k === 'test' || k.startsWith('test:')).sort().map(k => [k, sc[k]])); };
  let cur = null; try { cur = JSON.parse(fs.readFileSync(path.join(proj, rel), 'utf8')); } catch { cur = null; }
  if (tool === 'Write') { try { return testKeys(JSON.parse(ti.content || '')) !== testKeys(cur); } catch { return true; } }
  const edits = tool === 'MultiEdit' ? (ti.edits || []) : [ti];
  return edits.some(e => /"test(:[^"]*)?"\s*:/.test(String(e.old_string || '')) || /"test(:[^"]*)?"\s*:/.test(String(e.new_string || '')));
}
