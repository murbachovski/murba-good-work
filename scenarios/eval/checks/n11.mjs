import { join } from 'node:path';
import { grade, runJs, url, read, seedTestsAgainst, ok, F, eq } from './_lib.mjs';

const SCEN = `
  const steps=(api)=>{ const log=[];
    log.push(api.addTrack('a',100)); log.push(api.addTrack('b',50)); log.push(api.addTrack('a',7));
    log.push(api.totalDuration()); log.push(api.list().map(t=>t.title+':'+t.seconds));
    const l=api.list(); l.push({title:'zzz',seconds:999}); l[0].seconds=0; log.push(api.totalDuration(), api.list().length);
    log.push(api.removeTrack('nope')); log.push(api.removeTrack('a')); log.push(api.totalDuration(), api.list().length);
    api.clear(); log.push(api.totalDuration(), api.list().length, api.addTrack('a',1)); return log; };`;

await grade([
  ({ work }) => {
    const r = runJs(work, `const m=await import(${JSON.stringify(url(join(work, 'src/playlist.js')))});
      const a=m.createPlaylist(), b=m.createPlaylist(); a.addTrack('x',10); a.addTrack('y',20);
      out({fn:typeof m.createPlaylist, a:a.totalDuration(), b:b.totalDuration(), bl:b.list().length, al:a.list().length, def:m.list().length, distinct:a!==b});`);
    if (!r.ok) return F('createPlaylist 사용 실패: ' + r.stderr);
    const v = r.value;
    return ok(v.fn === 'function' && v.a === 30 && v.b === 0 && v.bl === 0 && v.al === 2 && v.def === 0 && v.distinct, JSON.stringify(v));
  },
  ({ work, seed }) => {
    const code = (d) => `const m=await import(${JSON.stringify(url(join(d, 'src/playlist.js')))});${SCEN} m.clear(); out(steps(m));`;
    const a = runJs(seed, code(seed)), b = runJs(work, code(work));
    const t = seedTestsAgainst(work, seed);
    return ok(a.ok && b.ok && eq(a.value, b.value) && t.pass, `기본 인스턴스 동작 동일=${a.ok && b.ok && eq(a.value, b.value)} ${b.ok ? '' : b.stderr} 원본테스트 ${t.tail}`);
  },
  ({ work, seed }) => {
    const a = runJs(seed, `const m=await import(${JSON.stringify(url(join(seed, 'src/playlist.js')))});${SCEN} m.clear(); out(steps(m));`);
    const b = runJs(work, `const m=await import(${JSON.stringify(url(join(work, 'src/playlist.js')))});${SCEN} out(steps(m.createPlaylist()));`);
    if (!b.ok) return F('인스턴스 실행 실패: ' + b.stderr);
    return ok(a.ok && eq(a.value, b.value), `인스턴스 동작이 원본 기본 동작과 동일=${a.ok && eq(a.value, b.value)} ${JSON.stringify(b.value).slice(0, 120)}`);
  },
  ({ work }) => {
    const src = read(join(work, 'src/playlist.js'));
    if (src === null) return F('src/playlist.js 없음');
    const g = src.split('\n').filter((l) => /^(let|var)\s/.test(l));
    return ok(g.length === 0, `모듈 최상위 let/var = ${JSON.stringify(g)}`);
  },
]);
