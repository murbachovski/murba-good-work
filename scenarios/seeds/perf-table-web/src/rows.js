function makeRows(n) {
  var rows = [], x = 42;
  for (var i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    rows.push({ id: i + 1, name: '고객' + (x % 9000), city: ['서울', '부산', '대구', '광주'][x % 4], amount: x % 100000 });
  }
  return rows;
}
function filterRows(rows, q) {
  q = q.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(function (r) { return (r.name + ' ' + r.city).toLowerCase().indexOf(q) !== -1; });
}
if (typeof module !== 'undefined') module.exports = { makeRows, filterRows };
