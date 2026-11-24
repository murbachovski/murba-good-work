import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from '../src/pool.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('모든 항목을 처리한다', async () => {
  const r = await mapLimit([1, 2, 3, 4], 2, async (x) => { await sleep(5); return x * 2; });
  assert.deepEqual([...r].sort((a, b) => a - b), [2, 4, 6, 8]);
});
test('동시 실행 수는 limit 이하', async () => {
  let running = 0, max = 0;
  await mapLimit([1, 2, 3, 4, 5, 6], 3, async () => {
    running++; max = Math.max(max, running);
    await sleep(10);
    running--;
  });
  assert.ok(max <= 3);
});
