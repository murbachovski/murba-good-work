// 결정적 접근 로그 생성기: node gen.mjs -> logs/access.log (1200줄), logs/error.log (0바이트)
import { writeFileSync } from 'node:fs';
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(7);
const pick = (a) => a[Math.floor(r() * a.length)];
const paths = ['/', '/products', '/products/12', '/api/orders', '/검색?q=' + encodeURIComponent('무선 마우스'), '/카테고리/' + encodeURIComponent('주방용품'), '/login', '/static/app.js'];
const status = [200, 200, 200, 200, 200, 301, 304, 404, 404, 500, 503];
const lines = [];
for (let i = 0; i < 1200; i++) {
  const h = String(Math.floor(r() * 24)).padStart(2, '0'), mi = String(Math.floor(r() * 60)).padStart(2, '0'), s = String(Math.floor(r() * 60)).padStart(2, '0');
  const day = String(1 + Math.floor(r() * 7)).padStart(2, '0');
  const ip = `10.0.${Math.floor(r() * 4)}.${1 + Math.floor(r() * 20)}`;
  let line = `2026-03-${day}T${h}:${mi}:${s}+09:00 ${pick(['GET', 'GET', 'GET', 'POST'])} ${pick(paths)} ${pick(status)} ${Math.floor(r() * 900) + 5}ms ${ip}`;
  if (i % 53 === 0) line = '### 로그 회전됨 ###';
  else if (i % 71 === 0) line = line.split(' ').slice(0, 3).join(' ');
  else if (i % 89 === 0) line = '';
  else if (i % 113 === 0) line = line.replace(/\d+ms/, '-');
  lines.push(line);
}
writeFileSync(new URL('./logs/access.log', import.meta.url), lines.join('\n') + '\n');
writeFileSync(new URL('./logs/error.log', import.meta.url), '');
