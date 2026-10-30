import { describe, expect, it } from "vitest";
import { CAPTURE_UNFOLDED, foldCapture } from "../inbox-motion";

const scroll = (state, top, now, { room = 500, pinned = false } = {}) => foldCapture(state, { top, room, now, pinned });
const at = (folded, anchor) => ({ folded, anchor, changedAt: 0 });

describe("capture folding", () => {
  it("folds when scrolling down past the top, and unfolds when scrolling back up", () => {
    const down = scroll(CAPTURE_UNFOLDED, 80, 0);
    expect(down.folded).toBe(true);
    expect(scroll(down, 160, 1000).folded).toBe(true);
    expect(scroll(scroll(down, 160, 1000), 140, 1100).folded).toBe(false);
  });
  it("ignores jitter and the reflow caused by its own transition", () => {
    const down = scroll(CAPTURE_UNFOLDED, 80, 0);
    expect(scroll(down, 40, 100).folded).toBe(true); // clamped while the list grew
    expect(scroll(scroll(down, 40, 100), 34, 1000).folded).toBe(true);
    expect(scroll(at(false, 100), 108, 1000).folded).toBe(false);
    expect(scroll(at(true, 160), 152, 1000).folded).toBe(true);
  });
  it("always shows the form near the top of the list", () => {
    expect(scroll(scroll(CAPTURE_UNFOLDED, 80, 0), 10, 50).folded).toBe(false);
    expect(scroll(CAPTURE_UNFOLDED, 20, 0).folded).toBe(false);
  });
  it("stays open while pinned, or when folding would leave nothing to scroll", () => {
    expect(scroll(CAPTURE_UNFOLDED, 80, 0, { pinned: true }).folded).toBe(false);
    expect(scroll(CAPTURE_UNFOLDED, 80, 0, { room: 20 }).folded).toBe(false);
  });
});
