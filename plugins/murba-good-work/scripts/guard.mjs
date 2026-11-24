// PreToolUse guard: irreversible commands + agent_type path rules. Fail-closed.
// Threat model (ADR 0003): safety net for a cooperative model, not a sandbox. See scripts/lib/patterns.mjs header.
import path from 'node:path';
import fs from 'node:fs';
import { PLUGIN_NAME, projectDir, readState, readStdin, appendEvent, appendDecision, logHook, murbaDir } from './lib/core.mjs';
import { analyzeBash, segWriteTargets, redirectTargets, gitSubIndex, bashWriteRels, bashPathArgs, canonRel, pathVariants, relIs, relUnder, hasGlob, walkSegments, findNamePatterns, findDeletes, findRoots, scriptKind, scanScript, deleteTargetReason, isTestPath, isSecretPath, matchAny, DEFAULT_IMPL_GLOBS, murbaInvocations, RUNNER_SECTION_FILES } from './lib/patterns.mjs';

// Ledger files: only the murba CLI (and this guard, for `caller`) changes them. Write/Edit and Bash writes are refused for everyone.
const LEDGER = ['.murba/state.json', '.murba/events.jsonl', '.murba/decisions.tsv', '.murba/caller', '.murba/state.sha256', '.murba/approve-token'];
const AGENT_REPORT_DIRS = ['test-writer', 'builder', 'evaluator', 'pr-reviewer'];
const isStateFile = rel => LEDGER.some(c => relIs(rel, c)) || relUnder(rel, '.murba/logs');
const isMurbaRoot = rel => relIs(rel, '.murba') || rel === '.murba/*' || rel === '.murba/**';
// murba subcommands a subagent may run (read-only). evaluator may also create an evidence run folder.
const MURBA_READONLY = ['status', 'check-tests', 'help', '--help', '-h'];

// Before the human approves the spec nobody edits project sources (main session or subagents).
// Keyed on state.approved (not a phase list), so skipping ahead without approval keeps the rule on.
function runPlanType(proj) {
  const p = path.join(murbaDir(proj), 'run-plan.json');
  if (!fs.existsSync(p)) return null; // no plan yet (triage start): not applied; CLI skip rule + red-test check in test-write cover early edits
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).task_type || 'unknown'; } catch { return 'unknown'; } // unreadable plan: rule stays on
}

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
}
const ask = reason => decide('ask', reason);

// task type: locked in state at triage→grill when present, else the run plan
const taskTypeOf = (st, proj) => st.task_type || runPlanType(proj);
const preApprovalActive = (st, proj) => { const t = taskTypeOf(st, proj); return !!st.phase && st.phase !== 'done' && !st.approved && !!t && t !== 'investigation'; };
// a project path the pre-approval rule protects: inside the project, not .murba/ (.gitignore too: an ignore line can hide a new file from the source gate)
// ../.gitignore (monorepo parent folders) is protected too: it can hide project files
const outsideMurba = rel => rel !== undefined && rel !== null && ((!path.isAbsolute(rel) && !/^\.\.(\/|$)/.test(rel) && !relIs(rel, '.murba') && !relUnder(rel, '.murba')) || /^(\.\.\/)+\.gitignore$/.test(rel));
// Writes a Bash command makes, per segment (cd-aware). git arguments count only in the git segment itself:
// checkout/restore paths are writes, branch names are not; apply/am/patch and formatters write (targets may be unknown).
function preApprovalBashWrites(cmd, proj) {
  const { segs, heredocs } = walkSegments(cmd, proj);
  const bodies = heredocs.map(h => h.body);
  const rels = [], unknown = [];
  for (const s of segs) {
    const w = s.words, c0 = s.c0;
    const pv = t => pathVariants(proj, t, s.cwd);
    if (c0 === 'git') {
      for (const t of redirectTargets(s.text)) rels.push(...pv(t));
      const si = gitSubIndex(w), sub = si > 0 ? w[si] : null, rest = si > 0 ? w.slice(si + 1) : [];
      if (sub === 'apply' || sub === 'am') { if (!rest.some(t => ['--check', '--stat', '--numstat', '--summary'].includes(t))) unknown.push(`git ${sub}`); continue; }
      if (sub === 'checkout' || sub === 'restore') {
        if (sub === 'checkout' && rest.some(t => ['-b', '-B', '--orphan', '--detach', '-c', '-C'].includes(t))) continue;
        if (sub === 'restore' && rest.includes('--staged') && !rest.some(t => ['--worktree', '-W'].includes(t))) continue;
        const dd = rest.indexOf('--');
        const a = []; for (let k = 0; k < rest.length; k++) { const t = rest[k]; if (['-s', '--source'].includes(t)) { k++; continue; } if (!t.startsWith('-')) a.push(t); }
        const paths = dd >= 0 ? rest.slice(dd + 1) : sub === 'restore' ? a : a.filter(t => fs.existsSync(path.resolve(s.cwd || proj, t)));
        for (const t of paths) rels.push(...pv(t));
      }
      continue;
    }
    if (c0 === 'patch') { unknown.push('patch'); continue; }
    if (FORMATTER_WRITES(c0, w)) { const a = w.slice(1).filter(t => !t.startsWith('-')); if (!a.length) unknown.push(c0); for (const t of a) rels.push(...pv(t)); continue; }
    if (c0 === 'mkdir') for (const t of w.slice(1).filter(t => !t.startsWith('-'))) rels.push(...pv(t));
    for (const t of segWriteTargets(s.text, w, bodies)) rels.push(...pv(t));
  }
  return { rels: rels.filter(r => r !== ''), root: rels.includes(''), unknown };
}
const deny = reason => decide('deny', reason);

