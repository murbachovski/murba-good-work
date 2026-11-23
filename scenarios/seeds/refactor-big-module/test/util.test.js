import test from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/util.js';

test('문자열', () => {
  assert.equal(u.capitalize('abc'), 'Abc');
  assert.equal(u.padLeft(7, 3, '0'), '007');
  assert.equal(u.isBlank('  '), true);
  assert.equal(u.camelToSnake('userNameId'), 'user_name_id');
});
test('날짜', () => {
  const d = new Date(Date.UTC(2026, 2, 5));
  assert.equal(u.formatDate(d), '2026-03-05');
  assert.equal(u.formatDate(u.addDays(d, 30)), '2026-04-04');
  assert.equal(u.daysBetween(d, u.addDays(d, 10)), 10);
  assert.equal(u.isWeekend(new Date(Date.UTC(2026, 2, 7))), true);
});
test('배열', () => {
  assert.deepEqual(u.unique([1, 1, 2]), [1, 2]);
  assert.deepEqual(u.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(u.groupBy([1, 2, 3], (x) => x % 2), { 1: [1, 3], 0: [2] });
  assert.equal(u.sum([1, 2, 3]), 6);
});
test('숫자', () => {
  assert.equal(u.clamp(15, 0, 10), 10);
  assert.equal(u.roundTo(1.2345, 2), 1.23);
  assert.equal(u.formatWon(1234567), '1,234,567원');
  assert.equal(u.percent(1, 3), 33.3);
  assert.equal(u.percent(1, 0), 0);
});
