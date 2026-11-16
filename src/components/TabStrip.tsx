import { DragDropContext, Droppable, Draggable, type DraggableProvided } from "@hello-pangea/dnd";
import Logo from "./Logo";
import { IconCompass, IconTag } from "./icons";
import { useI18n } from "../lib/i18n";
import { isPinnedTab, type Tab } from "../hooks/useTabs";

/** How a tab reads, worked out from the tree each time it is drawn */
export interface TabLabel {
  emoji: string;
  title: string;
  /** The board it pointed at is gone */
  missing: boolean;
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
  const indexedTabs = tabs.map((tab, index) => ({ tab, index }));
  const boardTabs = indexedTabs.filter(({ tab }) => !tab.view);
  const viewTabs = indexedTabs.filter(({ tab }) => tab.view);

  const renderTab = (tab: Tab, index: number, drag?: DraggableProvided, dragging = false) => {
    const { emoji, title, missing } = labelOf(tab);
    const active = tab.id === activeId;
    const pinned = isPinnedTab(tab);
    return (
      <div
        key={tab.id}
        ref={drag?.innerRef}
        {...drag?.draggableProps}
        {...drag?.dragHandleProps}
        role="tab"
        tabIndex={0}
        aria-selected={active}
        aria-label={title}
        className={`tab${active ? " on" : ""}${missing ? " gone" : ""}${pinned ? " pinned" : ""}${tab.home ? " tab-home" : ""}${dragging ? " lifting" : ""}`}
        onClick={() => onSelect(tab.id)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && !(pinned && e.key === " ")) return;
          e.preventDefault();
          onSelect(tab.id);
        }}
        onAuxClick={(e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          if (!pinned) onClose(tab.id);
        }}
        title={`${title}${index < 9 ? `  ⌥${index + 1}` : ""}`}
      >
        {tab.view === "labels" ? (
          <IconTag size={13} />
        ) : tab.view === "week" ? (
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
    );
  };

  return (
    <div className="tab-strip" role="tablist">
      <DragDropContext
        onDragEnd={({ source, destination }) => {
          if (!destination) return;
          const from = boardTabs[source.index];
          const to = boardTabs[destination.index];
          if (from && to) onMove(from.index, to.index);
        }}
      >
        <Droppable droppableId="tabs" direction="horizontal">
          {(drop) => (
            <div className="tab-strip-boards" ref={drop.innerRef} {...drop.droppableProps}>
              {boardTabs.map(({ tab, index }, position) => (
                <Draggable key={tab.id} draggableId={tab.id} index={position} isDragDisabled={tab.home}>
                  {(drag, snapshot) => renderTab(tab, index, drag, snapshot.isDragging)}
                </Draggable>
              ))}
              {drop.placeholder}
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
      <div className="tab-strip-views">
        {viewTabs.map(({ tab, index }) => renderTab(tab, index))}
      </div>
    </div>
  );
}
