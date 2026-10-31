import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { GmailError, type GmailStore, type Mail } from "./store";
// What the middleware below leaves on a request
import type {} from "../request";

const bearer = (req: express.Request) => /^Bearer (\S+)$/.exec(req.get("Authorization") || "")?.[1];
const hex = (value: unknown, length: string | number): value is string => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);

export function normalizeMail(body: Record<string, unknown> | undefined): Mail {
  const string = (key: string, limit: number, required = true) => {
    const value = body?.[key];
    if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new GmailError("invalid_mail", 400, key);
    return value.trim();
  };
  const mailbox = string("mailbox", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) throw new GmailError("invalid_mail", 400, "mailbox");
  const messageId = string("messageId", 64), threadId = string("threadId", 64);
  if (!hex(messageId, "1,64")) throw new GmailError("invalid_mail", 400, "messageId");
  if (!hex(threadId, "1,64")) throw new GmailError("invalid_mail", 400, "threadId");
  const title = string("title", 1000), sender = string("sender", 1000, false), excerpt = string("excerpt", 1500, false), sentAt = string("sentAt", 40, false);
  if (sentAt && !Number.isFinite(Date.parse(sentAt))) throw new GmailError("invalid_mail", 400, "sentAt");
  let url;
  try { url = new URL(string("url", 2000)); } catch { throw new GmailError("invalid_mail", 400, "url"); }
  // GmailApp also returns /mail?extsrc=sync&client=docs&plid=..., without #.
  // Preserve the opaque permalink instead of assuming every link is a UI hash.
  const gmailPath = /^\/mail(?:\/u\/\d+)?\/?$/.test(url.pathname);
  const queryLink = Boolean(url.searchParams.get("plid")?.trim()) || hex(url.searchParams.get("th"), "1,64");
  if (url.protocol !== "https:" || url.hostname !== "mail.google.com" || url.port || url.username || url.password || !gmailPath || (!url.hash && !queryLink)) throw new GmailError("invalid_mail", 400, "url");
  // A Gmail permalink normally pins account /u/0/. Select the actual mailbox
  // instead, so the source stays useful when several Google accounts are open.
  url.pathname = url.pathname.replace(/^\/mail\/u\/\d+(?:\/|$)/, "/mail/");
  url.searchParams.set("authuser", mailbox);
  return { title, sender, excerpt, sentAt, mailbox, messageId, threadId, url: url.href };
}

export interface GmailAppOptions {
  verifyIdToken: (token: string) => Promise<{ uid: string }>;
  store: GmailStore;
  logger?: Pick<Console, "error" | "warn">;
}

export function createGmailApp({ verifyIdToken, store, logger = console }: GmailAppOptions) {
  const app = express();
  app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const account: RequestHandler = async (req, res, next) => {
    try {
      const token = bearer(req);
      if (!token) return res.sendStatus(401);
      req.oshkaUid = (await verifyIdToken(token)).uid;
      next();
    } catch { res.sendStatus(401); }
  };
  app.get("/integrations/gmail/link", account, async (req, res) => res.json(await store.status(req.oshkaUid!)));
  app.post("/integrations/gmail/link-code", account, async (req, res) => res.json({ code: await store.createCode(req.oshkaUid!), expiresIn: 600 }));
  app.delete("/integrations/gmail/link", account, async (req, res) => { await store.disconnect(req.oshkaUid!); res.sendStatus(204); });
  app.post("/integrations/gmail/connect", express.json({ limit: "2kb" }), async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toLowerCase() : "";
    if (!hex(code, 32)) throw new GmailError("invalid_code");
    res.json({ token: await store.connect(code) });
  });
  app.post("/integrations/gmail/capture", (req, res, next) => {
    const token = bearer(req);
    if (!hex(token, 64)) return res.sendStatus(401);
    req.gmailToken = token;
    next();
  }, express.json({ limit: "24kb" }), async (req, res) => {
    res.json(await store.capture(req.gmailToken!, normalizeMail(req.body)));
  });
  const reply: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof GmailError ? error.status : error.type === "entity.too.large" ? 413 : error instanceof SyntaxError ? 400 : 503;
    const diagnostic: { status: number; code: string; field?: string; providerCode?: number } = { status, code: error instanceof GmailError ? error.code : status === 400 ? "invalid_request" : "gmail_unavailable" };
    if (error instanceof GmailError && error.field) diagnostic.field = error.field;
    if (Number.isInteger(error.code)) diagnostic.providerCode = error.code;
    if (status >= 500) logger.error("Gmail request failed", diagnostic);
    else logger.warn("Gmail request rejected", diagnostic);
    // No mail text, link codes, request bodies or credentials in logs/errors.
    res.status(status).json({ error: error instanceof GmailError ? error.code : status === 400 ? "invalid_request" : "gmail_unavailable" });
  };
  app.use(reply);
  return app;
}
