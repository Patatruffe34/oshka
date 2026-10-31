import type { DropResult } from "@hello-pangea/dnd";
import { dateForLane, LANES, planWeek, type Lane, type PlannedItem, type PlanOptions } from "./planner";
import { deepClone, isDoneColumn, markCardDone, resolveBoardAtPath, visibleCards } from "./board-utils";
import type { Card, Id, IsoDateTime, PathSegment, RootBoard } from "./types";

export const INBOX_DROP_ID = "oshka:inbox";

/** Unfiled cards travel with the root JSON, outside the board hierarchy. */
export const inboxCards = (root: RootBoard | null | undefined): Card[] => root?.inbox ?? [];

export function captureInboxCard(root: RootBoard | null, card: Card): RootBoard | null {
  if (!root || !card.title.trim()) return root;
  return { ...root, inbox: [card, ...inboxCards(root)] };
}

export function editInboxCard(root: RootBoard, id: Id, title: string): RootBoard {
  const text = title.trim();
  if (!text || !inboxCards(root).some((card) => card.id === id && card.title !== text)) return root;
  return { ...root, inbox: inboxCards(root).map((card) => card.id === id ? { ...card, title: text } : card) };
}

/** Detail edits stay outside the board hierarchy, just like captures. */
export function updateInboxCard(root: RootBoard, id: Id, fields: Partial<Card>): RootBoard {
  const card = inboxCards(root).find((item) => item.id === id);
  if (!card) return root;
  const changes = { ...fields };
  if ("title" in changes) {
    changes.title = changes.title?.trim();
    if (!changes.title) delete changes.title;
  }
  const keys = Object.keys(changes) as (keyof Card)[];
  if (keys.every((key) => Object.is(card[key], changes[key]))) return root;
  return { ...root, inbox: inboxCards(root).map((item) => item.id === id ? { ...item, ...changes } : item) };
}

export function removeInboxCard(root: RootBoard, id: Id): RootBoard {
  if (!inboxCards(root).some((card) => card.id === id)) return root;
  return { ...root, inbox: inboxCards(root).filter((card) => card.id !== id) };
}

/** Validate first: a stale destination must never remove a captured thought. */
export interface FileOptions {
  /** File into a ✅ column as done, as a drop there would */
  doneOnDrop?: boolean;
  stamp?: IsoDateTime;
  /** Position among the visible cards of the column */
  index?: number;
  /** The label filter the column is shown with, which indices refer to */
  labelFilter?: Id[];
  dueAt?: string | null;
  /** The Agenda lane it was dropped in, and where in it */
  lane?: string;
  laneIndex?: number;
}

export function fileInboxCard(
  root: RootBoard,
  id: Id,
  path: readonly PathSegment[],
  colId: Id,
  { doneOnDrop = false, stamp, index, labelFilter = [], dueAt, lane, laneIndex }: FileOptions = {},
): RootBoard | null {
  const card = inboxCards(root).find((item) => item.id === id);
  if (!card || !resolveBoardAtPath(root, path)?.columns.some((col) => col.id === colId)) return null;
  // All three were just checked on the original, and the clone is identical
  const next = deepClone(root);
  const board = resolveBoardAtPath(next, path)!;
  const column = board.columns.find((col) => col.id === colId)!;
  const filed = next.inbox!.find((item) => item.id === id)!;
  if (dueAt !== undefined) filed.dueAt = dueAt;
  // DnD indices describe the visible, filtered cards, not archived/hidden ones.
  const visible = visibleCards(column).filter((item) => !labelFilter.length || labelFilter.every((label) => (item.labels || []).includes(label)));
  const anchor = index !== undefined && Number.isInteger(index) ? visible[Math.max(0, index)] : null;
  column.cards.splice(anchor ? column.cards.indexOf(anchor) : column.cards.length, 0, filed);
  next.inbox = next.inbox!.filter((item) => item.id !== id);
  if (doneOnDrop && isDoneColumn(column)) markCardDone(board, colId, id, stamp);
  if (lane === "today" && laneIndex !== undefined && Number.isInteger(laneIndex) && !filed.done) {
    const queue: Pick<PlannedItem, "card">[] = planWeek(next).today.filter((item) => item.card.id !== id);
    queue.splice(Math.max(0, laneIndex), 0, { card: filed });
    queue.forEach((item, rank) => { item.card.rank = rank; });
  }
  return next;
}

/** Move the whole card out of its board, validating its identity before touching either list. */
export function moveCardIntoInbox(
  root: RootBoard | null,
  path: readonly PathSegment[],
  colId: Id,
  cardId: Id,
  { index = 0, stamp }: { index?: number; stamp?: IsoDateTime } = {},
): RootBoard | null {
  if (!root) return null;
  const source = resolveBoardAtPath(root, path)?.columns.find((col) => col.id === colId);
  const card = source?.cards.find((item) => item.id === cardId && !item.archived);
  if (!card || inboxCards(root).some((item) => item.id === cardId)) return null;
  const next = deepClone(root);
  // Found on the original just above
  const column = resolveBoardAtPath(next, path)!.columns.find((col) => col.id === colId)!;
  const [moved] = column.cards.splice(column.cards.findIndex((item) => item.id === cardId), 1);
  if (!moved.capturedAt && stamp) moved.capturedAt = stamp;
  next.inbox ??= [];
  next.inbox.splice(Math.max(0, index), 0, moved);
  return next;
}

export function reorderInboxCards(root: RootBoard, from: number, to: number): RootBoard {
  const cards = inboxCards(root);
  if (from === to || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= cards.length || to < 0 || to >= cards.length) return root;
  const next = [...cards];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return { ...root, inbox: next };
}

/** A date lane still needs a board destination; leave the note untouched until chosen. */
export interface InboxPlan {
  cardId: Id;
  dueAt: string;
  lane: Lane;
  index: number;
}

export function inboxPlanDrop(root: RootBoard | null | undefined, result: DropResult, options?: PlanOptions): InboxPlan | null {
  const { source, destination, draggableId, reason } = result;
  if (reason === "CANCEL" || source.droppableId !== INBOX_DROP_ID || !destination || !(LANES as readonly string[]).includes(destination.droppableId)) return null;
  const card = inboxCards(root).find((item) => item.id === draggableId);
  if (!card) return null;
  const dueAt = dateForLane(destination.droppableId, card.dueAt, options);
  if (dueAt === undefined) return null;
  return { cardId: card.id, dueAt, lane: destination.droppableId as Lane, index: destination.index };
}
