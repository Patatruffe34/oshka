import { describe, it, expect } from "vitest";
import { searchBoard, makeSnippet } from "../search";
import { makeCard, makeCol } from "../board-utils";

const card = (id, title, extra = {}) => ({ ...makeCard(title), id, ...extra });
const col = (id, title, cards) => ({ ...makeCol(title), id, cards });

/**
 * Root
 *  ├ colA "Backlog"
 *  │   ├ "Refonte du site"        (desc mentions maquette)
 *  │   ├ "Échéance du projet"     (label L1, overdue)
 *  │   └ "Carte archivée"         (archived)
 *  └ colB "En cours"
 *      └ "Parent"
 *          └ subCol "Sous-taches"
 *              ├ "Tache imbriquee"   (comment mentions maquette)
 *              └ "Deep"
 *                  └ deepCol
 *                      └ "Tres profond"   (checklist item mentions maquette)
 */
const past = new Date(2026, 0, 1).toISOString();
const future = new Date(2027, 0, 1).toISOString();

const tree = () => ({
  labels: [{ id: "L1", name: "urgent", color: "red" }],
  columns: [
    col("colA", "Backlog", [
      card("r1", "Refonte du site", { description: "Revoir la maquette complete" }),
      card("r2", "Échéance du projet", { labels: ["L1"], dueAt: past }),
      card("r3", "Carte archivée", { archived: true, description: "maquette" }),
    ]),
    col("colB", "En cours", [
      card("p1", "Parent", {
        board: {
          columns: [
            col("subCol", "Sous-taches", [
              card("n1", "Tache imbriquee", {
                comments: [{ id: "c1", text: "La maquette arrive demain", createdAt: past }],
              }),
              card("d1", "Deep", {
                done: true,
                dueAt: future,
                board: {
                  columns: [
                    col("deepCol", "Encore plus bas", [
                      card("x1", "Tres profond", {
                        checklists: [
                          { id: "cl", title: "Etapes", items: [
                            { id: "i1", text: "Valider la maquette", done: false },
                          ]},
                        ],
                      }),
                    ]),
                  ],
                },
              }),
            ]),
          ],
        },
      }),
    ]),
  ],
});

const titles = (rs) => rs.map((r) => r.card.title);
const now = new Date(2026, 7, 27);

describe("searchBoard — text", () => {
  it("returns nothing for an empty query", () => {
    expect(searchBoard(tree(), { text: "" }, now)).toEqual([]);
    expect(searchBoard(tree(), {}, now)).toEqual([]);
  });

  it("matches on the card title", () => {
    expect(titles(searchBoard(tree(), { text: "refonte" }, now))).toEqual(["Refonte du site"]);
  });

  it("ignores case", () => {
    expect(titles(searchBoard(tree(), { text: "REFONTE" }, now))).toEqual(["Refonte du site"]);
  });

  it("ignores accents in both directions", () => {
    // Typing without accents must find accented content
    expect(titles(searchBoard(tree(), { text: "echeance" }, now))).toEqual(["Échéance du projet"]);
    expect(titles(searchBoard(tree(), { text: "échéance" }, now))).toEqual(["Échéance du projet"]);
  });

  it("finds matches at every depth of the tree", () => {
    const found = titles(searchBoard(tree(), { text: "maquette" }, now));
    // description (depth 0), comment (depth 2), checklist item (depth 4)
    expect(found).toContain("Refonte du site");
    expect(found).toContain("Tache imbriquee");
    expect(found).toContain("Tres profond");
  });

  it("reports which field matched", () => {
    const byTitle = Object.fromEntries(
      searchBoard(tree(), { text: "maquette" }, now).map((r) => [r.card.title, r.matchedIn])
    );
    expect(byTitle["Refonte du site"]).toBe("description");
    expect(byTitle["Tache imbriquee"]).toBe("comment");
    expect(byTitle["Tres profond"]).toBe("checklist");
  });

  it("ranks title hits above body hits", () => {
    const results = searchBoard(tree(), { text: "maquette" }, now);
    const ranks = results.map((r) => r.matchedIn);
    // checklist ranks above description, which ranks above comment
    expect(ranks.indexOf("checklist")).toBeLessThan(ranks.indexOf("comment"));
  });

  it("excludes archived cards by default", () => {
    expect(titles(searchBoard(tree(), { text: "maquette" }, now))).not.toContain("Carte archivée");
  });

  it("includes archived cards when asked", () => {
    const found = titles(searchBoard(tree(), { text: "maquette", includeArchived: true }, now));
    expect(found).toContain("Carte archivée");
  });

  it("returns a navigable path to the board holding the card", () => {
    const [hit] = searchBoard(tree(), { text: "tres profond" }, now);
    expect(hit.path.map((p) => p.cardId)).toEqual(["p1", "d1"]);
    expect(hit.colId).toBe("deepCol");
    expect(hit.trail).toEqual(["Parent", "Deep", "Tres profond"]);
  });

  it("still searches inside archived cards' children", () => {
    // The card is hidden but its subtree is still part of the board
    const found = titles(searchBoard(tree(), { text: "profond" }, now));
    expect(found).toContain("Tres profond");
  });
});

