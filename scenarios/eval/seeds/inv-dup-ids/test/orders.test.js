import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, getOrder } from '../src/orders.js';
import { newOrderId } from '../src/id.js';

test('연속 10건은 번호가 서로 다르다', () => {
  const ids = new Set(Array.from({ length: 10 }, () => createOrder([]).id));
  assert.equal(ids.size, 10);
});
test('초가 다르면 다른 번호', () => {
  assert.notEqual(newOrderId(1_000_000), newOrderId(2_000_000));
});
test('주문 조회', () => {
  const o = createOrder(['x']);
  assert.equal(getOrder(o.id).items[0], 'x');
});
