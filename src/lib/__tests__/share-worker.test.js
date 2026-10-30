import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(fetch) {
  const listeners = {};
  const shell = { shell: true };
  const caches = { match: vi.fn(async () => shell), open: vi.fn() };
  runInNewContext(readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8"), {
    URL, fetch, caches,
    self: { location: { origin: "https://oshka.test" }, addEventListener: (name, fn) => { listeners[name] = fn; } },
  });
  return { listeners, caches, shell };
}

describe("share target service worker", () => {
  it("leaves shortcut attachments to the browser instead of replaying a cached preview", () => {
    const fetch = vi.fn();
    const { listeners, caches } = worker(fetch);
    const respondWith = vi.fn();
    listeners.fetch({
      request: { method: "GET", url: "https://oshka.test/shortcuts/Ajouter-a-Oshka.shortcut?download=1", mode: "navigate" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(caches.match).not.toHaveBeenCalled();
  });
  it.each([false, true])("serves a share navigation without caching personal content, offline: %s", async (offline) => {
    const response = { network: true };
    const fetch = offline ? vi.fn(async () => { throw new Error("offline"); }) : vi.fn(async () => response);
    const { listeners, caches, shell } = worker(fetch);
    let result;
    listeners.fetch({
      request: { method: "GET", url: "https://oshka.test/share?text=private-content", mode: "navigate" },
      respondWith: (promise) => { result = promise; },
    });
    expect(await result).toEqual(offline ? shell : response);
    expect(fetch).toHaveBeenCalledWith("/index.html", { cache: "reload" });
    expect(caches.open).not.toHaveBeenCalled();
    if (offline) expect(caches.match).toHaveBeenCalledWith("/index.html");
  });
});
