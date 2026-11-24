var board = createBoard();
var NAMES = { todo: '할 일', doing: '진행 중', done: '완료' };
var ORDER = ['todo', 'doing', 'done'];
var root = document.getElementById('board');

function render() {
  root.innerHTML = '';
  ORDER.forEach(function (col, ci) {
    var div = document.createElement('section');
    div.id = 'col-' + col;
    var h = document.createElement('h2');
    h.textContent = NAMES[col];
    div.append(h);
    board.columns[col].forEach(function (card) {
      var d = document.createElement('div');
      d.className = 'card';
      var t = document.createElement('span');
      t.textContent = card.title;
      d.append(t);
      if (ci > 0) d.append(btn('◀', function () { moveCard(board, card.id, ORDER[ci - 1]); render(); }));
      if (ci < 2) d.append(btn('▶', function () { moveCard(board, card.id, ORDER[ci + 1]); render(); }));
      d.append(btn('✕', function () { removeCard(board, card.id); render(); }));
      div.append(d);
    });
    root.append(div);
  });
}
function btn(label, fn) {
  var b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  return b;
}
document.getElementById('add').onclick = function () {
  var input = document.getElementById('title');
  addCard(board, 'todo', input.value);
  input.value = '';
  render();
};
render();
