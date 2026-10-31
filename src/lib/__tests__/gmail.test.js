import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createGmailStore } from "../../../functions/gmail/store";
import { createGmailApp, normalizeMail } from "../../../functions/gmail/app";
const mail = { mailbox: "Me@Example.com", messageId: "1234567890abcdef", threadId: "1234567890abcdee", title: "Relire le contrat", sender: "Alice <alice@example.com>", sentAt: "2026-10-27T12:00:00.000Z", excerpt: "Bonjour, voici le document à relire.", url: "https://mail.google.com/mail/u/0/?ui=2#inbox/1234567890abcdee" };

function memoryFirestore() {
  const data = new Map();
  const snap = (path) => ({
    exists: data.has(path),
    data: () => {
      const value = data.get(path);
      return value ? { ...value, ...(value.expiresAt instanceof Date ? { expiresAt: { toDate: () => value.expiresAt } } : {}) } : undefined;
    },
  });
  const reference = (path) => ({ path, get: async () => snap(path), set: async (value) => { data.set(path, value); } });
  const db = {
    collection: (name) => ({
      doc: (id) => reference(`${name}/${id}`),
      where: (field, _op, value) => ({ get: async () => {
        const docs = [...data].filter(([key, record]) => key.startsWith(`${name}/`) && record[field] === value).map(([key]) => ({ ref: reference(key), data: () => snap(key).data() }));
        return { docs, empty: !docs.length };
      } }),
    }),
    batch: () => {
      const removed = [];
      return { delete: (ref) => removed.push(ref.path), commit: async () => removed.forEach((path) => data.delete(path)) };
    },
    runTransaction: async (callback) => {
      const writes = [];
      const result = await callback({
        get: async (ref) => { expect(writes).toHaveLength(0); return snap(ref.path); },
        set: (ref, value) => writes.push(() => data.set(ref.path, value)),
        update: (ref, value) => writes.push(() => data.set(ref.path, { ...data.get(ref.path), ...value })),
        delete: (ref) => writes.push(() => data.delete(ref.path)),
      });
      writes.forEach((apply) => apply());
      return result;
    },
  };
  return { db, data };
}


describe("Gmail linking and Inbox capture", () => {
  let store, data;
  beforeEach(() => {
    const memory = memoryFirestore(); data = memory.data; store = createGmailStore(memory.db);
    data.set("boards/owner", { boardJson: JSON.stringify({ columns: [{ id: "existing", cards: [] }] }), settings: { untouched: true } });
    data.set("boards/other", { boardJson: JSON.stringify({ columns: [] }) });
  });
  it("exchanges a single-use code for an Inbox-only credential, keeping only hashes on the server", async () => {
    const code = await store.createCode("owner");
    const token = await store.connect(code);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await store.status("owner")).toEqual({ connected: true });
    expect(await store.status("other")).toEqual({ connected: false });
    expect([...data.keys()].some((key) => key.includes(token) || key.includes(code))).toBe(false);
    await expect(store.connect(code)).rejects.toMatchObject({ code: "invalid_code" });
    await expect(store.capture("f".repeat(64), normalizeMail(mail))).rejects.toMatchObject({ status: 401 });
  });
  it("captures the selected mail with its source and selects the correct Google account", async () => {
    const token = await store.connect(await store.createCode("owner"));
    expect(await store.capture(token, normalizeMail(mail))).toEqual({ duplicate: false });
    const saved = data.get("boards/owner"); const root = JSON.parse(saved.boardJson);
    expect(root.inbox).toHaveLength(1);
    expect(root.inbox[0]).toMatchObject({ title: mail.title, source: { type: "gmail", mailbox: "me@example.com", messageId: mail.messageId } });
    expect(root.inbox[0].description).toContain(mail.sender);
    expect(root.inbox[0].description).toContain(mail.excerpt);
    const url = new URL(root.inbox[0].source.url);
    expect(url.searchParams.get("authuser")).toBe("me@example.com");
    expect(url.pathname).toBe("/mail/");
    expect(url.hash).toBe("#inbox/1234567890abcdee");
    expect(root.columns).toEqual([{ id: "existing", cards: [] }]);
    expect(saved.settings).toEqual({ untouched: true });
    expect(JSON.parse(data.get("boards/other").boardJson).inbox).toBeUndefined();
  });
  it("captures GmailApp query permalinks without a hash or trailing slash", async () => {
    const token = await store.connect(await store.createCode("owner"));
    const queryLink = "https://mail.google.com/mail?extsrc=sync&client=docs&plid=example-thread-link";
    expect(await store.capture(token, normalizeMail({ ...mail, url: queryLink }))).toEqual({ duplicate: false });
    const card = JSON.parse(data.get("boards/owner").boardJson).inbox[0];
    const url = new URL(card.source.url);
    expect(url.pathname).toBe("/mail");
    expect(url.searchParams.get("plid")).toBe("example-thread-link");
    expect(url.searchParams.get("authuser")).toBe("me@example.com");
    expect(card.description).toContain(card.source.url);
  });
  it("deduplicates retries even after filing and after reconnecting on another device", async () => {
    const token = await store.connect(await store.createCode("owner"));
    await store.capture(token, normalizeMail(mail));
    const saved = data.get("boards/owner"), root = JSON.parse(saved.boardJson);
    root.columns[0].cards.push(root.inbox.pop()); saved.boardJson = JSON.stringify(root);
    const nextToken = await store.connect(await store.createCode("owner"));
    expect(await store.capture(nextToken, normalizeMail(mail))).toEqual({ duplicate: true });
    expect(JSON.parse(saved.boardJson).inbox).toEqual([]);
    expect(await store.capture(token, normalizeMail({ ...mail, messageId: "abcdef1234567890" }))).toEqual({ duplicate: false });
  });
  it("separates identical message IDs in different mailboxes", async () => {
    const token = await store.connect(await store.createCode("owner"));
    await store.capture(token, normalizeMail(mail));
    expect(await store.capture(token, normalizeMail({ ...mail, mailbox: "work@example.com" }))).toEqual({ duplicate: false });
    expect(JSON.parse(data.get("boards/owner").boardJson).inbox).toHaveLength(2);
  });
  it("rejects expired codes and credentials, then revokes all pending and active connections", async () => {
    const expired = await store.createCode("owner");
    for (const [key, record] of data) if (key.startsWith("gmail_link_codes/")) record.expiresAt = new Date(0);
    await expect(store.connect(expired)).rejects.toMatchObject({ code: "invalid_code" });
    const token = await store.connect(await store.createCode("owner"));
    const pending = await store.createCode("owner");
    await store.disconnect("owner");
    expect(await store.status("owner")).toEqual({ connected: false });
    await expect(store.capture(token, normalizeMail(mail))).rejects.toMatchObject({ status: 401 });
    await expect(store.connect(pending)).rejects.toMatchObject({ code: "invalid_code" });
  });
  it("does not report an expired connection as active or allow it to capture", async () => {
    const token = await store.connect(await store.createCode("owner"));
    for (const [key, record] of data) if (key.startsWith("gmail_links/")) record.expiresAt = new Date(0);
    expect(await store.status("owner")).toEqual({ connected: false });
    await expect(store.capture(token, normalizeMail(mail))).rejects.toMatchObject({ status: 401 });
  });
});

