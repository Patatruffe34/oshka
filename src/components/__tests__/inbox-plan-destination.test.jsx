// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { makeCard } from "../../lib/board-utils";
import InboxPlanDestination from "../InboxPlanDestination";

let host, reactRoot, board, drop;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "en");
  const card = makeCard("Plan this note");
  board = { columns: [{ id: "tasks", title: "Tasks", cards: [] }], inbox: [card] };
  drop = { cardId: card.id, dueAt: "2026-10-22", lane: "tomorrow", index: 1 };
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  localStorage.clear();
});
const render = (onFile, onClose) => act(() => reactRoot.render(<I18nProvider><InboxPlanDestination root={board} drop={drop} onFile={onFile} onClose={onClose} /></I18nProvider>));
it("keeps the note intact until its destination is chosen and passes the dropped date", async () => {
  const onFile = vi.fn(() => true), onClose = vi.fn();
  await render(onFile, onClose);
  expect(onFile).not.toHaveBeenCalled();
  expect(board.inbox).toHaveLength(1);
  await act(() => document.querySelector(".move-col-btn").click());
  expect(onFile).toHaveBeenCalledExactlyOnceWith(drop.cardId, [], "tasks", undefined, undefined, drop);
  expect(onClose).toHaveBeenCalledOnce();
});
it("cancels a drop without filing or scheduling the note", async () => {
  const onFile = vi.fn(), onClose = vi.fn();
  await render(onFile, onClose);
  await act(() => document.querySelector(".move-dialog .modal-close").click());
  expect(onFile).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  expect(board.inbox[0].dueAt).toBeNull();
});
it("keeps the picker open with feedback when the destination has disappeared", async () => {
  const onFile = vi.fn(() => false), onClose = vi.fn();
  await render(onFile, onClose);
  await act(() => document.querySelector(".move-col-btn").click());
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector(".move-dialog [role=status]").textContent).toContain("no longer available");
  expect(board.inbox).toHaveLength(1);
});
