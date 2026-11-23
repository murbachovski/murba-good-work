var quiz = createQuiz(QUESTIONS);
var root = document.getElementById('root');

function render() {
  var q = quiz.current();
  root.innerHTML = '';
  if (!q) {
    var p = document.createElement('p');
    p.id = 'result';
    p.textContent = '점수: ' + quiz.state.score + ' / ' + quiz.total() + ' (' + quiz.percent() + '%)';
    var b = document.createElement('button');
    b.id = 'restart';
    b.textContent = '다시 풀기';
    b.onclick = function () { quiz.restart(); render(); };
    root.append(p, b);
    return;
  }
  var h = document.createElement('h2');
  h.textContent = q.text;
  root.append(h);
  if (q.multi) {
    var boxes = [];
    q.choices.forEach(function (c, i) {
      var l = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      boxes.push(cb);
      l.append(cb, ' ' + c);
      root.append(l, document.createElement('br'));
    });
    var s = document.createElement('button');
    s.id = 'submit';
    s.textContent = '제출';
    s.onclick = function () {
      var picked = [];
      boxes.forEach(function (cb, i) { if (cb.checked) picked.push(i); });
      quiz.answer(picked);
      render();
    };
    root.append(s);
  } else {
    q.choices.forEach(function (c, i) {
      var b = document.createElement('button');
      b.textContent = c;
      b.onclick = function () { quiz.answer(i); render(); };
      root.append(b);
    });
  }
}
render();
