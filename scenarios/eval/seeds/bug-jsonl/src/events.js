import { readFileSync } from 'node:fs';

export function loadEvents(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const events = [];
  let skipped = 0;
  for (const line of lines) {
    events.push(JSON.parse(line));
  }
  return { events, skipped };
}

export function countByType(events) {
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
  return counts;
}
