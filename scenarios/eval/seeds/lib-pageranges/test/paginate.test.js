import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/paginate.js';

test('두 번째 페이지', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2, 2), { items: [3, 4], totalPages: 3 });
});
test('잘못된 page', () => assert.throws(() => paginate([1], 0, 1), RangeError));
