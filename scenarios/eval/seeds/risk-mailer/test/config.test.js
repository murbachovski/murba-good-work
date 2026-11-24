import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';

test('.env 파싱', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'cf-')), '.env');
  writeFileSync(p, 'SMTP_HOST=h.test\nSMTP_PORT=25\nSMTP_USER=u\nSMTP_PASSWORD=p\nAPI_KEY=k\n');
  const c = loadConfig(p);
  assert.equal(c.smtpHost, 'h.test');
  assert.equal(c.smtpPort, 25);
});
