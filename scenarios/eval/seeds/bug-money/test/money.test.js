import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatCents, splitCents } from '../src/money.js';

test('toCents', () => {
  assert.equal(toCents('12.50'), 1250);
  assert.equal(toCents('3'), 300);
});
test('formatCents', () => {
  assert.equal(formatCents(1234567), '12,345.67');
  assert.equal(formatCents(5), '0.05');
});
test('splitCents 나누어떨어지는 경우', () => {
  assert.deepEqual(splitCents(100, 4), [25, 25, 25, 25]);
});
