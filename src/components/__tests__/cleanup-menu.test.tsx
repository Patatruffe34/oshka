// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import CleanupMenu from "../CleanupMenu";
import Header from "../Header";

let host: HTMLDivElement;
let root: Root;
let compact: boolean;
beforeEach(() => {
  compact = false;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "en");
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});
const click = async (element: Element | null) => act(() => (element as HTMLElement).click());
const key = async (element: Element | null, name: string) => act(() => element!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));
const hover = async (element: Element | null, enter = true) => act(() => element!.dispatchEvent(new MouseEvent(enter ? "mouseover" : "mouseout", { bubbles: true, relatedTarget: document.body })));

async function mount(props = {}) {
  const callbacks = { onArchiveDone: vi.fn(), onCleanArchives: vi.fn(), onAction: vi.fn() };
  await act(() => root.render(<I18nProvider><CleanupMenu completedCount={3} archivedCount={5} {...callbacks} {...props} /></I18nProvider>));
  return callbacks;
}

describe("desktop Clean submenu", () => {
  it("opens on hover without running an action, and closes on leaving", async () => {
    const actions = await mount();
    const wrap = host.querySelector(".cleanup-control");
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await hover(wrap);
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    expect(actions.onArchiveDone).not.toHaveBeenCalled();
    expect(actions.onCleanArchives).not.toHaveBeenCalled();
    await hover(wrap, false);
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it("archives once on click and returns focus to Clean", async () => {
    const actions = await mount();
    const trigger = host.querySelector('[aria-label="Clean"]');
    await click(trigger);
    await click(host.querySelector(".cleanup-action"));
    expect(actions.onArchiveDone).toHaveBeenCalledTimes(1);
    expect(actions.onCleanArchives).not.toHaveBeenCalled();
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("requests the existing confirmation when the delete action is chosen", async () => {
    const actions = await mount();
    await click(host.querySelector('[aria-label="Clean"]'));
    await click(host.querySelector(".cleanup-danger"));
    expect(actions.onCleanArchives).toHaveBeenCalledTimes(1);
    expect(actions.onArchiveDone).not.toHaveBeenCalled();
    expect(actions.onAction).toHaveBeenCalledTimes(1);
  });

  it("supports arrow navigation and Escape without executing an action", async () => {
    const actions = await mount();
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Clean"]')!;
    trigger.focus();
    await key(trigger, "ArrowDown");
    const buttons = host.querySelectorAll(".cleanup-action");
    expect(document.activeElement).toBe(buttons[0]);
    await key(buttons[0], "ArrowDown");
    expect(document.activeElement).toBe(buttons[1]);
    await key(buttons[1], "Escape");
    expect(document.activeElement).toBe(trigger);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(actions.onArchiveDone).not.toHaveBeenCalled();
    expect(actions.onCleanArchives).not.toHaveBeenCalled();
  });

  it("disables empty actions and skips them during keyboard navigation", async () => {
    const actions = await mount({ completedCount: 0 });
    await key(host.querySelector('[aria-label="Clean"]'), "ArrowDown");
    const buttons = host.querySelectorAll<HTMLButtonElement>(".cleanup-action");
    expect(buttons[0].disabled).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    await click(buttons[0]);
    expect(actions.onArchiveDone).not.toHaveBeenCalled();
  });
});

describe("mobile Clean section", () => {
  it("shows both actions directly beneath Clean, without a nested toggle", async () => {
    const actions = await mount({ compact: true });
    expect(host.querySelector(".cleanup-heading")?.textContent).toBe("Clean");
    expect(host.querySelector('[aria-haspopup="menu"]')).toBeNull();
    const buttons = host.querySelectorAll(".cleanup-action");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("Archive completed cards");
    expect(buttons[0].textContent).toContain("3");
    expect(buttons[1].textContent).toContain("Delete archived cards");
    expect(buttons[1].textContent).toContain("5");
    await click(buttons[0]);
    expect(actions.onArchiveDone).toHaveBeenCalledTimes(1);
    expect(actions.onAction).toHaveBeenCalledTimes(1);
  });

  it("closes the header menu after archiving", async () => {
    compact = true;
    const onArchiveDone = vi.fn();
    const unused = { saving: false, onToggleTheme: vi.fn(), onGoToBreadcrumb: vi.fn(), onLogout: vi.fn(), onOpenProfile: vi.fn(), onOpenFavorites: vi.fn(), onOpenTrash: vi.fn(), onCleanArchives: vi.fn(), onOpenSearch: vi.fn(), onOpenInbox: vi.fn(), onLabelFilterChange: vi.fn(), onOpenOutline: vi.fn(), onOpenWeek: vi.fn(), weekOpen: false, onUndo: vi.fn(), canUndo: false, onToggleFavorite: vi.fn(), isFavorited: false, trashCount: 0, userEmail: null };
    await act(() => root.render(<I18nProvider><Header {...unused} path={[]} pageTitle="Agenda" online theme="light" onArchiveDone={onArchiveDone} completedCount={2} archivedCount={1} /></I18nProvider>));
    await click(host.querySelector('button[title="Menu"]'));
    expect(document.querySelector(".cleanup-mobile")).not.toBeNull();
    await click(document.querySelector(".cleanup-action"));
    expect(onArchiveDone).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".header-menu")).toBeNull();
  });
});
