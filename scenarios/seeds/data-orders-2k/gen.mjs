// 결정적(seed 고정) 주문 데이터 생성기: node gen.mjs  -> data/orders.csv (2000행)
import { writeFileSync } from 'node:fs';
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(20260301);
const pick = (a) => a[Math.floor(r() * a.length)];
const products = [['무선 마우스', 25000], ['기계식 키보드', 89000], ['USB-C 케이블, 2m', 9900], ['모니터 받침대', 32000], ['커피 ☕ 텀블러', 15000], ['노트북 파우치', 18000]];
const customers = ['김민준', '이서연', '박지호', '최유나', '정하윤', '강도현', '한글한글'];
const rows = ['order_id,order_date,customer,product,qty,unit_price,memo'];
const q = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
for (let i = 1; i <= 2000; i++) {
  let id = 'A' + String(i).padStart(5, '0');
  const m = 1 + Math.floor(r() * 6), d = 1 + Math.floor(r() * 28);
  let date = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const [pname, price] = pick(products);
  let cust = pick(customers);
  let qty = String(1 + Math.floor(r() * 5));
  let unit = String(price);
  let memo = '';
  if (i % 59 === 0) memo = '빨리, 부탁해요';
  if (i % 211 === 0) cust = cust.normalize('NFD');
  if (i % 97 === 0) date = ['2026-13-45', '26/03/05', '', '2026-02-30'][(i / 97) % 4];
  if (i % 131 === 0) qty = '-' + qty;
  if (i % 173 === 0) id = 'A' + String(i - 100).padStart(5, '0');
  if (i % 149 === 0) qty = '';
  if (i % 41 === 0) unit = '"' + String(price).replace(/\B(?=(\d{3})+$)/g, ',') + '"';
  if (i % 307 === 0) memo = '선물 포장 😀 "꼭" 부탁';
  rows.push([id, date, cust, q(pname), qty, unit, q(memo)].join(','));
}
writeFileSync(new URL('./data/orders.csv', import.meta.url), '﻿' + rows.join('\r\n') + '\r\n');
