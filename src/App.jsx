import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { usePlannerDrag } from "./hooks/usePlannerDrag";
import { useBoardDrag } from "./hooks/useBoardDrag";
import { INBOX_DROP_ID } from "./lib/inbox";
import { useAuth } from "./hooks/useAuth";
import { useBoard } from "./hooks/useBoard";
import { useTheme } from "./hooks/useTheme";
import { useOnline } from "./hooks/useOnline";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useMobileKeyboard } from "./hooks/useMobileKeyboard";
import { useTabs } from "./hooks/useTabs";
import { useToday } from "./hooks/useToday";
import { useI18n } from "./lib/i18n";
import { resolvePathFromIds, getBoardAtPath, subBoardStats } from "./lib/board-utils";
import { dateForLane } from "./lib/planner";
import { archiveSummary, completedCardCount } from "./lib/archives";
import { buzz } from "./lib/haptics";
import Auth from "./components/Auth";
import Header from "./components/Header";
import Board from "./components/Board";
import CardDetail from "./components/CardDetail";
import ProfileModal from "./components/ProfileModal";
import FavoritesPanel from "./components/FavoritesPanel";
import TrashPanel from "./components/TrashPanel";
import Confetti from "./components/Confetti";
import Logo from "./components/Logo";
import SearchPanel from "./components/SearchPanel";
import MoveColumnModal from "./components/MoveColumnModal";
import FinishBranchModal from "./components/FinishBranchModal";
import UndoToast from "./components/UndoToast";
import OutlinePanel from "./components/OutlinePanel";
import MindMap from "./components/MindMap";
import LoadingLogo from "./components/LoadingLogo";
import BoardFilter from "./components/BoardFilter";
import TabStrip from "./components/TabStrip";
import PlannerView from "./components/PlannerView";
import PurgeArchivesModal from "./components/PurgeArchivesModal";
import InboxPanel from "./components/InboxPanel";
import InboxCardDetail from "./components/InboxCardDetail";
import InboxPlanDestination from "./components/InboxPlanDestination";
import SharedCapture from "./components/SharedCapture";
import { clearPendingShare } from "./lib/share-target";
import "./styles/app.css";

export default function App({ initialShare = null }) {
  const authState = useAuth();
  const [pendingShare, setPendingShare] = useState(initialShare);
  // All account-owned React state (including dialogs and undo) is discarded
  // synchronously when Firebase changes users. The pending share is explicit
  // user input and intentionally survives sign-in.
  return <Workspace key={authState.user?.uid || "signed-out"} authState={authState}
    pendingShare={pendingShare} setPendingShare={setPendingShare} />;
}

