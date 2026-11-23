import test from 'node:test';
import assert from 'node:assert/strict';
import { monthTransactions, totalExpense, topSpending, dailyAverageExpense } from '../src/ledger.js';

const txs = [
  { date: '2026-03-05', category: '식비', amount: -8000 },
  { date: '2026-03-15', category: '교통', amount: -2000 },
  { date: '2026-03-20', category: '월급', amount: 3000000 },
  { date: '2026-04-02', category: '식비', amount: -5000 },
];
test('월 필터', () => {
  assert.equal(monthTransactions(txs, '2026-03').length, 3);
});
test('총 지출', () => {
  assert.equal(totalExpense(txs), 15000);
});
test('최대 지출', () => {
  assert.equal(topSpending(txs), 8000);
});
test('하루 평균 (하루 한 건일 때)', () => {
  assert.equal(dailyAverageExpense(txs.slice(0, 2)), 5000);
});
