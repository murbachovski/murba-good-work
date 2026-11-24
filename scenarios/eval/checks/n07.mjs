import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { grade, runJs, url, sha, seedTestsAgainst, runTests, ok, F, eq } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/events.js')))});`;

await grade([
  ({ work }) => {
    const r = runJs(work, load(work) + `const x=m.loadEvents(${JSON.stringify(join(work, 'data/events.jsonl'))}); out({types:x.events.map(e=>e.type),ts:x.events.map(e=>e.ts),skipped:x.skipped});`);
    if (!r.ok) return F('loadEvents(data/events.jsonl) 실패: ' + r.stderr);
    return ok(eq(r.value, { types: ['click', 'view', 'click', 'view'], ts: [1, 2, 3, 6], skipped: 2 }), JSON.stringify(r.value));
  },
  ({ work }) => {
    const t = mkdtempSync(join(tmpdir(), 'n07-'));
    try {
      const files = {
        empty: '', blanks: '\n\n\r\n', lf: '{"type":"a","ts":1}\n\n{"type":"b","ts":2}\n', nolast: '{"type":"a","ts":1}\n{"type":"b","ts":2}',
        tsStr: '{"type":"a","ts":"x"}\n{"type":"b","ts":2}\n', notObj: '[1,2]\n"str"\nnull\n{"type":"a","ts":1}\n', typeNum: '{"type":5,"ts":1}\n', bom: '﻿{"type":"a","ts":1}\n',
      };
      for (const [k, v] of Object.entries(files)) writeFileSync(join(t, k), v);
      const r = runJs(work, load(work) + `
        const res={}; for (const k of ${JSON.stringify(Object.keys(files))}) { const x=await attempt(async()=>m.loadEvents(${JSON.stringify(t)}+'/'+k)); res[k]=x.ok?[x.v.events.length,x.v.skipped]:'ERR '+x.msg; }
        out(res);`);
      if (!r.ok) return F('실행 실패: ' + r.stderr);
      const exp = { empty: [0, 0], blanks: [0, 0], lf: [2, 0], nolast: [2, 0], tsStr: [1, 1], notObj: [1, 3], typeNum: [0, 1], bom: [1, 0] };
      return ok(eq(r.value, exp), JSON.stringify(r.value));
    } finally { rmSync(t, { recursive: true, force: true }); }
  },
  ({ work, seed }) => ok(sha(join(work, 'data/events.jsonl')) === sha(join(seed, 'data/events.jsonl')) && sha(join(work, 'data/events.jsonl')) !== null,
    `sha256 work=${(sha(join(work, 'data/events.jsonl')) || 'missing').slice(0, 12)} seed=${sha(join(seed, 'data/events.jsonl')).slice(0, 12)}`),
  ({ work, seed }) => {
    const a = seedTestsAgainst(work, seed), b = runTests(work);
    return ok(a.pass && b.pass, `원본 테스트 ${a.tail}; 작업 폴더 테스트 ${b.tail}`);
  },
]);
