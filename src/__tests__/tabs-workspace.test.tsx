// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { makeCard, makeCol } from "../lib/board-utils";

const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { uid: "tabs-user", email: "test@example.com" }, loading: false }) }));
import App from "../App";

let host: HTMLDivElement, reactRoot: Root, compact: boolean;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  compact = false;
  if (!document.doctype) document.insertBefore(document.implementation.createDocumentType("html", "", ""), document.documentElement);
  localStorage.setItem("inceptio_lang", "en");
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "root", segments: [] }], activeId: "root" }));
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  const child = { ...makeCard("Child board"), id: "child" };
  const project = { ...makeCard("Project"), id: "project", board: { columns: [{ ...makeCol("Work"), cards: [child] }] } };
  const other = { ...makeCard("Another project"), id: "other" };
  const board = { columns: [{ ...makeCol("Projects"), cards: [project, other] }] };
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify(board) }) });
  firestore.onSnapshot.mockReturnValue(() => {});
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const mount = () => act(async () => reactRoot.render(<I18nProvider><App /></I18nProvider>));
async function click(selector: string) {
  const target = host.querySelector<HTMLElement>(selector);
  if (!target) throw new Error(`Missing ${selector}`);
  await act(() => target.click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
}
const enter = (id: string) => click(`[data-card-id="${id}"] .card-action-btn`);

it("copies a card link from its menu and offers manual copying when clipboard access fails", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  await mount();
  await click('[data-card-id="project"] button[aria-label="More actions"]');
  const copy = () => [...document.querySelectorAll<HTMLButtonElement>(".card-menu-row")].find((row) => row.textContent?.includes("Copy link"))!;
  await act(() => copy().click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/#card=project`);
  expect(document.querySelector(".card-menu")?.textContent).toContain("Link copied");
  expect(host.querySelector(".modal-overlay")).toBeNull();
  await act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  writeText.mockRejectedValue(new Error("denied"));
  const card = host.querySelector('[data-card-id="project"]')!;
  await act(() => card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })));
  await act(() => copy().click());
  const fallback = document.querySelector<HTMLInputElement>(".card-menu-copy-fallback input")!;
  expect(fallback.value).toBe(`${window.location.origin}/#card=project`);
  expect(fallback.selectionEnd).toBe(fallback.value.length);
  expect(host.querySelector(".modal-overlay")).toBeNull();
});

it("opens an incoming card link after loading, even when the saved tab is Agenda", async () => {
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [{ id: "agenda", view: "week", segments: [] }], activeId: "agenda" }));
  window.history.replaceState(null, "", "/#card=child");
  await mount();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  expect(host.querySelector(".planner")).toBeNull();
  expect(host.querySelector<HTMLTextAreaElement>(".modal-title-input")?.value).toBe("Child board");
  expect(host.querySelector('[data-card-id="child"]')).not.toBeNull();
  expect(host.querySelector('.tab[aria-selected="true"]')?.textContent).toContain("Project");
});

it("handles pasted card hashes while running and reports missing cards", async () => {
  await mount();
  await act(() => {
    window.history.pushState(null, "", "/#card=child");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  expect(host.querySelector<HTMLTextAreaElement>(".modal-title-input")?.value).toBe("Child board");
  await click(".modal-close");
  await click(".logo-home");
  await act(() => {
    window.history.replaceState(null, "", "/#card=child");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  expect(host.querySelector<HTMLTextAreaElement>(".modal-title-input")?.value).toBe("Child board");
  await act(() => {
    window.history.pushState(null, "", "/#card=deleted");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
  expect(host.querySelector('.sync-notice[role="status"]')?.textContent).toContain("could not be found");
});

it("keeps the icon-only home and opens a board beside it, with the logo returning home", async () => {
  await mount();
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
  const home = host.querySelector('.tab-home');
  expect(home?.getAttribute("aria-label")).toBe("Home");
  expect(home?.textContent?.trim()).toBe("");
  expect(home?.querySelector(".tab-close")).toBeNull();
  expect(host.querySelector(".header")?.textContent).not.toContain("Root");
  expect(host.querySelector(".tab-strip")?.textContent).not.toContain("Root");
  await enter("project");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(host.querySelector('.tab[aria-selected="true"]')?.textContent).toContain("Project");
  expect(host.querySelector('[data-card-id="child"]')).not.toBeNull();
  await click(".logo-home");
  expect(host.querySelector('.tab-home')?.getAttribute("aria-selected")).toBe("true");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(host.querySelector('[data-card-id="project"]')).not.toBeNull();
  await enter("project");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(host.querySelector('[data-card-id="child"]')).not.toBeNull();
});

it("keeps deeper navigation in the board's tab and preserves it when opening another board", async () => {
  await mount();
  await enter("project");
  await enter("child");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(host.querySelector('.tab[aria-selected="true"]')?.textContent).toContain("Child board");
  await click(".logo-home");
  await enter("other");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
  expect(host.querySelector('.tab[aria-label="Child board"]')).not.toBeNull();
  expect(host.querySelector('.tab[aria-selected="true"]')?.textContent).toContain("Another project");
  await click('.tab[aria-label="Child board"]');
  expect(host.querySelector(".breadcrumb")?.textContent).toContain("Project");
  expect(host.querySelector(".breadcrumb")?.textContent).toContain("Child board");
});

it("uses + as the board picker and closing the last board returns to permanent home", async () => {
  await mount();
  await enter("project");
  await click(".tab-add");
  expect(host.querySelector('.tab-home')?.getAttribute("aria-selected")).toBe("true");
  await click(".tab-add");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
  await click('.tab[aria-label="Project"]');
  await click('.tab[aria-selected="true"] .tab-close');
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(host.querySelector('.tab-home')?.getAttribute("aria-selected")).toBe("true");
});

it("makes the logo return home from Agenda too", async () => {
  await mount();
  await click('.tab[aria-label="Agenda"]');
  expect(host.querySelector(".planner")).not.toBeNull();
  await click(".logo-home");
  expect(host.querySelector('.tab-home')?.getAttribute("aria-selected")).toBe("true");
  expect(host.querySelector('[data-card-id="project"]')).not.toBeNull();
});

it("removes the extra root control on mobile and keeps the logo as its accessible destination", async () => {
  compact = true;
  await mount();
  expect(host.querySelector(".crumb-current")).toBeNull();
  expect(host.querySelector(".logo-home")?.getAttribute("aria-label")).toBe("Oshka · Home");
  await enter("project");
  expect(host.querySelector(".crumb-current-name")?.textContent).toBe("Project");
  await click(".logo-home");
  expect(host.querySelector(".crumb-current")).toBeNull();
  expect(host.querySelector('[data-card-id="project"]')).not.toBeNull();
});
