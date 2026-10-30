import { describe, it, expect } from "vitest";
import { buildMindTree, radialLayout, allNodeKeys, keysBelowDepth } from "../mindmap";
import { makeCard } from "../board-utils";

const card = (id, extra = {}) => ({ ...makeCard(id), id, ...extra });
const col = (id, cards, extra = {}) => ({
  id, title: id, emoji: "", color: "", cards, ...extra,
});

/**
 * root
 *  ├ colA: a1, a2(→ subCol: s1, s2)
 *  └ colB: b1
 */
const tree = () => ({
  columns: [
    col("colA", [
      card("a1"),
      card("a2", { board: { columns: [col("subCol", [card("s1"), card("s2")])] } }),
    ]),
    col("colB", [card("b1")]),
  ],
});

const open = () => false;

describe("buildMindTree", () => {
  it("puts the root at the centre with the columns beneath it", () => {
    const t = buildMindTree(tree(), "Root", open);
    expect(t).toMatchObject({ kind: "root", depth: 0, label: "Root" });
    expect(t.children.map((c) => c.id)).toEqual(["colA", "colB"]);
    expect(t.children.every((c) => c.kind === "column")).toBe(true);
  });

  it("alternates columns and cards as it goes down", () => {
    const t = buildMindTree(tree(), "Root", open);
    const colA = t.children[0];
    expect(colA.children.map((c) => c.kind)).toEqual(["card", "card"]);
    const a2 = colA.children[1];
    expect(a2.children[0]).toMatchObject({ kind: "column", id: "subCol" });
    expect(a2.children[0].children.map((c) => c.id)).toEqual(["s1", "s2"]);
  });

  it("gives each level a depth two apart for card→card", () => {
    const t = buildMindTree(tree(), "Root", open);
    const colA = t.children[0];
    const a2 = colA.children[1];
    const subCol = a2.children[0];
    expect([t.depth, colA.depth, a2.depth, subCol.depth]).toEqual([0, 1, 2, 3]);
  });

  it("hides archived cards", () => {
    const t = tree();
    t.columns[0].cards.push(card("arch", { archived: true }));
    const built = buildMindTree(t, "Root", open);
    expect(built.children[0].children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(built.children[0].count).toBe(2);
  });

  it("counts done cards on the column node", () => {
    const t = tree();
    t.columns[0].cards[0].done = true;
    const built = buildMindTree(t, "Root", open);
    expect(built.children[0]).toMatchObject({ count: 2, done: 1 });
  });

  it("prunes a collapsed branch but says how much it hides", () => {
    const built = buildMindTree(tree(), "Root", (key) => key === "colA");
    const colA = built.children[0];
    expect(colA.children).toEqual([]);
    expect(colA).toMatchObject({ collapsed: true, hidden: 2 });
  });

  it("collapses a card without touching its siblings", () => {
    const built = buildMindTree(tree(), "Root", (key) => key.endsWith("/a2"));
    const colA = built.children[0];
    expect(colA.children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(colA.children[1]).toMatchObject({ collapsed: true, hidden: 1 });
  });

  it("marks which cards can be opened", () => {
    const built = buildMindTree(tree(), "Root", open);
    const [a1, a2] = built.children[0].children;
    expect(a1.hasChildren).toBe(false);
    expect(a2.hasChildren).toBe(true);
  });

  it("carries a navigable path on each card", () => {
    const built = buildMindTree(tree(), "Root", open);
    const s1 = built.children[0].children[1].children[0].children[0];
    expect(s1.childPath.map((p) => p.cardId)).toEqual(["a2", "s1"]);
  });

  it("gives every node a unique key", () => {
    const built = buildMindTree(tree(), "Root", open);
    const keys = [];
    (function walk(n) { keys.push(n.key); n.children.forEach(walk); })(built);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("radialLayout", () => {
  const laidOut = () => radialLayout(buildMindTree(tree(), "Root", open));

  it("puts the root dead centre", () => {
    const root = laidOut().nodes.find((n) => n.kind === "root");
    expect(Math.round(root.x)).toBe(0);
    expect(Math.round(root.y)).toBe(0);
  });

  it("sets the radius from the depth", () => {
    const { nodes } = radialLayout(buildMindTree(tree(), "Root", open), { radiusStep: 100 });
    const byDepth = (d) => nodes.filter((n) => n.depth === d);
    expect(byDepth(1).every((n) => Math.round(n.radius) === 100)).toBe(true);
    expect(byDepth(2).every((n) => Math.round(n.radius) === 200)).toBe(true);
  });

  it("shares the angle by leaf count, not evenly per sibling", () => {
    // colA carries 3 leaves, colB carries 1 — colA must get the wider sector
    const { nodes } = laidOut();
    const colA = nodes.find((n) => n.id === "colA");
    const colB = nodes.find((n) => n.id === "colB");
    const span = (n) => n.angleTo - n.angleFrom;
    expect(span(colA)).toBeGreaterThan(span(colB));
    expect(span(colA) / span(colB)).toBeCloseTo(3, 1);
  });

  it("covers the full circle without overlap between siblings", () => {
    const { nodes } = laidOut();
    const roots = nodes.filter((n) => n.depth === 1).sort((a, b) => a.angleFrom - b.angleFrom);
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i].angleFrom).toBeCloseTo(roots[i - 1].angleTo, 6);
    }
    const total = roots.reduce((s, n) => s + (n.angleTo - n.angleFrom), 0);
    expect(total).toBeCloseTo(Math.PI * 2, 6);
  });

  it("keeps each node inside its own sector", () => {
    const { nodes } = laidOut();
    for (const n of nodes) {
      expect(n.angle).toBeGreaterThanOrEqual(n.angleFrom - 1e-9);
      expect(n.angle).toBeLessThanOrEqual(n.angleTo + 1e-9);
    }
  });

  it("keeps a child within its parent's sector", () => {
    const { nodes, edges } = laidOut();
    const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]));
    for (const e of edges) {
      const parent = byKey[e.from.key];
      const child = byKey[e.to.key];
      expect(child.angleFrom).toBeGreaterThanOrEqual(parent.angleFrom - 1e-9);
      expect(child.angleTo).toBeLessThanOrEqual(parent.angleTo + 1e-9);
    }
  });

  it("emits one edge per node except the root", () => {
    const { nodes, edges } = laidOut();
    expect(edges).toHaveLength(nodes.length - 1);
  });

  it("reports the extent so the view can be framed", () => {
    const { maxRadius, depth } = radialLayout(buildMindTree(tree(), "Root", open), { radiusStep: 100 });
    expect(depth).toBe(4);
    expect(maxRadius).toBe(400);
  });

  it("handles a board with nothing in it", () => {
    const { nodes, edges } = radialLayout(buildMindTree({ columns: [] }, "Root", open));
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });
});

