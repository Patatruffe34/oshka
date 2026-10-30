import { useState, useMemo, useCallback } from "react";
import {
  outlineRows,
  allBranchKeys,
  checklistProgress,
  dueState,
  cardLabels,
} from "../lib/board-utils";
import { colorHex } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import ViewSwitch from "./ViewSwitch";

/**
 * The whole tree at once, as a foldable outline.
 *
 * Navigating the board only ever shows one level; search finds a card but not
 * the shape around it. This is the one view where the nesting is legible —
 * which is the thing the product is actually about.
 */
export default function OutlinePanel({ root, labels, path, onGo, onOpenMap, onClose }) {
  const { t } = useI18n();

  // Everything on the current path is unfolded, so the view opens where you are
  const [open, setOpen] = useState(() => {
    const keys = new Set();
    path.forEach((_, i) => keys.add(path.slice(0, i + 1).map((p) => p.cardId).join("/")));
    return keys;
  });

  const isOpen = useCallback((key) => open.has(key), [open]);
  const rows = useMemo(
    () => outlineRows(root, isOpen, t("header.root")),
    [root, isOpen, t]
  );

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const branches = useMemo(() => allBranchKeys(root), [root]);
  const allOpen = branches.size > 0 && [...branches].every((k) => open.has(k));
  const currentKey = path.map((p) => p.cardId).join("/");

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <div className="outline-panel" onClick={(e) => e.stopPropagation()}>
        <div className="side-panel-header">
          <ViewSwitch view="outline" onMap={onOpenMap} />
          <div className="side-panel-header-actions">
            {branches.size > 0 && (
              <button
                className="btn-ghost-sm"
                onClick={() => setOpen(allOpen ? new Set() : new Set(branches))}
              >
                {allOpen ? t("outline.collapse_all") : t("outline.expand_all")}
              </button>
            )}
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="outline-list">
          {rows.map((row) => {
            if (row.kind === "root") {
              return (
                <button
                  key="root"
                  className={`outline-row outline-root${currentKey === "" ? " here" : ""}`}
                  onClick={() => { onGo([]); onClose(); }}
                >
                  <span className="outline-label">{row.label}</span>
                </button>
              );
            }

            if (row.kind === "empty") {
              return (
                <div
                  key={row.key}
                  className="outline-row outline-empty"
                  style={{ paddingLeft: 10 + row.depth * 14 }}
                >
                  {t("outline.nothing")}
                </div>
              );
            }

            if (row.kind === "column") {
              const hex = colorHex(row.column.color);
              return (
                <div
                  key={row.key}
                  className="outline-row outline-col"
                  style={{ paddingLeft: 10 + row.depth * 14 }}
                >
                  <span
                    className="outline-col-dot"
                    style={hex ? { background: hex } : undefined}
                  />
                  {row.column.emoji && <span>{row.column.emoji}</span>}
                  <span className="outline-col-name">{row.column.title}</span>
                  <span className="outline-count">
                    {row.done > 0 ? `${row.done}/${row.count}` : row.count || ""}
                  </span>
                </div>
              );
            }

            const { card } = row;
            const due = dueState(card.dueAt, card.done);
            const list = checklistProgress(card);
            const own = cardLabels(card);
            const isHere = row.key === currentKey;

            return (
              <div
                key={row.key}
                className={`outline-row outline-card${card.done ? " done" : ""}${isHere ? " here" : ""}`}
                style={{ paddingLeft: 10 + row.depth * 14 }}
              >
                {row.hasChildren ? (
                  <button
                    className="outline-twisty"
                    onClick={() => toggle(row.key)}
                    aria-expanded={row.open}
                    aria-label={row.open ? t("outline.collapse") : t("outline.expand")}
                  >
                    {row.open ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="outline-twisty outline-twisty-none" />
                )}

                <button
                  className="outline-open"
                  onClick={() => {
                    onGo(row.hasChildren ? row.childPath : row.path);
                    onClose();
                  }}
                  title={row.hasChildren ? t("detail.open_board") : t("outline.go_to_board")}
                >
                  <span className="outline-label">{card.title || t("board.untitled")}</span>
                </button>

                <span className="outline-meta">
                  {own.length > 0 && (
                    <span className="outline-labels">
                      {labels
                        .filter((l) => own.includes(l.id))
                        .slice(0, 3)
                        .map((l) => (
                          <span
                            key={l.id}
                            className={`outline-label-dot label-pattern-${l.color}`}
                            style={{ backgroundColor: colorHex(l.color) }}
                            title={[l.emoji, l.name].filter(Boolean).join(" ") || undefined}
                          />
                        ))}
                    </span>
                  )}
                  {list.total > 0 && (
                    <span className="outline-chip">&#9745; {list.done}/{list.total}</span>
                  )}
                  {due && <span className={`outline-chip due-${due}`}>{t(`due.${due}`)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
