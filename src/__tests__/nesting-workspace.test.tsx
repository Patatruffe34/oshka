// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { makeCard, makeCol, resolveBoardAtPath } from "../lib/board-utils";
import type { RootBoard } from "../lib/types";
import type { DropResult } from "@hello-pangea/dnd";

const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { uid: "nest-user", email: "test@example.com" }, loading: false }) }));
let drag: ReturnType<typeof import("../hooks/useBoardDrag").useBoardDrag>["contextProps"];
// Keep the real hook; drive the same responders the DnD sensors call.
vi.mock("../hooks/useBoardDrag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useBoardDrag")>();
  return { useBoardDrag: (options: Parameters<typeof actual.useBoardDrag>[0]) => {
    const state = actual.useBoardDrag(options);
    drag = state.contextProps;
    return state;
  } };
});
import App from "../App";

let host: HTMLDivElement, reactRoot: Root, seed: RootBoard;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!document.doctype) document.insertBefore(document.implementation.createDocumentType("html", "", ""), document.documentElement);
  localStorage.setItem("inceptio_lang", "en");
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "board", segments: [] }], activeId: "board" }));
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  const a = { ...makeCard("Move A"), id: "A", description: "Keep this", board: { columns: [{ ...makeCol("Inside A"), cards: [makeCard("Child")] }] } };
  const b = { ...makeCard("Target B"), id: "B" };
  seed = { columns: [{ ...makeCol("Tasks"), id: "tasks", cards: [a, b] }] };
  firestore.runTransaction.mockImplementation(async (_db, callback) => {
    let written: [unknown, Record<string, unknown>] | undefined;
    const result = await callback({ get: firestore.getDoc, set: (ref: unknown, data: Record<string, unknown>) => { written = [ref, data]; } });
    if (written) {
      await firestore.setDoc(...written);
      firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => written![1] });
    }
    return result;
  });
  firestore.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => ({ boardJson: JSON.stringify(seed) }) }));
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
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const render = () => act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
async function dropOnB() {
  const result: DropResult = { draggableId: "A", type: "card", mode: "FLUID", source: { droppableId: "tasks", index: 0 }, reason: "DROP", destination: null, combine: { draggableId: "B", droppableId: "tasks" } };
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true })));
  await act(() => drag.onDragStart(result));
  await act(() => drag.onDragEnd(result));
}
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)!;

it("moves straight into a single column, stays on the parent board and undoes the entire move", async () => {
  seed.columns[0].cards[1].board.columns = [makeCol("Only column")];
  await render();
  await dropOnB();
  expect(document.querySelector(".move-dialog")).toBeNull();
  expect(host.querySelector('[data-card-id="A"]')).toBeNull();
  expect(host.querySelector('[data-card-id="B"]')).not.toBeNull();
  expect(host.querySelector(".undo-toast")?.textContent).toContain("Target B › Only column");
  await act(() => button("Undo").click());
  expect(host.querySelector('[data-card-id="A"]')).not.toBeNull();
  expect(host.querySelector('[data-card-id="B"] .card-badge-board')?.textContent).toContain("empty board");
});

it("waits for a column on a multi-column board, then offers to open the moved card's location", async () => {
  seed.columns[0].cards[1].board.columns = [makeCol("First"), makeCol("Second")];
  await render();
  await dropOnB();
  expect(document.querySelector('.move-breadcrumb [aria-current="location"]')?.textContent).toBe("Target B");
  expect(host.querySelector('[data-card-id="A"]')).not.toBeNull();
  const columns = document.querySelectorAll<HTMLButtonElement>(".move-col-btn");
  await act(() => columns[1].click());
  expect(document.querySelector(".move-dialog")).toBeNull();
  expect(host.querySelector('[data-card-id="A"]')).toBeNull();
  await act(() => button("Open").click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  expect([...host.querySelectorAll<HTMLInputElement>(".col-title-input")].map((input) => input.value)).toEqual(["First", "Second"]);
  expect(host.querySelector('[data-card-id="A"]')).not.toBeNull();
});

it("cancels staged templates, then saves columns and subtree together and restores both with Undo", async () => {
  await render();
  await dropOnB();
  await act(() => document.querySelector<HTMLButtonElement>(".preset-card")!.click());
  await act(() => document.querySelector<HTMLButtonElement>(".move-dialog .modal-close")!.click());
  expect(host.querySelector('[data-card-id="A"]')).not.toBeNull();
  expect(host.querySelector('[data-card-id="B"] .card-badge-board')).toBeNull();
  await dropOnB();
  await act(() => document.querySelector<HTMLButtonElement>(".presets-scratch button")!.click());
  expect(document.querySelector(".move-dialog")).toBeNull();
  expect(host.querySelector('[data-card-id="A"]')).toBeNull();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
  const saved: RootBoard = JSON.parse(firestore.setDoc.mock.calls.at(-1)![1].boardJson);
  const nested = resolveBoardAtPath(saved, [{ colId: "tasks", cardId: "B" }])!;
  expect(nested.columns).toHaveLength(1);
  expect(nested.columns[0].title).toBe("Todo");
  expect(nested.columns[0].cards[0]).toMatchObject({ id: "A", description: "Keep this" });
  expect(nested.columns[0].cards[0].board.columns[0].cards[0].title).toBe("Child");
  await act(() => button("Undo").click());
  expect(host.querySelector('[data-card-id="A"]')).not.toBeNull();
  expect(host.querySelector('[data-card-id="B"] .card-badge-board')).toBeNull();
  await act(() => button("Redo").click());
  expect(host.querySelector('[data-card-id="A"]')).toBeNull();
  expect(host.querySelector('[data-card-id="B"] .card-badge-board')?.textContent).toContain("0/1");
});
