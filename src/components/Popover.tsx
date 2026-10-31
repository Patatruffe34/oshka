import { useState, useLayoutEffect, useRef, useCallback, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { isComposingKey } from "../lib/text-entry";

const MARGIN = 8;

/**
 * Floating panel rendered into document.body.
 *
 * Anchored dropdowns inside a scrolling list get clipped by its overflow and
 * push a scrollbar instead of floating. A portal escapes that: the panel is
 * positioned in viewport coordinates and flips or shifts to stay on screen.
 */
interface PopoverProps {
  /** What the panel hangs from */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: "left" | "right";
  children: ReactNode;
}

export default function Popover({ anchorRef, onClose, align = "left", children }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const a = anchor.getBoundingClientRect();
    const { offsetWidth: pw, offsetHeight: ph } = panel;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Below the anchor by default, above it when there is not enough room
    let top = a.bottom + 6;
    if (top + ph > vh - MARGIN && a.top - ph - 6 > MARGIN) top = a.top - ph - 6;
    top = Math.max(MARGIN, Math.min(top, vh - ph - MARGIN));

    let left = align === "right" ? a.right - pw : a.left;
    left = Math.max(MARGIN, Math.min(left, vw - pw - MARGIN));

    setPos({ top, left });
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    place();
    // Any scroll can move the anchor, including scrollable ancestors
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [place]);

  useLayoutEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !isComposingKey(e)) onClose(); };
    // Deferred so the click that opened the popover does not close it
    const id = setTimeout(() => document.addEventListener("mousedown", onPointerDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={panelRef}
      className="popover"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // Avoid a flash at 0,0 before the first measurement
        visibility: pos ? "visible" : "hidden",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
