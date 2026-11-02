// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { makeCard, makeCol } from "../lib/board-utils";

const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { uid: "history-user", email: "test@example.com" }, loading: false }) }));
import App from "../App";

let host: HTMLDivElement, reactRoot: Root;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!document.doctype) document.insertBefore(document.implementation.createDocumentType("html", "", ""), document.documentElement);
  localStorage.setItem("inceptio_lang", "en");
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "home", home: true, segments: [] }], activeId: "home" }));
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  const board = { columns: [{ ...makeCol("Tasks"), cards: [makeCard("Existing card")] }] };
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  firestore.onSnapshot.mockReturnValue(() => {});
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
  await act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
  await act(() => host.querySelector<HTMLButtonElement>(".add-card-btn")!.click());
  const input = host.querySelector<HTMLInputElement>(".add-card-input")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Added card");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  await act(() => input.blur());
  expect(titles()).toEqual(["Existing card", "Added card"]);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const titles = () => [...host.querySelectorAll(".card-title")].map((element) => element.textContent);
async function key(target: EventTarget, options: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true, ...options });
  await act(() => { target.dispatchEvent(event); });
  return event;
}
function editor(kind: "input" | "textarea" | "contenteditable") {
  const element = document.createElement(kind === "contenteditable" ? "div" : kind);
  if (kind === "contenteditable") element.contentEditable = "true";
  host.append(element);
  element.focus();
  expect(document.activeElement).toBe(element);
  return element;
}

describe.each(["ctrlKey", "metaKey"] as const)("%s undo/redo ownership", (modifier) => {
  it.each(["input", "textarea", "contenteditable"] as const)("leaves Undo and Redo to the active %s without touching Oshka's history", async (kind) => {
    const field = editor(kind);
    const undo = await key(field, { [modifier]: true });
    expect(undo.defaultPrevented).toBe(false);
    expect(titles()).toEqual(["Existing card", "Added card"]);
    await act(() => field.blur());
    const appUndo = await key(document.body, { [modifier]: true });
    expect(appUndo.defaultPrevented).toBe(true);
    expect(titles()).toEqual(["Existing card"]);
    await act(() => field.focus());
    const redo = await key(field, { [modifier]: true, shiftKey: true });
    expect(redo.defaultPrevented).toBe(false);
    expect(titles()).toEqual(["Existing card"]);
    await act(() => field.blur());
    await key(document.body, { [modifier]: true, shiftKey: true });
    expect(titles()).toEqual(["Existing card", "Added card"]);
  });

  it("still undoes and redoes board changes when no editor has focus", async () => {
    expect((await key(document.body, { [modifier]: true })).defaultPrevented).toBe(true);
    expect(titles()).toEqual(["Existing card"]);
    expect((await key(document.body, { [modifier]: true, shiftKey: true })).defaultPrevented).toBe(true);
    expect(titles()).toEqual(["Existing card", "Added card"]);
  });
});

it("protects a focused input even when the event is dispatched on window", async () => {
  editor("input");
  const event = await key(window, { ctrlKey: true });
  expect(event.defaultPrevented).toBe(false);
  expect(titles()).toEqual(["Existing card", "Added card"]);
});

it("respects a shortcut already handled by a local component", async () => {
  const control = document.createElement("button");
  control.addEventListener("keydown", (event) => event.preventDefault());
  host.append(control);
  control.focus();
  await key(control, { ctrlKey: true });
  expect(titles()).toEqual(["Existing card", "Added card"]);
});
