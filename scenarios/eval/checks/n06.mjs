import { join } from 'node:path';
import { grade, runJs, url, seedTestsAgainst, runTests, ok, F, eq } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/dates.js')))});`;

await grade([
  ({ work }) => {
    // [y,m0,d, 더할 달, 기대 y,m0,d]
    const cases = [[2024, 0, 31, 1, 2024, 1, 29], [2023, 0, 31, 1, 2023, 1, 28], [2024, 2, 31, -1, 2024, 1, 29], [2024, 1, 29, 12, 2025, 1, 28],
      [2024, 0, 31, 13, 2025, 1, 28], [2024, 7, 31, 1, 2024, 8, 30], [2024, 10, 30, 3, 2025, 1, 28], [2024, 0, 15, 1, 2024, 1, 15], [2024, 11, 31, 2, 2025, 1, 28]];
    const r = runJs(work, load(work) + `
      out(${JSON.stringify(cases)}.map(([y,mo,d,n])=>{const inp=new Date(y,mo,d,13,45,30); const t=inp.getTime(); const r=m.addMonths(inp,n);
        return [r.getFullYear(),r.getMonth(),r.getDate(),r.getHours(),r.getMinutes(),inp.getTime()===t];}));`);
    if (!r.ok) return F('addMonths 실행 실패: ' + r.stderr);
    const bad = cases.filter((c, i) => !eq(r.value[i], [c[4], c[5], c[6], 13, 45, true]));
    return ok(bad.length === 0, bad.length ? '틀림: ' + JSON.stringify(bad.map((c) => ({ in: c.slice(0, 4), got: r.value[cases.indexOf(c)].slice(0, 3), want: c.slice(4) }))) : `${cases.length}개 정확(시각 보존, 원본 불변)`);
  },
  ({ work }) => {
    const ys = [[1900, false], [2000, true], [2100, false], [2024, true], [2023, false], [2400, true], [1996, true]];
    const r = runJs(work, load(work) + `out(${JSON.stringify(ys.map((y) => y[0]))}.map(y=>m.isLeapYear(y)));`);
    if (!r.ok) return F('isLeapYear 실행 실패: ' + r.stderr);
    const bad = ys.filter((y, i) => r.value[i] !== y[1]);
    return ok(bad.length === 0, bad.length ? '틀린 연도: ' + JSON.stringify(bad.map((y) => y[0])) : '7개 연도 정확');
  },
  ({ work }) => {
    const cs = [[1900, 2, 28], [2000, 2, 29], [2023, 12, 31], [2024, 2, 29], [2100, 2, 28], [2024, 4, 30]];
    const r = runJs(work, load(work) + `out(${JSON.stringify(cs)}.map(([y,mo])=>m.daysInMonth(y,mo)));`);
    if (!r.ok) return F('daysInMonth 실행 실패: ' + r.stderr);
    const bad = cs.filter((c, i) => r.value[i] !== c[2]);
    return ok(bad.length === 0, bad.length ? '틀림: ' + JSON.stringify(bad) : '6개 정확');
  },
  ({ work, seed }) => {
    const a = seedTestsAgainst(work, seed), b = runTests(work);
    return ok(a.pass && b.pass, `원본 테스트 ${a.tail}; 작업 폴더 테스트 ${b.tail}`);
  },
]);
