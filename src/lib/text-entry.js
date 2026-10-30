/** Phones and touch tablets end a single entry; desktop keeps batch entry. */
export const MOBILE_TEXT_ENTRY = "(max-width: 640px), (pointer: coarse)";

export function isComposingKey(event) {
  return !!(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229);
}

export function isTextInput(element) {
  if (!element) return false;
  if (element.isContentEditable || element.tagName === "TEXTAREA") return true;
  return element.tagName === "INPUT" &&
    !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "hidden"].includes(element.type);
}

/** Blur only the active text editor, never a button or another control. */
export function dismissTextInput(within = document) {
  const active = document.activeElement;
  if (isTextInput(active) && within.contains(active)) active.blur();
}
