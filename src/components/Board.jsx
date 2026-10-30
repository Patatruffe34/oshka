import { useEffect, useRef } from "react";
import { Droppable } from "@hello-pangea/dnd";
import Column from "./Column";
import AddColumn from "./AddColumn";
import BoardPresets from "./BoardPresets";
import { useDollTransition } from "../hooks/useDollTransition";
import { useColumnSwipe } from "../hooks/useColumnSwipe";
import { useMediaQuery } from "../hooks/useMediaQuery";

export default function Board({
  board,
  navigating,
  onAddCard,
  onDeleteCard,
  onEnterCard,
  onEnterCardInTab,
  onOpenCardDetail,
  onRenameCard,
  onAddCol,
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
  labels,
  labelFilter = [],
  drag,
  onApplyPreset,
  zoneLabel,
  viewKey,
  spotlight,
}) {
  const { wrapRef, zoneRef, dragging, draggingColumn, zoneHot } = drag;

  /*
   * Where each view was left, so a tab comes back where you left it.
   *
   * A view is a tab at a position. A position you have not been to has nothing
   * stored and opens at the left — which is also the old behaviour, since
   * entering a board used to inherit its parent's scroll and land you mid-way
   * along a child whose first columns are usually the point.
   */
  /*
   * Bring the card you came looking for into view.
   *
   * Arriving on a board scrolled to the left while the card sits in the last
   * column means hunting for the very thing you just asked to be shown. The
   * card is not mounted the instant the spotlight is set — navigation waits a
   * frame — so this looks again for a moment before giving up.
   */
  useEffect(() => {
    if (!spotlight) return;
    let tries = 0;
    let timer = 0;
    const reach = () => {
      const el = wrapRef.current?.querySelector(`[data-card-id="${spotlight}"]`);
      if (el) {
        el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
        return;
      }
      if (++tries < 12) timer = setTimeout(reach, 60);
    };
    timer = setTimeout(reach, 60);
    return () => clearTimeout(timer);
  }, [spotlight, wrapRef]);

  useDollTransition(wrapRef, viewKey, navigating);
  // Same breakpoint as the one-column-per-screen layout in app.css. Waits for
  // the board too: until then nothing is rendered and the ref is empty.
  const phone = useMediaQuery("(max-width: 640px)");
  useColumnSwipe(wrapRef, phone && !!board);

  const scrolls = useRef(new Map());
  const shownView = useRef(viewKey);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (shownView.current !== viewKey) {
      scrolls.current.set(shownView.current, el.scrollLeft);
      shownView.current = viewKey;
    }
    el.scrollLeft = scrolls.current.get(viewKey) ?? 0;
  }, [viewKey, wrapRef]);

  if (!board) return null;

  const isEmpty = board.columns.length === 0;

  return (
      <div
        className={["board-wrap", navigating ? "navigating" : "", dragging ? "dragging" : ""]
          .filter(Boolean).join(" ")}
        ref={wrapRef}
      >
        <Droppable droppableId="board" direction="horizontal" type="column">
          {(provided) => (
            <div
              className={`board${isEmpty ? " board-empty" : ""}`}
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {isEmpty &&
                (onApplyPreset ? (
                  <BoardPresets onSelect={onApplyPreset}>
                    <AddColumn onAdd={onAddCol} />
                  </BoardPresets>
                ) : (
                  <AddColumn onAdd={onAddCol} />
                ))}
              {board.columns.map((col, idx) => (
                <Column
                  key={col.id}
                  col={col}
                  index={idx}
                  onAddCard={onAddCard}
                  onDeleteCard={onDeleteCard}
                  onEnterCard={onEnterCard}
                  onEnterCardInTab={onEnterCardInTab}
                  onOpenCardDetail={onOpenCardDetail}
                  onRenameCard={onRenameCard}
                  onDeleteCol={onDeleteCol}
                  onRenameCol={onRenameCol}
                  onUpdateColEmoji={onUpdateColEmoji}
                  onUpdateColColor={onUpdateColColor}
                  onToggleCardDone={onToggleCardDone}
                  onUnarchiveCard={onUnarchiveCard}
                  onArchiveCard={onArchiveCard}
                  onToggleCardLabel={onToggleCardLabel}
                  onSetCardDue={onSetCardDue}
                  onSetCardRepeat={onSetCardRepeat}
                  onAddLabel={onAddLabel}
                  onUpdateLabel={onUpdateLabel}
                  onDeleteLabel={onDeleteLabel}
                  onSortColumn={onSortColumn}
                  onMoveCard={onMoveCard}
                  columns={board.columns}
                  labels={labels}
                  labelFilter={labelFilter}
                  spotlight={spotlight}
                />
              ))}
              {provided.placeholder}
              {!isEmpty && <AddColumn onAdd={onAddCol} />}
            </div>
          )}
        </Droppable>

        <div
          ref={zoneRef}
          className={[
            "move-zone",
            draggingColumn ? "armed" : "",
            zoneHot ? "over" : "",
          ].filter(Boolean).join(" ")}
          aria-hidden={!draggingColumn}
        >
          <span className="move-zone-label">{zoneLabel}</span>
        </div>

      </div>
  );
}
