#!/usr/bin/env node
// murba-good-work 시나리오 러너: 과제마다 임시 프로젝트를 만들고 headless로 플러그인 전체 흐름을 실행한다.
// 사용: node scenarios/harness/run.mjs --out <dir> [--ids t001,t002 | --range 1-10] [--concurrency 6] [--timeout-min 30] [--model sonnet]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const OUT = path.resolve(args.out || 'harness-out');
const CONC = Number(args.concurrency || 6);
const TIMEOUT_MS = Number(args['timeout-min'] || 30) * 60_000;
const MODEL = args.model || 'sonnet';

const TASKS_FILE = args['tasks-file'] ? path.resolve(args['tasks-file']) : path.join(REPO, 'scenarios', 'tasks.json');
const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
// 비교 실험용: --arm murba|pstack|none, --plugin-src <dir>(pstack), --isolate(사용자 전역 설정·플러그인 제외), --budget-usd <상한> --budget-dirs a,b
const ARM = args.arm || 'murba';
const ISOLATE = !!args.isolate;
const BUDGET = args['budget-usd'] ? Number(args['budget-usd']) : null;
let selected = tasks;
if (args.ids) { const ids = new Set(String(args.ids).split(',')); selected = tasks.filter(t => ids.has(t.id)); }
else if (args.range) { const [a, b] = String(args.range).split('-').map(Number); selected = tasks.slice(a - 1, b); }

const ALLOWED = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Agent', 'Skill', 'TodoWrite',
  ...['node', 'npm', 'npx', 'git', ...(ARM === 'murba' ? ['murba', 'murba status'] : []), 'ls', 'cat', 'mkdir', 'cp', 'mv', 'echo', 'printf', 'head', 'tail', 'wc', 'grep',
    'find', 'sed', 'diff', 'chmod', 'test', 'pwd', 'date', 'sort', 'uniq', 'touch', 'sh ./init.sh', 'sh .murba/init.sh', 'bash .murba/init.sh', 'curl -s http://localhost', 'curl -s http://127.0.0.1', 'sleep', 'kill', 'lsof -i', 'jq', 'awk', 'tr', 'cut', 'xargs', 'true', 'which', 'printenv', 'node --test', 'cd', 'mktemp', 'python3', 'basename', 'dirname', 'realpath', 'stat', 'cmp', 'tee', 'xxd', 'od', 'file'].map(c => `Bash(${c}:*)`)];

function seedDir(seed) {
  if (!seed) return null;
  for (const p of [path.join(REPO, 'scenarios', seed), path.join(REPO, 'scenarios', 'seeds', seed), path.join(path.dirname(TASKS_FILE), 'seeds', seed)]) if (fs.existsSync(p)) return p;
  return null;
}

const UNATTENDED = '[무인 실행] 사람에게 질문하지 않는다. 정할 것은 합리적인 기본값으로 정하고 작업을 끝까지 마친 뒤, 무엇을 했고 무엇이 안 됐는지 보고한다.';
function prompt(t) {
  if (ISOLATE) {
    const body = `${t.brief}\n\n${UNATTENDED}\n\n[사전 답변]\n${t.answers || '(없음)'}`;
    return ARM === 'murba' ? `/murba-good-work:run ${body}` : ARM === 'pstack' ? `/pstack:poteto-mode ${body}` : body;
  }
  return `/murba-good-work:run ${t.brief}\n\n[사전 답변 — grill 질문에 대한 사용자의 답]\n${t.answers || '(없음: 합리적 기본값으로 진행하고 결정 큐에 기록)'}`;
}

