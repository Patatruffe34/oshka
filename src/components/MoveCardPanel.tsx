import { useState, useMemo, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { listBoardDestinations, makeCol, visibleCards } from "../lib/board-utils";
import { colorHex } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import { isComposingKey } from "../lib/text-entry";
import BoardPresets, { type PresetColumn } from "./BoardPresets";
import type { BoardDestination } from "../lib/board-utils";
import type { Card, Column, Id, PathSegment, RootBoard } from "../lib/types";

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
  onMove: (path: PathSegment[], colId: Id, initialColumns?: Column[]) => void;
  onClose: () => void;
  /** A line under the title, such as why the last pick did not work */
  notice?: string;
  /** Open directly on a dropped-on card's board. */
  initialPath?: PathSegment[];
  /** Offer templates for empty boards, without saving until a column is picked. */
  allowSetup?: boolean;
}

export default function MoveCardPanel({ root, card, currentColId, currentPath, onMove, onClose, notice, initialPath, allowSetup = false }: MoveCardPanelProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState(() => pathKey(initialPath ?? currentPath));
  const [setup, setSetup] = useState<{ key: string; columns: Column[] } | null>(null);

  // Keep the existing exclusion rule: a card cannot move inside itself.
  const destinations = useMemo(
    () => listBoardDestinations(root, card?.id, t("header.root"), allowSetup),
    [root, card?.id, t, allowSetup]
  );

  const byKey = useMemo(
    () => new Map(destinations.map((dest) => [pathKey(dest.path), dest])),
    [destinations]
  );
  const selected = byKey.get(selectedKey) ?? destinations[0];
  const missing = !byKey.has(selectedKey);
  const currentKey = pathKey(currentPath);
  const browsingKey = pathKey(selected.path);
  const initialColumns = selected.columns.length === 0 && setup?.key === browsingKey ? setup.columns : undefined;
  const columns = initialColumns ?? selected.columns;
  const terms = normalize(filter.trim()).split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const shown = destinations.filter((dest) => searching
    ? terms.every((term) => normalize(dest.trail.join(" ")).includes(term))
    : dest.path.length === selected.path.length + 1 &&
      pathKey(dest.path.slice(0, -1)) === browsingKey
  );
  const results = searching ? shown.slice(0, RESULT_LIMIT) : shown;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [selectedKey, filter]);

  useEffect(() => {
    if (setup) listRef.current?.querySelector<HTMLButtonElement>(".move-col-btn")?.focus();
  }, [setup]);

  const browse = (dest: BoardDestination | undefined) => {
    if (!dest) return;
    setSelectedKey(pathKey(dest.path));
    setFilter("");
    setSetup(null);
    // Dismiss the search keyboard so the destination's columns are in view.
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches("input") && dialogRef.current?.contains(active)) active.blur();
  };

  const chooseSetup = (preset: PresetColumn[]) => {
    const columns = preset.map(({ title, emoji }) => ({ ...makeCol(title), emoji }));
    if (columns.length === 1) {
      onMove(selected.path, columns[0].id, columns);
    } else {
      setSetup({ key: browsingKey, columns });
    }
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
          {missing && <p className="move-dialog-subject" role="status">{t("move.stale_destination")}</p>}
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
        {!searching && !missing && (
          <section>
            <h3 className="move-browser-label">{t(allowSetup && columns.length === 0 ? "move.setup_board" : "move.choose_column")}</h3>
            <div className="move-browser-rows">
                {columns.map((col) => {
                  const here = browsingKey === currentKey && col.id === currentColId;
                  const hex = colorHex(col.color);
                  return (
                    <button
                      key={col.id}
                      className="move-col-btn"
                      disabled={here && !!card}
                      aria-current={here || undefined}
                      style={hex ? { borderLeftColor: hex } : undefined}
                      onClick={() => onMove(selected.path, col.id, initialColumns)}
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
                {columns.length === 0 && (
                  allowSetup ? <BoardPresets inline onSelect={chooseSetup}>
                    <button className="move-col-btn" onClick={() => chooseSetup([{ title: "Todo", emoji: "📝" }])}>{t("move.todo_column")}</button>
                  </BoardPresets> : <span className="move-dest-empty">{t("move.no_columns")}</span>
                )}
                {initialColumns && <button className="btn-ghost-sm" onClick={() => setSetup(null)}>{t("move.change_template")}</button>}
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
