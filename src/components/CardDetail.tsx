import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  uid, cardLabels, cardChecklists, dueState, subBoardStats, visibleCards,
  hasDoneColumn, nextDueInside, getBoardAtPath,
} from "../lib/board-utils";
import { colorHex, inkClass } from "../lib/palette";
import { repeatKey } from "../lib/repeat";
import Markdown from "../lib/markdown";
import { useI18n } from "../lib/i18n";
import LabelPicker from "./LabelPicker";
import Checklist from "./Checklist";
import MoveCardPanel from "./MoveCardPanel";
import Popover from "./Popover";
import DueMenu from "./DueMenu";
import ColumnPicker from "./ColumnPicker";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { dismissTextInput, isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";
import {
  IconCheck, IconMove, IconArchive, IconUnarchive, IconDuplicate,
  IconCalendar, IconTag, IconStar,
} from "./icons";
import type { LabelHandlers, Point } from "./Card";
import type { Card, Id, IsoDay, Label, PathSegment, Repeat, RootBoard, TitledSegment } from "../lib/types";

/**
 * Checklist edits, addressed by the card's column and id like the rest.
 * The Inbox has its own set: its cards sit in no column.
 */
export interface ChecklistActions {
  add: (colId: Id | null, cardId: Id, title: string) => void;
  rename: (colId: Id | null, cardId: Id, listId: Id, title: string) => void;
  remove: (colId: Id | null, cardId: Id, listId: Id) => void;
  addItem: (colId: Id | null, cardId: Id, listId: Id, text: string) => void;
  toggleItem: (colId: Id | null, cardId: Id, listId: Id, itemId: Id) => void;
  updateItem: (colId: Id | null, cardId: Id, listId: Id, itemId: Id, text: string) => void;
  removeItem: (colId: Id | null, cardId: Id, listId: Id, itemId: Id) => void;
}

interface CardDetailProps extends LabelHandlers {
  card: Card;
  /** The column holding the card; null for an Inbox card */
  colId: Id | null;
  onClose: () => void;
  onUpdate: (colId: Id | null, cardId: Id, fields: Partial<Card>) => void;
  /** Not offered for an Inbox card, which has no board to go into yet */
  onEnter?: (card: Card, colId: Id | null) => void;
  onToggleDone?: (colId: Id | null, cardId: Id, origin: Point) => void;
  root: RootBoard;
  /** The board holding the card, titled for the "where" line */
  path: TitledSegment[];
  onMove: (colId: Id | null, cardId: Id, path: PathSegment[], destColId: Id) => unknown;
  onDuplicate?: (colId: Id | null, cardId: Id) => void;
  labels: Label[];
  onToggleLabel: (colId: Id | null, cardId: Id, labelId: Id) => void;
  onSetDue: (colId: Id | null, cardId: Id, day: IsoDay | null) => void;
  onSetRepeat: (colId: Id | null, cardId: Id, repeat: Repeat | null) => void;
  checklistActions: ChecklistActions;
  /** Says where the card lives, when it was opened from away from its board */
  showPath?: boolean;
  favorited?: boolean;
  onToggleFavorite?: () => void;
  /** Opens straight onto the move picker */
  initialMove?: boolean;
  /** An Inbox card: no done state, archive, duplicate or board of its own */
  inbox?: boolean;
}

export default function CardDetail({
  card, colId, onClose: onDismiss, onUpdate, onEnter, onToggleDone,
  root, path, onMove, onDuplicate,
  labels, onToggleLabel, onAddLabel, onUpdateLabel, onDeleteLabel,
  onSetDue, onSetRepeat, checklistActions, showPath, favorited, onToggleFavorite,
  initialMove = false,
  inbox = false,
}: CardDetailProps) {
  const { t, locale } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  const [description, setDescription] = useState(card.description || "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(initialMove);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnChip = useRef<HTMLButtonElement>(null);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [dueOpen, setDueOpen] = useState(false);
  const [title, setTitle] = useState(card.title || "");
  const descRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const checklistRef = useRef<HTMLInputElement>(null);
  const revertTitle = useRef(false);
  const labelBtn = useRef<HTMLButtonElement>(null);
  const dueBtn = useRef<HTMLButtonElement>(null);
  const labelChip = useRef<HTMLButtonElement>(null);
  const dueChip = useRef<HTMLButtonElement>(null);
  // A popover opens under whichever control asked for it
  const [labelsFrom, setLabelsFrom] = useState<"bar" | "chip">("bar");
  const [dueFrom, setDueFrom] = useState<"bar" | "chip">("bar");

  const onClose = useCallback(() => {
    if (overlayRef.current) dismissTextInput(overlayRef.current);
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (editingDesc && descRef.current) descRef.current.focus();
  }, [editingDesc]);

  // Adjusted during render rather than in an effect: an undo or a sync can
  // rewrite the title under us, and the field has to follow without a
  // second pass showing the stale one.
  const [lastSeenTitle, setLastSeenTitle] = useState(card.title || "");
  if (card.title !== lastSeenTitle) {
    setLastSeenTitle(card.title || "");
    setTitle(card.title || "");
  }

  const [lastSeenDescription, setLastSeenDescription] = useState(card.description || "");
  if ((card.description || "") !== lastSeenDescription) {
    setLastSeenDescription(card.description || "");
    if (!editingDesc) setDescription(card.description || "");
  }

  // A textarea keeps its scrollbar height, not its content's, so it has to be
  // measured after every change or a wrapped title is cut off. A narrower
  // window rewraps it too, and the measurement is just as stale then.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [title]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isComposingKey(e)) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const saveTitle = () => {
    const next = title.trim();
    // An empty title would leave nothing to click on back on the board
    if (!next) { setTitle(card.title || ""); return; }
    if (next !== card.title) onUpdate(colId, card.id, { title: next });
  };

  const setDue = (value: IsoDay | null) => { onSetDue(colId, card.id, value); setDueOpen(false); };
  /* The popover stays open, unlike setting a date: a repetition is a rule
     being tuned, and each touch of it is rarely the last. */
  const setRepeat = (value: Repeat | null) => onSetRepeat(colId, card.id, value);

  const saveDescription = () => {
    descRef.current?.blur();
    onUpdate(colId, card.id, { description });
    setEditingDesc(false);
  };

  const addComment = () => {
    if (!commentText.trim()) return;
    const comment = {
      id: uid(),
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    const comments = [...(card.comments || []), comment];
    onUpdate(colId, card.id, { comments });
    setCommentText("");
    if (mobile) commentRef.current?.blur();
  };

  const closeChecklist = () => {
    checklistRef.current?.blur();
    setChecklistTitle("");
    setAddingChecklist(false);
  };
  const addChecklist = () => {
    const title = checklistTitle.trim();
    if (title) checklistActions.add(colId, card.id, title);
    closeChecklist();
  };

  const deleteComment = (commentId: Id) => {
    const comments = (card.comments || []).filter((c) => c.id !== commentId);
    onUpdate(colId, card.id, { comments });
  };

  const hasSubBoard = card.board.columns.length > 0;
  const selectedLabels = labels.filter((l) => cardLabels(card).includes(l.id));
  const checklists = cardChecklists(card);
  const due = dueState(card.dueAt, card.done);
  const repeats = repeatKey(card.repeat);
  const stats = hasSubBoard ? subBoardStats(card.board) : null;
  // A brainstorm or a reference list is never meant to be finished; showing it
  // at 0% would read a goal into it that its author never set. The ✅ column is
  // what says this board has an end.
  const tracksCompletion = hasSubBoard && hasDoneColumn(card.board);
  /* Only worth saying when the card has no deadline of its own: otherwise its
     own date is the one that matters and this would just compete with it. */
  const insideDue = !card.dueAt && hasSubBoard ? nextDueInside(card.board) : null;
  const dateFmt = locale === "fr" ? "fr-FR" : "en-US";
  const segments = path.map((p) => ({ colId: p.colId, cardId: p.cardId }));
  const homeColumns = getBoardAtPath(root, segments)?.columns ?? [];
  const homeColumn = homeColumns.find((c) => c.id === colId);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-header-top">
            {/* Looks like the heading it replaces until you put a cursor in it */}
            <textarea
              ref={titleRef}
              className={`modal-title-input${card.done ? " modal-title-done" : ""}`}
              value={title}
              rows={1}
              enterKeyHint="done"
              spellCheck={false}
              placeholder={t("detail.title_placeholder")}
              aria-label={t("detail.title")}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                // setTitle has not landed yet when Escape blurs us, so the save
                // would write the very edit being abandoned.
                if (revertTitle.current) { revertTitle.current = false; return; }
                saveTitle();
              }}
              onKeyDown={(e) => {
                if (isComposingKey(e)) return;
                // A card title is one line: Enter commits rather than breaking it
                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === "Escape") {
                  // Otherwise it reaches the window handler and shuts the modal
                  e.stopPropagation();
                  revertTitle.current = true;
                  setTitle(card.title || "");
                  e.currentTarget.blur();
                }
              }}
            />
            {/* State of the card, kept beside the close where it was: these
                two say what the card *is*, not what to do with it. */}
            <div className="modal-tools">
              {!inbox && <button
                className={`modal-tool${card.done ? " on" : ""}`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onToggleDone!(colId, card.id, {
                    x: r.left + r.width / 2,
                    y: r.top + r.height / 2,
                  });
                }}
                aria-pressed={card.done}
                aria-label={card.done ? t("card.mark_undone") : t("card.mark_done")}
                title={card.done ? t("card.mark_undone") : t("card.mark_done")}
              >
                <IconCheck />
              </button>}

              {!inbox && <button
                className="modal-tool"
                onClick={() => {
                  onUpdate(colId, card.id, { archived: !card.archived });
                  onClose();
                }}
                aria-label={card.archived ? t("archive.unarchive") : t("archive.archive")}
                title={card.archived ? t("archive.unarchive") : t("archive.archive")}
              >
                {card.archived ? <IconUnarchive /> : <IconArchive />}
              </button>}

              {onToggleFavorite && (
                /* Reachable from anywhere the card can be opened — the
                   breadcrumb star only exists while a board is on screen. */
                <button
                  className={`modal-tool${favorited ? " starred" : ""}`}
                  onClick={onToggleFavorite}
                  aria-pressed={favorited}
                  aria-label={favorited ? t("favorites.remove") : t("favorites.add")}
                  title={favorited ? t("favorites.remove") : t("favorites.add")}
                >
                  <IconStar filled={favorited} />
                </button>
              )}

              <span className="modal-tools-sep" />

              <button className="modal-close" onClick={onClose} title={t("board.cancel")}>
                &times;
              </button>
            </div>
          </div>

          {/* Opened from somewhere that shows cards from all over the tree, a
              title alone does not say which project's card this is. */}
          {showPath && (
            <div className="modal-where">
              <span>{t("header.root")}</span>
              {path.map((p) => (
                <span key={p.cardId}>
                  <span className="modal-where-sep">&rsaquo;</span>
                  {p.cardTitle}
                </span>
              ))}
            </div>
          )}

          {/* What is set, readable without opening anything — and reaching for
              one is already saying you want to change it. */}
          <div className="modal-chips">
              {/* Where the card is, and the way to its neighbours: the move
                  made most often, one tap from the top of the card. */}
              {homeColumn && (
                <button
                  ref={columnChip}
                  className="column-chip"
                  onClick={() => setColumnsOpen((v) => !v)}
                  aria-expanded={columnsOpen}
                  title={t("move.to_column")}
                >
                  <span
                    className="column-pick-dot"
                    style={colorHex(homeColumn.color) ? { background: colorHex(homeColumn.color)! } : undefined}
                    aria-hidden="true"
                  />
                  {homeColumn.emoji && <span>{homeColumn.emoji}</span>}
                  <span className="column-chip-name">{homeColumn.title || t("board.untitled")}</span>
                  <span className="column-chip-caret" aria-hidden="true">&#9662;</span>
                </button>
              )}
              {selectedLabels.map((label, i) => (
                <button
                  key={label.id}
                  ref={i === 0 ? labelChip : undefined}
                  className={`label-chip label-pattern-${label.color}${inkClass(label.color)}`}
                  style={{ backgroundColor: colorHex(label.color) || "var(--surface3)" }}
                  onClick={() => { setLabelsFrom("chip"); setLabelsOpen(true); }}
                  title={t("labels.title")}
                >
                  {label.emoji && <span className="label-chip-emoji">{label.emoji}</span>}
                  {label.name}
                </button>
              ))}
              {card.dueAt && (
                <button
                  ref={dueChip}
                  className={`due-badge due-${due}`}
                  onClick={() => { setDueFrom("chip"); setDueOpen(true); }}
                  title={repeats ? t(repeats, { n: card.repeat!.every }) : t("due.title")}
                >
                  {new Date(`${card.dueAt.slice(0, 10)}T12:00:00`).toLocaleDateString(dateFmt, {
                    day: "numeric",
                    month: "short",
                  })}
                  {/* The state stays, repetition or not: a card that comes
                      back can be late, and that is the more urgent of the
                      two. The rule is one click away, in the panel this chip
                      opens — here it is only marked. */}
                  <span className="due-badge-state">{t(`due.${due}`)}</span>
                  {repeats && <span className="due-badge-repeat" aria-hidden="true">&#8635;</span>}
                </button>
              )}
            </div>

          {columnsOpen && (
            <Popover anchorRef={columnChip} onClose={() => setColumnsOpen(false)}>
              <div className="card-menu">
                <ColumnPicker
                  columns={homeColumns}
                  currentColId={colId!}
                  onPick={(destColId) => {
                    setColumnsOpen(false);
                    onMove(colId, card.id, segments, destColId);
                  }}
                  onElsewhere={() => { setColumnsOpen(false); setMoveOpen(true); }}
                />
              </div>
            </Popover>
          )}

          {/* Named, not just drawn: unlabelled 30px glyphs were a guessing
              game, and on a phone too small to hit reliably. Due date and
              labels lead — they are edited far more than the rest. */}
          <div className="modal-bar">
            <button
              ref={labelBtn}
              className={`modal-act${selectedLabels.length > 0 ? " set" : ""}`}
              onClick={() => { setLabelsFrom("bar"); setLabelsOpen((v) => !v); }}
              aria-expanded={labelsOpen}
            >
              <IconTag size={15} />
              {t("labels.title")}
            </button>

            <button
              ref={dueBtn}
              className={`modal-act${card.dueAt ? " set" : ""}`}
              onClick={() => { setDueFrom("bar"); setDueOpen((v) => !v); }}
              aria-expanded={dueOpen}
            >
              <IconCalendar size={15} />
              {t("due.title")}
              {repeats && <span className="modal-act-repeat" aria-hidden="true">&#8635;</span>}
            </button>

            <span className="modal-bar-sep" />

            <button
              className={`modal-act${moveOpen ? " on-neutral" : ""}`}
              onClick={() => setMoveOpen((v) => !v)}
              aria-expanded={moveOpen}
            >
              <IconMove size={15} />
              {t("move.action")}
            </button>

            {!inbox && <button
              className="modal-act"
              onClick={() => { onDuplicate!(colId, card.id); onClose(); }}
            >
              <IconDuplicate size={15} />
              {t("detail.duplicate")}
            </button>}

          </div>

          {labelsOpen && (
            <Popover
              anchorRef={labelsFrom === "chip" ? labelChip : labelBtn}
              onClose={() => setLabelsOpen(false)}
            >
              <LabelPicker
                labels={labels}
                selected={cardLabels(card)}
                onToggle={(id) => onToggleLabel(colId, card.id, id)}
                onAdd={onAddLabel}
                onUpdate={onUpdateLabel}
                onDelete={onDeleteLabel}
                onClose={() => setLabelsOpen(false)}
              />
            </Popover>
          )}

          {dueOpen && (
            <Popover
              anchorRef={dueFrom === "chip" ? dueChip : dueBtn}
              onClose={() => setDueOpen(false)}
            >
              <DueMenu
                value={card.dueAt}
                onSet={(v) => setDue(v)}
                onClear={() => setDue(null)}
                repeat={card.repeat}
                onSetRepeat={setRepeat}
              />
            </Popover>
          )}

        </div>

        {/* The board this card carries. Every other view of a card says what it
            is; this is the only one that says what is inside it. */}
        <div className="modal-section subboard">
          <div className="subboard-head">
            <h3 className="modal-section-title">{t("detail.subboard")}</h3>
            {!inbox && <button
              className="modal-drill-btn"
              onClick={() => { onClose(); onEnter!(card, colId); }}
            >
              {hasSubBoard ? t("detail.open_board") : t("detail.create_board")} &rarr;
            </button>}
          </div>

          {!hasSubBoard ? (
            <p className="subboard-empty">{t("detail.subboard_empty")}</p>
          ) : (
            <>
              {stats!.cards > 0 && (
                <div className="subboard-stats">
                  {tracksCompletion ? (
                    <>
                      <span className="subboard-bar" aria-hidden="true">
                        <span style={{ width: `${(stats!.done / stats!.cards) * 100}%` }} />
                      </span>
                      <span className="subboard-figure">
                        {stats!.done}/{stats!.cards} {t("detail.done_count")}
                      </span>
                    </>
                  ) : (
                    <span className="subboard-figure">
                      {stats!.cards} {t(stats!.cards > 1 ? "detail.cards" : "detail.card")}
                    </span>
                  )}
                  {/* One level is just a board; more is the point of the thing */}
                  {stats!.depth > 1 && (
                    <span className="subboard-figure">
                      {stats!.depth} {t(stats!.depth > 1 ? "detail.levels" : "detail.level")}
                    </span>
                  )}
                  {stats!.overdue > 0 && (
                    <span className="subboard-figure subboard-late">
                      {stats!.overdue} {t("due.overdue").toLowerCase()}
                    </span>
                  )}
                  {insideDue && (
                    <span className="subboard-figure" title={t("due.inside")}>
                      &#8627;{" "}
                      {new Date(`${insideDue.slice(0, 10)}T12:00:00`).toLocaleDateString(
                        dateFmt, { day: "numeric", month: "short" }
                      )}
                    </span>
                  )}
                </div>
              )}

              <div className="subboard-cols">
                {card.board.columns.slice(0, 6).map((col) => (
                  <span key={col.id} className="subboard-col">
                    <span
                      className="subboard-col-dot"
                      style={{ backgroundColor: colorHex(col.color) || "var(--text-faint)" }}
                    />
                    {col.emoji && <span>{col.emoji}</span>}
                    <span className="subboard-col-name">{col.title}</span>
                    <span className="subboard-col-count">{visibleCards(col).length}</span>
                  </span>
                ))}
                {card.board.columns.length > 6 && (
                  <span className="subboard-col subboard-more">
                    +{card.board.columns.length - 6}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {moveOpen && (
          <MoveCardPanel
            root={root}
            card={card}
            currentColId={colId}
            currentPath={path}
            onMove={(destPath, destColId) => {
              setMoveOpen(false);
              onMove(colId, card.id, destPath, destColId);
              onClose();
            }}
            onClose={() => setMoveOpen(false)}
          />
        )}

        {/* Description */}
        <div className="modal-section">
          <h3 className="modal-section-title">{t("detail.description")}</h3>
          {editingDesc ? (
            <div className="modal-desc-edit">
              <textarea
                ref={descRef}
                className="modal-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("detail.desc_placeholder")}
                rows={4}
                enterKeyHint="enter"
                aria-describedby="md-hint"
                onKeyDown={(e) => {
                  if (isComposingKey(e)) return;
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveDescription(); }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    e.currentTarget.blur();
                    setDescription(card.description || "");
                    setEditingDesc(false);
                  }
                }}
              />
              <div className="modal-desc-actions">
                <span id="md-hint" className="md-hint">{t("detail.markdown_hint")}</span>
                <button className="btn-primary" onClick={saveDescription}>
                  {t("detail.save")}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    descRef.current?.blur();
                    setDescription(card.description || "");
                    setEditingDesc(false);
                  }}
                >
                  {t("board.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`modal-desc-display ${!description ? "placeholder" : ""}`}
              onClick={(e) => { if (!(e.target as Element).closest("a")) setEditingDesc(true); }}
            >
              {description
                ? <Markdown text={description} />
                : t("detail.desc_placeholder")}
            </div>
          )}
        </div>

        {/* Checklists */}
        <div className="modal-section">
          <h3 className="modal-section-title">
            {t("checklist.title")}
            {checklists.length > 0 && (
              <span className="comment-count">{checklists.length}</span>
            )}
          </h3>

          {checklists.map((list) => (
            <Checklist
              key={list.id}
              list={list}
              onRename={(title) => checklistActions.rename(colId, card.id, list.id, title)}
              onDelete={() => checklistActions.remove(colId, card.id, list.id)}
              onAddItem={(text) => checklistActions.addItem(colId, card.id, list.id, text)}
              onToggleItem={(itemId) => checklistActions.toggleItem(colId, card.id, list.id, itemId)}
              onUpdateItem={(itemId, text) => checklistActions.updateItem(colId, card.id, list.id, itemId, text)}
              onDeleteItem={(itemId) => checklistActions.removeItem(colId, card.id, list.id, itemId)}
            />
          ))}

          {addingChecklist ? (
            <div className="checklist-add-form">
              <input
                ref={checklistRef}
                className="checklist-item-input"
                value={checklistTitle}
                enterKeyHint="done"
                autoFocus
                placeholder={t("checklist.name_placeholder")}
                onChange={(e) => setChecklistTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (isComposingKey(e)) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    addChecklist();
                  }
                  if (e.key === "Escape") { e.stopPropagation(); closeChecklist(); }
                }}
              />
              <button
                className="btn-primary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addChecklist}
              >
                {t("board.add")}
              </button>
            </div>
          ) : (
            <button className="checklist-add-btn" onClick={() => setAddingChecklist(true)}>
              + {t("checklist.add")}
            </button>
          )}
        </div>

        {/* Comments */}
        <div className="modal-section">
          <h3 className="modal-section-title">
            {t("detail.comments")}{" "}
            {(card.comments || []).length > 0 && (
              <span className="comment-count">{card.comments.length}</span>
            )}
          </h3>

          <div className="comment-form">
            <textarea
              ref={commentRef}
              className="modal-textarea comment-input"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("detail.comment_placeholder")}
              rows={2}
              enterKeyHint="enter"
              onKeyDown={(e) => {
                if (isComposingKey(e)) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment(); }
              }}
            />
            {commentText.trim() && (
              <button className="btn-primary" onClick={addComment}>
                {t("detail.comment_btn")}
              </button>
            )}
          </div>

          <div className="comment-list">
            {(card.comments || [])
              .slice()
              .reverse()
              .map((c) => (
                <div key={c.id} className="comment-item">
                  <Markdown text={c.text} className="comment-text" />
                  <div className="comment-meta">
                    <span className="comment-date">
                      {new Date(c.createdAt).toLocaleDateString(dateFmt, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      className="comment-del"
                      onClick={() => deleteComment(c.id)}
                    >
                      {t("detail.delete_comment")}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
