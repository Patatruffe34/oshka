import { useState } from "react";
import { useI18n } from "../lib/i18n";

/** Total cards buried anywhere under a board, at any depth */
function countCards(board) {
  if (!board) return 0;
  return board.columns.reduce(
    (acc, col) =>
      acc + col.cards.length + col.cards.reduce((a, c) => a + countCards(c.board), 0),
    0
  );
}

export default function TrashPanel({ trash, onRestore, onDelete, onEmpty, onClose }) {
  const { t } = useI18n();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const sorted = [...trash].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <div className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="side-panel-header">
          <span className="side-panel-title">{t("trash.title")}</span>
          <div className="side-panel-header-actions">
            {trash.length > 0 && (
              confirmEmpty ? (
                <button
                  className="btn-danger-sm"
                  onClick={() => { onEmpty(); setConfirmEmpty(false); }}
                  onMouseLeave={() => setConfirmEmpty(false)}
                >
                  {t("trash.confirm_empty")}
                </button>
              ) : (
                <button
                  className="btn-ghost-sm"
                  onClick={() => setConfirmEmpty(true)}
                >
                  {t("trash.empty_all")}
                </button>
              )
            )}
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="side-panel-empty">{t("trash.empty")}</div>
        ) : (
          <div className="side-panel-list">
            {sorted.map((item) => {
              const isColumn = item.type === "column";
              const trail = item.path.map((s) => s.cardTitle);
              // A deleted column has no parent column to name, only its board
              const location = item.source === "inbox" ? t("inbox.title") : isColumn
                ? (trail.length > 0 ? trail.join(" › ") : t("header.root"))
                : [...trail, item.colTitle].join(" › ");
              const title = isColumn ? item.col.title : item.card.title;
              const buried = isColumn
                ? item.col.cards.length
                : countCards(item.card.board);
              return (
                <div key={item.id} className="side-panel-item">
                  <div className="side-panel-item-main trash-item-main">
                    <div className="side-panel-item-text">
                      <span className="side-panel-item-title">
                        {isColumn && <span className="trash-type-tag">{t("trash.type_column")}</span>}
                        {title}
                      </span>
                      <span className="side-panel-item-sub">
                        {location}
                        {buried > 0 && (
                          <span className="trash-item-count">
                            {" · "}
                            {buried} {buried > 1 ? t("board.items") : t("board.item")}
                          </span>
                        )}
                      </span>
                      <span className="side-panel-item-date">{formatDate(item.deletedAt)}</span>
                    </div>
                  </div>
                  <div className="trash-item-actions">
                    <button
                      className="side-panel-item-action restore"
                      onClick={() => { onRestore(item.id); }}
                      title={t("trash.restore")}
                    >
                      ↩
                    </button>
                    {confirmDeleteId === item.id ? (
                      <button
                        className="side-panel-item-action danger confirm"
                        onClick={() => { onDelete(item.id); setConfirmDeleteId(null); }}
                        onMouseLeave={() => setConfirmDeleteId(null)}
                        title={t("trash.confirm_delete")}
                      >
                        ?
                      </button>
                    ) : (
                      <button
                        className="side-panel-item-action danger"
                        onClick={() => setConfirmDeleteId(item.id)}
                        title={t("trash.delete_permanent")}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
