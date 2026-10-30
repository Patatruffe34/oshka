import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePlannerDrag } from "../planner-drag";

afterEach(() => vi.unstubAllGlobals());

function fixture({ mobile = true, tops = [320, 80, 0] } = {}) {
  const wrap = {
    clientHeight: 700,
    scrollTop: mobile ? 0 : 120,
    scrollLeft: 350,
    classList: {
      add: vi.fn(() => {
        // Removing overflow:auto resets each independent scroll container.
        for (const lane of lanes) lane.body.scrollTop = 0;
      }),
      remove: vi.fn(),
    },
    querySelectorAll: () => lanes,
  };
  const lanes = tops.map((top, i) => {
    const content = { style: { marginTop: "" } };
    const body = { scrollTop: top };
    return {
      body, content,
      scrollHeight: i === 0 ? 1200 : 40,
      style: { minHeight: "" },
      querySelector: (selector) => selector === ".planner-lane-body" ? body : content,
    };
  });
  vi.stubGlobal("getComputedStyle", () => ({ overflowY: mobile ? "auto" : "visible" }));
  return { wrap, lanes };
}

describe("Agenda drag scrolling", () => {
  it("preserves independently scrolled lanes before measuring a common drop area", () => {
    const { wrap, lanes } = fixture();
    const restore = preparePlannerDrag(wrap);
    expect(lanes.map(({ content }) => parseFloat(content.style.marginTop) - wrap.scrollTop)).toEqual([-320, -80, 0]);
    expect(lanes.map(({ style }) => style.minHeight)).toEqual(["1200px", "1200px", "1200px"]);
    expect(wrap.classList.add).toHaveBeenCalledWith("dragging");

    wrap.scrollTop += 150;
    restore();
    expect(lanes.map(({ body }) => body.scrollTop)).toEqual([470, 230, 150]);
    expect(wrap.scrollTop).toBe(0);
    expect(wrap.scrollLeft).toBe(350);
    expect(lanes.every(({ content, style }) => content.style.marginTop === "" && style.minHeight === "")).toBe(true);
  });

  it("can scroll upwards to cards above the initial reading position", () => {
    const { wrap, lanes } = fixture();
    const restore = preparePlannerDrag(wrap);
    expect(wrap.scrollTop).toBeGreaterThanOrEqual(320);
    wrap.scrollTop -= 200;
    restore();
    expect(lanes.map(({ body }) => body.scrollTop)).toEqual([120, 0, 0]);
  });

  it("restores a cancelled drag once, without losing the reading position", () => {
    const { wrap, lanes } = fixture();
    const restore = preparePlannerDrag(wrap);
    restore();
    expect(lanes.map(({ body }) => body.scrollTop)).toEqual([320, 80, 0]);
    lanes[0].body.scrollTop = 400;
    restore();
    expect(lanes[0].body.scrollTop).toBe(400);
    expect(wrap.classList.remove).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared desktop scroll position after dropping", () => {
    const { wrap } = fixture({ mobile: false, tops: [0, 0, 0] });
    const restore = preparePlannerDrag(wrap);
    wrap.scrollTop = 240;
    restore();
    expect(wrap.scrollTop).toBe(240);
  });
});
