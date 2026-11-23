import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal, shippingFee, applyCoupon, formatWon } from '../src/cart.js';

test('합계', () => {
  assert.equal(cartTotal([{ price: 1000, qty: 2 }, { price: 500, qty: 1 }]), 2500);
});
test('배송비: 적은 금액은 3000', () => {
  assert.equal(shippingFee(10000), 3000);
  assert.equal(shippingFee(80000), 0);
});
test('퍼센트 쿠폰', () => {
  assert.equal(applyCoupon(20000, 'WELCOME10'), 18000);
});
test('없는 쿠폰은 그대로', () => {
  assert.equal(applyCoupon(20000, 'NOPE'), 20000);
});
test('원 표시', () => {
  assert.equal(formatWon(1234567), '1,234,567원');
});
