import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { grade, ok } from './_lib.mjs';

const TEXT = 'The cat and the dog. THE bird, a cat! And a fish; the cat sat on a mat. Dog dog.\n';
function cli(dir, args) {
  const r = spawnSync(process.execPath, [join(dir, 'bin/freq.js'), ...args], { encoding: 'utf8', timeout: 10000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
function setup() {
  const t = mkdtempSync(join(tmpdir(), 'n04-'));
  writeFileSync(join(t, 'in.txt'), TEXT);
  writeFileSync(join(t, 'sw.txt'), '# 영어 관사\nThe\nA\n\n  and  \n');
  return t;
}
const rows = (o) => o.split('\n').filter(Boolean).map((l) => l.split('\t'));

await grade([
  ({ work }) => {
    const t = setup();
    try {
      const r = cli(work, [join(t, 'in.txt'), '--stopwords', join(t, 'sw.txt')]);
      const words = rows(r.out).map((x) => x[0]);
      const map = Object.fromEntries(rows(r.out));
      const good = r.code === 0 && !['the', 'a', 'and', '#'].some((w) => words.includes(w)) && map.cat === '3' && map.dog === '3';
      return ok(good, `exit=${r.code} out=${JSON.stringify(r.out.slice(0, 120))} err=${r.err.slice(0, 80)}`);
    } finally { rmSync(t, { recursive: true, force: true }); }
  },
  ({ work, seed }) => {
    const t = setup();
    try {
      const a = cli(seed, [join(t, 'in.txt'), '--top', '4']);
      const b = cli(work, [join(t, 'in.txt'), '--top', '4']);
      const c = cli(seed, [join(t, 'in.txt')]);
      const d = cli(work, [join(t, 'in.txt')]);
      return ok(a.code === 0 && a.out === b.out && c.out === d.out && b.out.includes('the\t'), `옵션 없을 때 원본과 동일=${a.out === b.out && c.out === d.out}`);
    } finally { rmSync(t, { recursive: true, force: true }); }
  },
  ({ work }) => {
    const t = setup();
    try {
      const missing = join(t, 'nope.txt');
      const r = cli(work, ['--stopwords', missing, join(t, 'in.txt')]);
      return ok(r.code !== 0 && r.out === '' && r.err.includes('nope.txt'), `exit=${r.code} stdout=${JSON.stringify(r.out.slice(0, 40))} stderr=${JSON.stringify(r.err.slice(0, 100))}`);
    } finally { rmSync(t, { recursive: true, force: true }); }
  },
  ({ work }) => {
    const t = setup();
    try {
      const a = cli(work, [join(t, 'in.txt'), '--stopwords', join(t, 'sw.txt'), '--top', '2']);
      const b = cli(work, ['--top', '2', '--stopwords', join(t, 'sw.txt'), join(t, 'in.txt')]);
      const exp = 'cat\t3\ndog\t3\n';
      return ok(a.out === exp && b.out === exp, `A=${JSON.stringify(a.out)} B=${JSON.stringify(b.out)}`);
    } finally { rmSync(t, { recursive: true, force: true }); }
  },
]);
