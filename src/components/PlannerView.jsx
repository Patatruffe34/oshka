import { useCallback, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  groupByBoard,
  shortTrail,
  LANES,
} from "../lib/planner";
import { useI18n } from "../lib/i18n";
import PlannerCard from "./PlannerCard";
import PlannerAdd from "./PlannerAdd";
import DayCleared from "./DayCleared";
import { usePlannerDrag } from "../hooks/usePlannerDrag";
import { useColumnSwipe } from "../hooks/useColumnSwipe";
import { useMediaQuery } from "../hooks/useMediaQuery";

/* The first four already had names elsewhere; only the last one is new */
const LANE_KEY = {
  today: "due.today",
  tomorrow: "due.tomorrow",
  week: "due.soon",
  nextWeek: "week.next",
  later: "week.later",
  stalled: "week.stalled",
};

/**
 * The whole tree, read as a week.
 *
 * Every other view answers "where is this?". This one answers "what am I doing
 * now?" — the same cards, sorted by when they are due rather than by where
 * they live. The board each card came from is written above it, because at
 * this depth a title alone does not say what it belongs to.
 *
 * A page, not a layer over the board: it sits where a board would, so a tab
 * can hold it and you can keep a board open beside it.
 */
const LABELS_KEY = "oshka_week_labels";

/**
 * The one lane you put in order by hand.
 *
 * Elsewhere the date is the order and says something a hand order would only
 * hide. Here every card is due the same day or already late, so the only
 * question left is which one you do first.
 */
const RANKED_LANE = "today";

export default function PlannerView(props) {
  if (props.drag) return <PlannerContent {...props} />;
  return <StandalonePlanner {...props} />;
}

function StandalonePlanner(props) {
  const drag = usePlannerDrag(props);
  return <DragDropContext {...drag.contextProps}><PlannerContent {...props} drag={drag} /></DragDropContext>;
}

