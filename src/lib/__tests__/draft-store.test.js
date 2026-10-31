// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { draftStore } from "../board-sync";

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

it("never reads or clears another account's draft", () => {
  const a = draftStore("A"); a.write({ local: "private A" });
  const b = draftStore("B"); b.write({ local: "private B" });
  expect(b.others()).toEqual([]); expect(a.others()).toEqual([]);
  b.clear(); expect(a.read()).toEqual({ local: "private A" });
});

it("retains both writers when a duplicated tab inherits sessionStorage", () => {
  const first = draftStore("A"); first.write({ local: "original" });
  const duplicate = draftStore("A");
  expect(duplicate.read()).toEqual({ local: "original" });
  first.write({ local: "new edit in original tab" });
  duplicate.write({ local: "new edit in duplicate tab" });
  duplicate.clear();
  expect(first.read()).toEqual({ local: "new edit in original tab" });
  expect(duplicate.others()).toMatchObject([{ local: "new edit in original tab" }]);
});

it("recovers and retires an unchanged draft after reloading a tab", () => {
  const before = draftStore("A"); before.write({ local: "unsaved" });
  const after = draftStore("A");
  expect(after.read()).toEqual({ local: "unsaved" });
  after.write({ local: "resumed" });
  expect(after.others()).toEqual([]); expect(after.read()).toEqual({ local: "resumed" });
  after.clear(); expect(Object.keys(localStorage)).toEqual([]);
});
