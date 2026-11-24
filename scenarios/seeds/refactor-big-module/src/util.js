// ===== 문자열 =====
export function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
export function padLeft(s, n, ch = ' ') { s = String(s); return s.length >= n ? s : ch.repeat(n - s.length) + s; }
export function isBlank(s) { return s == null || String(s).trim() === ''; }
export function camelToSnake(s) { return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()); }

// ===== 날짜 (UTC 기준) =====
export function formatDate(d) {
  return `${d.getUTCFullYear()}-${padLeft(d.getUTCMonth() + 1, 2, '0')}-${padLeft(d.getUTCDate(), 2, '0')}`;
}
export function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
export function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
export function isWeekend(d) { const w = d.getUTCDay(); return w === 0 || w === 6; }

// ===== 배열 =====
export function unique(arr) { return [...new Set(arr)]; }
export function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
export function groupBy(arr, fn) { return arr.reduce((m, x) => { (m[fn(x)] ||= []).push(x); return m; }, {}); }
export function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

// ===== 숫자 =====
export function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
export function roundTo(n, digits = 0) { const f = 10 ** digits; return Math.round(n * f) / f; }
export function formatWon(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ',') + '원'; }
export function percent(part, whole) { return whole === 0 ? 0 : roundTo((part / whole) * 100, 1); }
