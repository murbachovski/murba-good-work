import test from 'node:test';
import assert from 'node:assert/strict';
import { discounted } from '../src/discount.js';

test('일반 회원은 할인 없음', () => {
  assert.equal(discounted(10000, 'basic'), 10000);
});
test('silver 5%', () => {
  assert.equal(discounted(10000, 'silver'), 9500);
});
test('gold 10%', () => {
  assert.equal(discounted(10000, 'gold'), 9000);
});
test('vip 20%', () => {
  assert.equal(discounted(10000, 'vip'), 8000);
});
