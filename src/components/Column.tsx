import { useState, useRef } from "react";
import { visibleCards } from "../lib/board-utils";
import { COL_COLORS, colorHex } from "../lib/palette";
import EmojiGrid from "./EmojiGrid";
import Popover from "./Popover";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import Card, { type LabelHandlers, type Point } from "./Card";
import AddCard from "./AddCard";
import { useI18n } from "../lib/i18n";
import { isComposingKey } from "../lib/text-entry";
import type { SortKey } from "../lib/board-utils";
import type { Card as CardModel, Column as ColumnModel, Id, IsoDay, Label, Repeat } from "../lib/types";

/**
 * What the board's columns and cards can ask of it, addressed by column.
 * The board passes them through unchanged, so it shares the same set.
 */
export interface ColumnHandlers extends LabelHandlers {
  onAddCard: (colId: Id, title: string) => void;
  onDeleteCard: (colId: Id, cardId: Id) => void;
  onEnterCard: (card: CardModel, colId: Id) => void;
  onEnterCardInTab: (card: CardModel, colId: Id) => void;
  onOpenCardDetail: (card: CardModel, colId: Id, options?: { move?: boolean }) => void;
  onRenameCard: (colId: Id, cardId: Id, title: string) => void;
  onDeleteCol: (colId: Id) => void;
  onRenameCol: (colId: Id, title: string) => void;
  onUpdateColEmoji: (colId: Id, emoji: string) => void;
  onUpdateColColor: (colId: Id, color: string) => void;
  onToggleCardDone: (colId: Id, cardId: Id, origin: Point) => void;
  onUnarchiveCard: (colId: Id, cardId: Id) => void;
  onArchiveCard: (colId: Id, cardId: Id) => void;
  onToggleCardLabel: (colId: Id, cardId: Id, labelId: Id) => void;
  onSetCardDue: (colId: Id, cardId: Id, day: IsoDay | null) => void;
  onSetCardRepeat: (colId: Id, cardId: Id, repeat: Repeat | null) => void;
  onSortColumn: (colId: Id, key: SortKey) => void;
  onMoveCard: (colId: Id, cardId: Id, destColId: Id) => void;
}

interface ColumnProps extends ColumnHandlers {
  col: ColumnModel;
  index: number;
  /** Every column of the board, for moving a card between them */
  columns: ColumnModel[];
  labels: Label[];
  labelFilter?: Id[];
  spotlight?: Id | null;
}