describe("Gmail HTTP boundary", () => {
  let server, base, store, logger;
  beforeEach(async () => {
    store = { status: vi.fn(async () => ({ connected: true })), createCode: vi.fn(async () => "a".repeat(32)), disconnect: vi.fn(), connect: vi.fn(async () => "b".repeat(64)), capture: vi.fn(async () => ({ duplicate: false })) };
    logger = { warn: vi.fn(), error: vi.fn() };
    const app = createGmailApp({ store, logger, verifyIdToken: async (token) => { if (token !== "firebase-user") throw new Error("invalid"); return { uid: "owner" }; } });
    await new Promise((resolve, reject) => { server = app.listen(0, "127.0.0.1", resolve); server.on("error", reject); });
    base = `http://127.0.0.1:${server.address().port}/integrations/gmail/`;
  });
  afterEach(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });
  const send = (path, body, token) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
  it("keeps account management behind Firebase authentication", async () => {
    expect((await fetch(base + "link")).status).toBe(401);
    expect((await send("link-code", {}, "b".repeat(64))).status).toBe(401);
    expect((await send("link-code", {}, "firebase-user")).status).toBe(200);
    expect(store.createCode).toHaveBeenCalledExactlyOnceWith("owner");
    expect((await fetch(base + "link", { method: "DELETE", headers: { Authorization: "Bearer firebase-user" } })).status).toBe(204);
    expect(store.disconnect).toHaveBeenCalledExactlyOnceWith("owner");
  });
  it("validates codes and returns credentials without allowing caching", async () => {
    expect((await send("connect", { code: "guess" })).status).toBe(400);
    expect(store.connect).not.toHaveBeenCalled();
    const response = await send("connect", { code: "A".repeat(32) });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ token: "b".repeat(64) });
    expect(store.connect).toHaveBeenCalledExactlyOnceWith("a".repeat(32));
  });
  it("passes only bounded, validated mail fields and never trusts a caller's target uid", async () => {
    expect((await send("capture", mail)).status).toBe(401);
    expect(store.capture).not.toHaveBeenCalled();
    expect((await send("capture", { ...mail, uid: "other", attachments: ["ignore"] }, "b".repeat(64))).status).toBe(200);
    expect(store.capture).toHaveBeenCalledExactlyOnceWith("b".repeat(64), normalizeMail(mail));
  });
  it.each([
    "https://mail.google.com/mail?extsrc=sync&client=docs&plid=example-thread-link",
    "https://mail.google.com/mail/?extsrc=sync&client=docs&plid=example-thread-link",
    "https://mail.google.com/mail/u/1/?view=pt&th=1234567890abcdee",
  ])("accepts Gmail query permalinks at the HTTP boundary: %s", async (url) => {
    const response = await send("capture", { ...mail, url }, "b".repeat(64));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ duplicate: false });
    const savedUrl = new URL(store.capture.mock.calls[0][1].url);
    expect(savedUrl.searchParams.get("authuser")).toBe("me@example.com");
    expect(savedUrl.searchParams.get("plid") || savedUrl.searchParams.get("th")).toBeTruthy();
  });
  it("logs only the refused field, without exposing mail content or credentials", async () => {
    expect((await send("capture", { ...mail, url: "https://other.example/mail/#secret" }, "b".repeat(64))).status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith("Gmail request rejected", { status: 400, code: "invalid_mail", field: "url" });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(mail.mailbox);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(mail.title);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("Bearer");
  });
  it.each([
    { url: "https://mail.google.com/mail" }, { url: "https://mail.google.com/mail?unrelated=value" },
    { url: "https://mail.google.com/mail/other?plid=example" },
    { url: "javascript:alert(1)" }, { url: "https://mail.google.com.evil.test/mail/#inbox/123" },
    { url: "https://user:password@mail.google.com/mail/#inbox/123" },
    { title: "" }, { title: "a".repeat(1001) }, { excerpt: "a".repeat(1501) }, { mailbox: "invalid" }, { messageId: "../../owner" },
  ])("rejects malformed captures without storing a card: %s", async (patch) => {
    expect((await send("capture", { ...mail, ...patch }, "b".repeat(64))).status).toBe(400);
    expect(store.capture).not.toHaveBeenCalled();
  });
});
