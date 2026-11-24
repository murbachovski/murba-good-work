// murba — ledger CLI for the murba-good-work pipeline. Only this CLI changes .murba/state.json.
// Exit codes: 0 ok, 1 usage error, 2 transition refused / condition unmet, 3 limit reached.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const core = await import(pathToFileURL(path.join(here, 'lib', 'core.mjs')).href);
const { renderReport } = await import(pathToFileURL(path.join(here, 'lib', 'report.mjs')).href);
const { globToRegex } = await import(pathToFileURL(path.join(here, 'lib', 'patterns.mjs')).href);
const { CHAIN, MACHINE, projectDir, murbaDir, statePath, readState, updateState, appendEvent, appendDecision, DECISION_CLASSES, missingRequires, nextActionHint, lastVerdict, nonHeldAcs, sha256File, sha256Text, nowIso, pluginVersion, isHeadless, withLock, writeJsonAtomic, writeState, ledgerTampered } = core;

const proj = projectDir(null);
const md = murbaDir(proj);
const argv = process.argv.slice(2);

function out(s) { process.stdout.write(s.endsWith('\n') ? s : s + '\n'); }
class Fail extends Error { constructor(code, msg) { super(msg); this.code = code; } }
function fail(code, msg) { throw new Fail(code, msg); }
function opt(name, dflt = undefined) {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return v;
}
function flag(name) { return argv.includes(name); }
function positional() {
  const res = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') && !['--json', '--final', '--headless', '--auto-approve', '--force', '--subagent', '--amend'].includes(argv[i])) i++; continue; }
    res.push(argv[i]);
  }
  return res;
}
function need() { if (!readState(proj)) fail(1, '.murba/state.json 없음 — `murba init` 먼저'); }

// 승인 이후 단계(build·evaluate·fix·qa·browser)는 승인 + 테스트 잠금이 있어야 들어간다
const GATED = ['build', 'evaluate', 'fix', 'qa', 'browser'];
function gateEntry(st, next) {
  if (!GATED.includes(next)) return;
  if (!st.approved) fail(2, `전이 거부: ${next}는 승인(murba approve) 후에만`);
  if (!Object.keys(st.test_hashes || {}).length) fail(2, `전이 거부: ${next}는 테스트 잠금(murba lock-tests) 후에만`);
}
// 고정된 테스트 파일이 바뀌었거나 없어졌으면 목록
function changedTests(st) {
  const bad = [];
  for (const [f, h] of Object.entries(st.test_hashes || {})) {
    const p = path.join(proj, f);
    if (!fs.existsSync(p)) bad.push(`${f} (삭제됨)`);
    else if (sha256File(p) !== h) bad.push(`${f} (변경됨)`);
  }
  return bad;
}
function specEdited(st) {
  if (!st.approved || !st.spec_hash) return false;
  const p = path.join(md, 'spec.md');
  return !fs.existsSync(p) || sha256File(p) !== st.spec_hash;
}
// 모든 전이 공통 검사: 승인 후 기획서 변경, 고정 테스트 변경
function commonChecks(st, cur) {
  if (specEdited(st)) { appendEvent(proj, 'spec_edited', { phase: cur }); fail(2, 'SPEC_EDITED: 승인 후 .murba/spec.md가 바뀜 — 승인본으로 되돌린다'); }
  const bad = changedTests(st);
  if (bad.length) { appendEvent(proj, 'tests_tampered', { files: bad, phase: cur }); fail(2, `TESTS_CHANGED: ${bad.join(', ')} — 테스트 자체 결함이면 test-writer 재작성 후 murba lock-tests --amend`); }
}

const ACRE = /^\s*[-*]\s*(AC-\d+)\b\s*(.+?)\s*$/;
function parseSpecAcs() {
  const p = path.join(md, 'spec.md');
  if (!fs.existsSync(p)) fail(2, 'spec.md 없음');
  const acs = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = ACRE.exec(line);
    if (!m) continue;
    const rest = m[2];
    const after = /\[after:\s*([^\]]+)\]/i.exec(rest);
    const text = rest.replace(/\[browser\]/ig, '').replace(/\[after:[^\]]*\]/ig, '').replace(/\s{2,}/g, ' ').trim();
    acs.push({ id: m[1], browser: /\[browser\]/i.test(rest), after: after ? after[1].split(/[\s,]+/).filter(Boolean) : [], text });
  }
  return acs;
}

