import { cardLabels } from "./board-utils";
import type { PlannedItem } from "./planner";
import type { Board, Id, Label, TitledSegment } from "./types";

/** One entry per known label, with each card's address on its source board. */
export function cardsByLabel(root: Board, labels: Label[]): Map<Id, PlannedItem[]> {
  const columns = new Map<Id, PlannedItem[]>(labels.map((label) => [label.id, []]));
  if (columns.size === 0) return columns;

  function walk(board: Board | undefined, path: TitledSegment[]) {
    for (const col of board?.columns ?? []) {
      for (const card of col.cards) {
        if (card.archived) continue;
        const item = { card, colId: col.id, colTitle: col.title, colEmoji: col.emoji, path };
        for (const id of new Set(cardLabels(card))) {
          columns.get(id)?.push(item);
        }
        if (card.board?.columns?.length) {
          walk(card.board, [...path, { colId: col.id, cardId: card.id, cardTitle: card.title }]);
        }
      }
    }
  }

  walk(root, []);
  return columns;
}
