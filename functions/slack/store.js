const crypto = require("node:crypto");
const { makeCard, captureInboxCard } = require("../mcp/build/oshka.cjs");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const linkId = (team, user) => hash(`${team}:${user}`);
const live = (data) => data?.expiresAt?.toDate() > new Date();

class CaptureError extends Error {
  constructor(message, field = "title") { super(message); this.field = field; }
}

function createStore(db) {
  const ref = (collection, id) => db.collection(collection).doc(id);
  return {
    async createCode(uid) {
      const code = crypto.randomBytes(16).toString("hex");
      await ref("slack_link_codes", hash(code)).set({ uid, expiresAt: new Date(Date.now() + 600_000) });
      return code;
    },
    async status(uid) {
      const links = await db.collection("slack_links").where("uid", "==", uid).get();
      return { connected: !links.empty };
    },
    async disconnect(uid) {
      // Revoke unused codes as well as active links.
      const [links, codes] = await Promise.all([
        db.collection("slack_links").where("uid", "==", uid).get(),
        db.collection("slack_link_codes").where("uid", "==", uid).get(),
      ]);
      const batch = db.batch();
      for (const doc of [...links.docs, ...codes.docs]) batch.delete(doc.ref);
      await batch.commit();
    },
    async prepare({ team, user, message, channel, permalink }) {
      const id = crypto.randomBytes(24).toString("hex");
      const [linked] = await Promise.all([
        ref("slack_links", linkId(team, user)).get(),
        ref("slack_captures", id).set({
          team, user, text: message.text || "", timestamp: message.ts,
          author: message.user || "", channel, permalink,
          expiresAt: new Date(Date.now() + 900_000),
        }),
      ]);
      return { id, linked: linked.exists };
    },
    async capture({ id, team, user, code, title }) {
      const captureRef = ref("slack_captures", id);
      const accountRef = ref("slack_links", linkId(team, user));
      // Keep linking, deduplication and board capture atomic, including retries.
      return db.runTransaction(async (tx) => {
        const [captureSnap, account] = await Promise.all([tx.get(captureRef), tx.get(accountRef)]);
        const capture = captureSnap.data();
        if (!captureSnap.exists || !live(capture) || capture.team !== team || capture.user !== user) {
          throw new CaptureError("Ce partage a expiré. Recommence depuis le message Slack.");
        }
        if (capture.completedUid) return { duplicate: true };
        let uid = account.exists ? account.data().uid : null;
        const codeRef = code ? ref("slack_link_codes", hash(code.trim().toLowerCase())) : null;
        if (codeRef) {
          const grant = await tx.get(codeRef);
          if (!grant.exists || !live(grant.data())) throw new CaptureError("Code invalide ou expiré. Génère un nouveau code dans Oshka.", "link_code");
          uid = grant.data().uid;
        }
        if (!uid) throw new CaptureError("Colle le code créé dans les paramètres d’Oshka.", "link_code");
        const boardRef = ref("boards", uid);
        const receiptRef = ref("slack_imports", hash(`${uid}:${team}:${capture.channel}:${capture.timestamp}`));
        const [boardSnap, receipt] = await Promise.all([tx.get(boardRef), tx.get(receiptRef)]);
        if (!boardSnap.exists) throw new CaptureError("Ouvre Oshka une première fois pour créer ton Inbox.");
        if (codeRef) {
          tx.delete(codeRef);
          tx.set(accountRef, { uid, team, user, linkedAt: new Date() });
        }
        if (receipt.exists) {
          tx.update(captureRef, { completedUid: uid });
          return { duplicate: true };
        }
        const data = boardSnap.data();
        const root = data.boardJson ? JSON.parse(data.boardJson) : data.board;
        if (!root || !Array.isArray(root.columns)) throw new CaptureError("Le board ne peut pas être chargé. Réessaie depuis Oshka.");
        const card = {
          ...makeCard(title), capturedAt: new Date().toISOString(),
          description: `${capture.text}\n\n[Ouvrir le message Slack](${capture.permalink})`,
          source: { type: "slack", team, channel: capture.channel, timestamp: capture.timestamp, author: capture.author, url: capture.permalink },
        };
        tx.update(boardRef, { boardJson: JSON.stringify(captureInboxCard(root, card)), updatedAt: new Date() });
        tx.set(receiptRef, { uid, cardId: card.id, capturedAt: new Date() });
        tx.update(captureRef, { completedUid: uid });
        return { duplicate: false };
      });
    },
  };
}

module.exports = { createStore, CaptureError };
