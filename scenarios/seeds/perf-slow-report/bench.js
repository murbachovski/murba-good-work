import { buildReport } from './src/report.js';
import { createHash } from 'node:crypto';

const N = 200000;
const records = [];
let x = 12345;
for (let i = 0; i < N; i++) {
  x = (x * 1103515245 + 12345) % 2147483648;
  records.push({ userId: x % 80000, amount: (x >> 8) % 1000, day: '2026-03-' + String(1 + (x % 28)).padStart(2, '0') });
}
const t0 = performance.now();
const rep = buildReport(records);
const ms = Math.round(performance.now() - t0);
console.log('records', N, 'elapsed_ms', ms);
console.log('sha1', createHash('sha1').update(JSON.stringify(rep)).digest('hex'));
