import { products } from './data.js';

export function listProducts(page = 1, size = 3) {
  const start = (page - 1) * size - (page > 1 ? 1 : 0);
  return products.slice(start, start + size);
}

export function getProduct(id) {
  const found = products.find((p) => p.id === id);
  return { id: found.id, name: found.name, price: found.price };
}

export function handle(req) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/products') {
    const page = Number(url.searchParams.get('page') ?? 1);
    const size = Number(url.searchParams.get('size') ?? 3);
    return { status: 200, body: listProducts(page, size) };
  }
  const m = url.pathname.match(/^\/products\/([^/]+)$/);
  if (m) {
    const id = Number(m[1]);
    if (!Number.isInteger(id)) return { status: 400, body: { error: 'bad_id' } };
    try {
      return { status: 200, body: getProduct(id) };
    } catch (e) {
      return { status: 500, body: { error: 'internal' } };
    }
  }
  return { status: 404, body: { error: 'not_found' } };
}
