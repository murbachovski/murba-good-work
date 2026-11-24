export function paginate(items, page, size) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be >= 1');
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be >= 1');
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), totalPages: Math.ceil(items.length / size) };
}
