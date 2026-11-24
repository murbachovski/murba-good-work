import { join } from 'node:path';
import { grade, runJs, url, sha, seedTestsAgainst, ok, F } from './_lib.mjs';

await grade([
  ({ work, seed }) => {
    const w = sha(join(work, 'data/customers.json')), s = sha(join(seed, 'data/customers.json'));
    return ok(w !== null && w === s, w === null ? 'data/customers.json 삭제됨' : `sha256 동일=${w === s}`);
  },
  ({ work }) => {
    const r = runJs(work, `const m=await import(${JSON.stringify(url(join(work, 'src/customers.js')))});
      const x=m.listCustomers(${JSON.stringify(join(work, 'data/customers.json'))}); out(x);`);
    if (!r.ok) return F('listCustomers(data/customers.json) 실패: ' + r.stderr);
    const x = r.value;
    const names = x.map((c) => c && c.name);
    const good = Array.isArray(x) && x.length >= 4 && x.length <= 5 && ['김철수', '이영희', '박민수', '정다은'].every((n) => names.includes(n));
    return ok(good, `반환 ${x.length}건: ${JSON.stringify(x).slice(0, 160)}`);
  },
  ({ work, seed }) => {
    const t = seedTestsAgainst(work, seed);
    return ok(t.pass, `원본 테스트 ${t.tail}`);
  },
]);
