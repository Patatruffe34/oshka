const crypto = require("node:crypto");
const { makeCard, captureInboxCard } = require("../mcp/build/oshka.cjs");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const live = (data) => data?.expiresAt?.toDate() > new Date();

class GmailError extends Error {
  constructor(code, status = 400, field) { super(code); this.code = code; this.status = status; this.field = field; }
}

function createGmailStore(db) {
  const ref = (collection, id) => db.collection(collection).doc(id);
  return {
    async createCode(uid) {
      const code = crypto.randomBytes(16).toString("hex");
      await ref("gmail_link_codes", hash(code)).set({ uid, expiresAt: new Date(Date.now() + 600_000) });
      return code;
    },
    async connect(code) {
      const token = crypto.randomBytes(32).toString("hex");
      const codeRef = ref("gmail_link_codes", hash(code));
      await db.runTransaction(async (tx) => {
        const grant = await tx.get(codeRef);
        if (!grant.exists || !live(grant.data())) throw new GmailError("invalid_code");
        tx.set(ref("gmail_links", hash(token)), { uid: grant.data().uid, createdAt: new Date(), expiresAt: new Date(Date.now() + 365 * 86_400_000) });
        tx.delete(codeRef);
      });
      // The credential can only capture mail into this account's Inbox.
      // It cannot read a board or manage the user's connections.
      return token;
    },
    async status(uid) {
      const links = await db.collection("gmail_links").where("uid", "==", uid).get();
      return { connected: links.docs.some((doc) => live(doc.data())) };
    },
    async disconnect(uid) {
      const [links, codes] = await Promise.all([
        db.collection("gmail_links").where("uid", "==", uid).get(),
        db.collection("gmail_link_codes").where("uid", "==", uid).get(),
      ]);
      // Stay below Firestore's 500-write batch limit, including old devices.
      const docs = [...links.docs, ...codes.docs];
      for (let start = 0; start < docs.length; start += 450) {
        const batch = db.batch();
        for (const doc of docs.slice(start, start + 450)) batch.delete(doc.ref);
        await batch.commit();
      }
    },
    async capture(token, mail) {
      return db.runTransaction(async (tx) => {
        const linkRef = ref("gmail_links", hash(token));
        const link = await tx.get(linkRef);
        if (!link.exists || !live(link.data())) throw new GmailError("not_connected", 401);
        const uid = link.data().uid;
        const boardRef = ref("boards", uid);
        const receiptRef = ref("gmail_imports", hash(`${uid}:${mail.mailbox}:${mail.messageId}`));
        const [boardSnap, receipt] = await Promise.all([tx.get(boardRef), tx.get(receiptRef)]);
        if (!boardSnap.exists) throw new GmailError("inbox_not_ready", 409);
        if (receipt.exists) return { duplicate: true };
        const data = boardSnap.data();
        const root = data.boardJson ? JSON.parse(data.boardJson) : data.board;
        if (!root || !Array.isArray(root.columns)) throw new GmailError("inbox_not_ready", 409);
        const card = {
          ...makeCard(mail.title), capturedAt: new Date().toISOString(),
          description: [`De : ${mail.sender}`, mail.sentAt ? `Date : ${mail.sentAt}` : "", "", mail.excerpt, "", `[Ouvrir le mail dans Gmail](${mail.url})`].join("\n").trim(),
          source: { type: "gmail", mailbox: mail.mailbox, messageId: mail.messageId, threadId: mail.threadId, sender: mail.sender, sentAt: mail.sentAt, url: mail.url },
        };
        tx.update(boardRef, { boardJson: JSON.stringify(captureInboxCard(root, card)), updatedAt: new Date() });
        tx.set(receiptRef, { uid, cardId: card.id, capturedAt: new Date() });
        return { duplicate: false };
      });
    },
  };
}

module.exports = { createGmailStore, GmailError };
