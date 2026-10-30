import { dateForLane, LANES, planWeek } from "./planner";
import { deepClone, isDoneColumn, markCardDone, resolveBoardAtPath, visibleCards } from "./board-utils";

export const INBOX_DROP_ID = "oshka:inbox";

/** Unfiled cards travel with the root JSON, outside the board hierarchy. */
export const inboxCards = (root) => root?.inbox ?? [];

export function captureInboxCard(root, card) {
  if (!root || !card.title.trim()) return root;
  return { ...root, inbox: [card, ...inboxCards(root)] };
}

export function editInboxCard(root, id, title) {
  const text = title.trim();
  if (!text || !inboxCards(root).some((card) => card.id === id && card.title !== text)) return root;
  return { ...root, inbox: inboxCards(root).map((card) => card.id === id ? { ...card, title: text } : card) };
}

/** Detail edits stay outside the board hierarchy, just like captures. */
export function updateInboxCard(root, id, fields) {
  const card = inboxCards(root).find((item) => item.id === id);
  if (!card) return root;
  const changes = { ...fields };
  if ("title" in changes) {
    changes.title = changes.title.trim();
    if (!changes.title) delete changes.title;
  }
  if (Object.keys(changes).every((key) => Object.is(card[key], changes[key]))) return root;
  return { ...root, inbox: inboxCards(root).map((item) => item.id === id ? { ...item, ...changes } : item) };
}

export function removeInboxCard(root, id) {
  if (!inboxCards(root).some((card) => card.id === id)) return root;
  return { ...root, inbox: inboxCards(root).filter((card) => card.id !== id) };
}

/** Validate first: a stale destination must never remove a captured thought. */
export function fileInboxCard(root, id, path, colId, { doneOnDrop = false, stamp, index, labelFilter = [], dueAt, lane, laneIndex } = {}) {
  const card = inboxCards(root).find((item) => item.id === id);
  if (!card || !resolveBoardAtPath(root, path)?.columns.some((col) => col.id === colId)) return null;
  const next = deepClone(root);
  const board = resolveBoardAtPath(next, path);
  const column = board.columns.find((col) => col.id === colId);
  const filed = next.inbox.find((item) => item.id === id);
  if (dueAt !== undefined) filed.dueAt = dueAt;
  // DnD indices describe the visible, filtered cards, not archived/hidden ones.
  const visible = visibleCards(column).filter((item) => !labelFilter.length || labelFilter.every((label) => (item.labels || []).includes(label)));
  const anchor = Number.isInteger(index) ? visible[Math.max(0, index)] : null;
  column.cards.splice(anchor ? column.cards.indexOf(anchor) : column.cards.length, 0, filed);
  next.inbox = next.inbox.filter((item) => item.id !== id);
  if (doneOnDrop && isDoneColumn(column)) markCardDone(board, colId, id, stamp);
  if (lane === "today" && Number.isInteger(laneIndex) && !filed.done) {
    const queue = planWeek(next).today.filter((item) => item.card.id !== id);
    queue.splice(Math.max(0, laneIndex), 0, { card: filed });
    queue.forEach((item, rank) => { item.card.rank = rank; });
  }
  return next;
}

/** Move the whole card out of its board, validating its identity before touching either list. */
export function moveCardIntoInbox(root, path, colId, cardId, { index = 0, stamp } = {}) {
  if (!root) return null;
  const source = resolveBoardAtPath(root, path)?.columns.find((col) => col.id === colId);
  const card = source?.cards.find((item) => item.id === cardId && !item.archived);
  if (!card || inboxCards(root).some((item) => item.id === cardId)) return null;
  const next = deepClone(root);
  const column = resolveBoardAtPath(next, path).columns.find((col) => col.id === colId);
  const [moved] = column.cards.splice(column.cards.findIndex((item) => item.id === cardId), 1);
  if (!moved.capturedAt && stamp) moved.capturedAt = stamp;
  next.inbox ??= [];
  next.inbox.splice(Math.max(0, index), 0, moved);
  return next;
}

export function reorderInboxCards(root, from, to) {
  const cards = inboxCards(root);
  if (from === to || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= cards.length || to < 0 || to >= cards.length) return root;
  const next = [...cards];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return { ...root, inbox: next };
}

/** A date lane still needs a board destination; leave the note untouched until chosen. */
export function inboxPlanDrop(root, result, options) {
  const { source, destination, draggableId, reason } = result;
  if (reason === "CANCEL" || source.droppableId !== INBOX_DROP_ID || !destination || !LANES.includes(destination.droppableId)) return null;
  const card = inboxCards(root).find((item) => item.id === draggableId);
  if (!card) return null;
  const dueAt = dateForLane(destination.droppableId, card.dueAt, options);
  if (dueAt === undefined) return null;
  return { cardId: card.id, dueAt, lane: destination.droppableId, index: destination.index };
}
