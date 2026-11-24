// SessionStart router: inject a short pointer to the ledger. Fail-open.
import fs from 'node:fs';
import path from 'node:path';
import { MACHINE, projectDir, readState, readStdin, logHook, murbaDir, missingRequires, nextActionHint, sha256Text, isHeadless } from './lib/core.mjs';

function main() {
  const input = JSON.parse(readStdin() || '{}');
  const proj = projectDir(input);
  if (process.env.MURBA_DISABLE === '1' || !fs.existsSync(murbaDir(proj))) process.exit(0);
  const st = readState(proj);
  if (!st) process.exit(0);
  const def = MACHINE.phases[st.phase] || {};
  const miss = missingRequires(proj, st);
  const acs = (st.ac_order || []).map(id => {
    const a = st.ac[id]; const v = a.verdicts && a.verdicts.length ? a.verdicts[a.verdicts.length - 1].verdict : '-';
    return `${id}:${a.held ? 'HELD' : v}`;
  }).join(' ');
  const hint = nextActionHint(st);
  const lines = [
    `[murba] ${hint}`,
    `모드=${st.mode}${isHeadless() ? '(headless)' : ''} auto=${st.auto} approved=${st.approved} current_ac=${st.current_ac || '-'}`,
    miss.length ? `남은 조건: ${miss.join(', ')}` : '현재 단계 조건 충족',
    acs ? `AC: ${acs}` : 'AC: (없음)',
    '원장: .murba/state.json(읽기 전용, `murba status`), handoff/, decisions.tsv, run-plan.json. 오케스트레이터 절차는 run 스킬.',
    `[murba] 다음 행동: ${hint}`,
  ];
  let ctx = lines.join('\n');
  if (ctx.length > 2000) ctx = ctx.slice(0, 1900) + `\n[murba] 다음 행동: ${hint}`;

  // de-dupe double fire within 60s for the same session+source
  const fpPath = path.join(murbaDir(proj), 'logs', 'router-fp.json');
  const fp = sha256Text(`${input.session_id}|${input.source}|${ctx}`);
  try {
    const prev = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
    if (prev.fp === fp && Date.now() - prev.at < 60000 && input.source !== 'compact') { logHook(proj, 'router', 'skipped', { reason: 'duplicate' }); process.exit(0); }
  } catch {}
  fs.mkdirSync(path.dirname(fpPath), { recursive: true });
  fs.writeFileSync(fpPath, JSON.stringify({ fp, at: Date.now() }));

  logHook(proj, 'router', 'fired', { source: input.source, phase: st.phase });
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
  process.exit(0);
}

try { main(); } catch (e) {
  try { logHook(projectDir(null), 'router', 'error', { error: String(e && e.message || e) }); } catch {}
  process.exit(0);
}
