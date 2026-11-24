export function cartTotal(items) {
  return items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0);
}

export function shippingFee(total) {
  return total > 50000 ? 0 : 3000;
}

const COUPONS = {
  WELCOME10: { type: 'percent', value: 10 },
  FIX5000: { type: 'fixed', value: 5000 },
};

export function applyCoupon(total, code) {
  const c = COUPONS[code];
  if (!c) return total;
  if (c.type === 'percent') return Math.round(total * (1 - c.value / 100));
  return total - c.value;
}

export function formatWon(n) {
  return n.toString().replace(/\B(?=(\d{3})+$)/g, ',') + '원';
}
