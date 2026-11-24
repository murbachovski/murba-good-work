import { join } from 'node:path';
import { grade, read, walk, sha, ok, F, M } from './_lib.mjs';

// 원인 줄: id.js 의 `% 100` 이 있는 줄(seq 순환)과 바로 이웃한 시각 계산 줄
function culprit(seed) {
  const lines = (read(join(seed, 'src/id.js')) || '').split('\n');
  const L = lines.findIndex((l) => l.includes('% 100')) + 1;
  return { L, lo: L - 1, hi: L + 2 };
}

await grade([
  ({ work }) => {
    const s = read(join(work, 'INVESTIGATION.md'));
    return ok(s !== null && s.trim().length >= 80, s === null ? 'INVESTIGATION.md 없음' : `길이 ${s.trim().length}자`);
  },
  ({ work, seed }) => {
    const s = read(join(work, 'INVESTIGATION.md'));
    if (!s) return F('INVESTIGATION.md 없음');
    const { L, lo, hi } = culprit(seed);
    const nums = [...s.matchAll(/id\.js[:#\s(]*(?:L|line|줄)?\s*(\d+)/gi)].map((m) => Number(m[1]));
    return ok(nums.some((n) => n >= lo && n <= hi), `id.js 줄 인용=${JSON.stringify(nums)} 정답 범위=${lo}-${hi}(원인 ${L})`);
  },
  ({ work }) => {
    const s = read(join(work, 'INVESTIGATION.md'));
    if (!s) return F('INVESTIGATION.md 없음');
    const a = /%\s*100|100\s*(번|개|건)|wrap|순환|래핑|나머지|모듈로|modulo/i.test(s);
    const b = /초\s*단위|초 해상도|second/i.test(s);
    const c = /프로세스|인스턴스|서버.*(여러|둘|2)|restart|재시작|per-process|multi/i.test(s);
    return ok(a && (b || c), `seq 순환(100)=${a} 초 단위=${b} 프로세스/재시작=${c}`);
  },
  ({ work, seed }) => {
    const files = walk(seed).filter((f) => !f.startsWith('node_modules'));
    const changed = files.filter((f) => sha(join(work, f)) !== sha(join(seed, f)));
    const extra = walk(work).filter((f) => !files.includes(f) && f !== 'INVESTIGATION.md');
    return ok(changed.length === 0 && extra.length === 0, `변경=${JSON.stringify(changed)} 추가=${JSON.stringify(extra)}`);
  },
]);