describe("searchBoard — filters", () => {
  it("filters by label with no text", () => {
    expect(titles(searchBoard(tree(), { labelIds: ["L1"] }, now))).toEqual(["Échéance du projet"]);
  });

  it("requires every requested label", () => {
    expect(searchBoard(tree(), { labelIds: ["L1", "L2"] }, now)).toEqual([]);
  });

  it("finds overdue cards", () => {
    expect(titles(searchBoard(tree(), { due: "overdue" }, now))).toEqual(["Échéance du projet"]);
  });

  it("does not call a done card overdue", () => {
    // "Deep" is done with a future date; "Échéance" is the only real overdue
    const found = titles(searchBoard(tree(), { due: "overdue" }, now));
    expect(found).not.toContain("Deep");
  });

  it("finds every card carrying a due date", () => {
    const found = titles(searchBoard(tree(), { due: "any" }, now));
    expect(found).toEqual(expect.arrayContaining(["Échéance du projet", "Deep"]));
  });

  it("filters by done state", () => {
    expect(titles(searchBoard(tree(), { done: true }, now))).toEqual(["Deep"]);
    expect(titles(searchBoard(tree(), { done: false }, now))).not.toContain("Deep");
  });

  it("combines text and filters", () => {
    expect(titles(searchBoard(tree(), { text: "projet", labelIds: ["L1"] }, now)))
      .toEqual(["Échéance du projet"]);
    expect(searchBoard(tree(), { text: "refonte", labelIds: ["L1"] }, now)).toEqual([]);
  });

  it("tolerates an empty board", () => {
    expect(searchBoard({ columns: [] }, { text: "x" }, now)).toEqual([]);
    expect(searchBoard(undefined, { text: "x" }, now)).toEqual([]);
  });
});

describe("makeSnippet", () => {
  it("splits the text around the match", () => {
    expect(makeSnippet("Revoir la maquette complete", "maquette")).toEqual({
      before: "Revoir la ",
      match: "maquette",
      after: " complete",
    });
  });

  it("preserves the original casing of the match", () => {
    expect(makeSnippet("La Maquette", "maquette").match).toBe("Maquette");
  });

  it("adds ellipses when it trims a long text", () => {
    const long = "x".repeat(100) + "cible" + "y".repeat(100);
    const s = makeSnippet(long, "cible", 10);
    expect(s.before.startsWith("…")).toBe(true);
    expect(s.after.endsWith("…")).toBe(true);
    expect(s.match).toBe("cible");
  });

  it("returns null when the needle is absent", () => {
    expect(makeSnippet("abc", "z")).toBeNull();
    expect(makeSnippet("", "z")).toBeNull();
    expect(makeSnippet(null, "z")).toBeNull();
  });
});
