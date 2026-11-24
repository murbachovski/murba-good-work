// 주문 금액 계산. 동작은 그대로 두고 구조만 개선하는 것이 목표.
export function calcOrder(order) {
  let subtotal = 0;
  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i];
    let p = it.price * it.qty;
    if (it.category === 'food') { p = p * 1.0; }
    else if (it.category === 'book') { p = p * 0.9; }
    else if (it.category === 'electronics') { if (it.qty >= 3) { p = p * 0.95; } }
    subtotal += p;
  }
  let discount = 0;
  if (order.member === 'gold') { discount = subtotal * 0.1; }
  else if (order.member === 'silver') { discount = subtotal * 0.05; }
  else if (order.member === 'bronze') { discount = subtotal * 0.02; }
  if (order.coupon === 'HALF' && subtotal >= 100000) { discount = discount + 5000; }
  if (order.coupon === 'TEN' && subtotal >= 50000) { discount = discount + subtotal * 0.1; }
  let afterDiscount = subtotal - discount;
  let shipping = 0;
  if (afterDiscount < 30000) { shipping = 3000; }
  if (afterDiscount < 30000 && order.region === 'jeju') { shipping = 5000; }
  if (afterDiscount >= 30000 && order.region === 'jeju') { shipping = 2000; }
  let total = afterDiscount + shipping;
  total = Math.floor(total / 10) * 10;
  return { subtotal: Math.round(subtotal), discount: Math.round(discount), shipping, total };
}
