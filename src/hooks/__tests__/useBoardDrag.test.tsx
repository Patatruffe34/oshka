// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragStart, DropResult } from "@hello-pangea/dnd";
import { useBoardDrag } from "../useBoardDrag";

let host: HTMLDivElement, reactRoot: Root, drag: ReturnType<typeof useBoardDrag>;
const onDragEnd = vi.fn(), onCardToCard = vi.fn(), onColumnToZone = vi.fn();
const start: DragStart = { draggableId: "A", type: "card", source: { droppableId: "tasks", index: 0 }, mode: "FLUID" };
const combined: DropResult = { ...start, reason: "DROP", destination: null, combine: { draggableId: "B", droppableId: "tasks" } };
function Harness() {
  const state = useBoardDrag({ onDragEnd, onCardToCard, onColumnToZone });
  useLayoutEffect(() => { drag = state; });
  return null;
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
  await act(() => reactRoot.render(<Harness />));
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  vi.clearAllMocks();
});
const shift = (down: boolean) => act(() => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: "Shift", shiftKey: down })));

describe("Shift to nest a card", () => {
  it("enables combining before or during a card drag and disables it when Shift is released", async () => {
    expect(drag.nesting).toBe(false);
    await shift(true);
    await act(() => drag.contextProps.onDragStart(start));
    expect(drag.nesting).toBe(true);
    await shift(false);
    expect(drag.nesting).toBe(false);
    await shift(true);
    expect(drag.nesting).toBe(true);
    await act(() => drag.contextProps.onDragEnd(combined));
    expect(onCardToCard).toHaveBeenCalledExactlyOnceWith(combined);
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(drag.dragging).toBe(false);
  });

  it("never nests a cancelled drag, even with a highlighted target", async () => {
    await shift(true);
    await act(() => drag.contextProps.onDragStart(start));
    const cancelled: DropResult = { ...combined, reason: "CANCEL" };
    await act(() => drag.contextProps.onDragEnd(cancelled));
    expect(onCardToCard).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(cancelled);
  });

  it("keeps normal reordering unchanged without Shift", async () => {
    await act(() => drag.contextProps.onDragStart(start));
    const result: DropResult = { ...combined, combine: null, destination: { droppableId: "other", index: 1 } };
    await act(() => drag.contextProps.onDragEnd(result));
    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(result);
    expect(onCardToCard).not.toHaveBeenCalled();
  });

  it("uses the modifier on mouse release and ignores a stale combine after Shift is released", async () => {
    await shift(true);
    await act(() => drag.contextProps.onDragStart(start));
    await act(() => window.dispatchEvent(new MouseEvent("mouseup", { shiftKey: false })));
    await act(() => drag.contextProps.onDragEnd(combined));
    expect(onCardToCard).not.toHaveBeenCalled();
  });

  it.each(["mouse", "keyboard"])("remembers Shift at %s release through the drop animation", async (sensor) => {
    await shift(true);
    await act(() => drag.contextProps.onDragStart(start));
    await act(() => window.dispatchEvent(sensor === "mouse"
      ? new MouseEvent("mouseup", { shiftKey: true })
      : new KeyboardEvent("keydown", { key: " ", shiftKey: true })));
    await shift(false);
    await act(() => drag.contextProps.onDragEnd({ ...combined, mode: sensor === "mouse" ? "FLUID" : "SNAP" }));
    expect(onCardToCard).toHaveBeenCalledOnce();
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it("clears Shift on window blur and never enables combining for columns", async () => {
    await act(() => window.dispatchEvent(new MouseEvent("mousedown", { shiftKey: true })));
    expect(drag.nesting).toBe(true);
    await act(() => drag.contextProps.onDragStart({ ...start, type: "column" }));
    expect(drag.nesting).toBe(false);
    await act(() => window.dispatchEvent(new Event("blur")));
    await act(() => drag.contextProps.onDragEnd({ ...combined, type: "column", combine: null, reason: "CANCEL" }));
    expect(drag.nesting).toBe(false);
    expect(onCardToCard).not.toHaveBeenCalled();
  });
});
