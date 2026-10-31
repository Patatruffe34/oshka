// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../../lib/firebase", () => ({ db: {} }));
import { useBoard } from "../useBoard";
import { getBoardAtPath, makeCard } from "../../lib/board-utils";

let host: HTMLDivElement, reactRoot: Root, board: ReturnType<typeof useBoard>;
const at = [{ colId: "projects", cardId: "project", cardTitle: "Project" }];
const task = () => getBoardAtPath(board.root!, at).columns[0].cards[0];
function Harness() {
  const state = useBoard("plan-user");
  useLayoutEffect(() => { board = state; });
  return null;
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.location.hash = "";
  const root = { columns: [
    { id: "tasks", cards: [{ ...makeCard("Current board task"), id: "decoy" }] },
    { id: "projects", cards: [{ ...makeCard("Project"), id: "project", board: { columns: [
      { id: "tasks", title: "Source", cards: [{ ...makeCard("Plan task"), id: "task" }] },
      { id: "next", title: "Next", cards: [] },
    ] } }] },
  ] };
  firestore.runTransaction.mockImplementation(async (_db, callback) => {
    let written: [unknown, Record<string, unknown>] | undefined;
    const result = await callback({ get: firestore.getDoc, set: (ref: unknown, data: Record<string, unknown>) => { written = [ref, data]; } });
    if (written) {
      await firestore.setDoc(...written);
      firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => written![1] });
    }
    return result;
  });
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(root) }) });
  firestore.onSnapshot.mockReturnValue(() => {}); firestore.setDoc.mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.append(host); reactRoot = createRoot(host);
  await act(() => reactRoot.render(<Harness />)); vi.useFakeTimers();
});
afterEach(async () => {
  await act(() => reactRoot.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks(); localStorage.clear(); window.location.hash = "";
});

describe("Plan actions on a card outside the current board", () => {
  it("applies labels, title, date, repetition and archive at the source", async () => {
    const decoy = structuredClone(board.root!.columns[0].cards[0]);
    await act(() => board.toggleCardLabel("tasks", "task", "urgent", at));
    await act(() => board.updateCard("tasks", "task", { title: "Renamed" }, at));
    await act(() => board.setCardDue("tasks", "task", "2026-10-22", at));
    await act(() => board.setCardRepeat("tasks", "task", { every: 2, unit: "week" }, at));
    await act(() => board.setCardArchived("tasks", "task", true, at));
    expect(task()).toMatchObject({ title: "Renamed", labels: ["urgent"], dueAt: "2026-10-22", repeat: { every: 2, unit: "week" }, archived: true });
    expect(board.root!.columns[0].cards).toEqual([decoy]);
    await act(() => board.undo()); expect(task().archived).toBe(false);
  });

  it("deletes to trash at the source, supports undo/redo, and restores there", async () => {
    const original = structuredClone(task());
    const decoy = structuredClone(board.root!.columns[0].cards[0]);
    await act(() => board.deleteCard("tasks", "task", at));
    expect(getBoardAtPath(board.root!, at).columns[0].cards).toEqual([]);
    expect(board.root!.columns[0].cards).toEqual([decoy]);
    expect(board.trash).toHaveLength(1);
    expect(board.trash[0]).toMatchObject({ path: at, colId: "tasks", card: original });
    await act(() => board.undo()); expect(task()).toEqual(original); expect(board.trash).toEqual([]);
    await act(() => board.redo()); expect(task()).toBeUndefined(); expect(board.trash).toHaveLength(1);
    await act(() => board.restoreFromTrash(board.trash[0].id));
    expect(task()).toEqual(original); expect(board.trash).toEqual([]);
    expect(board.root!.columns[0].cards).toEqual([decoy]);
  });

  it("moves between source columns in one undo step", async () => {
    const original = structuredClone(task());
    await act(() => board.moveCardTo("tasks", "task", at, "next", at));
    const source = () => getBoardAtPath(board.root!, at);
    expect(source().columns[0].cards).toEqual([]); expect(source().columns[1].cards).toEqual([original]);
    await act(() => board.undo()); expect(task()).toEqual(original); expect(source().columns[1].cards).toEqual([]);
  });

  it("ignores deletion from a stale source instead of trashing a card on an ancestor", async () => {
    const original = structuredClone(board.root);
    await act(() => board.deleteCard("tasks", "decoy", [{ colId: "gone", cardId: "gone" }]));
    expect(board.root).toEqual(original);
    expect(board.trash).toEqual([]);
  });
});
