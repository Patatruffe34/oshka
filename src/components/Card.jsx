import { useRef, useState, useEffect } from "react";
import {
  subBoardProgress,
  cardLabels,
  checklistProgress,
  dueState,
  nextDueInside,
  hasDoneColumn,
} from "../lib/board-utils";
import { colorHex, inkClass } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import { repeatKey } from "../lib/repeat";
import { useLinkPreview } from "../hooks/useLinkPreview";
import { useSwipe } from "../hooks/useSwipe";
import { useCardShortcuts } from "../hooks/useCardShortcuts";
import { IconArchive } from "./icons";
import Popover from "./Popover";
import CardMenu from "./CardMenu";
import ProgressRing from "./ProgressRing";
import { isComposingKey } from "../lib/text-entry";

/* Long enough to catch a second click, short enough that opening a card does
   not feel laggy. Below the OS double-click threshold, so a deliberately slow
   double-click reads as two singles — the second one lands on the detail that
   just opened, and closes nothing. */
const DOUBLE_CLICK_MS = 200;

/* Controls handle their own clicks; the card must not act on them too. Not
   [role=button] — the card itself carries that, so it would match every
   click on the card and swallow the lot. */
const A_CONTROL = "button, a, input, textarea";

export default function Card({
  card,
  onOpenDetail,
  onEnter,
  onEnterInTab,
  onDelete,
  onRename,
  onToggleDone,
  onUnarchive,
  onArchive,
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
  labels = [],
  isDragging,
  spotlight,
}) {
  const { t } = useI18n();
  const textareaRef = useRef(null);
  const menuRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState("root");
  const [hovered, setHovered] = useState(false);
  const clickTimer = useRef(null);
  const hasBoard = card.board.columns.length > 0;
  const progress = hasBoard ? subBoardProgress(card.board) : null;
  /* A ring says "this is heading somewhere", so only a board with a ✅ column
     gets one — a reference list or a brainstorm has nowhere to arrive. */
  const ringed = hasBoard && progress.total > 0 && hasDoneColumn(card.board);
  const complete = ringed && progress.done >= progress.total;
  const commentCount = (card.comments || []).length;
  const hasDescription = Boolean(card.description?.trim());
  const cardLabelIds = cardLabels(card);
  const shownLabels = labels.filter((l) => cardLabelIds.includes(l.id));
  const checklist = checklistProgress(card);
  const due = dueState(card.dueAt, card.done);
  const repeats = repeatKey(card.repeat);
  /* A card with no deadline of its own may still hold dated work. Its own date
     always wins — this only fills a silence. */
  const inside = !card.dueAt && hasBoard && !card.done ? nextDueInside(card.board) : null;
  const insideDue = inside ? dueState(inside, false) : null;
  const [previewAllowedUrl, setPreviewAllowedUrl] = useState(null);
  const previewEnabled = previewAllowedUrl === card.title;
  const { isUrl, preview, loading } = useLinkPreview(card.title, previewEnabled);
  const checkRef = useRef(null);

  const tick = () => {
    const rect = checkRef.current.getBoundingClientRect();
    onToggleDone(card.id, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  /* Right finishes, left puts away — the two things done to a card without
     opening it, on the one part of it that is already a control. */
  const swipe = useSwipe({
    enabled: !card.archived && !editing,
    onRight: tick,
    onLeft: () => onArchive(card.id),
  });

  // Size the edit textarea to its content whenever it opens or the title changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [editing, card.title]);

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  useCardShortcuts({
    enabled: hovered && !editing && !isDragging,
    onAction: (action) => {
      if (action === "move" && (card.archived || !onMoveTo)) return;
      if (action === "rename") setEditing(true);
      else if (action === "archive") {
        if (card.archived) onUnarchive(card.id);
        else onArchive(card.id);
      } else {
        setMenuView(action);
        setMenuOpen(true);
      }
    },
  });

  useEffect(() => () => clearTimeout(clickTimer.current), []);

  /**
   * One click opens the card, two go into its board.
   *
   * Telling them apart means waiting: there is no way to know a second click
   * is coming. Opening pays the delay because going in is the rarer move.
   */
  const handleCardClick = (e) => {
    if (editing || e.target.closest(A_CONTROL)) return;
    clearTimeout(clickTimer.current);
    if (e.detail > 1) return; // the double-click handler has it
    clickTimer.current = setTimeout(() => onOpenDetail(card), DOUBLE_CLICK_MS);
  };

  const handleCardDoubleClick = (e) => {
    if (editing || e.target.closest(A_CONTROL)) return;
    clearTimeout(clickTimer.current);
    onEnter(card);
  };

  const handleTitleKeyDown = (e) => {
    e.stopPropagation();
    if (isComposingKey(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const handleCardKeyDown = (e) => {
    if (editing) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenDetail(card);
    }
  };

  const handleToggleDone = (e) => {
    e.stopPropagation();
    // The click that ends a swipe: the swipe already did what it meant
    if (swipe.consumeTap()) return;
    tick();
  };

  const stop = (e) => e.stopPropagation();

  return (
    <>
    {swipe.dx !== 0 && (
      /* Under the card, uncovered as it slides: what letting go will do */
      <div
        className={[
          "card-swipe-bg",
          swipe.dx > 0 ? "to-done" : "to-archive",
          swipe.armed ? "armed" : "",
        ].filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        {swipe.dx > 0 ? (
          <span className="card-swipe-hint">&#10003; {t(card.done ? "card.mark_undone" : "card.mark_done")}</span>
        ) : (
          <span className="card-swipe-hint"><IconArchive size={15} /> {t("archive.archive")}</span>
        )}
      </div>
    )}
    <div
      className={[
        "card",
        swipe.active ? "swiping" : "",
        isDragging ? "dragging" : "",
        isUrl ? "card-link" : "",
        card.done ? "card-done" : "",
        card.archived ? "card-archived" : "",
        spotlight === card.id ? "spotlight" : "",
      ].filter(Boolean).join(" ")}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined}
      data-card-id={card.id}
      aria-label={card.title || t("board.untitled")}
    >
      {shownLabels.length > 0 && (
        <div className="card-labels">
          {shownLabels.map((label) => (
            <span
              key={label.id}
              className={`card-label label-pattern-${label.color}${inkClass(label.color)}`}
              style={{ backgroundColor: colorHex(label.color) || "var(--surface3)" }}
              title={[label.emoji, label.name].filter(Boolean).join(" ") || undefined}
            >
              {label.emoji && <span className="card-label-emoji">{label.emoji}</span>}
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="card-main">
        <button
          ref={checkRef}
          className={`card-check${card.done ? " checked" : ""}`}
          onClick={handleToggleDone}
          {...swipe.handlers}
          aria-pressed={card.done}
          title={card.done ? t("card.mark_undone") : t("card.mark_done")}
        >
          <span className="card-check-mark">&#10003;</span>
        </button>

        <div className="card-title-wrap">
          {editing ? (
            <textarea
              enterKeyHint="done"
              ref={textareaRef}
              className="card-title-input"
              value={card.title}
              rows={1}
              onChange={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
                onRename(card.id, e.target.value);
              }}
              onKeyDown={handleTitleKeyDown}
              onBlur={() => setEditing(false)}
              onClick={stop}
              style={{ height: "auto", overflow: "hidden" }}
            />
          ) : (
            <div className="card-title">
              {card.title || (
                <span className="card-title-empty">{t("board.untitled")}</span>
              )}
            </div>
          )}

          {(hasBoard || hasDescription || commentCount > 0 || due || inside || checklist.total > 0) && (
            <div className="card-badges">
              {due && (
                <span
                  className={`card-badge due-badge due-${due}`}
                  title={repeats ? t(repeats, { n: card.repeat.every }) : t("due.title")}
                >
                  &#128197; {new Date(card.dueAt).toLocaleDateString(undefined, {
                    day: "numeric", month: "short",
                  })}
                  {/* Inside the date rather than beside it: the repetition is
                      not a second fact about the card, it is what this date
                      does next. */}
                  {repeats && <span className="due-badge-repeat" aria-hidden="true">&#8635;</span>}
                </span>
              )}
              {inside && (
                /* Hollow, and pointing down: the deadline is real but it is not
                   this card's — it belongs to something inside it. */
                <span
                  className={`card-badge due-badge due-inside inside-${insideDue}`}
                  title={t("due.inside")}
                >
                  &#8627; {new Date(`${inside.slice(0, 10)}T12:00:00`).toLocaleDateString(
                    undefined, { day: "numeric", month: "short" }
                  )}
                </span>
              )}
              {checklist.total > 0 && (
                <span
                  className={`card-badge${checklist.done === checklist.total ? " card-badge-complete" : ""}`}
                  title={t("checklist.title")}
                >
                  &#9745; {checklist.done}/{checklist.total}
                </span>
              )}
              {hasBoard && (
                <span
                  className={`card-badge card-badge-board${complete ? " complete" : ""}`}
                  title={t("detail.open_board")}
                >
                  {ringed ? (
                    <ProgressRing id={card.id} done={progress.done} total={progress.total} />
                  ) : (
                    <span className="card-depth-dot" />
                  )}
                  {progress.total > 0
                    ? `${progress.done}/${progress.total}`
                    : t("board.empty_board")}
                </span>
              )}
              {hasDescription && (
                <span className="card-badge" title={t("detail.description")}>
                  &#9776;
                </span>
              )}
              {commentCount > 0 && (
                <span className="card-badge" title={t("detail.comments")}>
                  &#128172; {commentCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Two targets, not five: the move this product is about, and
            everything else. A wide strip of glyphs sat on top of the title
            and could not be reached without a pointer. */}
        {!editing && (
          <div className="card-actions">
            {!card.archived && (
              <button
                className="card-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  // The browser's own gesture for "open this somewhere else"
                  if (e.metaKey || e.ctrlKey) onEnterInTab?.(card);
                  else onEnter(card);
                }}
                onAuxClick={(e) => {
                  if (e.button !== 1) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onEnterInTab?.(card);
                }}
                title={`${t("detail.open_board")}  ⌘·clic → ${t("tabs.new")}`}
                aria-label={t("detail.open_board")}
              >
                &rarr;
              </button>
            )}
            <button
              ref={menuRef}
              className="card-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setMenuView("root");
                setMenuOpen((v) => !v);
              }}
              aria-expanded={menuOpen}
              title={t("card.more")}
              aria-label={t("card.more")}
            >
              &#8943;
            </button>
          </div>
        )}
      </div>

      {menuOpen && (
        <Popover anchorRef={menuRef} align="right" onClose={() => setMenuOpen(false)}>
          <div onClick={stop}>
            <CardMenu
              card={card}
              initialView={menuView}
              labels={labels}
              onEnterInTab={() => onEnterInTab?.(card)}
              onRename={() => setEditing(true)}
              onDelete={() => onDelete(card.id)}
              onArchive={() => onArchive(card.id)}
              onUnarchive={() => onUnarchive(card.id)}
              onToggleLabel={(labelId) => onToggleLabel(card.id, labelId)}
              onSetDue={(value) => onSetDue(card.id, value)}
              onSetRepeat={(value) => onSetRepeat(card.id, value)}
              onAddLabel={onAddLabel}
              onUpdateLabel={onUpdateLabel}
              onDeleteLabel={onDeleteLabel}
              columns={columns}
              colId={colId}
              onMoveTo={onMoveTo && ((destColId) => onMoveTo(card.id, destColId))}
              onMoveElsewhere={() => onMoveElsewhere?.(card)}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </Popover>
      )}

      {/* Link preview — full width below */}
      {isUrl && (
        <div className="link-preview" onClick={stop}>
          {!previewEnabled ? <button className="btn-ghost-sm" onClick={() => setPreviewAllowedUrl(card.title)}>{t("card.load_preview")}</button> : loading ? (
            <div className="link-preview-loading">
              <span className="link-preview-spinner" />
            </div>
          ) : preview ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-preview-content"
            >
              {preview.image && (
                <div className="link-preview-img-wrap">
                  <img
                    src={preview.image}
                    referrerPolicy="no-referrer"
                    alt=""
                    className="link-preview-img"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                </div>
              )}
              <div className="link-preview-text">
                {preview.title && (
                  <div className="link-preview-title">{preview.title}</div>
                )}
                {preview.description && (
                  <div className="link-preview-desc">{preview.description}</div>
                )}
                <div className="link-preview-site">{preview.siteName}</div>
              </div>
            </a>
          ) : null}
        </div>
      )}
    </div>
    </>
  );
}
