const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRows, filterRows } = require('../src/rows.js');

test('행 생성', () => {
  assert.equal(makeRows(10).length, 10);
});
test('필터', () => {
  const rows = [{ name: '고객1', city: '서울' }, { name: '고객2', city: '부산' }];
  assert.equal(filterRows(rows, '부산').length, 1);
  assert.equal(filterRows(rows, '  ').length, 2);
});