function ColorPicker({ currentColor, onPick }: { currentColor: string; onPick: (color: string) => void }) {
  return (
    <div className="color-picker">
      {COL_COLORS.map((c) => (
          <button
            key={c.id || "none"}
            className={`color-option ${c.id === currentColor ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(c.id);
            }}
            title={c.label}
          >
            {c.hex ? (
              <span className="color-dot" style={{ background: c.hex }} />
            ) : (
              <span className="color-dot color-dot-none" />
            )}
          </button>
        ))}
    </div>
  );
}


export default function Column({
  col,
  index,
  onAddCard,
  onDeleteCard,
  onEnterCard,
  onEnterCardInTab,
  onOpenCardDetail,
  onRenameCard,
  onDeleteCol,
  onRenameCol,
  onUpdateColEmoji,
  onUpdateColColor,
  onToggleCardDone,
  onUnarchiveCard,
  onArchiveCard,
  onToggleCardLabel,
  onSetCardDue,
  onSetCardRepeat,
  onAddLabel,
  onUpdateLabel,
  onDeleteLabel,
  onSortColumn,
  onMoveCard,
  columns,
  labels,
  labelFilter = [],
  spotlight,
}: ColumnProps) {
  const { t } = useI18n();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);

  const hex = colorHex(col.color);
  const [showSort, setShowSort] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  // Filtering hides cards without touching the board, so the count still
  // reflects the column and only the list narrows.
  const allVisible = visibleCards(col);
  const cards =
    labelFilter.length > 0
      ? allVisible.filter((c) => labelFilter.every((id) => (c.labels || []).includes(id)))
      : allVisible;
  const archived = col.cards.filter((c) => c.archived);
  const doneCount = allVisible.filter((c) => c.done).length;
  const hidden = allVisible.length - cards.length;

  return (
    <Draggable draggableId={col.id} index={index}>
      {(provided) => (
        <div
          className="column"
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            ...provided.draggableProps.style,
            ...(hex ? { borderTopColor: hex } : {}),
          }}
        >
          <div className="col-header" {...provided.dragHandleProps}>
            <div
              className="col-emoji-wrap"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                ref={emojiBtnRef}
                className="col-emoji-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowColorPicker(false);
                }}
                title={t("emoji.pick")}
              >
                {col.emoji || "\u2795"}
              </button>
              {showEmojiPicker && (
                <Popover anchorRef={emojiBtnRef} onClose={() => setShowEmojiPicker(false)}>
                  <EmojiGrid
                    current={col.emoji || ""}
                    onPick={(emoji) => {
                      onUpdateColEmoji(col.id, emoji);
                      setShowEmojiPicker(false);
                    }}
                  />
                </Popover>
              )}
            </div>
            <input
              className="col-title-input"
              value={col.title}
              enterKeyHint="done"
              onChange={(e) => onRenameCol(col.id, e.target.value)}
              onKeyDown={(e) => {
                if (isComposingKey(e)) return;
                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
              }}
            />
            <div
              className="col-color-wrap"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                ref={colorBtnRef}
                className="col-color-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                  setShowEmojiPicker(false);
                }}
                title={t("color.pick")}
              >
                <span
                  className="col-color-dot"
                  style={hex ? { background: hex } : undefined}
                />
              </button>
              {showColorPicker && (
                <Popover anchorRef={colorBtnRef} align="right" onClose={() => setShowColorPicker(false)}>
                  <ColorPicker
                    currentColor={col.color || ""}
                    onPick={(color) => {
                      onUpdateColColor(col.id, color);
                      setShowColorPicker(false);
                    }}
                  />
                </Popover>
              )}
            </div>
            <span className="col-count" title={t("board.card_count")}>
              {doneCount > 0 ? `${doneCount}/${allVisible.length}` : allVisible.length}
            </span>

            <div className="col-sort-wrap" onMouseDown={(e) => e.stopPropagation()}>
              <button
                ref={sortBtnRef}
                className="col-sort-btn"
                onClick={(e) => { e.stopPropagation(); setShowSort((v) => !v); }}
                title={t("sort.title")}
                aria-label={t("sort.title")}
              >
                &#8645;
              </button>
              {showSort && (
                <Popover anchorRef={sortBtnRef} align="right" onClose={() => setShowSort(false)}>
                  <div className="col-sort-menu">
                    <span className="label-picker-title">{t("sort.title")}</span>
                    {(["due", "title", "done"] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        className="col-sort-option"
                        onClick={() => { onSortColumn(col.id, key); setShowSort(false); }}
                      >
                        {t(key === "title" ? "sort.title_az" : `sort.${key}`)}
                      </button>
                    ))}
                  </div>
                </Popover>
              )}
            </div>
            {confirmDelete ? (
              <button
                className="col-del confirm"
                onClick={() => onDeleteCol(col.id)}
                onMouseLeave={() => setConfirmDelete(false)}
                title={t("board.confirm_delete")}
                style={{ display: "block" }}
              >
                ?
              </button>
            ) : (
              <button
                className="col-del"
                onClick={() => setConfirmDelete(true)}
                title={t("board.delete")}
              >
                &times;
              </button>
            )}
          </div>

          <Droppable droppableId={col.id} type="card">
            {(dropProvided, dropSnapshot) => (
              <div
                className="col-cards"
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                style={{
                  background: dropSnapshot.isDraggingOver
                    ? "var(--accent-glow)"
                    : undefined,
                  borderRadius: "0 0 var(--radius) var(--radius)",
                  transition: "background 0.15s",
                }}
              >
                {cards.length === 0 && !dropSnapshot.isDraggingOver && (
                  <div className="empty">
                    {hidden > 0 ? t("filter.all_hidden") : t("board.no_cards")}
                  </div>
                )}
                {cards.length > 0 && hidden > 0 && (
                  <div className="col-filtered-note">
                    {hidden} {hidden > 1 ? t("filter.hidden_plural") : t("filter.hidden")}
                  </div>
                )}
                {cards.map((card, cardIdx) => (
                  <Draggable
                    key={card.id}
                    draggableId={card.id}
                    index={cardIdx}
                  >
                    {(dragProvided, dragSnapshot) => (
                      <div
                        className="card-slot"
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                      >
                        <Card
                          card={card}
                          isDragging={dragSnapshot.isDragging}
                          onEnter={(c) => onEnterCard(c, col.id)}
                          onEnterInTab={(c) => onEnterCardInTab(c, col.id)}
                          onOpenDetail={(c) => onOpenCardDetail(c, col.id)}
                          onDelete={(cardId) => onDeleteCard(col.id, cardId)}
                          onRename={(cardId, title) =>
                            onRenameCard(col.id, cardId, title)
                          }
                          onToggleDone={(cardId, origin) =>
                            onToggleCardDone(col.id, cardId, origin)
                          }
                          onUnarchive={(cardId) =>
                            onUnarchiveCard(col.id, cardId)
                          }
                          onArchive={(cardId) => onArchiveCard(col.id, cardId)}
                          onToggleLabel={(cardId, labelId) =>
                            onToggleCardLabel(col.id, cardId, labelId)
                          }
                          onSetDue={(cardId, value) =>
                            onSetCardDue(col.id, cardId, value)
                          }
                          onSetRepeat={(cardId, value) =>
                            onSetCardRepeat(col.id, cardId, value)
                          }
                          onAddLabel={onAddLabel}
                          onUpdateLabel={onUpdateLabel}
                          onDeleteLabel={onDeleteLabel}
                          columns={columns}
                          colId={col.id}
                          onMoveTo={(cardId, destColId) =>
                            onMoveCard(col.id, cardId, destColId)
                          }
                          onMoveElsewhere={(c) =>
                            onOpenCardDetail(c, col.id, { move: true })
                          }
                          labels={labels}
                          spotlight={spotlight}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>

          {archived.length > 0 && (
            <div className="col-archived">
              <button
                className="col-archived-toggle"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? "\u25be" : "\u25b8"} {archived.length}{" "}
                {archived.length > 1
                  ? t("archive.count_plural")
                  : t("archive.count")}
              </button>
              {showArchived && (
                <div className="col-archived-list">
                  {archived.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      onEnter={(c) => onEnterCard(c, col.id)}
                      onOpenDetail={(c) => onOpenCardDetail(c, col.id)}
                      onDelete={(cardId) => onDeleteCard(col.id, cardId)}
                      onRename={(cardId, title) =>
                        onRenameCard(col.id, cardId, title)
                      }
                      onToggleDone={(cardId, origin) =>
                        onToggleCardDone(col.id, cardId, origin)
                      }
                      onUnarchive={(cardId) => onUnarchiveCard(col.id, cardId)}
                      onArchive={(cardId) => onArchiveCard(col.id, cardId)}
                      onToggleLabel={(cardId, labelId) =>
                        onToggleCardLabel(col.id, cardId, labelId)
                      }
                      onSetDue={(cardId, value) => onSetCardDue(col.id, cardId, value)}
                      onSetRepeat={(cardId, value) => onSetCardRepeat(col.id, cardId, value)}
                      onAddLabel={onAddLabel}
                      onUpdateLabel={onUpdateLabel}
                      onDeleteLabel={onDeleteLabel}
                      labels={labels}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <AddCard onAdd={(title) => onAddCard(col.id, title)} />
        </div>
      )}
    </Draggable>
  );
}
