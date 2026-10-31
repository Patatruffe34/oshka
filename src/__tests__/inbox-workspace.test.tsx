// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { makeCard, dayFromNow } from "../lib/board-utils";

const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { uid: "test-user", email: "test@example.com" }, loading: false }) }));
import App from "../App";

let host: HTMLDivElement, reactRoot: Root;
/** The element a step needs: when it is missing, the test fails right there */
const get = <E extends HTMLElement = HTMLElement>(selector: string, scope: ParentNode = host) => {
  const element = scope.querySelector<E>(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  return element;
};
const inModal = <E extends HTMLElement = HTMLElement>(selector: string) => get<E>(selector, get(".modal-card"));
/** Set a field the way typing does, so React sees the change */
const setValue = (field: HTMLElement, value: string) =>
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!document.doctype) document.insertBefore(document.implementation.createDocumentType("html", "", ""), document.documentElement);
  localStorage.setItem("inceptio_lang", "en");
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "plan", view: "week", segments: [] }, { id: "board", segments: [] }], activeId: "plan" }));
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  const board = { columns: [{ id: "tasks", title: "Tasks", cards: [{ ...makeCard("Existing task"), dueAt: dayFromNow(0) }] }], inbox: [makeCard("Inbox task")] };
  firestore.runTransaction.mockImplementation(async (_db, callback) => {
    let written: [unknown, Record<string, unknown>] | undefined;
    const result = await callback({ get: firestore.getDoc, set: (ref: unknown, data: Record<string, unknown>) => { written = [ref, data]; } });
    if (written) {
      await firestore.setDoc(...written);
      firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => written![1] });
    }
    return result;
  });
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  firestore.onSnapshot.mockReturnValue(() => {});
  firestore.setDoc.mockResolvedValue(undefined);
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
it.each([true, false])("connects Inbox and Agenda even when scheduled tasks exist: %s", async (scheduled) => {
  if (!scheduled) {
    const board = { columns: [{ id: "tasks", title: "Tasks", cards: [] }], inbox: [makeCard("Inbox task")] };
    firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  }
  await act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
  await act(() => get(".inbox-trigger").click());
  const note = get(".inbox-item");
  const lane = get(".lane-today .planner-lane-body");
  expect(note.getAttribute("data-rfd-draggable-id")).toBeTruthy();
  expect(note.getAttribute("data-rfd-draggable-context-id")).toBe(lane.getAttribute("data-rfd-droppable-context-id"));
  expect(host.querySelector(".inbox-drag-handle")).not.toBeNull();
});

it("keeps an empty Inbox registered as a drop target beside a board", async () => {
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "plan", view: "week", segments: [] }, { id: "board", segments: [] }], activeId: "board" }));
  const board = { columns: [{ id: "tasks", title: "Tasks", cards: [makeCard("To Inbox")] }], inbox: [] };
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  await act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
  await act(() => get(".inbox-trigger").click());
  const target = host.querySelector('[data-rfd-droppable-id="oshka:inbox"]');
  expect(target).not.toBeNull();
  expect(target?.classList.contains("inbox-list")).toBe(true);
  expect(target?.getAttribute("data-rfd-droppable-context-id")).toBe(get(".card-slot").getAttribute("data-rfd-draggable-context-id"));
});

