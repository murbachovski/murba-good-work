import test from 'node:test';
import assert from 'node:assert/strict';
import { addTrack, removeTrack, totalDuration, list, clear } from '../src/playlist.js';

test('추가와 합계', () => {
  clear();
  addTrack('a', 100);
  addTrack('b', 50);
  assert.equal(totalDuration(), 150);
  assert.deepEqual(list().map((t) => t.title), ['a', 'b']);
});
test('중복 제목은 무시', () => {
  clear();
  assert.equal(addTrack('a', 1), true);
  assert.equal(addTrack('a', 2), false);
  assert.equal(totalDuration(), 1);
});
test('삭제', () => {
  clear();
  addTrack('a', 1);
  assert.equal(removeTrack('a'), true);
  assert.equal(removeTrack('a'), false);
});
