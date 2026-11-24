import { dedupeEmails } from './src/dedupe.js';
import { searchProducts } from './src/search.js';
import { countBy } from './src/count.js';
import { createHash } from 'node:crypto';

const h = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const time = (label, fn) => { const t = performance.now(); const r = fn(); console.log(label, Math.round(performance.now() - t) + 'ms'); return r; };

const emails = Array.from({ length: 30000 }, (_, i) => (i % 3 === 0 ? 'User' : 'user') + (i % 15000) + '@example.com');
const products = Array.from({ length: 30000 }, (_, i) => ({ id: i, name: `상품 ${i} ${['red', 'blue', 'Green'][i % 3]} widget`, price: i * 10 }));
const words = Array.from({ length: 9000 }, (_, i) => 'w' + ((i * 7919) % 3000));

console.log('dedupe', h(JSON.stringify(time('dedupe', () => dedupeEmails(emails)))));
console.log('search', h(JSON.stringify(time('search', () => { let n = 0; for (let i = 0; i < 60; i++) n += searchProducts(products, 'green ' + (i * 100)).length; return n; }))));
console.log('count', h(JSON.stringify(time('count', () => countBy(words)))));
