/** Include all descendants of an archived card, even unarchived ones. */
export function archiveSummary(board) {
  let archived = 0;
  let total = 0;
  const walk = (current, removing = false) => {
    for (const col of current?.columns ?? []) {
      for (const card of col.cards) {
        if (card.archived) archived++;
        const remove = removing || !!card.archived;
        if (remove) total++;
        walk(card.board, remove);
      }
    }
  };
  walk(board);
  return { archived, total };
}

/** Only explicitly finished, unarchived cards are candidates for bulk archive. */
export function completedCardCount(board) {
  let count = 0;
  for (const col of board?.columns ?? []) {
    for (const card of col.cards) {
      if (card.done && !card.archived) count++;
      count += completedCardCount(card.board);
    }
  }
  return count;
}

/** Keep card contents and metadata intact; this operation is undoable. */
export function archiveCompletedCards(board) {
  if (!board?.columns) return board;
  let changed = false;
  const columns = board.columns.map((col) => {
    let columnChanged = false;
    const cards = col.cards.map((card) => {
      const child = archiveCompletedCards(card.board);
      const archive = card.done && !card.archived;
      if (!archive && child === card.board) return card;
      columnChanged = true;
      return { ...card, board: child, ...(archive ? { archived: true } : {}) };
    });
    if (!columnChanged) return col;
    changed = true;
    return { ...col, cards };
  });
  return changed ? { ...board, columns } : board;
}

/** Permanent cleanup: keep live cards and board metadata, without a trash copy. */
export function purgeArchivedCards(board) {
  if (!board?.columns) return board;
  let changed = false;
  const columns = board.columns.map((col) => {
    let columnChanged = false;
    const cards = [];
    for (const card of col.cards) {
      if (card.archived) { columnChanged = true; continue; }
      const child = purgeArchivedCards(card.board);
      if (child !== card.board) {
        cards.push({ ...card, board: child });
        columnChanged = true;
      } else cards.push(card);
    }
    if (!columnChanged) return col;
    changed = true;
    return { ...col, cards };
  });
  return changed ? { ...board, columns } : board;
}
