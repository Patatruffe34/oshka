import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { makeDefaultLabels } from "../../src/lib/board-utils";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import type { RootBoard, Settings } from "../../src/lib/types";

/** A refusal worth showing to the model as is, rather than a crash. */
export class ToolError extends Error {}

/** What the tools work on: the tree, and the settings that shape its rules */
export interface ToolState {
  root: RootBoard;
  settings: Settings;
}

const boardRef = (uid: string) => getFirestore().collection("boards").doc(uid);

/** Same reading as useBoard's deserialize, old formats included. */
const read = (data: DocumentData): ToolState => {
  const root = data.boardJson ? JSON.parse(data.boardJson) : data.board;
  if (root && !root.labels) root.labels = makeDefaultLabels();
  return { root, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
};

const NO_BOARD = "No board yet: open Oshka once to create it.";

export async function loadBoard(uid: string): Promise<ToolState> {
  const snap = await boardRef(uid).get();
  if (!snap.exists) throw new ToolError(NO_BOARD);
  return read(snap.data()!);
}

/**
 * Read, change and write back the tree in one transaction.
 *
 * `change` gets {root, settings}, may mutate root or replace it, and returns
 * what the tool reports. Firestore replays it on contention, against a fresh
 * read each time — so it must not reach outside what it is handed.
 *
 * Only boardJson is written: trash, favorites and settings belong to the app.
 * The app picks up the write through its listener or merges it transactionally
 * with its own in-flight draft; conflicts remain visible and unsaved.
 */
export async function updateBoard<T>(uid: string, change: (state: ToolState) => T): Promise<T> {
  const ref = boardRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ToolError(NO_BOARD);
    const state = read(snap.data()!);
    const result = change(state);
    tx.update(ref, { boardJson: JSON.stringify(state.root), updatedAt: new Date() });
    return result;
  });
}
