import { join } from 'node:path';
import { grade, runJs, url, seedTestsAgainst, ok, F, eq } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/ranges.js')))});`;

await grade([
  ({ work }) => {
    const cases = [['1-3, 5,8-10', [1, 2, 3, 5, 8, 9, 10]], ['3-5,4-6', [3, 4, 5, 6]], ['', []], [' 7 ', [7]], ['10,2,2,1-2', [1, 2, 10]], ['20', [20]]];
    const r = runJs(work, load(work) + `out(${JSON.stringify(cases.map((c) => c[0]))}.map(s=>m.parsePageRanges(s,20)));`);
    if (!r.ok) return F('parsePageRanges 실행 실패: ' + r.stderr);
    const bad = cases.filter((c, i) => !eq(r.value[i], c[1]));
    return ok(bad.length === 0, bad.length ? '틀림: ' + JSON.stringify(bad.map((c) => [c[0], r.value[cases.indexOf(c)]])) : `${cases.length}개 입력 정확`);
  },
  ({ work }) => {
    const bad = ['5-3', '0', '1-', '-3', 'a', '21', '1--3', '1,,2', '1-30', '2.5', '1-3-5'];
    const r = runJs(work, load(work) + `out(await Promise.all(${JSON.stringify(bad)}.map(s=>attempt(async()=>m.parsePageRanges(s,20)))));`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const notThrown = bad.filter((s, i) => r.value[i].ok);
    const r2 = runJs(work, load(work) + `out([await attempt(async()=>m.parsePageRanges('21',20)), await attempt(async()=>m.parsePageRanges('0',20))]);`);
    const rangeErr = r2.ok && r2.value.every((x) => !x.ok && x.name === 'RangeError');
    return ok(notThrown.length === 0 && rangeErr, `예외 안 난 입력=${JSON.stringify(notThrown)} 범위밖 RangeError=${rangeErr}`);
  },
  ({ work }) => {
    const cases = [[[1, 2, 3, 5, 8, 9, 10], '1-3,5,8-10'], [[5, 3, 1, 2, 2], '1-3,5'], [[], ''], [[7], '7'], [[1, 2], '1-2'], [[4, 6], '4,6']];
    const r = runJs(work, load(work) + `out(${JSON.stringify(cases.map((c) => c[0]))}.map(a=>m.formatRanges(a)));`);
    if (!r.ok) return F('formatRanges 실행 실패: ' + r.stderr);
    const bad = cases.filter((c, i) => r.value[i] !== c[1]);
    return ok(bad.length === 0, bad.length ? '틀림: ' + JSON.stringify(bad.map((c) => [c[0], r.value[cases.indexOf(c)]])) : `${cases.length}개 정확`);
  },
  ({ work, seed }) => {
    const t = seedTestsAgainst(work, seed);
    const r = runJs(work, `const m=await import(${JSON.stringify(url(join(work, 'src/paginate.js')))});out(m.paginate([1,2,3,4,5],3,2));`);
    return ok(t.pass && r.ok && eq(r.value, { items: [5], totalPages: 3 }), `원본 테스트 ${t.tail}; paginate=${JSON.stringify(r.value)}`);
  },
]);
