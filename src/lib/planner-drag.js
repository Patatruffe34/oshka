/**
 * The DnD engine follows only one scroll container. While dragging, lend it
 * the outer scroller and preserve each mobile lane's reading position with
 * a content margin. This must run before the engine measures its targets.
 */
export function preparePlannerDrag(wrap) {
  if (!wrap) return () => {};
  const lanes = [...wrap.querySelectorAll(".planner-lane")].map((lane) => {
    const body = lane.querySelector(".planner-lane-body");
    const content = lane.querySelector(".planner-lane-content");
    return {
      lane, body, content,
      top: body.scrollTop,
      independent: getComputedStyle(body).overflowY === "auto",
      margin: content.style.marginTop,
      minHeight: lane.style.minHeight,
    };
  });
  const independent = lanes.some((item) => item.independent);
  // Leave room above as well as below the starting point: a negative margin
  // would hide earlier cards above scrollTop=0 and make them unreachable.
  const base = independent ? Math.max(0, ...lanes.map(({ top }) => top)) : 0;
  for (const { content, top } of lanes) content.style.marginTop = `${base - top}px`;
  wrap.classList.add("dragging");

  // Empty and short lanes must remain targets even near the bottom of a
  // long lane, including after the shared container scrolls vertically.
  const height = Math.max(wrap.clientHeight, ...lanes.map(({ lane }) => lane.scrollHeight));
  for (const { lane } of lanes) lane.style.minHeight = `${height}px`;
  if (independent) wrap.scrollTop = base;

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    const delta = independent ? wrap.scrollTop - base : 0;
    wrap.classList.remove("dragging");
    for (const { lane, body, content, top, margin, minHeight } of lanes) {
      lane.style.minHeight = minHeight;
      content.style.marginTop = margin;
      if (independent) body.scrollTop = Math.max(0, top + delta);
    }
    if (independent) wrap.scrollTop = 0;
  };
}
