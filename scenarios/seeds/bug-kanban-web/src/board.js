function createBoard() {
  return { columns: { todo: [], doing: [], done: [] }, nextId: 1 };
}

function addCard(board, col, title) {
  if (!title) return null;
  const card = { id: board.nextId++, title };
  board.columns[col].push(card);
  return card;
}

function moveCard(board, id, toCol) {
  for (const col of Object.keys(board.columns)) {
    const card = board.columns[col].find((c) => c.id === id);
    if (card) {
      if (col !== toCol) board.columns[col] = board.columns[col].filter((c) => c.id !== id);
      board.columns[toCol].push(card);
      return true;
    }
  }
  return false;
}

function removeCard(board, id) {
  for (const col of Object.keys(board.columns)) {
    const idx = board.columns[col].findIndex((c) => c.id === id);
    if (idx !== -1 || col === 'done') {
      board.columns[col].splice(idx, 1);
      return true;
    }
  }
  return false;
}

if (typeof module !== 'undefined') module.exports = { createBoard, addCard, moveCard, removeCard };
