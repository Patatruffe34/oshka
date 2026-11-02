// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { makeCard, makeCol, type CardLocation } from "../../lib/board-utils";
import type { NestDestination } from "../../lib/card-nesting";
import type { RootBoard } from "../../lib/types";
import NestCardPanel, { type NestDrop } from "../NestCardPanel";

let host: HTMLDivElement, reactRoot: Root, board: RootBoard, drop: NestDrop;
const onMove = vi.fn<(from: CardLocation, to: NestDestination) => boolean>(() => true), onClose = vi.fn();
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "en");
  const a = makeCard("Move me"), b = makeCard("Destination");
  const source = { ...makeCol("Tasks"), cards: [a, b] };
  board = { columns: [source] };
  drop = { from: { path: [], colId: source.id, cardId: a.id }, path: [{ colId: source.id, cardId: b.id }] };
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  vi.clearAllMocks();
  localStorage.clear();
});
const render = () => act(() => reactRoot.render(<I18nProvider><NestCardPanel root={board} drop={drop} onMove={onMove} onClose={onClose} /></I18nProvider>));
const click = (selector: string) => act(() => document.querySelector<HTMLButtonElement>(selector)!.click());

it("opens the existing move popup on the target's columns", async () => {
  const columns = [makeCol("First"), makeCol("Second")];
  board.columns[0].cards[1].board.columns = columns;
  await render();
  expect(document.querySelector('.move-breadcrumb [aria-current="location"]')?.textContent).toBe("Destination");
  expect([...document.querySelectorAll(".move-col-name")].map((element) => element.textContent)).toEqual(["First", "Second"]);
  await click(".move-col-btn:nth-child(2)");
  expect(onMove).toHaveBeenCalledExactlyOnceWith(drop.from, { path: drop.path, colId: columns[1].id, initialColumns: undefined });
  expect(onClose).toHaveBeenCalledOnce();
});

it("offers all existing templates and a Todo option without changing an empty board", async () => {
  await render();
  expect(document.querySelectorAll(".preset-card")).toHaveLength(9);
  expect(document.querySelector(".presets-scratch")?.textContent).toContain("Todo column");
  await click(".move-dialog .modal-close");
  expect(onMove).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  expect(board.columns[0].cards[1].board.columns).toEqual([]);
});

it("stages a template, asks for its column, then commits both together", async () => {
  await render();
  await click(".preset-card");
  expect(onMove).not.toHaveBeenCalled();
  expect(board.columns[0].cards[1].board.columns).toEqual([]);
  expect([...document.querySelectorAll(".move-col-name")].map((element) => element.textContent)).toEqual(["To Do", "In Progress", "Done"]);
  await click(".move-col-btn:nth-child(2)");
  const destination = onMove.mock.calls[0][1];
  expect(destination.path).toEqual(drop.path);
  expect(destination.initialColumns?.map((column) => column.title)).toEqual(["To Do", "In Progress", "Done"]);
  expect(destination.colId).toBe(destination.initialColumns?.[1].id);
  expect(onClose).toHaveBeenCalledOnce();
});

it("cancels after choosing a template without leaving columns behind", async () => {
  await render();
  await click(".preset-card");
  await act(() => document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(onMove).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  expect(board.columns[0].cards[1].board.columns).toEqual([]);
});

it("files directly after choosing the single Todo column", async () => {
  await render();
  await click(".presets-scratch button");
  expect(onMove).toHaveBeenCalledOnce();
  const destination = onMove.mock.calls[0][1];
  expect(destination.path).toEqual(drop.path);
  expect(destination.initialColumns).toHaveLength(1);
  expect(destination.initialColumns?.[0]).toMatchObject({ title: "Todo", emoji: "📝", cards: [] });
  expect(destination.colId).toBe(destination.initialColumns?.[0].id);
  expect(onClose).toHaveBeenCalledOnce();
});

it("keeps the picker open if a concurrent edit invalidates the move", async () => {
  onMove.mockReturnValueOnce(false);
  await render();
  await click(".presets-scratch button");
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector(".move-dialog [role=status]")?.textContent).toContain("no longer available");
});

it("does not silently choose the root when the target disappears", async () => {
  await render();
  board = { ...board, columns: [{ ...board.columns[0], cards: [board.columns[0].cards[0]] }] };
  await render();
  expect(document.querySelector(".move-dialog [role=status]")?.textContent).toContain("no longer available");
  expect(document.querySelector(".move-col-btn")).toBeNull();
  expect(onMove).not.toHaveBeenCalled();
});
