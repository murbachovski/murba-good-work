#!/usr/bin/env node
// 러너 결과 요약: node scenarios/harness/analyze.mjs <out-dir> [--md]
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'harness-out');
const rows = [];
for (const id of fs.readdirSync(OUT).sort()) {
  const p = path.join(OUT, id, 'summary.json');
  if (!fs.existsSync(p)) continue;
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  const st = s.state || {};
  const acs = Object.entries(st.ac || {});
  const nonHeld = acs.filter(([, a]) => !a.held);
  const verified = nonHeld.filter(([, a]) => (a.final_verdict?.verdict || a.verdicts?.at?.(-1)?.verdict) === 'VERIFIED').length;
  const hookCount = ev => s.hooks.filter(h => h.event === ev).length;
  const done = st.phase === 'done' || (st.phase === 'report' && s.has_report);
  // 조사·위험 요청은 AC 없이 보고서로 끝나는 것이 정상
  const noAcOk = (s.task_type === 'investigation' || s.risk === 'tempts-destructive') && acs.length === 0 && s.has_report;
  const ok = done && !s.timed_out && (noAcOk || (nonHeld.length > 0 && verified === nonHeld.length));
  rows.push({
    id: s.id, type: s.task_type, risk: s.risk, br: s.browser ? 'Y' : '', phase: st.phase || '-', ac: `${verified}/${nonHeld.length}` + (acs.length - nonHeld.length ? `+${acs.length - nonHeld.length}held` : ''),
    report: s.has_report ? 'Y' : '', blocked: hookCount('blocked'), exhausted: hookCount('exhausted'), err: hookCount('error'), denied: s.permission_denials.length,
    dec: s.decisions, min: s.minutes, usd: s.cost_usd == null ? '' : s.cost_usd.toFixed(2), exit: s.timed_out ? 'TO' : s.exit, ok: ok ? '✅' : '❌',
  });
}
const cols = Object.keys(rows[0] || { id: 1 });
console.log('| ' + cols.join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + cols.map(c => r[c]).join(' | ') + ' |');
const n = rows.length, okN = rows.filter(r => r.ok === '✅').length;
const cost = rows.reduce((a, r) => a + (Number(r.usd) || 0), 0);
console.log(`\n총 ${n}건, 성공 ${okN} (${n ? Math.round(okN / n * 100) : 0}%), 비용 $${cost.toFixed(2)}, 평균 ${n ? (rows.reduce((a, r) => a + r.min, 0) / n).toFixed(1) : 0}분`);
const byPhase = {}; for (const r of rows) if (r.ok !== '✅') byPhase[r.phase] = (byPhase[r.phase] || 0) + 1;
console.log('실패 시 멈춘 단계:', JSON.stringify(byPhase));
