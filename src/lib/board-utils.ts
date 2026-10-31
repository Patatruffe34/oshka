import { PALETTE } from "./palette";
import type {
  Board,
  Card,
  Checklist,
  ChecklistItem,
  Column,
  Id,
  IsoDateTime,
  IsoDay,
  Label,
  PathSegment,
  RootBoard,
  TitledSegment,
} from "./types";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Collision-resistant id (36^12 ≈ 4.7e18 combinations).
 * Ids are used as DnD draggableIds and as URL hash segments, so a collision
 * silently breaks drag & drop — Math.random() with 7 chars was too tight.
 */
export const uid = (len = 12): Id => {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += ID_ALPHABET[bytes[i] % 36];
  return out;
};

export const makeCard = (title: string): Card => ({
  id: uid(),
  title,
  description: "",
  comments: [],
  done: false,
  doneAt: null,
  archived: false,
  labels: [],
  dueAt: null,
  repeat: null,
  checklists: [],
  board: { columns: [] },
});

/** Trello ships a set of unnamed coloured labels; naming them is optional. */
export const makeDefaultLabels = (): Label[] =>
  PALETTE.slice(0, 6).map((c) => ({ id: uid(), name: "", color: c.id }));

export const makeChecklist = (title: string): Checklist => ({ id: uid(), title, items: [] });

export const makeChecklistItem = (text: string): ChecklistItem => ({ id: uid(), text, done: false });

export const makeCol = (title: string): Column => ({
  id: uid(),
  title,
  emoji: "",
  color: "",
  cards: [],
});

export const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * Walk down a path of {colId, cardId} segments.
 * Returns null when the path is stale (a column or card no longer exists),
 * so callers can decide what to do instead of silently landing elsewhere.
 */
export const resolveBoardAtPath = (rootBoard: Board, path: readonly PathSegment[]): Board | null => {
  let current = rootBoard;
  for (const { colId, cardId } of path) {
    const col = current.columns.find((c) => c.id === colId);
    if (!col) return null;
    const card = col.cards.find((c) => c.id === cardId);
    if (!card) return null;
    current = card.board;
  }
  return current;
};

/** Same walk, but falls back to the deepest board still reachable. */
export const getBoardAtPath = (rootBoard: Board, path: readonly PathSegment[]): Board => {
  let current = rootBoard;
  for (const { colId, cardId } of path) {
    const col = current.columns.find((c) => c.id === colId);
    if (!col) return current;
    const card = col.cards.find((c) => c.id === cardId);
    if (!card) return current;
    current = card.board;
  }
  return current;
};

/**
 * Clone the tree and run updaterFn on the board sitting at `path`.
 * Returns the original tree untouched if the path went stale mid-walk.
 */
export const setAtPath = (
  rootBoard: RootBoard,
  path: readonly PathSegment[],
  updaterFn: (board: Board) => Board,
): RootBoard => {
  if (path.length === 0) return updaterFn(deepClone(rootBoard));
  const clone = deepClone(rootBoard);
  let ref = clone;
  for (let i = 0; i < path.length; i++) {
    const { colId, cardId } = path[i];
    const col = ref.columns.find((c) => c.id === colId);
    if (!col) return rootBoard;
    const card = col.cards.find((c) => c.id === cardId);
    if (!card) return rootBoard;
    if (i === path.length - 1) card.board = updaterFn(card.board);
    else ref = card.board;
  }
  return clone;
};

/**
 * Write an explicit order onto cards scattered across the tree.
 *
 * The Agenda's first lane is a queue, not a listing, so the order you put it in
 * is a decision worth storing. Its cards live on different boards, though, and
 * going through setAtPath once each would clone the whole document per card —
 * a drop would cost as much as the tree is big. One clone, then every card is
 * reached inside it.
 */
/** A card named by where it lives, for writing an order across boards */
export interface RankEntry {
  segments: PathSegment[];
  colId: Id;
  cardId: Id;
}

