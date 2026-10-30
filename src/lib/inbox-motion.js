const GEOMETRY_TRANSITIONS = new Set([
  "flex-basis", "border-right-width", "border-bottom-width", "margin-left", "margin-top", "visibility",
  "grid-template-rows",
]);

/** Finish the panel's slide before DnD measures its source and targets. */
export function settleInboxTransition() {
  const panel = document.getElementById("oshka-inbox");
  for (const animation of panel?.getAnimations?.({ subtree: true }) ?? []) {
    if (GEOMETRY_TRANSITIONS.has(animation.transitionProperty)) animation.finish();
  }
}

const FOLD_TOP = 24; // near the top of the list, the capture form is always shown
const FOLD_SLACK = 12; // ignore jitter smaller than this before changing direction
const FOLD_SETTLE = 300; // longer than the fold transition: its own reflow is not a gesture

export const CAPTURE_UNFOLDED = { folded: false, anchor: 0, changedAt: -Infinity };

/**
 * Decide whether the mobile capture form folds while the Inbox list scrolls.
 * `room` is how far the list could still scroll once folded: folding without it
 * would clamp the list to the top and leave no gesture to bring the form back.
 */
export function foldCapture(state, { top, room, now, pinned }) {
  const at = (folded) => ({ folded, anchor: top, changedAt: folded === state.folded ? state.changedAt : now });
  if (pinned || top <= FOLD_TOP) return at(false);
  if (now - state.changedAt < FOLD_SETTLE) return at(state.folded);
  if (state.folded) {
    return top < state.anchor - FOLD_SLACK ? at(false) : { ...state, anchor: Math.max(state.anchor, top) };
  }
  return top > state.anchor + FOLD_SLACK && room > FOLD_TOP ? at(true) : { ...state, anchor: Math.min(state.anchor, top) };
}
