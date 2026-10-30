/**
 * A test account and a board to try things on, in the local emulators only.
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
});

const column = (emoji, title, color, cards) => ({ id: id(), emoji, title, color, cards });

const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10) + "T12:00:00.000Z";

const root = {
  columns: [
    column("📥", "À faire", "blue", [
      card("Préparer la démo", { dueAt: inDays(1) }),
      card("Relire le contrat avec le client avant la signature de vendredi"),
      card("Site vitrine", {
        board: {
          columns: [
            column("📝", "Pages", "", [card("Accueil"), card("Tarifs"), card("Contact")]),
            column("✅", "Faites", "green", [card("Mentions légales", { done: true })]),
          ],
        },
      }),
      card("Appeler le comptable", { dueAt: inDays(-1) }),
      card("Commander des cartes de visite"),
      card("Mettre à jour le README"),
      card("Faire le point avec l'équipe"),
      card("Trier les mails"),
    ]),
    column("🔨", "En cours", "orange", [
      card("Refonte du tableau de bord"),
      card("Migration de la base"),
      card("Écrire l'article de blog"),
    ]),
    column("✅", "Terminé", "green", [
      card("Choisir l'hébergeur", { done: true }),
      card("Créer le dépôt", { done: true }),
    ]),
    column("💡", "Idées", "purple", [
      card("Mode hors-ligne amélioré"),
      card("Export PDF"),
      card("Thème sépia"),
    ]),
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
  if (!res.ok) throw new Error(`Compte de test : ${await res.text()}`);
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
console.log(`Board de test prêt — ${TEST_ACCOUNT.email} sur http://localhost:5174`);
