import { afterEach, describe, expect, it, vi } from "vitest";
import type { EffectCallback } from "react";
import { useColumnSwipe } from "../useColumnSwipe";

let cleanup: (() => void) | null | undefined;
vi.mock("react", () => ({ useEffect: (effect: EffectCallback) => { cleanup = effect() as (() => void) | undefined; } }));
afterEach(() => { cleanup?.(); cleanup = null; vi.unstubAllGlobals(); });

/** What the gesture handlers read off a touch event */
type TouchHandler = (event: object) => void;

function SwipeFixture(selector?: string) {
  const handlers = new Map<string, TouchHandler>();
  const classes = new Set<string>();
  const wrap = {
    scrollLeft: 0, scrollWidth: 1400, clientWidth: 375,
    classList: { contains: (c: string) => classes.has(c), add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    getBoundingClientRect: () => ({ left: 0 }),
    querySelectorAll: vi.fn(() => [0, 350, 700, 1050].map((left) => ({
      getBoundingClientRect: () => ({ left: 12 + left - wrap.scrollLeft }),
    }))),
    addEventListener: (name: string, fn: TouchHandler) => handlers.set(name, fn),
    removeEventListener: (name: string) => handlers.delete(name),
    scrollTo: vi.fn(({ left }: { left: number }) => { wrap.scrollLeft = left; }),
  };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  // Only the parts of an element the hook touches
  useColumnSwipe({ current: wrap as unknown as HTMLElement }, true, selector);
  const touch = (name: string, x: number, y: number, timeStamp = 0) => {
    handlers.get(name)?.({ target: wrap, touches: [{ clientX: x, clientY: y }], timeStamp, cancelable: true, preventDefault: vi.fn() });
  };
  return { wrap, classes, touch };
}

describe("shared column swipe gestures", () => {
  it.each([
    [undefined, ":scope > .board > .column, :scope > .board > .add-col-wrap"],
    [":scope > .planner-lane", ":scope > .planner-lane"],
  ])("settles one column for layout %s", (selector, expected) => {
    const { wrap, touch } = SwipeFixture(selector);
    touch("touchstart", 300, 200);
    touch("touchmove", 140, 205, 300);
    touch("touchend", 140, 205, 500);
    expect(wrap.querySelectorAll).toHaveBeenCalledWith(expected);
    expect(wrap.scrollTo).toHaveBeenCalledWith({ left: 350, behavior: "auto" });
  });

  it("leaves vertical reading in its own lane", () => {
    const { wrap, touch } = SwipeFixture(":scope > .planner-lane");
    touch("touchstart", 300, 200);
    touch("touchmove", 280, 50, 300);
    touch("touchend", 280, 50, 500);
    expect(wrap.scrollLeft).toBe(0);
    expect(wrap.scrollTo).not.toHaveBeenCalled();
  });

  it("yields an already started gesture when a card is lifted", () => {
    const { wrap, classes, touch } = SwipeFixture(":scope > .planner-lane");
    touch("touchstart", 300, 200);
    classes.add("dragging");
    touch("touchmove", 140, 205, 300);
    touch("touchend", 140, 205, 500);
    expect(wrap.scrollLeft).toBe(0);
    expect(wrap.scrollTo).not.toHaveBeenCalled();
  });

  it("does not start a swipe during a drag", () => {
    const { wrap, classes, touch } = SwipeFixture(":scope > .planner-lane");
    classes.add("dragging");
    touch("touchstart", 300, 200);
    touch("touchmove", 140, 205, 300);
    touch("touchend", 140, 205, 500);
    expect(wrap.scrollLeft).toBe(0);
    expect(wrap.scrollTo).not.toHaveBeenCalled();
  });
});
