import { useRef, useState, useCallback, type PointerEvent } from "react";
import { buzz } from "../lib/haptics";

/** How far a card has to travel before letting go acts, in pixels */
export const SWIPE_THRESHOLD = 88;
/** Below this, the finger has not moved — it is a tap */
const SLOP = 8;

/**
 * Drag a card sideways by its tick, and let go to act.
 *
 * The board already owns the horizontal swipe: it is how you go from one
 * column to the next. A swipe anywhere on a card would take that away, so
 * this one starts only on the tick, which is a button — the drag-and-drop
 * library never lifts a card from a button, so the long-press is untouched
 * too. The tick is `touch-action: pan-y`, so a vertical scroll that happens to
 * start on it still scrolls.
 *
 * Touch only: with a mouse, the tick is clicked, never dragged.
 *
 * Returns the handlers for the tick, the current offset, and `consumeTap`,
 * which tells the tick's click handler whether the click is a real tap or the
 * tail end of a swipe it must ignore.
 */
export function useSwipe({ onRight, onLeft, enabled = true }: { onRight?: () => void; onLeft?: () => void; enabled?: boolean }) {
  const [dx, setDx] = useState(0);
  const [active, setActive] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const armed = useRef(false);
  const swiped = useRef(false);

  const reset = useCallback(() => {
    start.current = null;
    armed.current = false;
    setActive(false);
    setDx(0);
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!enabled || e.pointerType !== "touch") return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      swiped.current = false;
    },
    [enabled]
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const moved = e.clientX - s.x;
    if (!swiped.current) {
      // Mostly vertical: a scroll that began here, not a swipe
      if (Math.abs(e.clientY - s.y) > Math.abs(moved)) return;
      if (Math.abs(moved) < SLOP) return;
      swiped.current = true;
      setActive(true);
      // Keeps the moves coming once the finger leaves the tick; throws if the
      // pointer is already gone, which only costs the capture
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
    const past = Math.abs(moved) >= SWIPE_THRESHOLD;
    if (past !== armed.current) {
      armed.current = past;
      // Felt as the line is crossed, both ways, so letting go is never a guess
      buzz("threshold");
    }
    setDx(moved);
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const moved = e.clientX - s.x;
      const act = swiped.current && Math.abs(moved) >= SWIPE_THRESHOLD;
      reset();
      if (!act) return;
      if (moved > 0) onRight?.();
      else onLeft?.();
    },
    [onRight, onLeft, reset]
  );

  /** True once per swipe: the click that follows it is not a tap */
  const consumeTap = useCallback(() => {
    if (!swiped.current) return false;
    swiped.current = false;
    return true;
  }, []);

  return {
    dx,
    active,
    armed: Math.abs(dx) >= SWIPE_THRESHOLD,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      // The browser took the gesture over: nothing was swiped
      onPointerCancel: () => { swiped.current = false; reset(); },
    },
    consumeTap,
  };
}
