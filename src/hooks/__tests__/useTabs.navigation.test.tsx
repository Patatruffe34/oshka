// @vitest-environment happy-dom
import { act, useCallback, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useTabs, type Tab } from "../useTabs";
import type { PathSegment, TitledSegment } from "../../lib/types";

let host: HTMLDivElement, reactRoot: Root, tabs: ReturnType<typeof useTabs>;
let settle: () => void, restore: (path: TitledSegment[]) => void;
const project = [{ colId: "tasks", cardId: "project", cardTitle: "Project" }];
const deeper = [...project, { colId: "next", cardId: "child", cardTitle: "Child" }];
const resolve = (segments: PathSegment[]) => segments.map((segment) => ({ ...segment, cardTitle: segment.cardId }));

function Harness({ initialPath = [] }: { initialPath?: TitledSegment[] }) {
  const [path, setPath] = useState(initialPath);
  const [pending, setPending] = useState<TitledSegment[] | null>(null);
  const navigate = useCallback((next: TitledSegment[]) => setPending(next), []);
  const state = useTabs({ path, navigate, ready: true, navigating: pending !== null });
  useLayoutEffect(() => {
    tabs = state;
    settle = () => { if (pending !== null) { setPath(pending); setPending(null); } };
    restore = setPath;
  }, [state, pending]);
  return null;
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  localStorage.clear();
});
const mount = (initialPath?: TitledSegment[]) => act(() => reactRoot.render(<Harness initialPath={initialPath} />));
const home = (): Tab => tabs.tabs.find((tab) => tab.home)!;

it("keeps home pinned, unclosable and empty while opening and closing a board", async () => {
  await mount();
  const id = home().id;
  await act(() => tabs.close(id, resolve));
  await act(() => tabs.move(1, 0));
  expect(home().id).toBe(id);
  expect(tabs.tabs[1]).toBe(home());
  await act(() => tabs.open(project, resolve));
  await act(settle);
  const boardId = tabs.activeId;
  expect(tabs.tabs).toHaveLength(3);
  expect(home().segments).toEqual([]);
  await act(() => tabs.select(id, resolve));
  // The old board path stays visible until its navigation animation finishes.
  expect(tabs.activeId).toBe(id);
  await act(settle);
  expect(tabs.tabs.find((tab) => tab.id === boardId)?.segments).toEqual(project.map(({ colId, cardId }) => ({ colId, cardId })));
  expect(home().segments).toEqual([]);
  await act(() => tabs.select(boardId, resolve));
  await act(settle);
  await act(() => tabs.close(boardId, resolve));
  await act(settle);
  expect(tabs.activeId).toBe(id);
  expect(tabs.tabs).toHaveLength(2);
});

it("reuses home for the + button and persists it without duplicate roots", async () => {
  await mount();
  const id = home().id;
  await act(() => tabs.open(project, resolve));
  await act(settle);
  await act(() => tabs.open([], resolve, undefined, { atEnd: true }));
  await act(settle);
  await act(() => tabs.open([], resolve));
  await act(settle);
  expect(tabs.activeId).toBe(id);
  expect(tabs.tabs).toHaveLength(3);
  const saved = JSON.parse(localStorage.getItem("oshka_tabs")!);
  expect(saved.tabs.filter((tab: Tab) => tab.home)).toEqual([{ id, home: true, segments: [] }]);
});

it("gives a restored deep link its own tab instead of changing home", async () => {
  await mount();
  const id = home().id;
  await act(() => restore(project));
  expect(tabs.activeId).not.toBe(id);
  expect(home().segments).toEqual([]);
  expect(tabs.tabs.find((tab) => tab.id === tabs.activeId)?.segments).toEqual(project.map(({ colId, cardId }) => ({ colId, cardId })));
  await act(() => restore(deeper));
  expect(tabs.tabs).toHaveLength(3);
  await act(() => restore([]));
  expect(tabs.activeId).toBe(id);
  expect(home().segments).toEqual([]);
});

it("migrates stored tabs while preserving an active nested board", async () => {
  localStorage.setItem("oshka_tabs", JSON.stringify({ tabs: [
    { id: "agenda", segments: [], view: "week" },
    { id: "board", segments: project },
  ], activeId: "board" }));
  await mount(project);
  expect(tabs.activeId).toBe("board");
  expect(tabs.tabs).toHaveLength(3);
  expect(home().segments).toEqual([]);
});
