export async function mapLimit(items, limit, fn) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results.push(await fn(items[i], i));
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
