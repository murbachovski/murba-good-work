// 시나리오 준비용: node 내장 sqlite(Node 22.5+)로 db/app.sqlite 생성
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, rmSync } from 'node:fs';
const path = new URL('./app.sqlite', import.meta.url).pathname;
rmSync(path, { force: true });
const db = new DatabaseSync(path);
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
console.log('created', path);
