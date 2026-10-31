import { describe, it, expect } from "vitest";
import {
  normalizeRepeat,
  isRepeating,
  nextOccurrence,
  rollCardOver,
  repeatKey,
  REPEAT_MAX,
} from "../repeat";
import { makeCard } from "../board-utils";
import type { Card } from "../types";

/* Mercredi 26 aout 2026 */
const NOW = new Date(2026, 7, 26);

describe("normalizeRepeat", () => {
  it("refuse ce qui ne dit rien", () => {
    expect(normalizeRepeat(null)).toBeNull();
    expect(normalizeRepeat({})).toBeNull();
    expect(normalizeRepeat({ every: 0, unit: "day" })).toBeNull();
    expect(normalizeRepeat({ every: -3, unit: "day" })).toBeNull();
    expect(normalizeRepeat({ every: "abc", unit: "day" })).toBeNull();
  });

  it("arrondit, borne, et retombe sur une unite connue", () => {
    expect(normalizeRepeat({ every: 2.7, unit: "day" })).toEqual({ every: 2, unit: "day" });
    expect(normalizeRepeat({ every: 500, unit: "day" })).toEqual({
      every: REPEAT_MAX,
      unit: "day",
    });
    // Un document ecrit par une version plus recente, ou juste faux
    expect(normalizeRepeat({ every: 1, unit: "fortnight" })).toEqual({
      every: 1,
      unit: "week",
    });
  });

  it("dit si une carte se repete", () => {
    expect(isRepeating(makeCard("x"))).toBe(false);
    expect(isRepeating({ ...makeCard("x"), repeat: { every: 1, unit: "day" } })).toBe(true);
    // Une repetition videe ne compte pas comme une repetition
    expect(isRepeating({ ...makeCard("x"), repeat: { every: 0, unit: "day" } })).toBe(false);
  });
});

describe("nextOccurrence", () => {
  it("avance d'une periode quand l'echeance est encore devant", () => {
    expect(nextOccurrence("2026-08-30", { every: 1, unit: "day" }, NOW)).toBe("2026-08-31");
    expect(nextOccurrence("2026-08-30", { every: 2, unit: "week" }, NOW)).toBe("2026-09-13");
    expect(nextOccurrence("2026-08-30", { every: 1, unit: "month" }, NOW)).toBe("2026-09-30");
  });

  it("rattrape le retard en une fois, pas en autant d'occurrences", () => {
    // Trois semaines de retard, hebdomadaire: la prochaine est dans une semaine
    expect(nextOccurrence("2026-08-05", { every: 1, unit: "week" }, NOW)).toBe("2026-09-02");
    // Et non 2026-08-12, la premiere occurrence apres celle qui a ete ratee
  });

  it("passe le jour meme: on vient de le faire", () => {
    expect(nextOccurrence("2026-08-26", { every: 1, unit: "day" }, NOW)).toBe("2026-08-27");
    // Un hebdomadaire du jour repart a une semaine, pas a aujourd'hui
    expect(nextOccurrence("2026-08-19", { every: 1, unit: "week" }, NOW)).toBe("2026-09-02");
  });

  it("compte depuis aujourd'hui quand la carte n'a pas de date", () => {
    expect(nextOccurrence(null, { every: 3, unit: "day" }, NOW)).toBe("2026-08-29");
  });

  it("accepte une date stockee en ISO complet", () => {
    expect(nextOccurrence("2026-08-30T00:00:00.000Z", { every: 1, unit: "day" }, NOW)).toBe(
      "2026-08-31"
    );
  });

  it("change d'annee sans se tromper de mois", () => {
    expect(nextOccurrence("2026-11-15", { every: 3, unit: "month" }, NOW)).toBe("2027-02-15");
    expect(nextOccurrence("2026-12-31", { every: 1, unit: "day" }, NOW)).toBe("2027-01-01");
  });

  it("replie un mois trop court sur son dernier jour", () => {
    // Le 31 janvier + un mois n'existe pas
    expect(nextOccurrence("2027-01-31", { every: 1, unit: "month" }, NOW)).toBe("2027-02-28");
    // Annee bissextile
    expect(nextOccurrence("2028-01-31", { every: 1, unit: "month" }, NOW)).toBe("2028-02-29");
  });

  it("ne rend rien quand il n'y a pas de repetition", () => {
    expect(nextOccurrence("2026-08-30", null, NOW)).toBeNull();
    expect(nextOccurrence("2026-08-30", { every: 0, unit: "day" }, NOW)).toBeNull();
  });

  it("traverse le retour a l'heure d'hiver", () => {
    /* Le 25 octobre 2026 dure vingt-cinq heures en Europe. Ajouter 86 400 000
       millisecondes a son debut n'en sort pas: on retombe le soir du meme
       jour, et la carte se croit encore due aujourd'hui. D'ou l'arithmetique
       par composantes de date plutot que par duree.

       Ce test ne mord que dans un fuseau qui change d'heure — ailleurs il
       passe sans rien prouver, jamais l'inverse. */
    expect(nextOccurrence("2026-10-25", { every: 1, unit: "day" }, new Date(2026, 9, 25))).toBe(
      "2026-10-26"
    );
    expect(nextOccurrence("2026-10-18", { every: 1, unit: "week" }, new Date(2026, 9, 18))).toBe(
      "2026-10-25"
    );
  });
});

