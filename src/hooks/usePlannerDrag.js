import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { planWeek, dateForLane, reorderEntries } from "../lib/planner";
import { INBOX_DROP_ID, inboxPlanDrop } from "../lib/inbox";
import { settleInboxTransition } from "../lib/inbox-motion";
import { buzz } from "../lib/haptics";
import { useEdgeScroll, NO_LIBRARY_AUTOSCROLL } from "./useEdgeScroll";
import { preparePlannerDrag } from "../lib/planner-drag";

const RANKED_LANE = "today";

/** One drag context for the visible plan and the Inbox beside it. */
export function usePlannerDrag({ root, settings, today, onSetDue, onReorder, onInboxDrop, onMoveToInbox, onReorderInbox }) {
  /* `today` is not read, it is what invalidates: the lanes are cut against
     the current date, and a new day has to cut them again. */
  const lanes = useMemo(
    () => planWeek(root, { weekMode: settings?.weekMode }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is the point
    [root, settings?.weekMode, today]
  );

  // The lanes run off the side of a phone too, and a card is carried across them
  const lanesRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEdgeScroll(lanesRef, dragging);
  const restoreDragScroll = useRef(null);
  useEffect(() => () => restoreDragScroll.current?.(), []);
  /* Crossing into another lane means a date. Staying inside the one hand-made
     lane means an order. Anywhere else a card would land back where the date
     puts it, so the move is refused rather than played and undone. */
  const onDragEnd = useCallback(
    (result) => {
      restoreDragScroll.current?.();
      restoreDragScroll.current = null;
      setDragging(false);
      const { source, destination, draggableId } = result;
      if (!destination || result.reason === "CANCEL") return;
      buzz("drop");

      if (source.droppableId === INBOX_DROP_ID) {
        if (destination.droppableId === INBOX_DROP_ID) {
          onReorderInbox?.(source.index, destination.index);
          return;
        }
        const drop = inboxPlanDrop(root, result, { weekMode: settings?.weekMode });
        if (drop) onInboxDrop?.(drop);
        return;
      }

      const item = lanes[source.droppableId]?.find((i) => i.card.id === draggableId);
      if (!item) return;
      if (destination.droppableId === INBOX_DROP_ID) {
        onMoveToInbox?.(item.path, item.colId, item.card.id, destination.index);
        return;
      }

      if (destination.droppableId === source.droppableId) {
        if (source.droppableId !== RANKED_LANE || destination.index === source.index) return;
        onReorder(reorderEntries(lanes[RANKED_LANE], source.index, destination.index));
        return;
      }

      const date = dateForLane(destination.droppableId, item.card.dueAt, {
        weekMode: settings?.weekMode,
      });
      if (date === undefined) return; // the standstill lane is not a state
      onSetDue(item.path, item.colId, item.card.id, date);
    },
    [lanes, onSetDue, onReorder, settings?.weekMode, root, onInboxDrop, onMoveToInbox, onReorderInbox]
  );

  return {
    lanes, lanesRef, dragging,
    contextProps: {
      onBeforeCapture: () => {
        settleInboxTransition();
        restoreDragScroll.current = preparePlannerDrag(lanesRef.current);
      },
      onDragStart: () => { setDragging(true); buzz("lift"); },
      onDragEnd,
      autoScrollerOptions: NO_LIBRARY_AUTOSCROLL,
    },
  };
}
