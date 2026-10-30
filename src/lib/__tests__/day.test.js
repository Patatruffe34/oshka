import { describe, it, expect } from "vitest";
import { localDay, msUntilNextDay } from "../day";

describe("localDay", () => {
  it("donne le jour local, pas celui d'UTC", () => {
    // 23h30 le 9 octobre ici, quel que soit le fuseau : c'est encore le 9
    expect(localDay(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
  });

  it("complete mois et jour sur deux chiffres", () => {
    expect(localDay(new Date(2026, 0, 5, 8, 0))).toBe("2026-01-05");
  });
});

describe("msUntilNextDay", () => {
  it("compte jusqu'au prochain minuit local", () => {
    expect(msUntilNextDay(new Date(2026, 9, 9, 23, 59, 30))).toBe(30_000);
  });

  it("vaut une journee pleine a minuit pile", () => {
    const midnight = new Date(2026, 9, 10, 0, 0, 0);
    const next = new Date(2026, 9, 11, 0, 0, 0);
    expect(msUntilNextDay(midnight)).toBe(next - midnight);
  });
});
