function createQuiz(questions) {
  const state = { index: 0, score: 0 };

  function current() {
    return questions[state.index] || null;
  }

  // choice: 단일 선택이면 숫자, 복수 선택이면 숫자 배열
  function answer(choice) {
    const q = current();
    if (!q) return false;
    const ok = choice === q.answer;
    if (ok) state.score += 1;
    state.index += 1;
    return ok;
  }

  function percent() {
    return Math.round((state.score / questions.length) * 100);
  }

  function restart() {
    state.index = 0;
  }

  return { state, current, answer, percent, restart, total: () => questions.length };
}

if (typeof module !== 'undefined') module.exports = { createQuiz };
