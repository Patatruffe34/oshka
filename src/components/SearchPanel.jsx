import { useState, useEffect, useRef, useMemo } from "react";
import { searchBoard } from "../lib/search";
import { colorHex } from "../lib/palette";
import { cardLabels, dueState } from "../lib/board-utils";
import { useI18n } from "../lib/i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";

const MAX_RESULTS = 60;

/**
 * Search across every board in the tree at once.
 *
 * Because the whole tree is held in memory, this is a single traversal — no
 * indexing, no round trip. It is the one view that makes the nesting legible.
 */
export default function SearchPanel({ root, labels, onGo, onClose }) {
  const { t } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  // One object so any change to the query resets the cursor in the same go
  const [q, setQ] = useState({
    text: "", labelIds: [], due: null, done: null, includeArchived: false,
  });
  const { text, labelIds, due, done, includeArchived } = q;
  const [cursor, setCursor] = useState(0);

  const patch = (fields) => {
    setQ((prev) => ({ ...prev, ...fields }));
    setCursor(0);
  };
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(
    () => searchBoard(root, { text, labelIds, due, done, includeArchived }),
    [root, text, labelIds, due, done, includeArchived]
  );

  const shown = results.slice(0, MAX_RESULTS);
  const hasQuery = text.trim() || labelIds.length > 0 || due || done !== null;

  // Guard against a stale cursor when results shrink between renders
  const activeIdx = Math.min(cursor, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const toggleLabel = (id) =>
    patch({
      labelIds: labelIds.includes(id)
        ? labelIds.filter((x) => x !== id)
        : [...labelIds, id],
    });

  /** Filters step through their states on each click rather than opening a menu */
  const cycle = (key, value, options) => {
    const i = options.indexOf(value);
    patch({ [key]: options[(i + 1) % options.length] });
  };

  const handleKeyDown = (e) => {
    if (isComposingKey(e)) return;
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, shown.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === "Enter" && mobile && e.target === inputRef.current) {
      e.preventDefault();
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter" && shown[activeIdx]) {
      e.preventDefault();
      onGo(shown[activeIdx]);
    }
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="search-input-row">
          <span className="search-icon" aria-hidden="true">&#9906;</span>
          <input
            ref={inputRef}
            className="search-input"
            value={text}
            enterKeyHint="search"
            placeholder={t("search.placeholder")}
            onChange={(e) => patch({ text: e.target.value })}
          />
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="search-filters">
          {labels.map((label) => (
            <button
              key={label.id}
              className={`search-label-dot label-pattern-${label.color}${labelIds.includes(label.id) ? " on" : ""}`}
              style={{ backgroundColor: colorHex(label.color) || "var(--surface3)" }}
              onClick={() => toggleLabel(label.id)}
              title={[label.emoji, label.name].filter(Boolean).join(" ") || t("labels.unnamed")}
              aria-pressed={labelIds.includes(label.id)}
            />
          ))}
          <span className="search-filter-sep" />
          <button
            className={`search-chip${due ? " on" : ""}`}
            onClick={() => cycle("due", due, [null, "overdue", "any"])}
          >
            {due === "overdue" ? t("search.due_overdue")
              : due === "any" ? t("search.due_any")
              : t("search.due_off")}
          </button>
          <button
            className={`search-chip${done !== null ? " on" : ""}`}
            onClick={() => cycle("done", done, [null, false, true])}
          >
            {done === true ? t("search.done_only")
              : done === false ? t("search.open_only")
              : t("search.done_off")}
          </button>
          <button
            className={`search-chip${includeArchived ? " on" : ""}`}
            onClick={() => patch({ includeArchived: !includeArchived })}
          >
            {t("search.archived")}
          </button>
        </div>

        <div className="search-results" ref={listRef}>
          {!hasQuery && <div className="search-hint">{t("search.hint")}</div>}
          {hasQuery && shown.length === 0 && (
            <div className="search-hint">{t("search.no_results")}</div>
          )}

          {shown.map((r, i) => {
            const dstate = dueState(r.card.dueAt, r.card.done);
            const cardLabelSet = cardLabels(r.card);
            return (
              <button
                key={`${r.colId}:${r.card.id}`}
                data-idx={i}
                className={`search-result${i === activeIdx ? " active" : ""}`}
                onClick={() => onGo(r)}
                onMouseEnter={() => setCursor(i)}
              >
                <div className="search-result-head">
                  {cardLabelSet.length > 0 && (
                    <span className="search-result-labels">
                      {labels
                        .filter((l) => cardLabelSet.includes(l.id))
                        .map((l) => (
                          <span
                            key={l.id}
                            className={`search-result-dot label-pattern-${l.color}`}
                            style={{ backgroundColor: colorHex(l.color) || "var(--surface3)" }}
                            title={[l.emoji, l.name].filter(Boolean).join(" ") || undefined}
                          />
                        ))}
                    </span>
                  )}
                  <span className={`search-result-title${r.card.done ? " done" : ""}`}>
                    {r.card.title || t("board.untitled")}
                  </span>
                  {dstate && (
                    <span className={`due-badge due-${dstate}`}>{t(`due.${dstate}`)}</span>
                  )}
                  {r.card.archived && (
                    <span className="search-result-tag">{t("archive.count")}</span>
                  )}
                </div>

                {r.snippet && (
                  <div className="search-result-snippet">
                    <span className="search-result-field">{t(`search.in_${r.matchedIn}`)}</span>
                    {r.snippet.before}
                    <mark>{r.snippet.match}</mark>
                    {r.snippet.after}
                  </div>
                )}

                <div className="search-result-path">
                  {[t("header.root"), ...r.trail.slice(0, -1)].join(" › ")}
                  {" › "}
                  <span className="search-result-col">{r.colTitle}</span>
                </div>
              </button>
            );
          })}

          {results.length > MAX_RESULTS && (
            <div className="search-hint">
              {t("search.more").replace("{n}", results.length - MAX_RESULTS)}
            </div>
          )}
        </div>

        {hasQuery && shown.length > 0 && (
          <div className="search-footer">
            {t("search.count").replace("{n}", results.length)}
            <span className="search-keys">↑↓ · ⏎</span>
          </div>
        )}
      </div>
    </div>
  );
}
