import type { Board, Card, Id, TitledSegment } from "./types";

export interface CardLinkTarget {
  card: Card;
  colId: Id;
  /** The board holding the card, resolved from its current location. */
  path: TitledSegment[];
}

export function cardLink(cardId: Id, pageUrl = window.location.href): string {
  const url = new URL(pageUrl);
  // Do not copy authentication or capture parameters from the current page.
  url.search = "";
  url.hash = `card=${encodeURIComponent(cardId)}`;
  return url.href;
}

export function cardIdFromHash(hash: string): Id | null {
  if (!hash.startsWith("#card=")) return null;
  try {
    return decodeURIComponent(hash.slice(6)) || null;
  } catch {
    return null;
  }
}

/** IDs survive moves, including moves of an ancestor board. Archives count too. */
export function findLinkedCard(board: Board | null | undefined, cardId: Id, path: TitledSegment[] = []): CardLinkTarget | null {
  if (!board?.columns) return null;
  for (const column of board.columns) {
    for (const card of column.cards) {
      if (card.id === cardId) return { card, colId: column.id, path };
      const found = findLinkedCard(card.board, cardId, [...path, {
        colId: column.id, cardId: card.id, cardTitle: card.title,
      }]);
      if (found) return found;
    }
  }
  return null;
}
