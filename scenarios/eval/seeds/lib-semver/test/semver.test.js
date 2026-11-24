import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/semver.js';

test('기본 파싱', () => {
  assert.deepEqual(parse('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
});
test('프리릴리스와 빌드', () => {
  const v = parse('1.2.3-rc.1+b5');
  assert.deepEqual(v.prerelease, ['rc', '1']);
  assert.deepEqual(v.build, ['b5']);
});
test('잘못된 버전은 예외', () => {
  assert.throws(() => parse('1.2'));
  assert.throws(() => parse('01.2.3'));
});
