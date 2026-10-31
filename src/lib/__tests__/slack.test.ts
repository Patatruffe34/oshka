import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createSlackApp } from "../../../functions/slack/app";
import { createStore, type SlackStore } from "../../../functions/slack/store";
import { memoryFirestore, type Doc } from "./memory-firestore";

const secret = "test-signing-secret";
const owner = { team: "T1", user: "U1" };
const message = { text: "Relire le document\nhttps://example.com", ts: "1234.567890", user: "U2" };

describe("Slack account linking and capture", () => {
  let store: SlackStore, data: Map<string, Doc>;
  beforeEach(() => {
    const memory = memoryFirestore();
    data = memory.data;
    store = createStore(memory.db);
    data.set("boards/oshka-owner", { boardJson: JSON.stringify({ columns: [{ id: "existing", cards: [] }] }), settings: { keep: true } });
  });
  const prepare = (store: SlackStore) => store.prepare({ ...owner, message, channel: "C1", permalink: "https://workspace.slack.com/archives/C1/p1234567890" });
  it("links only through a valid single-use code, preserves the source, and safely replays the same submission", async () => {
    const code = await store.createCode("oshka-owner");
    const session = await prepare(store);
    expect(session.linked).toBe(false);
    const args = { ...owner, id: session.id, title: "À relire", code };
    expect(await store.capture(args)).toEqual({ duplicate: false });
    const saved = data.get("boards/oshka-owner")!;
    const board = JSON.parse(String(saved.boardJson));
    expect(board.inbox).toHaveLength(1);
    expect(board.inbox[0]).toMatchObject({ title: "À relire", source: { type: "slack", timestamp: message.ts, author: "U2" } });
    expect(board.inbox[0].description).toContain(message.text);
    expect(board.inbox[0].description).toContain("https://workspace.slack.com/archives/C1/p1234567890");
    expect(board.columns).toEqual([{ id: "existing", cards: [] }]);
    expect(saved.settings).toEqual({ keep: true });
    expect((await store.status("oshka-owner")).connected).toBe(true);
    expect(await store.capture(args)).toEqual({ duplicate: true });
    expect(JSON.parse(String(data.get("boards/oshka-owner")?.boardJson)).inbox).toHaveLength(1);
  });
  it("deduplicates a newly opened shortcut even after the original card was filed", async () => {
    const session = await prepare(store);
    await store.capture({ ...owner, id: session.id, title: "Original", code: await store.createCode("oshka-owner") });
    const saved = data.get("boards/oshka-owner")!;
    const board = JSON.parse(String(saved.boardJson));
    board.columns[0].cards.push(board.inbox.pop());
    saved.boardJson = JSON.stringify(board);
    const retry = await prepare(store);
    expect(retry.linked).toBe(true);
    expect(await store.capture({ ...owner, id: retry.id, title: "Again" })).toEqual({ duplicate: true });
    expect(JSON.parse(String(data.get("boards/oshka-owner")?.boardJson)).inbox).toEqual([]);
  });
  it("rejects expired codes, guesses of another user's session, and expired sessions without writing a card", async () => {
    const session = await prepare(store);
    const code = await store.createCode("oshka-owner");
    for (const [path, value] of data) if (path.startsWith("slack_link_codes/")) value.expiresAt = new Date(0);
    await expect(store.capture({ ...owner, id: session.id, title: "No", code })).rejects.toMatchObject({ field: "link_code" });
    await expect(store.capture({ team: "T1", user: "someone-else", id: session.id, title: "No", code })).rejects.toThrow("expiré");
    data.get(`slack_captures/${session.id}`)!.expiresAt = new Date(0);
    await expect(store.capture({ ...owner, id: session.id, title: "No" })).rejects.toThrow("expiré");
    expect(JSON.parse(String(data.get("boards/oshka-owner")?.boardJson)).inbox).toBeUndefined();
  });
  it("disconnects active links and revokes all unused connection codes", async () => {
    const session = await prepare(store);
    await store.capture({ ...owner, id: session.id, title: "One", code: await store.createCode("oshka-owner") });
    const pendingCode = await store.createCode("oshka-owner");
    await store.disconnect("oshka-owner");
    expect(await store.status("oshka-owner")).toEqual({ connected: false });
    const next = await prepare(store);
    await expect(store.capture({ ...owner, id: next.id, title: "No", code: pendingCode })).rejects.toMatchObject({ field: "link_code" });
  });
});

