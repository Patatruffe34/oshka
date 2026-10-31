// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { dayFromNow } from "../../lib/planner";
import PlannerView from "../PlannerView";
import type { PlannerCardActions } from "../PlannerCard";
import type { RootBoard } from "../../lib/types";

// Model the browser keeping :hover at the tapped position after a card leaves.
// An attribute has the same specificity, and lets the real stylesheet/media
// queries run without relying on Happy DOM to emulate a physical touchscreen.
const css = readFileSync("src/styles/app.css", "utf8")
  .replaceAll(":hover", "[data-test-hover]");
let host: HTMLDivElement, root: Root, style: HTMLStyleElement, touchPoints: MockInstance<() => number>;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!document.doctype) document.insertBefore(document.implementation.createDocumentType("html", "", ""), document.documentElement);
  touchPoints = vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(1);
  localStorage.setItem("inceptio_lang", "en");
  style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  style.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Plan completion feedback", () => {
  it.each([0, 1])("does not preview completion on the replacement card, %i days ahead", async (days) => {
    const onOpen = vi.fn();
    const onDone = vi.fn();
    function Plan() {
      // Only the fields the Agenda reads: the cast stands in for the rest
      const [board, setBoard] = useState(() => ({ columns: [{ id: "tasks", title: "Tasks", cards: [
        { id: "first", title: "First", dueAt: dayFromNow(days), board: { columns: [] } },
        { id: "second", title: "Second", dueAt: dayFromNow(days), board: { columns: [] } },
      ] }] }) as unknown as RootBoard);
      // No card menu opens here, so its actions are never called
      return <PlannerView root={board} labels={[]} onOpen={onOpen} onAdd={vi.fn()} onLocate={vi.fn()} cardActions={{} as PlannerCardActions} onToggleDone={(item) => {
        onDone(item.card.id);
        setBoard((prev) => ({ columns: prev.columns.map((col) => ({ ...col,
          cards: col.cards.map((card) => card.id === item.card.id ? { ...card, done: true } : card),
        })) }));
      }} />;
    }
    await act(() => root.render(<I18nProvider><Plan /></I18nProvider>));
    const checks = host.querySelectorAll<HTMLButtonElement>(".planner-done");
    const next = checks[1];
    checks[0].focus();
    await act(() => checks[0].click());
    expect(onDone).toHaveBeenCalledExactlyOnceWith("first");
    expect(onOpen).not.toHaveBeenCalled();
    expect(host.querySelectorAll(".planner-card")).toHaveLength(1);
    expect(host.querySelector(".planner-done")).toBe(next);
    expect(document.activeElement).not.toBe(next);
    next.setAttribute("data-test-hover", "");
    expect(getComputedStyle(next.querySelector(".card-check-mark")!).opacity).toBe("0");
    expect(next.classList.contains("checked")).toBe(false);
  });

  it("keeps the completion preview available to a mouse", () => {
    touchPoints.mockReturnValue(0);
    host.innerHTML = '<button class="card-check planner-done" data-test-hover><span class="card-check-mark"></span></button>';
    expect(getComputedStyle(host.querySelector(".card-check-mark")!).opacity).toBe("0.5");
  });

  it("still displays genuinely completed board cards on touchscreens", () => {
    host.innerHTML = '<button class="card-check checked" data-test-hover><span class="card-check-mark"></span></button>';
    expect(getComputedStyle(host.querySelector(".card-check-mark")!).opacity).toBe("1");
  });
});
