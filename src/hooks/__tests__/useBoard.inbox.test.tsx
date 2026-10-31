// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../../lib/firebase", () => ({ db: {} }));
import { useBoard } from "../useBoard";
import type { Board, Comment } from "../../lib/types";

let host: HTMLDivElement, reactRoot: Root, board: ReturnType<typeof useBoard>;
function Harness() {
  const state = useBoard("inbox-user");
  useLayoutEffect(() => { board = state; });
  return null;
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  firestore.runTransaction.mockImplementation(async (_db, callback) => {
    let written: [unknown, Record<string, unknown>] | undefined;
    const result = await callback({ get: firestore.getDoc, set: (ref: unknown, data: Record<string, unknown>) => { written = [ref, data]; } });
    if (written) {
      await firestore.setDoc(...written);
      firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => written![1] });
    }
    return result;
  });
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify({ columns: [{ id: "tasks", cards: [] }] }) }) });
  firestore.onSnapshot.mockReturnValue(() => {});
  firestore.setDoc.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
  await act(async () => { reactRoot.render(<Harness />); });
  vi.useFakeTimers();
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Inbox account integration", () => {
  it("captures a shared title and description atomically and undoes both together", async () => {
    const description = "https://example.com/?a=1&b=2\n\nÀ relire";
    await act(() => board.captureInbox("Shared article", { description }));
    expect(board.inbox).toHaveLength(1);
    expect(board.inbox[0]).toMatchObject({ title: "Shared article", description });
    await act(async () => vi.advanceTimersByTimeAsync(301));
    expect(JSON.parse(firestore.setDoc.mock.calls.at(-1)![1].boardJson).inbox[0]).toMatchObject({ title: "Shared article", description });
    await act(() => board.undo());
    expect(board.inbox).toEqual([]);
    await act(() => board.redo());
    expect(board.inbox[0]).toMatchObject({ title: "Shared article", description });
  });
  it("persists detail edits on the Inbox card and supports undo/redo without touching the current board", async () => {
    await act(() => board.captureInbox("With details"));
    const id = board.inbox[0].id;
    const columns = structuredClone(board.root!.columns);
    await act(() => board.updateInbox(id, { description: "Source : [note](obsidian://open?path=Note.md)", comments: [{ id: "comment", text: "Context" } as Comment] }));
    expect(board.inbox[0].description).toContain("obsidian://");
    expect(board.root!.columns).toEqual(columns);
    await act(async () => vi.advanceTimersByTimeAsync(301));
    expect(JSON.parse(firestore.setDoc.mock.calls.at(-1)![1].boardJson).inbox).toEqual(board.inbox);
    await act(() => board.undo());
    expect(board.inbox[0].description).toBe("");
    await act(() => board.redo());
    expect(board.inbox[0].comments[0].text).toBe("Context");
    await act(() => { expect(board.updateInbox("missing", { description: "Lost" })).toBe(false); });
  });

  it("saves capture to the existing account document and restores it on undo/redo", async () => {
    expect(board.inbox).toEqual([]);
    await act(() => board.captureInbox("  A thought  "));
    expect(board.inbox).toHaveLength(1);
    expect(board.inbox[0].title).toBe("A thought");
    await act(async () => vi.advanceTimersByTimeAsync(301));
    const payload = firestore.setDoc.mock.calls.at(-1)![1];
    expect(JSON.parse(payload.boardJson).inbox).toEqual(board.inbox);
    await act(() => board.undo());
    expect(board.inbox).toEqual([]);
    await act(() => board.redo());
    expect(board.inbox[0].title).toBe("A thought");
  });
  it("files in a single undo step and rejects a stale destination", async () => {
    await act(() => board.captureInbox("To file"));
    const id = board.inbox[0].id;
    await act(() => { expect(board.fileInbox(id, [], "missing")).toBe(false); });
    expect(board.inbox[0].id).toBe(id);
    await act(() => { expect(board.fileInbox(id, [], "tasks")).toBe(true); });
    expect(board.inbox).toEqual([]);
    expect(board.root!.columns[0].cards[0].id).toBe(id);
    await act(() => board.undo());
    expect(board.inbox[0].id).toBe(id);
    expect(board.root!.columns[0].cards).toEqual([]);
  });
  it("keeps a positioned drop atomic through undo and redo", async () => {
    await act(() => board.addCard("tasks", "Existing card"));
    await act(() => board.captureInbox("Dropped card"));
    const card = board.inbox[0];
    await act(() => board.fileInbox(card.id, [], "tasks", 0));
    expect(board.root!.columns[0].cards.map((item) => item.title)).toEqual(["Dropped card", "Existing card"]);
    expect(board.inbox).toEqual([]);
    await act(() => board.undo());
    expect(board.inbox).toEqual([card]);
    expect(board.root!.columns[0].cards.map((item) => item.title)).toEqual(["Existing card"]);
    await act(() => board.redo());
    expect(board.inbox).toEqual([]);
    expect(board.root!.columns[0].cards[0].id).toBe(card.id);
  });
  it("files an Agenda drop with its date and order in one undo step", async () => {
    await act(() => board.captureInbox("Plan this"));
    const card = board.inbox[0];
    await act(() => board.fileInbox(card.id, [], "tasks", undefined, undefined, { dueAt: "2020-01-01", lane: "today", index: 0 }));
    expect(board.root!.columns[0].cards[0]).toMatchObject({ id: card.id, dueAt: "2020-01-01", rank: 0 });
    expect(board.inbox).toEqual([]);
    await act(() => board.undo());
    expect(board.inbox).toEqual([card]);
    expect(board.root!.columns[0].cards).toEqual([]);
    await act(() => board.redo());
    expect(board.root!.columns[0].cards[0]).toMatchObject({ id: card.id, dueAt: "2020-01-01", rank: 0 });
  });
  it("saves a board-to-Inbox move and restores the source in one undo step", async () => {
    await act(() => board.addCard("tasks", "Return to Inbox"));
    const id = board.root!.columns[0].cards[0].id;
    await act(() => board.updateCard("tasks", id, { description: "Details", dueAt: "2026-10-22", board: { columns: [{ id: "children", cards: [{ id: "child", title: "Child", board: { columns: [] } }] }] } as unknown as Board }));
    const original = structuredClone(board.root!.columns[0].cards[0]);
    await act(() => { expect(board.moveToInbox([], "missing", id, 0)).toBe(false); });
    expect(board.inbox).toEqual([]);
    await act(() => { expect(board.moveToInbox([], "tasks", id, 0)).toBe(true); });
    expect(board.inbox[0]).toMatchObject(original);
    expect(board.root!.columns[0].cards).toEqual([]);
    expect(board.trash).toEqual([]);
    await act(async () => vi.advanceTimersByTimeAsync(301));
    const saved = JSON.parse(firestore.setDoc.mock.calls.at(-1)![1].boardJson);
    expect(saved.inbox[0]).toMatchObject(original);
    expect(saved.columns[0].cards).toEqual([]);
    await act(() => board.undo());
    expect(board.inbox).toEqual([]);
    expect(board.root!.columns[0].cards).toEqual([original]);
    await act(() => board.redo());
    expect(board.inbox[0]).toMatchObject(original);
    expect(board.root!.columns[0].cards).toEqual([]);
  });
  it("puts a deleted note in trash and restores it to Inbox, preserving content", async () => {
    await act(() => board.captureInbox("A thought"));
    const original = board.inbox[0];
    await act(() => board.renameInbox(original.id, "Edited thought"));
    await act(() => board.deleteInbox(original.id));
    expect(board.inbox).toEqual([]);
    expect(board.trash[0]).toMatchObject({ source: "inbox", card: { id: original.id, title: "Edited thought" } });
    await act(() => board.restoreFromTrash(board.trash[0].id));
    expect(board.trash).toEqual([]);
    expect(board.inbox[0]).toEqual({ ...original, title: "Edited thought" });
    expect(board.root!.columns[0].cards).toEqual([]);
  });
});
