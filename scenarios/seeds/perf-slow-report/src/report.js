// records: [{ userId, amount, day }]  -> 사용자별 합계/건수/최대, 일별 합계
export function buildReport(records) {
  const users = [];
  for (const r of records) {
    if (users.indexOf(r.userId) === -1) users.push(r.userId);
  }
  const perUser = users.map((id) => {
    const mine = records.filter((r) => r.userId === id);
    return {
      userId: id,
      total: mine.reduce((s, r) => s + r.amount, 0),
      count: mine.length,
      max: Math.max(...mine.map((r) => r.amount)),
    };
  });
  perUser.sort((a, b) => b.total - a.total || a.userId - b.userId);

  const days = [];
  for (const r of records) if (!days.includes(r.day)) days.push(r.day);
  days.sort();
  const perDay = days.map((d) => ({
    day: d,
    total: records.filter((r) => r.day === d).reduce((s, r) => s + r.amount, 0),
  }));
  return { perUser, perDay };
}
