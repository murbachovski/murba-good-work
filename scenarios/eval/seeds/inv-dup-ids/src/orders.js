import { newOrderId } from './id.js';

const orders = new Map();

// 동시에 호출되면 같은 번호가 나올 수 있다? (확인 필요)
export function createOrder(items) {
  const id = newOrderId();
  orders.set(id, { id, items, createdAt: new Date().toISOString() });
  return orders.get(id);
}

export function getOrder(id) {
  return orders.get(id) ?? null;
}

export function orderCount() {
  return orders.size;
}
