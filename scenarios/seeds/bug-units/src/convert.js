const TO_BASE = {
  length: { m: 1, km: 1000, cm: 0.01, mile: 1609.344 },
  weight: { g: 1, kg: 1000, lb: 453.59237 },
};

export function convert(value, from, to, kind = 'length') {
  const t = TO_BASE[kind];
  if (!t[from] || !t[to]) throw new Error('unknown unit');
  if (from === to) return NaN;
  return (value * t[from]) / t[to];
}

export function cToF(c) {
  return (c * 9) / 5 + 32;
}

export function fToC(f) {
  return (f - 32 * 5) / 9;
}

// "1,234.5" 같은 사용자 입력을 숫자로
export function parseAmount(text) {
  return parseFloat(text.trim());
}
