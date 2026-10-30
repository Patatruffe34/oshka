import { useEffect } from "react";

/** Below this, the finger has not said which way it is going, in pixels */
const SLOP = 10;
/** Share of a column the finger has to cover for letting go to change column */
const DISTANCE = 0.3;
/** A flick this fast changes column even when short, in pixels per ms */
const FLICK_SPEED = 0.5;
/** ...as long as it is at least this long, in pixels */
const FLICK_MIN = 40;
/** Matches the CSS scroll-padding-inline of the board on a phone */
const PADDING = 12;
const BOARD_COLUMNS = ":scope > .board > .column, :scope > .board > .add-col-wrap";

/**
 * Where a horizontal swipe lands: the stop it started on, or one either side.
 *
 * `stops` are the scroll positions of the columns, in order; `from` the index
 * the swipe started on; `dx` how far the finger travelled (positive to the
 * right, i.e. back towards the first column); `speed` its speed at release.
 */
export function pickStop({ stops, from, dx, speed, width }) {
  const far = Math.abs(dx) >= width * DISTANCE;
  const flick = Math.abs(speed) >= FLICK_SPEED && Math.abs(dx) >= FLICK_MIN &&
    Math.sign(speed) === Math.sign(dx);
  if (!far && !flick) return from;
  const to = dx < 0 ? from + 1 : from - 1;
  return Math.max(0, Math.min(stops.length - 1, to));
}

/** The index of the stop nearest a scroll position */
export function nearestStop(stops, left) {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - left) < Math.abs(stops[best] - left)) best = i;
  }
  return best;
}

/** Something under the finger that handles the sideways gesture itself */
function ownsGesture(target, wrap) {
  for (let el = target; el && el !== wrap; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!["auto", "manipulation"].includes(style.touchAction)) return true;
    if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/**
 * On a phone, a column changes only when the finger means it.
 *
 * The board scrolls both ways, and the browser's mandatory snapping read the
 * slightest sideways drift of a vertical scroll — every thumb arcs — as a
 * request for the next column: nine scrolls in ten moved the board. The CSS
 * now leaves the browser the vertical axis only (`touch-action: pan-y`), and
 * it locks that axis from the first movement. The sideways one is here: once
 * a touch starts out mostly sideways, the board follows the finger, and on
 * release it goes to the next column only past a third of one, or on a flick
 * — otherwise it settles back.
 *
 * Stands down while a card or column is in hand: the drag-and-drop library
 * and the edge scroll own the board then.
 */
export function useColumnSwipe(wrapRef, enabled, columnSelector = BOARD_COLUMNS) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!enabled || !wrap) return;

    let gesture = null;
    let settle = null;

    const stops = () => {
      const base = wrap.getBoundingClientRect().left - wrap.scrollLeft + PADDING;
      const max = wrap.scrollWidth - wrap.clientWidth;
      return [...wrap.querySelectorAll(columnSelector)]
        .map((el) => Math.max(0, Math.min(max, el.getBoundingClientRect().left - base)));
    };

    const endSettle = () => {
      if (!settle) return;
      clearTimeout(settle.timer);
      wrap.removeEventListener("scroll", settle.onScroll);
      wrap.classList.remove("swiping");
      settle = null;
    };

    const onStart = (e) => {
      endSettle();
      gesture = null;
      if (e.touches.length !== 1 || wrap.classList.contains("dragging")) return;
      if (ownsGesture(e.target, wrap)) return;
      const t = e.touches[0];
      gesture = {
        x: t.clientX, y: t.clientY, left: wrap.scrollLeft,
        axis: null, lastX: t.clientX, lastT: e.timeStamp, speed: 0,
      };
    };

    const onMove = (e) => {
      const g = gesture;
      if (!g) return;
      if (wrap.classList.contains("dragging")) {
        gesture = null;
        wrap.classList.remove("swiping");
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.axis) {
        // Already a native scroll — the vertical one, the only one left
        if (!e.cancelable) { gesture = null; return; }
        if (Math.hypot(dx, dy) < SLOP) return;
        if (Math.abs(dx) <= Math.abs(dy)) { gesture = null; return; }
        g.axis = "x";
        // Snapping would pull the board back under the finger at every step
        wrap.classList.add("swiping");
      }
      e.preventDefault();
      wrap.scrollLeft = g.left - dx;
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.speed = (t.clientX - g.lastX) / dt;
      g.lastX = t.clientX;
      g.lastT = e.timeStamp;
    };

    const onEnd = (e) => {
      const g = gesture;
      gesture = null;
      if (!g || g.axis !== "x") return;
      // A finger that stopped before lifting is not a flick
      const speed = e.timeStamp - g.lastT > 80 ? 0 : g.speed;
      const all = stops();
      if (!all.length) { wrap.classList.remove("swiping"); return; }
      const from = nearestStop(all, g.left);
      // What the board actually moved: at either end, a pull goes nowhere
      const dx = g.left - wrap.scrollLeft;
      const width = wrap.clientWidth;
      const target = all[pickStop({ stops: all, from, dx, speed, width })];

      // Snapping comes back once the board is there: back on mid-way, it would
      // snap to whichever column is nearest and cut the glide short
      settle = {
        onScroll: () => { if (Math.abs(wrap.scrollLeft - target) < 1) endSettle(); },
        timer: setTimeout(endSettle, 700),
      };
      wrap.addEventListener("scroll", settle.onScroll, { passive: true });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      wrap.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
      if (Math.abs(wrap.scrollLeft - target) < 1) endSettle();
    };

    wrap.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: a sideways swipe must keep the page from taking it
    wrap.addEventListener("touchmove", onMove, { passive: false });
    wrap.addEventListener("touchend", onEnd, { passive: true });
    wrap.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      endSettle();
      wrap.classList.remove("swiping");
      wrap.removeEventListener("touchstart", onStart);
      wrap.removeEventListener("touchmove", onMove);
      wrap.removeEventListener("touchend", onEnd);
      wrap.removeEventListener("touchcancel", onEnd);
    };
  }, [wrapRef, enabled, columnSelector]);
}
