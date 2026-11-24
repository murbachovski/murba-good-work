import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords, topN } from '../src/freq.js';

test('대소문자 구분 없이 센다', () => {
  assert.equal(countWords('The the THE cat').get('the'), 3);
});
test('빈도 내림차순, 동률은 사전순', () => {
  assert.deepEqual(topN(countWords('b a b a c'), 2), [['a', 2], ['b', 2]]);
});
