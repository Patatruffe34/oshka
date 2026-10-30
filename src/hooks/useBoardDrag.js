import { useState, useRef, useCallback, useEffect } from "react";
import { settleInboxTransition } from "../lib/inbox-motion";
import { buzz } from "../lib/haptics";
import { useEdgeScroll, NO_LIBRARY_AUTOSCROLL } from "./useEdgeScroll";

/** Shared by the Inbox and board so a capture can be dropped into a column. */
export function useBoardDrag({ onDragEnd, onColumnToZone }) {
  const [draggingColumn, setDraggingColumn] = useState(false);
  // Anything in hand — the board's scroll snapping stands down meanwhile
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef(null);

  useEdgeScroll(wrapRef, dragging);
  const [zoneHot, setZoneHot] = useState(false);
  const zoneRef = useRef(null);
  const hotRef = useRef(false);
  const draggedId = useRef(null);
  // Guards against handling the same drop twice, once from our own release
  // listener and once from the library's onDragEnd.
  const resolved = useRef(false);

  const resolveZoneDrop = useCallback(() => {
    if (!hotRef.current || resolved.current) return false;
    resolved.current = true;
    const id = draggedId.current;
    // Let the library finish its own teardown before opening a modal over it
    requestAnimationFrame(() => onColumnToZone?.(id));
    return true;
  }, [onColumnToZone]);

  useEffect(() => {
    if (!draggingColumn) return;

    const track = (e) => {
      const point = e.touches?.[0] ?? e;
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

  const handleDragStart = useCallback((start) => {
    setDragging(true);
    buzz("lift");
    resolved.current = false;
    hotRef.current = false;
    if (start.type !== "column") return;
    draggedId.current = start.draggableId;
    setDraggingColumn(true);
  }, []);

  const handleDragEnd = useCallback(
    (result) => {
      const handledHere = result.reason !== "CANCEL" && resolveZoneDrop();
      setDragging(false);
      setDraggingColumn(false);
      setZoneHot(false);
      hotRef.current = false;
      draggedId.current = null;
      if (result.destination || handledHere) buzz("drop");
      if (handledHere || resolved.current) return;
      onDragEnd(result);
    },
    [onDragEnd, resolveZoneDrop]
  );

  return {
    wrapRef, zoneRef, dragging, draggingColumn, zoneHot,
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
