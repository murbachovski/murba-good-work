// Stop gate: keep the unattended pipeline going until the current phase's artifacts exist. Fail-open.
import fs from 'node:fs';
import path from 'node:path';
import { MACHINE, projectDir, readState, readStdin, updateState, appendEvent, appendDecision, logHook, murbaDir, missingRequires, nextActionHint } from './lib/core.mjs';

function allow() { process.exit(0); }
function block(reason) { process.stdout.write(JSON.stringify({ decision: 'block', reason })); process.exit(0); }

function main() {
  const input = JSON.parse(readStdin() || '{}');
  const proj = projectDir(input);
  if (!fs.existsSync(murbaDir(proj)) || fs.existsSync(path.join(murbaDir(proj), 'disable'))) allow();
  const st = readState(proj);
  if (!st || !st.auto || st.phase === 'done') { logHook(proj, 'stop-gate', 'skipped', { phase: st && st.phase, auto: st && st.auto }); allow(); }

  const bg = Array.isArray(input.background_tasks) ? input.background_tasks : [];
  if (bg.length) { logHook(proj, 'stop-gate', 'deferred', { phase: st.phase, background: bg.length }); allow(); }

  const limits = MACHINE.limits;
  const msg = String(input.last_assistant_message || '').trim();
  if (/[?？]\s*$/.test(msg) || /할까요\s*[?？]?\s*$/.test(msg)) {
    appendDecision(proj, { phase: st.phase, cls: 'taste', decision: '질문으로 턴 종료 시도', why: msg.slice(-200), cost: '추천안으로 진행됨. 보고서에서 확인' });
    logHook(proj, 'stop-gate', 'warn', { phase: st.phase, reason: 'question-ending' });
  }

  // budget (time)
  const maxMin = (st.budget && st.budget.max_minutes) || 120;
  const elapsed = (Date.now() - Date.parse(st.started_at || new Date().toISOString())) / 60000;
  if (elapsed > maxMin) {
    logHook(proj, 'stop-gate', 'exhausted', { phase: st.phase, reason: 'budget-time', elapsed: Math.round(elapsed) });
    appendDecision(proj, { phase: st.phase, cls: 'user-direction', decision: `시간 예산 초과(${Math.round(elapsed)}분 > ${maxMin}분)로 멈춤`, why: 'budget', cost: '남은 단계 미완료' });
    allow();
  }

  const per = (st.counters && st.counters.stop && st.counters.stop[st.phase]) || 0;
  const total = (st.counters && st.counters.stop_total) || 0;
  if (per >= limits.stop_blocks_per_phase || total >= limits.stop_blocks_per_run) {
    logHook(proj, 'stop-gate', 'exhausted', { phase: st.phase, per, total });
    appendEvent(proj, 'stop_exhausted', { phase: st.phase, per, total });
    appendDecision(proj, { phase: st.phase, cls: 'user-direction', decision: `Stop 게이트 상한 도달(${st.phase}: ${per}회, 전체 ${total}회) — 사람 확인 필요`, why: '같은 단계에서 반복 정지', cost: '파이프라인 중단 상태' });
    allow();
  }

  const miss = missingRequires(proj, st);
  updateState(proj, s => {
    s.counters = s.counters || {}; s.counters.stop = s.counters.stop || {};
    s.counters.stop[s.phase] = (s.counters.stop[s.phase] || 0) + 1;
    s.counters.stop_total = (s.counters.stop_total || 0) + 1;
  });
  logHook(proj, 'stop-gate', 'blocked', { phase: st.phase, missing: miss });
  const need = miss.length ? `남은 조건: ${miss.join(', ')}.` : '조건은 충족됨 — 다음 단계로 전이하세요.';
  block(`[murba] 자동 진행 중(${st.phase}). ${need} ${nextActionHint(st)}. 질문이 있으면 \`murba decide\`로 기록하고 추천안으로 계속하세요.`);
}

try { main(); } catch (e) {
  try { logHook(projectDir(null), 'stop-gate', 'error', { error: String(e && e.message || e) }); } catch {}
  process.exit(0);
}
