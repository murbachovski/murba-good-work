export function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function wordCount(s) {
  return s.split(' ').length;
}

export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function sameName(a, b) {
  return a.trim() === b.trim();
}
