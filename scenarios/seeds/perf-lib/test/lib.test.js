import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeEmails } from '../src/dedupe.js';
import { searchProducts } from '../src/search.js';
import { countBy } from '../src/count.js';

test('dedupe', () => {
  assert.deepEqual(dedupeEmails(['A@x.com', 'a@x.com', 'b@x.com']), ['A@x.com', 'b@x.com']);
});
test('search', () => {
  const p = [{ name: 'Red Mouse' }, { name: 'Blue Mouse' }, { name: 'Red Pen' }];
  assert.deepEqual(searchProducts(p, 'red mouse'), [{ name: 'Red Mouse' }]);
  assert.equal(searchProducts(p, 'a.b').length, 0);
});
test('countBy', () => {
  assert.deepEqual(countBy(['b', 'a', 'b']), { b: 2, a: 1 });
});
