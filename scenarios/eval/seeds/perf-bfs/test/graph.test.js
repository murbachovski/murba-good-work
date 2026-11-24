import test from 'node:test';
import assert from 'node:assert/strict';
import { shortestPath } from '../src/graph.js';

const g = { a: ['b', 'c'], b: ['d'], c: ['d', 'e'], d: ['f'], e: ['f'], f: [] };

test('최단 경로', () => {
  assert.deepEqual(shortestPath(g, 'a', 'f'), ['a', 'b', 'd', 'f']);
});
test('시작=목표', () => assert.deepEqual(shortestPath(g, 'a', 'a'), ['a']));
test('도달 불가', () => assert.equal(shortestPath(g, 'f', 'a'), null));
