import { join } from 'node:path';
import { grade, runJs, url, seedTestsAgainst, ok, F, eq } from './_lib.mjs';

const imp = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/graph.js')))});`;

await grade([
  ({ work }) => {
    const r = runJs(work, imp(work) + `
      const N=30000; const g={}; for(let i=0;i<N;i++){ g['n'+i]=['n'+(i+1),'n'+(i+2)].filter(x=>+x.slice(1)<N); }
      const t0=performance.now(); const p=m.shortestPath(g,'n0','n'+(N-1)); const ms=performance.now()-t0;
      out({ms:Math.round(ms), len:p&&p.length, first:p&&p[0], last:p&&p[p.length-1]});`, { timeout: 30000 });
    if (!r.ok) return F('실행 실패/시간 초과: ' + r.stderr);
    const v = r.value;
    return ok(v.ms <= 1000 && v.len === 15001 && v.first === 'n0' && v.last === 'n29999', JSON.stringify(v) + ' (기대: 1000ms 이하, 길이 15001)');
  },
  ({ work, seed }) => {
    const code = `
      const a=await import(${JSON.stringify(url(join(seed, 'src/graph.js')))});
      const b=await import(${JSON.stringify(url(join(work, 'src/graph.js')))});
      let s=12345; const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff;};
      let bad=[], n=0, nulls=0;
      for(let k=0;k<200;k++){
        const V=3+Math.floor(rnd()*25); const g={}; for(let i=0;i<V;i++){g['v'+i]=[]; const deg=Math.floor(rnd()*4); for(let d=0;d<deg;d++) g['v'+i].push('v'+Math.floor(rnd()*V));}
        if(k%7===0) delete g['v'+(V-1)];
        const st='v'+Math.floor(rnd()*V), go='v'+Math.floor(rnd()*V);
        const pa=a.shortestPath(g,st,go), pb=b.shortestPath(g,st,go); n++;
        if(pa===null){ nulls++; if(pb!==null) bad.push(['null기대',k]); continue; }
        if(!Array.isArray(pb)||pb.length!==pa.length||pb[0]!==st||pb[pb.length-1]!==go){ bad.push(['길이/끝점',k,pa,pb]); continue; }
        for(let i=1;i<pb.length;i++) if(!(g[pb[i-1]]||[]).includes(pb[i])) bad.push(['간선없음',k]);
      }
      out({n,nulls,bad:bad.length,first:bad[0]});`;
    const r = runJs(work, code, { timeout: 30000 });
    if (!r.ok) return F('비교 실행 실패: ' + r.stderr);
    return ok(r.value.bad === 0 && r.value.nulls > 0 && r.value.nulls < r.value.n, `그래프 ${r.value.n}개(도달불가 ${r.value.nulls}) 불일치 ${r.value.bad} ${r.value.first ? JSON.stringify(r.value.first).slice(0, 100) : ''}`);
  },
  ({ work, seed }) => {
    const t = seedTestsAgainst(work, seed);
    return ok(t.pass, `원본 테스트 ${t.tail}`);
  },
]);
