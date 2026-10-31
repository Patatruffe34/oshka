import fs from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeMail } from "../../../functions/gmail/app";

const source = fs.readFileSync(new URL("../../../integrations/gmail/Code.gs", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../../../integrations/gmail/appsscript.json", import.meta.url), "utf8"));
const id = "1234567890abcdef";
const contextualId = "msg-f:" + BigInt("0x" + id).toString();
const event = (inputs = {}) => ({ gmail: { messageId: contextualId, accessToken: "current-message-token" }, commonEventObject: { hostApp: "GMAIL", platform: "WEB", formInputs: Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, { stringInputs: { value: [value] } }])) } });

// Read parameters from the actual rendered action, as Gmail does on click.
function parametersFrom(card) {
  if (!card || typeof card !== "object") return null;
  if (card.method === "setParameters") return card.value;
  for (const value of Object.values(card)) {
    const found = parametersFrom(value);
    if (found) return found;
  }
  return null;
}

// Model the documented CardService calls rather than accepting arbitrary methods.
function cardService() {
  const methods = {
    CardBuilder: ["setHeader", "addSection"], CardHeader: ["setTitle", "setSubtitle", "setImageUrl"],
    CardSection: ["addWidget"], TextParagraph: ["setText"], DecoratedText: ["setTopLabel", "setText", "setWrapText"],
    TextButton: ["setText", "setTextButtonStyle", "setOnClickAction", "setOpenLink"],
    TextInput: ["setFieldName", "setTitle", "setValue", "setMultiline"], OpenLink: ["setUrl"],
    Action: ["setFunctionName", "setLoadIndicator", "setParameters"], ActionResponseBuilder: ["setNavigation", "setNotification"],
    Navigation: ["updateCard"], Notification: ["setText"],
  };
  return { ...Object.fromEntries(Object.entries(methods).map(([type, allowed]) => ["new" + type, () => {
    const node = { type, calls: [] };
    const builder = { node, build: () => node };
    for (const method of allowed) builder[method] = (value) => { node.calls.push({ method, value: value?.node || value }); return builder; };
    return builder;
  }])), TextButtonStyle: { FILLED: "FILLED" }, LoadIndicator: { SPINNER: "SPINNER" } };
}

