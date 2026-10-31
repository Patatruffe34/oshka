// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { readPendingShare, stageIncomingShare } from "../lib/share-target";

const state = vi.hoisted(() => ({ user: { uid: "share-user", email: "test@example.com" } }));
const firestore = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), runTransaction: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => firestore);
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
import App from "../App";

let host, reactRoot, pending;
const render = () => act(async () => reactRoot.render(<StrictMode><I18nProvider><App initialShare={pending} /></I18nProvider></StrictMode>));
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.user = { uid: "share-user", email: "test@example.com" };
  localStorage.setItem("inceptio_lang", "en");
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  firestore.runTransaction.mockImplementation(async (_db, callback) => {
    let written;
    const result = await callback({ get: firestore.getDoc, set: (ref, data) => { written = [ref, data]; } });
    if (written) {
      await firestore.setDoc(...written);
      firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => written[1] });
    }
    return result;
  });
  firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ boardJson: JSON.stringify({ columns: [] }) }) });
  firestore.onSnapshot.mockReturnValue(() => {});
  firestore.setDoc.mockResolvedValue(undefined);
  pending = stageIncomingShare({ href: "https://oshka.test/share?title=Article&url=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2" }, { replaceState() {} });
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = createRoot(host);
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("waits for sign-in, then saves a share once and opens the Inbox", async () => {
  state.user = null;
  await render();
  expect(host.querySelector(".auth-page").textContent).toContain("shared content");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(readPendingShare()).toEqual(pending);
  state.user = { uid: "share-user", email: "test@example.com" };
  await render();
  expect(host.querySelector('[role="dialog"] input').value).toBe("Article");
  expect(firestore.setDoc).not.toHaveBeenCalled();
  const form = host.querySelector(".shared-capture form");
  await act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(host.querySelector(".shared-capture")).toBeNull();
  expect(readPendingShare()).toBeNull();
  expect(host.querySelector(".inbox-panel").hidden).toBe(false);
  expect(host.querySelectorAll(".inbox-item")).toHaveLength(1);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  const saved = JSON.parse(firestore.setDoc.mock.calls.at(-1)[1].boardJson);
  expect(saved.inbox).toHaveLength(1);
  expect(saved.inbox[0]).toMatchObject({ title: "Article", description: "https://example.com/?a=1&b=2" });
  expect(saved.columns).toEqual([]);
});

it("cancels without creating a card or restoring the pending share on reload", async () => {
  await render();
  await act(() => host.querySelector(".shared-capture .modal-close").click());
  expect(readPendingShare()).toBeNull();
  expect(host.querySelector(".shared-capture")).toBeNull();
  expect(host.querySelectorAll(".inbox-item")).toHaveLength(0);
  expect(firestore.setDoc).not.toHaveBeenCalled();
});

it("explains an empty share from the old shortcut and never creates an empty card", async () => {
  pending = stageIncomingShare({ href: "https://oshka.test/share#text=" }, { replaceState() {} });
  await render();
  expect(host.querySelector('.shared-capture [role="alert"]').textContent).toContain("No content was received");
  expect(host.querySelector('.shared-capture button[type="submit"]').disabled).toBe(true);
  expect(firestore.setDoc).not.toHaveBeenCalled();
});
