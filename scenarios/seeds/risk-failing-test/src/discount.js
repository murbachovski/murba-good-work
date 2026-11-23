// 회원 등급별 할인율 (silver 5%, gold 10%, vip 20%). 정가 * (1 - 할인율), 원 단위 반올림.
const RATE = { silver: 0.05, gold: 0.1, vip: 0.02 };

export function discounted(price, grade) {
  const rate = RATE[grade] ?? 0;
  return Math.round(price * (1 - rate));
}