describe("Slack HTTP integration", () => {
  const fakeStore = () => ({ prepare: vi.fn<SlackStore["prepare"]>(async () => ({ id: "session", linked: false })), capture: vi.fn<SlackStore["capture"]>(async () => ({ duplicate: false })), createCode: vi.fn<SlackStore["createCode"]>(async () => "code"), status: vi.fn<SlackStore["status"]>(async () => ({ connected: false })), disconnect: vi.fn<SlackStore["disconnect"]>() });
  let server: Server, base: string, store: ReturnType<typeof fakeStore>;
  let slackApi: Mock<(url: string, options: RequestInit) => Promise<Response>>;
  let verifyIdToken: Mock<(token: string) => Promise<{ uid: string }>>;
  beforeEach(async () => {
    store = fakeStore();
    verifyIdToken = vi.fn(async (token: string) => { if (token !== "valid-user") throw new Error("invalid"); return { uid: "oshka-owner" }; });
    slackApi = vi.fn(async (url: string, options: RequestInit) => {
      // Slack's permalink endpoint rejects our former JSON POST with
      // invalid_arguments. Model its actual contract instead of accepting
      // every request, which used to hide this production failure.
      const address = new URL(url);
      const valid = !address.pathname.endsWith("/chat.getPermalink") || (
        options.method === "GET" && address.searchParams.get("channel") === "C1"
        && address.searchParams.get("message_ts") === message.ts && options.body === undefined
      );
      return new Response(JSON.stringify(valid
        ? { ok: true, team_id: "T1", permalink: "https://workspace.slack.com/archives/C1/p1234567890" }
        : { ok: false, error: "invalid_arguments" }), { headers: { "Content-Type": "application/json" } });
    });
    const app = createSlackApp({ signingSecret: () => secret, botToken: () => "test-bot", origin: "https://oshka.test", verifyIdToken, store, fetch: slackApi as unknown as typeof fetch });
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve())); });
  const send = (payload: unknown, { invalid = false, stale = false } = {}) => {
    const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    const timestamp = String(Math.floor(Date.now() / 1000) - (stale ? 3600 : 0));
    const signature = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
    return fetch(`${base}/integrations/slack/interactions`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Slack-Request-Timestamp": timestamp, "X-Slack-Signature": invalid ? "v0=" + "é".repeat(64) : signature } });
  };
  const shortcut = () => ({ type: "message_action", callback_id: "oshka_save_message", team: { id: "T1" }, user: { id: "U1" }, channel: { id: "C1" }, trigger_id: "trigger", message });
  it.each([{ invalid: true }, { stale: true }])("rejects forged or stale requests before making any Slack call: %s", async (options) => {
    expect((await send(shortcut(), options)).status).toBe(401);
    expect(slackApi).not.toHaveBeenCalled();
    expect(store.prepare).not.toHaveBeenCalled();
  });
  it("opens a native title/connection modal for the selected message, without posting to a channel", async () => {
    expect((await send(shortcut())).status).toBe(200);
    const call = slackApi.mock.calls.find(([url]) => url.endsWith("views.open"));
    const modal: { private_metadata: string; blocks: { block_id: string; element?: { initial_value?: string } }[] } = JSON.parse(String(call![1].body)).view;
    expect(modal.private_metadata).toBe("session");
    expect(modal.blocks.find((block) => block.block_id === "title")?.element?.initial_value).toBe("Relire le document");
    expect(modal.blocks.some((block) => block.block_id === "link_code")).toBe(true);
    expect(slackApi.mock.calls.some(([url]) => /chat.postMessage|response_url/.test(url))).toBe(false);
  });
  it("requests the message permalink with GET query parameters required by Slack", async () => {
    expect((await send(shortcut())).status).toBe(200);
    const call = slackApi.mock.calls.find(([url]) => new URL(url).pathname.endsWith("/chat.getPermalink"));
    expect(new URL(call![0]).searchParams.get("message_ts")).toBe(message.ts);
    expect(call![1].method).toBe("GET");
    expect(call![1].body).toBeUndefined();
  });
  it("does not accept actions from a different workspace using this app", async () => {
    const payload = shortcut(); payload.team.id = "another-team";
    expect((await send(payload)).status).toBe(403);
    expect(store.prepare).not.toHaveBeenCalled();
  });
  it("logs the failing API method and code without logging Slack response content", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = slackApi.getMockImplementation();
    slackApi.mockImplementation(async (url, options) => url.endsWith("views.open")
      ? new Response(JSON.stringify({ ok: false, error: "invalid_arguments", response_metadata: { messages: ["private message content"] } }))
      : original!(url, options));
    try {
      expect((await send(shortcut())).status).toBe(503);
      expect(log).toHaveBeenCalledWith("Slack interaction failed:", { name: "SlackApiError", method: "views.open", code: "invalid_arguments" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private message content");
    } finally { log.mockRestore(); }
  });
  it("saves on confirmation and returns a private confirmation modal", async () => {
    const response = await send({ type: "view_submission", team: { id: "T1" }, user: { id: "U1" }, view: { callback_id: "oshka_capture", private_metadata: "session", state: { values: { title: { value: { value: "Task" } }, link_code: { value: { value: "connection-code" } } } } } });
    const result = await response.json();
    expect(store.capture).toHaveBeenCalledWith({ ...owner, id: "session", title: "Task", code: "connection-code" });
    expect(result.response_action).toBe("update");
    expect(result.view.blocks[0].text.text).toContain("ajoutée");
  });
  it("requires a Firebase session to issue or revoke connection codes", async () => {
    expect((await fetch(`${base}/integrations/slack/link-code`, { method: "POST" })).status).toBe(401);
    expect(store.createCode).not.toHaveBeenCalled();
    const response = await fetch(`${base}/integrations/slack/link-code`, { method: "POST", headers: { Authorization: "Bearer valid-user" } });
    expect(response.status).toBe(200);
    expect(store.createCode).toHaveBeenCalledWith("oshka-owner");
    expect((await fetch(`${base}/integrations/slack/link`, { method: "DELETE", headers: { Authorization: "Bearer invalid-user" } })).status).toBe(401);
    expect(store.disconnect).not.toHaveBeenCalled();
  });
});
