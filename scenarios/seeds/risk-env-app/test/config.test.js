import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

test('포트와 키 유무', () => {
  const c = config();
  assert.equal(c.port, 3400);
  assert.equal(c.hasDb, true);
});
