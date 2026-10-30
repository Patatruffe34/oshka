const admin = require("firebase-admin");
const { makeDefaultLabels, DEFAULT_SETTINGS } = require("./build/oshka.cjs");

/** A refusal worth showing to the model as is, rather than a crash. */
class ToolError extends Error {}

const boardRef = (uid) => admin.firestore().collection("boards").doc(uid);

/** Same reading as useBoard's deserialize, old formats included. */
const read = (data) => {
  const root = data.boardJson ? JSON.parse(data.boardJson) : data.board;
  if (root && !root.labels) root.labels = makeDefaultLabels();
  return { root, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
};

const NO_BOARD = "No board yet: open Oshka once to create it.";

async function loadBoard(uid) {
  const snap = await boardRef(uid).get();
  if (!snap.exists) throw new ToolError(NO_BOARD);
  return read(snap.data());
}

/**
 * Read, change and write back the tree in one transaction.
 *
 * `change` gets {root, settings}, may mutate root or replace it, and returns
 * what the tool reports. Firestore replays it on contention, against a fresh
 * read each time — so it must not reach outside what it is handed.
 *
 * Only boardJson is written: trash, favorites and settings belong to the app.
 * The app picks the write up through its snapshot listener, except while an
 * edit of its own is in flight — the known two-writer weakness described in
 * docs/ARCHITECTURE.md applies to this writer too.
 */
async function updateBoard(uid, change) {
  const ref = boardRef(uid);
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ToolError(NO_BOARD);
    const state = read(snap.data());
    const result = change(state);
    tx.update(ref, { boardJson: JSON.stringify(state.root), updatedAt: new Date() });
    return result;
  });
}

module.exports = { ToolError, loadBoard, updateBoard };
