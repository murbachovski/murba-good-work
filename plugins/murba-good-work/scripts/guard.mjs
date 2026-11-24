// PreToolUse guard: irreversible commands + agent_type path rules. Fail-closed.
// Threat model (ADR 0003): safety net for a cooperative model, not a sandbox. See scripts/lib/patterns.mjs header.
import path from 'node:path';
import fs from 'node:fs';
import { PLUGIN_NAME, projectDir, readState, readStdin, appendEvent, appendDecision, logHook, murbaDir } from './lib/core.mjs';
import { analyzeBash, bashWriteRels, bashPathArgs, canonRel, pathVariants, relIs, relUnder, hasGlob, walkSegments, findNamePatterns, findDeletes, findRoots, SCRIPT_EXT_RE, scanScript, deleteTargetReason, isTestPath, isSecretPath, matchAny, DEFAULT_IMPL_GLOBS, murbaInvocations } from './lib/patterns.mjs';

// Ledger files: only the murba CLI (and this guard, for `caller`) changes them. Write/Edit and Bash writes are refused for everyone.
const LEDGER = ['.murba/state.json', '.murba/events.jsonl', '.murba/decisions.tsv', '.murba/caller', '.murba/state.sha256'];
const isStateFile = rel => LEDGER.some(c => relIs(rel, c)) || relUnder(rel, '.murba/logs');
const isMurbaRoot = rel => relIs(rel, '.murba') || rel === '.murba/*' || rel === '.murba/**';
// murba subcommands a subagent may run (read-only). evaluator may also create an evidence run folder.
const MURBA_READONLY = ['status', 'check-tests', 'help', '--help', '-h'];

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
}
const ask = reason => decide('ask', reason);
const deny = reason => decide('deny', reason);

function agentName(input) {
  const t = input.agent_type || '';
  const pre = PLUGIN_NAME + ':';
  return t.startsWith(pre) ? t.slice(pre.length) : null; // bare/other agents → not ours
}