export const applyRanks = (rootBoard: RootBoard, entries: readonly RankEntry[]): RootBoard => {
  const clone = deepClone(rootBoard);
  entries.forEach(({ segments, colId, cardId }, i) => {
    const board = getBoardAtPath(clone, segments);
    const card = board?.columns
      ?.find((c) => c.id === colId)
      ?.cards.find((c) => c.id === cardId);
    if (card) card.rank = i;
  });
  return clone;
};

/** Resolve colId:cardId pairs into a full path with titles from board data */
export const resolvePathFromIds = (
  rootBoard: Board | null | undefined,
  segments: readonly PathSegment[],
): TitledSegment[] => {
  const resolved: TitledSegment[] = [];
  let current = rootBoard;
  for (const { colId, cardId } of segments) {
    // The tree arrives after the first render, and a card's board is only
    // created when it gets one: either way there is nothing further to walk.
    const col = current?.columns?.find((c) => c.id === colId);
    if (!col) break;
    const card = col.cards.find((c) => c.id === cardId);
    if (!card) break;
    resolved.push({ colId, cardId, cardTitle: card.title });
    current = card.board;
  }
  return resolved;
};

// ── Accessors tolerant of cards written before a field existed ──
export const cardLabels = (card: Pick<Card, "labels">): Id[] => card.labels || [];
export const cardChecklists = (card: Pick<Card, "checklists">): Checklist[] => card.checklists || [];
export const boardLabels = (root: RootBoard | null | undefined): Label[] => root?.labels || [];

/** Ticked / total across every checklist on a card */
export const checklistProgress = (card: Pick<Card, "checklists">): { done: number; total: number } => {
  let done = 0;
  let total = 0;
  for (const list of cardChecklists(card)) {
    for (const item of list.items) {
      total++;
      if (item.done) done++;
    }
  }
  return { done, total };
};

/**
 * How a due date should read today: overdue, due today, coming up, or far off.
 * A done card is never overdue — finishing it settles the deadline.
 */
export type DueState = "done" | "overdue" | "today" | "tomorrow" | "soon" | "upcoming";

export const dueState = (
  dueAt: string | null | undefined,
  done: boolean,
  now = new Date(),
): DueState | null => {
  if (!dueAt) return null;
  if (done) return "done";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);

  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "soon";
  return "upcoming";
};

/**
 * Remove a label id from every card in the tree, at any depth, in place.
 * Called when a label is deleted so no card keeps a dangling reference.
 * Returns how many cards were touched.
 */
export const stripLabelFromTree = (board: Board | undefined, labelId: Id): number => {
  let touched = 0;
  const walk = (b: Board | undefined) => {
    if (!b?.columns) return;
    for (const col of b.columns) {
      for (const card of col.cards) {
        const labels = cardLabels(card);
        if (labels.includes(labelId)) {
          card.labels = labels.filter((id) => id !== labelId);
          touched++;
        }
        walk(card.board);
      }
    }
  };
  walk(board);
  return touched;
};

/** Cards visible in a column — archived ones are hidden from the board */
export const visibleCards = (col: Column): Card[] => col.cards.filter((c) => !c.archived);

export const countSubItems = (board: Board): number =>
  board.columns.reduce((acc, col) => acc + visibleCards(col).length, 0);

/** Done / total among visible cards of a sub-board, for the progress badge */
export const subBoardProgress = (board: Board): { done: number; total: number } => {
  let done = 0;
  let total = 0;
  for (const col of board.columns) {
    for (const card of visibleCards(col)) {
      total++;
      if (card.done) done++;
    }
  }
  return { done, total };
};

/**
 * The mark that makes a column mean "finished".
 *
 * A convention rather than a flag on the column: you set it the same way you
 * set any other column icon, and it reads as what it is on the board.
 */
export const DONE_COLUMN_MARK = "\u2705";

export const isDoneColumn = (col: Pick<Column, "emoji"> | null | undefined): boolean => (col?.emoji || "").includes(DONE_COLUMN_MARK);

