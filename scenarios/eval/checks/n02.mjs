import { join } from 'node:path';
import { grade, runJs, url, runTests, seedTestsAgainst, ok, F, eq } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/semver.js')))});`;

await grade([
  ({ work }) => {
    const pairs = [['1.10.0', '1.2.0', 1], ['1.2.0', '1.10.0', -1], ['1.0.0-alpha', '1.0.0', -1], ['1.0.0-alpha.1', '1.0.0-alpha.beta', -1],
      ['1.0.0-alpha.2', '1.0.0-alpha.11', -1], ['1.0.0-alpha', '1.0.0-alpha.1', -1], ['1.0.0+a', '1.0.0+b', 0], ['2.0.0', '2.0.0', 0], ['1.0.0-rc.1', '1.0.0-beta.9', 1]];
    const r = runJs(work, load(work) + `out(${JSON.stringify(pairs)}.map(([a,b])=>m.compare(a,b)));`);
    if (!r.ok) return F('compare 실행 실패: ' + r.stderr);
    const bad = pairs.filter((p, i) => r.value[i] !== p[2]);
    return ok(bad.length === 0, bad.length ? `틀린 쌍: ${JSON.stringify(bad.map((p) => [p[0], p[1], 'exp ' + p[2], 'got ' + r.value[pairs.indexOf(p)]]))}` : `${pairs.length}개 쌍 모두 -1/0/1 정확`);
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      const inp=['1.10.0','1.2.0','1.2.0-rc.1','0.9.9','1.2.0-alpha','1.2.0+x'];
      const copy=[...inp]; const res=m.sortVersions(inp);
      out({res, mutated: JSON.stringify(inp)!==JSON.stringify(copy)});`);
    if (!r.ok) return F('sortVersions 실행 실패: ' + r.stderr);
    const exp = ['0.9.9', '1.2.0-alpha', '1.2.0-rc.1', '1.2.0', '1.2.0+x', '1.10.0'];
    const res = r.value.res;
    // 1.2.0 과 1.2.0+x 는 동순위이므로 순서 허용
    const norm = (a) => a.map((x) => x.replace('+x', '')).join();
    return ok(Array.isArray(res) && norm(res) === norm(exp) && !r.value.mutated, `결과=${JSON.stringify(res)} 입력변경=${r.value.mutated}`);
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      out({a:m.bump('1.2.3','minor'),b:m.bump('1.2.3','major'),c:m.bump('1.2.3','patch'),d:m.bump('1.2.3-rc.1','patch'),
        e:await attempt(async()=>m.bump('1.2.3','huge')), f:await attempt(async()=>m.bump('x.y','patch'))});`);
    if (!r.ok) return F('bump 실행 실패: ' + r.stderr);
    const v = r.value;
    return ok(v.a === '1.3.0' && v.b === '2.0.0' && v.c === '1.2.4' && v.d === '1.2.3' && !v.e.ok && !v.f.ok, JSON.stringify(v));
  },
  ({ work, seed }) => {
    const inputs = ['1.2.3', '1.2.3-rc.1+b5', '0.0.1-a.b.c', '10.20.30+x.y'];
    const code = (d) => load(d) + `out(${JSON.stringify(inputs)}.map(v=>m.parse(v)));`;
    const a = runJs(seed, code(seed)), b = runJs(work, code(work));
    const t = seedTestsAgainst(work, seed);
    return ok(a.ok && b.ok && eq(a.value, b.value) && t.pass, `parse 동일=${a.ok && b.ok && eq(a.value, b.value)} 원본테스트 ${t.tail}`);
  },
]);
