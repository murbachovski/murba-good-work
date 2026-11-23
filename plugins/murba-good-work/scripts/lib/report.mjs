// Deterministic report generator: .murba state/events/decisions → report.md + report.html (no LLM).
import fs from 'node:fs';
import path from 'node:path';
import { MACHINE, readState, readEvents, readDecisions, readJsonFile, murbaDir, lastVerdict, nonHeldAcs, missingRequires } from './core.mjs';

const ICON = { VERIFIED: '✅', NOT_VERIFIED: '❌', INCONCLUSIVE: '⚠️', HELD: '⏸', NONE: '⚠️' };
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

export function buildMarkdown(proj) {
  const st = readState(proj);
  const ev = readEvents(proj);
  const dec = readDecisions(proj);
  const plan = readJsonFile(path.join(murbaDir(proj), 'run-plan.json'), {});
  const hooks = (() => {
    const p = path.join(murbaDir(proj), 'logs', 'hooks.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  })();

  const ids = st.ac_order || [];
  const acStatus = id => {
    const a = st.ac[id];
    if (a.held) return 'HELD';
    if (a.final_verdict) return a.final_verdict.verdict;
    return lastVerdict(a) || 'NONE';
  };
  const verified = ids.filter(id => acStatus(id) === 'VERIFIED' && st.ac[id].final_verdict);
  const failed = ids.filter(id => ['NOT_VERIFIED', 'INCONCLUSIVE', 'HELD'].includes(acStatus(id)));
  const unverified = ids.filter(id => !st.ac[id].held && !st.ac[id].final_verdict);
  const skipped = Object.entries(plan.phases || {}).filter(([, v]) => typeof v === 'string' ? v.startsWith('n/a') : (v && v.skip)).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : v.reason || 'n/a'}`);
  const tampered = ev.filter(e => e.kind === 'tests_tampered' || e.kind === 'acceptance_edited');
  const outOfScope = ev.filter(e => e.kind === 'out_of_scope');
  const flaky = ev.filter(e => e.kind === 'flaky');

  const L = [];
  L.push(`# murba 작업 보고서`, '');
  L.push(`- 생성: ${new Date().toISOString()} / 플러그인 ${st.plugin_version} / 모드 ${st.mode}${st.approved ? ` / 승인 ${st.approved_by || ''}` : ''}`, '');
  L.push('## 요약');
  L.push(`- **결과**: AC ${ids.length}개 중 최종 검증 ${verified.length}개, 실패·보류 ${failed.length}개, 미검증 ${unverified.length}개`);
  L.push(`- **현재 단계**: ${st.phase} (${(MACHINE.phases[st.phase] || {}).flow || ''})`);
  L.push(`- **결정 기록**: ${dec.length}건 (사용자 확인 필요 ${dec.filter(d => ['user-direction', 'irreversible'].includes(d.class)).length}건)`, '');

  L.push('## 먼저 볼 것', '| 구분 | 내용 |', '|---|---|');
  const failItems = [...failed.map(id => `${id} ${acStatus(id)}${st.ac[id].hold_reason ? `(${st.ac[id].hold_reason})` : ''}`), ...skipped.map(s => `생략 ${s}`)];
  L.push(`| ❌ 실패·생략 | ${cell(failItems.join(', ') || '없음')} |`);
  const unv = [...unverified.map(id => `${id} 최종 판정 없음`), ...flaky.map(f => `flaky ${f.test || ''}`), ...tampered.map(t => `${t.kind}`)];
  L.push(`| ⚠️ 미검증 | ${cell(unv.join(', ') || '없음')} |`);
  L.push(`| 범위 밖 변경 | ${cell(outOfScope.map(o => o.detail || o.path).join(', ') || '기록 없음')} |`, '');

  L.push('## 단계별 결과', '| 단계 | 흐름 | 상태 | 진입 시각 |', '|---|---|---|---|');
  const entered = {};
  for (const e of ev.filter(e => e.kind === 'phase')) entered[e.to] = entered[e.to] || e.ts;
  const order = Object.keys(MACHINE.phases);
  const curIdx = order.indexOf(st.phase);
  for (const ph of order) {
    const i = order.indexOf(ph);
    const visited = ph === 'triage' || entered[ph];
    let s = '—';
    if (ph === st.phase) s = st.phase === 'done' ? '✅' : (missingRequires(proj, st).length ? '⚠️ 진행 중' : '✅ 조건 충족');
    else if (visited && i < curIdx) s = '✅';
    else if (visited) s = '✅';
    L.push(`| ${ph} | ${MACHINE.phases[ph].flow} | ${s} | ${entered[ph] || (ph === 'triage' ? st.started_at : '')} |`);
  }
  L.push('');

  L.push('## AC별 판정', '| AC | 내용 | 최종 | 마지막 판정 | SHA | 증거 | 수정 |', '|---|---|---|---|---|---|---|');
  for (const id of ids) {
    const a = st.ac[id]; const lv = a.verdicts && a.verdicts.length ? a.verdicts[a.verdicts.length - 1] : null;
    const fin = a.held ? `${ICON.HELD} 보류` : a.final_verdict ? `${ICON[a.final_verdict.verdict]} ${a.final_verdict.verdict}` : `${ICON.NONE} 없음`;
    L.push(`| ${id}${a.browser ? ' [browser]' : ''} | ${cell(a.text)} | ${fin} | ${lv ? `${ICON[lv.verdict]} ${lv.verdict}` : '-'} | ${cell((a.final_verdict || lv || {}).sha || '').slice(0, 10)} | ${cell((a.final_verdict || lv || {}).evidence || '')} | ${a.fix_rounds || 0} |`);
  }
  if (!ids.length) L.push('| - | AC 없음 | | | | | |');
  L.push('');

  L.push('## 내가 내린 결정 (틀렸을 때 비용)', '| 시각 | 단계 | 분류 | 결정 | 이유 | 틀렸을 때 비용 |', '|---|---|---|---|---|---|');
  for (const d of dec) L.push(`| ${d.ts.slice(11, 19)} | ${d.phase} | ${d.class} | ${cell(d.decision)} | ${cell(d.why)} | ${cell(d.cost_if_wrong)} |`);
  if (!dec.length) L.push('| - | - | - | 없음 | | |');
  L.push('');

  L.push('## 남은 질문 (사용자 확인 필요)');
  const qs = dec.filter(d => ['user-direction', 'irreversible'].includes(d.class));
  if (qs.length) qs.forEach((d, i) => L.push(`${i + 1}. [${d.class}] ${d.decision} — ${d.why}`)); else L.push('- 없음');
  L.push('');

  const hc = {};
  for (const h of hooks) { const k = `${h.hook}:${h.event}`; hc[k] = (hc[k] || 0) + 1; }
  L.push('## hook 기록', '| hook:이벤트 | 횟수 |', '|---|---|');
  for (const [k, v] of Object.entries(hc).sort()) L.push(`| ${k} | ${v} |`);
  if (!Object.keys(hc).length) L.push('| - | 0 |');
  L.push('', '## 예산', `- 수정 라운드 ${st.counters.fix_total || 0}/${st.budget.max_fix_rounds_total}, 서브에이전트 ${st.counters.subagents || 0}/${st.budget.max_subagents}, Stop 차단 ${st.counters.stop_total || 0}/${MACHINE.limits.stop_blocks_per_run}`);
  return L.join('\n') + '\n';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(✅|❌|⚠️|⏸)/g, m => `<span class="b ${{ '✅': 'ok', '❌': 'bad', '⚠️': 'warn', '⏸': 'hold' }[m]}">${m}</span>`);
}
function splitRow(r) {
  const cells = []; let cur = '';
  const t = r.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < t.length; i++) { if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; } else if (t[i] === '|') { cells.push(cur.trim()); cur = ''; } else cur += t[i]; }
  cells.push(cur.trim());
  return cells;
}

