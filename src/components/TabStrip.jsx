import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Logo from "./Logo";
import { IconCompass } from "./icons";
import { useI18n } from "../lib/i18n";

/**
 * The boards you have open, one row under the header.
 *
 * Only shown from two: a strip announcing a single tab is a row of chrome
 * saying nothing. Desktop only — the phone already folds its breadcrumb into
 * a menu, and a second row there would cost more than it gives.
 *
 * A tab is a div rather than a button: the drag library refuses to start from
 * an interactive element, and the whole tab has to be the handle for dragging
 * one to feel like dragging a tab.
 */
export default function TabStrip({ tabs, activeId, labelOf, onSelect, onClose, onOpen, onMove }) {
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
              return (
                <Draggable
                  key={tab.id}
                  draggableId={tab.id}
                  index={i}
                  isDragDisabled={Boolean(tab.view)}
                >
                  {(dragProvided, dragSnap) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      role="tab"
                      tabIndex={0}
                      aria-selected={active}
                      className={`tab${active ? " on" : ""}${missing ? " gone" : ""}${
                        tab.view ? " pinned" : ""
                      }${dragSnap.isDragging ? " lifting" : ""}`}
                      onClick={() => onSelect(tab.id)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        onSelect(tab.id);
                      }}
                      /* Middle-click closes, as it does everywhere else */
                      onAuxClick={(e) => {
                        if (e.button !== 1) return;
                        e.preventDefault();
                        if (!tab.view) onClose(tab.id);
                      }}
                      title={`${title}${i < 9 ? `  ⌥${i + 1}` : ""}`}
                    >
                      {view ? (
                        <IconCompass size={13} />
                      ) : emoji ? (
                        <span className="tab-emoji">{emoji}</span>
                      ) : (
                        <Logo size={12} className="tab-mark" />
                      )}
                      <span className="tab-title">{title}</span>
                      {!tab.view && (
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
              title={t("tabs.new")}
              aria-label={t("tabs.new")}
            >
              +
            </button>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
