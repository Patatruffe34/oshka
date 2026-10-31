// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { makeCard } from "../../lib/board-utils";
import { captureInboxCard, editInboxCard, fileInboxCard, removeInboxCard } from "../../lib/inbox";
import InboxPanel from "../InboxPanel";
import Header from "../Header";
import type { Id, PathSegment, RootBoard } from "../../lib/types";

let host: HTMLDivElement, reactRoot: Root, mobile: boolean;
const click = async (element: Element | null) => act(() => (element as HTMLElement).click());
const type = async (element: Element | null, text: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, text);
  element!.dispatchEvent(new Event("input", { bubbles: true }));
});
const key = async (element: Element | null, name: string, options: KeyboardEventInit = {}) => act(() => element!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...options })));
beforeEach(() => {
  mobile = true;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "en");
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

interface HarnessProps {
  open?: boolean;
  onAdd?: (title: string) => void;
  onFile?: (id: Id, path: PathSegment[], colId: Id) => void;
  onClose?: () => void;
}

function Harness({ open = true, onAdd = () => {}, onFile = () => {}, onClose = () => {} }: HarnessProps) {
  const [board, setBoard] = useState<RootBoard>(() => ({ columns: [{ id: "tasks", title: "Tasks", emoji: "", color: "", cards: [] }], inbox: [makeCard("Existing thought")] }));
  return <I18nProvider><InboxPanel open={open} root={board} cards={board.inbox ?? []} onClose={onClose}
    onOpen={() => {}} onUndo={() => {}} canUndo={false}
    onAdd={(title) => { onAdd(title); setBoard((prev) => captureInboxCard(prev, makeCard(title)) ?? prev); return true; }}
    onEdit={(id, title) => setBoard((prev) => editInboxCard(prev, id, title))}
    onDelete={(id) => setBoard((prev) => removeInboxCard(prev, id))}
    onFile={(id, path, colId) => { onFile(id, path, colId); setBoard((prev) => fileInboxCard(prev, id, path, colId) ?? prev); return true; }}
  /></I18nProvider>;
}
const render = async (props?: HarnessProps) => act(() => reactRoot.render(<Harness {...props} />));
const panel = () => document.querySelector<HTMLElement>(".inbox-panel")!;
const input = () => document.querySelector<HTMLTextAreaElement>(".inbox-capture textarea")!;

describe("Inbox panel", () => {
  it("shows the list without opening the mobile keyboard", async () => {
    await render();
    expect(!panel().hidden).toBe(true);
    expect(panel().tagName).toBe("ASIDE");
    expect(document.querySelector("dialog")).toBeNull();
    expect(panel().textContent).not.toContain("Capture it now");
    expect(document.querySelector(".inbox-item-text")?.textContent).toBe("Existing thought");
    expect(document.activeElement).not.toBe(input());
    expect(document.querySelector(".move-dialog")).toBeNull();
  });
  it("captures once on Enter, leaves the list open and dismisses mobile input", async () => {
    const onAdd = vi.fn();
    await render({ onAdd });
    input().focus();
    await type(input(), "New thought");
    await key(input(), "Enter");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("New thought");
    expect(document.querySelectorAll(".inbox-item")).toHaveLength(2);
    expect(input().value).toBe("");
    expect(document.activeElement).not.toBe(input());
    expect(!panel().hidden).toBe(true);
  });
  it("keeps desktop batch capture focused", async () => {
    mobile = false;
    await render();
    input().focus();
    await type(input(), "Batch thought");
    await key(input(), "Enter");
    expect(document.activeElement).toBe(input());
  });
  it("ignores composition and preserves Shift+Enter for multiline notes", async () => {
    const onAdd = vi.fn();
    await render({ onAdd });
    await type(input(), "Draft");
    await key(input(), "Enter", { isComposing: true });
    await key(input(), "Enter", { shiftKey: true });
    expect(onAdd).not.toHaveBeenCalled();
    expect(input().value).toBe("Draft");
  });
  it("keeps a draft when the drawer is closed and reopened", async () => {
    await render();
    await type(input(), "Keep this draft");
    await render({ open: false });
    expect(!panel().hidden).toBe(false);
    expect(panel().hasAttribute("inert")).toBe(true);
    expect(panel().getAttribute("aria-hidden")).toBe("true");
    await render({ open: true });
    expect(panel().hasAttribute("inert")).toBe(false);
    expect(panel().getAttribute("aria-hidden")).toBe("false");
    expect(input().value).toBe("Keep this draft");
    expect(document.activeElement).not.toBe(input());
  });
  it("uses the existing destination picker, then removes the filed note", async () => {
    const onFile = vi.fn();
    await render({ onFile });
    await click(document.querySelector(".inbox-file"));
    const picker = document.querySelector<HTMLDialogElement>(".move-dialog")!;
    expect(picker.open).toBe(true);
    await click(picker.querySelector(".move-col-btn"));
    expect(onFile).toHaveBeenCalledWith(expect.any(String), [], "tasks");
    expect(document.querySelector(".move-dialog")).toBeNull();
    expect(document.querySelectorAll(".inbox-item")).toHaveLength(0);
    expect(panel().textContent).toContain("Card filed in its board");
  });
  it("cancels destination selection without losing the note", async () => {
    const onFile = vi.fn();
    await render({ onFile });
    await click(document.querySelector(".inbox-file"));
    await click(document.querySelector(".move-dialog .modal-close"));
    expect(onFile).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".inbox-item")).toHaveLength(1);
  });
  it("edits a note and cancels a later edit without changing it", async () => {
    await render();
    await click(document.querySelector(".inbox-edit-button"));
    await type(document.querySelector(".inbox-edit textarea"), "Revised thought");
    await key(document.querySelector(".inbox-edit textarea"), "Enter", { ctrlKey: true });
    expect(document.querySelector(".inbox-item-text")?.textContent).toBe("Revised thought");
    await click(document.querySelector(".inbox-edit-button"));
    await type(document.querySelector(".inbox-edit textarea"), "Discard this edit");
    await key(document.querySelector(".inbox-edit textarea"), "Escape");
    expect(document.querySelector(".inbox-item-text")?.textContent).toBe("Revised thought");
    expect(!panel().hidden).toBe(true);
  });
  it("folds the mobile capture form while scrolling down the list, and brings it back", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    await render();
    const list = document.querySelector<HTMLElement>(".inbox-list")!;
    const fold = document.querySelector(".inbox-capture-fold")!;
    Object.defineProperties(list, { scrollHeight: { value: 900 }, clientHeight: { value: 300 } });
    const scrollTo = async (top: number, at: number) => {
      now = at;
      list.scrollTop = top;
      await act(() => list.dispatchEvent(new Event("scroll")));
    };
    await scrollTo(120, 1000);
    expect(fold.classList.contains("is-folded")).toBe(true);
    await scrollTo(60, 2000);
    expect(fold.classList.contains("is-folded")).toBe(false);
    await scrollTo(200, 3000);
    expect(fold.classList.contains("is-folded")).toBe(true);
    await scrollTo(0, 3100);
    expect(fold.classList.contains("is-folded")).toBe(false);

    await act(() => input().focus());
    await scrollTo(200, 4000);
    expect(fold.classList.contains("is-folded")).toBe(false);
    await type(input(), "Half a thought");
    await act(() => input().blur());
    await scrollTo(400, 5000);
    expect(fold.classList.contains("is-folded")).toBe(false);
    await type(input(), "");
    await scrollTo(600, 6000);
    expect(fold.classList.contains("is-folded")).toBe(true);
  });
  it("never folds the capture form on desktop", async () => {
    mobile = false;
    await render();
    const list = document.querySelector<HTMLElement>(".inbox-list")!;
    Object.defineProperties(list, { scrollHeight: { value: 900 }, clientHeight: { value: 300 } });
    list.scrollTop = 200;
    await act(() => list.dispatchEvent(new Event("scroll")));
    expect(document.querySelector(".inbox-capture-fold")?.classList.contains("is-folded")).toBe(false);
  });
  it("has an Inbox entry outside the mobile hamburger menu, beside Plan", async () => {
    const onOpenInbox = vi.fn();
    const unused = { saving: false, theme: "light", onToggleTheme: vi.fn(), onGoToBreadcrumb: vi.fn(), onLogout: vi.fn(), onOpenProfile: vi.fn(), onOpenFavorites: vi.fn(), onOpenTrash: vi.fn(), onCleanArchives: vi.fn(), onArchiveDone: vi.fn(), onOpenSearch: vi.fn(), onLabelFilterChange: vi.fn(), onOpenOutline: vi.fn(), onOpenWeek: vi.fn(), weekOpen: false, onUndo: vi.fn(), canUndo: false, onToggleFavorite: vi.fn(), isFavorited: false, trashCount: 0, userEmail: null };
    await act(() => reactRoot.render(<I18nProvider><Header {...unused} path={[]} online inboxCount={3} onOpenInbox={onOpenInbox} /></I18nProvider>));
    const trigger = host.querySelector(".inbox-fab")!;
    expect(trigger.getAttribute("aria-label")).toBe("Inbox · 3 to file");
    expect(trigger.textContent).toBe("");
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(host.querySelector(".header-menu")).toBeNull();
    await click(trigger);
    expect(onOpenInbox).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".week-fab:not(.inbox-fab)")).not.toBeNull();
  });
});
