import { afterEach, describe, expect, it, vi } from "vitest";
import { useColumnSwipe } from "../useColumnSwipe";

let cleanup;
vi.mock("react", () => ({ useEffect: (effect) => { cleanup = effect(); } }));
afterEach(() => { cleanup?.(); cleanup = null; vi.unstubAllGlobals(); });

function SwipeFixture(selector) {
  const handlers = new Map();
  const classes = new Set();
  const wrap = {
    scrollLeft: 0, scrollWidth: 1400, clientWidth: 375,
    classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    getBoundingClientRect: () => ({ left: 0 }),
    querySelectorAll: vi.fn(() => [0, 350, 700, 1050].map((left) => ({
      getBoundingClientRect: () => ({ left: 12 + left - wrap.scrollLeft }),
    }))),
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: (name) => handlers.delete(name),
    scrollTo: vi.fn(({ left }) => { wrap.scrollLeft = left; }),
  };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  useColumnSwipe({ current: wrap }, true, selector);
  const touch = (name, x, y, timeStamp = 0) => {
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
