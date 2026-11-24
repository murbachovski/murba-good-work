import test from 'node:test';
import assert from 'node:assert/strict';
import { add, count, clear, saveLater } from '../src/cart.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('담기', () => {
  add('사과', 2);
  assert.equal(count(), 2);
});
test('같은 상품은 수량 합산', () => {
  add('사과', 3);
  assert.equal(count(), 5);
});
test('비우기', () => {
  clear();
  assert.equal(count(), 0);
});
test('디바운스 저장', async () => {
  let saved = null;
  add('배', 1);
  saveLater((n) => (saved = n), 20);
  await sleep(20);
  assert.equal(saved, 1);
});
