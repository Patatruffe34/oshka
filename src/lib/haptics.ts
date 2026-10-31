/**
 * A short buzz under the finger, where the device has one.
 *
 * Android only, in practice: iOS Safari has no vibration API, and a desktop
 * has nothing to vibrate. Everywhere else this is a silent no-op, so callers
 * never need to ask first.
 */
const PATTERNS = {
  /* A card finished */
  tick: 14,
  /* Something picked up, or put down */
  lift: 8,
  drop: 6,
  /* A swipe crossing the point where letting go acts */
  threshold: 10,
};

export type BuzzKind = keyof typeof PATTERNS;

export function buzz(kind: BuzzKind | number): void {
  try {
    navigator.vibrate?.(typeof kind === "number" ? kind : PATTERNS[kind]);
  } catch {
    // Some browsers throw when vibration is blocked; it was only a nicety
  }
}
