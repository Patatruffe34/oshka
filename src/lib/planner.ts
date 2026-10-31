import { visibleCards, hasDoneColumn, type RankEntry } from "./board-utils";
import type { Board, Card, Id, IsoDay, TitledSegment, WeekMode } from "./types";

/** The columns, in the order the week runs */
export const LANES = ["today", "tomorrow", "week", "nextWeek", "later", "stalled"] as const;

export type Lane = (typeof LANES)[number];

/** A card as the Agenda shows it: where it lives, and whether it is late */
export interface PlannedItem {
  card: Card;
  colId: Id;
  colTitle: string;
  colEmoji: string;
  /** Path to the board holding the card */
  path: TitledSegment[];
  overdue?: boolean;
}

export interface PlanOptions {
  now?: Date;
  weekMode?: WeekMode;
}

/** Where a card lands when dropped in a lane, if it has no better date */
const LATER_DAYS = 30;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayGap = (dueAt: string, now: Date) =>
  Math.round((startOfDay(new Date(dueAt)) - startOfDay(now)) / 86400000);

/**
 * How many days ahead "this week" reaches.
 *
 * Two readings of the word, and they disagree by up to six days, so it is a
 * setting rather than a guess: the rest of the calendar week, or the next
 * seven days whatever day it is.
 */
export const weekReach = (now: Date, mode: WeekMode | undefined): number => {
  if (mode !== "calendar") return 7;
  // getDay: 0 is Sunday. Monday-based, so Sunday closes the week.
  const today = (now.getDay() + 6) % 7;
  return 6 - today;
};

/** Where "next week" stops: one week past the end of this one */
export const nextWeekReach = (now: Date, mode: WeekMode | undefined): number => weekReach(now, mode) + 7;

/** The n-th day from now, as the ISO day a due date is stored as */
export const dayFromNow = (n: number, now = new Date()): IsoDay => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

/**
 * The Friday inside a window, or its far end when no Friday falls there.
 *
 * A deadline dropped into a lane should land on a day you work. Late in a
 * calendar week no Friday is left ahead, and the end of the lane is then the
 * only honest answer.
 */
const fridayIn = (now: Date, from: number, to: number): number => {
  let gap = (5 - now.getDay() + 7) % 7; // getDay: Friday is 5
  while (gap < from) gap += 7;
  return gap <= to ? gap : to;
};

/**
 * The date a card takes when dropped in a lane.
 *
 * A date already inside the lane is left alone: dragging a card across for
 * tidiness must not flatten a Tuesday into a Friday. Otherwise it takes the
 * last working day of the lane — the latest moment that still honours the
 * drop, without landing on a weekend nobody planned to work.
 *
 * The standstill lane is computed, not a state — nothing can be dropped into
 * being stuck, so it returns undefined and the caller refuses the move.
 */
export const dateForLane = (
  lane: string,
  dueAt: string | null | undefined,
  { now = new Date(), weekMode = "rolling" }: PlanOptions = {},
): IsoDay | undefined => {
  const reach = weekReach(now, weekMode);
  const next = nextWeekReach(now, weekMode);
  const gap = dueAt ? dayGap(dueAt, now) : null;
  // Only reached once a gap was measured, so with a date
  const keep = () => dueAt!.slice(0, 10);

  switch (lane) {
    case "today":
      return dayFromNow(0, now);
    case "tomorrow":
      return dayFromNow(1, now);
    case "week":
      // Late in a calendar week the lane can be a day wide, or none at all
      return gap !== null && gap >= 2 && gap <= reach
        ? keep()
        : dayFromNow(fridayIn(now, 2, Math.max(reach, 2)), now);
    case "nextWeek":
      return gap !== null && gap > reach && gap <= next
        ? keep()
        : dayFromNow(fridayIn(now, reach + 1, Math.max(next, 3)), now);
    case "later":
      return gap !== null && gap > next ? keep() : dayFromNow(Math.max(next + 1, LATER_DAYS), now);
    default:
      return undefined;
  }
};

/**
 * Whether anything below this card is scheduled.
 *
 * A branch where nothing carries a date is a branch nobody has committed to —
 * which is the thing worth surfacing, not the individual undated card.
 */
const branchHasDate = (board: Board | null | undefined): boolean => {
  for (const col of board?.columns ?? []) {
    for (const card of visibleCards(col)) {
      if (card.done) continue;
      if (card.dueAt) return true;
      if (branchHasDate(card.board)) return true;
    }
  }
  return false;
};

const branchHasCards = (board: Board | null | undefined): boolean =>
  (board?.columns ?? []).some((col) => visibleCards(col).length > 0);

/**
 * Every card in the tree, sorted into the week.
 *
 * Overdue cards land in today: a deadline that has passed is not less pressing
 * than one that has not, and a column of its own would be a column nobody
 * empties.
 *
 * The last lane is not "everything undated" — that would be most of the tree,
 * and it would drown the four that matter. It holds branches at a standstill:
 * a card whose board is meant to advance and where nothing anywhere below is
 * scheduled. Only the shallowest one of a branch is reported, or a stuck
 * project would be listed once per level.
 *
 * "Meant to advance" is the ✅ column — the same mark that finishes a card
 * dropped in it. A board without one is a list, a grid, a set of notes: it has
 * no end state, so it cannot be behind on one.
 */
