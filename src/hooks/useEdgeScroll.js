import { useEffect } from "react";

/** How close to an edge the finger has to be, in pixels */
const EDGE = 56;
/* Pixels per second, not per frame: a 120Hz phone would otherwise scroll
   twice as fast as a 60Hz one. Eased, so the edge of the zone creeps and the
   edge of the screen runs — a column at a time is within reach of the thumb. */
const MAX_SPEED = 900;
const MIN_SPEED = 100;

/**
 * For the drag-and-drop context: its own scrolling off, this one does it.
 *
 * Two scrollers on one container add up, and the library's goes by the card's
 * centre. Only the fluid scroll is stopped — keyboard drags still scroll by
 * the library's jumps, which `disabled` would have taken away too.
 */
export const NO_LIBRARY_AUTOSCROLL = { maxPixelScroll: 0 };

/**
 * While something is being carried, holding it near an edge scrolls that way.
 *
 * The library scrolls on its own, but it goes by the centre of the card in
 * hand, not by the finger: on a phone a card is nearly the width of the
 * screen, so its centre hardly gets near an edge, and it also holds back for
 * the first part of a second on purpose. Here it is the finger that counts —
 * put it against the edge and the board moves, faster the closer it is.
 *
 * The library follows a container that scrolls under a drag, so the card
 * still lands where the finger is.
 */
export function useEdgeScroll(containerRef, active) {
  useEffect(() => {
    const el = containerRef.current;
    if (!active || !el) return;

    let point = null;
    let frame = 0;
    let last = 0;
    // Fractions of a pixel carried over: at a crawl a frame is worth less than
    // one, and a scroll position rounds it away to nothing
    let carry = { x: 0, y: 0 };

    const track = (e) => {
      const p = e.touches?.[0] ?? e;
      point = { x: p.clientX, y: p.clientY };
    };

    /* 0 outside the zone, rising to 1 at the edge itself */
    const depth = (distance) => Math.max(0, Math.min(1, (EDGE - distance) / EDGE));
    const speed = (d) => (d > 0 ? MIN_SPEED + (MAX_SPEED - MIN_SPEED) * d * d : 0);

    const step = (now) => {
      frame = requestAnimationFrame(step);
      // Capped, so a frame that came late does not lurch the board forward
      const dt = last ? Math.min(now - last, 50) / 1000 : 0;
      last = now;
      if (!point || !dt) return;
      const r = el.getBoundingClientRect();
      // An Inbox drag starts outside the board; it must not scroll the board yet.
      if (point.x < r.left || point.x > r.right || point.y < r.top || point.y > r.bottom) {
        carry = { x: 0, y: 0 };
        return;
      }
      const dx = speed(depth(r.right - point.x)) - speed(depth(point.x - r.left));
      const dy = speed(depth(r.bottom - point.y)) - speed(depth(point.y - r.top));
      if (!dx && !dy) { carry = { x: 0, y: 0 }; return; }
      carry = { x: carry.x + dx * dt, y: carry.y + dy * dt };
      const by = { x: Math.trunc(carry.x), y: Math.trunc(carry.y) };
      carry = { x: carry.x - by.x, y: carry.y - by.y };
      if (by.x || by.y) el.scrollBy(by.x, by.y);
    };

    window.addEventListener("touchmove", track, { capture: true, passive: true });
    window.addEventListener("mousemove", track, { capture: true, passive: true });
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchmove", track, { capture: true });
      window.removeEventListener("mousemove", track, { capture: true });
    };
  }, [containerRef, active]);
}