it.each(["click", "keyboard"])("opens Inbox card details via %s, follows edits and preserves the board", async (method) => {
  const note = { ...makeCard("Inbox with details"), description: "Source : [daily note](obsidian://open?path=Daily%20note.md)", comments: [{ id: "comment", text: "Context" }] };
  const board = { columns: [{ id: "tasks", title: "Tasks", cards: [makeCard("Board task")] }], inbox: [note, makeCard("Other note")] };
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  await act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
  await act(() => get(".inbox-trigger").click());
  const trigger = get(".inbox-item-text");
  await act(() => method === "click" ? trigger.click() : trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  const modal = () => host.querySelector<HTMLElement>(".modal-card");
  expect(modal()).not.toBeNull();
  expect(inModal<HTMLTextAreaElement>(".modal-title-input").value).toBe(note.title);
  expect(inModal(".modal-desc-display a").getAttribute("href")).toContain("obsidian://");
  expect(modal()?.textContent).toContain("Context");
  await act(() => inModal(".modal-desc-display").click());
  const editor = inModal(".modal-desc-edit textarea");
  await act(() => {
    setValue(editor, "Updated **description**");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => inModal(".modal-desc-edit .btn-primary").click());
  expect(inModal(".modal-desc-display strong").textContent).toBe("description");
  await act(() => inModal(".modal-close").click());
  expect(modal()).toBeNull();
  expect(host.querySelectorAll(".inbox-item")).toHaveLength(2);
  await act(() => get(".inbox-item-text").click());
  expect(inModal(".modal-desc-display").textContent).toBe("Updated description");
});

it.each([
  { mobile: false, depth: 1 },
  { mobile: false, depth: 2 },
  { mobile: true, depth: 1 },
  { mobile: true, depth: 2 },
])("edits the containing card without leaving its board: %j", async ({ mobile, depth }) => {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") || (mobile && query === "(max-width: 640px)"),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList);
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "plan", view: "week", segments: [] }, { id: "board", segments: [] }], activeId: "board" }));
  const child = { ...makeCard("Child task"), description: "Child description" };
  const target = { ...makeCard("Containing card"), description: "Original context", board: { columns: [{ id: "tasks", title: "Tasks", cards: [child] }] } };
  const outer = { ...makeCard("Outer card"), board: { columns: [{ id: "nested", title: "Nested", cards: [target] }] } };
  const board = { columns: [{ id: "projects", title: "Projects", cards: [depth === 1 ? target : outer] }] };
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  await act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
  expect(host.querySelector(".breadcrumb-detail")).toBeNull();

  for (const card of depth === 1 ? [target] : [outer, target]) {
    await act(() => get(`[data-card-id="${card.id}"]`).dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await act(() => new Promise((resolve) => setTimeout(resolve, 140)));
  }
  const hash = window.location.hash;
  const boardElement = get(".board-wrap");
  boardElement.scrollLeft = 123;
  const openDetails = async () => {
    if (mobile) {
      expect(host.querySelector(".crumb-compact .breadcrumb-detail")).toBeNull();
      await act(() => get(".crumb-current").click());
      await act(() => get(".crumb-details", document).click());
      expect(document.querySelector(".crumb-panel")).toBeNull();
    } else {
      await act(() => get(".breadcrumb-detail").click());
    }
  };
  await openDetails();
  const modal = () => host.querySelector<HTMLElement>(".modal-card");
  expect(inModal<HTMLTextAreaElement>(".modal-title-input").value).toBe(target.title);
  expect(inModal(".modal-desc-display").textContent).toBe("Original context");
  const title = inModal(".modal-title-input");
  await act(() => {
    title.focus();
    setValue(title, "Renamed containing card");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => title.blur());
  expect(get(mobile ? ".crumb-current-name" : ".breadcrumb-btn.active").textContent).toBe("Renamed containing card");
  await act(() => inModal(".modal-desc-display").click());
  const editor = inModal(".modal-desc-edit textarea");
  await act(() => {
    setValue(editor, "Updated parent context");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => inModal(".modal-desc-edit .btn-primary").click());
  expect(inModal(".modal-desc-display").textContent).toBe("Updated parent context");
  await act(() => inModal(".modal-close").click());
  expect(modal()).toBeNull();
  expect(window.location.hash).toBe(hash);
  expect(host.querySelector(".board-wrap")).toBe(boardElement);
  expect(boardElement.scrollLeft).toBe(123);
  expect(host.querySelector(`[data-card-id="${child.id}"]`)).not.toBeNull();
  await openDetails();
  expect(inModal(".modal-desc-display").textContent).toBe("Updated parent context");
  const tabsBefore = localStorage.getItem("oshka_tabs");
  await act(() => inModal(".modal-drill-btn").click());
  expect(modal()).toBeNull();
  expect(window.location.hash).toBe(hash);
  expect(localStorage.getItem("oshka_tabs")).toBe(tabsBefore);
  await act(() => get(`[data-card-id="${child.id}"]`).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(inModal(".modal-desc-display").textContent).toBe("Child description");
});
