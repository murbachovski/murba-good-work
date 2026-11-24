export function tokenize(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

export function countWords(text) {
  const counts = new Map();
  for (const w of tokenize(text)) counts.set(w, (counts.get(w) || 0) + 1);
  return counts;
}

export function topN(counts, n = 10) {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, n);
}
