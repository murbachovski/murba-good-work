export function average(scores) {
  const valid = scores.filter((s) => s);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function letter(score) {
  if (score > 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// students: [{ name, scores: number[] }] -> [{ name, avg, rank }]
export function rankStudents(students) {
  const rows = students.map((s) => ({ name: s.name, avg: average(s.scores) }));
  rows.sort((a, b) => b.avg - a.avg);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