function walk(dir, acc = [], root = dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.venv', 'venv', 'dist', 'build', '.next'].includes(e.name)) continue;
    // .murba/ is state, except .murba/hidden/ (hidden checks must be lockable)
    if (e.name === '.murba' && dir === root) { const h = path.join(dir, '.murba', 'hidden'); if (fs.existsSync(h)) walk(h, acc, root); continue; }
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc, root); else acc.push(p);
  }
  return acc;
}

const cmds = {
  init() {
    const prev = readState(proj);
    if (prev && !flag('--force')) fail(1, '이미 초기화됨(.murba/state.json). 다시 하려면 --force');
    if (prev && prev.mode !== 'headless' && (flag('--headless') || flag('--auto-approve') || isHeadless())) fail(2, '재초기화 거부: 대화형 실행을 headless·자동 승인으로 바꿀 수 없다(사람 승인 우회)');
    for (const d of ['handoff', 'reports', 'hidden', 'evidence', 'logs']) fs.mkdirSync(path.join(md, d), { recursive: true });
    const headless = flag('--headless') || isHeadless();
    const st = {
      schema: 1, plugin_version: pluginVersion(), phase: 'triage', auto: false, approved: false,
      mode: headless ? 'headless' : 'interactive', auto_approve: flag('--auto-approve') || process.env.MURBA_HEADLESS === '1',
      started_at: nowIso(), ac: {}, ac_order: [], current_ac: null, final_sha: null, spec_hash: null,
      test_hashes: {}, counters: { stop: {}, stop_total: 0, subagents: 0, fix_total: 0 },
      budget: { max_minutes: Number(opt('--max-minutes', 120)), max_subagents: Number(opt('--max-subagents', 40)), max_fix_rounds_total: 15 },
      impl_globs: ['src/**', 'app/**', 'lib/**', 'server/**', 'public/**'],
    };
    writeState(proj, st, { fresh: true });
    if (prev) {
      appendEvent(proj, 'reinit', { from_phase: prev.phase, was_approved: !!prev.approved });
      appendDecision(proj, { phase: prev.phase, cls: 'user-direction', decision: `murba init --force: 원장 재초기화(이전 단계 ${prev.phase}, 승인 ${prev.approved ? '있음' : '없음'})`, why: '재초기화로 승인·테스트 잠금이 지워짐', cost: '이전 승인·판정 기록 무효' });
    }
    const gi = path.join(proj, '.gitignore');
    const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    if (!/^\.murba\/?$/m.test(cur)) fs.appendFileSync(gi, (cur && !cur.endsWith('\n') ? '\n' : '') + '.murba/\n');
    appendEvent(proj, 'init', { mode: st.mode, plugin_version: st.plugin_version });
    out(`murba 초기화: ${md} (mode=${st.mode}${st.auto_approve ? ', auto-approve' : ''})\n${nextActionHint(st)}`);
  },

  status() {
    need();
    const st = readState(proj);
    const miss = missingRequires(proj, st);
    if (flag('--json')) return out(JSON.stringify({ phase: st.phase, next: MACHINE.phases[st.phase].next, missing: miss, auto: st.auto, approved: st.approved, current_ac: st.current_ac, ac: st.ac_order.map(id => ({ id, held: st.ac[id].held, last: lastVerdict(st.ac[id]), final: st.ac[id].final_verdict && st.ac[id].final_verdict.verdict, fix_rounds: st.ac[id].fix_rounds })) }, null, 2));
    if (ledgerTampered(proj)) out('❌ LEDGER_TAMPERED: state.json이 murba CLI 밖에서 바뀜');
    out(nextActionHint(st));
    out(miss.length ? `남은 조건: ${miss.join(', ')}` : '현재 단계 조건 충족');
    for (const id of st.ac_order) { const a = st.ac[id]; out(`  ${id} ${a.held ? 'HELD' : (lastVerdict(a) || '-')}${a.final_verdict ? ` final=${a.final_verdict.verdict}` : ''} fix=${a.fix_rounds || 0}${id === st.current_ac ? ' ←current' : ''}`); }
  },

  phase() {
    need();
    const next = positional()[1];
    if (!next) fail(1, 'usage: murba phase <next>');
    let result;
    const skipReason = opt('--skip');
    if (skipReason !== undefined) {
      if (skipReason === true || !String(skipReason).trim()) fail(1, 'usage: murba phase <target> --skip "<사유>"');
      updateState(proj, st => {
        const cur = st.phase;
        if (!MACHINE.phases[next]) fail(1, `알 수 없는 단계 ${next}`);
        const ci = CHAIN.indexOf(cur === 'fix' ? 'evaluate' : cur), ti = CHAIN.indexOf(next);
        if (ci < 0 || ti <= ci) fail(2, `생략 거부: ${cur} → ${next}는 기본 순서상 앞으로 가는 전이가 아님`);
        if (ti > CHAIN.indexOf('report')) fail(2, '생략 거부: report는 생략할 수 없음(먼저 report로 가서 보고서를 쓴다)');
        const path_ = CHAIN.slice(ci, ti);
        if (path_.includes('approve') && !st.approved) {
          const plan = core.readJsonFile(path.join(md, 'run-plan.json'), {});
          if (plan.task_type !== 'investigation' && next !== 'report') fail(2, '생략 거부: 승인 없이 approve를 건너뛰는 것은 조사(investigation) 작업이거나 report로 가서 끝낼 때만');
        }
        gateEntry(st, next);
        commonChecks(st, cur);
        st.skipped = st.skipped || {};
        for (const ph of path_) st.skipped[ph] = String(skipReason);
        st.phase = next;
        if (path_.some(ph => MACHINE.phases[ph].auto) || MACHINE.phases[next].auto) st.auto = true;
        if (next === 'build') st.current_ac = null;
        appendEvent(proj, 'skip', { from: cur, to: next, phases: path_, reason: String(skipReason) });
        result = st;
      });
      out(`생략 기록 후 이동: → ${next}`);
      return out(nextActionHint(result));
    }
    updateState(proj, st => {
      const cur = st.phase;
      const def = MACHINE.phases[cur];
      if (!MACHINE.phases[next]) fail(1, `알 수 없는 단계 ${next}`);
      commonChecks(st, cur);
      if (!def.next.includes(next)) fail(2, `전이 거부: ${cur} → ${next} (허용: ${def.next.join(', ') || '없음'})`);
      const miss = missingRequires(proj, st, cur);
      if (miss.length) fail(2, `전이 거부: ${cur}의 조건 미충족 — ${miss.join(', ')}`);
      gateEntry(st, next);
      const ac = st.current_ac && st.ac[st.current_ac];
      const remaining = nonHeldAcs(st).filter(id => lastVerdict(st.ac[id]) !== 'VERIFIED');
      if (cur === 'evaluate' && next === 'fix') {
        if (!ac || lastVerdict(ac) === 'VERIFIED') fail(2, '전이 거부: 현재 AC가 VERIFIED라 fix 불필요');
        if ((ac.fix_rounds || 0) >= MACHINE.limits.fix_rounds_per_ac) fail(3, `상한: ${st.current_ac} 수정 ${ac.fix_rounds}회 — murba ac hold 후 다음 AC로`);
      }
      if (cur === 'evaluate' && next === 'build') {
        if (ac && !ac.held && lastVerdict(ac) !== 'VERIFIED') fail(2, `전이 거부: ${st.current_ac}가 VERIFIED 아님(fix 또는 hold)`);
        if (!remaining.length) fail(2, '전이 거부: 남은 AC 없음 → qa');
      }
      if (cur === 'evaluate' && next === 'qa' && remaining.length) fail(2, `전이 거부: 미검증 AC 남음(${remaining.join(',')})`);
      if (cur === 'qa' && next === 'fix') {
        const id = opt('--ac');
        const a = id && id !== true && st.ac[id];
        if (!a) fail(1, 'usage: murba phase fix --ac <ID>  (qa에서 최종 판정이 VERIFIED 아닌 AC 재수정)');
        if (a.held || !a.final_verdict || a.final_verdict.verdict === 'VERIFIED') fail(2, `전이 거부: ${id}의 최종 판정이 VERIFIED 아님일 때만 qa → fix`);
        if ((a.fix_rounds || 0) >= MACHINE.limits.fix_rounds_per_ac) fail(3, `상한: ${id} 수정 ${a.fix_rounds}회 — 보고서에 ❌로 남기고 report로`);
        st.current_ac = id;
      }
      if (cur === 'qa' && next === 'report' && nonHeldAcs(st).some(id => st.ac[id].browser)) fail(2, '전이 거부: [browser] AC가 있어 browser 단계 필요');
      if (cur === 'report' && next === 'build' && !opt('--reason')) fail(1, 'report → build 재작업은 --reason 필요');
      st.phase = next;
      if (next === 'setup') st.auto = true;
      if (next === 'done') st.auto = false;
      if (next === 'build') st.current_ac = null;
      appendEvent(proj, 'phase', { from: cur, to: next, reason: opt('--reason') || '' });
      result = st;
    });
    out(`${nextActionHint(result)}`);
    if (next === 'build') out('다음: `murba ac next`로 현재 AC 지정');
  },

  ac() {
    need();
    const [, sub, id, verdict] = positional();
    if (sub === 'sync') {
      const acs = parseSpecAcs();
      if (!acs.length) fail(2, 'spec.md에 AC 줄 없음 (형식: `- AC-001 [browser] WHEN … THE SYSTEM SHALL …`)');
      updateState(proj, st => {
        if (!st.approved && CHAIN.indexOf(st.phase) > CHAIN.indexOf('approve')) fail(2, `AC 동기화 거부: 승인 없이 ${st.phase} 단계에 있음`);
        if (st.approved) {
          const changed = acs.filter(a => !st.ac[a.id] || st.ac[a.id].text !== a.text).map(a => a.id);
          const removed = st.ac_order.filter(x => !acs.find(a => a.id === x));
          if (changed.length || removed.length) {
            appendDecision(proj, { phase: st.phase, cls: 'user-direction', decision: `ACCEPTANCE_EDITED: ${[...changed, ...removed].join(',')}`, why: '승인 후 수용 기준 변경 시도', cost: '승인 범위 이탈' });
            appendEvent(proj, 'acceptance_edited', { changed, removed });
            fail(2, `ACCEPTANCE_EDITED: 승인 후 AC 변경 불가(${[...changed, ...removed].join(',')})`);
          }
          return;
        }
        const nac = {};
        for (const a of acs) nac[a.id] = { ...(st.ac[a.id] || { verdicts: [], fix_rounds: 0, held: false }), text: a.text, browser: a.browser, after: a.after };
        st.ac = nac; st.ac_order = acs.map(a => a.id);
      });
      appendEvent(proj, 'ac_sync', { count: acs.length });
      return out(`AC ${acs.length}개 동기화: ${acs.map(a => a.id + (a.browser ? '[browser]' : '')).join(', ')}`);
    }
    if (sub === 'next') {
      let picked = null; let blocked = [];
      updateState(proj, st => {
        const remaining = nonHeldAcs(st).filter(x => lastVerdict(st.ac[x]) !== 'VERIFIED');
        const depOk = d => !st.ac[d] || st.ac[d].held || lastVerdict(st.ac[d]) === 'VERIFIED';
        picked = remaining.find(x => (st.ac[x].after || []).every(depOk)) || null;
        if (!picked) blocked = remaining.map(x => `${x}(after ${(st.ac[x].after || []).filter(d => !depOk(d)).join(',')})`);
        st.current_ac = picked;
      });
      if (!picked && blocked.length) fail(2, `남은 AC가 있지만 선행 AC 미검증으로 진행 불가: ${blocked.join(' ')}`);
      if (!picked) fail(2, '남은 AC 없음');
      appendEvent(proj, 'ac_next', { id: picked });
      const st = readState(proj);
      return out(`${picked}: ${st.ac[picked].text}`);
    }
    if (sub === 'verdict') {
      const V = ['VERIFIED', 'NOT_VERIFIED', 'INCONCLUSIVE'];
      if (!id || !V.includes(verdict)) fail(1, `usage: murba ac verdict <ID> <${V.join('|')}> --sha <sha> [--evidence <p>] [--final]`);
      const sha = opt('--sha');
      if (!sha || sha === true) fail(1, '--sha 필요');
      const evidence = opt('--evidence', '');
      const final = flag('--final');
      updateState(proj, st => {
        const a = st.ac[id]; if (!a) fail(1, `AC 없음: ${id}`);
        a.verdicts.push({ verdict, sha, evidence: evidence === true ? '' : evidence, at: nowIso(), final });
        if (verdict === 'VERIFIED') a.last_pass_sha = sha;
        if (final) { a.final_verdict = { verdict, sha, evidence, at: nowIso() }; st.final_sha = sha; }
        if (final && verdict === 'VERIFIED' && a.held) { a.held = false; a.unheld_by_final = true; delete a.hold_reason; appendEvent(proj, 'ac_unhold', { id, by: 'final' }); }
      });
      appendEvent(proj, 'verdict', { id, verdict, sha, final });
      return out(`${id} ${verdict}${final ? ' (final)' : ''} @ ${sha}`);
    }
    if (sub === 'hold') {
      const reason = opt('--reason');
      if (!id || !reason || reason === true) fail(1, 'usage: murba ac hold <ID> --reason <r>');
      updateState(proj, st => { const a = st.ac[id]; if (!a) fail(1, `AC 없음: ${id}`); a.held = true; a.hold_reason = reason; });
      appendDecision(proj, { phase: readState(proj).phase, cls: 'user-direction', decision: `${id} 보류`, why: reason, cost: `${id} 미구현·미검증으로 보고` });
      appendEvent(proj, 'ac_hold', { id, reason });
      return out(`${id} 보류: ${reason}`);
    }
    if (sub === 'unhold') {
      if (!id) fail(1, 'usage: murba ac unhold <ID>');
      updateState(proj, st => { const a = st.ac[id]; if (!a) fail(1, `AC 없음: ${id}`); if (!a.held) fail(2, `${id}는 보류 상태가 아님`); a.held = false; delete a.hold_reason; });
      appendEvent(proj, 'ac_unhold', { id, by: 'cli' });
      return out(`${id} 보류 해제`);
    }
    fail(1, 'usage: murba ac <sync|next|verdict|hold|unhold>');
  },

  'fix-round'() {
    need();
    const id = positional()[1];
    if (!id) fail(1, 'usage: murba fix-round <ID>');
    let n = 0;
    updateState(proj, st => {
      const a = st.ac[id]; if (!a) fail(1, `AC 없음: ${id}`);
      if ((a.fix_rounds || 0) >= MACHINE.limits.fix_rounds_per_ac) { appendEvent(proj, 'fix_cap', { id }); fail(3, `상한: ${id} 수정 ${a.fix_rounds}회. murba ac hold ${id} --reason … 후 다음 AC`); }
      if ((st.counters.fix_total || 0) >= st.budget.max_fix_rounds_total) fail(3, `상한: 전체 수정 ${st.counters.fix_total}회`);
      a.fix_rounds = (a.fix_rounds || 0) + 1; n = a.fix_rounds;
      st.counters.fix_total = (st.counters.fix_total || 0) + 1;
    });
    appendEvent(proj, 'fix_round', { id, round: n });
    out(`${id} 수정 ${n}/${MACHINE.limits.fix_rounds_per_ac}회차${n === MACHINE.limits.fix_rounds_per_ac ? ' — 마지막 라운드: 상위 모델의 새 builder로' : ''}`);
  },

  approve() {
    need();
    const st0 = readState(proj);
    if (st0.phase !== 'approve') fail(2, `approve 단계가 아님(현재 ${st0.phase})`);
    if (st0.mode === 'headless' && !st0.auto_approve) fail(2, 'headless 모드 자동 승인은 init 때 사전 승인(MURBA_HEADLESS=1 또는 --auto-approve)이 있었을 때만. 승인 대기로 보고서를 쓰고 끝낸다');
    if (!st0.ac_order.length) fail(2, 'AC 없음 — murba ac sync 먼저');
    const specP = path.join(md, 'spec.md');
    const hash = sha256File(specP);
    updateState(proj, st => { st.approved = true; st.spec_hash = hash; st.approved_at = nowIso(); st.approved_by = st.mode === 'headless' ? 'auto-approve(headless)' : 'user'; });
    appendEvent(proj, 'approved', { spec_hash: hash, by: st0.mode === 'headless' ? 'auto' : 'user' });
    out(`승인 기록: spec sha256=${hash.slice(0, 12)}…, AC ${st0.ac_order.length}개 고정`);
  },

  'lock-tests'() {
    need();
    const globs = positional().slice(1);
    if (!globs.length) fail(1, 'usage: murba lock-tests <glob...>');
    const ph = readState(proj).phase;
    const amend = flag('--amend');
    if (amend) {
      if (!['build', 'fix', 'evaluate'].includes(ph)) fail(2, `lock-tests --amend 거부: build·fix·evaluate 단계에서만(현재 ${ph})`);
      const reason = opt('--reason');
      if (!reason || reason === true || !String(reason).trim()) fail(1, 'usage: murba lock-tests --amend <glob...> --reason "<테스트 결함 근거>"');
    } else if (!['setup', 'test-write'].includes(ph)) fail(2, `lock-tests 거부: setup·test-write 단계에서만(현재 ${ph}). 테스트 자체 결함이면 test-writer 재작성 후 --amend`);
    const res = globs.map(globToRegex);
    const files = walk(proj).map(f => path.relative(proj, f).split(path.sep).join('/')).filter(r => res.some(re => re.test(r)));
    if (!files.length) fail(2, `일치하는 테스트 파일 없음: ${globs.join(' ')}`);
    const hashes = Object.fromEntries(files.map(f => [f, sha256File(path.join(proj, f))]));
    if (amend) {
      const reason = String(opt('--reason'));
      const locked = readState(proj).test_hashes || {};
      const notLocked = files.filter(f => !locked[f]);
      if (notLocked.length) fail(2, `--amend는 이미 고정된 테스트만: ${notLocked.join(', ')}`);
      const changed = files.filter(f => locked[f] !== hashes[f]);
      updateState(proj, st => {
        st.test_hashes = { ...st.test_hashes, ...hashes };
        st.test_amendments = [...(st.test_amendments || []), { files: changed, reason, phase: ph, at: nowIso() }];
      });
      appendDecision(proj, { phase: ph, cls: 'taste', decision: `TEST_AMENDED: ${changed.join(', ') || '(변경 없음)'}`, why: reason, cost: '고친 테스트가 원래 AC보다 약하면 거짓 통과' });
      appendEvent(proj, 'test_amended', { files: changed, reason });
      return out(`테스트 ${changed.length}개 재고정(TEST_AMENDED): ${changed.join(', ') || '없음'}`);
    }
    updateState(proj, st => { st.test_hashes = { ...st.test_hashes, ...hashes }; });
    appendEvent(proj, 'lock_tests', { count: files.length });
    out(`테스트 ${files.length}개 해시 고정:\n${files.map(f => '  ' + f).join('\n')}`);
  },

  'check-tests'() {
    need();
    const st = readState(proj);
    const bad = changedTests(st);
    if (bad.length) {
      appendEvent(proj, 'tests_tampered', { files: bad });
      appendDecision(proj, { phase: st.phase, cls: 'user-direction', decision: `고정된 테스트 변경 감지: ${bad.join(', ')}`, why: '테스트 조작 방지', cost: '판정 신뢰 불가' });
      process.stderr.write(bad.map(b => '  ' + b).join('\n') + '\n');
      fail(2, `고정 테스트 ${bad.length}개 변경`);
    }
    out(`고정 테스트 ${Object.keys(st.test_hashes || {}).length}개 변경 없음`);
  },

  decide() {
    need();
    const [, cls, decision] = positional();
    if (!DECISION_CLASSES.includes(cls) || !decision) fail(1, `usage: murba decide <${DECISION_CLASSES.join('|')}> "<결정>" --why "<이유>" [--cost "<비용>"] [--evidence <p>]`);
    const why = opt('--why', ''); const cost = opt('--cost', ''); const evidence = opt('--evidence', '');
    const st = readState(proj);
    appendDecision(proj, { phase: st.phase, cls, decision, why: why === true ? '' : why, cost: cost === true ? '' : cost, evidence: evidence === true ? '' : evidence });
    appendEvent(proj, 'decision', { cls, decision });
    out(`결정 기록(${cls}): ${decision}`);
  },

  handoff() {
    need();
    const ph = positional()[1];
    if (!ph || !MACHINE.phases[ph]) fail(1, 'usage: murba handoff <phase> < 내용');
    const body = core.readStdin();
    if (!body.trim()) fail(1, 'handoff 내용이 비어 있음(stdin)');
    const p = path.join(md, 'handoff', `${ph}.md`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body.endsWith('\n') ? body : body + '\n');
    fs.appendFileSync(path.join(md, 'handoff', 'history.md'), `\n## ${nowIso()} ${ph}\n${body}\n`);
    appendEvent(proj, 'handoff', { phase: ph, bytes: body.length });
    out(`handoff 저장: .murba/handoff/${ph}.md`);
  },

  'evidence-run'() {
    need();
    const rel = `.murba/evidence/run-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
    if (fs.existsSync(path.join(proj, rel))) fail(2, `${rel} 이미 있음 — 1초 뒤 다시`);
    fs.mkdirSync(path.join(proj, rel), { recursive: true });
    fs.writeFileSync(path.join(md, 'evidence', 'CURRENT'), rel + '\n');
    appendEvent(proj, 'evidence_run', { dir: rel });
    out(rel);
  },

  budget() {
    need();
    if (flag('--subagent')) updateState(proj, st => { st.counters.subagents = (st.counters.subagents || 0) + 1; });
    const st = readState(proj);
    const el = Math.round((Date.now() - Date.parse(st.started_at)) / 60000);
    const over = [];
    if (el > st.budget.max_minutes) over.push(`시간 ${el}/${st.budget.max_minutes}분`);
    if ((st.counters.subagents || 0) > st.budget.max_subagents) over.push(`서브에이전트 ${st.counters.subagents}/${st.budget.max_subagents}`);
    if ((st.counters.fix_total || 0) > st.budget.max_fix_rounds_total) over.push(`수정 ${st.counters.fix_total}/${st.budget.max_fix_rounds_total}`);
    out(`예산: 시간 ${el}/${st.budget.max_minutes}분, 서브에이전트 ${st.counters.subagents || 0}/${st.budget.max_subagents}, 수정 ${st.counters.fix_total || 0}/${st.budget.max_fix_rounds_total}`);
    if (over.length) { appendEvent(proj, 'budget_exceeded', { over }); fail(3, `예산 초과: ${over.join(', ')} — 통과 증거 저장 후 report로`); }
  },

  report() {
    need();
    const { mdText, html } = renderReport(proj);
    fs.writeFileSync(path.join(md, 'report.md'), mdText);
    fs.writeFileSync(path.join(md, 'report.html'), html);
    appendEvent(proj, 'report', {});
    out('보고서 생성: .murba/report.md, .murba/report.html');
  },

  help() {
    out(`murba <init|status|phase|ac|fix-round|approve|lock-tests|check-tests|decide|handoff|evidence-run|budget|report>\n자세한 계약: ${path.join(here, '..', 'assets', 'CONTRACT.md')}`);
  },
};

// 호출자 검사: guard가 PreToolUse마다 .murba/caller에 agent_type(또는 main)을 쓴다.
// 서브에이전트는 읽기 명령만. 파일이 없으면 main(사람·테스트가 직접 실행). 한계: 에이전트를 동시에 돌리면 표식이 공유된다(현재 전경 실행만)
const SUBAGENT_OK = new Set(['status', 'check-tests', 'help']);
function callerCheck(cmd) {
  let caller = 'main';
  try { caller = fs.readFileSync(path.join(md, 'caller'), 'utf8').trim() || 'main'; } catch { caller = 'main'; }
  if (!caller.startsWith('murba-good-work:')) return;
  if (SUBAGENT_OK.has(cmd)) return;
  if (cmd === 'budget' && !flag('--subagent')) return;
  if (cmd === 'evidence-run' && caller === 'murba-good-work:evaluator') return;
  fail(2, `CALLER_SUBAGENT: ${caller} cannot run murba ${cmd}`);
}
// 원장 무결성: status·report·init·help는 변조여도 실행(보고서에 ❌로 표시)
function ledgerCheck(cmd) {
  if (['status', 'report', 'init', 'help'].includes(cmd)) return;
  if (!fs.existsSync(statePath(proj))) return;
  // 쓰기 도중(state 교체 → 해시 교체 사이)을 변조로 오인하지 않도록 잠금 안에서 확인
  const bad = withLock(proj, () => {
    if (!ledgerTampered(proj)) return false;
    const s2 = readState(proj) || {};
    if (!s2.ledger_tamper_logged) { appendEvent(proj, 'ledger_tampered', { cmd }); s2.ledger_tamper_logged = true; writeJsonAtomic(statePath(proj), s2); }
    return true;
  });
  if (!bad) return;
  fail(2, 'LEDGER_TAMPERED: .murba/state.json이 murba CLI 밖에서 바뀜 — 되돌리거나 사용자에게 보고(murba report)');
}

const c = argv[0];
if (!c || !cmds[c]) { cmds.help(); process.exit(c ? 1 : 0); }
try { callerCheck(c); ledgerCheck(c); cmds[c](); } catch (e) {
  process.stderr.write(`murba: ${String(e && e.message || e)}\n`);
  process.exit(e instanceof Fail ? e.code : 1);
}
