import { useEffect } from "react";
import { useMediaQuery } from "./useMediaQuery";
import { dismissTextInput, isTextInput, MOBILE_TEXT_ENTRY } from "../lib/text-entry";

/** A tap outside editing, or browser navigation, ends mobile text entry. */
export function useMobileKeyboard() {
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  useEffect(() => {
    if (!mobile) return;
    const onClick = (event: MouseEvent) => {
      const editor = (event.target as Element | null)?.closest?.("input, textarea, [contenteditable]");
      if (!isTextInput(editor)) dismissTextInput();
    };
    const onNavigate = () => dismissTextInput();
    // Click rather than pointerdown: don't blur on scrolling or text selection,
    // or remove an inline editor before the intended button receives its tap.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onNavigate);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onNavigate);
    };
  }, [mobile]);
}
