import { join } from 'node:path';
import { grade, runJs, url, ok, F } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/retry.js')))});`;
const near = (got, want) => got >= want * 0.85 && got <= want + 200;

await grade([
  ({ work }) => {
    const r = runJs(work, load(work) + `
      const seen=[]; const v=await m.retry(async(i)=>{seen.push(i); if(i<2) throw new Error('e'+i); return 'done';},{retries:3,delayMs:5});
      out({v,seen});`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    return ok(r.value.v === 'done' && JSON.stringify(r.value.seen) === '[0,1,2]', JSON.stringify(r.value));
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      let n=0; const errs=[]; const fn=async()=>{const e=new Error('e'+(n++)); errs.push(e); throw e;};
      const a=await attempt(()=>m.retry(fn,{retries:2,delayMs:5}));
      const callsA=n; const lastA=errs[errs.length-1];
      n=0; errs.length=0; const t0=Date.now();
      const b=await attempt(()=>m.retry(fn));            // 기본값: retries=3, delayMs=100, factor=2
      out({callsA, msgA:a.msg, sameA: !a.ok, callsB:n, msgB:b.msg, ms:Date.now()-t0});`, { timeout: 20000 });
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const v = r.value;
    return ok(v.callsA === 3 && v.msgA === 'e2' && v.callsB === 4 && v.msgB === 'e3' && v.ms >= 600 && v.ms < 3000, JSON.stringify(v));
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      let n=0; const E=new Error('fatal'); E.code='FATAL';
      const a=await attempt(()=>m.retry(async()=>{n++; throw E;},{retries:5,delayMs:5,shouldRetry:(e)=>e.code!=='FATAL'}));
      let seenArg; let k=0;
      const b=await attempt(()=>m.retry(async()=>{k++; throw new Error('x');},{retries:2,delayMs:1,shouldRetry:(e)=>{seenArg=e.message; return k<2;}}));
      out({n,msg:a.msg,k,seenArg});`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const v = r.value;
    return ok(v.n === 1 && v.msg === 'fatal' && v.k === 2 && v.seenArg === 'x', JSON.stringify(v));
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      const ts=[]; await attempt(()=>m.retry(async()=>{ts.push(Date.now()); throw new Error('x');},{retries:3,delayMs:30,factor:2}));
      out(ts.slice(1).map((t,i)=>t-ts[i]));`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const g = r.value;
    return ok(g.length === 3 && near(g[0], 30) && near(g[1], 60) && near(g[2], 120), `간격(ms)=${JSON.stringify(g)} 기대 약 [30,60,120]`);
  },
]);
