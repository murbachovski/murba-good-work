import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSummary } from '../src/summary.js';

const DATA = new URL('../data', import.meta.url).pathname;

test('요약 결과', (t, done) => {
  buildSummary(DATA, (err, out) => {
    assert.equal(err, null);
    assert.deepEqual(out, [
      { name: '가', team: '개발팀', total: 150 },
      { name: '나', team: '디자인팀', total: 0 },
      { name: '다', team: '개발팀', total: 70 },
    ]);
    done();
  });
});
test('파일이 없으면 err', (t, done) => {
  buildSummary(path.join(os.tmpdir(), 'no-such-dir-xyz'), (err) => {
    assert.ok(err);
    done();
  });
});
test('깨진 JSON이면 err', (t, done) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sum-'));
  for (const f of ['users', 'payments', 'teams']) fs.writeFileSync(path.join(d, f + '.json'), '{oops');
  buildSummary(d, (err) => {
    assert.ok(err instanceof Error);
    done();
  });
});
