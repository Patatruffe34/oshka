import { describe, expect, it } from "vitest";
import { makeCard, makeCol, resolveBoardAtPath } from "../board-utils";
import { nestCard } from "../card-nesting";
import { INBOX_DROP_ID } from "../inbox";
import type { RootBoard } from "../types";

function fixture() {
  const child = makeCard("Child"), a = makeCard("A"), b = makeCard("B");
  a.board.columns = [{ ...makeCol("Inside A"), cards: [child] }];
  const source = { ...makeCol("Tasks"), cards: [a, b] };
  const root: RootBoard = { columns: [source], inbox: [] };
  const from = { path: [], colId: source.id, cardId: a.id };
  const path = [{ colId: source.id, cardId: b.id }];
  const todo = makeCol("Todo");
  return { root, a, b, child, source, from, path, todo };
}

describe("nestCard", () => {
  it("creates staged columns and moves the whole subtree without mutating inputs", () => {
    const { root, a, b, from, path, todo } = fixture();
    const before = structuredClone(root);
    const columns = [todo, makeCol("Later")];
    const next = nestCard(root, from, { path, colId: todo.id, initialColumns: columns })!;
    expect(root).toEqual(before);
    expect(next.columns[0].cards.map((card) => card.id)).toEqual([b.id]);
    expect(resolveBoardAtPath(next, path)!.columns[0].cards).toEqual([a]);
    expect(resolveBoardAtPath(next, path)!.columns).toHaveLength(2);
    expect(columns[0].cards).toEqual([]);
  });

  it("appends to the chosen existing column and preserves the parent's done state", () => {
    const { root, a, b, from, path, todo } = fixture();
    const existing = makeCard("Already here");
    b.done = true;
    b.board.columns = [{ ...todo, cards: [existing] }, makeCol("Other")];
    const next = nestCard(root, from, { path, colId: todo.id })!;
    expect(resolveBoardAtPath(next, path)!.columns[0].cards).toEqual([existing, a]);
    expect(next.columns[0].cards[0].done).toBe(true);
    expect(resolveBoardAtPath(next, path)!.columns[1].cards).toEqual([]);
  });

  it("files an Inbox card with its contents into a newly prepared board", () => {
    const { root, a, from, path, todo } = fixture();
    root.columns[0].cards.shift();
    root.inbox = [a];
    const next = nestCard(root, { ...from, colId: INBOX_DROP_ID }, { path, colId: todo.id, initialColumns: [todo] })!;
    expect(next.inbox).toEqual([]);
    expect(resolveBoardAtPath(next, path)!.columns[0].cards).toEqual([a]);
    expect(root.inbox).toEqual([a]);
  });

  it("refuses moves into itself or a descendant, without detaching the branch", () => {
    const { root, a, child, from, todo } = fixture();
    const intoA = [{ colId: from.colId, cardId: a.id }];
    for (const path of [intoA, [...intoA, { colId: a.board.columns[0].id, cardId: child.id }]]) {
      expect(nestCard(root, from, { path, colId: todo.id, initialColumns: [todo] })).toBeNull();
    }
    expect(root.columns[0].cards).toHaveLength(2);
  });

  it.each(["source", "target", "column", "archived-source", "archived-target", "setup-conflict"])("refuses a stale or invalid %s without changing the tree", (kind) => {
    const { root, a, b, from, path, todo } = fixture();
    if (kind === "source") from.cardId = "gone";
    if (kind === "target") path[0].cardId = "gone";
    if (kind === "archived-source") a.archived = true;
    if (kind === "archived-target") b.archived = true;
    if (kind === "setup-conflict") b.board.columns = [makeCol("Added elsewhere")];
    const before = structuredClone(root);
    expect(nestCard(root, from, { path, colId: kind === "column" ? "gone" : todo.id, initialColumns: [todo] })).toBeNull();
    expect(root).toEqual(before);
  });

  it.each([false, true])("respects doneOnDrop=%s in the selected column", (doneOnDrop) => {
    const { root, from, path, todo } = fixture();
    todo.emoji = "✅";
    const next = nestCard(root, from, { path, colId: todo.id, initialColumns: [todo] }, doneOnDrop)!;
    const moved = resolveBoardAtPath(next, path)!.columns[0].cards[0];
    expect(moved.done).toBe(doneOnDrop);
    expect(Boolean(moved.doneAt)).toBe(doneOnDrop);
  });

  it("rolls a repeating board card forward when dropped in a done column", () => {
    const { root, a, from, path, todo } = fixture();
    a.dueAt = "2099-01-01";
    a.repeat = { every: 1, unit: "week" };
    todo.emoji = "✅";
    const next = nestCard(root, from, { path, colId: todo.id, initialColumns: [todo] }, true)!;
    const moved = resolveBoardAtPath(next, path)!.columns[0].cards[0];
    expect(moved.done).toBe(false);
    expect(moved.dueAt).toBe("2099-01-08");
  });
});