/**
 * Whether a board is the kind of thing that gets finished at all.
 *
 * Plenty of boards — a brainstorm, a reference list — have no end state, and
 * showing them as 0% complete would be reading a goal into them that is not
 * there.
 */
export const hasDoneColumn = (board: Board | null | undefined): boolean => (board?.columns ?? []).some(isDoneColumn);

/**
 * Move a card into the board's ✅ column, in place, on an already-cloned board.
 *
 * The mirror of finishing a card dropped there: ticking one off should put it
 * where finished things live, or the column stops telling the truth about what
 * is done. Returns the destination column id, or null when there is nothing to
 * do — no ✅ column, or the card is already in it.
 */
export const fileUnderDone = (board: Board | null | undefined, colId: Id, cardId: Id): Id | null => {
  const target = board?.columns?.find(isDoneColumn);
  if (!board || !target || target.id === colId) return null;
  const col = board.columns.find((c) => c.id === colId);
  if (!col) return null;
  const index = col.cards.findIndex((c) => c.id === cardId);
  if (index < 0) return null;
  const [card] = col.cards.splice(index, 1);
  target.cards.push(card);
  return target.id;
};

/**
 * Mark one card done, in place, on an already-cloned board.
 * False when there is nothing to do — no such card, or it was done already.
 */
export const markCardDone = (
  board: Board | null | undefined,
  colId: Id,
  cardId: Id,
  at: IsoDateTime = new Date().toISOString(),
): boolean => {
  const card = board?.columns
    ?.find((c) => c.id === colId)
    ?.cards.find((c) => c.id === cardId);
  if (!card || card.done) return false;
  card.done = true;
  card.doneAt = at;
  return true;
};

/**
 * Finish everything still alive below a board, however deep.
 *
 * Cards are collected before a single one is filed. visibleCards already hands
 * back a copy, so no card can be skipped either way — but filing moves a card
 * into a column further along the walk, and collecting first is what keeps it
 * from being visited a second time once it lands there.
 *
 * Archived cards are left where they are. They were put away, not left
 * undone, and finishing them would quietly rewrite history nobody asked about.
 * Cards already done keep the date they were done on, for the same reason.
 */
export const markBranchDone = (
  board: Board | null | undefined,
  { stamp, file = false }: { stamp?: IsoDateTime; file?: boolean } = {},
): number => {
  const at = stamp ?? new Date().toISOString();
  let count = 0;
  const walk = (b: Board | null | undefined) => {
    if (!b?.columns) return;
    const hits: { colId: Id; card: Card }[] = [];
    for (const col of b.columns) {
      for (const card of visibleCards(col)) {
        if (!card.done) hits.push({ colId: col.id, card });
        walk(card.board);
      }
    }
    for (const { colId, card } of hits) {
      card.done = true;
      card.doneAt = at;
      count += 1;
      if (file) fileUnderDone(b, colId, card.id);
    }
  };
  walk(board);
  return count;
};

/**
 * The soonest deadline anywhere below this board.
 *
 * A card with no date of its own can still be holding dated work: the deadline
 * is real, it just lives a level or two down. Surfacing the nearest one lets a
 * parent card say "something inside is due then" without pretending the date
 * is its own.
 *
 * Overdue dates are not skipped — the most pressing thing inside is exactly
 * what should show. Done cards do not count, but their branches are still
 * walked: finishing a parent does not finish what it contains.
 */
export const nextDueInside = (board: Board | null | undefined): string | null => {
  let best: string | null = null;
  const walk = (b: Board | null | undefined) => {
    for (const col of b?.columns ?? []) {
      for (const card of visibleCards(col)) {
        if (!card.done && card.dueAt) {
          if (best === null || new Date(card.dueAt) < new Date(best)) best = card.dueAt;
        }
        walk(card.board);
      }
    }
  };
  walk(board);
  return best;
};

