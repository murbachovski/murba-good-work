// tx: { date: 'YYYY-MM-DD', category, amount }  (지출은 음수, 수입은 양수)
export function monthTransactions(txs, month) {
  return txs.filter((t) => t.date > `${month}-01` && t.date <= `${month}-31`);
}

export function totalExpense(txs) {
  return txs.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
}

export function topSpending(txs) {
  const amounts = txs.filter((t) => t.amount < 0).map((t) => -t.amount);
  if (amounts.length === 0) return 0;
  return amounts.sort().pop();
}

export function dailyAverageExpense(txs) {
  if (txs.length === 0) return 0;
  return Math.round(totalExpense(txs) / txs.length);
}
