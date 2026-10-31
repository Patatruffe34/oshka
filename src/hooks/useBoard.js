import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, runTransaction, onSnapshot } from "firebase/firestore";
import { mergeBoardState, boardStateEqual, encodeBoard, draftStore } from "../lib/board-sync";
import { db } from "../lib/firebase";
import {
  getBoardAtPath,
  resolveBoardAtPath,
  setAtPath,
  applyRanks,
  makeCard,
  makeCol,
  resolvePathFromIds,
  moveCardBetweenColumns,
  visibleCards,
  isDoneColumn,
  markCardDone,
  markBranchDone,
  fileUnderDone,
  moveCardAcrossBoards,
  moveColumnAcrossBoards,
  duplicateCard,
  sortColumnCards,
  makeDefaultLabels,
  makeChecklist,
  makeChecklistItem,
  boardLabels,
  cardLabels,
  cardChecklists,
  stripLabelFromTree,
  deepClone,
  uid,
  EMPTY_BOARD,
  dayFromNow,
} from "../lib/board-utils";
import { isRepeating, nextOccurrence, rollCardOver, normalizeRepeat } from "../lib/repeat";
import { archiveCompletedCards, purgeArchivedCards } from "../lib/archives";
import { captureInboxCard, editInboxCard, updateInboxCard, fileInboxCard, inboxCards, removeInboxCard, moveCardIntoInbox, reorderInboxCards } from "../lib/inbox";
import { DEFAULT_SETTINGS } from "../lib/settings";

export { DEFAULT_SETTINGS };

/** Delay before an auto-archived card slides away, so the user sees it tick */
const AUTO_ARCHIVE_DELAY = 1200;

/** How many steps back the undo stack keeps */
const HISTORY_LIMIT = 40;
/** Same-label mutations closer than this fold into one undo step */
const COALESCE_MS = 700;
/** Passed by callers that already recorded their own snapshot */
const SKIP_SNAPSHOT = Symbol("skip");

/** Encode path as URL hash: #col1:card1/col2:card2 */
function pathToHash(path) {
  if (path.length === 0) return "";
  return "#" + path.map((p) => `${p.colId}:${p.cardId}`).join("/");
}

