import { describe, it, expect } from "vitest";
import { withAgenda, placeTab, type Tab } from "../useTabs";

/* The Agenda is permanent, which is what lets the top bar drop its button. If it
   could ever be absent, that button's removal would strand someone. */
describe("withAgenda", () => {
  const board: Tab = { id: "a", segments: [] };

  it("ajoute l'Agenda quand il manque, en tete", () => {
    const out = withAgenda({ tabs: [board], activeId: "a" });
    expect(out.tabs).toHaveLength(2);
    expect(out.tabs[0].view).toBe("week");
    expect(out.tabs[1]).toBe(board);
  });

  it("ne touche pas a l'onglet actif en l'ajoutant", () => {
    // Arriver sur l'Agenda parce qu'il vient d'etre cree serait un deplacement
    // que personne n'a demande.
    expect(withAgenda({ tabs: [board], activeId: "a" }).activeId).toBe("a");
  });

  it("n'en ajoute pas un second", () => {
    const deja = { tabs: [{ id: "h", segments: [], view: "week" as const }, board], activeId: "a" };
    expect(withAgenda(deja)).toBe(deja);
  });
});

describe("placeTab", () => {
  const horizon: Tab = { id: "h", segments: [], view: "week" };
  const strip: Tab[] = [horizon, { id: "a", segments: [] }, { id: "b", segments: [] }];
  const neuf: Tab = { id: "n", segments: [] };
  const ids = (tabs: Tab[]) => tabs.map((t) => t.id);

  it("pose au bout ce qui vient du +", () => {
    // Un onglet ne venant d'aucun autre n'a pas de voisin ou s'asseoir
    expect(ids(placeTab(strip, neuf, { activeId: "a", atEnd: true })))
      .toEqual(["h", "a", "b", "n"]);
  });

  it("pose a cote ce qui vient d'une carte", () => {
    expect(ids(placeTab(strip, neuf, { activeId: "a" }))).toEqual(["h", "a", "n", "b"]);
  });

  it("ne passe jamais devant les vues ancrees a gauche", () => {
    // Depuis l'Agenda, "a cote" voudrait dire en position 1, devant lui
    expect(ids(placeTab(strip, neuf, { activeId: "h" }))).toEqual(["h", "n", "a", "b"]);
    // Et le jour ou il y a deux vues, "a cote" de la premiere tomberait
    // entre les deux: le plancher est la bande epinglee entiere, pas la vue
    // dont on part.
    // "map" is no view the app opens today: any pinned view takes the same place
    const deux = [horizon, { id: "h2", segments: [], view: "map" } as unknown as Tab, ...strip.slice(1)];
    expect(ids(placeTab(deux, neuf, { activeId: "h" })))
      .toEqual(["h", "h2", "n", "a", "b"]);
  });

  it("met une vue en tete, d'ou qu'elle vienne", () => {
    const vue: Tab = { id: "v", segments: [], view: "week" };
    expect(ids(placeTab(strip, vue, { activeId: "b", atEnd: true })))
      .toEqual(["v", "h", "a", "b"]);
  });

  it("ne touche pas a la bande recue", () => {
    placeTab(strip, neuf, { activeId: "a", atEnd: true });
    expect(ids(strip)).toEqual(["h", "a", "b"]);
  });
});
