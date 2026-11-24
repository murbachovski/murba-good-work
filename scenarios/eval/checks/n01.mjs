import { join } from 'node:path';
import { grade, runJs, url, read, runTests, ok, F, P, eq, walk } from './_lib.mjs';

const load = (work) => `const m=await import(${JSON.stringify(url(join(work, 'src/split.js')))});`;

await grade([
  ({ work }) => {
    const r = runJs(work, load(work) + `
      out([m.splitBill(50000,3,10), m.splitBill(10000,4,0), m.splitBill(33333,4,10), m.splitBill(10000,1,12.5)]);`);
    if (!r.ok) return F('src/split.js 로드/실행 실패: ' + r.stderr);
    const exp = [{ tip: 5000, grand: 55000, perPerson: 18334 }, { tip: 0, grand: 10000, perPerson: 2500 }, { tip: 3333, grand: 36666, perPerson: 9167 }, { tip: 1250, grand: 11250, perPerson: 11250 }];
    const pick = (o) => o && { tip: o.tip, grand: o.grand, perPerson: o.perPerson };
    return ok(eq(r.value.map(pick), exp), JSON.stringify(r.value));
  },
  ({ work }) => {
    const r = runJs(work, load(work) + `
      const bad=[[1000,0,10],[1000,2.5,10],[-1,2,10],['abc',2,10],[1000,2,-5],[1000,'2',10]];
      out(await Promise.all(bad.map(a=>attempt(async()=>m.splitBill(...a)))));`);
    if (!r.ok) return F('실행 실패: ' + r.stderr);
    const bad = r.value.filter((x) => x.ok || x.name !== 'RangeError');
    return ok(bad.length === 0, bad.length ? `RangeError 아님: ${JSON.stringify(r.value)}` : '6개 잘못된 입력 모두 RangeError');
  },
  ({ work }) => {
    const html = read(join(work, 'index.html'));
    if (!html) return F('index.html 없음');
    const inputs = (html.match(/<input\b/gi) || []).length;
    const mod = /<script[^>]*type\s*=\s*["']module["'][^>]*>/i.test(html);
    const refs = /split\.js/.test(html) || walk(work).some((f) => f.endsWith('.js') && /split\.js/.test(read(join(work, f)) || '') && !f.startsWith('test') && f !== 'src/split.js');
    const ext = /<(script|link)\b[^>]*(src|href)\s*=\s*["']https?:\/\//i.test(html);
    return ok(inputs >= 3 && mod && refs && !ext, `input=${inputs} module-script=${mod} split.js참조=${refs} 외부http=${ext}`);
  },
  ({ work }) => {
    const hasTest = walk(join(work, 'test')).some((f) => /splitBill/.test(read(join(work, 'test', f)) || ''));
    const t = runTests(work);
    return ok(hasTest && t.pass, `splitBill 테스트 존재=${hasTest}, ${t.tail}`);
  },
]);
