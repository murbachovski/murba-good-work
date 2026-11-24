import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, cToF, parseAmount } from '../src/convert.js';

test('km -> m', () => {
  assert.equal(convert(2, 'km', 'm'), 2000);
});
test('kg -> g', () => {
  assert.equal(convert(1.5, 'kg', 'g', 'weight'), 1500);
});
test('알 수 없는 단위는 에러', () => {
  assert.throws(() => convert(1, 'km', 'foo'));
});
test('섭씨 -> 화씨', () => {
  assert.equal(cToF(100), 212);
});
test('parseAmount: 평범한 숫자', () => {
  assert.equal(parseAmount(' 12.5 '), 12.5);
});
test('cToF: 0도는 32', () => {
  assert.equal(cToF(0), 32);
});
