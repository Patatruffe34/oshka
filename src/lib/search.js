import { cardLabels, cardChecklists, dueState } from "./board-utils";

/** Fold case and accents so "echeance" matches "échéance". */
const normalize = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** A short excerpt around the first hit, with the matched run marked out. */
export const makeSnippet = (text, needle, radius = 40) => {
  if (!text) return null;
  const idx = normalize(text).indexOf(needle);
  if (idx === -1) return null;

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, idx),
    match: text.slice(idx, idx + needle.length),
    after: text.slice(idx + needle.length, end) + (end < text.length ? "…" : ""),
  };
};

/**
 * Walk the whole tree and collect cards matching the query.
 *
 * The entire board lives in memory, so a search across every depth costs one
 * traversal — the recursive structure is what makes this worth having.
 *
 * @param root      the root board
 * @param query.text        free text, matched against title, description,
 *                          comments and checklist items
 * @param query.labelIds    card must carry every one of these labels
 * @param query.due         "overdue" | "any" | null
 * @param query.done        true | false | null (null = either)
 * @param query.includeArchived  archived cards are excluded unless set
 * @returns results, each carrying the path to the board holding the card
 */
export function searchBoard(root, query = {}, now = new Date()) {
  const { text = "", labelIds = [], due = null, done = null, includeArchived = false } = query;
  const needle = normalize(text.trim());
  const hasText = needle.length > 0;
  const hasFilter = labelIds.length > 0 || due || done !== null;
  if (!hasText && !hasFilter) return [];

  const results = [];

  const walk = (board, path) => {
    if (!board?.columns) return;
    for (const col of board.columns) {
      for (const card of col.cards) {
        const childPath = [
          ...path,
          { colId: col.id, cardId: card.id, cardTitle: card.title },
        ];

        const eligible = includeArchived || !card.archived;
        if (eligible) {
          const hit = matchCard(card, { needle, hasText, labelIds, due, done }, now);
          if (hit) {
            results.push({
              card,
              colId: col.id,
              colTitle: col.title,
              // Path to the board that CONTAINS the card, for navigation
              path,
              // Trail of titles for display, card included
              trail: childPath.map((p) => p.cardTitle),
              depth: path.length,
              ...hit,
            });
          }
        }

        walk(card.board, childPath);
      }
    }
  };

  walk(root, []);

  // Title hits first, then shallower cards — the ones nearest the surface are
  // usually what the user had in mind.
  const rank = { title: 0, checklist: 1, description: 2, comment: 3 };
  results.sort(
    (a, b) => rank[a.matchedIn] - rank[b.matchedIn] || a.depth - b.depth
  );
  return results;
}

function matchCard(card, { needle, hasText, labelIds, due, done }, now) {
  if (labelIds.length > 0) {
    const own = cardLabels(card);
    if (!labelIds.every((id) => own.includes(id))) return null;
  }

  if (done !== null && Boolean(card.done) !== done) return null;

  if (due) {
    const state = dueState(card.dueAt, card.done, now);
    if (due === "overdue" && state !== "overdue") return null;
    if (due === "any" && !card.dueAt) return null;
  }

  if (!hasText) return { matchedIn: "filter", snippet: null };

  if (normalize(card.title).includes(needle)) {
    return { matchedIn: "title", snippet: makeSnippet(card.title, needle) };
  }
  if (normalize(card.description).includes(needle)) {
    return { matchedIn: "description", snippet: makeSnippet(card.description, needle) };
  }
  for (const list of cardChecklists(card)) {
    if (normalize(list.title).includes(needle)) {
      return { matchedIn: "checklist", snippet: makeSnippet(list.title, needle) };
    }
    for (const item of list.items) {
      if (normalize(item.text).includes(needle)) {
        return { matchedIn: "checklist", snippet: makeSnippet(item.text, needle) };
      }
    }
  }
  for (const comment of card.comments || []) {
    if (normalize(comment.text).includes(needle)) {
      return { matchedIn: "comment", snippet: makeSnippet(comment.text, needle) };
    }
  }
  return null;
}
