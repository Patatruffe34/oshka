import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Checks on the dictionary itself, read as text.
 *
 * A missing key is not a crash: t() falls back to the key, so the interface
 * quietly starts printing "history.action.toggle_done" at people. Nothing in
 * the type system or the tests notices, because nothing is wrong — the string
 * is simply the wrong string. It has to be looked for on purpose.
 */
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f: string) => fs.readFileSync(path.join(src, f), "utf8");

/** The two locale blocks, as key sets: en comes first in the file, fr second */
const locales = () => {
  const keys = [...read("lib/i18n.tsx").matchAll(/^ {4}"([^"]+)":/gm)].map((m) => m[1]);
  const en = new Set();
  const fr = new Set();
  for (const k of keys) (en.has(k) ? fr : en).add(k);
  return { en, fr };
};

describe("le dictionnaire", () => {
  it("dit la meme chose dans les deux langues", () => {
    const { en, fr } = locales();
    expect(en.size).toBeGreaterThan(200);
    expect([...en].filter((k) => !fr.has(k))).toEqual([]);
    expect([...fr].filter((k) => !en.has(k))).toEqual([]);
  });

  it("nomme chaque action que l'historique peut annuler", () => {
    // Sans ca le bandeau d'annulation affiche la cle brute a l'utilisateur
    const board = read("hooks/useBoard.ts");
    const labels = [
      ...new Set(
        [...board.matchAll(/snapshot\("([a-z_]+)"\)|\}, "([a-z_]+)"\)/g)].map(
          (m) => m[1] || m[2]
        )
      ),
    ];
    expect(labels.length).toBeGreaterThan(15);

    const { en, fr } = locales();
    const orphelines = labels.filter(
      (l) => !en.has(`history.action.${l}`) || !fr.has(`history.action.${l}`)
    );
    expect(orphelines).toEqual([]);
  });
});
