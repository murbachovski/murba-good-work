import test from 'node:test';
import assert from 'node:assert/strict';
import { sleep } from '../src/sleep.js';

test('sleep 은 지정한 시간 이상 기다린다', async () => {
  const t0 = Date.now();
  await sleep(30);
  assert.ok(Date.now() - t0 >= 25);
});
