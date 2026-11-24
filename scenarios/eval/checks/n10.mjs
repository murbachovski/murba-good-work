import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { grade, runJs, url, read, sha, runTests, ok, F, eq } from './_lib.mjs';

await grade([
  ({ work, seed }) => {
    const code = `
      const a=await import(${JSON.stringify(url(join(seed, 'src/notify.js')))});
      const b=await import(${JSON.stringify(url(join(work, 'src/notify.js')))});
      const users=[
        {name:'Kim',email:'k@x.test',phone:'010-1234-5678',deviceToken:'tok1',preferred:'sms'},
        {name:'Lee',email:'l@x.test'}, {name:'Park',phone:'+82 10 9999 0000'}, {name:'Choi',deviceToken:'t9',preferred:'push'},
        {name:'Nobody'}, {name:'Jung',email:'j@x.test',phone:'02)123-4567',deviceToken:'d'}];
      const msgs=['hi','  padded  ','x'.repeat(70),'y'.repeat(71),'z'.repeat(150),'한글 메시지입니다 '.repeat(12),'',' \\n '];
      const opts=[{},{channel:'email'},{channel:'sms'},{channel:'push'},{channel:'fax'},{subject:'S'},{channel:'push',subject:'T'},{channel:'email',subject:''}];
      let n=0, diff=[];
      for (const u of users) for (const m of msgs) for (const o of opts) {
        const run=(mod)=>{try{return {v:mod.notify(u,m,o)}}catch(e){return {e:e.message}}};
        const ra=run(a), rb=run(b); n++;
        if (JSON.stringify(ra)!==JSON.stringify(rb)) diff.push({u:u.name,m:m.slice(0,10),o,ra,rb});
      }
      out({n,diffs:diff.length,first:diff[0]});`;
    const r = runJs(work, code);
    if (!r.ok) return F('비교 실행 실패(notify.js 로드/실행): ' + r.stderr);
    return ok(r.value.diffs === 0 && r.value.n > 300, `조합 ${r.value.n}개 중 불일치 ${r.value.diffs} ${r.value.first ? JSON.stringify(r.value.first).slice(0, 150) : ''}`);
  },
  ({ work }) => {
    const dir = join(work, 'src/channels');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
    const need = ['email.js', 'sms.js', 'push.js'];
    return ok(need.every((f) => files.includes(f)), `src/channels/*.js = ${JSON.stringify(files)}`);
  },
  ({ work }) => {
    const src = read(join(work, 'src/notify.js'));
    if (src === null) return F('src/notify.js 없음');
    const lines = src.split('\n').filter((l) => l.trim()).length;
    const chain = /===\s*['"](email|sms|push)['"]/.test(src);
    return ok(!chain && lines <= 40, `채널 리터럴 분기=${chain} 비어있지 않은 줄=${lines}`);
  },
  ({ work, seed }) => {
    const same = sha(join(work, 'test/notify.test.js')) === sha(join(seed, 'test/notify.test.js'));
    const t = runTests(work);
    return ok(same && t.pass, `기존 테스트 파일 미수정=${same}, ${t.tail}`);
  },
]);
