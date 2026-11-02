import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Logo from "./Logo";
import { IconCompass } from "./icons";
import { useI18n } from "../lib/i18n";
import { isPinnedTab, type Tab } from "../hooks/useTabs";

/**
 * The boards you have open, one row under the header.
 *
 * Agenda and home stay pinned before the open boards. Desktop only — the
 * phone already folds its breadcrumb into a menu, and a second row there
 * would cost more than it gives.
 *
 * A tab is a div rather than a button: the drag library refuses to start from
 * an interactive element, and the whole tab has to be the handle for dragging
 * one to feel like dragging a tab.
 */
/** How a tab reads, worked out from the tree each time it is drawn */
export interface TabLabel {
  emoji: string;
  title: string;
  /** The board it pointed at is gone */
  missing: boolean;
  /** A page rather than a board, such as the Agenda */
  view?: boolean;
}

interface TabStripProps {
  tabs: Tab[];
  activeId: string;
  labelOf: (tab: Tab) => TabLabel;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpen: () => void;
  onMove: (from: number, to: number) => void;
}

export default function TabStrip({ tabs, activeId, labelOf, onSelect, onClose, onOpen, onMove }: TabStripProps) {
  const { t } = useI18n();

  return (
    <DragDropContext
      onDragEnd={(r) => {
        if (!r.destination) return;
        onMove(r.source.index, r.destination.index);
      }}
    >
      <Droppable droppableId="tabs" direction="horizontal">
        {(dropProvided) => (
          <div
            className="tab-strip"
            role="tablist"
            ref={dropProvided.innerRef}
            {...dropProvided.droppableProps}
          >
            {tabs.map((tab, i) => {
              const { emoji, title, missing, view } = labelOf(tab);
              const active = tab.id === activeId;
              const pinned = isPinnedTab(tab);
              return (
                <Draggable
                  key={tab.id}
                  draggableId={tab.id}
                  index={i}
                  isDragDisabled={pinned}
                >
                  {(dragProvided, dragSnap) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      role="tab"
                      tabIndex={0}
                      aria-selected={active}
                      aria-label={title}
                      className={`tab${active ? " on" : ""}${missing ? " gone" : ""}${
                        pinned ? " pinned" : ""
                      }${tab.home ? " tab-home" : ""}${dragSnap.isDragging ? " lifting" : ""}`}
                      onClick={() => onSelect(tab.id)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && !(pinned && e.key === " ")) return;
                        e.preventDefault();
                        onSelect(tab.id);
                      }}
                      /* Middle-click closes, as it does everywhere else */
                      onAuxClick={(e) => {
                        if (e.button !== 1) return;
                        e.preventDefault();
                        if (!pinned) onClose(tab.id);
                      }}
                      title={`${title}${i < 9 ? `  ⌥${i + 1}` : ""}`}
                    >
                      {view ? (
                        <IconCompass size={13} />
                      ) : emoji ? (
                        <span className="tab-emoji">{emoji}</span>
                      ) : (
                        <Logo size={tab.home ? 16 : 12} className="tab-mark" />
                      )}
                      {!tab.home && <span className="tab-title">{title}</span>}
                      {!pinned && (
                        <button
                          className="tab-close"
                          onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                          aria-label={t("tabs.close")}
                          title={t("tabs.close")}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  )}
                </Draggable>
              );
            })}
            {dropProvided.placeholder}

            <button
              className="tab-add"
              onClick={onOpen}
              title={t("tabs.open_board")}
              aria-label={t("tabs.open_board")}
            >
              +
            </button>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
