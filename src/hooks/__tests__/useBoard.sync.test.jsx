// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fs = vi.hoisted(() => ({ doc: vi.fn((_db, _col, id) => ({ id })), getDoc: vi.fn(), onSnapshot: vi.fn(), runTransaction: vi.fn() }));
vi.mock("firebase/firestore", () => fs);
vi.mock("../../lib/firebase", () => ({ db: {} }));
import { useBoard } from "../useBoard";
import { DEFAULT_SETTINGS } from "../../lib/settings";

let host, root, state, records, listeners;
const data = (title) => ({ boardJson: JSON.stringify({ columns: [{ id: "col", title, cards: [] }], inbox: [], labels: [] }), trashJson: "[]", favorites: [], settings: { ...DEFAULT_SETTINGS } });
const snap = (id) => ({ exists: () => records.has(id), data: () => records.get(id) });
function Harness({ uid }) { const board = useBoard(uid); useLayoutEffect(() => { state = board; }); return null; }
const render = (uid) => act(async () => root.render(<Harness uid={uid} />));
const advance = () => act(async () => vi.advanceTimersByTimeAsync(301));
function remoteCapture() {
  const d = records.get("A"), tree = JSON.parse(d.boardJson);
  tree.inbox.push({ id: "gmail", title: "server capture", board: { columns: [] } });
  records.set("A", { ...d, boardJson: JSON.stringify(tree) });
  listeners.get("A")(snap("A"));
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  records = new Map([["A", data("A private board")], ["B", data("B board")]]); listeners = new Map();
  fs.getDoc.mockImplementation(async (ref) => snap(ref.id));
  fs.onSnapshot.mockImplementation((ref, listener) => { listeners.set(ref.id, listener); return () => listeners.delete(ref.id); });
  fs.runTransaction.mockImplementation(async (_db, callback) => {
    const writes = [];
    const result = await callback({ get: async (ref) => snap(ref.id), set: (ref, value) => writes.push([ref.id, value]) });
    for (const [id, value] of writes) records.set(id, value);
    return result;
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await render("A"); vi.useFakeTimers();
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it("never restores A's history into B, even while B is loading", async () => {
  await act(() => state.captureInbox("A secret")); await advance();
  await render(null);
  let resolve;
  fs.getDoc.mockImplementation(() => new Promise((r) => { resolve = r; }));
  await render("B"); expect(state.root).toBeNull(); expect(state.canUndo).toBe(false);
  await act(async () => resolve(snap("B")));
  await act(() => state.undo()); await advance();
  expect(state.root.columns[0].title).toBe("B board");
  expect(JSON.parse(records.get("B").boardJson).inbox).toEqual([]);
});
it("ignores a read that completes after its account has signed out", async () => {
  await render(null); let resolve;
  fs.getDoc.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  await render("A"); await render("B");
  await act(async () => resolve(snap("A")));
  expect(state.root.columns[0].title).toBe("B board");
});
it("keeps a remote capture arriving during the local debounce", async () => {
  await act(() => state.captureInbox("local"));
  await act(remoteCapture); await advance();
  expect(JSON.parse(records.get("A").boardJson).inbox.map((c) => c.title).sort()).toEqual(["local", "server capture"]);
  expect(state.inbox).toHaveLength(2);
});
it("retains failed writes across reload and retries against current server data", async () => {
  const write = fs.runTransaction.getMockImplementation();
  fs.runTransaction.mockRejectedValueOnce(new Error("network"));
  await act(() => state.captureInbox("draft")); await advance();
  expect(state.saveError).toBe("failed"); expect(state.saving).toBe(false);
  await act(remoteCapture); expect(state.inbox.map((c) => c.title)).toEqual(["draft"]);
  await render(null); fs.runTransaction.mockImplementation(write); await render("A");
  expect(state.inbox.map((c) => c.title)).toEqual(["draft"]);
  await advance(); expect(state.saveError).toBeNull();
  expect(JSON.parse(records.get("A").boardJson).inbox).toHaveLength(2);
  expect(Object.keys(localStorage).filter((key) => key.startsWith("oshka_draft"))).toEqual([]);
});
it("persists offline edits and merges on reconnection", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(() => state.captureInbox("offline draft")); await advance();
  expect(state.saveError).toBe("offline"); expect(fs.runTransaction).not.toHaveBeenCalled();
  await act(remoteCapture); online.mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(state.inbox).toHaveLength(2); expect(state.saveError).toBeNull();
});
it("keeps edits made while a transaction is awaiting its commit", async () => {
  const write = fs.runTransaction.getMockImplementation(); let release;
  fs.runTransaction.mockImplementationOnce(async (...args) => { const result = await write(...args); await new Promise((r) => { release = r; }); return result; });
  await act(() => state.captureInbox("first")); await advance();
  await act(() => state.captureInbox("second"));
  await act(async () => release()); await advance();
  expect(JSON.parse(records.get("A").boardJson).inbox.map((c) => c.title)).toEqual(["second", "first"]);
});
it("receives settings-only changes, and does not write after unmount", async () => {
  records.get("A").settings.confetti = false;
  await act(() => listeners.get("A")(snap("A")));
  expect(state.settings.confetti).toBe(false);
  await act(() => state.captureInbox("pending")); await render(null); await advance();
  expect(fs.runTransaction).not.toHaveBeenCalled();
  expect(JSON.parse(records.get("A").boardJson).inbox).toEqual([]);
});
it("refuses a conflict without overwriting either draft or server", async () => {
  await act(() => state.renameCol("col", "local name"));
  const remote = JSON.parse(records.get("A").boardJson); remote.columns[0].title = "remote name";
  records.get("A").boardJson = JSON.stringify(remote);
  await advance(); expect(state.saveError).toBe("conflict");
  expect(state.root.columns[0].title).toBe("local name");
  expect(JSON.parse(records.get("A").boardJson).columns[0].title).toBe("remote name");
});
it("receives a server capture after commit but before the transaction promise settles", async () => {
  const write = fs.runTransaction.getMockImplementation();
  fs.runTransaction.mockImplementationOnce(async (...args) => {
    const result = await write(...args);
    remoteCapture();
    return result;
  });
  await act(() => state.captureInbox("local")); await advance();
  expect(state.inbox.map((c) => c.title).sort()).toEqual(["local", "server capture"]);
});
it("warns that an offline draft was not persisted when storage is full", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} });
  await act(() => state.captureInbox("only in memory")); await advance();
  expect(state.saveError).toBe("storage"); expect(state.inbox[0].title).toBe("only in memory");
});
it("keeps a new account draft when another tab creates the document first", async () => {
  await render("new"); await act(() => state.captureInbox("typed before creation"));
  const existing = data("created elsewhere"); records.set("new", existing);
  await advance();
  expect(state.root.columns[0].title).toBe("created elsewhere");
  expect(state.inbox[0].title).toBe("typed before creation");
});
it("can explicitly discard a conflict and use the current saved version", async () => {
  await act(() => state.renameCol("col", "local"));
  const remote = JSON.parse(records.get("A").boardJson); remote.columns[0].title = "remote";
  records.get("A").boardJson = JSON.stringify(remote);
  await advance(); expect(state.saveError).toBe("conflict");
  await act(async () => state.reloadSaved());
  expect(state.saveError).toBeNull(); expect(state.root.columns[0].title).toBe("remote");
  expect(state.canUndo).toBe(false);
});

it("can retry a failed initial board load", async () => {
  await render(null);
  fs.getDoc.mockRejectedValueOnce(new Error("network"));
  await render("B"); expect(state.root).toBeNull(); expect(state.saveError).toBe("failed");
  await act(async () => state.retrySave());
  expect(state.root.columns[0].title).toBe("B board"); expect(state.saveError).toBeNull();
});