describe("allNodeKeys", () => {
  it("returns the nodes that can be folded", () => {
    const keys = allNodeKeys(buildMindTree(tree(), "Root", open));
    expect([...keys]).toContain("colA");
    expect([...keys]).toContain("colA/a2");
    // a1 has no children, so there is nothing to fold
    expect([...keys]).not.toContain("colA/a1");
  });

  it("leaves the root out — it is never folded", () => {
    expect([...allNodeKeys(buildMindTree(tree(), "Root", open))]).not.toContain("");
  });
});

describe("keysBelowDepth", () => {
  it("returns the nodes at or past the depth that have children", () => {
    const built = buildMindTree(tree(), "Root", open);
    // depth 1 = columns, 2 = cards, 3 = nested columns
    const keys = keysBelowDepth(built, 2);
    expect([...keys]).toContain("colA/a2");   // a card holding a sub-board
    expect([...keys]).not.toContain("colA");  // depth 1, left alone
  });

  it("skips nodes with nothing under them", () => {
    const keys = keysBelowDepth(buildMindTree(tree(), "Root", open), 1);
    expect([...keys]).not.toContain("colA/a1");
  });

  it("returns nothing when the depth is past the tree", () => {
    expect(keysBelowDepth(buildMindTree(tree(), "Root", open), 99).size).toBe(0);
  });

  it("folding at that depth actually prunes the tree", () => {
    const full = buildMindTree(tree(), "Root", open);
    const keys = keysBelowDepth(full, 2);
    const folded = buildMindTree(tree(), "Root", (k) => keys.has(k));
    const count = (n) => 1 + n.children.reduce((s, c) => s + count(c), 0);
    expect(count(folded)).toBeLessThan(count(full));
  });
});