/**
 * What a sub-board amounts to, in one walk.
 *
 * `cards` and `done` count the whole subtree, not just the first level: a card
 * three boards down is still work this card is carrying. `depth` is how many
 * levels of board hang below, which is the thing this product is about and the
 * thing no other view of a card tells you.
 */
export interface SubBoardStats {
  columns: number;
  cards: number;
  done: number;
  overdue: number;
  depth: number;
}

export const subBoardStats = (board: Board | null | undefined, now = new Date()): SubBoardStats => {
  let cards = 0;
  let done = 0;
  let overdue = 0;
  let depth = 0;

  const walk = (b: Board | null | undefined, level: number) => {
    if (!b?.columns?.length) return;
    depth = Math.max(depth, level);
    for (const col of b.columns) {
      for (const card of visibleCards(col)) {
        cards++;
        if (card.done) done++;
        else if (dueState(card.dueAt, false, now) === "overdue") overdue++;
        walk(card.board, level + 1);
      }
    }
  };
  walk(board, 1);

  return { columns: board?.columns?.length ?? 0, cards, done, overdue, depth };
};

/**
 * Move a card between columns, in place, on an already-cloned board.
 *
 * Indices come from the rendered list, which hides archived cards, so they are
 * translated back to positions in the full `cards` array. Returns false when
 * the move could not be applied (unknown column, index out of range).
 */
export const moveCardBetweenColumns = (
  board: Board, sourceColId: Id, destColId: Id, sourceIdx: number, destIdx: number
): boolean => {
  const sourceCol = board.columns.find((c) => c.id === sourceColId);
  const destCol = board.columns.find((c) => c.id === destColId);
  if (!sourceCol || !destCol) return false;

  const moved = visibleCards(sourceCol)[sourceIdx];
  if (!moved) return false;
  sourceCol.cards = sourceCol.cards.filter((c) => c.id !== moved.id);

  // Anchor on the card currently occupying the destination slot; dropping past
  // the last visible card appends to the end.
  const anchor = visibleCards(destCol)[destIdx];
  const insertAt = anchor
    ? destCol.cards.findIndex((c) => c.id === anchor.id)
    : destCol.cards.length;
  destCol.cards.splice(insertAt, 0, moved);
  return true;
};

/**
 * Move a card to a column on any other board in the tree, subtree included.
 *
 * Returns a new root, or null when the move is impossible. The case that
 * matters: dropping a card into one of its own descendants would detach that
 * whole branch from the tree and lose it, so it is refused.
 *
 * @param from {path, colId, cardId} — path to the board holding the card
 * @param to   {path, colId, index}  — path to the destination board
 */
/** Where a card sits, by the path to its board */
export interface CardLocation {
  path: readonly PathSegment[];
  colId: Id;
  cardId: Id;
}

/** Where something is put: a board, a column on it, a position (end by default) */
export interface Destination {
  path: readonly PathSegment[];
  colId: Id;
  index?: number | null;
}

export const moveCardAcrossBoards = (root: RootBoard, from: CardLocation, to: Destination): RootBoard | null => {
  // A card cannot land inside itself: the destination path must not go through it
  if (to.path.some((seg) => seg.cardId === from.cardId)) return null;

  const clone = deepClone(root);

  const sourceBoard = resolveBoardAtPath(clone, from.path);
  const sourceCol = sourceBoard?.columns.find((c) => c.id === from.colId);
  const card = sourceCol?.cards.find((c) => c.id === from.cardId);
  if (!sourceCol || !card) return null;

  const destBoard = resolveBoardAtPath(clone, to.path);
  const destCol = destBoard?.columns.find((c) => c.id === to.colId);
  if (!destCol) return null;

  // Same column and nothing else to do
  if (sourceCol === destCol && to.index == null) return null;

  sourceCol.cards = sourceCol.cards.filter((c) => c.id !== from.cardId);
  const at = to.index == null ? destCol.cards.length : to.index;
  destCol.cards.splice(Math.max(0, Math.min(at, destCol.cards.length)), 0, card);
  return clone;
};

