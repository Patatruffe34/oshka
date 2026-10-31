// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { dayFromNow, getBoardAtPath, makeCard } from "../../lib/board-utils";
import PlannerView from "../PlannerView";
import type { PlannerCardActions } from "../PlannerCard";
import type { PlannedItem } from "../../lib/planner";
import type { Card, RootBoard } from "../../lib/types";

let host: HTMLDivElement, reactRoot: Root, actions: Record<keyof PlannerCardActions, Mock>, onOpen: Mock, onLocate: Mock;
const sourcePath = [{ colId: "projects", cardId: "project", cardTitle: "Project" }];
const click = async (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const key = async (el: Element | null, key: string, options: KeyboardEventInit = {}) => act(() => el!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })));
const hover = async (el: Element) => act(() => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })));
const card = () => host.querySelector<HTMLElement>('[data-card-id="task"]')!;
const menuRow = (text: string) => [...document.querySelectorAll(".card-menu-row")].find((el) => el.textContent?.includes(text));
/** Set a field the way typing does, so React sees the change */
const setValue = (field: HTMLElement, value: string) =>
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);

function Harness() {
  // Only the fields the Agenda reads: the cast stands in for the rest
  const [root, setRoot] = useState(() => ({ columns: [{ id: "projects", cards: [{ ...makeCard("Project"), id: "project", board: { columns: [
    { id: "tasks", title: "Source tasks", cards: [{ ...makeCard("Plan task"), id: "task", dueAt: dayFromNow(0) }] },
    { id: "next", title: "Source next", cards: [] },
  ] } }] }] }) as unknown as RootBoard);
  const edit = (item: PlannedItem, patch: Partial<Card>) => setRoot((prev) => {
    const next = structuredClone(prev);
    const target = getBoardAtPath(next, item.path).columns.find((c) => c.id === item.colId)!.cards.find((c) => c.id === item.card.id)!;
    Object.assign(target, patch);
    return next;
  });
  return <I18nProvider><PlannerView root={root} labels={[{ id: "urgent", name: "Urgent", color: "red" }]}
    onOpen={onOpen} onLocate={onLocate} onToggleDone={vi.fn()} onAdd={vi.fn()} onSetDue={vi.fn()} onReorder={vi.fn()}
    cardActions={{ ...actions,
      onRename: (item, title) => { actions.onRename(item, title); edit(item, { title }); },
      onToggleLabel: (item, id) => { actions.onToggleLabel(item, id); edit(item, { labels: item.card.labels.includes(id) ? [] : [id] }); },
      onSetDue: (item, dueAt) => { actions.onSetDue(item, dueAt); edit(item, { dueAt }); },
    }}
  /></I18nProvider>;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "en");
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  actions = Object.fromEntries(["onRename", "onToggleLabel", "onSetDue", "onSetRepeat", "onDelete", "onArchive", "onMoveTo", "onMoveElsewhere", "onEnterInTab", "onAddLabel", "onUpdateLabel", "onDeleteLabel"].map((name) => [name, vi.fn()])) as typeof actions;
  onOpen = vi.fn(); onLocate = vi.fn();
  host = document.createElement("div"); document.body.append(host); reactRoot = createRoot(host);
  await act(() => reactRoot.render(<Harness />));
});
afterEach(async () => {
  await act(() => reactRoot.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks();
});

describe("Plan card quick actions", () => {
  it("opens the shared menu and toggles labels without opening the card", async () => {
    await click(card().querySelector(".planner-more"));
    await click(menuRow("Labels"));
    await click(document.querySelector(".label-swatch"));
    expect(actions.onToggleLabel).toHaveBeenCalledWith(expect.objectContaining({ colId: "tasks", path: sourcePath }), "urgent");
    expect(document.querySelector(".label-swatch")?.getAttribute("aria-pressed")).toBe("true");
    expect(card().querySelector(".planner-chip")?.textContent).toBe("Urgent");
    await click(document.querySelector(".label-swatch"));
    expect(card().querySelector(".planner-chip")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each([["e", ".label-picker"], ["d", ".due-menu"], ["m", ".column-pick"]])("opens the right pane with %s and closes it with Escape", async (letter, pane) => {
    await hover(card()); await key(document.body, letter);
    expect(document.querySelector(pane)).not.toBeNull();
    await key(document.body, "Escape");
    expect(document.querySelector(".popover")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("changes the due date and moves the same card to Tomorrow", async () => {
    await hover(card()); await key(document.body, "d");
    await click(document.querySelectorAll(".due-presets button")[1]);
    expect(actions.onSetDue).toHaveBeenCalledWith(expect.objectContaining({ path: sourcePath }), dayFromNow(1));
    expect(card().closest(".planner-lane")?.classList.contains("lane-tomorrow")).toBe(true);
    expect(document.querySelector(".popover")).toBeNull();
  });

  it("uses columns of the source board for M and keeps the full address", async () => {
    await hover(card()); await key(document.body, "m");
    const choices = document.querySelectorAll<HTMLButtonElement>(".column-pick");
    expect(choices[0].textContent).toContain("Source tasks");
    expect(choices[0].disabled).toBe(true);
    expect(choices[1].textContent).toContain("Source next");
    await click(choices[1]);
    expect(actions.onMoveTo).toHaveBeenCalledWith(expect.objectContaining({ colId: "tasks", path: sourcePath }), "next");
  });

  it("renames inline with R and leaves typing and Enter inside the editor", async () => {
    await hover(card()); await key(document.body, "r");
    const input = card().querySelector("textarea")!;
    expect(document.activeElement).toBe(input);
    await key(input, "a");
    await act(() => {
      setValue(input, "Renamed task");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(actions.onRename).toHaveBeenCalledWith(expect.objectContaining({ path: sourcePath }), "Renamed task");
    await key(input, "Enter");
    expect(card().querySelector("textarea")).toBeNull();
    expect(card().querySelector(".planner-card-title")?.textContent).toBe("Renamed task");
    expect(actions.onArchive).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("archives the hovered card with A", async () => {
    await hover(card()); await key(document.body, "a");
    expect(actions.onArchive).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ colId: "tasks", path: sourcePath }));
  });

  it("ignores keys without hover, modifiers, composition, inputs and covering panels", async () => {
    await key(document.body, "e"); expect(document.querySelector(".popover")).toBeNull();
    await hover(card());
    for (const options of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }]) await key(document.body, "e", options);
    const input = document.createElement("input"); host.append(input); await key(input, "a"); input.remove();
    const overlay = document.createElement("div"); overlay.className = "modal-overlay"; host.append(overlay);
    await key(document.body, "a"); overlay.remove();
    expect(document.querySelector(".popover")).toBeNull(); expect(actions.onArchive).not.toHaveBeenCalled();
    await key(document.body, "e");
    await key(document.body, "a"); expect(actions.onArchive).not.toHaveBeenCalled();
  });

  it("confirms deletion and does not let Enter on the menu button open the card", async () => {
    const more = card().querySelector(".planner-more");
    await key(more, "Enter"); expect(onOpen).not.toHaveBeenCalled();
    await click(more); await click(menuRow("Delete"));
    expect(actions.onDelete).not.toHaveBeenCalled();
    await click(document.querySelector(".card-menu-row.armed"));
    expect(actions.onDelete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: sourcePath, colId: "tasks" }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
