import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../src/report.js';

test('작은 입력', () => {
  const r = buildReport([
    { userId: 2, amount: 10, day: '2026-03-02' },
    { userId: 1, amount: 30, day: '2026-03-01' },
    { userId: 2, amount: 25, day: '2026-03-01' },
  ]);
  assert.deepEqual(r.perUser, [
    { userId: 2, total: 35, count: 2, max: 25 },
    { userId: 1, total: 30, count: 1, max: 30 },
  ]);
  assert.deepEqual(r.perDay, [{ day: '2026-03-01', total: 55 }, { day: '2026-03-02', total: 10 }]);
});
test('빈 입력', () => {
  assert.deepEqual(buildReport([]), { perUser: [], perDay: [] });
});
