const items = [
  { sku: 'PEN-1', name: '볼펜', stock: 10, min: 5 },
  { sku: 'NOTE-2', name: '공책', stock: 5, min: 5 },
  { sku: 'TAPE-3', name: '테이프', stock: 0, min: 2 },
];

export function resetStock() {
  items[0].stock = 10;
  items[1].stock = 5;
  items[2].stock = 0;
}

export function findItem(sku) {
  return items.find((i) => i.sku === sku);
}

export function sell(sku, qty) {
  const it = findItem(sku);
  if (!it) return { ok: false, error: 'not_found' };
  if (it.stock === 0) return { ok: false, error: 'out_of_stock' };
  it.stock -= qty;
  return { ok: true, stock: it.stock };
}

// 재고가 min 이하인 품목
export function lowStock() {
  return items.filter((i) => i.stock < i.min).map((i) => i.sku);
}