/**
 * Every board in the tree that a card could be moved to, flattened for a picker.
 * `exclude` — a card id or a Set of them — drops those cards and everything
 * under them, since those are the destinations that would create a cycle.
 */
export interface BoardDestination {
  path: PathSegment[];
  /** Titles from the root down, for display */
  trail: string[];
  columns: Column[];
}

export const listBoardDestinations = (
  root: Board | null | undefined,
  exclude: Id | Set<Id> | null = null,
  rootLabel = "Root",
): BoardDestination[] => {
  const excluded = exclude instanceof Set ? exclude : new Set(exclude ? [exclude] : []);
  const out: BoardDestination[] = [{ path: [], trail: [rootLabel], columns: root?.columns ?? [] }];

  const walk = (board: Board | null | undefined, path: PathSegment[], trail: string[]) => {
    if (!board?.columns) return;
    for (const col of board.columns) {
      for (const card of col.cards) {
        if (excluded.has(card.id)) continue; // and its whole subtree
        const nextPath = [...path, { colId: col.id, cardId: card.id }];
        const nextTrail = [...trail, card.title];
        if (card.board?.columns?.length > 0) {
          out.push({ path: nextPath, trail: nextTrail, columns: card.board.columns });
        }
        walk(card.board, nextPath, nextTrail);
      }
    }
  };

  walk(root, [], [rootLabel]);
  return out;
};

/** Every card id living in a column, at any depth */
export const collectCardIds = (column: Column): Set<Id> => {
  const ids = new Set<Id>();
  const walk = (cards: Card[]) => {
    for (const card of cards) {
      ids.add(card.id);
      for (const col of card.board?.columns ?? []) walk(col.cards);
    }
  };
  walk(column.cards);
  return ids;
};

/**
 * Move a whole column to another board, cards and their subtrees included.
 *
 * Returns a new root, or null when refused. The cycle case is wider than for a
 * single card: the destination must not sit inside ANY card the column holds,
 * at any depth, or the column would end up containing its own new location.
 */
export const moveColumnAcrossBoards = (
  root: RootBoard,
  from: { path: readonly PathSegment[]; colId: Id },
  to: { path: readonly PathSegment[]; index?: number | null },
): RootBoard | null => {
  const clone = deepClone(root);

  const sourceBoard = resolveBoardAtPath(clone, from.path);
  const column = sourceBoard?.columns.find((c) => c.id === from.colId);
  if (!sourceBoard || !column) return null;

  const held = collectCardIds(column);
  if (to.path.some((seg) => held.has(seg.cardId))) return null;

  const destBoard = resolveBoardAtPath(clone, to.path);
  if (!destBoard) return null;

  // Same board and no explicit position: nothing to do
  const samePlace =
    from.path.length === to.path.length &&
    from.path.every((seg, i) => seg.cardId === to.path[i].cardId);
  if (samePlace && to.index == null) return null;

  sourceBoard.columns = sourceBoard.columns.filter((c) => c.id !== from.colId);
  const at = to.index == null ? destBoard.columns.length : to.index;
  destBoard.columns.splice(Math.max(0, Math.min(at, destBoard.columns.length)), 0, column);
  return clone;
};

/**
 * Flatten the tree into an ordered list of rows for an outline view.
 *
 * Each row is a card with its depth and its path, columns interleaved as
 * headers. `isOpen(path)` decides which branches are expanded, so a large tree
 * costs only what is actually unfolded.
 */
export type OutlineRow =
  | { kind: "root"; key: string; label: string; depth: number }
  | {
      kind: "column";
      key: string;
      column: Column;
      depth: number;
      path: TitledSegment[];
      count: number;
      done: number;
    }
  | {
      kind: "card";
      key: string;
      card: Card;
      colId: Id;
      depth: number;
      path: TitledSegment[];
      childPath: TitledSegment[];
      hasChildren: boolean;
      open: boolean;
    }
  | { kind: "empty"; key: string; depth: number };

