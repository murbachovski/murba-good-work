import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_NAME } from '../src/placeholder.js';

test('앱 이름', () => assert.equal(APP_NAME, 'splitbill'));
test('index.html 이 있다', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>/);
});
