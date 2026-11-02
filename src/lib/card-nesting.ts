import { deepClone, isDoneColumn, markCardDone, moveCardAcrossBoards, resolveBoardAtPath } from "./board-utils";
import type { CardLocation, Destination } from "./board-utils";
import { fileInboxCard, INBOX_DROP_ID, inboxCards } from "./inbox";
import { isRepeating, nextOccurrence, rollCardOver } from "./repeat";
import type { Column, RootBoard } from "./types";

export interface NestDestination extends Destination {
  /** Staged by the picker; only installed if the destination is still empty. */
  initialColumns?: Column[];
}

/** Create the board's columns and move the entire card in one transaction. */
export function nestCard(
  root: RootBoard,
  from: CardLocation,
  to: NestDestination,
  doneOnDrop = false,
): RootBoard | null {
  if (to.path.some((step) => step.cardId === from.cardId)) return null;

  // A stale/archived target must never fall back to another board.
  for (let i = 0; i < to.path.length; i++) {
    const step = to.path[i];
    const parent = resolveBoardAtPath(root, to.path.slice(0, i));
    const target = parent?.columns.find((col) => col.id === step.colId)?.cards.find((card) => card.id === step.cardId);
    if (!target || target.archived) return null;
  }
  const source = from.colId === INBOX_DROP_ID
    ? inboxCards(root).find((card) => card.id === from.cardId)
    : resolveBoardAtPath(root, from.path)?.columns.find((col) => col.id === from.colId)?.cards.find((card) => card.id === from.cardId);
  if (!source || source.archived) return null;

  let prepared = root;
  if (to.initialColumns) {
    const board = resolveBoardAtPath(root, to.path);
    if (!board || board.columns.length || !to.initialColumns.length || to.initialColumns.some((col) => col.cards.length)) return null;
    prepared = deepClone(root);
    const destination = resolveBoardAtPath(prepared, to.path);
    if (!destination) return null;
    destination.columns = deepClone(to.initialColumns);
  }

  if (from.colId === INBOX_DROP_ID) {
    return fileInboxCard(prepared, from.cardId, to.path, to.colId, { doneOnDrop });
  }
  const next = moveCardAcrossBoards(prepared, from, to);
  if (!next) return null;
  const board = resolveBoardAtPath(next, to.path);
  const column = board?.columns.find((col) => col.id === to.colId);
  const card = column?.cards.find((item) => item.id === from.cardId);
  if (!board || !column || !card) return null;
  if (doneOnDrop && isDoneColumn(column)) {
    if (isRepeating(card)) rollCardOver(card, nextOccurrence(card.dueAt, card.repeat));
    else markCardDone(board, column.id, card.id);
  }
  return next;
}
