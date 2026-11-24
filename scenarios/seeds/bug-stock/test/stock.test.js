import test from 'node:test';
import assert from 'node:assert/strict';
import { sell, findItem, lowStock, resetStock } from '../src/stock.js';

test.beforeEach(() => resetStock());

test('판매하면 재고 감소', () => {
  assert.deepEqual(sell('PEN-1', 3), { ok: true, stock: 7 });
});
test('없는 sku', () => {
  assert.equal(sell('XXX', 1).error, 'not_found');
});
test('재고 0이면 품절', () => {
  assert.equal(sell('TAPE-3', 1).error, 'out_of_stock');
});
test('findItem', () => {
  assert.equal(findItem('PEN-1').name, '볼펜');
});
test('부족 품목에 재고 0 포함', () => {
  assert.ok(lowStock().includes('TAPE-3'));
});