describe("rollCardOver", () => {
  const repeating = (): Card => ({
    ...makeCard("Arroser les plantes"),
    dueAt: "2026-08-26",
    done: true,
    doneAt: "2026-08-26T09:00:00.000Z",
    rank: 3,
    repeat: { every: 1, unit: "week" },
    checklists: [
      { id: "l1", title: "Etapes", items: [{ id: "i1", text: "a", done: true }] },
    ],
  });

  it("reporte la date et rend la carte a faire", () => {
    const card = repeating();
    expect(rollCardOver(card, "2026-09-02")).toBe(true);
    expect(card.dueAt).toBe("2026-09-02");
    expect(card.done).toBe(false);
    expect(card.doneAt).toBeNull();
  });

  it("decoche les checklists: la routine recommence", () => {
    const card = repeating();
    rollCardOver(card, "2026-09-02");
    expect(card.checklists[0].items[0].done).toBe(false);
    // Les listes elles-memes restent, seuls les coches partent
    expect(card.checklists[0].title).toBe("Etapes");
  });

  it("oublie le rang: il appartenait a la voie qu'on vient de quitter", () => {
    const card = repeating();
    rollCardOver(card, "2026-09-02");
    expect(card.rank).toBeUndefined();
  });

  it("garde la repetition, et tout le reste de la carte", () => {
    const card = repeating();
    card.description = "sur le rebord";
    rollCardOver(card, "2026-09-02");
    expect(card.repeat).toEqual({ every: 1, unit: "week" });
    expect(card.description).toBe("sur le rebord");
    expect(card.title).toBe("Arroser les plantes");
  });

  it("ne touche a rien sans date", () => {
    const card = repeating();
    expect(rollCardOver(card, null)).toBe(false);
    expect(card.done).toBe(true);
  });
});

describe("repeatKey", () => {
  it("distingue le singulier du pluriel", () => {
    expect(repeatKey({ every: 1, unit: "day" })).toBe("repeat.every_day");
    expect(repeatKey({ every: 2, unit: "day" })).toBe("repeat.every_days");
    expect(repeatKey({ every: 1, unit: "month" })).toBe("repeat.every_month");
    expect(repeatKey({ every: 3, unit: "week" })).toBe("repeat.every_weeks");
  });

  it("ne nomme rien quand il n'y a rien a nommer", () => {
    expect(repeatKey(null)).toBeNull();
  });
});
