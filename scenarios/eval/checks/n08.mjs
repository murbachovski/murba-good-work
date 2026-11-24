import { join } from 'node:path';
import { grade, runJs, url, seedTestsAgainst, ok, F, eq } from './_lib.mjs';

const load = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/pool.js')))});const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));`;

await grade([
  ({ work }) => {
    const r = runJs(work, load(work) + `
      const items=[1,2,3,4,5,6]; const delays=[60,10,40,5,30,1];
      const res=await m.mapLimit(items,3,async(x,i)=>{await sleep(delays[i]); return x*10;});
      const idx=await m.mapLimit(['a','b','c'],2,async(x,i)=>{await sleep(30-i*10); return x+i;});
      out({res,idx});`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    return ok(eq(r.value.res, [10, 20, 30, 40, 50, 60]) && eq(r.value.idx, ['a0', 'b1', 'c2']), JSON.stringify(r.value));
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      let running=0,max=0; const res=await m.mapLimit(Array.from({length:12},(_, i)=>i),3,async(x)=>{running++;max=Math.max(max,running);await sleep(10);running--;return x;});
      const big=await m.mapLimit([1,2],10,async(x)=>x+1); const none=await m.mapLimit([],3,async(x)=>x);
      out({max,len:res.length,big,none});`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const v = r.value;
    return ok(v.max === 3 && v.len === 12 && eq(v.big, [2, 3]) && eq(v.none, []), JSON.stringify(v));
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      let calls=0; const e=new Error('boom');
      const a=await attempt(()=>m.mapLimit(Array.from({length:10},(_, i)=>i),2,async(x,i)=>{calls++; if(i===1) throw e; await sleep(20); return x;}));
      await sleep(150);
      out({rejected:!a.ok,msg:a.msg,calls});`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const v = r.value;
    return ok(v.rejected && v.msg === 'boom' && v.calls <= 2, JSON.stringify(v) + ' (기대: reject, calls<=2)');
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      const res=[]; for (const l of [0,-1,1.5,NaN]) res.push(await attempt(()=>m.mapLimit([1,2],l,async(x)=>x)));
      out(res);`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    return ok(r.value.every((x) => !x.ok && x.name === 'RangeError'), JSON.stringify(r.value));
  },
]);
