import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

const cache = new Map();

// 요청마다 사용자 프로필을 (가짜로) 만들어 캐시한다
export function getProfile(userId, requestId) {
  const key = `${userId}:${requestId}`;
  if (cache.has(key)) return cache.get(key);
  const profile = { userId, bio: 'x'.repeat(2000), requestId };
  cache.set(key, profile);
  return profile;
}

export function handleRequest(userId, requestId) {
  const profile = getProfile(userId, requestId);
  const onUpdate = (e) => { if (e.userId === userId) profile.bio = e.bio; };
  bus.on('profile:update', onUpdate);
  return profile.userId;
}

export function stats() {
  return { cacheSize: cache.size, listeners: bus.listenerCount('profile:update') };
}
