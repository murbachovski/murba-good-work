import test from 'node:test';
import assert from 'node:assert/strict';
import { truncate, wordCount, slugify, sameName } from '../src/text.js';

test('truncate: 짧으면 그대로', () => {
  assert.equal(truncate('hello', 10), 'hello');
});
test('truncate: 길면 … 로 끝', () => {
  assert.equal(truncate('hello world', 6), 'hello…');
});
test('wordCount', () => {
  assert.equal(wordCount('a b c'), 3);
});
test('slugify', () => {
  assert.equal(slugify('Hello World!'), 'hello-world');
});
test('sameName', () => {
  assert.equal(sameName(' 김철수', '김철수 '), true);
  assert.equal(sameName('김철수', '김영희'), false);
});
