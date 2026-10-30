import { describe, expect, it } from "vitest";
import { captureInboxCard, editInboxCard, fileInboxCard, inboxCards, removeInboxCard, inboxPlanDrop, moveCardIntoInbox, reorderInboxCards } from "../inbox";
import { makeCard, setAtPath } from "../board-utils";

const fixture = () => ({ labels: [{ id: "label" }], columns: [
  { id: "root-tasks", title: "Tasks", cards: [{ ...makeCard("Project"), id: "project", board: {
    columns: [{ id: "work", cards: [] }, { id: "done", emoji: "✅", cards: [] }],
  } }] },
] });
const path = [{ colId: "root-tasks", cardId: "project" }];
const note = () => ({ ...makeCard("Remember this"), capturedAt: "2026-10-21T09:00:00Z" });

describe("Inbox", () => {
  it("reads old accounts as an empty Inbox without migrating their boards", () => {
    expect(inboxCards(fixture())).toEqual([]);
    expect(inboxCards(null)).toEqual([]);
    expect(captureInboxCard(null, note())).toBeNull();
  });
  it("captures newest first without touching the board hierarchy", () => {
    const board = fixture();
    const first = note();
    const second = note();
    const next = captureInboxCard(captureInboxCard(board, first), second);
    expect(next.inbox).toEqual([second, first]);
    expect(next.columns).toBe(board.columns);
    expect(board.inbox).toBeUndefined();
  });
  it("ignores whitespace and edits only the selected note", () => {
    const original = note();
    const board = captureInboxCard(fixture(), original);
    expect(captureInboxCard(board, { ...note(), title: "  " })).toBe(board);
    expect(editInboxCard(board, original.id, " ")).toBe(board);
    expect(editInboxCard(board, "missing", "new")).toBe(board);
    const next = editInboxCard(board, original.id, "  Better thought  ");
    expect(next.inbox[0]).toEqual({ ...original, title: "Better thought" });
    expect(original.title).toBe("Remember this");
  });
  it("moves a note atomically to a nested board, preserving identity and contents", () => {
    const card = { ...note(), description: "Details", comments: [{ id: "comment", text: "Context" }] };
    const board = captureInboxCard(fixture(), card);
    const next = fileInboxCard(board, card.id, path, "work");
    expect(next.inbox).toEqual([]);
    expect(next.columns[0].cards[0].board.columns[0].cards).toEqual([card]);
    expect(next.labels).toEqual(board.labels);
    expect(board.inbox).toEqual([card]);
    expect(board.columns[0].cards[0].board.columns[0].cards).toEqual([]);
    expect(fileInboxCard(next, card.id, path, "work")).toBeNull();
  });
  it("can file directly at the root", () => {
    const card = note();
    const next = fileInboxCard(captureInboxCard(fixture(), card), card.id, [], "root-tasks");
    expect(next.columns[0].cards.at(-1)).toEqual(card);
    expect(next.inbox).toHaveLength(0);
  });
  it.each([[path, "missing"], [[{ colId: "root-tasks", cardId: "deleted" }], "root-tasks"], [[{ colId: "deleted", cardId: "project" }], "work"]])(
    "keeps the note when its destination has disappeared (%j, %s)", (target, colId) => {
      const card = note();
      const board = captureInboxCard(fixture(), card);
      expect(fileInboxCard(board, card.id, target, colId)).toBeNull();
      expect(board.inbox).toEqual([card]);
    }
  );
  it("honours the account's done-on-drop preference", () => {
    const card = note();
    const board = captureInboxCard(fixture(), card);
    const next = fileInboxCard(board, card.id, path, "done", { doneOnDrop: true, stamp: "now" });
    expect(next.columns[0].cards[0].board.columns[1].cards[0]).toMatchObject({ id: card.id, done: true, doneAt: "now" });
    const plain = fileInboxCard(board, card.id, path, "done", { doneOnDrop: false });
    expect(plain.columns[0].cards[0].board.columns[1].cards[0].done).toBe(false);
  });
  it("inserts at the dropped position among visible cards, preserving archives and filtered cards", () => {
    const card = note();
    const archived = { ...makeCard("Archived"), archived: true };
    const hidden = { ...makeCard("Hidden"), labels: ["a"] };
    const first = { ...makeCard("First"), labels: ["a", "b"] };
    const last = { ...makeCard("Last"), labels: ["a", "b"] };
    const board = { columns: [{ id: "tasks", cards: [archived, first, hidden, last] }], inbox: [card] };
    const next = fileInboxCard(board, card.id, [], "tasks", { index: 1, labelFilter: ["a", "b"] });
    expect(next.columns[0].cards.map((item) => item.title)).toEqual(["Archived", "First", "Hidden", "Remember this", "Last"]);
    expect(next.inbox).toEqual([]);
    expect(board.inbox).toEqual([card]);
  });
  it.each([0, 1, 2])("inserts at visible position %i", (index) => {
    const card = note();
    const board = { columns: [{ id: "tasks", cards: [makeCard("First"), makeCard("Last")] }], inbox: [card] };
    const next = fileInboxCard(board, card.id, [], "tasks", { index });
    expect(next.columns[0].cards[index].id).toBe(card.id);
  });
  it("keeps the dropped date and Today order in the same atomic filing", () => {
    const card = note();
    const board = { columns: [{ id: "tasks", cards: [{ ...makeCard("First"), dueAt: "2020-01-01" }, { ...makeCard("Last"), dueAt: "2020-01-01" }] }], inbox: [card] };
    const next = fileInboxCard(board, card.id, [], "tasks", { dueAt: "2020-01-01", lane: "today", laneIndex: 1 });
    const [first, last, filed] = next.columns[0].cards;
    expect(filed.dueAt).toBe("2020-01-01");
    expect([first.rank, filed.rank, last.rank]).toEqual([0, 1, 2]);
    expect(board.inbox[0].dueAt).toBeNull();
    expect(board.columns[0].cards[0].rank).toBeUndefined();
  });
  it("turns an Inbox drop in the Agenda into a pending date without changing the account", () => {
    const card = note();
    const board = captureInboxCard(fixture(), card);
    const result = { source: { droppableId: "oshka:inbox", index: 0 }, destination: { droppableId: "tomorrow", index: 1 }, draggableId: card.id, reason: "DROP" };
    expect(inboxPlanDrop(board, result)).toMatchObject({ cardId: card.id, lane: "tomorrow", index: 1, dueAt: expect.any(String) });
    expect(board.inbox).toEqual([card]);
    expect(inboxPlanDrop(board, { ...result, reason: "CANCEL" })).toBeNull();
    expect(inboxPlanDrop(board, { ...result, destination: null })).toBeNull();
    expect(inboxPlanDrop(board, { ...result, destination: { droppableId: "stalled", index: 0 } })).toBeNull();
    expect(inboxPlanDrop(board, { ...result, draggableId: "deleted" })).toBeNull();
  });
  it("moves a whole board card into an empty Inbox without losing its subtree or metadata", () => {
    const board = fixture();
    const project = board.columns[0].cards[0];
    Object.assign(project, { description: "Keep this", dueAt: "2026-10-22", labels: ["label"], comments: [{ id: "comment", text: "Context" }], checklists: [{ id: "checklist", title: "Checklist", items: [] }], repeat: { every: 1, unit: "week" }, done: true, doneAt: "before" });
    const next = moveCardIntoInbox(board, [], "root-tasks", project.id, { stamp: "now" });
    expect(next.columns[0].cards).toEqual([]);
    expect(next.inbox).toEqual([{ ...project, capturedAt: "now" }]);
    expect(board.inbox).toBeUndefined();
    expect(board.columns[0].cards).toEqual([project]);
    expect(next.labels).toEqual(board.labels);
    const filed = fileInboxCard(next, project.id, [], "root-tasks");
    expect(filed.columns[0].cards[0]).toEqual({ ...project, capturedAt: "now" });
  });
  it("moves by identity from a nested column into the dropped Inbox position", () => {
    const board = fixture();
    const first = note(), moved = note();
    board.inbox = [first];
    board.columns[0].cards[0].board.columns[0].cards = [{ ...note(), archived: true }, moved];
    const next = moveCardIntoInbox(board, path, "work", moved.id, { index: 1, stamp: "later" });
    expect(next.inbox).toEqual([first, moved]);
    expect(next.columns[0].cards[0].board.columns[0].cards).toHaveLength(1);
    expect(board.columns[0].cards[0].board.columns[0].cards).toHaveLength(2);
  });
  it.each([
    [[], "missing", "project"],
    [[], "root-tasks", "missing"],
    [[{ colId: "root-tasks", cardId: "deleted" }], "work", "project"],
  ])("refuses a stale source without touching its board or Inbox", (sourcePath, colId, id) => {
    const board = fixture();
    const before = JSON.stringify(board);
    expect(moveCardIntoInbox(board, sourcePath, colId, id)).toBeNull();
    expect(JSON.stringify(board)).toBe(before);
  });
  it("refuses archived cards and duplicate identities", () => {
    const board = fixture();
    const card = board.columns[0].cards[0];
    card.archived = true;
    expect(moveCardIntoInbox(board, [], "root-tasks", card.id)).toBeNull();
    card.archived = false;
    board.inbox = [card];
    expect(moveCardIntoInbox(board, [], "root-tasks", card.id)).toBeNull();
    expect(moveCardIntoInbox(null, [], "tasks", "id")).toBeNull();
  });
  it("reorders Inbox cards without changing their contents", () => {
    const board = { columns: [], inbox: [note(), note(), note()] };
    const next = reorderInboxCards(board, 0, 2);
    expect(next.inbox).toEqual([board.inbox[1], board.inbox[2], board.inbox[0]]);
    expect(reorderInboxCards(board, 1, 1)).toBe(board);
    expect(reorderInboxCards(board, -1, 2)).toBe(board);
    expect(reorderInboxCards(board, 1, 3)).toBe(board);
  });
  it("survives serialization and unrelated board mutations", () => {
    const card = note();
    const board = JSON.parse(JSON.stringify(captureInboxCard(fixture(), card)));
    const next = setAtPath(board, path, (nested) => ({ ...nested, columns: [] }));
    expect(inboxCards(next)).toEqual([card]);
  });
  it("removes only the requested note", () => {
    const card = note();
    const other = note();
    const board = captureInboxCard(captureInboxCard(fixture(), card), other);
    expect(removeInboxCard(board, "missing")).toBe(board);
    expect(removeInboxCard(board, card.id).inbox).toEqual([other]);
    expect(board.inbox).toEqual([other, card]);
  });
});
