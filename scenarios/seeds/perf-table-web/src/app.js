var ALL = makeRows(8000);
var tbody = document.getElementById('tbody');
var input = document.getElementById('q');
var count = document.getElementById('count');

function render(rows) {
  tbody.innerHTML = '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    tbody.innerHTML += '<tr><td>' + r.id + '</td><td>' + r.name + '</td><td>' + r.city + '</td><td>' + r.amount + '</td></tr>';
  }
  count.textContent = rows.length + '건';
}
input.addEventListener('input', function () { render(filterRows(ALL, input.value)); });
render(ALL);
