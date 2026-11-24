import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUser, validateProduct, validateReview } from '../src/validate.js';

test('유저 정상', () => {
  assert.deepEqual(validateUser({ email: 'a@b.co', name: '김철수', age: 30 }), { ok: true, errors: {} });
});
test('유저 오류들', () => {
  const r = validateUser({ email: 'abc', name: ' ', age: 200 });
  assert.deepEqual(r.errors, { email: '형식 오류', name: '필수', age: '150 이하' });
});
test('상품 오류들', () => {
  const r = validateProduct({ title: 'x', price: -1, sku: 'abc' });
  assert.deepEqual(r.errors, { title: '너무 짧음', price: '0 이상', sku: '형식 오류' });
});
test('상품 정상', () => {
  assert.equal(validateProduct({ title: '마우스', price: 25000, sku: 'MS-10' }).ok, true);
});
test('리뷰 오류들', () => {
  const r = validateReview({ author: '가', rating: 6, body: '' });
  assert.deepEqual(r.errors, { author: '너무 짧음', rating: '5 이하', body: '필수' });
});
test('리뷰 필수값 누락', () => {
  assert.deepEqual(validateReview({}).errors, { author: '필수', rating: '필수', body: '필수' });
});
