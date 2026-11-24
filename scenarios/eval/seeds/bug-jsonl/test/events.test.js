import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEvents, countByType } from '../src/events.js';

function tmpFile(content) {
  const p = join(mkdtempSync(join(tmpdir(), 'ev-')), 'e.jsonl');
  writeFileSync(p, content);
  return p;
}

test('정상 파일 읽기', () => {
  const r = loadEvents(tmpFile('{"type":"a","ts":1}\n{"type":"b","ts":2}'));
  assert.equal(r.events.length, 2);
  assert.equal(r.skipped, 0);
});
test('타입별 집계', () => {
  assert.deepEqual(countByType([{ type: 'a' }, { type: 'a' }, { type: 'b' }]), { a: 2, b: 1 });
});