// Caller marker for the CLI: which agent issued the current tool call. Atomic (tmp + rename).
function writeCaller(proj, input) {
  const p = path.join(murbaDir(proj), 'caller');
  const tmp = `${p}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, String(input.agent_type || 'main')); fs.renameSync(tmp, p); } catch { try { fs.unlinkSync(tmp); } catch {} }
}

// Concrete paths a file tool touches, as canonical rels (globs kept as patterns; Glob/Grep patterns joined to their base path)
function toolRels(proj, tool, ti) {
  const out = [];
  if (!ti) return out;
  for (const k of ['file_path', 'notebook_path', 'path']) if (typeof ti[k] === 'string') out.push(...pathVariants(proj, ti[k]));
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && e.file_path) out.push(...pathVariants(proj, e.file_path));
  const baseDir = typeof ti.path === 'string' ? ti.path : '.';
  const pat = tool === 'Glob' ? ti.pattern : tool === 'Grep' ? ti.glob : null;
  if (typeof pat === 'string') out.push(...pathVariants(proj, path.isAbsolute(pat) ? pat : path.join(baseDir, pat)));
  return out;
}

const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const READ_TOOLS = ['Read', 'Grep', 'Glob'];

// builder may read its own handoff/report files under .murba, nothing else there
const builderMurbaOk = rel => !hasGlob(rel) && /^\.murba\/(reports|handoff)\/[^/]/.test(rel);

function checkAgentRules(name, tool, ti, proj, st) {
  const self = name;
  const ownReports = `.murba/reports/${self}/`;
  const implGlobs = (st && st.impl_globs) || DEFAULT_IMPL_GLOBS;
  const rels = toolRels(proj, tool, ti);
  const isWrite = WRITE_TOOLS.includes(tool);
  const isRead = READ_TOOLS.includes(tool);
  const allowedMurbaWrite = rel => rel.startsWith(ownReports) || (self === 'test-writer' && rel.startsWith('.murba/hidden/')) || (self === 'evaluator' && rel.startsWith('.murba/evidence/'));

  if (isWrite) {
    for (const rel of rels) {
      if (relUnder(rel, '.murba') && !allowedMurbaWrite(rel)) return `서브에이전트(${self})는 .murba/ 중 자기 보고 경로(${ownReports})에만 쓸 수 있음`;
      if (self === 'builder' && (isTestPath(rel) || /^\.claude\/settings/.test(rel))) return `builder는 테스트·러너 설정·보호 파일을 수정할 수 없음(${rel}). 실패한 AC는 구현으로 해결`;
      if (self === 'builder' && /(^|\/)package\.json$/.test(rel) && changesTestScript(proj, rel, tool, ti)) return 'builder는 package.json의 test 스크립트를 바꿀 수 없음';
      if (['evaluator', 'pr-reviewer', 'triage', 'spec-reviewer'].includes(self) && !rel.startsWith(ownReports) && !(self === 'evaluator' && rel.startsWith('.murba/evidence/'))) return `${self}는 코드를 수정하지 않음. 보고는 ${ownReports}에`;
    }
  }
  if (isRead && self === 'builder') {
    // .murba itself, anything under it except handoff/reports, or a glob/brace that can reach it (root search is fine: .murba/ is gitignored)
    for (const rel of rels) if (relUnder(rel, '.murba') && !builderMurbaOk(rel)) return relUnder(rel, '.murba/hidden') || relIs(rel, '.murba') ? 'builder는 숨긴 검사에 접근할 수 없음' : 'builder는 숨긴 검사에 접근할 수 없음(.murba 검색)';
  }
  if (isRead && self === 'test-writer') {
    for (const rel of rels) if (rel && !hasGlob(rel) && !isTestPath(rel) && matchAny(rel, implGlobs)) return `test-writer는 구현 코드를 읽지 않고 AC만 보고 테스트를 씀(${rel})`;
  }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    for (const args of murbaInvocations(cmd)) {
      const sc = args[0] || 'help';
      const ok = MURBA_READONLY.includes(sc) || (sc === 'budget' && !args.includes('--subagent')) || (sc === 'evidence-run' && self === 'evaluator');
      if (!ok) return `서브에이전트(${self})는 murba 상태 변경 명령(${sc})을 쓸 수 없음. 결과는 응답으로 보고`;
    }
    if (self === 'builder') {
      if (cmd.includes('.murba/hidden')) return 'builder는 숨긴 검사에 접근할 수 없음';
      for (const rel of bashPathArgs(cmd, proj)) {
        if (relIs(rel, '.murba') || relUnder(rel, '.murba/hidden')) return 'builder는 숨긴 검사에 접근할 수 없음(.murba 탐색)';
      }
      const { segs } = walkSegments(cmd, proj);
      for (const s of segs) {
        if (['npm', 'pnpm', 'yarn'].includes(s.c0) && s.words.includes('pkg') && s.words.some(t => ['set', 'delete'].includes(t))) {
          if (s.words.some(t => /^scripts\.test/.test(t.split('=')[0]))) return 'builder는 test 스크립트를 바꿀 수 없음';
        }
      }
    }
    for (const rel of bashWriteRels(cmd, proj)) {
      if (relUnder(rel, '.murba') && !allowedMurbaWrite(rel)) return `서브에이전트(${self})는 .murba/ 중 자기 보고 경로에만 쓸 수 있음(${rel})`;
      if (self === 'builder' && isTestPath(rel)) return `builder는 테스트·러너 설정을 수정할 수 없음(${rel})`;
      if (['evaluator', 'pr-reviewer'].includes(self) && !rel.startsWith('.murba/') && !rel.startsWith('..') && !path.isAbsolute(rel)) return `${self}는 코드를 수정하지 않음(${rel})`;
    }
  }
  return null;
}

function main() {
  if (process.env.MURBA_DISABLE === '1') process.exit(0); // human kill switch, set at launch
  const raw = readStdin();
  const input = JSON.parse(raw); // parse error → catch → deny (fail-closed)
  const proj = projectDir(input);
  if (!fs.existsSync(murbaDir(proj))) process.exit(0);
  writeCaller(proj, input);
  const st = readState(proj) || {};
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const name = agentName(input);
  const phase = st.phase || '?';

  const block = (reason, rule, cls) => {
    logHook(proj, 'guard', 'blocked', { tool, rule, agent: input.agent_type || 'main', reason });
    appendEvent(proj, 'guard_deny', { tool, rule, agent: input.agent_type || 'main', reason });
    if (cls) appendDecision(proj, { phase, cls, decision: `차단됨: ${reason}`, why: `guard 규칙 ${rule}`, evidence: tool === 'Bash' ? String(ti.command).slice(0, 200) : toolRels(proj, tool, ti).join(','), cost: '사용자가 승인하면 수동 실행' });
    deny(`[murba guard] ${reason}. 이 작업은 하지 말고 다른 작업을 계속하세요.` + (cls ? ' 결정 큐에 기록됨.' : ''));
  };

  // 1) irreversible commands — everyone
  if (tool === 'Bash') {
    const r = analyzeBash(ti.command, proj);
    if (r) block(r.reason, r.rule, 'irreversible');
  }
  // 2) secrets, ledger files — everyone
  if (WRITE_TOOLS.includes(tool)) {
    for (const rel of toolRels(proj, tool, ti)) {
      if (isSecretPath(rel)) block(`비밀 파일 쓰기(${rel})`, 'secret-write', 'irreversible');
      if (isStateFile(rel)) block(`${rel}은 murba CLI로만 변경`, 'state-file', null);
    }
    // script files: literal commands / recursive deletes / ledger writes inside the new content
    const bodies = tool === 'Write' ? [ti.content] : tool === 'MultiEdit' ? (ti.edits || []).map(e => e && e.new_string) : [ti.new_string];
    for (const rel of toolRels(proj, tool, ti)) {
      if (!SCRIPT_EXT_RE.test(rel)) continue;
      for (const body of bodies) {
        if (!body) continue;
        const sc = scanScript(body, rel);
        for (const c of sc.commands) {
          const r = analyzeBash(c, proj);
          if (r) block(`스크립트(${rel}) 안 명령: ${r.reason}`, r.rule, 'irreversible');
          for (const w of bashWriteRels(c, proj)) if (isStateFile(w) || isMurbaRoot(w)) block(`스크립트(${rel}) 안 명령이 ${w}을 바꿈 — murba CLI로만 변경`, 'state-file', null);
        }
        for (const d of sc.deletes) {
          const why = d.recursive ? deleteTargetReason(d.target, proj) : null;
          if (why) block(`스크립트(${rel}) 안: ${why}`, 'rm-root', 'irreversible');
          if (pathVariants(proj, d.target).some(isMurbaRoot)) block(`스크립트(${rel})가 .murba 폴더를 지움`, 'murba-root', null);
        }
        for (const w of sc.writes) for (const v of pathVariants(proj, w)) if (isStateFile(v)) block(`스크립트(${rel})가 ${v}을 씀 — murba CLI로만 변경`, 'state-file', null);
      }
    }
  }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    for (const rel of bashWriteRels(cmd, proj)) {
      if (isStateFile(rel)) block(`${rel}은 murba CLI로만 변경(Bash 쓰기 금지)`, 'state-file', null);
    }
    // removing/moving/copying over the .murba folder itself (globs and braces included)
    const { segs } = walkSegments(cmd, proj);
    for (const s of segs) {
      const w = s.words;
      const args = w.slice(1).filter(x => !x.startsWith('-'));
      let check = [];
      if (['rm', 'mv', 'rsync', 'rmdir', 'unlink'].includes(s.c0)) check = args;
      else if (['cp', 'ln'].includes(s.c0)) check = args.slice(-1);
      else if (s.c0 === 'find' && findDeletes(w)) {
        check = findRoots(w);
        if (findNamePatterns(w).some(p => relIs(p.toLowerCase(), '.murba'))) block('.murba 폴더를 찾아 지우는 find', 'murba-root', null);
      }
      for (const t of check) for (const rel of pathVariants(proj, t, s.cwd)) {
        if (isMurbaRoot(rel)) block(`.murba 폴더 자체를 지우거나 옮길 수 없음(${t})`, 'murba-root', null);
      }
    }
    if (!name) {
      const inv = murbaInvocations(cmd);
      // re-initialising an existing run wipes approval and test locks: a human confirms
      if (inv.some(a => a[0] === 'init' || a[0] === '<stdin>') && fs.existsSync(path.join(murbaDir(proj), 'state.json'))) {
        logHook(proj, 'guard', 'ask', { tool, rule: 'reinit-human' });
        ask('[murba guard] 이미 진행 중인 실행을 다시 초기화하면 승인·테스트 잠금이 사라집니다. 사람이 확인하세요.');
      }
      // interactive approval needs a human click
      if (st.mode !== 'headless' && inv.some(a => a[0] === 'approve' || a[0] === '<stdin>')) {
        logHook(proj, 'guard', 'ask', { tool, rule: 'approve-human' });
        ask('[murba guard] 기획서 승인은 사람이 확인합니다. 기획서·AC 요약을 보고 승인하려면 허용하세요.');
      }
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

// Does this package.json edit change scripts.test / test:*? Applies the edit to the current file and compares.
// If the edit can't be applied (no file, old_string missing, result not JSON), fall back to a text heuristic.
function changesTestScript(proj, rel, tool, ti) {
  const testKeys = j => { const sc = (j && j.scripts) || {}; return JSON.stringify(Object.keys(sc).filter(k => k === 'test' || k.startsWith('test:')).sort().map(k => [k, sc[k]])); };
  let curText = null; try { curText = fs.readFileSync(path.join(proj, rel), 'utf8'); } catch { curText = null; }
  let cur = null; try { cur = curText == null ? null : JSON.parse(curText); } catch { cur = null; }
  if (tool === 'Write') { try { return testKeys(JSON.parse(ti.content || '')) !== testKeys(cur); } catch { return true; } }
  const edits = tool === 'MultiEdit' ? (ti.edits || []) : [ti];
  const heuristic = () => edits.some(e => [e.old_string, e.new_string].some(x => /"test(:[^"]*)?"\s*:/.test(String(x || ''))) || /(--test\b|\bjest\b|\bvitest\b|\bmocha\b|\bpytest\b|\bplaywright\b|\bava\b|\btap\b)/.test(String(e.old_string || '')));
  if (curText == null || cur == null) return heuristic();
  let text = curText;
  for (const e of edits) {
    const o = String(e.old_string ?? ''); const n = String(e.new_string ?? '');
    if (!o || !text.includes(o)) return heuristic();
    text = e.replace_all ? text.split(o).join(n) : text.replace(o, () => n);
  }
  try { return testKeys(JSON.parse(text)) !== testKeys(cur); } catch { return heuristic(); }
}