function PlannerContent({ root, labels, onOpen, onLocate, onAdd, onToggleDone, cardActions, drag }) {
  const { t } = useI18n();
  /* A per-screen reading preference, not something the account should carry */
  const [fullLabels, setFullLabels] = useState(
    () => localStorage.getItem(LABELS_KEY) !== "dots"
  );
  const toggleLabels = () =>
    setFullLabels((v) => {
      localStorage.setItem(LABELS_KEY, v ? "dots" : "names");
      return !v;
    });

  /**
   * Where a card lives, in one line.
   *
   * The root is left out of it: printed on every card it says nothing, and the
   * width it costs is width the title no longer has. A card sitting on the
   * root itself has nothing else to show, so there it is the answer.
   */
  const trail = useCallback(
    (item) => {
      const steps = item.path.map((p) => p.cardTitle || t("board.untitled"));
      if (steps.length === 0) return { parent: t("header.root"), full: t("header.root") };
      return {
        ancestors: shortTrail(steps).slice(0, -1).join(" \u203a "),
        parent: steps.at(-1),
        full: steps.join(" \u203a "),
      };
    },
    [t]
  );

  const { lanes, lanesRef, dragging } = drag;
  const total = LANES.reduce((n, lane) => n + lanes[lane].length, 0);
  const phone = useMediaQuery("(max-width: 640px)");
  useColumnSwipe(lanesRef, phone && (total > 0 || root?.inbox?.length > 0), ":scope > .planner-lane");

  /* Today going from something to nothing, while you watch, is the moment
     worth marking. Worked out during render, from the last count seen. */
  const todayCount = lanes[RANKED_LANE].length;
  const [lastToday, setLastToday] = useState(todayCount);
  const [cleared, setCleared] = useState(false);
  if (todayCount !== lastToday) {
    setLastToday(todayCount);
    setCleared(todayCount === 0 && lastToday > 0);
  }

  return (
    <div className="planner">
      <div className="planner-bar">
        <button className="btn-ghost-sm" onClick={toggleLabels}>
          {t(fullLabels ? "week.labels_dots" : "week.labels_names")}
        </button>
      </div>

      {total === 0 && !root?.inbox?.length ? (
        /* The last card of the day may have been the last card of the tree */
        cleared ? <DayCleared celebrate /> : <div className="side-panel-empty">{t("week.empty")}</div>
      ) : (
        <div className={`planner-lanes${dragging ? " dragging" : ""}`} ref={lanesRef}>
          {LANES.map((lane) => {
            /* Grouping is what a hand order has to give up: cards gathered
               under their board cannot also be ranked against each other, and
               here the ranking is the point. The board is still written, on
               each card instead of above a batch of them. */
            const flat = lane === RANKED_LANE;
            const groups = flat
              ? [{ key: lane, items: lanes[lane] }]
              : groupByBoard(lanes[lane], t("header.root"));
            /* Grouping reorders a lane sorted by date — A, B, A becomes A, A,
               B — and the library numbers draggables by what is on screen, not
               by the array they came from. */
            const shown = groups.flatMap((g) => g.items);
            return (
              <section key={lane} className={`planner-lane lane-${lane}`}>
                <h3 className="planner-lane-head">
                  {t(LANE_KEY[lane])}
                  <span className="planner-count">{lanes[lane].length}</span>
                </h3>

                {lane === "stalled" && lanes[lane].length > 0 && (
                  <p className="planner-nudge">{t("week.stalled_hint")}</p>
                )}

                <Droppable
                  droppableId={lane}
                  type="card"
                  isDropDisabled={lane === "stalled"}
                >
                  {(dropProvided, dropSnap) => (
                <div
                  className={`planner-lane-body${dropSnap.isDraggingOver ? " over" : ""}`}
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                >
                  <div className="planner-lane-content">
                  {groups.map((group) => (
                    <div key={group.key} className="planner-group">
                      {/* Which board this came from, over the cards it holds */}
                      {!flat && (
                      <span className="planner-origin" title={`${group.trail.join(" › ")} › ${group.colEmoji ? `${group.colEmoji} ` : ""}${group.colTitle || t("board.untitled")}`}>
                        <span className="planner-trail">
                          {shortTrail(group.path.length ? group.trail.slice(1) : group.trail).map((step, i, steps) => (
                            <span key={i}>
                              {i > 0 && <span className="planner-sep">&rsaquo;</span>}
                              <span className={i === steps.length - 1 ? "planner-parent" : undefined}>{step}</span>
                            </span>
                          ))}
                        </span>
                        <span className="planner-origin-sep" aria-hidden="true">›</span>
                        <span className="planner-origin-col">
                          {group.colEmoji && <span aria-hidden="true">{group.colEmoji}</span>}
                          <span>{group.colTitle || t("board.untitled")}</span>
                        </span>
                      </span>
                      )}

                      {group.items.map((item) => {
                        const where = flat ? trail(item) : null;
                        // Across the whole lane, groups included: the library
                        // counts within a droppable, not within a group.
                        const index = shown.indexOf(item);
                        return (
                          <Draggable key={item.card.id} draggableId={item.card.id} index={index}>
                            {(dragProvided, dragSnap) => (
                          <PlannerCard
                            item={item}
                            root={root}
                            labels={labels}
                            fullLabels={fullLabels}
                            where={where}
                            cardRef={dragProvided.innerRef}
                            draggableProps={dragProvided.draggableProps}
                            dragHandleProps={dragProvided.dragHandleProps}
                            isDragging={dragSnap.isDragging}
                            onOpen={onOpen}
                            onLocate={onLocate}
                            onToggleDone={onToggleDone}
                            cardActions={cardActions}
                          />
                            )}
                          </Draggable>
                        );
                      })}
                    </div>
                  ))}
                  {lane === RANKED_LANE && lanes[lane].length === 0 && !dropSnap.isDraggingOver && (
                    <DayCleared celebrate={cleared} />
                  )}
                  {dropProvided.placeholder}

                  {/* Not on the standstill lane: being stuck is observed, so
                      there is no date a new card could take to land there. */}
                  {lane !== "stalled" && (
                    <PlannerAdd
                      root={root}
                      onAdd={(title, path, colId) => onAdd(lane, title, path, colId)}
                    />
                  )}
                  </div>
                </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