describe("Gmail automatic capture", () => {
  let context, properties, fetchApi, getMessage;
  const respond = (body, status = 200) => ({ getResponseCode: () => status, getContentText: () => JSON.stringify(body) });
  const clickRetry = (card) => ({ ...event(), commonEventObject: { ...event().commonEventObject, parameters: parametersFrom(card) } });
  beforeEach(() => {
    properties = new Map();
    const captured = new Set();
    fetchApi = vi.fn((_url, options) => {
      if (!options.headers) return respond({ token: "a".repeat(64) });
      // Exercise the producer against the actual backend's mail contract,
      // including the query-only permalink returned by GmailApp.
      const mail = normalizeMail(JSON.parse(options.payload));
      const key = mail.mailbox + ":" + mail.messageId;
      const duplicate = captured.has(key); captured.add(key);
      return respond({ duplicate });
    });
    getMessage = vi.fn(() => ({
      getId: () => id, getThread: () => ({ getId: () => "abcdef1234567890", getPermalink: () => "https://mail.google.com/mail?extsrc=sync&client=docs&plid=example-thread-link" }),
      getSubject: () => "Un <objet> & une idée", getFrom: () => "Alice <alice@example.com>", getDate: () => new Date("2026-10-27T12:00:00Z"), getPlainBody: () => "Un extrait <img src=x>\n" + "x".repeat(2000),
    }));
    context = vm.createContext({ CardService: cardService(), GmailApp: { setCurrentMessageAccessToken: vi.fn(), getMessageById: getMessage }, Session: { getActiveUser: () => ({ getEmail: () => "me@example.com" }) }, PropertiesService: { getUserProperties: () => ({ getProperty: (key) => properties.get(key), setProperty: (key, value) => properties.set(key, value), deleteProperty: (key) => properties.delete(key) }) }, UrlFetchApp: { fetch: fetchApi } });
    vm.runInContext(source, context, { filename: "Code.gs" });
  });
  it("shows the connection form without reading or capturing before linking", () => {
    expect(JSON.stringify(context.onGmailMessageOpen(event()))).toContain("Connecter Gmail à Oshka");
    expect(getMessage).not.toHaveBeenCalled();
    expect(fetchApi).not.toHaveBeenCalled();
  });
  it("does not capture anything from the homepage without a message context", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    expect(JSON.stringify(context.onGmailHomepage())).toContain("automatique");
    expect(getMessage).not.toHaveBeenCalled();
    expect(fetchApi).not.toHaveBeenCalled();
  });
  it("links once and immediately captures the current email after connecting", () => {
    context.connectOshka(event({ code: "bad" }));
    expect(fetchApi).not.toHaveBeenCalled();
    const response = context.connectOshka(event({ code: "B".repeat(32) }));
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(fetchApi.mock.calls[0][0]).toMatch(/\/integrations\/gmail\/connect$/);
    expect(JSON.parse(fetchApi.mock.calls[0][1].payload)).toEqual({ code: "b".repeat(32) });
    expect(properties.get("oshka_inbox_token_v1")).toBe("a".repeat(64));
    expect(JSON.stringify(response)).toContain("Ajouté à l’Inbox");
    expect(JSON.stringify(response)).toContain("automatique");
    expect(JSON.stringify(response)).not.toContain('"setFieldName","value":"title"');
  });
  it.each(["contextual", "hex"])("captures on module opening with a %s event ID and no form or second click", (format) => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    const opened = event(); if (format === "hex") opened.gmail.messageId = id;
    const result = context.onGmailMessageOpen(opened);
    expect(fetchApi).toHaveBeenCalledTimes(1);
    const [url, options] = fetchApi.mock.calls[0];
    expect(url).toMatch(/\/integrations\/gmail\/capture$/);
    expect(options.headers).toEqual({ Authorization: "Bearer " + "a".repeat(64) });
    const payload = JSON.parse(options.payload);
    expect(payload).toMatchObject({ title: "Un <objet> & une idée", messageId: id, mailbox: "me@example.com", sender: "Alice <alice@example.com>" });
    expect(payload.excerpt).toHaveLength(500);
    expect(JSON.stringify(payload)).not.toContain("current-message-token");
    expect(getMessage).toHaveBeenLastCalledWith(opened.gmail.messageId);
    expect(result.type).toBe("CardBuilder"); // A contextual trigger must return a Card.
    expect(JSON.stringify(result)).toContain("Ajouté à l’Inbox");
    expect(JSON.stringify(result)).not.toContain("<objet>");
    expect(JSON.stringify(result)).not.toContain("<img src=x>");
    expect(parametersFrom(result)).toBeNull();
  });
  it("captures each newly consulted message while the panel stays open, without duplicating reopens", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    expect(JSON.stringify(context.onGmailMessageOpen(event()))).toContain("Ajouté à l’Inbox");
    expect(JSON.stringify(context.onGmailMessageOpen(event()))).toContain("Déjà enregistré");
    const selected = getMessage(); getMessage.mockClear();
    getMessage.mockReturnValue({ ...selected, getId: () => "abcdef1234567890" });
    const next = event(); next.gmail.messageId = "msg-f:1234567890123456789";
    expect(JSON.stringify(context.onGmailMessageOpen(next))).toContain("Ajouté à l’Inbox");
    expect(fetchApi).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchApi.mock.calls[2][1].payload).messageId).toBe("abcdef1234567890");
  });
  it("shows a safe retry action when capture fails, and succeeds without an edit form", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    fetchApi.mockImplementationOnce(() => { throw new Error("network"); });
    const card = context.onGmailMessageOpen(event());
    expect(JSON.stringify(card)).toContain("n’a pas pu être confirmé");
    expect(JSON.stringify(card)).toContain("Réessayer");
    const result = context.saveMailToOshka(clickRetry(card));
    expect(result.type).toBe("ActionResponseBuilder");
    expect(JSON.stringify(result)).toContain("Ajouté à l’Inbox");
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchApi.mock.calls[1][1].payload).title).toBe("Un <objet> & une idée");
  });
  it("does not retry an obsolete card after the selected message changes", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    fetchApi.mockImplementationOnce(() => { throw new Error("network"); });
    const retry = clickRetry(context.onGmailMessageOpen(event())); fetchApi.mockClear();
    const selected = getMessage(); getMessage.mockReturnValue({ ...selected, getId: () => "abcdef1234567890" });
    retry.gmail.messageId = "msg-f:1234567890123456789";
    expect(JSON.stringify(context.saveMailToOshka(retry))).toContain("sélectionné a changé");
    expect(fetchApi).not.toHaveBeenCalled();
  });
  it("supports the original Apps Script parameter location on retries", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    fetchApi.mockImplementationOnce(() => { throw new Error("network"); });
    const retry = clickRetry(context.onGmailMessageOpen(event()));
    retry.parameters = retry.commonEventObject.parameters; delete retry.commonEventObject.parameters;
    expect(JSON.stringify(context.saveMailToOshka(retry))).toContain("Ajouté à l’Inbox");
  });
  it("refuses a retry with no message binding before reading or capturing", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    expect(JSON.stringify(context.saveMailToOshka(event()))).toContain("Réouvre");
    expect(getMessage).not.toHaveBeenCalled();
    expect(fetchApi).not.toHaveBeenCalled();
  });
  it("asks for reconnection after revocation, and does not claim a successful capture", () => {
    properties.set("oshka_inbox_token_v1", "a".repeat(64));
    fetchApi.mockReturnValue(respond({}, 401));
    const result = context.onGmailMessageOpen(event());
    expect(JSON.stringify(result)).toContain("connexion a expiré");
    expect(JSON.stringify(result)).not.toContain("Ajouté à l’Inbox");
    expect(properties.has("oshka_inbox_token_v1")).toBe(false);
  });
  it("keeps current-message-only permissions and the same Oshka endpoint", () => {
    expect(manifest.oauthScopes).toContain("https://www.googleapis.com/auth/gmail.addons.current.message.readonly");
    expect(manifest.oauthScopes).not.toContain("https://mail.google.com/");
    expect(manifest.oauthScopes).not.toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(manifest.urlFetchWhitelist).toEqual(["https://<project>.web.app/integrations/gmail/"]);
    expect(manifest.addOns.gmail.contextualTriggers[0].onTriggerFunction).toBe("onGmailMessageOpen");
  });
});