function Workspace({ authState, pendingShare, setPendingShare }) {
  useMobileKeyboard();
  const { t } = useI18n();
  const { user, loading, sending, error, sendMagicLink, signInWithPassword,
    signUpWithPassword, confirmEmail, needsEmailConfirm, logout } = authState;
  const { theme, toggle: toggleTheme } = useTheme();
  const online = useOnline();
  const compact = useMediaQuery("(max-width: 640px)");
  /* Read by nothing here: a new day changing it is what re-renders the tree,
     so every badge and lane works its dates out against the new one. */
  const today = useToday();
  const {
    root,
    path,
    navigating,
    saving,
    saveError, retrySave, reloadSaved, exportBackup, recoveryDrafts, recoverDraft,
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
    undo,
    redo,
    canUndo,
    canRedo,
    lastUndone,
    labels,
    addLabel,
    updateLabel,
    deleteLabel,
    toggleCardLabel,
    setCardDue,
    setCardDueAt,
    setCardRepeat,
    rankCards,
    finishBranch,
    addChecklist,
    renameChecklist,
    deleteChecklist,
    addChecklistItem,
    toggleChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    settings,
    updateSettings,
    favorites,
    addFavorite,
    addFavoriteAt,
    favoriteOf,
    removeFavorite,
    isFavorited,
    goToFavorite,
    trash,
    restoreFromTrash,
    permanentDeleteFromTrash,
    emptyTrash,
    purgeArchives,
    archiveDone,
    inbox,
    captureInbox,
    renameInbox,
    updateInbox,
    fileInbox,
    moveToInbox,
    reorderInbox,
    deleteInbox,
  } = useBoard(user?.uid);

  const archives = useMemo(() => archiveSummary(root), [root]);
  const completedCount = useMemo(() => completedCardCount(root), [root]);

  /* Ids in, live path out — a tab never carries a title of its own */
  const resolveTab = useCallback(
    (segments) => resolvePathFromIds(root, segments) || [],
    [root]
  );
  const { tabs, activeId, select, open, close, move } = useTabs({
    path,
    navigate,
    ready: !loading && Boolean(root),
  });

  const activeTab = tabs.find((t) => t.id === activeId);
  const showingWeek = activeTab?.view === "week";

  /* Read off the tree at draw time, so a rename shows and a deletion shows */
  const labelOf = useCallback(
    (tab) => {
      if (tab.view === "week") {
        return { emoji: "", title: t("week.title"), missing: false, view: true };
      }
      /* The showing tab holds no position of its own — it *is* `path`. Reading
         its stored segments would show where it stood before you moved. */
      const showing = tab.id === activeId;
      const resolved = resolvePathFromIds(root, showing ? path : tab.segments);
      if (resolved.length === 0) {
        return { emoji: "", title: t("header.root"), missing: false };
      }
      const last = resolved[resolved.length - 1];
      if (!last) return { emoji: "", title: t("tabs.gone"), missing: true };
      const title = last.cardTitle || t("board.untitled");
      // Cards carry their emoji in the title, so the first glyph is the mark
      const lead = [...title][0];
      const isEmoji = lead && /\p{Extended_Pictographic}/u.test(lead);
      return {
        emoji: isEmoji ? lead : "",
        title: isEmoji ? title.slice(lead.length).trim() || title : title,
        missing: !showing && resolved.length < tab.segments.length,
      };
    },
    [root, t, activeId, path]
  );

  /*
   * One week tab is enough: a second would show exactly the same thing.
   *
   * On a phone there is no tab strip, so the button has to be the way back as
   * well as the way in — otherwise reaching the view is a one-way trip.
   */
  const openWeek = useCallback(() => {
    const existing = tabs.find((t) => t.view === "week");
    if (!existing) return open([], resolveTab, "week");
    if (existing.id !== activeId) return select(existing.id, resolveTab);
    const board = tabs.find((t) => !t.view);
    if (board) select(board.id, resolveTab);
  }, [tabs, activeId, select, open, resolveTab]);

  /* Go to a card's board, in a tab of its own so the week stays open, and let
     it glow until something is touched — otherwise you arrive on a board and
     have to hunt for what you just clicked. */
  const [spotlight, setSpotlight] = useState(null);
  /* Go to a board, in the tab already showing it when there is one: piling up
     duplicates of the same place is how a strip becomes unreadable. */
  const openPath = useCallback(
    (segments, { background } = {}) => {
      const key = segments.map((s) => s.cardId).join("/");
      const already = tabs.find(
        (t) => !t.view && t.segments.map((s) => s.cardId).join("/") === key
      );
      if (already) {
        if (!background) select(already.id, resolveTab);
      } else {
        open(segments, resolveTab, undefined, { background });
      }
    },
    [open, select, tabs, resolveTab]
  );

  const locate = useCallback(
    (item, opts) => {
      // The board that holds the card — you are looking for it, not going in
      openPath(item.path.map((p) => ({ colId: p.colId, cardId: p.cardId })), opts);
      setSpotlight(item.card.id);
    },
    [openPath]
  );

  useEffect(() => {
    if (!spotlight) return;
    const clear = () => setSpotlight(null);
    // Any sign of life dismisses it — it has done its job by then
    window.addEventListener("pointerdown", clear, true);
    window.addEventListener("keydown", clear, true);
    window.addEventListener("wheel", clear, true);
    return () => {
      window.removeEventListener("pointerdown", clear, true);
      window.removeEventListener("keydown", clear, true);
      window.removeEventListener("wheel", clear, true);
    };
  }, [spotlight]);

  /**
   * The "+" opens an empty tab, at the end.
   *
   * It used to open a copy of wherever you were standing, which reads as a
   * duplicate of the tab you are on — or, from the Agenda, as the last board
   * reappearing on its own, since that is the position the tree still holds.
   * A new tab is a fresh start, so it starts at the root.
   */
  const openBlank = useCallback(
    () => open([], resolveTab, undefined, { atEnd: true }),
    [open, resolveTab]
  );

  /* The shortcut handler is registered once; this is how it stays current
     without tearing it down on every tab change. */
  const tabsRef = useRef(() => {});
  useEffect(() => {
    tabsRef.current = (i) => {
      const tab = tabs[i];
      if (tab) select(tab.id, resolveTab);
    };
  }, [tabs, select, resolveTab]);

  const [detailModal, setDetailModal] = useState(null);
  const [burst, setBurst] = useState(null);
  const burstId = useRef(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxDetailId, setInboxDetailId] = useState(null);
  const [inboxPlanDrop, setInboxPlanDrop] = useState(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [movingColumn, setMovingColumn] = useState(null);
  const [finishing, setFinishing] = useState(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [labelFilter, setLabelFilter] = useState([]);

  /* `move` opens it on the move panel — the card menu's way to another board */
  const handleOpenDetail = useCallback((card, colId, { move } = {}) => {
    setDetailModal({ card, colId, move });
  }, []);

  const handleOpenCurrentCardDetail = () => {
    const segment = path[path.length - 1];
    if (!segment) return;
    const at = path.slice(0, -1).map(({ colId, cardId }) => ({ colId, cardId }));
    const card = getBoardAtPath(root, at)?.columns
      .find((col) => col.id === segment.colId)
      ?.cards.find((card) => card.id === segment.cardId);
    if (card) setDetailModal({ card, colId: segment.colId, at });
  };

  const handleCloseDetail = useCallback(() => {
    setDetailModal(null);
  }, []);

  /**
   * A card was just finished — is there unfinished work inside it?
   *
   * A card is also a board here, so a tick means one of two things and the
   * app cannot tell which. Finishing the branch on its own would destroy work
   * that is no longer in sight; leaving it strands cards nothing will surface
   * again. Asked once, with the count, and only when there is something to ask
   * about. The card itself is already done either way.
   */
  const offerBranch = useCallback(
    (cardId, segments) => {
      const board = getBoardAtPath(root, segments);
      const card = board?.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
      if (!card?.board) return;
      const stats = subBoardStats(card.board);
      const left = stats.cards - stats.done;
      if (left > 0) {
        setFinishing({ cardId, at: segments, subject: card.title, left, depth: stats.depth });
      }
    },
    [root]
  );

  const here = useCallback(
    () => path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
    [path]
  );

  const handleToggleCardDone = useCallback(
    (colId, cardId, origin, at) => {
      const outcome = toggleCardDone(colId, cardId, at);
      if (!outcome) return;
      buzz("tick");
      // A repeating card earned the same tick, so it earns the same burst
      if (settings.confetti && origin) {
        burstId.current += 1;
        setBurst({ id: burstId.current, origin });
      }
      // But not the same question: it moved on, it did not finish, and the
      // work inside it is due again with it.
      if (outcome === "done") offerBranch(cardId, at ?? here());
    },
    [toggleCardDone, settings.confetti, offerBranch, here]
  );

  const handleBurstDone = useCallback(() => setBurst(null), []);

  /** A column was dropped on the "move elsewhere" zone: ask where it should go */
  const handleColumnToZone = useCallback(
    (columnId) => {
      const col = currentBoard?.columns.find((c) => c.id === columnId);
      if (col) setMovingColumn(col);
    },
    [currentBoard]
  );

  /**
   * Jump to a search result: walk to the board holding the card, then open its
   * detail. Navigation is animated, so the modal waits for the move to land.
   */
  const handleGoToResult = useCallback(
    (result) => {
      setSearchOpen(false);
      navigate(result.path);
      setTimeout(
        () => setDetailModal({ card: result.card, colId: result.colId }),
        160
      );
    },
    [navigate]
  );

  // Grouped so CardDetail takes one stable prop instead of seven
  /* The same seven, aimed at the card's own board when it is not the one on
     screen. Wrapped rather than duplicated: one set of rules, two targets. */
  const detailChecklistActions = useMemo(() => {
    const at = detailModal?.at;
    return {
      add: (c, i, t) => addChecklist(c, i, t, at),
      rename: (c, i, l, t) => renameChecklist(c, i, l, t, at),
      remove: (c, i, l) => deleteChecklist(c, i, l, at),
      addItem: (c, i, l, t) => addChecklistItem(c, i, l, t, at),
      toggleItem: (c, i, l, it) => toggleChecklistItem(c, i, l, it, at),
      updateItem: (c, i, l, it, t) => updateChecklistItem(c, i, l, it, t, at),
      removeItem: (c, i, l, it) => deleteChecklistItem(c, i, l, it, at),
    };
  }, [detailModal, addChecklist, renameChecklist, deleteChecklist,
      addChecklistItem, toggleChecklistItem, updateChecklistItem, deleteChecklistItem]);


  const handleUnarchiveCard = useCallback(
    (colId, cardId) => setCardArchived(colId, cardId, false),
    [setCardArchived]
  );

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;

      if ((e.key === "k" && mod) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Alt rather than Cmd: in an installed window Cmd+number is free, but in
      // a browser tab it belongs to the browser, and a shortcut that works in
      // one and not the other is worse than one that always works.
      if (e.altKey && !mod && /^[1-9]$/.test(e.key) && !typing) {
        e.preventDefault();
        tabsRef.current(Number(e.key) - 1);
        return;
      }
      // Undo works while typing too — that is where a slip is most likely.
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const handleDragEnd = useCallback(
    (result) => {
      const { source, destination, type } = result;
      if (!destination || result.reason === "CANCEL") return;

      if (source.droppableId === INBOX_DROP_ID) {
        if (destination.droppableId === INBOX_DROP_ID) {
          reorderInbox(source.index, destination.index);
        } else {
          fileInbox(result.draggableId, here(), destination.droppableId, destination.index, labelFilter);
        }
        return;
      }

      if (destination.droppableId === INBOX_DROP_ID && type === "card") {
        moveToInbox(here(), source.droppableId, result.draggableId, destination.index);
        return;
      }

      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      if (type === "column") {
        reorderCols(source.index, destination.index);
      } else {
        const finished = reorderCards(
          source.droppableId,
          destination.droppableId,
          source.index,
          destination.index
        );
        // Dropping in ✅ finishes a card as surely as ticking it does
        if (finished) offerBranch(finished, here());
      }
    },
    [reorderCards, reorderCols, offerBranch, here, fileInbox, labelFilter, moveToInbox, reorderInbox]
  );

  const boardDrag = useBoardDrag({ onDragEnd: handleDragEnd, onColumnToZone: handleColumnToZone });
  const plannerDrag = usePlannerDrag({ root, settings, today, onSetDue: setCardDueAt, onReorder: rankCards, onInboxDrop: setInboxPlanDrop, onMoveToInbox: moveToInbox, onReorderInbox: reorderInbox });

  if (loading) {
    return (
      <div className="loading-page">
        <LoadingLogo />
        <span className="loading-spinner">{t("loading")}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Auth
        onSendLink={needsEmailConfirm ? confirmEmail : sendMagicLink}
        onSignInWithPassword={signInWithPassword}
        onSignUpWithPassword={signUpWithPassword}
        sending={sending}
        error={error}
        theme={theme}
        onToggleTheme={toggleTheme}
        emailConfirmMode={needsEmailConfirm}
        sharePending={Boolean(pendingShare)}
      />
    );
  }

  /*
   * Re-read from the tree rather than trusting the card the modal was opened
   * with, so edits show. Opened from the week view the card lives somewhere
   * else entirely, and looking for it on the board behind found nothing —
   * unless it happened to be the same board, which is what made this look
   * like it worked.
   */
  const detailBoard = detailModal?.at
    ? getBoardAtPath(root, detailModal.at)
    : currentBoard;
  const activeCardPath = detailModal?.at ? resolveTab(detailModal.at) : path;
  /* A favourite is a position you jump to, so favouriting a card means
     bookmarking the way *into* it — one step past the board holding it. */
  const detailInto =
    activeCardPath && detailModal
      ? [...activeCardPath, {
          colId: detailModal.colId,
          cardId: detailModal.card.id,
          cardTitle: detailModal.card.title,
        }]
      : null;
  const detailFavorite = favoriteOf(detailInto);

  const activeCard = detailModal
    ? detailBoard?.columns
        .find((c) => c.id === detailModal.colId)
        ?.cards.find((c) => c.id === detailModal.card.id)
    : null;
  const inboxDetailCard = inbox.find((card) => card.id === inboxDetailId);

  return (
    <DragDropContext {...(showingWeek ? plannerDrag : boardDrag).contextProps}>
    <div className={`workspace${inboxOpen ? " inbox-open" : ""}`}>
      {pendingShare && <SharedCapture key={pendingShare.id} pending={pendingShare} ready={Boolean(root)}
        onCancel={() => { clearPendingShare(pendingShare.id); setPendingShare(null); }}
        onCapture={(title, details) => {
          if (!captureInbox(title, details)) return false;
          clearPendingShare(pendingShare.id);
          setPendingShare(null);
          setInboxOpen(true);
          return true;
        }} />}
      <InboxPanel key={user.uid} open={inboxOpen} root={root} cards={inbox}
        onOpen={setInboxDetailId}
        draggable onAdd={captureInbox} onEdit={renameInbox} onFile={fileInbox} onDelete={deleteInbox}
        onClose={() => setInboxOpen(false)} onUndo={undo} canUndo={canUndo} />
    <div className="app">
      {saveError && <div className="sync-notice" role="alert">
        <span>{t(`sync.${saveError}`)}</span>
        <button onClick={retrySave}>{t("sync.retry")}</button>
        {saveError === "conflict" && <button onClick={() => { if (window.confirm(t("sync.discard_confirm"))) reloadSaved(); }}>{t("sync.use_saved")}</button>}
        <button onClick={exportBackup}>{t("sync.export")}</button>
      </div>}
      {recoveryDrafts?.length > 0 && <div className="sync-notice" role="status">
        <span>{t("sync.recovery")}</span>
        {recoveryDrafts.map((draft) => <button key={draft.key} onClick={() => recoverDraft(draft)}>{t("sync.recover")} {draft.savedAt}</button>)}
        <button onClick={exportBackup}>{t("sync.export")}</button>
      </div>}
      <Header
        path={showingWeek ? [] : resolveTab(path)}
        pageTitle={showingWeek ? t("week.title") : null}
        saving={saving}
        theme={theme}
        onToggleTheme={toggleTheme}
        onGoToBreadcrumb={goToBreadcrumb}
        onOpenCurrentCardDetail={handleOpenCurrentCardDetail}
        onLogout={logout}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenFavorites={() => setFavoritesOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        onCleanArchives={() => setPurgeOpen(true)}
        archivedCount={archives.archived}
        completedCount={completedCount}
        onArchiveDone={archiveDone}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenInbox={() => setInboxOpen((open) => !open)}
        inboxOpen={inboxOpen}
        inboxCount={inbox.length}
        labels={labels}
        labelFilter={labelFilter}
        onLabelFilterChange={setLabelFilter}
        onOpenOutline={() => setOutlineOpen(true)}
        onOpenWeek={openWeek}
        weekOpen={showingWeek}
        onUndo={undo}
        canUndo={canUndo}
        online={online}
        onToggleFavorite={() => {
          if (isFavorited) {
            const key = path.map((p) => `${p.colId}:${p.cardId}`).join("/");
            const fav = favorites.find((f) => f.path.map((s) => `${s.colId}:${s.cardId}`).join("/") === key);
            if (fav) removeFavorite(fav.id);
          } else {
            addFavorite();
          }
        }}
        isFavorited={isFavorited}
        trashCount={trash.length}
        userEmail={user.email}
      />
      {/* From two: a strip announcing a single tab is chrome saying nothing */}
      {!compact && tabs.length > 1 && (
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          labelOf={labelOf}
          onSelect={(id) => select(id, resolveTab)}
          onClose={(id) => close(id, resolveTab)}
          onOpen={openBlank}
          onMove={move}
        />
      )}
      {!compact && labels.length > 0 && currentBoard?.columns.length > 0 && (
        <BoardFilter
          labels={labels}
          selected={labelFilter}
          onChange={setLabelFilter}
        />
      )}
      {showingWeek ? (
        <PlannerView
          drag={plannerDrag}
          root={root}
          today={today}
          labels={labels}
          settings={settings}
          onOpen={(item) =>
            setDetailModal({
              card: item.card,
              colId: item.colId,
              at: item.path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
            })
          }
          onLocate={locate}
          cardActions={{
            onRename: (item, title) => updateCard(item.colId, item.card.id, { title }, item.path),
            onDelete: (item) => deleteCard(item.colId, item.card.id, item.path),
            onArchive: (item) => setCardArchived(item.colId, item.card.id, true, item.path),
            onToggleLabel: (item, id) => toggleCardLabel(item.colId, item.card.id, id, item.path),
            onSetDue: (item, value) => setCardDue(item.colId, item.card.id, value, item.path),
            onSetRepeat: (item, value) => setCardRepeat(item.colId, item.card.id, value, item.path),
            onMoveTo: (item, colId) => moveCardTo(item.colId, item.card.id, item.path, colId, item.path),
            onMoveElsewhere: (item) => setDetailModal({ card: item.card, colId: item.colId, at: item.path, move: true }),
            onEnterInTab: (item) => openPath([...item.path, { colId: item.colId, cardId: item.card.id }]),
            onAddLabel: addLabel,
            onUpdateLabel: updateLabel,
            onDeleteLabel: deleteLabel,
          }}
          onSetDue={setCardDueAt}
          onReorder={rankCards}
          onToggleDone={(item, origin) =>
            handleToggleCardDone(
              item.colId,
              item.card.id,
              origin,
              item.path.map((p) => ({ colId: p.colId, cardId: p.cardId }))
            )
          }
          onAdd={(lane, title, path, colId) =>
            addCardAt(path, colId, title, {
              dueAt: dateForLane(lane, null, { weekMode: settings?.weekMode }) ?? null,
            })
          }
        />
      ) : (
      <Board
        board={currentBoard}
        navigating={navigating}
        onAddCard={addCard}
        onDeleteCard={deleteCard}
        onEnterCard={enterCard}
        onEnterCardInTab={(card, colId) =>
          open(
            [...path.map((p) => ({ colId: p.colId, cardId: p.cardId })),
             { colId, cardId: card.id }],
            resolveTab
          )
        }
        onOpenCardDetail={handleOpenDetail}
        onRenameCard={renameCard}
        onAddCol={addCol}
        onDeleteCol={deleteCol}
        onRenameCol={renameCol}
        onUpdateColEmoji={updateColEmoji}
        onUpdateColColor={updateColColor}
        onToggleCardDone={handleToggleCardDone}
        onUnarchiveCard={handleUnarchiveCard}
        onArchiveCard={(colId, cardId) => setCardArchived(colId, cardId, true)}
        onToggleCardLabel={toggleCardLabel}
        onSetCardDue={setCardDue}
        onSetCardRepeat={setCardRepeat}
        onAddLabel={addLabel}
        onUpdateLabel={updateLabel}
        onDeleteLabel={deleteLabel}
        onSortColumn={sortColumn}
        onMoveCard={(colId, cardId, destColId) =>
          moveCardTo(colId, cardId, here(), destColId)
        }
        labels={labels}
        labelFilter={labelFilter}
        drag={boardDrag}
        zoneLabel={t("move.zone")}
        viewKey={`${activeId}|${path.map((p) => p.cardId).join("/")}`}
        onApplyPreset={applyPreset}
        spotlight={spotlight}
      />
      )}
      {inboxDetailCard && <InboxCardDetail key={inboxDetailCard.id} card={inboxDetailCard} root={root} labels={labels}
        onUpdate={updateInbox} onFile={fileInbox} onClose={() => setInboxDetailId(null)}
        onAddLabel={addLabel} onUpdateLabel={updateLabel} onDeleteLabel={deleteLabel} />}
      {activeCard && (
        <CardDetail
          card={activeCard}
          colId={detailModal.colId}
          onClose={handleCloseDetail}
          /* `at` is set when the card belongs to a board other than the one
             on screen. Every mutation then has to aim at
             its own board, or it would edit whatever is behind the modal. */
          onUpdate={(c, i, f) => updateCard(c, i, f, detailModal.at)}
          onEnter={(card, colId) => {
            if (!detailModal.at) return enterCard(card, colId);
            handleCloseDetail();
            // Into the card's own board, one step past the one holding it —
            // locating stops outside, this goes in.
            const into = [...detailModal.at, { colId, cardId: card.id }];
            if (!showingWeek && into.length === path.length && into.every((s, i) => s.cardId === path[i].cardId)) return;
            openPath(into);
          }}
          onToggleDone={(c, i, o) => handleToggleCardDone(c, i, o, detailModal.at)}
          labels={labels}
          onToggleLabel={(c, i, l) => toggleCardLabel(c, i, l, detailModal.at)}
          onAddLabel={addLabel}
          onUpdateLabel={updateLabel}
          onDeleteLabel={deleteLabel}
          onSetDue={(c, i, v) => setCardDue(c, i, v, detailModal.at)}
          onSetRepeat={(c, i, v) => setCardRepeat(c, i, v, detailModal.at)}
          checklistActions={detailChecklistActions}
          root={root}
          path={detailModal.at ? resolveTab(detailModal.at) : path}
          showPath={Boolean(detailModal.at)}
          favorited={Boolean(detailFavorite)}
          onToggleFavorite={() =>
            detailFavorite
              ? removeFavorite(detailFavorite.id)
              : addFavoriteAt(detailInto)
          }
          initialMove={detailModal.move}
          onMove={(c, i, dp, dc) => {
            const moved = moveCardTo(c, i, dp, dc, detailModal.at);
            /* Another column of the same board: the card is still here, so the
               detail follows it instead of closing on a card it can no longer
               find where it was. */
            const key = (segs) => segs.map((s) => s.cardId).join("/");
            if (moved && key(dp) === key(detailModal.at ?? here())) {
              setDetailModal((m) => m && { ...m, colId: dc });
            }
            return moved;
          }}
          onDuplicate={(c, i) => duplicateCardAt(c, i, detailModal.at)}
        />
      )}
      {profileOpen && (
        <ProfileModal
          user={user}
          settings={settings}
          onUpdateSettings={updateSettings}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {favoritesOpen && (
        <FavoritesPanel
          favorites={favorites}
          onGo={goToFavorite}
          onRemove={removeFavorite}
          onClose={() => setFavoritesOpen(false)}
        />
      )}
      {movingColumn && (
        <MoveColumnModal
          root={root}
          column={movingColumn}
          currentPath={path}
          onMove={(destPath) => {
            moveColumnTo(movingColumn.id, destPath);
            setMovingColumn(null);
          }}
          onClose={() => setMovingColumn(null)}
        />
      )}
      {finishing && (
        <FinishBranchModal
          subject={finishing.subject}
          left={finishing.left}
          depth={finishing.depth}
          onConfirm={() => {
            finishBranch(finishing.at, finishing.cardId);
            setFinishing(null);
          }}
          onClose={() => setFinishing(null)}
        />
      )}
      {searchOpen && (
        <SearchPanel
          root={root}
          labels={labels}
          onGo={handleGoToResult}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {mapOpen && (
        <MindMap
          root={root}
          labels={labels}
          path={path}
          onGo={navigate}
          onOpenOutline={() => { setMapOpen(false); setOutlineOpen(true); }}
          onClose={() => setMapOpen(false)}
        />
      )}
      {outlineOpen && (
        <OutlinePanel
          root={root}
          labels={labels}
          path={path}
          onGo={navigate}
          onOpenMap={() => { setOutlineOpen(false); setMapOpen(true); }}
          onClose={() => setOutlineOpen(false)}
        />
      )}
      {lastUndone && (
        <UndoToast
          key={lastUndone.at}
          event={lastUndone}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}
      {burst && (
        <Confetti key={burst.id} origin={burst.origin} onDone={handleBurstDone} />
      )}
      {trashOpen && (
        <TrashPanel
          trash={trash}
          onRestore={restoreFromTrash}
          onDelete={permanentDeleteFromTrash}
          onEmpty={emptyTrash}
          onClose={() => setTrashOpen(false)}
        />
      )}
      {inboxPlanDrop && <InboxPlanDestination root={root} drop={inboxPlanDrop} onFile={fileInbox}
        onClose={() => setInboxPlanDrop(null)} />}
      {purgeOpen && (
        <PurgeArchivesModal
          summary={archives}
          onConfirm={() => { purgeArchives(); setPurgeOpen(false); }}
          onClose={() => setPurgeOpen(false)}
        />
      )}
    </div>
    </div>
    </DragDropContext>
  );
}
