/**
 * Cards that come back.
 *
 * A repeating card is never a card you finish — it is a card that moves on.
 * Ticking one therefore never sets `done`: it advances the due date to the
 * next occurrence and wipes what the last one left behind.
 *
 * That single rule is what leaves the rest of the app untouched. Because a
 * repeating card never becomes done, it is never filed under ✅, never
 * auto-archived, and never asked whether the work inside it should be
 * finished too — none of those paths have to learn about repetition.
 *
 * Ending a series is the mirror of that: turn the repetition off, and the
 * next tick finishes the card like any other.
 */

import type { Card, IsoDay, Repeat, RepeatUnit } from "./types";

/** Coarser than a day, finer than a year — what a plan is actually made of */
export const REPEAT_UNITS: readonly RepeatUnit[] = ["day", "week", "month"];

/** Past this the unit is the wrong one: "every 100 days" is three months */
export const REPEAT_MAX = 99;

/** What "repeat" means before anyone has said how often */
export const DEFAULT_REPEAT: Repeat = { every: 1, unit: "week" };

/**
 * How far a catch-up will walk.
 *
 * A card left for a decade is a few thousand steps of date arithmetic, which
 * costs nothing — but a stored date of the year 200 must not spin here.
 */
const CATCH_UP_LIMIT = 4000;

/**
 * A repetition as it should be stored, or null when it says nothing.
 *
 * Everything reaching this comes from a number field or from a document
 * written by an older version, so none of it can be assumed.
 */
const isRepeatUnit = (unit: unknown): unit is RepeatUnit =>
  REPEAT_UNITS.includes(unit as RepeatUnit);

export const normalizeRepeat = (
  repeat: { every?: unknown; unit?: unknown } | null | undefined,
): Repeat | null => {
  if (!repeat) return null;
  const every = Math.floor(Number(repeat.every));
  if (!Number.isFinite(every) || every < 1) return null;
  return {
    every: Math.min(every, REPEAT_MAX),
    unit: isRepeatUnit(repeat.unit) ? repeat.unit : DEFAULT_REPEAT.unit,
  };
};

export const isRepeating = (card: Pick<Card, "repeat"> | null | undefined): boolean => normalizeRepeat(card?.repeat) !== null;

/**
 * The local calendar day, as a due date is stored.
 *
 * Not toISOString(), which converts to UTC first and lands on the wrong day
 * for anyone east or west of it.
 */
const isoDay = (d: Date): IsoDay =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const parseDay = (value: unknown): { y: number; m: number; d: number } | null => {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  return { y, m, d };
};

/** Days in a month — the 0th of the next one is the last of this one */
const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

/**
 * One period on from a day.
 *
 * Months are the only awkward unit: there is no 31st of February, so a day
 * that overshoots is pulled back to the end of the month it landed in. The
 * cost is that a monthly card set on the 31st stays on the 28th afterwards.
 * The alternative is a hidden anchor date, which would then make moving a
 * single occurrence silently not move the series — a worse surprise than a
 * few days lost on the one date in twelve that cannot exist everywhere.
 */
const addPeriod = (day: string, { every, unit }: Repeat): IsoDay | null => {
  const at = parseDay(day);
  if (!at) return null;
  if (unit === "month") {
    const months = at.m - 1 + every;
    const y = at.y + Math.floor(months / 12);
    const m = (months % 12) + 1;
    return isoDay(new Date(y, m - 1, Math.min(at.d, daysInMonth(y, m))));
  }
  return isoDay(new Date(at.y, at.m - 1, at.d + (unit === "week" ? every * 7 : every)));
};

/**
 * When a repeating card is next due.
 *
 * Counted from the date on the card, so postponing one occurrence postpones
 * the series with it — what you see on the card is the only thing deciding.
 *
 * And walked until it lands past today, so a weekly card ticked three weeks
 * late comes back once next week, not three times in the past. Strictly past
 * today: you have just done the thing, it is not due again this evening.
 */
export const nextOccurrence = (
  dueAt: string | null | undefined,
  repeat: Repeat | null | undefined,
  now = new Date(),
): IsoDay | null => {
  const rep = normalizeRepeat(repeat);
  if (!rep) return null;
  const today = isoDay(now);
  // A repetition with no date has nothing to count from, so it counts from now
  let day = dueAt && parseDay(dueAt) ? String(dueAt).slice(0, 10) : today;

  for (let i = 0; i < CATCH_UP_LIMIT; i++) {
    const next = addPeriod(day, rep);
    if (!next) return null;
    day = next;
    // ISO days sort as text, so this is the date comparison
    if (day > today) return day;
  }
  return day;
};

/**
 * Move a card to its next occurrence, in place, on an already-cloned board.
 *
 * The date is worked out by the caller: an updater runs twice under React's
 * strict mode, and "the first date after today" must not be decided twice.
 */
export const rollCardOver = (card: Card | null | undefined, nextDue: IsoDay | null | undefined): boolean => {
  if (!card || !nextDue) return false;
  card.dueAt = nextDue;
  // It did not get done — it came round again
  card.done = false;
  card.doneAt = null;
  // A routine's checklist *is* the routine. Left ticked, every occurrence
  // after the first would arrive already finished.
  card.checklists = (card.checklists || []).map((list) => ({
    ...list,
    items: (list.items || []).map((item) => ({ ...item, done: false })),
  }));
  // A hand-made place in a lane only means something inside that lane, and
  // the card has just left it.
  delete card.rank;
  return true;
};

/**
 * The dictionary key that says a repetition in words.
 *
 * The count travels beside it rather than inside it: French and English both
 * need the plural to change the whole phrase, not just the noun.
 */
export const repeatKey = (repeat: Repeat | null | undefined): string | null => {
  const rep = normalizeRepeat(repeat);
  return rep ? `repeat.every_${rep.unit}${rep.every > 1 ? "s" : ""}` : null;
};
