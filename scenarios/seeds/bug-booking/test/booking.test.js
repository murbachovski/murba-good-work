import test from 'node:test';
import assert from 'node:assert/strict';
import { book, cancel } from '../src/booking.js';

test('겹치면 충돌', () => {
  const l = [{ id: 1, room: 'A', start: 10, end: 12 }];
  assert.equal(book(l, { id: 2, room: 'A', start: 11, end: 13 }).error, 'conflict');
});
test('다른 방은 가능', () => {
  const l = [{ id: 1, room: 'A', start: 10, end: 12 }];
  assert.equal(book(l, { id: 2, room: 'B', start: 10, end: 12 }).ok, true);
});
test('잘못된 구간', () => {
  assert.equal(book([], { id: 1, room: 'A', start: 12, end: 10 }).error, 'bad_range');
});
test('취소', () => {
  const l = [{ id: 1, room: 'A', start: 9, end: 10 }, { id: 2, room: 'A', start: 11, end: 12 }];
  assert.equal(cancel(l, 1).length, 1);
});