/** Parse a hash string into [{colId, cardId}] segments */
function parseHash(hash) {
  const raw = hash.replace(/^#/, "");
  if (!raw) return [];
  return raw.split("/").map((s) => {
    const [colId, cardId] = s.split(":");
    return colId && cardId ? { colId, cardId } : null;
  }).filter(Boolean);
}

// Capture the initial hash immediately at module load (before any React effects run)
const INITIAL_HASH_SEGMENTS = parseHash(window.location.hash);

/**
 * Where the user was when they last left.
 *
 * The installed app always starts at "/", so the URL hash — which carries the
 * path while browsing — is gone by the time it reopens. This remembers it.
 * A hash in the URL still wins: a shared deep link must not be overridden.
 */
const LAST_PATH_KEY = "oshka_last_path";

const readLastPath = () => {
  try {
    const raw = localStorage.getItem(LAST_PATH_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const INITIAL_SEGMENTS =
  INITIAL_HASH_SEGMENTS.length > 0 ? INITIAL_HASH_SEGMENTS : readLastPath();

export function useBoard(userId) {
  const [root, setRoot] = useState(null);
  const [path, setPath] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [trash, setTrash] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [navigating, setNavigating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState([]);
  const sessionRef = useRef(null);
  const delayed = useRef(new Set());

  // Keep latest state in refs for async access (saves, flush, onSnapshot guard).
  // Synced in an effect so nothing writes to a ref during render; effects run
  // before the 300ms save timer, so the refs are always current when it fires.
  const rootRef = useRef(root);
  const favRef = useRef(favorites);
  const trashRef = useRef(trash);
  const settingsRef = useRef(settings);
  useEffect(() => {
    rootRef.current = root;
    favRef.current = favorites;
    trashRef.current = trash;
    settingsRef.current = settings;
  });

  // Flag: when true, the next render will schedule a Firestore save
  const needsSave = useRef(false);
  // ── Undo / redo ──
  // Snapshots of {root, trash} taken before each mutation. The whole tree lives
  // in memory anyway, so keeping a few dozen copies of it costs little.
  const past = useRef([]);
  const future = useRef([]);
  const lastSnapshot = useRef({ label: null, at: 0 });
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const [lastUndone, setLastUndone] = useState(null);

  // A session owns its draft, transaction and callbacks. Closing one account
  // cannot complete a read or schedule a write against the next account.
  useEffect(() => {
    const session = { active: true, loaded: false, dirty: false, inFlight: false, base: null, latest: null, timer: null, snapshotVersion: 0 };
    sessionRef.current = session;
    needsSave.current = false;
    const resetHistory = () => {
      past.current = []; future.current = [];
      lastSnapshot.current = { label: null, at: 0 };
      setHistorySize({ undo: 0, redo: 0 }); setLastUndone(null);
    };
    const apply = (state) => {
      rootRef.current = state.root; favRef.current = state.favorites;
      trashRef.current = state.trash; settingsRef.current = state.settings;
      setRoot(state.root); setFavorites(state.favorites); setTrash(state.trash); setSettings(state.settings);
      session.latest = state;
    };
    const legacyLabels = makeDefaultLabels().map((label) => ({ ...label, id: `default-${label.color}` }));
    const empty = () => ({ root: { ...EMPTY_BOARD, labels: makeDefaultLabels(), inbox: [] }, trash: [], favorites: [], settings: { ...DEFAULT_SETTINGS } });
    const decode = (data) => {
      const root = data.boardJson ? JSON.parse(data.boardJson) : data.board;
      if (!root || !Array.isArray(root.columns)) throw new Error("invalid-board");
      return { root: { ...root, inbox: root.inbox || [], labels: root.labels || legacyLabels },
        trash: data.trashJson ? JSON.parse(data.trashJson) : (data.trash || []),
        favorites: data.favorites || [], settings: { ...DEFAULT_SETTINGS, ...data.settings } };
    };
    // Account changes are an external security boundary: discard the previous session before loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    apply({ ...empty(), root: null }); resetHistory(); setSaving(false); setSaveError(null); setRecoveryDrafts([]);
    setPath([]);
    if (!userId) return () => { session.active = false; };
    const drafts = draftStore(userId);
    const docRef = doc(db, "boards", userId);
    const errorCode = (error) => error.code === "conflict" ? "conflict" : error.code === "too-large" ? "too-large" : "failed";
    session.persist = () => {
      if (!session.loaded || !session.dirty) return;
      try { drafts.write({ base: session.base, local: session.latest, savedAt: new Date().toISOString() }); return true; }
      catch { if (session.active) setSaveError("storage"); return false; }
    };
    const refresh = () => {
      const version = session.snapshotVersion;
      getDoc(docRef).then((snap) => {
        // A read started before a newer live snapshot must not rewind it.
        if (session.active && version === session.snapshotVersion) receive(snap);
      }).catch(() => { if (session.active) setSaveError("failed"); });
    };
    session.flush = async () => {
      clearTimeout(session.timer); session.timer = null;
      if (!session.active || !session.loaded || !session.dirty || session.inFlight) return;
      const stored = session.persist();
      if (!navigator.onLine) { if (stored) setSaveError("offline"); return; }
      const submitted = session.latest, base = session.base;
      session.inFlight = true; setSaving(true);
      try {
        const committed = await runTransaction(db, async (tx) => {
          const snap = await tx.get(docRef);
          if (!session.active) throw new Error("closed-session");
          // Deletion of an existing remote board is a conflict, not permission
          // to resurrect an entire stale tree.
          if (!snap.exists() && base !== null) throw Object.assign(new Error("conflict"), { code: "conflict" });
          const remote = snap.exists() ? decode(snap.data()) : null;
          const initial = { root: { ...EMPTY_BOARD, inbox: [], labels: submitted.root.labels }, trash: [], favorites: [], settings: { ...DEFAULT_SETTINGS } };
          const result = base === null ? (remote ? mergeBoardState(initial, submitted, remote) : submitted) : mergeBoardState(base, submitted, remote);
          tx.set(docRef, encodeBoard(result), { merge: true });
          return result;
        });
        if (!session.active) return;
        // Typing may continue while the transaction is awaiting the server.
        const latest = mergeBoardState(submitted, session.latest, committed);
        if (!boardStateEqual(committed, submitted)) resetHistory();
        session.base = committed;
        session.dirty = !boardStateEqual(latest, committed);
        apply(latest);
        setSaveError(null);
        if (session.dirty) { session.persist(); session.timer = setTimeout(session.flush, 300); }
        else { try { drafts.clear(); } catch { /* Saving succeeded; a leftover draft is harmless. */ } }
      } catch (error) {
        if (session.active) { setSaveError(errorCode(error)); session.persist(); }
      } finally {
        session.inFlight = false;
        if (session.active) {
          setSaving(false);
          // A capture can arrive after the commit but before its promise
          // settles. Re-read once, instead of dropping that notification.
          if (!session.dirty && session.refreshNeeded) { session.refreshNeeded = false; refresh(); }
        }
      }
    };
    session.retry = () => session.loaded ? session.flush() : refresh();
    session.schedule = () => {
      session.persist(); clearTimeout(session.timer);
      session.timer = setTimeout(session.flush, 300);
    };
    session.export = () => {
      const blob = new Blob([JSON.stringify({ ...session.latest, otherDrafts: drafts.others() }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "oshka-backup.json"; a.click(); URL.revokeObjectURL(url);
    };
    session.reload = async () => {
      if (session.inFlight || !navigator.onLine) return;
      const beforeReload = session.latest;
      try {
        const remote = await runTransaction(db, async (tx) => {
          const snap = await tx.get(docRef);
          if (!snap.exists()) throw new Error("missing-board");
          return decode(snap.data());
        });
        if (!session.active) return;
        if (session.latest !== beforeReload) { setSaveError("conflict"); return; }
        clearTimeout(session.timer); session.base = remote; session.dirty = false;
        needsSave.current = false; apply(remote); resetHistory(); drafts.clear(); setSaveError(null);
      } catch { if (session.active) setSaveError("failed"); }
    };
    session.recover = (draft) => {
      // Other tabs' drafts are never deleted here. A merge is idempotent when
      // the originating tab has already saved the same changes.
      try {
        const recovered = mergeBoardState(draft.base, draft.local, session.latest);
        apply(recovered); session.dirty = true; resetHistory(); session.schedule();
      } catch { setSaveError("conflict"); }
    };
    const receive = (snap) => {
      session.snapshotVersion++;
      if (!session.active) return;
      if (session.dirty || session.inFlight) { session.refreshNeeded = true; return; }
      try {
        if (!snap.exists()) {
          // Never create from an offline cache miss.
          if (snap.metadata?.fromCache) return;
          if (session.loaded) { setSaveError("conflict"); return; }
        }
        const remote = snap.exists() ? decode(snap.data()) : null;
        if (!session.loaded) {
          const draft = drafts.read();
          session.loaded = true;
          session.base = draft ? draft.base : remote;
          session.dirty = Boolean(draft) || !remote;
          apply(draft ? draft.local : (remote || empty()));
          setRecoveryDrafts(drafts.others());
          if (session.dirty) session.schedule();
        } else if (!boardStateEqual(remote, session.base)) {
          session.base = remote; apply(remote); resetHistory();
        }
        if (!session.dirty) setSaveError(null);
      } catch { setSaveError("failed"); }
    };
    const ownDraft = drafts.read();
    if (ownDraft?.local?.root && Array.isArray(ownDraft.local.root.columns)) {
      session.loaded = true; session.base = ownDraft.base; session.dirty = true;
      apply(ownDraft.local); setRecoveryDrafts(drafts.others()); session.schedule();
    }
    // Keep getDoc for the initial load, but do not let it rewind a newer live
    // snapshot or a user edit that has already arrived.
    getDoc(docRef).then((snap) => { if (!session.loaded) receive(snap); }).catch(() => {
      if (session.active && !session.loaded) setSaveError("failed");
    });
    const unsubscribe = onSnapshot(docRef, receive, () => { if (session.active) setSaveError("failed"); });
    const onVisibility = () => { if (document.visibilityState === "hidden") { session.persist(); session.flush(); } };
    const onUnload = (event) => {
      session.persist();
      if (session.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("online", session.flush);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    const timers = delayed.current;
    return () => {
      session.persist(); session.active = false;
      clearTimeout(session.timer); timers.forEach(clearTimeout); timers.clear(); unsubscribe();
      window.removeEventListener("online", session.flush);
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (needsSave.current && session?.active && session.loaded) {
      needsSave.current = false;
      session.latest = { root: rootRef.current, favorites: favRef.current, trash: trashRef.current, settings: settingsRef.current };
      session.schedule();
    }
  });

  const touch = () => {
    const session = sessionRef.current;
    if (!session?.active || !session.loaded) return;
    session.dirty = true;
    needsSave.current = true;
  };
  const later = (action, delay) => {
    const session = sessionRef.current;
    const timer = setTimeout(() => {
      delayed.current.delete(timer);
      if (session?.active) action();
    }, delay);
    delayed.current.add(timer);
  };
  const retrySave = () => sessionRef.current?.retry?.();
  const exportBackup = () => sessionRef.current?.export?.();
  const reloadSaved = () => sessionRef.current?.reload?.();
  const recoverDraft = (draft) => sessionRef.current?.recover?.(draft);

  /**
   * Record the state about to change.
   *
   * Typing a card title fires a mutation per keystroke, so consecutive
   * snapshots carrying the same label within a short window are folded into
   * one — otherwise undo would walk back letter by letter.
   */
  const snapshot = (label) => {
    const now = Date.now();
    const merge =
      label != null &&
      lastSnapshot.current.label === label &&
      now - lastSnapshot.current.at < COALESCE_MS;
    lastSnapshot.current = { label, at: now };
    if (merge) return;

    past.current.push({
      root: rootRef.current,
      trash: trashRef.current,
      label,
    });
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    setHistorySize({ undo: past.current.length, redo: 0 });
  };

  /** Apply a recorded state without recording it again */
  const restore = useCallback((entry) => {
    setRoot(entry.root);
    setTrash(entry.trash);
    lastSnapshot.current = { label: null, at: 0 };
    touch();
  }, []);

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (!entry) return false;
    future.current.push({
      root: rootRef.current,
      trash: trashRef.current,
      label: entry.label,
    });
    restore(entry);
    setHistorySize({ undo: past.current.length, redo: future.current.length });
    setLastUndone({ label: entry.label, at: Date.now(), direction: "undo" });
    return true;
  }, [restore]);

  const redo = useCallback(() => {
    const entry = future.current.pop();
    if (!entry) return false;
    past.current.push({
      root: rootRef.current,
      trash: trashRef.current,
      label: entry.label,
    });
    restore(entry);
    setHistorySize({ undo: past.current.length, redo: future.current.length });
    setLastUndone({ label: entry.label, at: Date.now(), direction: "redo" });
    return true;
  }, [restore]);

  // ── Derived state ──
  const currentBoard = root
    ? getBoardAtPath(
        root,
        path.map((p) => ({ colId: p.colId, cardId: p.cardId }))
      )
    : null;

  // ── URL hash restore ──
  const initialPathRestored = useRef(false);
  // Only skip the first hash write when the hash was genuinely in the URL —
  // restoring from storage must still put it there, and set the title.
  const skipHashSync = useRef(INITIAL_HASH_SEGMENTS.length > 0);

  useEffect(() => {
    if (!root || initialPathRestored.current) return;
    initialPathRestored.current = true;
    if (INITIAL_SEGMENTS.length > 0) {
      // Cards may have been deleted since; resolvePathFromIds stops at the
      // first missing one rather than landing nowhere.
      const resolved = resolvePathFromIds(root, INITIAL_SEGMENTS);
      if (resolved.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot restore of the entry point, guarded by initialPathRestored
        setPath(resolved);
      } else {
        skipHashSync.current = false;
      }
    }
    window.history.replaceState({ path: INITIAL_SEGMENTS }, "");
  }, [root]);

  // Remember the position for the next launch
  useEffect(() => {
    if (!initialPathRestored.current) return;
    try {
      const segments = path.map((p) => ({ colId: p.colId, cardId: p.cardId }));
      localStorage.setItem(LAST_PATH_KEY, JSON.stringify(segments));
    } catch {
      // Private mode or a full quota: reopening at the root is a fine fallback
    }
  }, [path]);

  // Update document title and URL hash based on path
  useEffect(() => {
    if (!initialPathRestored.current) return;
    if (skipHashSync.current) {
      skipHashSync.current = false;
      return;
    }
    if (path.length === 0) {
      document.title = "Oshka";
    } else {
      const trail = path.map((p) => p.cardTitle).join(" › ");
      document.title = `${trail} · Oshka`;
    }
    const newHash = pathToHash(path);
    if (window.location.hash !== newHash) {
      window.history.replaceState(window.history.state, "", newHash || window.location.pathname);
    }
    return () => { document.title = "Oshka"; };
  }, [path]);

  // Browser history integration
  useEffect(() => {
    const handlePopState = (e) => {
      const state = e.state;
      if (state && Array.isArray(state.path) && root) {
        const resolved = resolvePathFromIds(root, state.path);
        setNavigating(true);
        later(() => {
          setPath(resolved);
          setNavigating(false);
        }, 120);
      } else {
        setNavigating(true);
        later(() => {
          setPath([]);
          setNavigating(false);
        }, 120);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [root]);

  // ── Navigation ──
  const navigate = useCallback((newPath) => {
    setNavigating(true);
    const segments = newPath.map((p) => ({ colId: p.colId, cardId: p.cardId }));
    later(() => {
      setPath(newPath);
      setNavigating(false);
      window.history.pushState({ path: segments }, "");
    }, 120);
  }, []);

  const enterCard = useCallback(
    (card, colId) => {
      navigate([...path, { colId, cardId: card.id, cardTitle: card.title }]);
    },
    [path, navigate]
  );

  const goToBreadcrumb = useCallback(
    (idx) => {
      if (idx === -1) navigate([]);
      else navigate(path.slice(0, idx + 1));
    },
    [path, navigate]
  );

  // ── Board mutations ──
  // Updaters must stay pure: React StrictMode invokes them twice in dev.
  /**
   * Run an updater on any board in the tree.
   *
   * The week view shows cards from everywhere at once and can open one where
   * it stands, so a mutation cannot assume the board you happen to be on.
   */
  const mutateAt = useCallback((segments, updater, label) => {
    if (label !== SKIP_SNAPSHOT) snapshot(label);
    setRoot((prev) => setAtPath(prev, segments, updater));
    touch();
  }, []);

  const mutate = useCallback(
    (updater, label) => {
      mutateAt(
        path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
        updater,
        label
      );
    },
    [path, mutateAt]
  );

  /** The board a mutation should land on: the one named, or the one we are on */
  const aim = useCallback(
    (at) => at ?? path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
    [path]
  );

  /**
   * Add a card to a column on any board, with its fields already set.
   *
   * Built before the mutation rather than inside it: makeCard draws an id, and
   * an updater runs twice in strict mode. And it lands in one step, so a card
   * created with a date is undone in one.
   */
  const addCardAt = useCallback(
    (segments, colId, title, fields = {}) => {
      const card = { ...makeCard(title), ...fields };
      mutateAt(segments, (board) => {
        const col = board.columns.find((c) => c.id === colId);
        if (col) col.cards.push(card);
        return board;
      }, "add_card");
      return card;
    },
    [mutateAt]
  );

  const addCard = useCallback(
    (colId, title) => {
      mutate((board) => {
        const col = board.columns.find((c) => c.id === colId);
        if (col) col.cards.push(makeCard(title));
        return board;
      }, "add_card");
    },
    [mutate]
  );

  /** Build the trash entry for a deletion happening at the current path */
  const makeTrashItem = useCallback(
    (payload) => ({
      id: uid(),
      ...payload,
      path: payload.path ?? path.map((p) => ({ colId: p.colId, cardId: p.cardId, cardTitle: p.cardTitle })),
      deletedAt: new Date().toISOString(),
    }),
    [path]
  );

  const deleteCard = useCallback(
    (colId, cardId, at) => {
      const segments = aim(at);
      const board = resolveBoardAtPath(rootRef.current, segments);
      const col = board?.columns.find((c) => c.id === colId);
      const card = col?.cards.find((c) => c.id === cardId);
      if (!card) return;

      snapshot("delete_card");
      const item = makeTrashItem({
        type: "card",
        path: resolvePathFromIds(rootRef.current, segments),
        card: deepClone(card),
        colId,
        colTitle: col.title,
      });
      setTrash((prev) => [...prev, item]);
      mutateAt(segments, (b) => {
        const c = b.columns.find((x) => x.id === colId);
        if (c) c.cards = c.cards.filter((x) => x.id !== cardId);
        return b;
      }, SKIP_SNAPSHOT);
    },
    [aim, mutateAt, makeTrashItem]
  );

  const renameCard = useCallback(
    (colId, cardId, title) => {
      mutate((board) => {
        const card = board.columns
          .find((c) => c.id === colId)
          ?.cards.find((c) => c.id === cardId);
        if (card) card.title = title;
        return board;
      }, "rename_card");
    },
    [mutate]
  );

  const updateCard = useCallback(
    (colId, cardId, fields, at) => {
      mutateAt(aim(at), (board) => {
        const card = board.columns
          .find((c) => c.id === colId)
          ?.cards.find((c) => c.id === cardId);
        if (card) Object.assign(card, fields);
        return board;
      }, "update_card");
    },
    [mutateAt, aim]
  );

  /**
   * Move a card to a column on another board. Returns false when the move was
   * refused — the only real case is a destination inside the card's own subtree.
   */
  const moveCardTo = useCallback(
    (colId, cardId, destPath, destColId, at) => {
      const from = {
        path: at ?? path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
        colId,
        cardId,
      };
      const next = moveCardAcrossBoards(rootRef.current, from, {
        path: destPath,
        colId: destColId,
      });
      if (!next) return false;

      // Dropping and moving are the same deposit, so the rule is the same.
      // next is freshly built and not state yet, so it can still be touched.
      if (settingsRef.current.doneOnDrop) {
        const destBoard = getBoardAtPath(next, destPath);
        if (isDoneColumn(destBoard?.columns.find((c) => c.id === destColId))) {
          const landed = destBoard.columns
            .find((c) => c.id === destColId)
            ?.cards.find((c) => c.id === cardId);
          // A repeating card moves on rather than finishes, here as anywhere
          if (isRepeating(landed)) {
            rollCardOver(landed, nextOccurrence(landed.dueAt, landed.repeat));
          } else {
            markCardDone(destBoard, destColId, cardId);
          }
        }
      }

      snapshot("move_card");
      setRoot(next);
      touch();
      return true;
    },
    [path]
  );

  /** Copy a card, subtree included, right after the original */
  const duplicateCardAt = useCallback(
    (colId, cardId, at) => {
      mutateAt(aim(at), (board) => {
        const col = board.columns.find((c) => c.id === colId);
        const index = col?.cards.findIndex((c) => c.id === cardId);
        if (index == null || index < 0) return board;
        col.cards.splice(index + 1, 0, duplicateCard(col.cards[index]));
        return board;
      }, "duplicate_card");
    },
    [mutateAt, aim]
  );

  const sortColumn = useCallback(
    (colId, key) => {
      mutate((board) => {
        const col = board.columns.find((c) => c.id === colId);
        if (col) sortColumnCards(col, key);
        return board;
      }, "sort_col");
    },
    [mutate]
  );

  const setCardArchived = useCallback(
    (colId, cardId, archived, at) => {
      updateCard(colId, cardId, { archived }, at);
    },
    [updateCard]
  );

  /**
   * Toggle a card's done state.
   *
   * Returns what happened: "done" when the card was just finished, "repeated"
   * when it moved on to its next occurrence instead, and false when it was
   * simply un-ticked. The caller celebrates either of the first two, but only
   * a finished card is worth asking about the work inside it.
   *
   * Auto-archiving is deferred so the tick is visible.
   */
  const toggleCardDone = useCallback(
    (colId, cardId, at) => {
      const segments = at ?? path.map((p) => ({ colId: p.colId, cardId: p.cardId }));
      const board = getBoardAtPath(rootRef.current, segments);
      const card = board?.columns
        .find((c) => c.id === colId)
        ?.cards.find((c) => c.id === cardId);
      if (!card) return false;

      /* A card that comes back is not finished by a tick — it moves on. None
         of what follows applies to it: no ✅ column, no archive, no offer to
         finish its branch, because it never became done. */
      if (!card.done && isRepeating(card)) {
        // Decided here: an updater runs twice in strict mode, and "the first
        // date after today" must not be worked out twice.
        const next = nextOccurrence(card.dueAt, card.repeat);
        mutateAt(segments, (b) => {
          const target = b.columns
            .find((c) => c.id === colId)
            ?.cards.find((c) => c.id === cardId);
          rollCardOver(target, next);
          return b;
        }, "repeat_card");
        return "repeated";
      }

      const becomingDone = !card.done;
      // Drawn before the mutation: an updater runs twice in strict mode, and
      // two runs would stamp two different instants.
      const stamp = becomingDone ? new Date().toISOString() : null;
      const filing =
        becomingDone &&
        settingsRef.current.moveOnDone &&
        isDoneColumn(board.columns.find(isDoneColumn)) &&
        board.columns.find(isDoneColumn).id !== colId;

      mutateAt(segments, (b) => {
        const col = b.columns.find((c) => c.id === colId);
        const target = col?.cards.find((c) => c.id === cardId);
        if (!target) return b;
        target.done = becomingDone;
        target.doneAt = stamp;
        // Same step as the tick, so one undo puts both back
        if (filing) fileUnderDone(b, colId, cardId);
        return b;
      }, "toggle_done");

      if (becomingDone && settingsRef.current.autoArchiveDone) {
        // The card may have just changed column — archive it where it landed
        const landed = filing ? board.columns.find(isDoneColumn).id : colId;
        later(() => setCardArchived(landed, cardId, true, segments), AUTO_ARCHIVE_DELAY);
      }
      return becomingDone ? "done" : false;
    },
    [path, mutateAt, setCardArchived]
  );

  /**
   * Finish a card's whole branch: everything unfinished inside it, at any depth.
   *
   * The card is found by id rather than by column. Ticking it may have just
   * filed it under ✅, so the column it was in a moment ago is no longer the
   * one it is in — and this runs right after that tick.
   */
  const finishBranch = useCallback(
    (at, cardId) => {
      // Drawn outside: an updater runs twice in strict mode, and two runs
      // would stamp a branch with two different instants.
      const stamp = new Date().toISOString();
      const file = settingsRef.current.moveOnDone;
      mutateAt(aim(at), (board) => {
        const card = board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
        if (card?.board) markBranchDone(card.board, { stamp, file });
        return board;
      }, "finish_branch");
    },
    [mutateAt, aim]
  );

  const addCol = useCallback(
    (title) => {
      mutate((board) => {
        board.columns.push(makeCol(title));
        return board;
      }, "add_col");
    },
    [mutate]
  );

  const deleteCol = useCallback(
    (colId) => {
      const board = getBoardAtPath(
        rootRef.current,
        path.map((p) => ({ colId: p.colId, cardId: p.cardId }))
      );
      const col = board?.columns.find((c) => c.id === colId);
      if (!col) return;

      // A column carries its whole recursive subtree — it must be recoverable.
      snapshot("delete_col");
      const index = board.columns.indexOf(col);
      setTrash((prev) => [
        ...prev,
        makeTrashItem({ type: "column", col: deepClone(col), index }),
      ]);
      mutate((b) => {
        b.columns = b.columns.filter((c) => c.id !== colId);
        return b;
      }, "delete_col");
    },
    [path, mutate, makeTrashItem]
  );

  /** Move a whole column to another board. False when refused (cycle). */
  const moveColumnTo = useCallback(
    (colId, destPath) => {
      const from = {
        path: path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
        colId,
      };
      const next = moveColumnAcrossBoards(rootRef.current, from, { path: destPath });
      if (!next) return false;
      snapshot("move_col");
      setRoot(next);
      touch();
      return true;
    },
    [path]
  );

  const renameCol = useCallback(
    (colId, title) => {
      mutate((board) => {
        const col = board.columns.find((c) => c.id === colId);
        if (col) col.title = title;
        return board;
      }, "rename_col");
    },
    [mutate]
  );

  const updateColEmoji = useCallback(
    (colId, emoji) => {
      mutate((board) => {
        const col = board.columns.find((c) => c.id === colId);
        if (col) col.emoji = emoji;
        return board;
      }, "col_emoji");
    },
    [mutate]
  );

  const updateColColor = useCallback(
    (colId, color) => {
      mutate((board) => {
        const col = board.columns.find((c) => c.id === colId);
        if (col) col.color = color;
        return board;
      }, "col_color");
    },
    [mutate]
  );

  const reorderCards = useCallback(
    (sourceColId, destColId, sourceIdx, destIdx) => {
      // Worked out before the mutation: mutate's updater runs inside setRoot
      // and may be replayed, so it is no place to decide a follow-up action.
      const board = getBoardAtPath(
        rootRef.current,
        path.map((p) => ({ colId: p.colId, cardId: p.cardId }))
      );
      const source = board?.columns.find((c) => c.id === sourceColId);
      const moved = source ? visibleCards(source)[sourceIdx] : null;
      const finishing =
        settingsRef.current.doneOnDrop &&
        sourceColId !== destColId &&
        isDoneColumn(board?.columns.find((c) => c.id === destColId)) &&
        moved != null &&
        !moved.done;
      /* Dropping in ✅ says the same thing as a tick, so it gets the same
         answer: a repeating card moves on rather than finishes. It stays
         where it was dropped — the hand that put it there meant it. */
      const rolling = finishing && isRepeating(moved) ? nextOccurrence(moved.dueAt, moved.repeat) : null;

      mutate((b) => {
        moveCardBetweenColumns(b, sourceColId, destColId, sourceIdx, destIdx);
        // Same step as the move, so one undo puts both back
        if (rolling) {
          rollCardOver(
            b.columns.find((c) => c.id === destColId)?.cards.find((c) => c.id === moved.id),
            rolling
          );
        } else if (finishing) {
          markCardDone(b, destColId, moved.id);
        }
        return b;
      }, "reorder_cards");

      if (finishing && !rolling && settingsRef.current.autoArchiveDone) {
        later(() => setCardArchived(destColId, moved.id, true), AUTO_ARCHIVE_DELAY);
      }
      // Dropping in ✅ finishes a card as surely as ticking it, so the caller
      // gets told — it is the same offer to make about what is inside.
      return finishing && !rolling ? moved.id : null;
    },
    [path, mutate, setCardArchived]
  );

  const applyPreset = useCallback(
    (columns) => {
      mutate((board) => {
        board.columns = columns.map((col) => {
          const c = makeCol(col.title);
          if (col.emoji) c.emoji = col.emoji;
          return c;
        });
        return board;
      }, "apply_preset");
    },
    [mutate]
  );

  const reorderCols = useCallback(
    (sourceIdx, destIdx) => {
      mutate((board) => {
        const [moved] = board.columns.splice(sourceIdx, 1);
        board.columns.splice(destIdx, 0, moved);
        return board;
      }, "reorder_cols");
    },
    [mutate]
  );

  // ── Labels ──
  // The label set lives on the root board and is shared by the whole tree.

  const labels = boardLabels(root);

  /** Root-level mutation: labels are global, not scoped to the current path */
  const mutateRoot = useCallback((updater) => {
    setRoot((prev) => {
      const clone = deepClone(prev);
      updater(clone);
      return clone;
    });
    touch();
  }, []);

  const addLabel = useCallback(
    (name, color) => {
      mutateRoot((r) => {
        if (!r.labels) r.labels = [];
        r.labels.push({ id: uid(), name: name || "", color });
      });
    },
    [mutateRoot]
  );

  const updateLabel = useCallback(
    (labelId, fields) => {
      mutateRoot((r) => {
        const label = (r.labels || []).find((l) => l.id === labelId);
        if (label) Object.assign(label, fields);
      });
    },
    [mutateRoot]
  );

  /** Deleting a label also strips it from every card that carried it */
  const deleteLabel = useCallback(
    (labelId) => {
      mutateRoot((r) => {
        r.labels = (r.labels || []).filter((l) => l.id !== labelId);
        stripLabelFromTree(r, labelId);
      });
    },
    [mutateRoot]
  );

  const toggleCardLabel = useCallback(
    (colId, cardId, labelId, at) => {
      mutateAt(aim(at), (board) => {
        const card = board.columns
          .find((c) => c.id === colId)
          ?.cards.find((c) => c.id === cardId);
        if (!card) return board;
        const current = cardLabels(card);
        card.labels = current.includes(labelId)
          ? current.filter((id) => id !== labelId)
          : [...current, labelId];
        return board;
      }, "toggle_label");
    },
    [mutateAt, aim]
  );

  // ── Due date ──

  const setCardDue = useCallback(
    (colId, cardId, dueAt, at) => {
      updateCard(colId, cardId, { dueAt: dueAt || null }, at);
    },
    [updateCard]
  );

  /**
   * Set — or lift — a card's repetition.
   *
   * A repetition counts from the date on the card, so a card that has none
   * gets today's: without an anchor there is nothing to repeat from, and
   * silently doing nothing would be the one outcome nobody could explain.
   * Same step as the repetition, so one undo lifts both.
   */
  const setCardRepeat = useCallback(
    (colId, cardId, repeat, at) => {
      const rule = normalizeRepeat(repeat);
      // Drawn outside: an updater runs twice in strict mode
      const today = dayFromNow(0);
      mutateAt(aim(at), (board) => {
        const card = board.columns
          .find((c) => c.id === colId)
          ?.cards.find((c) => c.id === cardId);
        if (!card) return board;
        card.repeat = rule;
        if (rule && !card.dueAt) card.dueAt = today;
        return board;
      }, "set_repeat");
    },
    [mutateAt, aim]
  );

  /**
   * Set a due date on a card anywhere in the tree.
   *
   * The week view shows cards from every board at once, so it cannot go
   * through the mutations that work on wherever you happen to be standing.
   */
  const setCardDueAt = useCallback((segments, colId, cardId, dueAt) => {
    snapshot("set_due");
    setRoot((prev) =>
      setAtPath(prev, segments, (board) => {
        const card = board.columns
          .find((c) => c.id === colId)
          ?.cards.find((c) => c.id === cardId);
        if (!card) return board;
        card.dueAt = dueAt || null;
        // A hand-made rank only means something inside the lane it was made
        // in. Moving the date moves the lane, so the placing is spent — and a
        // card arriving in today unplaced is one you have yet to decide on.
        delete card.rank;
        return board;
      })
    );
    touch();
  }, []);

  /**
   * Put a lane of cards in an explicit order, wherever they live.
   *
   * One mutation for the whole lane rather than one per card: the order is a
   * single decision, so it is a single undo, and a single save.
   */
  const rankCards = useCallback((entries) => {
    snapshot("rank_cards");
    setRoot((prev) => applyRanks(prev, entries));
    touch();
  }, []);

  // ── Checklists ──

  /** Run an updater on one card's checklist array */
  const mutateChecklists = useCallback(
    (colId, cardId, updater, label = "checklist", at) => {
      mutateAt(aim(at), (board) => {
        const card = board.columns
          .find((c) => c.id === colId)
          ?.cards.find((c) => c.id === cardId);
        if (!card) return board;
        card.checklists = updater(cardChecklists(card));
        return board;
      }, label);
    },
    [mutateAt, aim]
  );

  /* `at` runs through every one of these: a checklist edited from the week
     view must land on the card's own board, not on the one behind it. */
  const addChecklist = useCallback(
    (colId, cardId, title, at) =>
      mutateChecklists(colId, cardId, (lists) => [...lists, makeChecklist(title)], "checklist", at),
    [mutateChecklists]
  );

  const renameChecklist = useCallback(
    (colId, cardId, listId, title, at) =>
      mutateChecklists(colId, cardId, (lists) =>
        lists.map((l) => (l.id === listId ? { ...l, title } : l)), "checklist", at
      ),
    [mutateChecklists]
  );

  const deleteChecklist = useCallback(
    (colId, cardId, listId, at) =>
      mutateChecklists(colId, cardId, (lists) => lists.filter((l) => l.id !== listId), "checklist", at),
    [mutateChecklists]
  );

  const addChecklistItem = useCallback(
    (colId, cardId, listId, text, at) =>
      mutateChecklists(colId, cardId, (lists) =>
        lists.map((l) =>
          l.id === listId ? { ...l, items: [...l.items, makeChecklistItem(text)] } : l
        ), "checklist", at
      ),
    [mutateChecklists]
  );

  const toggleChecklistItem = useCallback(
    (colId, cardId, listId, itemId, at) =>
      mutateChecklists(colId, cardId, (lists) =>
        lists.map((l) =>
          l.id === listId
            ? {
                ...l,
                items: l.items.map((i) =>
                  i.id === itemId ? { ...i, done: !i.done } : i
                ),
              }
            : l
        ), "checklist", at
      ),
    [mutateChecklists]
  );

  const updateChecklistItem = useCallback(
    (colId, cardId, listId, itemId, text, at) =>
      mutateChecklists(colId, cardId, (lists) =>
        lists.map((l) =>
          l.id === listId
            ? { ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, text } : i)) }
            : l
        ), "checklist", at
      ),
    [mutateChecklists]
  );

  const deleteChecklistItem = useCallback(
    (colId, cardId, listId, itemId, at) =>
      mutateChecklists(colId, cardId, (lists) =>
        lists.map((l) =>
          l.id === listId ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l
        ), "checklist", at
      ),
    [mutateChecklists]
  );

  // ── Settings ──

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    touch();
  }, []);

  // ── Favorites ──

  const favKey = (segments) => segments.map((s) => `${s.colId}:${s.cardId}`).join("/");

  /** Bookmark a position — the one given, or the one we are standing on */
  const addFavoriteAt = useCallback((at, title) => {
    if (!at || at.length === 0) return;
    const segments = at.map((p) => ({
      colId: p.colId,
      cardId: p.cardId,
      cardTitle: p.cardTitle,
    }));
    const key = favKey(segments);
    if (favRef.current.some((f) => favKey(f.path) === key)) return;

    const fav = { id: uid(), title: title || segments[segments.length - 1].cardTitle, path: segments };
    setFavorites((prev) => [...prev, fav]);
    touch();
  }, []);

  const addFavorite = useCallback(
    (title) => addFavoriteAt(path, title),
    [path, addFavoriteAt]
  );

  const removeFavorite = useCallback((favId) => {
    setFavorites((prev) => prev.filter((f) => f.id !== favId));
    touch();
  }, []);

  /** Whether a position is bookmarked, and which bookmark it is */
  const favoriteOf = useCallback(
    (at) => {
      if (!at || at.length === 0) return null;
      const key = favKey(at);
      return favorites.find((f) => favKey(f.path) === key) ?? null;
    },
    [favorites]
  );

  const pathKey = path.map((p) => `${p.colId}:${p.cardId}`).join("/");
  const isFavorited =
    path.length > 0 &&
    favorites.some((f) => f.path.map((s) => `${s.colId}:${s.cardId}`).join("/") === pathKey);

  const goToFavorite = useCallback(
    (fav) => {
      if (!root) return;
      const resolved = resolvePathFromIds(root, fav.path);
      if (resolved.length > 0) {
        navigate(resolved);
      }
    },
    [root, navigate]
  );

  // ── Trash ──

  const restoreFromTrash = useCallback((trashId) => {
    const item = trashRef.current.find((t) => t.id === trashId);
    if (!item) return;

    snapshot("restore");
    setRoot((prev) => {
      if (item.source === "inbox") return captureInboxCard(prev, deepClone(item.card));
      const clone = deepClone(prev);
      // Walk to where the item was deleted from; fall back to the root board
      // if that branch has since disappeared.
      let board = clone;
      for (const seg of item.path) {
        const col = board.columns.find((c) => c.id === seg.colId);
        const card = col?.cards.find((c) => c.id === seg.cardId);
        if (!card) { board = clone; break; }
        board = card.board;
      }

      if (item.type === "column") {
        const at = Math.min(item.index ?? board.columns.length, board.columns.length);
        board.columns.splice(at, 0, deepClone(item.col));
        return clone;
      }

      let targetCol = board.columns.find((c) => c.id === item.colId);
      if (!targetCol) {
        if (board.columns.length > 0) {
          targetCol = board.columns[0];
        } else {
          targetCol = makeCol(item.colTitle || "Restored");
          board.columns.push(targetCol);
        }
      }
      targetCol.cards.push(deepClone(item.card));
      return clone;
    });
    setTrash((prev) => prev.filter((t) => t.id !== trashId));
    touch();
  }, []);

  const permanentDeleteFromTrash = useCallback((trashId) => {
    setTrash((prev) => prev.filter((t) => t.id !== trashId));
    touch();
  }, []);

  const emptyTrash = useCallback(() => {
    setTrash([]);
    touch();
  }, []);

  const purgeArchives = useCallback(() => {
    const next = purgeArchivedCards(rootRef.current);
    if (next === rootRef.current) return;
    setRoot(next);
    setPath((current) => resolvePathFromIds(next, current));
    setFavorites((current) => current.filter((fav) =>
      resolvePathFromIds(next, fav.path).length === fav.path.length
    ));
    // Old snapshots could otherwise restore the permanently removed cards.
    past.current = [];
    future.current = [];
    lastSnapshot.current = { label: null, at: 0 };
    setHistorySize({ undo: 0, redo: 0 });
    setLastUndone(null);
    touch();
  }, []);

  const archiveDone = useCallback(() => {
    const next = archiveCompletedCards(rootRef.current);
    if (next === rootRef.current) return;
    snapshot("archive_done");
    setRoot(next);
    touch();
  }, []);

  const captureInbox = useCallback((title, { description = "" } = {}) => {
    const text = title.trim();
    if (!text || !rootRef.current) return false;
    const card = { ...makeCard(text), description, capturedAt: new Date().toISOString() };
    snapshot("inbox_capture");
    setRoot((prev) => captureInboxCard(prev, card));
    touch();
    return true;
  }, []);

  const renameInbox = useCallback((id, title) => {
    const next = editInboxCard(rootRef.current, id, title);
    if (next === rootRef.current) return false;
    snapshot("inbox_edit");
    setRoot(next);
    touch();
    return true;
  }, []);

  const updateInbox = useCallback((id, fields) => {
    const next = updateInboxCard(rootRef.current, id, fields);
    if (next === rootRef.current) return false;
    snapshot("inbox_edit");
    setRoot(next);
    touch();
    return true;
  }, []);

  const fileInbox = useCallback((id, destPath, destColId, index, labelFilter, planning = {}) => {
    const next = fileInboxCard(rootRef.current, id, destPath, destColId, {
      doneOnDrop: settingsRef.current.doneOnDrop,
      stamp: new Date().toISOString(),
      index,
      labelFilter,
      dueAt: planning.dueAt,
      lane: planning.lane,
      laneIndex: planning.index,
    });
    if (!next) return false;
    snapshot("inbox_file");
    setRoot(next);
    touch();
    return true;
  }, []);

  const moveToInbox = useCallback((sourcePath, colId, cardId, index) => {
    const next = moveCardIntoInbox(rootRef.current, sourcePath, colId, cardId, {
      index, stamp: new Date().toISOString(),
    });
    if (!next) return false;
    snapshot("inbox_move");
    setRoot(next);
    touch();
    return true;
  }, []);

  const reorderInbox = useCallback((from, to) => {
    const next = reorderInboxCards(rootRef.current, from, to);
    if (next === rootRef.current) return;
    snapshot("inbox_reorder");
    setRoot(next);
    touch();
  }, []);

  const deleteInbox = useCallback((id) => {
    const card = inboxCards(rootRef.current).find((item) => item.id === id);
    if (!card) return;
    snapshot("inbox_delete");
    const item = { id: uid(), type: "card", source: "inbox", card: deepClone(card),
      path: [], colId: null, colTitle: "Inbox", deletedAt: new Date().toISOString() };
    setTrash((prev) => [...prev, item]);
    setRoot((prev) => removeInboxCard(prev, id));
    touch();
  }, []);

  return {
    root,
    path,
    navigating,
    saving,
    saveError,
    retrySave,
    reloadSaved,
    exportBackup,
    recoveryDrafts,
    recoverDraft,
    currentBoard,
    navigate,
    enterCard,
    goToBreadcrumb,
    addCard,
    addCardAt,
    deleteCard,
    renameCard,
    updateCard,
    moveCardTo,
    duplicateCardAt,
    sortColumn,
    toggleCardDone,
    setCardArchived,
    addCol,
    deleteCol,
    moveColumnTo,
    renameCol,
    updateColEmoji,
    updateColColor,
    reorderCards,
    reorderCols,
    applyPreset,
    // History
    undo,
    redo,
    canUndo: historySize.undo > 0,
    canRedo: historySize.redo > 0,
    lastUndone,
    // Labels
    labels,
    addLabel,
    updateLabel,
    deleteLabel,
    toggleCardLabel,
    // Due date
    setCardDue,
    setCardDueAt,
    setCardRepeat,
    rankCards,
    finishBranch,
    // Checklists
    addChecklist,
    renameChecklist,
    deleteChecklist,
    addChecklistItem,
    toggleChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    // Settings
    settings,
    updateSettings,
    // Favorites
    favorites,
    addFavorite,
    addFavoriteAt,
    favoriteOf,
    removeFavorite,
    isFavorited,
    goToFavorite,
    // Trash
    trash,
    restoreFromTrash,
    permanentDeleteFromTrash,
    emptyTrash,
    purgeArchives,
    archiveDone,
    inbox: inboxCards(root),
    captureInbox,
    renameInbox,
    updateInbox,
    fileInbox,
    moveToInbox,
    reorderInbox,
    deleteInbox,
  };
}
