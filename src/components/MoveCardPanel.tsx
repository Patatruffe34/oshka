import { useState, useMemo, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { listBoardDestinations, visibleCards } from "../lib/board-utils";
import { colorHex } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import { isComposingKey } from "../lib/text-entry";
import type { BoardDestination } from "../lib/board-utils";
import type { Card, Id, PathSegment, RootBoard } from "../lib/types";

const pathKey = (path: PathSegment[]) => path.map((p) => p.cardId).join("/");
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const RESULT_LIMIT = 30;

/** Browse destinations for an existing card, or pick one before creating it. */
interface MoveCardPanelProps {
  root: RootBoard;
  /** The card being moved; left out when picking where a new one goes */
  card?: Card;
  currentColId: Id | null;
  currentPath: PathSegment[];
  onMove: (path: PathSegment[], colId: Id) => void;
  onClose: () => void;
  /** A line under the title, such as why the last pick did not work */
  notice?: string;
}

export default function MoveCardPanel({ root, card, currentColId, currentPath, onMove, onClose, notice }: MoveCardPanelProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState(() => pathKey(currentPath));

  // Keep the existing exclusion rule: a card cannot move inside itself.
  const destinations = useMemo(
    () => listBoardDestinations(root, card?.id, t("header.root")),
    [root, card?.id, t]
  );

  const byKey = useMemo(
    () => new Map(destinations.map((dest) => [pathKey(dest.path), dest])),
    [destinations]
  );
  const selected = byKey.get(selectedKey) ?? destinations[0];
  const currentKey = pathKey(currentPath);
  const browsingKey = pathKey(selected.path);
  const terms = normalize(filter.trim()).split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const shown = destinations.filter((dest) => searching
    ? terms.every((term) => normalize(dest.trail.join(" ")).includes(term))
    : dest.path.length === selected.path.length + 1 &&
      pathKey(dest.path.slice(0, -1)) === browsingKey
  );
  const results = searching ? shown.slice(0, RESULT_LIMIT) : shown;

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [selectedKey, filter]);

  const browse = (dest: BoardDestination | undefined) => {
    setSelectedKey(pathKey(dest!.path));
    setFilter("");
    // Dismiss the search keyboard so the destination's columns are in view.
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches("input") && dialogRef.current?.contains(active)) active.blur();
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="move-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose();
      }}
    >
      <div className="move-dialog-header">
        <div>
          <h2 id={titleId} className="modal-title">{t(card ? "move.title" : "week.add_where")}</h2>
          {card && <p className="move-dialog-subject">{card.title || t("board.untitled")}</p>}
          {notice && <p className="move-dialog-subject" role="status">{notice}</p>}
        </div>
        <button className="modal-close" onClick={onClose} aria-label={t("board.cancel")} autoFocus>&times;</button>
      </div>

      <div className="move-search">
        <input
          type="search"
          enterKeyHint="search"
          className="move-filter"
          value={filter}
          placeholder={t("move.search")}
          aria-label={t("move.search")}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isComposingKey(e)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        {filter && <button className="move-clear" onClick={() => setFilter("")} aria-label={t("move.clear")}>&times;</button>}
      </div>

      <nav className="move-breadcrumb" aria-label={t("move.location")}>
        {selected.trail.map((title, i) => {
          const dest = byKey.get(pathKey(selected.path.slice(0, i)));
          return (
            <span key={i}>
              {i > 0 && <span className="move-breadcrumb-sep" aria-hidden="true">›</span>}
              <button onClick={() => browse(dest)} aria-current={i === selected.trail.length - 1 ? "location" : undefined}>
                {title || t("board.untitled")}
              </button>
            </span>
          );
        })}
      </nav>

      <div className="move-browser" ref={listRef}>
        {!searching && (
          <section>
            <h3 className="move-browser-label">{t("move.choose_column")}</h3>
            <div className="move-browser-rows">
                {selected.columns.map((col) => {
                  const here = browsingKey === currentKey && col.id === currentColId;
                  const hex = colorHex(col.color);
                  return (
                    <button
                      key={col.id}
                      className="move-col-btn"
                      disabled={here && !!card}
                      aria-current={here || undefined}
                      style={hex ? { borderLeftColor: hex } : undefined}
                      onClick={() => onMove(selected.path, col.id)}
                      title={here && card ? t("move.already_here") : undefined}
                    >
                      {col.emoji && <span className="move-col-emoji">{col.emoji}</span>}
                      <span className="move-col-name">{col.title || t("board.untitled")}</span>
                      <span className="move-col-count">
                        {here ? t("move.current_column") : visibleCards(col).length}
                      </span>
                    </button>
                  );
                })}
                {selected.columns.length === 0 && (
                  <span className="move-dest-empty">{t("move.no_columns")}</span>
                )}
            </div>
          </section>
        )}

        <section>
          <h3 className="move-browser-label">
            {t(searching ? "move.results" : "move.browse")}
            {searching && <span role="status">{shown.length}</span>}
          </h3>
          <div className="move-browser-rows">
            {results.map((dest) => {
              const key = pathKey(dest.path);
              return (
                <button key={key} className="move-board-btn move-browser-board" onClick={() => browse(dest)}>
                  <span className="move-board-info">
                    <span className="move-board-trail">{dest.trail.at(-1) || t("board.untitled")}</span>
                    <span className="move-board-meta">
                      {searching && dest.path.length > 0 ? `${dest.trail.slice(0, -1).join(" › ")} · ` : ""}
                      {dest.columns.length} {t(dest.columns.length > 1 ? "move.columns" : "move.column")}
                      {key === currentKey && ` · ${t("move.current")}`}
                    </span>
                  </span>
                  <span className="move-browser-arrow" aria-hidden="true">›</span>
                </button>
              );
            })}
            {results.length === 0 && <p className="label-picker-empty">{t(searching ? "move.none" : "move.no_children")}</p>}
            {searching && shown.length > RESULT_LIMIT && (
              <p className="label-picker-hint">{t("move.refine", { n: shown.length - RESULT_LIMIT })}</p>
            )}
          </div>
        </section>
      </div>
    </dialog>,
    document.body
  );
}
