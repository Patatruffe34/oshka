import { useState, useRef, useCallback, useEffect } from "react";
import type { DragStart, DropResult } from "@hello-pangea/dnd";
import { settleInboxTransition } from "../lib/inbox-motion";
import { buzz } from "../lib/haptics";
import { useEdgeScroll, NO_LIBRARY_AUTOSCROLL } from "./useEdgeScroll";

/** Shared by the Inbox and board so a capture can be dropped into a column. */
export function useBoardDrag({ onDragEnd, onColumnToZone, onCardToCard }: {
  onDragEnd: (result: DropResult) => void;
  /** A column dropped on the zone that sends it to another board */
  onColumnToZone?: (columnId: string) => void;
  onCardToCard?: (result: DropResult) => void;
}) {
  const [draggingColumn, setDraggingColumn] = useState(false);
  // Anything in hand — the board's scroll snapping stands down meanwhile
  const [dragging, setDragging] = useState(false);
  const [shift, setShift] = useState(false);
  const shiftRef = useRef(false);
  const activeRef = useRef(false);
  // onDragEnd arrives after the drop animation; Shift may be up by then.
  const dropShiftRef = useRef<boolean | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEdgeScroll(wrapRef, dragging);
  const [zoneHot, setZoneHot] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef(false);
  const draggedId = useRef<string | null>(null);
  // Guards against handling the same drop twice, once from our own release
  // listener and once from the library's onDragEnd.
  const resolved = useRef(false);

  useEffect(() => {
    const update = (event: KeyboardEvent | MouseEvent) => {
      shiftRef.current = event.shiftKey;
      setShift(event.shiftKey);
      if (activeRef.current && (event.type === "mouseup" || (event.type === "keydown" && "key" in event && event.key === " "))) {
        dropShiftRef.current = event.shiftKey;
      }
    };
    const reset = () => { shiftRef.current = false; setShift(false); };
    window.addEventListener("keydown", update, true);
    window.addEventListener("keyup", update, true);
    // Also catches Shift held before the window gained focus.
    window.addEventListener("mousedown", update, true);
    window.addEventListener("mouseup", update, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", update, true);
      window.removeEventListener("keyup", update, true);
      window.removeEventListener("mousedown", update, true);
      window.removeEventListener("mouseup", update, true);
      window.removeEventListener("blur", reset);
    };
  }, []);

  const resolveZoneDrop = useCallback(() => {
    if (!hotRef.current || resolved.current) return false;
    const id = draggedId.current;
    if (!id) return false;
    resolved.current = true;
    // Let the library finish its own teardown before opening a modal over it
    requestAnimationFrame(() => onColumnToZone?.(id));
    return true;
  }, [onColumnToZone]);

  useEffect(() => {
    if (!draggingColumn) return;

    const track = (e: MouseEvent | TouchEvent) => {
      const point = ("touches" in e ? e.touches[0] : undefined) ?? (e as MouseEvent);
      const r = zoneRef.current?.getBoundingClientRect();
      if (!r) return;
      const inside =
        point.clientX >= r.left && point.clientX <= r.right &&
        point.clientY >= r.top && point.clientY <= r.bottom;
      if (inside !== hotRef.current) {
        hotRef.current = inside;
        setZoneHot(inside);
      }
    };

    // The release is handled here as well as in onDragEnd: whichever fires
    // first resolves the drop, and `resolved` keeps it to one.
    const release = () => resolveZoneDrop();

    window.addEventListener("mousemove", track, true);
    window.addEventListener("touchmove", track, true);
    window.addEventListener("mouseup", release, true);
    window.addEventListener("touchend", release, true);
    return () => {
      window.removeEventListener("mousemove", track, true);
      window.removeEventListener("touchmove", track, true);
      window.removeEventListener("mouseup", release, true);
      window.removeEventListener("touchend", release, true);
    };
  }, [draggingColumn, resolveZoneDrop]);

  const handleDragStart = useCallback((start: DragStart) => {
    activeRef.current = true;
    dropShiftRef.current = null;
    setDragging(true);
    buzz("lift");
    resolved.current = false;
    hotRef.current = false;
    if (start.type !== "column") return;
    draggedId.current = start.draggableId;
    setDraggingColumn(true);
  }, []);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const nestOnDrop = dropShiftRef.current ?? shiftRef.current;
      activeRef.current = false;
      dropShiftRef.current = null;
      const handledHere = result.reason !== "CANCEL" && resolveZoneDrop();
      setDragging(false);
      setDraggingColumn(false);
      setZoneHot(false);
      hotRef.current = false;
      draggedId.current = null;
      if (result.destination || handledHere) buzz("drop");
      if (handledHere || resolved.current) return;
      if (result.reason !== "CANCEL" && result.type === "card" && result.combine && nestOnDrop && onCardToCard) {
        buzz("drop");
        onCardToCard(result);
        return;
      }
      onDragEnd(result);
    },
    [onDragEnd, resolveZoneDrop, onCardToCard]
  );

  return {
    wrapRef, zoneRef, dragging, draggingColumn, zoneHot,
    nesting: Boolean(onCardToCard) && shift && !draggingColumn,
    contextProps: {
      onBeforeCapture: () => {
        settleInboxTransition();
        wrapRef.current?.classList.add("dragging");
      },
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      autoScrollerOptions: NO_LIBRARY_AUTOSCROLL,
    },
  };
}
