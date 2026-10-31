// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useLinkPreview } from "../useLinkPreview";
let host, root, preview;
function Harness({ title, enabled }) { const state = useLinkPreview(title, enabled); useLayoutEffect(() => { preview = state; }); return null; }
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); root = createRoot(host); vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ status: "success", data: { title: "Preview", image: { url: "https://example.com/image" } } }) })));
});
afterEach(async () => { await act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("makes no request by default, even for a URL containing credentials", async () => {
  await act(() => root.render(<Harness title="https://example.com/private?token=secret#fragment" />));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(fetch).not.toHaveBeenCalled(); expect(preview.preview).toBeNull();
});
it("fetches only with consent and hides a previous preview as soon as consent changes", async () => {
  await act(() => root.render(<Harness title="https://example.com/public" enabled />));
  await act(async () => vi.advanceTimersByTimeAsync(501));
  expect(fetch).toHaveBeenCalledTimes(1); expect(preview.preview.title).toBe("Preview");
  await act(() => root.render(<Harness title="https://example.com/secret" enabled={false} />));
  await act(async () => vi.advanceTimersByTimeAsync(501));
  expect(fetch).toHaveBeenCalledTimes(1); expect(preview.preview).toBeNull();
});
