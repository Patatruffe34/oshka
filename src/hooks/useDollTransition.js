import { useLayoutEffect, useRef } from "react";

const OPEN_MS = 320;
const CLOSE_MS = 300;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/*
 * Run an animation, and make sure it ends.
 *
 * The animation clock only moves when the page draws frames. In a tab the
 * browser has stopped drawing — hidden, backgrounded mid-way — it stands still
 * at the first frame, and the first frame here is a board clipped down to the
 * size of a card. Timers still run there, so one of them takes it to its end.
 */
const play = (el, keyframes, duration) => {
  const anim = el.animate(keyframes, { duration, easing: EASE });
  const timer = setTimeout(() => anim.finish(), duration + 80);
  anim.onfinish = anim.oncancel = () => clearTimeout(timer);
  return anim;
};

/** The cardIds of a view key, `${tabId}|${id/id/...}` */
const parse = (key) => {
  const [tab, ids = ""] = key.split("|");
  return { tab, ids: ids ? ids.split("/") : [] };
};

/**
 * Going into a card opens it like the doll it is; coming back out closes it.
 *
 * In: the new board is revealed from the outline of the card it came out of,
 * widening to the whole screen. Out: the card you leave by settles back into
 * its place on the parent, as if it had just shut. Tab switches and jumps
 * across the tree are not either of these, and play nothing.
 *
 * Everything here is one `clip-path` or one `transform`, run once through the
 * Web Animations API — nothing stays on the element after it ends. Removing
 * the call in Board removes the whole effect.
 */
export function useDollTransition(wrapRef, viewKey, navigating) {
  const rects = useRef(new Map());
  const shown = useRef(viewKey);

  /* Where every card stood, taken as the old board fades: by the time the
     new one is up, the card that was entered no longer exists to measure. */
  useLayoutEffect(() => {
    if (!navigating || !wrapRef.current) return;
    rects.current = new Map(
      [...wrapRef.current.querySelectorAll("[data-card-id]")].map((el) => [
        el.dataset.cardId,
        el.getBoundingClientRect(),
      ])
    );
  }, [navigating, wrapRef]);

  useLayoutEffect(() => {
    const from = parse(shown.current);
    const to = parse(viewKey);
    shown.current = viewKey;
    const wrap = wrapRef.current;
    if (!wrap || from.tab !== to.tab) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const prefix = (a, b) => a.every((id, i) => b[i] === id);

    // One level in
    if (to.ids.length === from.ids.length + 1 && prefix(from.ids, to.ids)) {
      const card = rects.current.get(to.ids[to.ids.length - 1]);
      if (!card) return;
      const w = wrap.getBoundingClientRect();
      const inset = [
        card.top - w.top,
        w.right - card.right,
        w.bottom - card.bottom,
        card.left - w.left,
      ].map((v) => `${Math.max(0, v)}px`).join(" ");
      play(
        wrap,
        [
          { clipPath: `inset(${inset} round 8px)`, opacity: 0.5 },
          { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
        ],
        OPEN_MS
      );
      return;
    }

    // Any number of levels out: the card that was left by closes back up
    if (to.ids.length < from.ids.length && prefix(to.ids, from.ids)) {
      const left = from.ids[to.ids.length];
      play(
        wrap,
        [{ transform: "scale(1.03)", opacity: 0.5 }, { transform: "scale(1)", opacity: 1 }],
        CLOSE_MS
      );
      // The card mounts in this same commit, so it can be found right away
      const el = wrap.querySelector(`[data-card-id="${left}"]`);
      if (el) {
        play(
          el,
          [
            { transform: "scale(1.12)", boxShadow: "0 0 0 2px var(--accent)" },
            { transform: "scale(0.98)", offset: 0.6 },
            { transform: "scale(1)", boxShadow: "0 0 0 0 transparent" },
          ],
          CLOSE_MS + 120
        );
      }
    }
  }, [viewKey, wrapRef]);
}
