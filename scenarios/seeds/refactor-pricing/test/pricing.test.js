import test from 'node:test';
import assert from 'node:assert/strict';
import { calcOrder } from '../src/pricing.js';

const base = (o) => ({ items: [], member: 'none', coupon: null, region: 'seoul', ...o });

test('빈 주문은 배송비만', () => {
  assert.deepEqual(calcOrder(base({})), { subtotal: 0, discount: 0, shipping: 3000, total: 3000 });
});
test('도서 10% 할인가 + 금 회원', () => {
  const r = calcOrder(base({ items: [{ price: 20000, qty: 3, category: 'book' }], member: 'gold' }));
  assert.deepEqual(r, { subtotal: 54000, discount: 5400, shipping: 0, total: 48600 });
});
test('전자제품 3개 이상 5% 할인', () => {
  const r = calcOrder(base({ items: [{ price: 10000, qty: 3, category: 'electronics' }] }));
  assert.equal(r.subtotal, 28500);
  assert.equal(r.shipping, 3000);
});
test('쿠폰 HALF 는 10만원 이상에서만', () => {
  const items = [{ price: 100000, qty: 1, category: 'food' }];
  assert.equal(calcOrder(base({ items, coupon: 'HALF' })).discount, 5000);
  assert.equal(calcOrder(base({ items: [{ price: 99000, qty: 1, category: 'food' }], coupon: 'HALF' })).discount, 0);
});
test('제주 배송비', () => {
  const small = calcOrder(base({ items: [{ price: 10000, qty: 1, category: 'food' }], region: 'jeju' }));
  assert.equal(small.shipping, 5000);
  const big = calcOrder(base({ items: [{ price: 40000, qty: 1, category: 'food' }], region: 'jeju' }));
  assert.equal(big.shipping, 2000);
});
test('쿠폰 TEN + 은 회원, 10원 단위 버림', () => {
  const r = calcOrder(base({ items: [{ price: 33333, qty: 2, category: 'food' }], member: 'silver', coupon: 'TEN' }));
  assert.equal(r.total % 10, 0);
  assert.equal(r.total, 56660);
});
