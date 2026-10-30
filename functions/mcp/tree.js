const {
  inboxCards,
  visibleCards,
  cardLabels,
  checklistProgress,
  normalizeRepeat,
} = require("./build/oshka.cjs");
const { ToolError } = require("./store");

/** How tools name the two places that are not a card's board */
const ROOT = "root";
const INBOX = "inbox";
const ROOT_LABEL = "Root";

/** Fold case, accents and emoji, so "a faire" finds "📥 À faire". */
const fold = (s) =>
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
function locateCard(root, cardId) {
  const inInbox = inboxCards(root).find((c) => c.id === cardId);
  if (inInbox) return { inInbox: true, card: inInbox, path: [], trail: ["Inbox"] };

  let found = null;
  const walk = (board, path, trail) => {
    for (const col of board?.columns ?? []) {
      for (const card of col.cards) {
        if (found) return;
        if (card.id === cardId) {
          found = { inInbox: false, card, col, board, path, trail };
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
function locateBoard(root, ref = ROOT) {
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
function findColumn(board, trail, ref) {
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
function insertionIndex(col, position) {
  if (!Number.isInteger(position)) return col.cards.length;
  const anchor = visibleCards(col)[Math.max(0, position)];
  return anchor ? col.cards.indexOf(anchor) : col.cards.length;
}

const columnName = (col) => [col.emoji, col.title].filter(Boolean).join(" ") || "(untitled)";
const trailText = (trail) => trail.join(" › ");

/** Label names, or their colour when they were never named */
const labelNames = (root, card) =>
  cardLabels(card)
    .map((id) => root.labels?.find((l) => l.id === id))
    .filter(Boolean)
    .map((l) => l.name || l.color);

/** Resolve label names (or colours) against the tree's shared set */
function resolveLabels(root, names) {
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

const subCardCount = (card) =>
  (card.board?.columns ?? []).reduce((n, col) => n + visibleCards(col).length, 0);

/** One line that says what a card is, with its id to act on it */
function cardLine(root, card) {
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
function outline(root, board, depth, { includeDone = true } = {}) {
  const lines = [];
  const walk = (b, level) => {
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

module.exports = {
  ROOT,
  INBOX,
  fold,
  locateCard,
  locateBoard,
  findColumn,
  insertionIndex,
  columnName,
  trailText,
  labelNames,
  resolveLabels,
  cardLine,
  outline,
};
