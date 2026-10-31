import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, runTransaction, terminate } from "firebase/firestore";
import { mergeBoardState, encodeBoard } from "../src/lib/board-sync.ts";

// Fail closed: this script must never discover real credentials or a real DB.
assert.equal(process.env.GCLOUD_PROJECT, "demo-oshka");
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(new URL("../functions/package.json", import.meta.url));
// The Functions and src/lib import each other without extensions, as their
// bundler allows; Node only finds those files once told to try ".ts".
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || error.code !== "ERR_MODULE_NOT_FOUND") throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const adminApp = initializeAdmin({ projectId: "demo-oshka" });
const adminDb = getFirestore(adminApp);
const clients = [];
async function client(name, signedIn = true) {
  const app = initializeApp({ projectId: "demo-oshka", apiKey: "demo-key" }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = initializeFirestore(app, {});
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  connectFirestoreEmulator(db, host, Number(port));
  clients.push({ app, db });
  if (signedIn) await createUserWithEmailAndPassword(auth, `${name}-${Date.now()}@oshka.test`, "emulator-test-only");
  return { db, uid: auth.currentUser?.uid };
}

try {
  const owner = await client("owner"), other = await client("other"), anonymous = await client("unsigned", false);
  const base = { root: { columns: [], inbox: [], labels: [] }, trash: [], favorites: [], settings: {} };
  const ref = doc(owner.db, "boards", owner.uid);
  await setDoc(ref, encodeBoard(base));
  assert.equal((await getDoc(ref)).exists(), true);
  await assert.rejects(getDoc(doc(other.db, "boards", owner.uid)), { code: "permission-denied" });
  await assert.rejects(setDoc(doc(other.db, "boards", owner.uid), encodeBoard(base)), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(anonymous.db, "boards", owner.uid)), { code: "permission-denied" });
  for (const collection of ["mcp_clients", "mcp_requests", "mcp_grants", "mcp_tokens", "gmail_links", "gmail_link_codes", "slack_links", "slack_link_codes"]) {
    await assert.rejects(getDoc(doc(owner.db, collection, "private")), { code: "permission-denied" });
    await assert.rejects(setDoc(doc(owner.db, collection, "private"), { uid: owner.uid }), { code: "permission-denied" });
  }

  const local = structuredClone(base);
  local.root.inbox.push({ id: "local", title: "Local draft", board: { columns: [] } });
  const adminRef = adminDb.collection("boards").doc(owner.uid);
  // A real server-side capture occurs after the client's base snapshot.
  const { createGmailStore } = await import("../functions/gmail/store.ts");
  const gmail = createGmailStore(adminDb);
  const token = await gmail.connect(await gmail.createCode(owner.uid));
  const mail = { mailbox: "owner@oshka.test", messageId: "a123", threadId: "a123", title: "Gmail capture", sender: "sender", excerpt: "Synthetic test", sentAt: "", url: "https://mail.google.com/mail/#inbox/a123" };
  assert.equal((await gmail.capture(token, mail)).duplicate, false);
  await runTransaction(owner.db, async (tx) => {
    const data = (await tx.get(ref)).data();
    const remote = { root: JSON.parse(data.boardJson), trash: JSON.parse(data.trashJson), favorites: data.favorites, settings: data.settings };
    tx.set(ref, encodeBoard(mergeBoardState(base, local, remote)), { merge: true });
  });
  const saved = JSON.parse((await adminRef.get()).data().boardJson);
  assert.deepEqual(saved.inbox.map((c) => c.title).sort(), ["Gmail capture", "Local draft"]);
  assert.equal((await gmail.capture(token, mail)).duplicate, true);
  await gmail.disconnect(owner.uid);
  await assert.rejects(gmail.capture(token, mail), { code: "not_connected" });

  const { createProvider } = await import("../functions/mcp/oauth.ts");
  const provider = createProvider({ firebaseConfig: null });
  await assert.rejects(provider.clientsStore.registerClient({ client_id: "bad", redirect_uris: ["https://attacker.invalid/callback"] }));
  await provider.clientsStore.registerClient({ client_id: "local-test", redirect_uris: ["http://127.0.0.1:12345/callback"] });
  assert.equal((await provider.clientsStore.getClient("local-test")).client_id, "local-test");
  await assert.rejects(provider.verifyAccessToken("invalid-token"));
  console.log("PASS: account isolation, private collections, transactional Gmail capture, deduplication, revocation and OAuth checks (emulators only).");
} finally {
  await Promise.all(clients.map(async ({ db, app }) => { await terminate(db); await deleteApp(app); }));
  await adminDb.terminate(); await deleteAdmin(adminApp);
}
