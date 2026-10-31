// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import ProfileModal from "../ProfileModal";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: { getIdToken: async () => "test-token" } } }));

const fakeFetch = () => vi.fn(async (_url: string, options: RequestInit) => ({ ok: true, status: 200, json: async () => options.method === "POST" ? { code: "0123456789abcdef0123456789abcdef" } : { connected: false } }));
let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof fakeFetch>;
let onClose: Mock;
const click = async (element: Element | null | undefined) => act(() => (element as HTMLElement).click());
const button = (label: string) => [...host.querySelectorAll("button")].find((element) => element.textContent?.includes(label) || element.getAttribute("aria-label") === label);

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "fr");
  fetchMock = fakeFetch();
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onClose = vi.fn();
  await act(() => root.render(<I18nProvider><ProfileModal user={{ email: "test@example.com" } as User} settings={{ ...DEFAULT_SETTINGS, autoArchiveDone: false, confetti: true }} onUpdateSettings={vi.fn()} onClose={onClose} /></I18nProvider>));
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("connections from settings", () => {
  it("opens a dedicated dialog without generating a code, and returns to settings", async () => {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector("a[download]")).toBeNull();
    await click(button("Connexions et partage"));
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector("h2")?.textContent).toBe("Connexions et partage");
    expect(host.querySelector("a[download]")?.getAttribute("href")).toBe("/shortcuts/Ajouter-a-Oshka.shortcut?download=1&v=2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/integrations/slack/link", expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer test-token" } }));
    expect(document.activeElement).toBe(button("Paramètres"));
    await click(button("Paramètres"));
    expect(host.querySelector("h2")?.textContent).toBe("Paramètres");
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.activeElement).toBe(button("Connexions et partage"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(["slack", "gmail"])("creates a %s code only on request and leaves it selectable", async (integration) => {
    await click(button("Connexions et partage"));
    host.querySelector<HTMLDetailsElement>(`.connection-${integration} details`)!.open = true;
    await click(host.querySelector(`.connection-${integration} .btn-primary`));
    expect(fetchMock).toHaveBeenLastCalledWith(`/integrations/${integration}/link-code`, expect.objectContaining({ method: "POST" }));
    const code = host.querySelector<HTMLInputElement>(`.connection-${integration} input[readonly]`)!;
    expect(code.value).toBe("0123456789abcdef0123456789abcdef");
    expect(code.labels?.[0].textContent).toContain("10 minutes");
  });

  it("closes with Escape or the named close button", async () => {
    await click(button("Connexions et partage"));
    await act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
    await click(button("Fermer"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
