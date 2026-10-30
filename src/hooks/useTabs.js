import { useState, useRef, useEffect, useCallback } from "react";
import { uid } from "../lib/board-utils";

const TABS_KEY = "oshka_tabs";

/** Tabs are a working set, not bookmarks: this machine's, not the account's */
const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY));
    if (!Array.isArray(saved?.tabs) || saved.tabs.length === 0) return null;
    // States written before Horizon was permanent still need it
    return withHorizon(saved);
  } catch {
    return null;
  }
};

/** View tabs stay left: they are places, not positions, and they do not move */
const pinnedCount = (tabs) => tabs.filter((t) => t.view).length;

/**
 * Horizon is always there, anchored left and never closed.
 *
 * It is a place rather than a position, and the one you reach for without
 * knowing what you are looking for — so it is part of the furniture instead of
 * something to summon. Its permanence is what lets the top bar drop its
 * button: the tab *is* the way in.
 */
export const withHorizon = (state) => {
  if (state.tabs.some((t) => t.view)) return state;
  return { ...state, tabs: [{ id: uid(), segments: [], view: "week" }, ...state.tabs] };
};

const fresh = () => {
  const id = uid();
  return withHorizon({ tabs: [{ id, segments: [] }], activeId: id });
};

const segmentsOf = (p) => p.map((s) => ({ colId: s.colId, cardId: s.cardId }));

/**
 * Where a new tab lands.
 *
 * A tab opened from a card belongs next to the one it came from — it is that
 * card's continuation, and a browser puts it there for the same reason. A tab
 * opened from the "+" came from nothing, so it has no neighbour to sit beside
 * and goes to the end, where the button that made it is.
 *
 * Either way it never crosses the pinned views on the left.
 */
export const placeTab = (tabs, tab, { activeId, atEnd = false } = {}) => {
  const next = [...tabs];
  // Anchored left, so it is always in the same place to reach for
  if (tab.view) return [tab, ...next];
  const pinned = pinnedCount(next);
  if (atEnd) return [...next, tab];
  const at = next.findIndex((t) => t.id === activeId);
  next.splice(Math.max(at + 1, pinned), 0, tab);
  return next;
};

/**
 * Several boards open at once, one at a time on screen.
 *
 * A tab is a position in the tree — a list of ids, nothing else — or a view
 * that stands on its own, like the week. The title of a board tab is resolved
 * from the tree when it is drawn, so renaming a card renames its tab and a tab
 * whose card is gone degrades instead of lying.
 *
 * The showing tab holds no path of its own: it *is* `path`, which the board
 * hook already owns. Only the others carry stored segments, and one is written
 * the moment it stops showing. Nothing has to be kept in step, so nothing can
 * fall out of step.
 */
export function useTabs({ path, navigate, ready }) {
  const [state, setState] = useState(() => read() || fresh());
  const settled = useRef(false);

  /** State as it stands, with the showing tab holding where we actually are */
  const materialise = useCallback(
    (s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        // A view tab holds no position, so there is nothing to write back
        t.id === s.activeId && !t.view ? { ...t, segments: segmentsOf(path) } : t
      ),
    }),
    [path]
  );

  useEffect(() => {
    if (!ready) return;
    // The board hook restores the last position a tick after the tree lands.
    // Saving before that would store the empty root it holds in the meantime.
    if (!settled.current) {
      settled.current = true;
      return;
    }
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(materialise(state)));
    } catch { /* private mode, or full: tabs are not worth failing over */ }
  }, [state, materialise, ready]);

  const select = useCallback(
    (id, resolve) => {
      setState((prev) => {
        if (id === prev.activeId) return prev;
        const target = prev.tabs.find((t) => t.id === id);
        if (!target) return prev;
        if (!target.view) navigate(resolve(target.segments));
        return { ...materialise(prev), activeId: id };
      });
    },
    [navigate, materialise]
  );

  const open = useCallback(
    (segments, resolve, view, { background = false, atEnd = false } = {}) => {
      const tab = { id: uid(), segments, ...(view ? { view } : {}) };
      setState((prev) => {
        const tabs = placeTab(materialise(prev).tabs, tab, {
          activeId: prev.activeId,
          atEnd,
        });
        return { tabs, activeId: background ? prev.activeId : tab.id };
      });
      // Nothing to go to: a background tab is not where you are, and a view
      // tab has no position in the tree at all.
      if (!view && !background) navigate(resolve(segments));
    },
    [navigate, materialise]
  );

  const close = useCallback(
    (id, resolve) => {
      setState((prev) => {
        const current = materialise(prev);
        const at = current.tabs.findIndex((t) => t.id === id);
        if (at === -1) return prev;
        const closed = current.tabs[at];
        const tabs = current.tabs.filter((t) => t.id !== id);

        // Closing the last board would leave views alone, and a view holds no
        // position in the tree — nothing to come back to. So one opens at the
        // root and takes over, rather than the close being refused.
        if (!closed.view && !tabs.some((t) => !t.view)) {
          const root = { id: uid(), segments: [] };
          navigate([]);
          return { tabs: [...tabs, root], activeId: root.id };
        }

        if (id !== prev.activeId) return { ...current, tabs };
        // Closing the one you are on lands you on its neighbour
        const next = tabs[Math.min(at, tabs.length - 1)];
        if (!next.view) navigate(resolve(next.segments));
        return { tabs, activeId: next.id };
      });
    },
    [navigate, materialise]
  );

  const move = useCallback((from, to) => {
    setState((prev) => {
      const tabs = [...materialise(prev).tabs];
      const pinned = pinnedCount(tabs);
      // Nothing crosses the pinned ones, in either direction
      if (from < pinned) return prev;
      const target = Math.max(to, pinned);
      if (from === target) return prev;
      const [moved] = tabs.splice(from, 1);
      tabs.splice(target, 0, moved);
      return { ...prev, tabs };
    });
  }, [materialise]);

  return { tabs: state.tabs, activeId: state.activeId, select, open, close, move };
}
