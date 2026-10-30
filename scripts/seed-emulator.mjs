/**
 * A test account and a demo board to try things on, in the local emulators only.
 *
 * Run with the emulators up (the "dev-local" launch configuration starts them):
 *
 *   npm run seed:local
 *
 * then sign in on http://localhost:5174 with the account below. Running it
 * again resets the board. Nothing here can reach the real project: the
 * addresses are the emulators', and "demo-oshka" is not a project that exists.
 */

const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-oshka/databases/(default)/documents";

export const TEST_ACCOUNT = { email: "test@oshka.test", password: "oshka-local-test" };

let n = 0;
const id = () => `seed${++n}`;

/*
 * The demo tree, in English: it is also what the README screenshots show, so
 * it is written to look like a real life — several levels deep, dates spread
 * over every Agenda lane, and a couple of branches at a standstill.
 */
const LABELS = {
  work: { id: "label-work", name: "Work", color: "blue" },
  home: { id: "label-home", name: "Home", color: "green" },
  health: { id: "label-health", name: "Health", color: "red" },
  admin: { id: "label-admin", name: "Admin", color: "yellow" },
  fun: { id: "label-fun", name: "Fun", color: "pink" },
  idea: { id: "label-idea", name: "Idea", color: "violet" },
};

const card = (title, extra = {}) => ({
  id: id(),
  title,
  description: "",
  comments: [],
  done: false,
  doneAt: null,
  archived: false,
  labels: [],
  dueAt: null,
  repeat: null,
  checklists: [],
  board: { columns: [] },
  ...extra,
  ...(extra.labels ? { labels: extra.labels.map((l) => l.id) } : {}),
});

const done = (title, extra = {}) => card(title, { done: true, doneAt: new Date().toISOString(), ...extra });
const column = (emoji, title, color, cards) => ({ id: id(), emoji, title, color, cards });
const checklist = (title, items) => ({
  id: id(),
  title,
  items: items.map(([text, isDone]) => ({ id: id(), text, done: Boolean(isDone) })),
});
const comment = (text, daysAgo) => ({ id: id(), text, createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString() });

const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10) + "T12:00:00.000Z";

const episodeOne = card("Episode 1 — Why boards should nest", {
  dueAt: inDays(4),
  labels: [LABELS.work],
  description: "The pilot. **Thirty minutes**, one guest, one idea: a task and a project are the same thing seen from closer or further away.",
  board: {
    columns: [
      column("📝", "Outline", "blue", [
        card("Cold open: the drawer of half-finished projects"),
        card("Interview questions", {
          checklists: [checklist("Questions", [["Where do your projects live?", true], ["When does a task become a project?", true], ["What do you lose when you split them?"]])],
        }),
        card("Closing segment"),
      ]),
      column("🎙️", "Recording", "orange", [card("Book the studio", { dueAt: inDays(2) }), card("Send the guest a prep note")]),
      column("✅", "Done", "green", [done("Pick a guest"), done("Draft the intro")]),
    ],
  },
});

const podcast = card("Launch the podcast", {
  labels: [LABELS.work, LABELS.fun],
  description: "Six episodes before the launch, then one every two weeks.\n\n- Name: *Boards inside boards*\n- Format: interviews, 30 min",
  comments: [comment("Cover art draft looks great — maybe a darker background?", 2)],
  board: {
    columns: [
      column("🎧", "Episodes", "violet", [
        episodeOne,
        card("Episode 2 — The weekly review", { dueAt: inDays(11) }),
        card("Episode 3 — Inbox zero, for real", { dueAt: inDays(25) }),
      ]),
      column("🛠️", "Setup", "cyan", [
        card("Choose a hosting platform", { dueAt: inDays(1), labels: [LABELS.admin] }),
        card("Cover art", {
          checklists: [checklist("Cover", [["Moodboard", true], ["Three drafts", true], ["Final export 3000×3000"]])],
        }),
        card("Intro jingle"),
      ]),
      column("✅", "Done", "green", [done("Buy a microphone"), done("Name the show")]),
    ],
  },
});

const kitchen = card("Renovate the kitchen", {
  labels: [LABELS.home],
  board: {
    columns: [
      column("📐", "Plan", "blue", [card("Measure the walls"), card("Choose the worktop"), card("Get three quotes")]),
      column("🧱", "Works", "orange", [card("Remove the old cabinets"), card("Electrics")]),
      column("✅", "Done", "green", [done("Pick a colour")]),
    ],
  },
});

