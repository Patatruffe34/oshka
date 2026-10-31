import { visibleCards } from "./board-utils";
import type { Board, Card, Id, TitledSegment } from "./types";

export interface MindNode {
  kind: "root" | "column" | "card";
  key: string;
  label: string;
  depth: number;
  children: MindNode[];
  /** How many children a collapsed node is hiding */
  hidden: number;
  collapsed?: boolean;
  path?: TitledSegment[];
  id?: Id;
  // Columns
  emoji?: string;
  color?: string;
  count?: number;
  done?: number;
  // Cards
  colId?: Id;
  childPath?: TitledSegment[];
  card?: Card;
  hasChildren?: boolean;
}

export interface PlacedNode extends MindNode {
  angle: number;
  radius: number;
  x: number;
  y: number;
  angleFrom: number;
  angleTo: number;
}

export interface MindEdge {
  from: PlacedNode;
  to: PlacedNode;
  key: string;
}

/**
 * Build the mind-map tree: root → columns → cards → columns → …
 *
 * Columns are nodes of their own, so the structure stays readable rather than
 * cards appearing to hang directly off their parent card.
 *
 * `isCollapsed(key)` prunes a branch: its children are dropped but the node
 * still reports how many descendants it hides.
 */
export function buildMindTree(
  root: Board,
  rootLabel = "Root",
  isCollapsed: (key: string) => boolean = () => false,
): MindNode {
  const makeNode = (partial: Omit<MindNode, "children" | "hidden"> & Partial<MindNode>): MindNode =>
    ({ children: [], hidden: 0, ...partial });

  const walkBoard = (board: Board, path: TitledSegment[], depth: number, keyPrefix: string): MindNode[] =>
    board.columns.map((col) => {
      const key = `${keyPrefix}${col.id}`;
      const cards = visibleCards(col);
      const node = makeNode({
        kind: "column",
        key,
        id: col.id,
        label: col.title,
        emoji: col.emoji || "",
        color: col.color || "",
        depth,
        path,
        count: cards.length,
        done: cards.filter((c) => c.done).length,
      });

      if (isCollapsed(key)) {
        node.collapsed = true;
        node.hidden = cards.length;
        return node;
      }

      node.children = cards.map((card) => {
        const childPath = [
          ...path,
          { colId: col.id, cardId: card.id, cardTitle: card.title },
        ];
        const cardKey = `${key}/${card.id}`;
        const sub = card.board?.columns ?? [];
        const cardNode = makeNode({
          kind: "card",
          key: cardKey,
          id: card.id,
          label: card.title,
          depth: depth + 1,
          path,
          colId: col.id,
          childPath,
          card,
          hasChildren: sub.length > 0,
        });

        if (sub.length > 0) {
          if (isCollapsed(cardKey)) {
            cardNode.collapsed = true;
            cardNode.hidden = sub.length;
          } else {
            cardNode.children = walkBoard(
              card.board,
              childPath,
              depth + 2,
              `${cardKey}/`
            );
          }
        }
        return cardNode;
      });
      return node;
    });

  return makeNode({
    kind: "root",
    key: "",
    label: rootLabel,
    depth: 0,
    path: [],
    children: walkBoard(root, [], 1, ""),
  });
}

/** Leaves under a node — the unit angular space is shared out by */
function countLeaves(node: MindNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((n, c) => n + countLeaves(c), 0);
}

/**
 * Place every node on a disc: angle proportional to how many leaves the branch
 * carries, radius set by depth.
 *
 * Sharing the angle by leaf count rather than evenly per sibling is what keeps
 * a dense branch from overlapping itself while a thin one wastes a whole
 * quadrant.
 */
export function radialLayout(
  tree: MindNode,
  options: { radiusStep?: number; startAngle?: number; sweep?: number } = {},
): { nodes: PlacedNode[]; edges: MindEdge[]; maxRadius: number; depth: number } {
  const {
    radiusStep = 150,
    startAngle = -Math.PI / 2, // straight up, so the first branch reads first
    sweep = Math.PI * 2,
  } = options;

  const nodes: PlacedNode[] = [];
  const edges: MindEdge[] = [];

  const place = (node: MindNode, angleFrom: number, angleTo: number, parent: PlacedNode | null): PlacedNode => {
    const mid = (angleFrom + angleTo) / 2;
    const radius = node.depth * radiusStep;
    const placed: PlacedNode = {
      ...node,
      angle: mid,
      radius,
      x: Math.cos(mid) * radius,
      y: Math.sin(mid) * radius,
      angleFrom,
      angleTo,
    };
    nodes.push(placed);
    if (parent) edges.push({ from: parent, to: placed, key: `${parent.key}->${placed.key}` });

    const total = countLeaves(node);
    let cursor = angleFrom;
    for (const child of node.children) {
      const share = (countLeaves(child) / total) * (angleTo - angleFrom);
      place(child, cursor, cursor + share, placed);
      cursor += share;
    }
    return placed;
  };

  place(tree, startAngle, startAngle + sweep, null);

  const radii = nodes.map((n) => n.radius);
  return {
    nodes,
    edges,
    maxRadius: radii.length ? Math.max(...radii) : 0,
    depth: nodes.reduce((d, n) => Math.max(d, n.depth), 0),
  };
}

/**
 * Keys of the nodes sitting at or below a depth, so a narrow screen can open
 * on the first rings instead of a disc it has to shrink into illegibility.
 */
export function keysBelowDepth(tree: MindNode, depth: number): Set<string> {
  const keys = new Set<string>();
  const walk = (node: MindNode) => {
    if (node.depth >= depth && node.children.length > 0) keys.add(node.key);
    node.children.forEach(walk);
  };
  walk(tree);
  return keys;
}

/** Keys of every node that has children — for expand/collapse all */
export function allNodeKeys(tree: MindNode): Set<string> {
  const keys = new Set<string>();
  const walk = (node: MindNode) => {
    if (node.children.length > 0 || node.hidden > 0) {
      if (node.key !== "") keys.add(node.key);
    }
    node.children.forEach(walk);
  };
  walk(tree);
  return keys;
}
