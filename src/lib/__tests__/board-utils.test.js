import { describe, it, expect } from "vitest";
import {
  uid,
  makeCard,
  makeCol,
  deepClone,
  getBoardAtPath,
  resolveBoardAtPath,
  setAtPath,
  resolvePathFromIds,
  visibleCards,
  countSubItems,
  subBoardProgress,
  moveCardBetweenColumns,
  checklistProgress,
  dueState,
  makeDefaultLabels,
  cardLabels,
  boardLabels,
  stripLabelFromTree,
  moveCardAcrossBoards,
  moveColumnAcrossBoards,
  collectCardIds,
  listBoardDestinations,
  outlineRows,
  allBranchKeys,
  duplicateCard,
  sortColumnCards,
  EMPTY_BOARD,
  subBoardStats,
  isDoneColumn,
  hasDoneColumn,
  markCardDone,
  nextDueInside,
  fileUnderDone,
  applyRanks,
  markBranchDone,
} from "../board-utils";

/** Board with fixed ids so tests can address cards directly */
const fixture = () => ({
  columns: [
    {
      id: "colA",
      title: "A faire",
      emoji: "",
      color: "",
      cards: [
        { ...makeCard("a1"), id: "a1" },
        { ...makeCard("a2"), id: "a2", archived: true },
        { ...makeCard("a3"), id: "a3" },
      ],
    },
    {
      id: "colB",
      title: "En cours",
      emoji: "",
      color: "",
      cards: [
        {
          ...makeCard("b1"),
          id: "b1",
          board: {
            columns: [
              {
                id: "subCol",
                title: "Sous-colonne",
                emoji: "",
                color: "",
                cards: [
                  { ...makeCard("s1"), id: "s1", done: true },
                  { ...makeCard("s2"), id: "s2" },
                  { ...makeCard("s3"), id: "s3", archived: true, done: true },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
});

const ids = (col) => col.cards.map((c) => c.id);

describe("uid", () => {
  it("uses only the expected alphabet and length", () => {
    const id = uid();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-z]{12}$/);
  });

  it("does not collide across many draws", () => {
    // Ids double as DnD draggableIds and URL segments; a collision breaks both.
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(uid());
    expect(seen.size).toBe(20000);
  });
});

describe("makeCard / makeCol", () => {
  it("gives a new card the fields the UI reads", () => {
    const card = makeCard("Titre");
    expect(card).toMatchObject({
      title: "Titre",
      description: "",
      comments: [],
      done: false,
      doneAt: null,
      archived: false,
      board: { columns: [] },
    });
  });

  it("gives a new column its emoji and color slots", () => {
    expect(makeCol("Col")).toMatchObject({ title: "Col", emoji: "", color: "", cards: [] });
  });
});

describe("getBoardAtPath", () => {
  it("walks down to a nested board", () => {
    const board = getBoardAtPath(fixture(), [{ colId: "colB", cardId: "b1" }]);
    expect(board.columns[0].id).toBe("subCol");
  });

  it("returns the root board for an empty path", () => {
    const root = fixture();
    expect(getBoardAtPath(root, [])).toBe(root);
  });

  it("falls back to the deepest board still reachable when the path went stale", () => {
    const root = fixture();
    const board = getBoardAtPath(root, [
      { colId: "colB", cardId: "b1" },
      { colId: "subCol", cardId: "disparu" },
    ]);
    // Stops at b1's board rather than throwing or returning nothing
    expect(board.columns[0].id).toBe("subCol");
  });
});

describe("resolveBoardAtPath", () => {
  it("returns null instead of guessing when the path is stale", () => {
    expect(resolveBoardAtPath(fixture(), [{ colId: "colZ", cardId: "b1" }])).toBeNull();
    expect(resolveBoardAtPath(fixture(), [{ colId: "colB", cardId: "nope" }])).toBeNull();
  });

  it("resolves a valid path", () => {
    const board = resolveBoardAtPath(fixture(), [{ colId: "colB", cardId: "b1" }]);
    expect(board.columns[0].id).toBe("subCol");
  });
});

describe("markBranchDone", () => {
  /* Deux niveaux, une carte deja faite, une archivee, et une colonne ✅ */
  const branche = () => ({
    columns: [
      {
        ...makeCol("a faire"),
        id: "todo",
        cards: [
          { ...makeCard("x"), id: "x", board: {
            columns: [
              { ...makeCol("dedans"), id: "dedans", cards: [
                { ...makeCard("x1"), id: "x1" },
              ] },
            ],
          } },
          { ...makeCard("y"), id: "y", done: true, doneAt: "2020-01-01T00:00:00.000Z" },
          { ...makeCard("z"), id: "z", archived: true },
        ],
      },
      { ...makeCol("fini"), id: "fini", emoji: "\u2705", cards: [] },
    ],
  });
  const card = (b, colId, id) =>
    b.columns.find((c) => c.id === colId).cards.find((c) => c.id === id);

  it("finishes every living card, at any depth, on one instant", () => {
    const b = branche();
    const n = markBranchDone(b, { stamp: "S" });
    expect(n).toBe(2); // x et x1: y est faite, z est archivee
    expect(card(b, "todo", "x").done).toBe(true);
    expect(card(b, "todo", "x").doneAt).toBe("S");
    const dedans = card(b, "todo", "x").board;
    expect(dedans.columns[0].cards[0].doneAt).toBe("S");
  });

  it("leaves archived cards where they are", () => {
    // Rangees, pas oubliees: les terminer reecrirait une histoire close
    const b = branche();
    markBranchDone(b, { stamp: "S" });
    expect(card(b, "todo", "z").done).toBe(false);
  });

  it("keeps the date of what was already done", () => {
    const b = branche();
    markBranchDone(b, { stamp: "S" });
    expect(card(b, "todo", "y").doneAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("files each finished card under ✅, at its own level", () => {
    const b = branche();
    const n = markBranchDone(b, { stamp: "S", file: true });
    expect(n).toBe(2);
    expect(b.columns.find((c) => c.id === "fini").cards.map((c) => c.id)).toEqual(["x"]);
    expect(b.columns.find((c) => c.id === "todo").cards.map((c) => c.id)).toEqual(["y", "z"]);
  });

  it("counts nothing on a branch with nothing left", () => {
    expect(markBranchDone({ columns: [] }, { stamp: "S" })).toBe(0);
    expect(markBranchDone(undefined, { stamp: "S" })).toBe(0);
  });
});

describe("applyRanks", () => {
  const entries = [
    { segments: [{ colId: "colB", cardId: "b1" }], colId: "subCol", cardId: "s2" },
    { segments: [], colId: "colA", cardId: "a3" },
    { segments: [], colId: "colA", cardId: "a1" },
  ];

  it("numbers cards living on different boards, in the order given", () => {
    // The whole point: the lane is one queue, its cards are not one board
    const next = applyRanks(fixture(), entries);
    const sub = next.columns[1].cards[0].board.columns[0].cards;
    expect(sub.find((c) => c.id === "s2").rank).toBe(0);
    expect(next.columns[0].cards.find((c) => c.id === "a3").rank).toBe(1);
    expect(next.columns[0].cards.find((c) => c.id === "a1").rank).toBe(2);
  });

  it("leaves the tree it was given untouched", () => {
    const root = fixture();
    applyRanks(root, entries);
    expect(root.columns[0].cards.find((c) => c.id === "a1").rank).toBeUndefined();
  });

  it("keeps ranking when one card of the lane has gone", () => {
    // A card can be moved or deleted on another device between the drop and
    // the write; the rest of the order must still land.
    const next = applyRanks(fixture(), [
      { segments: [], colId: "colA", cardId: "disparue" },
      { segments: [{ colId: "colB", cardId: "envolee" }], colId: "subCol", cardId: "s1" },
      { segments: [], colId: "colA", cardId: "a1" },
    ]);
    expect(next.columns[0].cards.find((c) => c.id === "a1").rank).toBe(2);
  });
});

describe("setAtPath", () => {
  it("updates the root board without mutating the original", () => {
    const root = fixture();
    const next = setAtPath(root, [], (b) => {
      b.columns.push(makeCol("Nouvelle"));
      return b;
    });
    expect(next.columns).toHaveLength(3);
    expect(root.columns).toHaveLength(2);
  });

  it("updates a nested board without mutating the original", () => {
    const root = fixture();
    const next = setAtPath(root, [{ colId: "colB", cardId: "b1" }], (b) => {
      b.columns[0].cards.push({ ...makeCard("s4"), id: "s4" });
      return b;
    });
    const before = root.columns[1].cards[0].board.columns[0].cards;
    const after = next.columns[1].cards[0].board.columns[0].cards;
    expect(after).toHaveLength(4);
    expect(before).toHaveLength(3);
  });

  it("returns the tree untouched when a column on the path disappeared", () => {
    // Regression: this used to throw on `col.cards` of undefined
    const root = fixture();
    let ran = false;
    const next = setAtPath(root, [{ colId: "colDisparue", cardId: "b1" }], (b) => {
      ran = true;
      return b;
    });
    expect(next).toBe(root);
    expect(ran).toBe(false);
  });

  it("returns the tree untouched when a card on the path disappeared", () => {
    const root = fixture();
    const next = setAtPath(root, [{ colId: "colB", cardId: "disparue" }], (b) => b);
    expect(next).toBe(root);
  });

  it("survives a stale segment in the middle of a deep path", () => {
    const root = fixture();
    const next = setAtPath(
      root,
      [{ colId: "colB", cardId: "b1" }, { colId: "subCol", cardId: "disparue" }],
      (b) => b
    );
    expect(next).toBe(root);
  });
});

describe("resolvePathFromIds", () => {
  it("resolves ids into a path carrying the card titles", () => {
    expect(resolvePathFromIds(fixture(), [{ colId: "colB", cardId: "b1" }])).toEqual([
      { colId: "colB", cardId: "b1", cardTitle: "b1" },
    ]);
  });

  it("truncates at the first segment that no longer exists", () => {
    const resolved = resolvePathFromIds(fixture(), [
      { colId: "colB", cardId: "b1" },
      { colId: "subCol", cardId: "disparue" },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].cardId).toBe("b1");
  });

  it("returns an empty path when nothing resolves", () => {
    expect(resolvePathFromIds(EMPTY_BOARD, [{ colId: "x", cardId: "y" }])).toEqual([]);
  });
});

describe("archived cards", () => {
  it("hides archived cards from the visible list", () => {
    expect(visibleCards(fixture().columns[0]).map((c) => c.id)).toEqual(["a1", "a3"]);
  });

  it("excludes archived cards from the sub-item count", () => {
    const b1 = fixture().columns[1].cards[0];
    expect(countSubItems(b1.board)).toBe(2); // s3 is archived
  });

  it("counts progress over visible cards only", () => {
    const b1 = fixture().columns[1].cards[0];
    // s1 done, s2 not, s3 done but archived
    expect(subBoardProgress(b1.board)).toEqual({ done: 1, total: 2 });
  });

  it("reports zero progress on an empty board", () => {
    expect(subBoardProgress(EMPTY_BOARD)).toEqual({ done: 0, total: 0 });
  });
});

describe("moveCardBetweenColumns", () => {
  it("reorders within a column using visible indices", () => {
    const board = fixture();
    // Visible order is [a1, a3]; move a3 to the front
    expect(moveCardBetweenColumns(board, "colA", "colA", 1, 0)).toBe(true);
    expect(visibleCards(board.columns[0]).map((c) => c.id)).toEqual(["a3", "a1"]);
  });

  it("keeps archived cards in the column when reordering around them", () => {
    const board = fixture();
    moveCardBetweenColumns(board, "colA", "colA", 1, 0);
    expect(ids(board.columns[0])).toContain("a2");
    expect(board.columns[0].cards).toHaveLength(3);
  });

  it("moves a card to another column at the requested slot", () => {
    const board = fixture();
    expect(moveCardBetweenColumns(board, "colA", "colB", 0, 0)).toBe(true);
    expect(ids(board.columns[1])).toEqual(["a1", "b1"]);
    expect(ids(board.columns[0])).toEqual(["a2", "a3"]);
  });

  it("appends when dropped past the last visible card", () => {
    const board = fixture();
    moveCardBetweenColumns(board, "colA", "colB", 0, 99);
    expect(ids(board.columns[1])).toEqual(["b1", "a1"]);
  });

  it("resolves the destination slot against real positions, not visible ones", () => {
    // colA is [a1, a2(archived), a3]; dropping b1 at visible index 1 must land
    // it just before a3 — after the archived card, not at raw index 1.
    const board = fixture();
    moveCardBetweenColumns(board, "colB", "colA", 0, 1);
    expect(ids(board.columns[0])).toEqual(["a1", "a2", "b1", "a3"]);
  });

  it("carries the whole subtree along with the card", () => {
    const board = fixture();
    moveCardBetweenColumns(board, "colB", "colA", 0, 0);
    const moved = board.columns[0].cards.find((c) => c.id === "b1");
    expect(moved.board.columns[0].cards).toHaveLength(3);
  });

  it("reports failure on an unknown column", () => {
    const board = fixture();
    expect(moveCardBetweenColumns(board, "colZ", "colA", 0, 0)).toBe(false);
    expect(ids(board.columns[0])).toEqual(["a1", "a2", "a3"]);
  });

  it("reports failure on an out-of-range source index", () => {
    const board = fixture();
    expect(moveCardBetweenColumns(board, "colA", "colB", 9, 0)).toBe(false);
    expect(ids(board.columns[1])).toEqual(["b1"]);
  });
});

describe("deepClone", () => {
  it("detaches nested boards from the original", () => {
    const root = fixture();
    const copy = deepClone(root);
    copy.columns[1].cards[0].board.columns[0].cards[0].title = "modifie";
    expect(root.columns[1].cards[0].board.columns[0].cards[0].title).toBe("s1");
  });
});

// ── Labels, due dates, checklists ──

describe("checklistProgress", () => {
  const withLists = (lists) => ({ ...makeCard("c"), checklists: lists });

  it("counts ticked items across every list on the card", () => {
    const card = withLists([
      { id: "l1", title: "A", items: [{ id: "i1", text: "x", done: true }, { id: "i2", text: "y", done: false }] },
      { id: "l2", title: "B", items: [{ id: "i3", text: "z", done: true }] },
    ]);
    expect(checklistProgress(card)).toEqual({ done: 2, total: 3 });
  });

  it("returns zero for a card with no checklists", () => {
    expect(checklistProgress(makeCard("c"))).toEqual({ done: 0, total: 0 });
  });

  it("tolerates a card saved before checklists existed", () => {
    const legacy = { id: "old", title: "old" };
    expect(checklistProgress(legacy)).toEqual({ done: 0, total: 0 });
  });

  it("ignores empty lists in the total", () => {
    expect(checklistProgress(withLists([{ id: "l", title: "vide", items: [] }])))
      .toEqual({ done: 0, total: 0 });
  });
});

describe("dueState", () => {
  const now = new Date(2026, 7, 27, 14, 0); // 27 aug 2026, mid-afternoon
  const at = (y, m, d, h = 9) => new Date(y, m, d, h).toISOString();

  it("returns null without a due date", () => {
    expect(dueState(null, false, now)).toBeNull();
  });

  it("flags a past date as overdue", () => {
    expect(dueState(at(2026, 7, 26), false, now)).toBe("overdue");
  });

  it("treats a done card as settled, never overdue", () => {
    // Finishing the work settles the deadline; nagging afterwards is noise.
    expect(dueState(at(2026, 7, 20), true, now)).toBe("done");
  });

  it("recognises today regardless of the hour", () => {
    // Earlier today is still "today", not overdue — the deadline is the day.
    expect(dueState(at(2026, 7, 27, 8), false, now)).toBe("today");
    expect(dueState(at(2026, 7, 27, 23), false, now)).toBe("today");
  });

  it("recognises tomorrow", () => {
    expect(dueState(at(2026, 7, 28), false, now)).toBe("tomorrow");
  });

  it("groups the rest of the week as soon", () => {
    expect(dueState(at(2026, 8, 1), false, now)).toBe("soon");
    expect(dueState(at(2026, 8, 3), false, now)).toBe("soon"); // +7 days
  });

  it("calls anything beyond a week upcoming", () => {
    expect(dueState(at(2026, 8, 4), false, now)).toBe("upcoming"); // +8 days
  });

  it("returns null on an unparseable date", () => {
    expect(dueState("pas-une-date", false, now)).toBeNull();
  });

  it("crosses month and year boundaries correctly", () => {
    const newYearsEve = new Date(2026, 11, 31, 10);
    expect(dueState(at(2027, 0, 1), false, newYearsEve)).toBe("tomorrow");
    expect(dueState(at(2026, 11, 30), false, newYearsEve)).toBe("overdue");
  });
});

describe("label helpers", () => {
  it("makes six distinct default labels", () => {
    const labels = makeDefaultLabels();
    expect(labels).toHaveLength(6);
    expect(new Set(labels.map((l) => l.id)).size).toBe(6);
    expect(new Set(labels.map((l) => l.color)).size).toBe(6);
    expect(labels.every((l) => l.name === "")).toBe(true);
  });

  it("reads labels off a card, old or new", () => {
    expect(cardLabels(makeCard("c"))).toEqual([]);
    expect(cardLabels({ id: "old" })).toEqual([]);
    expect(cardLabels({ id: "c", labels: ["l1"] })).toEqual(["l1"]);
  });

  it("reads labels off a board, old or new", () => {
    expect(boardLabels(undefined)).toEqual([]);
    expect(boardLabels({ columns: [] })).toEqual([]);
    expect(boardLabels({ columns: [], labels: [{ id: "l" }] })).toHaveLength(1);
  });
});

describe("stripLabelFromTree", () => {
  /** Root board with the same label used at three different depths */
  const tree = () => ({
    labels: [{ id: "L1", name: "urgent", color: "red" }],
    columns: [
      {
        id: "c1", title: "c1", emoji: "", color: "",
        cards: [
          { ...makeCard("top"), id: "top", labels: ["L1", "L2"] },
          { ...makeCard("sansLabel"), id: "sansLabel", labels: [] },
          {
            ...makeCard("parent"), id: "parent", labels: ["L2"],
            board: {
              columns: [
                {
                  id: "c2", title: "c2", emoji: "", color: "",
                  cards: [
                    { ...makeCard("nested"), id: "nested", labels: ["L1"] },
                    {
                      ...makeCard("deep"), id: "deep", labels: ["L1"],
                      board: {
                        columns: [
                          {
                            id: "c3", title: "c3", emoji: "", color: "",
                            cards: [{ ...makeCard("deepest"), id: "deepest", labels: ["L1"] }],
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const findCard = (board, id) => {
    for (const col of board.columns) {
      for (const card of col.cards) {
        if (card.id === id) return card;
        const hit = findCard(card.board, id);
        if (hit) return hit;
      }
    }
    return null;
  };

  it("removes the label at every depth of the tree", () => {
    const root = tree();
    const touched = stripLabelFromTree(root, "L1");
    expect(touched).toBe(4); // top, nested, deep, deepest
    for (const id of ["top", "nested", "deep", "deepest"]) {
      expect(findCard(root, id).labels).not.toContain("L1");
    }
  });

  it("leaves other labels on the card alone", () => {
    const root = tree();
    stripLabelFromTree(root, "L1");
    expect(findCard(root, "top").labels).toEqual(["L2"]);
    expect(findCard(root, "parent").labels).toEqual(["L2"]);
  });

  it("touches nothing when the label is unused", () => {
    const root = tree();
    expect(stripLabelFromTree(root, "inexistant")).toBe(0);
    expect(findCard(root, "top").labels).toEqual(["L1", "L2"]);
  });

  it("tolerates cards saved before labels existed", () => {
    const root = { columns: [{ id: "c", title: "c", cards: [{ id: "legacy", board: { columns: [] } }] }] };
    expect(() => stripLabelFromTree(root, "L1")).not.toThrow();
  });

  it("handles an empty board", () => {
    expect(stripLabelFromTree(EMPTY_BOARD, "L1")).toBe(0);
  });
});

describe("moveCardAcrossBoards", () => {
  /**
   * root
   *  ├ colA: a1, a2(→ subCol: s1, s2(→ deepCol: d1))
   *  └ colB: b1
   */
  const tree = () => ({
    columns: [
      {
        id: "colA", title: "A", emoji: "", color: "",
        cards: [
          { ...makeCard("a1"), id: "a1" },
          {
            ...makeCard("a2"), id: "a2",
            board: {
              columns: [
                {
                  id: "subCol", title: "sub", emoji: "", color: "",
                  cards: [
                    { ...makeCard("s1"), id: "s1" },
                    {
                      ...makeCard("s2"), id: "s2",
                      board: {
                        columns: [
                          { id: "deepCol", title: "deep", emoji: "", color: "",
                            cards: [{ ...makeCard("d1"), id: "d1" }] },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      { id: "colB", title: "B", emoji: "", color: "", cards: [{ ...makeCard("b1"), id: "b1" }] },
    ],
  });

  const idsIn = (board, colId) => board.columns.find((c) => c.id === colId).cards.map((c) => c.id);
  const boardAt = (root, path) => resolveBoardAtPath(root, path);

  it("moves a card into a nested board", () => {
    const next = moveCardAcrossBoards(
      tree(),
      { path: [], colId: "colA", cardId: "a1" },
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol" }
    );
    expect(idsIn(next, "colA")).toEqual(["a2"]);
    expect(idsIn(boardAt(next, [{ colId: "colA", cardId: "a2" }]), "subCol"))
      .toEqual(["s1", "s2", "a1"]);
  });

  it("moves a card up out of a nested board", () => {
    const next = moveCardAcrossBoards(
      tree(),
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol", cardId: "s1" },
      { path: [], colId: "colB" }
    );
    expect(idsIn(next, "colB")).toEqual(["b1", "s1"]);
    expect(idsIn(boardAt(next, [{ colId: "colA", cardId: "a2" }]), "subCol")).toEqual(["s2"]);
  });

  it("carries the whole subtree along", () => {
    const next = moveCardAcrossBoards(
      tree(),
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol", cardId: "s2" },
      { path: [], colId: "colB" }
    );
    const moved = next.columns.find((c) => c.id === "colB").cards.find((c) => c.id === "s2");
    expect(moved.board.columns[0].cards.map((c) => c.id)).toEqual(["d1"]);
  });

  it("refuses to move a card into its own subtree", () => {
    // a2 into a2's own sub-board would detach the branch from the tree
    expect(moveCardAcrossBoards(
      tree(),
      { path: [], colId: "colA", cardId: "a2" },
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol" }
    )).toBeNull();
  });

  it("refuses to move a card into a deeper descendant", () => {
    expect(moveCardAcrossBoards(
      tree(),
      { path: [], colId: "colA", cardId: "a2" },
      { path: [{ colId: "colA", cardId: "a2" }, { colId: "subCol", cardId: "s2" }], colId: "deepCol" }
    )).toBeNull();
  });

  it("honours the requested position", () => {
    const next = moveCardAcrossBoards(
      tree(),
      { path: [], colId: "colB", cardId: "b1" },
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol", index: 1 }
    );
    expect(idsIn(boardAt(next, [{ colId: "colA", cardId: "a2" }]), "subCol"))
      .toEqual(["s1", "b1", "s2"]);
  });

  it("appends when no position is given", () => {
    const next = moveCardAcrossBoards(
      tree(),
      { path: [], colId: "colB", cardId: "b1" },
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol" }
    );
    expect(idsIn(boardAt(next, [{ colId: "colA", cardId: "a2" }]), "subCol"))
      .toEqual(["s1", "s2", "b1"]);
  });

  it("returns null on an unknown destination column", () => {
    expect(moveCardAcrossBoards(
      tree(), { path: [], colId: "colA", cardId: "a1" }, { path: [], colId: "nope" }
    )).toBeNull();
  });

  it("returns null on an unknown card", () => {
    expect(moveCardAcrossBoards(
      tree(), { path: [], colId: "colA", cardId: "fantome" }, { path: [], colId: "colB" }
    )).toBeNull();
  });

  it("leaves the original tree untouched", () => {
    const root = tree();
    moveCardAcrossBoards(root, { path: [], colId: "colA", cardId: "a1" }, { path: [], colId: "colB" });
    expect(idsIn(root, "colA")).toEqual(["a1", "a2"]);
    expect(idsIn(root, "colB")).toEqual(["b1"]);
  });
});

describe("listBoardDestinations", () => {
  const tree = () => ({
    columns: [
      {
        id: "colA", title: "A", emoji: "", color: "",
        cards: [
          { ...makeCard("Sans sous-board"), id: "a1" },
          {
            ...makeCard("Parent"), id: "a2",
            board: { columns: [{ id: "subCol", title: "sub", emoji: "", color: "",
              cards: [{ ...makeCard("Enfant"), id: "s1",
                board: { columns: [{ id: "deepCol", title: "deep", emoji: "", color: "", cards: [] }] } }] }] },
          },
        ],
      },
    ],
  });

  it("always offers the root board first", () => {
    const dests = listBoardDestinations(tree());
    expect(dests[0].path).toEqual([]);
    expect(dests[0].trail).toEqual(["Root"]);
  });

  it("lists only cards that actually have a board", () => {
    const titles = listBoardDestinations(tree()).map((d) => d.trail.join("/"));
    expect(titles).toContain("Root/Parent");
    expect(titles).toContain("Root/Parent/Enfant");
    expect(titles.some((t) => t.includes("Sans sous-board"))).toBe(false);
  });

  it("excludes a card and everything under it", () => {
    // Moving "Parent" must not offer Parent, nor anything nested inside it
    const titles = listBoardDestinations(tree(), "a2").map((d) => d.trail.join("/"));
    expect(titles).toEqual(["Root"]);
  });

  it("keeps siblings when excluding a deeper card", () => {
    const titles = listBoardDestinations(tree(), "s1").map((d) => d.trail.join("/"));
    expect(titles).toContain("Root/Parent");
    expect(titles).not.toContain("Root/Parent/Enfant");
  });

  it("carries the columns of each destination", () => {
    const parent = listBoardDestinations(tree()).find((d) => d.trail.join("/") === "Root/Parent");
    expect(parent.columns.map((c) => c.id)).toEqual(["subCol"]);
  });
});

describe("moveColumnAcrossBoards", () => {
  /**
   * root
   *  ├ colA: a1, a2(→ subCol: s1(→ deepCol: d1))
   *  └ colB: b1
   */
  const tree = () => ({
    columns: [
      {
        id: "colA", title: "A", emoji: "", color: "",
        cards: [
          { ...makeCard("a1"), id: "a1" },
          {
            ...makeCard("a2"), id: "a2",
            board: { columns: [{ id: "subCol", title: "sub", emoji: "", color: "",
              cards: [{ ...makeCard("s1"), id: "s1",
                board: { columns: [{ id: "deepCol", title: "deep", emoji: "", color: "",
                  cards: [{ ...makeCard("d1"), id: "d1" }] }] } }] }] },
          },
        ],
      },
      { id: "colB", title: "B", emoji: "", color: "", cards: [{ ...makeCard("b1"), id: "b1" }] },
    ],
  });

  const colIds = (board) => board.columns.map((c) => c.id);

  it("moves a column into a nested board", () => {
    const next = moveColumnAcrossBoards(
      tree(),
      { path: [], colId: "colB" },
      { path: [{ colId: "colA", cardId: "a2" }] }
    );
    expect(colIds(next)).toEqual(["colA"]);
    expect(colIds(resolveBoardAtPath(next, [{ colId: "colA", cardId: "a2" }])))
      .toEqual(["subCol", "colB"]);
  });

  it("carries every card and subtree in the column", () => {
    const next = moveColumnAcrossBoards(
      tree(), { path: [], colId: "colA" }, { path: [] , index: 0 }
    );
    // Same board, explicit position: a reorder rather than a no-op
    const moved = next.columns.find((c) => c.id === "colA");
    const a2 = moved.cards.find((c) => c.id === "a2");
    expect(a2.board.columns[0].cards[0].board.columns[0].cards[0].id).toBe("d1");
  });

  it("refuses a destination inside a card the column holds", () => {
    // colA holds a2, so a2's board cannot receive colA
    expect(moveColumnAcrossBoards(
      tree(), { path: [], colId: "colA" }, { path: [{ colId: "colA", cardId: "a2" }] }
    )).toBeNull();
  });

  it("refuses a destination deeper inside the column's subtree", () => {
    // d1 lives three levels under colA
    expect(moveColumnAcrossBoards(
      tree(),
      { path: [], colId: "colA" },
      { path: [{ colId: "colA", cardId: "a2" }, { colId: "subCol", cardId: "s1" }] }
    )).toBeNull();
  });

  it("allows a sibling column into that same destination", () => {
    // colB holds none of those cards, so it may go where colA may not
    expect(moveColumnAcrossBoards(
      tree(),
      { path: [], colId: "colB" },
      { path: [{ colId: "colA", cardId: "a2" }, { colId: "subCol", cardId: "s1" }] }
    )).not.toBeNull();
  });

  it("honours the requested position", () => {
    const next = moveColumnAcrossBoards(
      tree(),
      { path: [{ colId: "colA", cardId: "a2" }], colId: "subCol" },
      { path: [], index: 1 }
    );
    expect(colIds(next)).toEqual(["colA", "subCol", "colB"]);
  });

  it("returns null when nothing would change", () => {
    expect(moveColumnAcrossBoards(tree(), { path: [], colId: "colA" }, { path: [] })).toBeNull();
  });

  it("returns null on an unknown column", () => {
    expect(moveColumnAcrossBoards(tree(), { path: [], colId: "nope" }, { path: [] })).toBeNull();
  });

  it("leaves the original tree untouched", () => {
    const root = tree();
    moveColumnAcrossBoards(root, { path: [], colId: "colB" },
      { path: [{ colId: "colA", cardId: "a2" }] });
    expect(colIds(root)).toEqual(["colA", "colB"]);
  });
});

describe("collectCardIds", () => {
  it("collects ids at every depth", () => {
    const column = {
      id: "c", title: "c", cards: [
        { ...makeCard("x"), id: "x",
          board: { columns: [{ id: "n", title: "n", cards: [
            { ...makeCard("y"), id: "y",
              board: { columns: [{ id: "m", title: "m", cards: [{ ...makeCard("z"), id: "z" }] }] } },
          ] }] } },
      ],
    };
    expect([...collectCardIds(column)].sort()).toEqual(["x", "y", "z"]);
  });

  it("returns an empty set for an empty column", () => {
    expect(collectCardIds({ id: "c", title: "c", cards: [] }).size).toBe(0);
  });
});

describe("listBoardDestinations with a set of exclusions", () => {
  const tree = () => ({
    columns: [
      { id: "colA", title: "A", cards: [
        { ...makeCard("P1"), id: "p1",
          board: { columns: [{ id: "s", title: "s", cards: [] }] } },
        { ...makeCard("P2"), id: "p2",
          board: { columns: [{ id: "t", title: "t", cards: [] }] } },
      ] },
    ],
  });

  it("drops every excluded card", () => {
    const trails = listBoardDestinations(tree(), new Set(["p1", "p2"])).map((d) => d.trail.join("/"));
    expect(trails).toEqual(["Root"]);
  });

  it("keeps the ones not excluded", () => {
    const trails = listBoardDestinations(tree(), new Set(["p1"])).map((d) => d.trail.join("/"));
    expect(trails).toEqual(["Root", "Root/P2"]);
  });

  it("still accepts a bare id", () => {
    const trails = listBoardDestinations(tree(), "p1").map((d) => d.trail.join("/"));
    expect(trails).toEqual(["Root", "Root/P2"]);
  });
});

describe("outlineRows", () => {
  /**
   * colA: a1, a2(→ subCol: s1, s2)
   * colB: (empty)
   */
  const tree = () => ({
    columns: [
      { id: "colA", title: "A", emoji: "", color: "", cards: [
        { ...makeCard("a1"), id: "a1" },
        { ...makeCard("a2"), id: "a2", board: { columns: [
          { id: "subCol", title: "sub", emoji: "", color: "", cards: [
            { ...makeCard("s1"), id: "s1" },
            { ...makeCard("s2"), id: "s2", archived: true },
          ] },
        ] } },
      ] },
      { id: "colB", title: "B", emoji: "", color: "", cards: [] },
    ],
  });

  const closed = () => false;
  const openAll = () => true;

  it("starts with the root row", () => {
    const rows = outlineRows(tree(), closed);
    expect(rows[0]).toMatchObject({ kind: "root", depth: 0 });
  });

  it("lists columns and their cards in order", () => {
    const rows = outlineRows(tree(), closed).slice(1);
    expect(rows.map((r) => r.kind)).toEqual(["column", "card", "card", "column"]);
    expect(rows[0].column.id).toBe("colA");
    expect(rows[1].card.id).toBe("a1");
  });

  it("keeps collapsed branches out of the list", () => {
    const rows = outlineRows(tree(), closed);
    expect(rows.some((r) => r.kind === "column" && r.column?.id === "subCol")).toBe(false);
  });

  it("unfolds a branch when it is open", () => {
    const rows = outlineRows(tree(), openAll);
    expect(rows.some((r) => r.kind === "column" && r.column?.id === "subCol")).toBe(true);
    expect(rows.some((r) => r.kind === "card" && r.card?.id === "s1")).toBe(true);
  });

  it("marks which cards can be unfolded", () => {
    const rows = outlineRows(tree(), closed);
    const a1 = rows.find((r) => r.card?.id === "a1");
    const a2 = rows.find((r) => r.card?.id === "a2");
    expect(a1.hasChildren).toBe(false);
    expect(a2.hasChildren).toBe(true);
  });

  it("indents each level further than the last", () => {
    const rows = outlineRows(tree(), openAll);
    const a2 = rows.find((r) => r.card?.id === "a2");
    const sub = rows.find((r) => r.column?.id === "subCol");
    const s1 = rows.find((r) => r.card?.id === "s1");
    expect(sub.depth).toBeGreaterThan(a2.depth);
    expect(s1.depth).toBeGreaterThan(sub.depth);
  });

  it("hides archived cards, and does not count them", () => {
    const rows = outlineRows(tree(), openAll);
    expect(rows.some((r) => r.card?.id === "s2")).toBe(false);
    expect(rows.find((r) => r.column?.id === "subCol").count).toBe(1);
  });

  it("carries a navigable path on each card", () => {
    const rows = outlineRows(tree(), openAll);
    const s1 = rows.find((r) => r.card?.id === "s1");
    expect(s1.path.map((p) => p.cardId)).toEqual(["a2"]);
    expect(s1.colId).toBe("subCol");
  });

  it("counts done cards per column", () => {
    const withDone = tree();
    withDone.columns[0].cards[0].done = true;
    const rows = outlineRows(withDone, closed);
    const colA = rows.find((r) => r.column?.id === "colA");
    expect(colA).toMatchObject({ count: 2, done: 1 });
  });

  it("gives every row a unique key", () => {
    const rows = outlineRows(tree(), openAll);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("handles an empty board", () => {
    const rows = outlineRows(EMPTY_BOARD, closed);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("root");
  });
});

describe("allBranchKeys", () => {
  it("returns only cards that hold a board, at every depth", () => {
    const root = {
      columns: [{ id: "c", title: "c", cards: [
        { ...makeCard("plain"), id: "plain" },
        { ...makeCard("parent"), id: "parent", board: { columns: [
          { id: "n", title: "n", cards: [
            { ...makeCard("child"), id: "child", board: { columns: [
              { id: "m", title: "m", cards: [] },
            ] } },
          ] },
        ] } },
      ] }],
    };
    expect([...allBranchKeys(root)].sort()).toEqual(["parent", "parent/child"]);
  });

  it("returns nothing for a flat board", () => {
    const flat = { columns: [{ id: "c", title: "c", cards: [{ ...makeCard("x"), id: "x" }] }] };
    expect(allBranchKeys(flat).size).toBe(0);
  });
});

describe("duplicateCard", () => {
  const original = () => ({
    ...makeCard("Original"),
    id: "src",
    description: "desc",
    labels: ["L1"],
    dueAt: "2026-09-01T00:00:00.000Z",
    comments: [{ id: "cm1", text: "note", createdAt: "x" }],
    checklists: [{ id: "cl1", title: "Etapes", items: [{ id: "i1", text: "un", done: true }] }],
    board: { columns: [
      { id: "sub", title: "sub", cards: [{ ...makeCard("enfant"), id: "kid" }] },
    ] },
  });

  it("keeps the content", () => {
    const copy = duplicateCard(original());
    expect(copy).toMatchObject({
      title: "Original", description: "desc",
      labels: ["L1"], dueAt: "2026-09-01T00:00:00.000Z",
    });
    expect(copy.comments[0].text).toBe("note");
    expect(copy.checklists[0].items[0]).toMatchObject({ text: "un", done: true });
  });

  it("gives the card a new id", () => {
    expect(duplicateCard(original()).id).not.toBe("src");
  });

  it("re-ids nested comments, checklists and their items", () => {
    const copy = duplicateCard(original());
    expect(copy.comments[0].id).not.toBe("cm1");
    expect(copy.checklists[0].id).not.toBe("cl1");
    expect(copy.checklists[0].items[0].id).not.toBe("i1");
  });

  it("re-ids the whole subtree", () => {
    // Reused ids would break drag & drop and the URL hash both
    const copy = duplicateCard(original());
    expect(copy.board.columns[0].id).not.toBe("sub");
    expect(copy.board.columns[0].cards[0].id).not.toBe("kid");
    expect(copy.board.columns[0].cards[0].title).toBe("enfant");
  });

  it("leaves the original untouched", () => {
    const src = original();
    duplicateCard(src);
    expect(src.id).toBe("src");
    expect(src.board.columns[0].cards[0].id).toBe("kid");
  });

  it("produces ids unique across the copy", () => {
    const copy = duplicateCard(original());
    const ids = [copy.id, copy.board.columns[0].id, copy.board.columns[0].cards[0].id,
                 copy.comments[0].id, copy.checklists[0].id, copy.checklists[0].items[0].id];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("sortColumnCards", () => {
  const col = (cards) => ({ id: "c", title: "c", cards });
  const card = (id, extra = {}) => ({ ...makeCard(id), id, ...extra });

  it("sorts by due date, soonest first", () => {
    const c = col([
      card("c", { dueAt: "2026-12-01" }),
      card("a", { dueAt: "2026-01-01" }),
      card("b", { dueAt: "2026-06-01" }),
    ]);
    sortColumnCards(c, "due");
    expect(c.cards.map((k) => k.id)).toEqual(["a", "b", "c"]);
  });

  it("sinks cards without a due date to the bottom", () => {
    // Treating "no date" as the epoch would put them first, which is backwards
    const c = col([card("sans"), card("avec", { dueAt: "2026-06-01" })]);
    sortColumnCards(c, "due");
    expect(c.cards.map((k) => k.id)).toEqual(["avec", "sans"]);
  });

  it("sorts by title, ignoring case and accents", () => {
    const c = col([card("z", { title: "Zebre" }), card("e", { title: "Éclair" }), card("a", { title: "avion" })]);
    sortColumnCards(c, "title");
    expect(c.cards.map((k) => k.title)).toEqual(["avion", "Éclair", "Zebre"]);
  });

  it("pushes done cards to the bottom", () => {
    const c = col([card("x", { done: true }), card("y"), card("z", { done: true })]);
    sortColumnCards(c, "done");
    expect(c.cards.map((k) => k.done)).toEqual([false, true, true]);
  });

  it("leaves archived cards in place", () => {
    // They are invisible, so reordering them would be churn nobody can see
    const c = col([
      card("v1", { dueAt: "2026-12-01" }),
      card("arch", { archived: true }),
      card("v2", { dueAt: "2026-01-01" }),
    ]);
    sortColumnCards(c, "due");
    expect(c.cards[1].id).toBe("arch");
    expect(c.cards.map((k) => k.id)).toEqual(["v2", "arch", "v1"]);
  });

  it("refuses an unknown sort key", () => {
    const c = col([card("b"), card("a")]);
    expect(sortColumnCards(c, "inconnu")).toBe(false);
    expect(c.cards.map((k) => k.id)).toEqual(["b", "a"]);
  });

  it("handles an empty column", () => {
    const c = col([]);
    expect(sortColumnCards(c, "due")).toBe(true);
    expect(c.cards).toEqual([]);
  });
});

describe("subBoardStats", () => {
  const card = (title, extra = {}) => ({
    ...makeCard(title), ...extra,
  });
  const col = (title, cards) => ({ ...makeCol(title), cards });

  it("says nothing about an empty board", () => {
    expect(subBoardStats({ columns: [] })).toEqual({
      columns: 0, cards: 0, done: 0, overdue: 0, depth: 0,
    });
  });

  it("counts the whole subtree, not just the first level", () => {
    const deep = card("petite-fille");
    const mid = card("fille");
    mid.board = { columns: [col("c", [deep])] };
    const top = card("mere");
    top.board = { columns: [col("b", [mid])] };
    const board = { columns: [col("a", [top])] };

    const s = subBoardStats(board);
    expect(s.cards).toBe(3);
    expect(s.depth).toBe(3);
    expect(s.columns).toBe(1); // only its own columns
  });

  it("keeps the deepest branch, not the last one walked", () => {
    const leaf = card("feuille");
    const middle = card("milieu");
    middle.board = { columns: [col("z", [leaf])] };
    const top = card("haut");
    top.board = { columns: [col("y", [middle])] };
    // The shallow card comes second and has a real board of its own — an
    // empty one would leave the walk early and never touch the depth. A depth
    // that simply follows the walk ends on it and forgets the branch beside it.
    const shallow = card("plate");
    shallow.board = { columns: [col("w", [card("rien")])] };
    const board = { columns: [col("x", [top, shallow])] };

    expect(subBoardStats(board).depth).toBe(3);
  });

  it("ignores archived cards, like the board itself does", () => {
    const board = {
      columns: [col("a", [card("visible"), card("cachee", { archived: true })])],
    };
    expect(subBoardStats(board).cards).toBe(1);
  });

  it("counts a done card as done and never as overdue", () => {
    const NOW = new Date(2026, 7, 28);
    const board = {
      columns: [col("a", [
        card("finie", { done: true, dueAt: "2020-01-01" }),
        card("en retard", { dueAt: "2020-01-01" }),
      ])],
    };
    const s = subBoardStats(board, NOW);
    expect(s).toMatchObject({ cards: 2, done: 1, overdue: 1 });
  });
});

describe("la convention de la colonne terminee", () => {
  const withEmoji = (emoji) => ({ ...makeCol("c"), emoji });

  it("reconnait la colonne a son icone", () => {
    expect(isDoneColumn(withEmoji("✅"))).toBe(true);
    expect(isDoneColumn(withEmoji("🔥"))).toBe(false);
    expect(isDoneColumn(makeCol("sans icone"))).toBe(false);
    expect(isDoneColumn(null)).toBe(false);
  });

  it("ne confond pas la coche verte avec une autre coche", () => {
    // ✔ et ☑ ne sont pas ✅ : la regle doit rester litterale, sinon on la
    // declenche par accident en choisissant un emoji voisin.
    expect(isDoneColumn(withEmoji("✔"))).toBe(false);
    expect(isDoneColumn(withEmoji("☑"))).toBe(false);
  });

  it("dit si un board a une fin du tout", () => {
    expect(hasDoneColumn({ columns: [makeCol("a"), withEmoji("✅")] })).toBe(true);
    expect(hasDoneColumn({ columns: [makeCol("a"), withEmoji("💡")] })).toBe(false);
    expect(hasDoneColumn({ columns: [] })).toBe(false);
    expect(hasDoneColumn(null)).toBe(false);
  });
});

describe("markCardDone", () => {
  const board = () => ({
    columns: [{ ...makeCol("a"), cards: [makeCard("x"), { ...makeCard("y"), done: true }] }],
  });

  it("coche la carte et date le moment", () => {
    const b = board();
    const colId = b.columns[0].id;
    const id = b.columns[0].cards[0].id;
    expect(markCardDone(b, colId, id, "2026-08-28T10:00:00.000Z")).toBe(true);
    expect(b.columns[0].cards[0]).toMatchObject({
      done: true, doneAt: "2026-08-28T10:00:00.000Z",
    });
  });

  it("ne touche pas a une carte deja terminee, ni ne redate la sienne", () => {
    const b = board();
    const colId = b.columns[0].id;
    const deja = b.columns[0].cards[1];
    expect(markCardDone(b, colId, deja.id)).toBe(false);
    expect(deja.doneAt).toBeNull(); // makeCard le pose a null, pas undefined
  });

  it("ne bronche pas sur une colonne ou une carte inconnue", () => {
    const b = board();
    expect(markCardDone(b, "nawak", "nawak")).toBe(false);
    expect(markCardDone(b, b.columns[0].id, "nawak")).toBe(false);
  });
});

describe("resolvePathFromIds", () => {
  const leaf = makeCard("feuille");
  const mid = { ...makeCard("milieu"), board: { columns: [] } };
  const colB = { ...makeCol("b"), cards: [leaf] };
  mid.board = { columns: [colB] };
  const colA = { ...makeCol("a"), cards: [mid] };
  const root = { columns: [colA] };

  it("rend le chemin avec les titres du moment", () => {
    expect(
      resolvePathFromIds(root, [
        { colId: colA.id, cardId: mid.id },
        { colId: colB.id, cardId: leaf.id },
      ])
    ).toEqual([
      { colId: colA.id, cardId: mid.id, cardTitle: "milieu" },
      { colId: colB.id, cardId: leaf.id, cardTitle: "feuille" },
    ]);
  });

  it("s'arrete au dernier segment encore atteignable", () => {
    const out = resolvePathFromIds(root, [
      { colId: colA.id, cardId: mid.id },
      { colId: "disparue", cardId: "disparue" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("ne jette pas quand l'arbre n'est pas encore la", () => {
    // Le premier rendu a lieu avant que le board n'arrive de Firestore
    expect(resolvePathFromIds(null, [{ colId: "x", cardId: "y" }])).toEqual([]);
    expect(resolvePathFromIds(undefined, [{ colId: "x", cardId: "y" }])).toEqual([]);
    expect(resolvePathFromIds({}, [{ colId: "x", cardId: "y" }])).toEqual([]);
  });
});

describe("nextDueInside", () => {
  const carte = (titre, extra = {}) => ({ ...makeCard(titre), ...extra });
  const colonne = (cards) => ({ ...makeCol("c"), cards });
  const board = (cards) => ({ columns: [colonne(cards)] });

  it("rend la date la plus proche, quelle que soit la profondeur", () => {
    const profonde = carte("profonde", { dueAt: "2026-09-02" });
    const milieu = carte("milieu");
    milieu.board = board([profonde]);
    const b = board([milieu, carte("surface", { dueAt: "2026-09-20" })]);
    expect(nextDueInside(b)).toBe("2026-09-02");
  });

  it("ne saute pas le retard: c'est le plus pressant", () => {
    const b = board([
      carte("en retard", { dueAt: "2020-01-01" }),
      carte("bientot", { dueAt: "2026-09-02" }),
    ]);
    expect(nextDueInside(b)).toBe("2020-01-01");
  });

  it("ignore les cartes terminees et archivees", () => {
    const b = board([
      carte("finie", { done: true, dueAt: "2020-01-01" }),
      carte("cachee", { archived: true, dueAt: "2020-06-01" }),
      carte("vivante", { dueAt: "2026-09-02" }),
    ]);
    expect(nextDueInside(b)).toBe("2026-09-02");
  });

  it("descend quand meme sous une carte terminee", () => {
    // Terminer un parent ne termine pas ce qu'il contient
    const dedans = carte("reste a faire", { dueAt: "2026-09-05" });
    const finie = carte("finie", { done: true });
    finie.board = board([dedans]);
    expect(nextDueInside(board([finie]))).toBe("2026-09-05");
  });

  it("rend null quand rien n'est date", () => {
    expect(nextDueInside(board([carte("a"), carte("b")]))).toBeNull();
    expect(nextDueInside({ columns: [] })).toBeNull();
    expect(nextDueInside(null)).toBeNull();
  });
});

describe("fileUnderDone", () => {
  const carte = (t) => ({ ...makeCard(t) });
  const board = (cards, marque = "✅") => {
    const source = { ...makeCol("en cours"), cards };
    const fini = { ...makeCol("fini"), emoji: marque, cards: [] };
    return { columns: [source, fini], source, fini };
  };

  it("range la carte dans la colonne marquee et dit ou", () => {
    const c = carte("finie");
    const b = board([c, carte("autre")]);
    expect(fileUnderDone(b, b.source.id, c.id)).toBe(b.fini.id);
    expect(b.source.cards.map((x) => x.title)).toEqual(["autre"]);
    expect(b.fini.cards.map((x) => x.title)).toEqual(["finie"]);
  });

  it("ne fait rien sans colonne marquee", () => {
    const c = carte("finie");
    const b = board([c], "🔥");
    expect(fileUnderDone(b, b.source.id, c.id)).toBeNull();
    expect(b.source.cards).toHaveLength(1);
  });

  it("ne fait rien quand la carte y est deja", () => {
    const c = carte("deja rangee");
    const b = board([]);
    b.fini.cards.push(c);
    expect(fileUnderDone(b, b.fini.id, c.id)).toBeNull();
    expect(b.fini.cards).toHaveLength(1);
  });

  it("ne bronche pas sur une colonne ou une carte inconnue", () => {
    const b = board([carte("a")]);
    expect(fileUnderDone(b, "nawak", "nawak")).toBeNull();
    expect(fileUnderDone(b, b.source.id, "nawak")).toBeNull();
    expect(b.source.cards).toHaveLength(1);
  });
});
