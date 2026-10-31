import { visibleCards, cardLabels, checklistProgress } from "../../src/lib/board-utils";
import { inboxCards } from "../../src/lib/inbox";
import { normalizeRepeat } from "../../src/lib/repeat";
import type { Board, Card, Column, Id, Label, PathSegment, RootBoard } from "../../src/lib/types";
import { ToolError } from "./store";

/** How tools name the two places that are not a card's board */
export const ROOT = "root";
export const INBOX = "inbox";
const ROOT_LABEL = "Root";

/** Where a card was found: in the Inbox, or on a board down the tree */
export type CardLocation =
  | { inInbox: true; card: Card; path: PathSegment[]; trail: string[] }
  | { inInbox: false; card: Card; col: Column; board: Board; path: PathSegment[]; trail: string[] };

/** A board, with the path that leads to it and its trail of titles */
export interface BoardLocation {
  board: Board;
  path: PathSegment[];
  trail: string[];
}

/** Fold case, accents and emoji, so "a faire" finds "📥 À faire". */
export const fold = (s: string | null | undefined): string =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();

/**
 * Where a card lives, by id alone.
 *
 * Ids are unique across the tree, so the model never has to carry a path:
 * it names a card and this finds the board, column and trail of titles.
 */
export function locateCard(root: RootBoard, cardId: Id): CardLocation {
  const inInbox = inboxCards(root).find((c) => c.id === cardId);
  if (inInbox) return { inInbox: true, card: inInbox, path: [], trail: ["Inbox"] };

  let found: CardLocation | null = null;
  const walk = (board: Board | undefined, path: PathSegment[], trail: string[]) => {
    for (const col of board?.columns ?? []) {
      for (const card of col.cards) {
        if (found) return;
        if (card.id === cardId) {
          found = { inInbox: false, card, col, board: board!, path, trail };
          return;
        }
        walk(card.board, [...path, { colId: col.id, cardId: card.id }], [...trail, card.title]);
      }
    }
  };
  walk(root, [], [ROOT_LABEL]);
  if (!found) throw new ToolError(`No card with id "${cardId}". Use search_cards or get_outline to find it.`);
  return found;
}

/** The board a card opens onto, or the root one. */
export function locateBoard(root: RootBoard, ref: string | undefined = ROOT): BoardLocation {
  if (!ref || ref === ROOT) return { board: root, path: [], trail: [ROOT_LABEL] };
  const at = locateCard(root, ref);
  if (at.inInbox) throw new ToolError("Inbox cards have no board until they are filed somewhere.");
  at.card.board ??= { columns: [] };
  return {
    board: at.card.board,
    path: [...at.path, { colId: at.col.id, cardId: at.card.id }],
    trail: [...at.trail, at.card.title],
  };
}

/**
 * A column by id, by title, or by emoji — the first one when not named.
 * A board with no column cannot take a card, and saying how to fix that is
 * more use than a bare refusal.
 */
export function findColumn(board: Board, trail: string[], ref: string | undefined): Column {
  const columns = board.columns ?? [];
  if (columns.length === 0) {
    throw new ToolError(`"${trail.at(-1)}" has no column yet. Create one with create_column first.`);
  }
  if (!ref) return columns[0];
  const wanted = fold(ref);
  const col =
    columns.find((c) => c.id === ref) ??
    columns.find((c) => wanted && fold(c.title) === wanted) ??
    columns.find((c) => c.emoji && ref.includes(c.emoji));
  if (!col) {
    const names = columns.map((c) => `${columnName(c)} [${c.id}]`).join(", ");
    throw new ToolError(`No column "${ref}" on "${trail.at(-1)}". Columns: ${names}.`);
  }
  return col;
}

/**
 * Where a card lands among the visible ones, as an index in the full list.
 * Archived cards stay hidden in the array, so "first" must mean first shown.
 */
export function insertionIndex(col: Column, position: number | undefined): number {
  if (!Number.isInteger(position)) return col.cards.length;
  const anchor = visibleCards(col)[Math.max(0, position!)];
  return anchor ? col.cards.indexOf(anchor) : col.cards.length;
}

export const columnName = (col: Column): string => [col.emoji, col.title].filter(Boolean).join(" ") || "(untitled)";
export const trailText = (trail: string[]): string => trail.join(" › ");

/** Label names, or their colour when they were never named */
export const labelNames = (root: RootBoard, card: Card): string[] =>
  cardLabels(card)
    .map((id) => root.labels?.find((l) => l.id === id))
    .filter((l): l is Label => Boolean(l))
    .map((l) => l.name || l.color);

/** Resolve label names (or colours) against the tree's shared set */
export function resolveLabels(root: RootBoard, names: string[]): Id[] {
  const labels = root.labels ?? [];
  return names.map((name) => {
    const wanted = fold(name);
    const label =
      labels.find((l) => l.id === name) ??
      labels.find((l) => l.name && fold(l.name) === wanted) ??
      labels.find((l) => !l.name && l.color === name);
    if (!label) {
      const known = labels.map((l) => l.name || l.color).join(", ");
      throw new ToolError(`No label "${name}". Labels: ${known || "none"}.`);
    }
    return label.id;
  });
}

const subCardCount = (card: Card) =>
  (card.board?.columns ?? []).reduce((n, col) => n + visibleCards(col).length, 0);

/** One line that says what a card is, with its id to act on it */
export function cardLine(root: RootBoard, card: Card): string {
  const bits = [`${card.done ? "[x]" : "[ ]"} ${card.title} [${card.id}]`];
  if (card.dueAt) bits.push(`due ${String(card.dueAt).slice(0, 10)}`);
  const rep = normalizeRepeat(card.repeat);
  if (rep) bits.push(`repeats every ${rep.every} ${rep.unit}${rep.every > 1 ? "s" : ""}`);
  const labels = labelNames(root, card);
  if (labels.length) bits.push(`labels: ${labels.join(", ")}`);
  const { done, total } = checklistProgress(card);
  if (total) bits.push(`checklist ${done}/${total}`);
  const inside = subCardCount(card);
  if (inside) bits.push(`${inside} card${inside > 1 ? "s" : ""} inside`);
  if (card.archived) bits.push("archived");
  return bits.join(" · ");
}

/** A board and what hangs below it, down to `depth` levels of boards */
export function outline(root: RootBoard, board: Board | undefined, depth: number, { includeDone = true } = {}): string {
  const lines: string[] = [];
  const walk = (b: Board | undefined, level: number) => {
    const pad = "  ".repeat(level * 2);
    for (const col of b?.columns ?? []) {
      lines.push(`${pad}## ${columnName(col)} [column ${col.id}]`);
      for (const card of visibleCards(col)) {
        if (!includeDone && card.done) continue;
        lines.push(`${pad}- ${cardLine(root, card)}`);
        if (level + 1 < depth) walk(card.board, level + 1);
      }
    }
  };
  walk(board, 0);
  return lines.length ? lines.join("\n") : "(empty board)";
}
