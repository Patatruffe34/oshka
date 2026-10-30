import { describe, it, expect } from "vitest";
import {
  planWeek,
  weekReach,
  dateForLane,
  groupByBoard,
  reorderEntries,
  shortTrail,
  LANES,
} from "../planner";
import { makeCard, makeCol } from "../board-utils";

/* Mercredi 26 août 2026 — un mercredi, donc la semaine calendaire a encore
   quatre jours devant elle et la glissante en a sept. */
const NOW = new Date(2026, 7, 26);
const jour = (n) => {
  const d = new Date(2026, 7, 26 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const carte = (titre, extra = {}) => ({ ...makeCard(titre), ...extra });
const colonne = (titre, cards) => ({ ...makeCol(titre), cards });
/* Un board qui avance: il porte la colonne ✅, comme le ferait un kanban */
const board = (cards) => ({
  columns: [colonne("c", cards), { ...makeCol("fini"), emoji: "✅" }],
});
/* Un board qui n'avance pas: une base, une grille, des notes */
const base = (cards) => ({ columns: [colonne("c", cards)] });

const titres = (lane) => lane.map((i) => i.card.title);

describe("weekReach", () => {
  it("glissant: sept jours, quel que soit le jour", () => {
    expect(weekReach(NOW, "rolling")).toBe(7);
    expect(weekReach(new Date(2026, 7, 30), "rolling")).toBe(7);
  });

  it("calendaire: ce qu'il reste de la semaine, dimanche compris", () => {
    expect(weekReach(new Date(2026, 7, 24), "calendar")).toBe(6); // lundi
    expect(weekReach(NOW, "calendar")).toBe(4); // mercredi
    expect(weekReach(new Date(2026, 7, 30), "calendar")).toBe(0); // dimanche
  });
});

describe("planWeek", () => {
  it("range chaque carte dans sa voie", () => {
    const b = board([
      carte("aujourd'hui", { dueAt: jour(0) }),
      carte("demain", { dueAt: jour(1) }),
      carte("dans trois jours", { dueAt: jour(3) }),
      carte("le mois prochain", { dueAt: jour(30) }),
    ]);
    const l = planWeek(b, { now: NOW });
    expect(titres(l.today)).toEqual(["aujourd'hui"]);
    expect(titres(l.tomorrow)).toEqual(["demain"]);
    expect(titres(l.week)).toEqual(["dans trois jours"]);
    expect(titres(l.later)).toEqual(["le mois prochain"]);
  });

  it("met le retard dans aujourd'hui, et le signale", () => {
    const l = planWeek(board([carte("en retard", { dueAt: jour(-5) })]), { now: NOW });
    expect(titres(l.today)).toEqual(["en retard"]);
    expect(l.today[0].overdue).toBe(true);
  });

  it("la semaine s'arrete pile a sa portee", () => {
    // Glissant un mercredi: sept jours devant, donc +7 dedans et +8 dehors
    const dedans = board([carte("dernier jour", { dueAt: jour(7) })]);
    const dehors = board([carte("un jour de trop", { dueAt: jour(8) })]);
    expect(titres(planWeek(dedans, { now: NOW, weekMode: "rolling" }).week)).toEqual(["dernier jour"]);
    expect(titres(planWeek(dehors, { now: NOW, weekMode: "rolling" }).nextWeek)).toEqual(["un jour de trop"]);
    // Calendaire le meme mercredi: dimanche (+4) dedans, lundi (+5) dehors
    const dim = board([carte("dimanche", { dueAt: jour(4) })]);
    const lun = board([carte("lundi", { dueAt: jour(5) })]);
    expect(titres(planWeek(dim, { now: NOW, weekMode: "calendar" }).week)).toEqual(["dimanche"]);
    expect(titres(planWeek(lun, { now: NOW, weekMode: "calendar" }).nextWeek)).toEqual(["lundi"]);
  });

  it("la borne de la semaine suit le reglage", () => {
    const b = board([carte("dans six jours", { dueAt: jour(6) })]);
    // Mercredi: la semaine calendaire s'arrete dimanche, soit dans 4 jours —
    // six jours tombe donc la semaine d'apres, la ou le glissant l'a encore
    expect(titres(planWeek(b, { now: NOW, weekMode: "calendar" }).nextWeek)).toEqual(["dans six jours"]);
    expect(titres(planWeek(b, { now: NOW, weekMode: "rolling" }).week)).toEqual(["dans six jours"]);
  });

  it("ignore les cartes terminees et archivees, sans cesser de descendre", () => {
    const enfant = carte("enfant date", { dueAt: jour(0) });
    const finie = carte("finie", { done: true, dueAt: jour(0) });
    finie.board = board([enfant]);
    const l = planWeek(board([finie, carte("cachee", { archived: true, dueAt: jour(0) })]), { now: NOW });
    expect(titres(l.today)).toEqual(["enfant date"]);
  });

  it("signale une branche ou rien n'est engage", () => {
    const projet = carte("projet a l'arret");
    projet.board = board([carte("tache sans date"), carte("autre tache")]);
    const l = planWeek(board([projet]), { now: NOW });
    expect(titres(l.stalled)).toEqual(["projet a l'arret"]);
  });

  it("ne signale que l'ancetre le moins profond de la branche", () => {
    const petitFils = carte("petit-fils");
    const fils = carte("fils");
    fils.board = board([petitFils]);
    const projet = carte("projet");
    projet.board = board([fils]);
    const l = planWeek(board([projet]), { now: NOW });
    expect(titres(l.stalled)).toEqual(["projet"]);
  });

  it("ne signale pas une branche qui porte une date, meme profonde", () => {
    const profond = carte("profond", { dueAt: jour(2) });
    const fils = carte("fils");
    fils.board = board([profond]);
    const projet = carte("projet");
    projet.board = board([fils]);
    const l = planWeek(board([projet]), { now: NOW });
    expect(l.stalled).toEqual([]);
    expect(titres(l.week)).toEqual(["profond"]);
  });

  it("ne signale pas une branche dans un board sans colonne ✅", () => {
    // Une base de donnees ou une grille de reflexion n'a pas d'etat final,
    // elle ne peut donc pas etre en retard dessus.
    const projet = carte("simple base");
    projet.board = base([carte("une fiche"), carte("une autre")]);
    expect(planWeek(board([projet]), { now: NOW }).stalled).toEqual([]);
  });

  it("ne signale pas une carte sans date qui ne contient rien", () => {
    // Une tache sans echeance n'est pas un projet a l'arret, c'est une tache
    const l = planWeek(board([carte("simple tache")]), { now: NOW });
    expect(l.stalled).toEqual([]);
    expect(LANES.every((k) => Array.isArray(l[k]))).toBe(true);
  });

  it("trie chaque voie par date", () => {
    const l = planWeek(board([
      carte("plus tard", { dueAt: jour(5) }),
      carte("plus tot", { dueAt: jour(2) }),
    ]), { now: NOW });
    expect(titres(l.week)).toEqual(["plus tot", "plus tard"]);
  });
});

describe("l'ordre a la main dans aujourd'hui", () => {
  it("suit le rang plutot que la date", () => {
    const b = board([
      carte("a", { dueAt: jour(0), rank: 2 }),
      carte("b", { dueAt: jour(-3), rank: 1 }), // la plus en retard, rangee 2e
      carte("c", { dueAt: jour(0), rank: 0 }),
    ]);
    expect(titres(planWeek(b, { now: NOW }).today)).toEqual(["c", "b", "a"]);
  });

  it("remonte en tete ce qui n'a jamais ete range", () => {
    // Une carte jamais placee est une carte pas encore decidee: l'enterrer
    // sous une liste faite a la main serait exactement l'oubli qu'on evite
    const b = board([
      carte("rangee", { dueAt: jour(0), rank: 0 }),
      carte("nouvelle", { dueAt: jour(0) }),
    ]);
    expect(titres(planWeek(b, { now: NOW }).today)).toEqual(["nouvelle", "rangee"]);
  });

  it("departage deux cartes non rangees par leur date", () => {
    const b = board([
      carte("aujourd'hui", { dueAt: jour(0) }),
      carte("en retard", { dueAt: jour(-2) }),
    ]);
    expect(titres(planWeek(b, { now: NOW }).today)).toEqual(["en retard", "aujourd'hui"]);
  });

  it("ne touche pas aux autres voies, ou la date est l'information", () => {
    const b = board([
      carte("plus loin", { dueAt: jour(3), rank: 0 }),
      carte("plus tot", { dueAt: jour(2), rank: 9 }),
    ]);
    expect(titres(planWeek(b, { now: NOW }).week)).toEqual(["plus tot", "plus loin"]);
  });
});

describe("shortTrail", () => {
  it("laisse passer un chemin court entier", () => {
    expect(shortTrail(["Baobapp"])).toEqual(["Baobapp"]);
    expect(shortTrail(["Baobapp", "Lancement", "Marketing"])).toEqual([
      "Baobapp",
      "Lancement",
      "Marketing",
    ]);
  });

  it("garde les deux bouts et coupe le milieu", () => {
    // Le projet et le board d'accueil: le reste se devine, pas eux
    expect(shortTrail(["Baobapp", "Lancement", "Presse", "Marketing"])).toEqual([
      "Baobapp",
      "\u2026",
      "Marketing",
    ]);
  });

  it("reste a trois pas quelle que soit la profondeur", () => {
    const profond = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shortTrail(profond)).toEqual(["a", "\u2026", "g"]);
  });

  it("ne touche pas au tableau recu", () => {
    const steps = ["a", "b", "c", "d"];
    shortTrail(steps);
    expect(steps).toEqual(["a", "b", "c", "d"]);
  });
});

describe("reorderEntries", () => {
  /* Trois cartes de trois boards differents, comme dans la vraie voie */
  const item = (id, chemin) => ({
    card: { ...makeCard(id), id },
    colId: `col-${id}`,
    path: chemin,
  });
  const voie = [
    item("a", []),
    item("b", [{ colId: "c1", cardId: "p1", cardTitle: "Projets" }]),
    item("c", []),
  ];

  it("renumerote toute la voie, pas seulement la carte deplacee", () => {
    // Un rang ne veut rien dire seul: c'est l'echelle entiere qui est ecrite
    const e = reorderEntries(voie, 2, 0);
    expect(e.map((x) => x.cardId)).toEqual(["c", "a", "b"]);
    expect(e).toHaveLength(3);
  });

  it("garde le chemin de chaque carte, qui vit sur son propre board", () => {
    const e = reorderEntries(voie, 0, 2);
    expect(e.map((x) => x.cardId)).toEqual(["b", "c", "a"]);
    expect(e[0].segments).toEqual([{ colId: "c1", cardId: "p1" }]);
    expect(e[0].colId).toBe("col-b");
    // Le titre du parent ne sert qu'a l'affichage: il ne part pas en base
    expect(e[0].segments[0]).not.toHaveProperty("cardTitle");
  });

  it("ne touche pas a la liste recue", () => {
    reorderEntries(voie, 0, 2);
    expect(voie.map((x) => x.card.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupByBoard", () => {
  it("keeps the source column name and emoji in flat entries and groups", () => {
    const source = board([carte("task", { dueAt: jour(1) })]);
    source.columns[0].title = "À préparer";
    source.columns[0].emoji = "📝";
    const items = planWeek(source, { now: NOW }).tomorrow;
    expect(items[0]).toMatchObject({ colTitle: "À préparer", colEmoji: "📝" });
    expect(groupByBoard(items, "Root")[0]).toMatchObject({ colTitle: "À préparer", colEmoji: "📝" });
  });
  it("regroupe par board d'origine en gardant l'ordre d'arrivee", () => {
    const A = [{ colId: "c1", cardId: "a" }];
    const B = [{ colId: "c2", cardId: "b" }];
    const items = [
      { card: { title: "1" }, colId: "x", colTitle: "X", path: A },
      { card: { title: "2" }, colId: "y", colTitle: "Y", path: B },
      { card: { title: "3" }, colId: "x", colTitle: "X", path: A },
    ];
    const g = groupByBoard(items, "Root");
    expect(g).toHaveLength(2);
    expect(g[0].items.map((i) => i.card.title)).toEqual(["1", "3"]);
    expect(g[1].items.map((i) => i.card.title)).toEqual(["2"]);
  });

  it("rend le chemin entier, racine comprise", () => {
    const chemin = [
      { colId: "c1", cardId: "a", cardTitle: "Projet" },
      { colId: "c2", cardId: "b", cardTitle: "Marketing" },
    ];
    const g = groupByBoard([{ card: {}, colId: "x", colTitle: "X", path: chemin }], "Root");
    expect(g[0].trail).toEqual(["Root", "Projet", "Marketing"]);
  });

  it("nomme la racine par son libelle quand la carte y vit", () => {
    const g = groupByBoard([{ card: {}, colId: "x", colTitle: "X", path: [] }], "Root");
    expect(g[0].trail).toEqual(["Root"]);
  });
});

describe("la voie semaine prochaine", () => {
  it("s'intercale entre cette semaine et plus tard", () => {
    // Glissant un mercredi: semaine +2..+7, semaine prochaine +8..+14
    const b = board([
      carte("dans sept", { dueAt: jour(7) }),
      carte("dans huit", { dueAt: jour(8) }),
      carte("dans quatorze", { dueAt: jour(14) }),
      carte("dans quinze", { dueAt: jour(15) }),
    ]);
    const l = planWeek(b, { now: NOW, weekMode: "rolling" });
    expect(titres(l.week)).toEqual(["dans sept"]);
    expect(titres(l.nextWeek)).toEqual(["dans huit", "dans quatorze"]);
    expect(titres(l.later)).toEqual(["dans quinze"]);
  });

  it("suit la semaine calendaire quand c'est le reglage", () => {
    // Mercredi: cette semaine s'arrete dimanche (+4), la prochaine au +11
    const l = planWeek(board([
      carte("dimanche", { dueAt: jour(4) }),
      carte("lundi prochain", { dueAt: jour(5) }),
      carte("dimanche prochain", { dueAt: jour(11) }),
      carte("lundi d'apres", { dueAt: jour(12) }),
    ]), { now: NOW, weekMode: "calendar" });
    expect(titres(l.week)).toEqual(["dimanche"]);
    expect(titres(l.nextWeek)).toEqual(["lundi prochain", "dimanche prochain"]);
    expect(titres(l.later)).toEqual(["lundi d'apres"]);
  });
});

describe("dateForLane", () => {
  const opts = { now: NOW, weekMode: "rolling" };

  it("aujourd'hui et demain sont sans ambiguite", () => {
    expect(dateForLane("today", null, opts)).toBe(jour(0));
    expect(dateForLane("tomorrow", jour(20), opts)).toBe(jour(1));
  });

  it("laisse la date tranquille quand elle est deja dans la voie", () => {
    // Ranger une carte de mardi ne doit pas l'ecraser sur dimanche
    expect(dateForLane("week", jour(3), opts)).toBe(jour(3));
    expect(dateForLane("nextWeek", jour(10), opts)).toBe(jour(10));
    expect(dateForLane("later", jour(60), opts)).toBe(jour(60));
  });

  it("sinon pose le vendredi de la voie, pas son dernier jour", () => {
    // NOW est un mercredi: le vendredi tombe a +2, le suivant a +9
    expect(dateForLane("week", jour(30), opts)).toBe(jour(2));
    expect(dateForLane("nextWeek", null, opts)).toBe(jour(9));
    expect(new Date(`${dateForLane("week", null, opts)}T12:00:00`).getDay()).toBe(5);
    expect(new Date(`${dateForLane("nextWeek", null, opts)}T12:00:00`).getDay()).toBe(5);
    // Plus tard reste un horizon, pas un jour ouvre
    expect(dateForLane("later", jour(1), opts)).toBe(jour(30));
  });

  it("vise le meme vendredi quel que soit le reglage de semaine", () => {
    const cal = { now: NOW, weekMode: "calendar" };
    expect(dateForLane("week", null, cal)).toBe(jour(2));
    expect(dateForLane("nextWeek", null, cal)).toBe(jour(9));
  });

  it("refuse la voie de l'arret: on n'y depose pas, elle se constate", () => {
    expect(dateForLane("stalled", jour(2), opts)).toBeUndefined();
  });

  it("retombe sur le bout de la voie quand plus aucun vendredi n'y tient", () => {
    // Un jeudi, le vendredi calendaire est deja "demain": la voie ne va plus
    // que jusqu'a dimanche, et c'est la seule reponse honnete.
    const jeu = { now: new Date(2026, 7, 27), weekMode: "calendar" };
    expect(dateForLane("week", null, jeu)).toBe("2026-08-30"); // dimanche
    // Un dimanche, la semaine calendaire ne va plus nulle part
    const dim = { now: new Date(2026, 7, 30), weekMode: "calendar" };
    expect(dateForLane("week", null, dim)).toBe("2026-09-01");
  });
});
