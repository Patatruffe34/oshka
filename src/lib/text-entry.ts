/** Phones and touch tablets end a single entry; desktop keeps batch entry. */
export const MOBILE_TEXT_ENTRY = "(max-width: 640px), (pointer: coarse)";

/** Any keyboard event, native or React's */
interface KeyLike {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
}

export function isComposingKey(event: KeyLike): boolean {
  return !!(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229);
}

export function isTextInput(element: Element | null | undefined): element is HTMLElement {
  if (!element) return false;
  if ((element as HTMLElement).isContentEditable || element.tagName === "TEXTAREA") return true;
  return element.tagName === "INPUT" &&
    !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "hidden"].includes((element as HTMLInputElement).type);
}

/** Blur only the active text editor, never a button or another control. */
export function dismissTextInput(within: Node | null = document): void {
  const active = document.activeElement;
  if (isTextInput(active) && within?.contains(active)) active.blur();
}
