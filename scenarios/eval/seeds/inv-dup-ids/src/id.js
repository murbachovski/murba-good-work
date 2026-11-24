// 주문번호 생성
let seq = 0;

export function newOrderId(now = Date.now()) {
  seq = (seq + 1) % 100;
  const sec = Math.floor(now / 1000);
  return `ORD-${sec}-${String(seq).padStart(2, '0')}`;
}
