import { useEffect } from "react";
import { isComposingKey, isTextInput } from "../lib/text-entry";

const SHORTCUTS = { r: "rename", e: "labels", d: "due", a: "archive", m: "move" };
const COVERING_CARDS = ".modal-overlay, .search-overlay, .side-panel-overlay, .popover, .mindmap";

/** The board and Plan share keys and the rules that keep typing safe. */
export function useCardShortcuts({ enabled, onAction }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      const action = SHORTCUTS[e.key.toLowerCase()];
      if (!action || e.defaultPrevented || isComposingKey(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTextInput(e.target)) return;
      if (document.querySelector(COVERING_CARDS)) return;
      e.preventDefault();
      onAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onAction]);
}
