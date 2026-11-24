import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCustomers } from '../src/customers.js';

test('이름을 다듬고 정렬한다', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'cu-')), 'c.json');
  writeFileSync(p, JSON.stringify([{ id: 2, name: ' 나 ' }, { id: 1, name: '가' }]));
  assert.deepEqual(listCustomers(p), [{ id: 1, name: '가' }, { id: 2, name: '나' }]);
});
