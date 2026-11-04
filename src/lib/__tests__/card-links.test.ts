import { describe, expect, it } from "vitest";
import { cardIdFromHash, cardLink, findLinkedCard } from "../card-links";
import { makeCard, makeCol } from "../board-utils";

describe("card permalinks", () => {
  it("copies only the app address and stable card ID", () => {
    const url = cardLink("task/é", "https://oshka.app/app?oobCode=secret&share=private#old:board");
    expect(url).toBe("https://oshka.app/app#card=task%2F%C3%A9");
    expect(cardIdFromHash(new URL(url).hash)).toBe("task/é");
  });

  it("ignores board paths and malformed card links", () => {
    for (const hash of ["", "#projects:project", "#card=", "#card=%E0%A4%A"]) {
      expect(cardIdFromHash(hash)).toBeNull();
    }
  });

  it("finds a card after it and its parent have moved, including archives", () => {
    const task = { ...makeCard("Task"), id: "task", archived: true };
    const tasks = { ...makeCol("New column"), id: "new-column", cards: [task] };
    const project = { ...makeCard("Renamed project"), id: "project", board: { columns: [tasks] } };
    const root = { columns: [{ ...makeCol("Moved projects"), id: "moved-projects", cards: [project] }] };
    expect(findLinkedCard(root, "task")).toEqual({
      card: task, colId: "new-column",
      path: [{ colId: "moved-projects", cardId: "project", cardTitle: "Renamed project" }],
    });
    expect(findLinkedCard(root, "deleted")).toBeNull();
  });
});
