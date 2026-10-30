import { useState, useMemo } from "react";
import { listBoardDestinations, collectCardIds } from "../lib/board-utils";
import { useI18n } from "../lib/i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";

/**
 * Where should this column go?
 *
 * The exclusion is wider than for a card: every card the column holds, at any
 * depth, is dropped from the list — the column cannot land inside its own
 * contents.
 */
export default function MoveColumnModal({ root, column, currentPath, onMove, onClose }) {
  const { t } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  const [filter, setFilter] = useState("");

  const destinations = useMemo(() => {
    const held = collectCardIds(column);
    return listBoardDestinations(root, held, t("header.root"));
  }, [root, column, t]);

  const currentKey = currentPath.map((p) => p.cardId).join("/");

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter((d) => d.trail.join(" ").toLowerCase().includes(needle));
  }, [destinations, filter]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card move-col-modal">
        <div className="modal-header-top">
          <h2 className="modal-title">
            {t("move.column_title")}
            <span className="move-col-subject">
              {column.emoji && <span>{column.emoji} </span>}
              {column.title}
            </span>
          </h2>
          <button className="modal-close" onClick={onClose} title={t("board.cancel")}>
            &times;
          </button>
        </div>

        {destinations.length > 6 && (
          <input
            className="move-filter"
            value={filter}
            placeholder={t("move.filter")}
            autoFocus={!mobile}
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isComposingKey(e)) { e.preventDefault(); e.currentTarget.blur(); }
            }}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}

        <div className="move-list move-list-tall">
          {shown.length === 0 && (
            <div className="label-picker-empty">{t("move.none")}</div>
          )}
          {shown.map((dest) => {
            const key = dest.path.map((p) => p.cardId).join("/");
            const isCurrent = key === currentKey;
            return (
              <button
                key={key || "root"}
                className={`move-board-btn${isCurrent ? " current" : ""}`}
                disabled={isCurrent}
                onClick={() => onMove(dest.path)}
                title={isCurrent ? t("move.already_here_board") : undefined}
              >
                <span className="move-board-trail">{dest.trail.join(" › ")}</span>
                <span className="move-board-meta">
                  {dest.columns.length} {dest.columns.length > 1 ? t("move.columns") : t("move.column")}
                  {isCurrent && ` · ${t("move.current")}`}
                </span>
              </button>
            );
          })}
        </div>

        <p className="label-picker-hint">{t("move.column_hint")}</p>
      </div>
    </div>
  );
}