const japan = card("Trip to Japan", {
  labels: [LABELS.fun],
  dueAt: inDays(45),
  description: "Two weeks in April. Tokyo → Kyoto → Osaka.",
  board: {
    columns: [
      column("🧳", "Before leaving", "blue", [
        card("Renew passport", { dueAt: inDays(3), labels: [LABELS.admin] }),
        card("Book the flights", { dueAt: inDays(9) }),
        card("Rail pass"),
      ]),
      column("🗾", "Itinerary", "violet", [
        card("Tokyo", { board: { columns: [column("📍", "Places", "pink", [card("Shimokitazawa"), card("Yanaka"), card("teamLab")])] } }),
        card("Kyoto"),
        card("Osaka"),
      ]),
      column("✅", "Done", "green", [done("Ask for time off")]),
    ],
  },
});

const website = card("Personal website", {
  labels: [LABELS.idea],
  board: {
    columns: [
      column("📝", "Pages", "blue", [card("Home"), card("Writing"), card("About")]),
      column("✅", "Done", "green", [done("Buy the domain")]),
    ],
  },
});

const root = {
  labels: Object.values(LABELS),
  columns: [
    column("📥", "Next up", "blue", [
      podcast,
      card("Call the accountant", { dueAt: inDays(-1), labels: [LABELS.admin] }),
      card("Weekly review", { dueAt: inDays(0), repeat: { every: 1, unit: "week" } }),
      card("Dentist appointment", { dueAt: inDays(1), labels: [LABELS.health] }),
      card("Reply to Sam about the conference", { dueAt: inDays(0), labels: [LABELS.work] }),
    ]),
    column("🔨", "In progress", "orange", [
      japan,
      kitchen,
      card("Run a half marathon", {
        dueAt: inDays(60),
        labels: [LABELS.health],
        checklists: [checklist("Training", [["Run 3× a week", true], ["10 km under an hour", true], ["Long run: 18 km"], ["Register"]])],
      }),
      card("Water the plants", { dueAt: inDays(5), repeat: { every: 1, unit: "week" }, labels: [LABELS.home] }),
    ]),
    column("✅", "Done", "green", [done("File the tax return", { labels: [LABELS.admin] }), done("Fix the bike")]),
    column("💡", "Someday", "violet", [website, card("Learn to make bread", { labels: [LABELS.fun] }), card("Write a short story", { labels: [LABELS.idea] })]),
  ],
  inbox: [
    card("https://example.com/the-art-of-the-weekly-review", { description: "Shared from Safari" }),
    card("Gift idea for Alex: a film camera"),
    card("Podcast guest: ask Maya?"),
  ],
};

/*
 * Always the same uid. The browser keeps its session across restarts while
 * the emulator forgets every account, so a fresh uid each time left you signed
 * in as someone who no longer existed — on an empty board of their own.
 */
const UID = "oshka-test-user";

const admin = (path, body) =>
  fetch(`${AUTH}/projects/demo-oshka/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify(body),
  });

const account = async () => {
  // The email may be held by an account from an older seed, under another uid
  const found = await (await admin("accounts:lookup", { email: [TEST_ACCOUNT.email] })).json();
  for (const user of found.users ?? []) {
    if (user.localId !== UID) await admin("accounts:delete", { localId: user.localId });
  }
  if (found.users?.some((u) => u.localId === UID)) return UID;
  const res = await admin("accounts", { localId: UID, ...TEST_ACCOUNT });
  if (!res.ok) throw new Error(`Test account: ${await res.text()}`);
  return UID;
};

const uid = await account();
const res = await fetch(`${FIRESTORE}/boards/${uid}`, {
  method: "PATCH",
  // The emulator's admin token: writes past the security rules
  headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
  body: JSON.stringify({
    fields: {
      boardJson: { stringValue: JSON.stringify(root) },
      trashJson: { stringValue: "[]" },
      favorites: { arrayValue: {} },
      settings: { mapValue: { fields: {} } },
    },
  }),
});
if (!res.ok) throw new Error(await res.text());
console.log(`Demo board ready — ${TEST_ACCOUNT.email} on http://localhost:5174`);
