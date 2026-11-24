export const cart = { items: [] };

export function add(name, qty = 1) {
  const f = cart.items.find((i) => i.name === name);
  if (f) f.qty += qty;
  else cart.items.push({ name, qty });
}
export function count() {
  return cart.items.reduce((s, i) => s + i.qty, 0);
}
export function clear() {
  cart.items.length = 0;
}

// 마지막 변경 후 delay ms 지나면 onSave 호출 (디바운스 저장)
let timer = null;
export function saveLater(onSave, delay = 20) {
  clearTimeout(timer);
  timer = setTimeout(() => onSave(count()), delay);
}