export function mdToHtml(md) {
  const lines = md.split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^# /.test(l)) { out.push(`<h1>${inline(l.slice(2))}</h1>`); i++; continue; }
    if (/^## /.test(l)) { out.push(`<h2>${inline(l.slice(3))}</h2>`); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const head = splitRow(rows[0]); const body = rows.slice(2).map(splitRow);
      out.push('<div class="t"><table><thead><tr>' + head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^- /.test(l)) { const it = []; while (i < lines.length && /^- /.test(lines[i])) it.push(lines[i++].slice(2)); out.push('<ul>' + it.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'); continue; }
    if (/^\d+\. /.test(l)) { const it = []; while (i < lines.length && /^\d+\. /.test(lines[i])) it.push(lines[i++].replace(/^\d+\. /, '')); out.push('<ol>' + it.map(x => `<li>${inline(x)}</li>`).join('') + '</ol>'); continue; }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('\n');
}

const CSS = `:root{--bg:#fafaf9;--fg:#1c1917;--mut:#57534e;--line:#e7e5e4;--card:#fff;--ok:#15803d;--warn:#b45309;--bad:#b91c1c;--hold:#6d28d9}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#e7e5e4;--mut:#a8a29e;--line:#292524;--card:#1c1917;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--hold:#c4b5fd}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px}h1{font-size:26px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 10px;padding-top:12px;border-top:1px solid var(--line)}
.t{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}th,td{text-align:left;vertical-align:top;padding:7px 9px;border-bottom:1px solid var(--line)}
th{color:var(--mut);font-size:13px;white-space:nowrap}code{font:13px ui-monospace,Menlo,monospace;background:var(--line);padding:1px 4px;border-radius:4px}
.b{font-weight:700}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.hold{color:var(--hold)}ul,ol{padding-left:22px}`;

export function renderReport(proj) {
  const mdText = buildMarkdown(proj);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>murba 작업 보고서</title><style>${CSS}</style></head><body><main>\n${mdToHtml(mdText)}\n</main></body></html>\n`;
  return { mdText, html };
}
