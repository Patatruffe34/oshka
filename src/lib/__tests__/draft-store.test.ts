// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { draftStore, type Draft } from "../board-sync";

// The store keeps whatever it is handed: a string stands in for a board state.
const draft = (local: string) => ({ local }) as unknown as Draft;

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

it("never reads or clears another account's draft", () => {
  const a = draftStore("A"); a.write(draft("private A"));
  const b = draftStore("B"); b.write(draft("private B"));
  expect(b.others()).toEqual([]); expect(a.others()).toEqual([]);
  b.clear(); expect(a.read()).toEqual({ local: "private A" });
});

it("retains both writers when a duplicated tab inherits sessionStorage", () => {
  const first = draftStore("A"); first.write(draft("original"));
  const duplicate = draftStore("A");
  expect(duplicate.read()).toEqual({ local: "original" });
  first.write(draft("new edit in original tab"));
  duplicate.write(draft("new edit in duplicate tab"));
  duplicate.clear();
  expect(first.read()).toEqual({ local: "new edit in original tab" });
  expect(duplicate.others()).toMatchObject([{ local: "new edit in original tab" }]);
});

it("recovers and retires an unchanged draft after reloading a tab", () => {
  const before = draftStore("A"); before.write(draft("unsaved"));
  const after = draftStore("A");
  expect(after.read()).toEqual({ local: "unsaved" });
  after.write(draft("resumed"));
  expect(after.others()).toEqual([]); expect(after.read()).toEqual({ local: "resumed" });
  after.clear(); expect(Object.keys(localStorage)).toEqual([]);
});