function sh(cmd, cwd) { try { return execFileSync('sh', ['-c', cmd], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } }

function readMaybe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

async function runOne(t) {
  const dir = path.join(OUT, t.id);
  const work = path.join(dir, 'work');
  if (fs.existsSync(dir)) { console.log(`${t.id} 건너뜀: ${dir} 이미 있음(결과를 지우지 않는다. 새 --out 사용)`); return null; }
  fs.mkdirSync(work, { recursive: true });
  const sd = seedDir(t.seed);
  if (t.seed && !sd) fs.writeFileSync(path.join(dir, 'SEED_MISSING'), t.seed);
  if (sd) fs.cpSync(sd, work, { recursive: true, filter: s => !/brief\.md$|headless-answers\.md$/.test(s) });
  if (t.prep) fs.writeFileSync(path.join(dir, 'prep.log'), sh(t.prep, work)); // 시드 준비(예: DB 파일 생성) 후 첫 커밋
  sh('git init -q && git add -A && git -c user.email=test@example.com -c user.name=harness commit -q --allow-empty -m seed', work);
  fs.writeFileSync(path.join(dir, 'task.json'), JSON.stringify(t, null, 2));
  const started = Date.now();
  const env = { ...process.env, ...(ARM === 'murba' ? { MURBA_HEADLESS: '1' } : {}), CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0', CLAUDE_CODE_SUBAGENT_MODEL: MODEL, CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1', GIT_AUTHOR_NAME: 'harness', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'harness', GIT_COMMITTER_EMAIL: 'test@example.com' };
  const log = fs.openSync(path.join(dir, 'stream.jsonl'), 'w');
  const err = fs.openSync(path.join(dir, 'stderr.txt'), 'w');
  const child = spawn('claude', ['-p', ...(PLUGIN ? ['--plugin-dir', PLUGIN] : []), ...(ISOLATE ? ['--setting-sources', 'project,local'] : []), '--model', MODEL, '--permission-mode', 'acceptEdits',
    '--output-format', 'stream-json', '--verbose', '--allowedTools', ...ALLOWED, '--', prompt(t)], { cwd: work, env, stdio: ['ignore', log, err] });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 10_000); }, TIMEOUT_MS);
  const code = await new Promise(r => child.on('exit', c => r(c)));
  clearTimeout(timer);
  const m = path.join(work, '.murba');
  const lines = (readMaybe(path.join(dir, 'stream.jsonl')) || '').trim().split('\n').filter(Boolean);
  let result = null; const denials = [];
  for (const l of lines) { try { const j = JSON.parse(l); if (j.type === 'result') result = j; } catch {} }
  if (result?.permission_denials) denials.push(...result.permission_denials.map(d => d.tool_name + ':' + JSON.stringify(d.tool_input).slice(0, 120)));
  const summary = {
    id: t.id, arm: ARM, task_type: t.task_type, browser: t.browser, risk: t.risk, exit: code, timed_out: timedOut,
    minutes: +((Date.now() - started) / 60000).toFixed(1), cost_usd: result?.total_cost_usd ?? null, num_turns: result?.num_turns ?? null,
    result_text: (result?.result || '').slice(-1500),
    state: JSON.parse(readMaybe(path.join(m, 'state.json')) || 'null'),
    has_report: fs.existsSync(path.join(m, 'report.md')),
    hooks: (readMaybe(path.join(m, 'logs', 'hooks.jsonl')) || '').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } }),
    decisions: (readMaybe(path.join(m, 'decisions.tsv')) || '').trim().split('\n').filter(Boolean).length,
    permission_denials: denials,
    git_log: sh('git log --all --oneline | head -30', work),
  };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  for (const f of ['report.md', 'report.html', 'decisions.tsv', 'events.jsonl', 'spec.md', 'run-plan.json']) {
    const s = readMaybe(path.join(m, f)); if (s != null) fs.writeFileSync(path.join(dir, 'murba-' + f), s);
  }
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${t.id} exit=${code}${timedOut ? ' TIMEOUT' : ''} phase=${summary.state?.phase ?? '-'} ${summary.minutes}m $${summary.cost_usd ?? '?'}`);
  return summary;
}

fs.mkdirSync(OUT, { recursive: true });
// 실행 중 작업 트리가 바뀌어도 결과가 한 커밋을 가리키도록 플러그인을 고정 사본으로 쓴다
const SRC = ARM === 'murba' ? path.join(REPO, 'plugins', 'murba-good-work') : ARM === 'pstack' ? (args['plugin-src'] && path.resolve(args['plugin-src'])) : null;
if (ARM === 'pstack' && !SRC) { console.error('--arm pstack에는 --plugin-src 필요'); process.exit(1); }
let PLUGIN = null;
if (SRC) {
  const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SRC, encoding: 'utf8' }).trim();
  const DIRTY = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: SRC, encoding: 'utf8' }).trim();
  if (DIRTY && !args['allow-dirty']) { console.error(`${SRC}에 커밋 안 된 변경이 있음. 커밋 후 실행(또는 --allow-dirty)`); process.exit(1); }
  PLUGIN = path.join(OUT, '_plugin');
  if (!fs.existsSync(PLUGIN)) fs.cpSync(SRC, PLUGIN, { recursive: true, filter: f => !/\/\.git(\/|$)/.test(f) });
  fs.writeFileSync(path.join(OUT, '_plugin.sha'), `${ARM} ${SHA}${DIRTY ? ' (dirty)' : ''}\n`);
}
// 비용 상한: 지정한 폴더들의 summary.json cost 합계가 상한 이상이면 새 실행을 시작하지 않는다
function spent() {
  let sum = 0;
  for (const d of String(args['budget-dirs'] || OUT).split(',')) {
    const root = path.resolve(d); if (!fs.existsSync(root)) continue;
    for (const id of fs.readdirSync(root)) { try { sum += JSON.parse(fs.readFileSync(path.join(root, id, 'summary.json'), 'utf8')).cost_usd || 0; } catch {} }
  }
  return sum;
}
console.log(`tasks=${selected.length} concurrency=${CONC} timeout=${TIMEOUT_MS / 60000}m model=${MODEL} out=${OUT}`);
const queue = [...selected];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => {
  while (queue.length) {
    if (BUDGET != null && spent() >= BUDGET) { console.log(`비용 상한 $${BUDGET} 도달($${spent().toFixed(2)}): 남은 ${queue.length}개 시작 안 함`); queue.length = 0; break; }
    await runOne(queue.shift());
  }
}));
console.log('all done');
