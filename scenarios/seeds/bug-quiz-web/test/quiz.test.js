const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuiz } = require('../src/quiz.js');

const Q = [
  { text: 'a', choices: ['x', 'y'], answer: 1 },
  { text: 'b', choices: ['x', 'y'], answer: 0 },
];
test('정답이면 점수 증가', () => {
  const q = createQuiz(Q);
  assert.equal(q.answer(1), true);
  assert.equal(q.state.score, 1);
});
test('끝나면 current는 null', () => {
  const q = createQuiz(Q);
  q.answer(1); q.answer(0);
  assert.equal(q.current(), null);
  assert.equal(q.percent(), 100);
});
