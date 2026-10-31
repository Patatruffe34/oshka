import type { BoardDocument, BoardState, IsoDateTime, RootBoard } from "./types";

// Three-way merge: independent edits survive; competing edits are never
// resolved by silently picking a winner. Arrays of entities merge by id.
export class BoardConflict extends Error {
  code = "conflict" as const;
  constructor() { super("conflict"); }
}

export const boardStateEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && boardStateEqual(x[key], y[key]));
};
const same = boardStateEqual;
type JsonObject = Record<string, unknown>;
type Entity = JsonObject & { id: string };
const object = (v: unknown): v is JsonObject => v !== null && typeof v === "object" && !Array.isArray(v);
const entities = (v: unknown): v is Entity[] => Array.isArray(v) && v.every((x) => object(x) && typeof x.id === "string") && new Set(v.map((x) => x.id)).size === v.length;

function merge(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (entities(base) && entities(local) && entities(remote)) {
    const maps = [base, local, remote].map((items) => new Map(items.map((x) => [x.id, x])));
    const values = new Map<string, unknown>();
    for (const id of new Set([...base, ...local, ...remote].map((x) => x.id))) {
      const value = merge(maps[0].get(id), maps[1].get(id), maps[2].get(id));
      if (value !== undefined) values.set(id, value);
    }
    const common = base.filter((x) => maps[1].has(x.id) && maps[2].has(x.id)).map((x) => x.id);
    const order = (items: Entity[]) => items.map((x) => x.id).filter((id) => common.includes(id));
    const lo = order(local), ro = order(remote);
    if (!same(lo, common) && !same(ro, common) && !same(lo, ro)) throw new BoardConflict();
    const preferred = !same(lo, common) ? local : remote;
    const other = preferred === local ? remote : local;
    const ids = preferred.map((x) => x.id).filter((id) => values.has(id));
    for (let i = 0; i < other.length; i++) {
      const id = other[i].id;
      if (!values.has(id) || ids.includes(id)) continue;
      const next = other.slice(i + 1).find((x) => ids.includes(x.id));
      ids.splice(next ? ids.indexOf(next.id) : ids.length, 0, id);
    }
    return ids.map((id) => values.get(id));
  }
  if (object(base) && object(local) && object(remote)) {
    const result: JsonObject = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = merge(base[key], local[key], remote[key]);
      if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  throw new BoardConflict();
}

export function mergeBoardState(base: BoardState, local: BoardState, remote: BoardState): BoardState {
  const result = merge(base, local, remote) as BoardState;
  // Two concurrent moves to different destinations must not duplicate a card.
  const seen = new Set<string>();
  function walk(board: RootBoard | undefined) {
    for (const card of [...(board?.inbox || []), ...(board?.columns || []).flatMap((c) => c.cards)]) {
      if (seen.has(card.id)) throw new BoardConflict();
      seen.add(card.id);
      walk(card.board);
    }
  }
  walk(result.root);
  return result;
}

export function encodeBoard(state: BoardState): BoardDocument {
  const data = { boardJson: JSON.stringify(state.root), trashJson: JSON.stringify(state.trash), favorites: state.favorites, settings: state.settings, updatedAt: new Date() };
  // Leave room for document names, field overhead and future server metadata.
  if (new TextEncoder().encode(JSON.stringify(data)).length > 950_000) {
    throw Object.assign(new Error("too-large"), { code: "too-large" });
  }
  return data;
}

/** Unsaved edits, with the state they were made on top of */
export interface Draft {
  base: BoardState;
  local: BoardState;
  savedAt: IsoDateTime;
}

export interface DraftStore {
  read(): Draft | null;
  write(value: Draft): void;
  clear(): void;
  /** Drafts left by other tabs, for recovery */
  others(): (Draft & { key: string })[];
}

// A draft belongs to one account and one browser tab. Other tabs never replace
// it. Closed-tab drafts remain available for explicit recovery/export.
export function draftStore(uid: string): DraftStore {
  const prefix = `oshka_draft_v1:${encodeURIComponent(uid)}:`;
  const key = prefix + crypto.randomUUID();
  let previousKey: string | null = null, previousValue: string | null = null;
  try {
    previousKey = sessionStorage.getItem(prefix);
    // A newly opened tab can inherit sessionStorage. Always use a new writer
    // key so those two tabs cannot overwrite each other's subsequent drafts.
    if (previousKey?.startsWith(prefix)) previousValue = localStorage.getItem(previousKey);
    sessionStorage.setItem(prefix, key);
  } catch { /* Independent writer keys still work without sessionStorage. */ }
  const clearPrevious = () => {
    if (previousKey && previousValue && localStorage.getItem(previousKey) === previousValue) localStorage.removeItem(previousKey);
    previousValue = null;
  };
  return {
    read() { try { return JSON.parse(localStorage.getItem(key) || previousValue || "null"); } catch { return null; } },
    write(value) { localStorage.setItem(key, JSON.stringify(value)); clearPrevious(); },
    clear() { localStorage.removeItem(key); clearPrevious(); },
    others() {
      try { return Object.keys(localStorage).filter((k) => k.startsWith(prefix) && k !== key && !(k === previousKey && previousValue === localStorage.getItem(k))).map((k) => ({ key: k, ...JSON.parse(localStorage.getItem(k) ?? "null") })); } catch { return []; }
    },
  };
}
