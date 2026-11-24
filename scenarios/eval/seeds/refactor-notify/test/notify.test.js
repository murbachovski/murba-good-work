import test from 'node:test';
import assert from 'node:assert/strict';
import { notify } from '../src/notify.js';

const u = { name: 'Kim', email: 'k@x.test', phone: '010-1234-5678', deviceToken: 'tok1' };

test('email', () => {
  const r = notify(u, '  hello  ');
  assert.equal(r.to, 'k@x.test');
  assert.equal(r.body, 'hello\n-- sent by app');
});
test('sms 는 숫자만 남기고 70자로 줄인다', () => {
  const r = notify(u, 'x'.repeat(100), { channel: 'sms' });
  assert.equal(r.to, '01012345678');
  assert.equal(r.body.length, 70);
});
test('알 수 없는 채널', () => {
  assert.throws(() => notify(u, 'hi', { channel: 'fax' }), /unknown channel: fax/);
});
