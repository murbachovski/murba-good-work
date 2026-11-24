// 금액은 정수 센트(cents)로 다룬다.
export function toCents(str) {
  return Math.floor(parseFloat(str) * 100);
}

export function formatCents(cents) {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole.toLocaleString('en-US')}.${String(frac).padStart(2, '0')}`;
}

export function splitCents(total, n) {
  const share = Math.floor(total / n);
  return Array.from({ length: n }, () => share);
}