export const outlineRows = (
  root: Board,
  isOpen: (key: string) => boolean,
  rootLabel = "Root",
): OutlineRow[] => {
  const rows: OutlineRow[] = [];

  const walk = (board: Board, path: TitledSegment[], depth: number) => {
    for (const col of board.columns) {
      const cards = visibleCards(col);
      rows.push({
        kind: "column",
        key: [...path.map((p) => p.cardId), col.id].join("/"),
        column: col,
        depth,
        path,
        count: cards.length,
        done: cards.filter((c) => c.done).length,
      });

      for (const card of cards) {
        const childPath = [
          ...path,
          { colId: col.id, cardId: card.id, cardTitle: card.title },
        ];
        const key = childPath.map((p) => p.cardId).join("/");
        const hasChildren = card.board?.columns?.length > 0;
        const open = hasChildren && isOpen(key);

        rows.push({
          kind: "card",
          key,
          card,
          colId: col.id,
          depth: depth + 1,
          path,
          childPath,
          hasChildren,
          open,
        });

        if (open) walk(card.board, childPath, depth + 2);
      }
    }
    if (board.columns.length === 0 && depth > 0) {
      rows.push({ kind: "empty", key: path.map((p) => p.cardId).join("/") + "/∅", depth });
    }
  };

  rows.push({ kind: "root", key: "", label: rootLabel, depth: 0 });
  walk(root, [], 0);
  return rows;
};

/** Keys of every card that has a sub-board — for "expand all" */
export const allBranchKeys = (root: Board): Set<string> => {
  const keys = new Set<string>();
  const walk = (board: Board, path: PathSegment[]) => {
    for (const col of board.columns) {
      for (const card of visibleCards(col)) {
        const childPath = [...path, { colId: col.id, cardId: card.id }];
        if (card.board?.columns?.length > 0) {
          keys.add(childPath.map((p) => p.cardId).join("/"));
          walk(card.board, childPath);
        }
      }
    }
  };
  walk(root, []);
  return keys;
};

/** Deep copy of a card with brand-new ids throughout, ready to be inserted */
export const duplicateCard = (card: Card): Card => {
  const copy = deepClone(card);
  const reid = (c: Card) => {
    c.id = uid();
    c.comments = (c.comments || []).map((m) => ({ ...m, id: uid() }));
    c.checklists = (c.checklists || []).map((l) => ({
      ...l,
      id: uid(),
      items: l.items.map((i) => ({ ...i, id: uid() })),
    }));
    for (const col of c.board?.columns ?? []) {
      col.id = uid();
      col.cards.forEach(reid);
    }
  };
  reid(copy);
  return copy;
};

/** Comparators for sorting a column, all stable and archived-aware */
type CardComparator = (a: Card, b: Card) => number;

export const SORTS = {
  due: (a, b) => {
    // No date sinks to the bottom rather than pretending to be the epoch
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  },
  title: (a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }),
  done: (a, b) => Number(a.done) - Number(b.done),
} satisfies Record<string, CardComparator>;

export type SortKey = keyof typeof SORTS;

/**
 * Sort the visible cards of a column in place, leaving archived ones where
 * they are — they are not shown, so moving them would be invisible churn.
 */
export const sortColumnCards = (column: Column, key: string): boolean => {
  const compare = (SORTS as Record<string, CardComparator | undefined>)[key];
  if (!compare) return false;

  const visible = column.cards.filter((c) => !c.archived).sort(compare);
  let i = 0;
  column.cards = column.cards.map((c) => (c.archived ? c : visible[i++]));
  return true;
};

export const EMPTY_BOARD: Board = { columns: [] };

/**
 * ISO day, n days from today.
 *
 * Built from the local calendar rather than toISOString(), which converts to
 * UTC first and lands on the wrong day for anyone east or west of it.
 */
export const dayFromNow = (n: number): IsoDay => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};
