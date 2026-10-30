// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPendingShare, parseSharedContent, readPendingShare, stageIncomingShare } from "../share-target";

afterEach(() => localStorage.clear());

describe("incoming mobile shares", () => {
  it("receives Android title, text and URL without losing URL parameters or Unicode", () => {
    const url = "https://example.com/été?a=1&b=two#section";
    const params = new URLSearchParams({ title: "À lire", text: "Une idée 💡", url });
    expect(parseSharedContent(`https://oshka.test/share?${params}`)).toEqual({
      title: "À lire", description: `Une idée 💡\n\n${url}`,
    });
  });
  it("accepts Android URLs in text and does not duplicate the same link", () => {
    const url = "https://example.com/?a=1&b=2";
    const params = new URLSearchParams({ text: `Article\n${url}`, url });
    expect(parseSharedContent(`https://oshka.test/share?${params}`)).toEqual({
      title: "Article", description: `Article\n${url}`,
    });
  });
  it("receives the iPhone shortcut fragment, decoding exactly once", () => {
    const text = "https://example.com/?search=a+b&next=%2Fpath#part";
    expect(parseSharedContent(`https://oshka.test/share#text=${encodeURIComponent(text)}`)).toEqual({
      title: text, description: text,
    });
  });
  it("accepts URL-only and title-only shares, and ignores empty or unrelated pages", () => {
    expect(parseSharedContent("https://oshka.test/share?url=https%3A%2F%2Fexample.com")).toEqual({ title: "https://example.com", description: "https://example.com" });
    expect(parseSharedContent("https://oshka.test/share?title=Note")).toEqual({ title: "Note", description: "" });
    expect(parseSharedContent("https://oshka.test/share?text=%20")).toBeNull();
    expect(parseSharedContent("https://oshka.test/?text=Not+a+share")).toBeNull();
  });
  it("stages a share before auth, cleans its URL and restores it after a magic-link redirect", () => {
    const history = { replaceState: vi.fn() };
    const pending = stageIncomingShare({ href: "https://oshka.test/share?title=Read&text=Some+context" }, history);
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(stageIncomingShare({ href: "https://oshka.test/?oobCode=magic" }, history)).toEqual(pending);
    clearPendingShare(pending.id);
    expect(readPendingShare()).toBeNull();
  });
  it("does not clear a newer share when another tab finishes an older one", () => {
    const history = { replaceState: vi.fn() };
    const old = stageIncomingShare({ href: "https://oshka.test/share?text=Old" }, history);
    const latest = stageIncomingShare({ href: "https://oshka.test/share?text=Latest" }, history);
    clearPendingShare(old.id);
    expect(readPendingShare()).toEqual(latest);
  });
  it("keeps an empty shortcut invocation visible across sign-in instead of silently opening a board", () => {
    const history = { replaceState: vi.fn() };
    const pending = stageIncomingShare({ href: "https://oshka.test/share#text=" }, history);
    expect(pending).toMatchObject({ title: "", description: "", empty: true });
    expect(stageIncomingShare({ href: "https://oshka.test/?oobCode=magic" }, history)).toEqual(pending);
    clearPendingShare(pending.id);
    expect(readPendingShare()).toBeNull();
  });
  it("keeps working in memory if browser storage is blocked", () => {
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(stageIncomingShare({ href: "https://oshka.test/share?text=Note" }, { replaceState() {} }, blocked).title).toBe("Note");
    expect(readPendingShare(blocked)).toBeNull();
  });
});
