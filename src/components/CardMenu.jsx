import { useState } from "react";
import { cardLabels } from "../lib/board-utils";
import { useI18n } from "../lib/i18n";
import LabelPicker from "./LabelPicker";
import DueMenu from "./DueMenu";
import ColumnPicker from "./ColumnPicker";
import { IconTag, IconCalendar, IconArchive, IconUnarchive, IconMove } from "./icons";

/**
 * Everything a card can do, without opening it.
 *
 * A row of small glyphs in the corner ran out of room at three, could not be
 * reached at all without a pointer, and covered the title it sat on. One
 * button opens named rows instead — and the two fields that get edited most,
 * labels and due date, swap in here rather than opening a second layer.
 */
const PANE_TITLES = { labels: "labels.title", due: "due.title", move: "move.action" };

export default function CardMenu({
  card,
  labels,
  onRename,
  onEnterInTab,
  onDelete,
  onArchive,
  onUnarchive,
  onToggleLabel,
  onSetDue,
  onSetRepeat,
  onAddLabel,
  onUpdateLabel,
  onDeleteLabel,
  columns,
  colId,
  onMoveTo,
  onMoveElsewhere,
  onClose,
  initialView = "root",
}) {
  const { t } = useI18n();
  // A shortcut lands on the pane it names rather than on the menu's front page
  const [view, setView] = useState(initialView);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // An archived card is out of the flow; it goes back before it goes anywhere
  const canMove = !card.archived && Boolean(onMoveTo) && columns?.length > 0;

  if (view !== "root") {
    return (
      <div className="card-menu">
        <button className="card-menu-back" onClick={() => setView("root")}>
          <span aria-hidden="true">&lsaquo;</span>
          {t(PANE_TITLES[view])}
        </button>
        {view === "move" ? (
          <ColumnPicker
            columns={columns}
            currentColId={colId}
            onPick={(destColId) => { onMoveTo(destColId); onClose(); }}
            onElsewhere={() => { onMoveElsewhere(); onClose(); }}
          />
        ) : view === "labels" ? (
          <LabelPicker
            labels={labels}
            selected={cardLabels(card)}
            onToggle={onToggleLabel}
            onAdd={onAddLabel}
            onUpdate={onUpdateLabel}
            onDelete={onDeleteLabel}
            onClose={onClose}
          />
        ) : (
          <DueMenu
            value={card.dueAt}
            title={false}
            onSet={(v) => { onSetDue(v); onClose(); }}
            onClear={() => { onSetDue(null); onClose(); }}
            /* Left open on purpose: setting a date is one decision and you
               are done, but a repetition takes two or three touches. */
            repeat={card.repeat}
            onSetRepeat={onSetRepeat}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card-menu">
      <button className="card-menu-row" onClick={() => setView("labels")}>
        <IconTag size={15} />
        {t("labels.title")}
        <kbd className="card-menu-key">E</kbd>
        <span className="card-menu-more" aria-hidden="true">&rsaquo;</span>
      </button>

      <button className="card-menu-row" onClick={() => setView("due")}>
        <IconCalendar size={15} />
        {t("due.title")}
        <kbd className="card-menu-key">D</kbd>
        <span className="card-menu-more" aria-hidden="true">&rsaquo;</span>
      </button>

      {canMove && (
        <button className="card-menu-row" onClick={() => setView("move")}>
          <IconMove size={15} />
          {t("move.action")}
          <kbd className="card-menu-key">M</kbd>
          <span className="card-menu-more" aria-hidden="true">&rsaquo;</span>
        </button>
      )}

      <span className="card-menu-sep" />

      {!card.archived && onEnterInTab && (
        <button className="card-menu-row" onClick={() => { onEnterInTab(); onClose(); }}>
          <span className="card-menu-glyph" aria-hidden="true">&rarr;</span>
          {t("tabs.open_here")}
        </button>
      )}

      <button className="card-menu-row" onClick={() => { onRename(); onClose(); }}>
        <span className="card-menu-glyph" aria-hidden="true">&#9998;</span>
        {t("card.rename")}
        {/* Where a menu teaches its shortcut */}
        <kbd className="card-menu-key">R</kbd>
      </button>

      {card.archived ? (
        <button className="card-menu-row" onClick={() => { onUnarchive(); onClose(); }}>
          <IconUnarchive size={15} />
          {t("archive.unarchive")}
          <kbd className="card-menu-key">A</kbd>
        </button>
      ) : (
        <button className="card-menu-row" onClick={() => { onArchive(); onClose(); }}>
          <IconArchive size={15} />
          {t("archive.archive")}
          <kbd className="card-menu-key">A</kbd>
        </button>
      )}

      <button
        className={`card-menu-row danger${confirmDelete ? " armed" : ""}`}
        onClick={() => {
          if (!confirmDelete) { setConfirmDelete(true); return; }
          onDelete();
          onClose();
        }}
      >
        <span className="card-menu-glyph" aria-hidden="true">&times;</span>
        {confirmDelete ? t("board.confirm_delete") : t("board.delete")}
      </button>
    </div>
  );
}
