import test from 'node:test';
import assert from 'node:assert/strict';
import { isLeapYear, daysInMonth, addMonths } from '../src/dates.js';

test('윤년', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2023), false);
});
test('월별 일수', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2023, 4), 30);
});
test('한 달 더하기', () => {
  const r = addMonths(new Date(2024, 0, 15), 1);
  assert.deepEqual([r.getFullYear(), r.getMonth(), r.getDate()], [2024, 1, 15]);
});
test('원본 날짜는 바뀌지 않는다', () => {
  const d = new Date(2024, 5, 10);
  addMonths(d, 3);
  assert.equal(d.getMonth(), 5);
});
