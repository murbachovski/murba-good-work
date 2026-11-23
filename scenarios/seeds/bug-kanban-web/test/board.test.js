const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoard, addCard, moveCard, removeCard } = require('../src/board.js');

test('추가', () => {
  const b = createBoard();
  addCard(b, 'todo', '청소');
  assert.equal(b.columns.todo.length, 1);
});
test('다른 열로 이동', () => {
  const b = createBoard();
  const c = addCard(b, 'todo', '청소');
  assert.equal(moveCard(b, c.id, 'doing'), true);
  assert.equal(b.columns.todo.length, 0);
  assert.equal(b.columns.doing.length, 1);
});
test('삭제', () => {
  const b = createBoard();
  const c = addCard(b, 'todo', '청소');
  removeCard(b, c.id);
  assert.equal(b.columns.todo.length, 0);
});
test('빈 제목은 거절', () => {
  assert.equal(addCard(createBoard(), 'todo', ''), null);
});
