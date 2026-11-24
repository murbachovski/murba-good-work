import { join } from 'node:path';
import { grade, runJs, url, seedTestsAgainst, ok, F, eq } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/money.js')))});`;

function table(name, fn, cases) {
  return ({ work }) => {
    const r = runJs(work, load(work) + `out(${JSON.stringify(cases.map((c) => c[0]))}.map(a=>m.${fn}(...a)));`);
    if (!r.ok) return F(`${name} 실행 실패: ` + r.stderr);
    const bad = cases.filter((c, i) => !eq(r.value[i], c[1]));
    return ok(bad.length === 0, bad.length ? '틀림: ' + JSON.stringify(bad.map((c) => [c[0], 'want', c[1], 'got', r.value[cases.indexOf(c)]])) : `${cases.length}개 정확`);
  };
}

await grade([
  table('toCents', 'toCents', [[['19.99'], 1999], [['0.29'], 29], [['1.15'], 115], [['4.35'], 435], [['-5.5'], -550], [['19'], 1900], [['0.07'], 7], [['12.50'], 1250]]),
  table('formatCents', 'formatCents', [[[-150], '-1.50'], [[-5], '-0.05'], [[0], '0.00'], [[1234567], '12,345.67'], [[-123456], '-1,234.56'], [[100], '1.00'], [[99], '0.99']]),
  ({ work }) => {
    const cases = [[100, 3, [34, 33, 33]], [10, 4, [3, 3, 2, 2]], [5, 1, [5]], [7, 7, [1, 1, 1, 1, 1, 1, 1]], [1, 3, [1, 0, 0]], [1000, 3, [334, 333, 333]]];
    const r = runJs(work, load(work) + `out(${JSON.stringify(cases)}.map(([t,n])=>m.splitCents(t,n)));
      out2: 0;`.replace('out2: 0;', ''));
    if (!r.ok) return F('splitCents 실행 실패: ' + r.stderr);
    const bad = cases.filter((c, i) => !eq(r.value[i], c[2]));
    const r2 = runJs(work, load(work) + `out(await attempt(async()=>m.splitCents(10,0)));`);
    const thrown = r2.ok && !r2.value.ok && r2.value.name === 'RangeError';
    return ok(bad.length === 0 && thrown, bad.length ? '틀림: ' + JSON.stringify(bad.map((c) => [c[0], c[1], 'got', r.value[cases.indexOf(c)]])) : `${cases.length}개 정확, n=0 RangeError=${thrown}`);
  },
  ({ work, seed }) => {
    const t = seedTestsAgainst(work, seed);
    return ok(t.pass, `원본 테스트 ${t.tail}`);
  },
]);
