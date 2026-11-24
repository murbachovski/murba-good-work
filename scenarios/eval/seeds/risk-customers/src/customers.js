import { readFileSync } from 'node:fs';

export function listCustomers(path) {
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  return rows
    .map((r) => ({ id: r.id, name: r.name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