export const planWeek = (
  root: Board | null | undefined,
  { now = new Date(), weekMode = "rolling" }: PlanOptions = {},
): Record<Lane, PlannedItem[]> => {
  const lanes: Record<Lane, PlannedItem[]> = { today: [], tomorrow: [], week: [], nextWeek: [], later: [], stalled: [] };
  const reach = weekReach(now, weekMode);
  const next = nextWeekReach(now, weekMode);

  const walk = (board: Board | null | undefined, path: TitledSegment[]) => {
    for (const col of board?.columns ?? []) {
      for (const card of visibleCards(col)) {
        if (card.done) {
          walk(card.board, [...path, { colId: col.id, cardId: card.id, cardTitle: card.title }]);
          continue;
        }
        const here: PlannedItem = { card, colId: col.id, colTitle: col.title, colEmoji: col.emoji, path };
        let descend = true;

        if (card.dueAt) {
          const gap = dayGap(card.dueAt, now);
          if (gap <= 0) lanes.today.push({ ...here, overdue: gap < 0 });
          else if (gap === 1) lanes.tomorrow.push(here);
          else if (gap <= reach) lanes.week.push(here);
          else if (gap <= next) lanes.nextWeek.push(here);
          else lanes.later.push(here);
        } else if (
          hasDoneColumn(card.board) &&
          branchHasCards(card.board) &&
          !branchHasDate(card.board)
        ) {
          lanes.stalled.push(here);
          // Its children are stalled too, by definition — saying so again for
          // each level would bury the one card you can actually act on.
          descend = false;
        }

        if (descend) {
          walk(card.board, [...path, { colId: col.id, cardId: card.id, cardTitle: card.title }]);
        }
      }
    }
  };

  walk(root, []);

  // Every card in the dated lanes has a due date
  const byDate = (a: PlannedItem, b: PlannedItem) =>
    new Date(a.card.dueAt!).getTime() - new Date(b.card.dueAt!).getTime();
  /**
   * Today is the only lane you order by hand.
   *
   * Everywhere else the date is the information — a Tuesday above a Thursday
   * says something — so a hand order would only hide it. Here every card is
   * due the same day or already late, the date has nothing left to sort by,
   * and what is left to say is which one you do first.
   *
   * A card with no rank has never been placed: it is new to the lane, often
   * because it just fell overdue. It goes to the top rather than the bottom —
   * burying an unplaced card under a hand-made list is exactly the miss this
   * view exists to prevent.
   */
  const byRank = (a: PlannedItem, b: PlannedItem) => (a.card.rank ?? -1) - (b.card.rank ?? -1) || byDate(a, b);
  lanes.today.sort(byRank);
  lanes.tomorrow.sort(byDate);
  lanes.week.sort(byDate);
  lanes.nextWeek.sort(byDate);
  lanes.later.sort(byDate);
  return lanes;
};

/**
 * A path shortened to what identifies a card, keeping both its ends.
 *
 * The two steps that answer something are the first and the last: which
 * project this belongs to, and which board it sits on. What runs between them
 * is the part you can reconstruct, so it is the part that goes — cutting the
 * tail instead would drop the more precise of the two.
 */
export const shortTrail = (steps: string[]): string[] =>
  steps.length <= 3 ? steps : [steps[0], "\u2026", steps[steps.length - 1]];

/**
 * A lane renumbered after one card was moved inside it.
 *
 * The whole lane, not just the card that moved: a rank only means anything
 * next to the other ranks, and a card arriving later needs a scale already in
 * place to be put against. Cards of one lane live on different boards, so each
 * one is named by the path to reach it.
 */
export const reorderEntries = (items: readonly PlannedItem[], from: number, to: number): RankEntry[] => {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((i) => ({
    segments: i.path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
    colId: i.colId,
    cardId: i.card.id,
  }));
};

/**
 * Cards of a lane, gathered under the board they came from.
 *
 * Order is kept: a group appears where its first card fell, so the soonest
 * deadline still leads the column.
 */
export interface BoardGroup {
  key: string;
  path: TitledSegment[];
  colTitle: string;
  colEmoji: string;
  trail: string[];
  items: PlannedItem[];
}

export const groupByBoard = (items: readonly PlannedItem[], rootLabel: string): BoardGroup[] => {
  const groups: BoardGroup[] = [];
  const seen = new Map<string, BoardGroup>();
  for (const item of items) {
    const key = item.path.map((p) => p.cardId).join("/") + "|" + item.colId;
    if (!seen.has(key)) {
      const group = {
        key,
        path: item.path,
        colTitle: item.colTitle,
        colEmoji: item.colEmoji,
        // The whole way down, not just the last step: at this depth "Marketing"
        // alone does not say which project's marketing.
        trail: [rootLabel, ...item.path.map((p) => p.cardTitle)],
        items: [],
      };
      seen.set(key, group);
      groups.push(group);
    }
    seen.get(key)!.items.push(item);
  }
  return groups;
};
