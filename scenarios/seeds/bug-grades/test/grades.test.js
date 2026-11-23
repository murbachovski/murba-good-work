import test from 'node:test';
import assert from 'node:assert/strict';
import { average, letter, rankStudents } from '../src/grades.js';

test('평균', () => {
  assert.equal(average([80, 90, 100]), 90);
});
test('등급', () => {
  assert.equal(letter(95), 'A');
  assert.equal(letter(85), 'B');
  assert.equal(letter(40), 'F');
});
test('석차 (동점 없음)', () => {
  const r = rankStudents([{ name: '가', scores: [70] }, { name: '나', scores: [90] }]);
  assert.deepEqual(r.map((x) => [x.name, x.rank]), [['나', 1], ['가', 2]]);
});
