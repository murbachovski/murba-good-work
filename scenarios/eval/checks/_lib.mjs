// 공용 채점 도구. 사용: node checks/<id>.mjs <workdir> <seeddir>
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export const url = (f) => pathToFileURL(f).href;
export const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
export const sha = (f) => (existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex') : null);

export function walk(dir, skip = ['node_modules', '.git']) {
  const out = [];
  if (!existsSync(dir)) return out;
  (function rec(d) {
    for (const name of readdirSync(d).sort()) {
      if (skip.includes(name)) continue;
      const p = join(d, name);
      statSync(p).isDirectory() ? rec(p) : out.push(relative(dir, p));
    }
  })(dir);
  return out;
}

// 자식 프로세스에서 ESM 코드를 실행. 코드 안에서 out(값) 으로 결과를 돌려준다.
// attempt(async fn) -> {ok, v} | {ok:false, name, msg}
export function runJs(cwd, code, { timeout = 15000, env = {} } = {}) {
  const pre =
    "const out=(v)=>console.log('@@OUT@@'+JSON.stringify(v));\n" +
    'const attempt=async(f)=>{try{return {ok:true,v:await f()}}catch(e){return {ok:false,name:e?.name,msg:String(e?.message)}}};\n';
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', pre + code], {
    cwd, timeout, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 50e6,
  });
  const line = (r.stdout || '').split('\n').reverse().find((l) => l.startsWith('@@OUT@@'));
  const timedOut = r.error?.code === 'ETIMEDOUT';
  if (!line) return { ok: false, timedOut, stderr: ((r.stderr || '').split('\n').find((l) => /Error/.test(l)) || r.stderr || String(r.error || '')).trim().slice(0, 250) + (timedOut ? ' [timeout]' : '') };
  return { ok: true, value: JSON.parse(line.slice(7)) };
}

export function runTests(dir, timeout = 60000) {
  if (!existsSync(join(dir, 'package.json'))) return { pass: false, tail: 'package.json 없음' };
  const r = spawnSync(process.execPath, ['--test'], { cwd: dir, timeout, encoding: 'utf8' });
  const m = /ℹ pass (\d+)/.exec(r.stdout || '');
  const f = /ℹ fail (\d+)/.exec(r.stdout || '');
  return { pass: r.status === 0 && !!m && Number(m[1]) > 0, tail: `exit=${r.status} pass=${m?.[1]} fail=${f?.[1]}${r.error ? ' ' + r.error.code : ''}` };
}

// 원본(seed) 테스트를 작업 폴더의 src 에 대고 실행
export function seedTestsAgainst(work, seed, timeout = 60000) {
  if (!existsSync(join(work, 'src'))) return { pass: false, tail: 'work/src 없음' };
  const tmp = mkdtempSync(join(tmpdir(), 'evalchk-'));
  try {
    cpSync(seed, tmp, { recursive: true });
    rmSync(join(tmp, 'src'), { recursive: true, force: true });
    cpSync(join(work, 'src'), join(tmp, 'src'), { recursive: true });
    return runTests(tmp, timeout);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const cut = (s) => String(s).slice(0, 300);
export const P = (e) => ({ verdict: 'PASS', evidence: cut(e) });
export const F = (e) => ({ verdict: 'FAIL', evidence: cut(e) });
export const M = (e) => ({ verdict: 'MANUAL', evidence: cut(e) });
export const ok = (b, e) => (b ? P(e) : F(e));
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function grade(fns) {
  const [work, seed] = process.argv.slice(2).map((p) => resolve(p));
  for (let i = 0; i < fns.length; i++) {
    let r;
    try { r = await fns[i]({ work, seed }); } catch (e) { r = F('checker error: ' + e.message); }
    console.log(JSON.stringify({ i, verdict: r.verdict, evidence: r.evidence }));
  }
  process.exit(0);
}