// Human-approval token for the CLI: written when the guard asks a human to confirm `murba approve` (CLI accepts it for 10 minutes)
function writeApproveToken(proj) {
  const p = path.join(murbaDir(proj), 'approve-token');
  const tmp = `${p}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify({ ts: Date.now() })); fs.renameSync(tmp, p); } catch { try { fs.unlinkSync(tmp); } catch {} }
}

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

// builder must not reach .murba/hidden (spec §174): the folder itself, an ancestor of it (`.murba`), or a glob/brace that can match inside it
const HIDDEN_PROBE = '.murba/hidden/x';
const reachesHidden = rel => !!rel && (relUnder(rel, '.murba/hidden') || (hasGlob(rel) ? ['.murba', '.murba/hidden', HIDDEN_PROBE].some(c => relIs(rel, c)) : '.murba/hidden'.startsWith(rel + '/')));

// Recursive content search over the project root that does not respect .gitignore (so it reads .murba/hidden)
const GREPS = ['grep', 'egrep', 'fgrep'];
function rootSearch(s, proj) {
  const w = s.words, c0 = s.c0;
  const atRoot = targets => !targets.length || targets.some(t => { const r = canonRel(proj, t, s.cwd); return r === '' || r.startsWith('..') || relIs(r, '.murba') || relUnder(r, '.murba'); });
  const opts = w.slice(1).filter(t => t.startsWith('-'));
  const args = w.slice(1).filter(t => !t.startsWith('-'));
  const excludesMurba = w.some(t => /^--(exclude-dir|ignore-dir)=?/.test(t) && /\.murb|\.\*|\{.*\.murb/.test(t)) || w.some((t, k) => ['--exclude-dir', '--ignore-dir', '-g', '--glob'].includes(t) && /murb|^!\.\*|^!\.?\*\*\/\./.test(w[k + 1] || ''));
  if (excludesMurba) return false;
  if (GREPS.includes(c0) && opts.some(o => /^-[a-zA-Z]*[rR]/.test(o) || o === '--recursive' || o === '--dereference-recursive' || /^--directories=recurse/.test(o))) {
    const hasE = w.some(t => t === '-e' || t === '-f' || /^--regexp/.test(t));
    return atRoot(hasE ? args : args.slice(1));
  }
  if (c0 === 'rg' && opts.some(o => /^-u+$/.test(o) || /^--no-ignore/.test(o) || o === '--unrestricted')) return atRoot(args.slice(1));
  if (c0 === 'ag' && opts.some(o => /^-[a-zA-Z]*[uU]/.test(o) || ['--unrestricted', '--skip-vcs-ignores', '--all-types'].includes(o))) return atRoot(args.slice(1));
  if (c0 === 'ack') return atRoot(args.slice(1));
  return false;
}
const FORMATTER_WRITES = (c0, w) =>
  (c0 === 'prettier' && w.some(t => ['--write', '-w'].includes(t))) ||
  (c0 === 'eslint' && w.some(t => t === '--fix')) || (c0 === 'stylelint' && w.includes('--fix')) ||
  (c0 === 'black' && !w.some(t => ['--check', '--diff'].includes(t))) ||
  (c0 === 'ruff' && (w.includes('--fix') || (w[1] === 'format' && !w.some(t => ['--check', '--diff'].includes(t))))) ||
  (['gofmt', 'goimports'].includes(c0) && w.includes('-w')) ||
  (c0 === 'rustfmt' && !w.includes('--check')) || (c0 === 'cargo' && w[1] === 'fmt' && !w.includes('--check')) ||
  (c0 === 'isort' && !w.some(t => ['--check', '--check-only', '--diff', '-c'].includes(t))) || (c0 === 'autopep8' && w.some(t => ['-i', '--in-place'].includes(t)));
const READ_CMDS = ['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'sed', 'awk', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'strings', 'xxd', 'od', 'cp', 'diff', 'cut', 'sort', 'wc', 'tac', 'vim', 'view'];
const isImpl = (rel, implGlobs) => !!rel && !hasGlob(rel) && !isTestPath(rel) && (matchAny(rel, implGlobs) || matchAny(rel + '/_', implGlobs));

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
      if (self === 'builder' && /(^|\/)package\.json$/.test(rel) && changesTestScript(proj, rel, tool, ti)) return 'builder는 package.json의 test 스크립트·테스트 설정(jest 등)을 바꿀 수 없음';
      if (self === 'builder' && RUNNER_SECTION_FILES.test(rel) && changesRunnerConfig(proj, rel, tool, ti)) return `builder는 ${rel}의 테스트 설정 부분을 바꿀 수 없음`;
      if (['evaluator', 'pr-reviewer', 'triage', 'spec-reviewer'].includes(self) && !rel.startsWith(ownReports) && !(self === 'evaluator' && rel.startsWith('.murba/evidence/'))) return `${self}는 코드를 수정하지 않음. 보고는 ${ownReports}에`;
    }
  }
  if (isRead && self === 'builder') {
    for (const rel of rels) if (reachesHidden(rel)) return 'builder는 숨긴 검사(.murba/hidden)에 접근할 수 없음';
  }
  if (isRead && self === 'test-writer') {
    for (const rel of rels) if (isImpl(rel, implGlobs)) return `test-writer는 구현 코드를 읽지 않고 AC만 보고 테스트를 씀(${rel})`;
  }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    for (const args of murbaInvocations(cmd)) {
      const sc = args[0] || 'help';
      const ok = MURBA_READONLY.includes(sc) || (sc === 'budget' && !args.includes('--subagent')) || (sc === 'evidence-run' && self === 'evaluator');
      if (!ok) return `서브에이전트(${self})는 murba 상태 변경 명령(${sc})을 쓸 수 없음. 결과는 응답으로 보고`;
    }
    const { segs } = walkSegments(cmd, proj);
    if (self === 'builder') {
      if (/\.murba\/hidden/i.test(cmd)) return 'builder는 숨긴 검사에 접근할 수 없음';
      for (const rel of bashPathArgs(cmd, proj)) if (reachesHidden(rel)) return 'builder는 숨긴 검사에 접근할 수 없음(.murba 탐색)';
      for (const s of segs) {
        if (rootSearch(s, proj)) return 'builder는 .gitignore를 무시하고 프로젝트 전체를 검색할 수 없음(숨긴 검사 포함). Grep 도구(.gitignore 준수)나 src 등 경로를 지정하세요';
        if (s.c0 === 'find' && findNamePatterns(s.words).some(p => /hidden|\.murb/i.test(p))) return 'builder는 숨긴 검사를 찾을 수 없음';
        const keyIsTest = t => /^scripts(\.|\[)['"]?test/.test(String(t).split('=')[0]) || /^(jest|mocha|ava)(\.|\[|$)/.test(String(t).split('=')[0]);
        if (['npm', 'pnpm', 'yarn'].includes(s.c0) && s.words.includes('pkg') && s.words.some(t => ['set', 'delete'].includes(t)) && s.words.some(keyIsTest)) return 'builder는 test 스크립트를 바꿀 수 없음';
        if (s.c0 === 'npm' && s.words[1] === 'set-script' && /^test/.test(s.words[2] || '')) return 'builder는 test 스크립트를 바꿀 수 없음';
      }
    }
    if (self === 'test-writer') {
      for (const s of segs) if (READ_CMDS.includes(s.c0)) for (const t of s.words.slice(1)) if (!t.startsWith('-') && isImpl(canonRel(proj, t, s.cwd), implGlobs)) return `test-writer는 구현 코드를 읽지 않고 AC만 보고 테스트를 씀(${t})`;
    }
    if (['evaluator', 'pr-reviewer'].includes(self)) {
      for (const s of segs) if (FORMATTER_WRITES(s.c0, s.words)) return `${self}는 코드를 수정하지 않음(${s.c0}로 파일 고치기 금지)`;
    }
    for (const rel of bashWriteRels(cmd, proj)) {
      if (relUnder(rel, '.murba') && !allowedMurbaWrite(rel)) return `서브에이전트(${self})는 .murba/ 중 자기 보고 경로에만 쓸 수 있음(${rel})`;
      if (self === 'builder' && isTestPath(rel)) return `builder는 테스트·러너 설정을 수정할 수 없음(${rel})`;
      if (self === 'builder' && (/(^|\/)package\.json$/.test(rel) || RUNNER_SECTION_FILES.test(rel))) return `builder는 ${rel}을 Bash로 고칠 수 없음(Edit 도구로)`;
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
  const preActive = preApprovalActive(st, proj);
  const PRE_REASON = '승인 전에는 소스를 고치지 않는다. 기획서(.murba/spec.md)와 AC를 먼저 승인받는다';

  const block = (reason, rule, cls) => {
    logHook(proj, 'guard', 'blocked', { tool, rule, agent: input.agent_type || 'main', reason });
    appendEvent(proj, 'guard_deny', { tool, rule, agent: input.agent_type || 'main', reason });
    if (cls) appendDecision(proj, { phase, cls, decision: `차단됨: ${reason}`, why: `guard 규칙 ${rule}`, evidence: tool === 'Bash' ? String(ti.command).slice(0, 200) : toolRels(proj, tool, ti).join(','), cost: '사용자가 승인하면 수동 실행' });
    deny(`[murba guard] ${reason}. 이 작업은 하지 말고 다른 작업을 계속하세요.` + (cls ? ' 결정 큐에 기록됨.' : ''));
  };

  // 0) no timed self-wakeups while a murba run is in progress: subagent completion arrives as a notification (t093: ScheduleWakeup polling)
  if ((tool === 'ScheduleWakeup' || tool === 'CronCreate') && st.phase && st.phase !== 'done') block('murba 실행 중에는 예약 호출로 기다리지 않는다. 서브에이전트가 끝나면 완료 알림으로 다시 불린다: 할 일이 없으면 턴을 끝내고 알림을 기다린다(sleep으로 기다리지 않는다)', 'no-wakeup', null);
  // 1) irreversible commands — everyone
  if (tool === 'Bash') {
    const r = analyzeBash(ti.command, proj);
    if (r) block(r.reason, r.rule, 'irreversible');
  }
  // 2a) main session: subagent report folders are the subagents' evidence of independent work; tests and hidden checks are written by test-writer
  const mainWriteReason = rel => {
    if (name || !rel) return null;
    if (AGENT_REPORT_DIRS.some(a => relIs(rel, `.murba/reports/${a}`) || relUnder(rel, `.murba/reports/${a}`))) return [`${rel}은 그 서브에이전트만 쓴다(독립 작업의 증거). 해당 에이전트를 불러 쓰게 한다`, 'agent-report'];
    if (relUnder(rel, '.murba/hidden') || relIs(rel, '.murba/hidden')) return [`숨긴 검사(${rel})는 test-writer가 쓴다`, 'main-hidden'];
    if (st.phase === 'test-write' && isTestPath(rel) && !relUnder(rel, '.murba')) return [`테스트(${rel})는 test-writer가 AC만 보고 쓴다. murba-good-work:test-writer를 부른다`, 'main-test-write'];
    return null;
  };
  if (!name) {
    const rels = WRITE_TOOLS.includes(tool) ? toolRels(proj, tool, ti) : tool === 'Bash' ? bashWriteRels(String(ti.command || ''), proj) : [];
    for (const rel of rels) { const r = mainWriteReason(rel); if (r) block(r[0], r[1], null); }
  }
  // 2) secrets, ledger files — everyone
  if (WRITE_TOOLS.includes(tool)) {
    for (const rel of toolRels(proj, tool, ti)) {
      if (isSecretPath(rel)) block(`비밀 파일 쓰기(${rel})`, 'secret-write', 'irreversible');
      if (isStateFile(rel)) block(`${rel}은 murba CLI로만 변경`, 'state-file', null);
    }
    // script files (incl. Makefile, package.json scripts, shebang files): literal commands go through the full Bash checks
    const bodies = tool === 'Write' ? [ti.content] : tool === 'MultiEdit' ? (ti.edits || []).map(e => e && e.new_string) : [ti.new_string];
    const norm = c => String(c).trim().replace(/\s+/g, ' ');
    for (const rel of toolRels(proj, tool, ti)) {
      if (!rel || hasGlob(rel) || tool === 'NotebookEdit') continue;
      const cur = readText(proj, rel);
      const after = tool === 'Write' ? String(ti.content || '') : applyEdits(cur, tool, ti);
      const kind = scriptKind(rel, after ?? bodies.join('\n'));
      if (!kind) continue;
      // commands already in the file before this edit are not re-checked (only new or changed ones)
      const oldCmds = new Set(cur ? scanScript(cur, rel, scriptKind(rel, cur) || kind).commands.map(norm) : []);
      const scanBodies = kind === 'pkg' && after != null ? [after] : bodies;
      for (const body of scanBodies) {
        if (!body) continue;
        const sc = scanScript(body, rel, kind);
        for (const c of sc.commands) {
          if (oldCmds.has(norm(c))) continue;
          const r = analyzeBash(c, proj);
          if (r) block(`스크립트(${rel}) 안 명령: ${r.reason}`, r.rule, 'irreversible');
          for (const w of bashWriteRels(c, proj)) { if (isStateFile(w) || isMurbaRoot(w)) block(`스크립트(${rel}) 안 명령이 ${w}을 바꿈 — murba CLI로만 변경`, 'state-file', null); const mr = mainWriteReason(w); if (mr) block(`스크립트(${rel}) 안 명령: ${mr[0]}`, mr[1], null); }
          const inv = murbaInvocations(c);
          if (inv.some(a => a[0] === 'approve')) block(`스크립트(${rel}) 안 murba approve — approve는 사람이 직접 실행`, 'approve-human', null);
          if (inv.some(a => a[0] === 'init') && fs.existsSync(path.join(murbaDir(proj), 'state.json'))) block(`스크립트(${rel}) 안 murba init — 진행 중인 실행의 재초기화는 사람이 직접`, 'reinit-human', null);
          if (name) { const ar = checkAgentRules(name, 'Bash', { command: c }, proj, st); if (ar) block(`스크립트(${rel}) 안 명령: ${ar}`, `agent:${name}`, null); }
        }
        for (const d of sc.deletes) {
          const why = d.recursive ? deleteTargetReason(d.target, proj) : null;
          if (why) block(`스크립트(${rel}) 안: ${why}`, 'rm-root', 'irreversible');
          if (pathVariants(proj, d.target).some(isMurbaRoot)) block(`스크립트(${rel})가 .murba 폴더를 지움`, 'murba-root', null);
        }
        if (sc.sql) block(`스크립트(${rel}) 안: DB 데이터 삭제(DROP/TRUNCATE) SQL 실행`, 'db-drop', 'irreversible');
        if (preActive) {
          for (const w of sc.writes) for (const v of pathVariants(proj, w)) if (outsideMurba(v)) block(`${PRE_REASON}(스크립트 ${rel}가 ${v || '프로젝트 루트'}에 씀)`, 'pre-approval-edit', null);
          for (const c of sc.commands) { const pw = preApprovalBashWrites(c, proj); const hit = pw.rels.find(outsideMurba) || (pw.root ? '프로젝트 루트' : pw.unknown[0]); if (hit) block(`${PRE_REASON}(스크립트 ${rel} 안 명령이 ${hit}를 바꿈)`, 'pre-approval-edit', null); }
        }
        for (const w of sc.writes) for (const v of pathVariants(proj, w)) {
          if (isStateFile(v)) block(`스크립트(${rel})가 ${v}을 씀 — murba CLI로만 변경`, 'state-file', null);
          { const mr = mainWriteReason(v); if (mr) block(`스크립트(${rel}): ${mr[0]}`, mr[1], null); }
          if (name === 'builder' && isTestPath(v)) block(`builder 스크립트(${rel})가 테스트 파일(${v})을 씀`, 'agent:builder', null);
        }
        if (name === 'builder') for (const rd of sc.reads) for (const v of pathVariants(proj, rd)) if (reachesHidden(v)) block(`builder 스크립트(${rel})가 숨긴 검사(${v})를 읽음`, 'agent:builder', null);
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
        writeApproveToken(proj);
        ask('[murba guard] 기획서 승인은 사람이 확인합니다. 기획서·AC 요약을 보고 승인하려면 허용하세요.');
      }
    }
  }
  // 2b) before approval nobody changes project sources (main session and subagents); investigation runs are exempt.
  if (preActive) {
    if (WRITE_TOOLS.includes(tool)) for (const rel of toolRels(proj, tool, ti)) if (outsideMurba(rel) && rel !== '') block(`${PRE_REASON}(${rel})`, 'pre-approval-edit', null);
    if (tool === 'Bash') {
      const pw = preApprovalBashWrites(String(ti.command || ''), proj);
      const hit = pw.rels.find(outsideMurba) || (pw.root ? '프로젝트 루트' : null) || (pw.unknown.length ? `${pw.unknown[0]}(대상 불명)` : null);
      if (hit) block(`${PRE_REASON}(Bash 쓰기: ${hit})`, 'pre-approval-edit', null);
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
  const testKeys = j => { const sc = (j && j.scripts) || {}; return JSON.stringify([Object.keys(sc).filter(k => k === 'test' || k.startsWith('test:')).sort().map(k => [k, sc[k]]), j && j.jest, j && j.mocha, j && j.ava]); };
  let curText = null; try { curText = fs.readFileSync(path.join(proj, rel), 'utf8'); } catch { curText = null; }
  let cur = null; try { cur = curText == null ? null : JSON.parse(curText); } catch { cur = null; }
  if (tool === 'Write') { try { return testKeys(JSON.parse(ti.content || '')) !== testKeys(cur); } catch { return true; } }
  const edits = tool === 'MultiEdit' ? (ti.edits || []) : [ti];
  const heuristic = () => edits.some(e => [e.old_string, e.new_string].some(x => /"(test(:[^"]*)?|jest|mocha|ava)"\s*:/.test(String(x || ''))) || /(--test\b|\bjest\b|\bvitest\b|\bmocha\b|\bpytest\b|\bplaywright\b|\bava\b|\btap\b)/.test(String(e.old_string || '')));
  if (curText == null || cur == null) return heuristic();
  let text = curText;
  for (const e of edits) {
    const o = String(e.old_string ?? ''); const n = String(e.new_string ?? '');
    if (!o || !text.includes(o)) return heuristic();
    text = e.replace_all ? text.split(o).join(n) : text.replace(o, () => n);
  }
  try { return testKeys(JSON.parse(text)) !== testKeys(cur); } catch { return heuristic(); }
}

function readText(proj, rel) { try { return fs.readFileSync(path.join(proj, rel), 'utf8'); } catch { return null; } }
// The file text after an Edit/MultiEdit, or null when it can't be applied
function applyEdits(curText, tool, ti) {
  if (curText == null) return null;
  const edits = tool === 'MultiEdit' ? (ti.edits || []) : [ti];
  let text = curText;
  for (const e of edits) {
    const o = String((e && e.old_string) ?? ''); const n = String((e && e.new_string) ?? '');
    if (!o || !text.includes(o)) return null;
    text = e.replace_all ? text.split(o).join(n) : text.replace(o, () => n);
  }
  return text;
}
// The test-runner part of a shared config: [tool.pytest*]/[tool.coverage*] (pyproject), [tool:pytest]/[pytest]/[testenv*] (setup.cfg, tox.ini), `test: {…}` (vite.config)
function tomlSections(text, pick) {
  const out = []; let on = false;
  for (const line of text.split('\n')) { const h = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(line); if (h) on = pick(h[1].trim()); if (on) out.push(line.trim()); }
  return out.join('\n');
}
function testSection(rel, text) {
  if (/pyproject\.toml$/.test(rel)) return tomlSections(text, h => /^tool\.(pytest|coverage)/.test(h));
  if (/(setup\.cfg|tox\.ini)$/.test(rel)) return tomlSections(text, h => /^(tool:pytest|pytest|coverage:|testenv)/.test(h));
  const m = /\btest\s*:\s*\{/.exec(text); if (!m) return '';
  let d = 0, k = m.index + m[0].length - 1;
  for (; k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) break; }
  return text.slice(m.index, k + 1);
}
function changesRunnerConfig(proj, rel, tool, ti) {
  const cur = readText(proj, rel);
  const after = tool === 'Write' ? String(ti.content || '') : applyEdits(cur, tool, ti);
  if (after == null) {
    const edits = tool === 'MultiEdit' ? (ti.edits || []) : [ti];
    return edits.some(e => /pytest|addopts|testpaths|\btest\s*:|vitest|coverage/.test(String((e && e.old_string) || '') + String((e && e.new_string) || '')));
  }
  return testSection(rel, cur ?? '') !== testSection(rel, after);
}
