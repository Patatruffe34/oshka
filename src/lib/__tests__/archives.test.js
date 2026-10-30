import { describe, expect, it } from "vitest";
import { archiveSummary, purgeArchivedCards, completedCardCount, archiveCompletedCards } from "../archives";

const board = (...cards) => ({ columns: [{ id: "col", title: "À faire", emoji: "📝", cards }], labels: [{ id: "label" }] });
const card = (id, archived = false, children = []) => ({ id, archived, board: board(...children) });

describe("permanent archive cleanup", () => {
  const tree = () => board(
    card("keep", false, [card("nested-archive", true, [card("inside-archive")]), card("nested-keep")]),
    card("archived-parent", true, [card("live-child"), card("archived-child", true)]),
    { ...card("done"), done: true },
  );

  it("counts archived cards and all their contents without double counting", () => {
    expect(archiveSummary(tree())).toEqual({ archived: 3, total: 5 });
  });

  it("removes archived branches at every depth, keeping other cards and metadata", () => {
    const source = tree();
    const before = JSON.stringify(source);
    const cleaned = purgeArchivedCards(source);
    expect(cleaned.columns[0].cards.map((c) => c.id)).toEqual(["keep", "done"]);
    expect(cleaned.columns[0].cards[0].board.columns[0].cards.map((c) => c.id)).toEqual(["nested-keep"]);
    expect(cleaned.columns[0].emoji).toBe("📝");
    expect(cleaned.labels).toEqual(source.labels);
    expect(archiveSummary(cleaned)).toEqual({ archived: 0, total: 0 });
    expect(JSON.stringify(source)).toBe(before);
    expect(JSON.stringify(cleaned)).not.toContain("live-child");
  });

  it("keeps the original tree when nothing is archived", () => {
    const source = board(card("keep"));
    expect(purgeArchivedCards(source)).toBe(source);
    expect(archiveSummary(null)).toEqual({ archived: 0, total: 0 });
    expect(purgeArchivedCards(null)).toBeNull();
  });
});

describe("bulk archive of completed cards", () => {
  it("archives completed cards at every depth without modifying the original", () => {
    const source = board(
      { ...card("parent", false, [card("unfinished"), { ...card("finished-child"), done: true }]), done: true },
      card("live", false, [{ ...card("deep-done"), done: true }]),
      { ...card("already-archived", true), done: true },
    );
    const before = JSON.stringify(source);
    expect(completedCardCount(source)).toBe(3);
    const next = archiveCompletedCards(source);
    expect(next.columns[0].cards).toHaveLength(3);
    expect(next.columns[0].cards[0].archived).toBe(true);
    expect(next.columns[0].cards[0].board.columns[0].cards[0].archived).toBe(false);
    expect(next.columns[0].cards[0].board.columns[0].cards[1].archived).toBe(true);
    expect(next.columns[0].cards[1].archived).toBe(false);
    expect(next.columns[0].cards[1].board.columns[0].cards[0].archived).toBe(true);
    expect(next.labels).toBe(source.labels);
    expect(completedCardCount(next)).toBe(0);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("does not infer completion from a column emoji or an archived parent", () => {
    const source = board(card("unfinished"), card("archived", true, [card("live-child")]));
    source.columns[0].emoji = "✅";
    expect(completedCardCount(source)).toBe(0);
    expect(archiveCompletedCards(source)).toBe(source);
  });

  it("preserves descriptions, comments and checklists and is idempotent", () => {
    const item = { ...card("done"), done: true, description: "Keep", comments: [{ text: "Comment" }], checklists: [{ title: "List" }] };
    const next = archiveCompletedCards(board(item));
    expect(next.columns[0].cards[0]).toEqual({ ...item, archived: true });
    expect(archiveCompletedCards(next)).toBe(next);
    expect(archiveCompletedCards(null)).toBeNull();
    expect(completedCardCount(null)).toBe(0);
  });
});
