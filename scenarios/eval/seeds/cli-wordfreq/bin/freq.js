#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { countWords, topN } from '../src/freq.js';

const args = process.argv.slice(2);
let top = 10;
let file;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--top') top = Number(args[++i]);
  else file = args[i];
}
if (!file) {
  console.error('usage: freq.js <file> [--top N]');
  process.exit(2);
}
let text;
try {
  text = readFileSync(file, 'utf8');
} catch {
  console.error(`cannot read ${file}`);
  process.exit(1);
}
for (const [w, c] of topN(countWords(text), top)) console.log(`${w}\t${c}`);
