import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, stats } from '../src/service.js';

test('요청 처리', () => {
  assert.equal(handleRequest(1, 'r1'), 1);
  assert.ok(stats().cacheSize >= 1);
});
