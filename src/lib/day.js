/**
 * The calendar day, as the person using the app is living it.
 *
 * Local, never UTC: at 23:30 in Paris it is still today here, even though
 * UTC has already moved on — and "today" is what the Agenda and the due badges
 * are about.
 */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Time left before the next local midnight, clock changes included */
export function msUntilNextDay(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return next - date;
}
