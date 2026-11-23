import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';

test('첫 페이지는 앞에서 3개', () => {
  const r = handle({ url: '/products?page=1&size=3' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((p) => p.id), [1, 2, 3]);
});

test('숫자가 아닌 id는 400', () => {
  const r = handle({ url: '/products/abc' });
  assert.equal(r.status, 400);
});

test('있는 상품 조회', () => {
  const r = handle({ url: '/products/2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, '마우스');
});
