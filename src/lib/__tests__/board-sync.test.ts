import { describe, it, expect } from "vitest";
import { mergeBoardState, BoardConflict, encodeBoard } from "../board-sync";
import type { BoardState, Card, Column, RootBoard } from "../types";

// Only the fields the merge compares: the casts stand in for the rest.
type State = BoardState & { root: RootBoard & { inbox: Card[] } };
const card = (id: string, title = id) => ({ id, title, board: { columns: [] } }) as unknown as Card;
const state = () => ({ root: { columns: [{ id: "col", cards: [card("a"), card("b")] }], inbox: [] }, trash: [], favorites: [], settings: {} }) as unknown as State;
describe("concurrent board writes", () => {
  it("preserves a server Inbox capture alongside a local rename", () => {
    const base = state(), local = state(), remote = state();
    local.root.columns[0].cards[0].title = "typed";
    remote.root.inbox.push(card("gmail"));
    const result = mergeBoardState(base, local, remote);
    expect(result.root.inbox?.[0].id).toBe("gmail");
    expect(result.root.columns[0].cards[0].title).toBe("typed");
  });
  it("merges different fields of the same card and simultaneous captures", () => {
    const base = state(), local = state(), remote = state();
    local.root.columns[0].cards[0].title = "typed";
    remote.root.columns[0].cards[0].description = "assistant";
    local.root.inbox.push(card("local")); remote.root.inbox.push(card("remote"));
    const result = mergeBoardState(base, local, remote);
    expect(result.root.columns[0].cards[0]).toMatchObject({ title: "typed", description: "assistant" });
    expect(result.root.inbox?.map((c) => c.id).sort()).toEqual(["local", "remote"]);
  });
  it("refuses competing edits and delete/edit conflicts", () => {
    const base = state(), local = state(), remote = state();
    local.root.columns[0].cards[0].title = "one"; remote.root.columns[0].cards[0].title = "two";
    expect(() => mergeBoardState(base, local, remote)).toThrow(BoardConflict);
    local.root.columns[0].cards.shift();
    expect(() => mergeBoardState(base, local, remote)).toThrow(BoardConflict);
  });
  it("refuses competing moves that would duplicate a card", () => {
    const base = state(), local = state(), remote = state();
    local.root.inbox.push(local.root.columns[0].cards.shift()!);
    remote.root.columns.push({ id: "other", cards: [remote.root.columns[0].cards.shift()!] } as Column);
    expect(() => mergeBoardState(base, local, remote)).toThrow(BoardConflict);
  });
  it("preserves remote settings and rejects oversized documents", () => {
    const base = state(), local = state(), remote = state();
    local.root.inbox.push(card("local")); remote.settings.confetti = false;
    expect(mergeBoardState(base, local, remote).settings.confetti).toBe(false);
    local.root.inbox.push(card("large", "x".repeat(950_000)));
    expect(() => encodeBoard(local)).toThrow("too-large");
  });
});
