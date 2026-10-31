import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { CaptureError, type PreparedCapture, type SlackMessage, type SlackStore } from "./store";
import { createSlackClient, SlackApiError } from "./client";
// What the middleware below leaves on a request
import type {} from "../request";

const CALLBACK = "oshka_save_message";
const MODAL = "oshka_capture";
const text = (value: string) => ({ type: "plain_text", text: value });

export function verifySignature(secret: string, body: unknown, timestamp: string | undefined, signature: string | undefined, now = Date.now()): boolean {
  if (!secret || !Buffer.isBuffer(body) || !/^\d+$/.test(timestamp || "") || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(body).digest("hex")}`;
  return typeof signature === "string" && /^v0=[a-f0-9]{64}$/.test(signature) && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function captureModal({ id, linked }: PreparedCapture, message: SlackMessage) {
  const title = (message.text || "Message Slack").replace(/<([^>|]+)\|([^>]+)>/g, "$2").split("\n")[0].slice(0, 180).trim() || "Message Slack";
  const blocks: object[] = [
    { type: "input", block_id: "title", label: text("Titre de la carte"), element: { type: "plain_text_input", action_id: "value", initial_value: title, max_length: 1000 } },
    { type: "section", text: text((message.text || "Message sans texte").slice(0, 1500)) },
  ];
  if (!linked) blocks.push({
    type: "input", block_id: "link_code", label: text("Code de connexion Oshka"),
    hint: text("Dans Oshka : Paramètres → Connexions et partage → Slack → Créer un code de connexion. Le code expire après 10 minutes."),
    element: { type: "plain_text_input", action_id: "value", min_length: 32, max_length: 32 },
  });
  return { type: "modal", callback_id: MODAL, private_metadata: id, title: text("Ajouter à Oshka"), submit: text("Ajouter à l’Inbox"), close: text("Annuler"), blocks };
}

/** The parts of an interaction payload this app reads */
interface Interaction {
  type?: string;
  callback_id?: string;
  trigger_id?: string;
  team?: { id?: unknown };
  user?: { id?: unknown };
  channel?: { id?: unknown };
  message?: SlackMessage;
  view?: {
    callback_id?: string;
    private_metadata: string;
    state?: { values?: Record<string, Record<string, { value?: string }>> };
  };
}

export interface SlackAppOptions {
  signingSecret: () => string;
  botToken: () => string;
  verifyIdToken: (token: string) => Promise<{ uid: string }>;
  store: SlackStore;
  /** The app's address, for the button back to it */
  origin: string;
  fetch?: typeof fetch;
}

export function createSlackApp({ signingSecret, botToken, verifyIdToken, store, origin, fetch: fetchImpl = fetch }: SlackAppOptions) {
  const app = express();
  app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  let teamPromise: Promise<string | undefined> | null = null;
  const api = createSlackClient({ botToken, fetch: fetchImpl });
  const teamId = () => {
    teamPromise ||= api("auth.test", {}).then((data) => data.team_id).catch((error) => { teamPromise = null; throw error; });
    return teamPromise;
  };

  const account: RequestHandler = async (req, res, next) => {
    try {
      const match = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
      if (!match) return res.sendStatus(401);
      req.oshkaUid = (await verifyIdToken(match[1])).uid;
      next();
    } catch { res.sendStatus(401); }
  };
  app.get("/integrations/slack/link", account, async (req, res) => res.json(await store.status(req.oshkaUid!)));
  app.post("/integrations/slack/link-code", account, async (req, res) => res.json({ code: await store.createCode(req.oshkaUid!), expiresIn: 600 }));
  app.delete("/integrations/slack/link", account, async (req, res) => { await store.disconnect(req.oshkaUid!); res.sendStatus(204); });

  app.post("/integrations/slack/interactions", express.urlencoded({ extended: false, limit: "256kb", verify: (req, _res, body) => { req.rawBody ||= body; } }), async (req, res) => {
    if (!verifySignature(signingSecret(), req.rawBody, req.get("X-Slack-Request-Timestamp"), req.get("X-Slack-Signature"))) return res.sendStatus(401);
    let payload: Interaction;
    try { payload = JSON.parse(req.body?.payload); } catch { return res.sendStatus(400); }
    const team = payload.team?.id, user = payload.user?.id;
    if (typeof team !== "string" || typeof user !== "string") return res.sendStatus(400);
    try {
      if (payload.type === "message_action" && payload.callback_id === CALLBACK) {
        const message = payload.message, channel = payload.channel?.id;
        if (!message || typeof message.ts !== "string" || typeof channel !== "string") return res.sendStatus(400);
        const [expectedTeam, { permalink }] = await Promise.all([teamId(), api("chat.getPermalink", { channel, message_ts: message.ts })]);
        if (team !== expectedTeam) return res.sendStatus(403);
        if (typeof permalink !== "string" || !permalink.startsWith("https://")) throw new Error("Missing Slack permalink");
        const session = await store.prepare({ team, user, message, channel, permalink });
        // Finish opening the modal before ending the function; no background
        // work after res.end(), which Cloud Functions may suspend immediately.
        await api("views.open", { trigger_id: payload.trigger_id, view: captureModal(session, message) });
        return res.status(200).end();
      }
      if (team !== await teamId()) return res.sendStatus(403);
      if (payload.type === "view_submission" && payload.view?.callback_id === MODAL) {
        const values = payload.view.state?.values || {};
        const title = values.title?.value?.value?.trim();
        if (!title || title.length > 1000) return res.json({ response_action: "errors", errors: { title: "Donne un titre à la carte (1 000 caractères maximum)." } });
        const result = await store.capture({ id: payload.view.private_metadata, team, user, title, code: values.link_code?.value?.value });
        return res.json({ response_action: "update", view: {
          type: "modal", title: text("Oshka"), close: text("Fermer"),
          blocks: [
            { type: "section", text: text(result.duplicate ? "Ce message a déjà été enregistré dans Oshka." : "La carte a été ajoutée à ton Inbox Oshka.") },
            { type: "actions", elements: [{ type: "button", action_id: "open_oshka", text: text("Ouvrir Oshka"), url: origin }] },
          ],
        } });
      }
      return res.status(200).end();
    } catch (error) {
      if (payload.type === "view_submission") {
        const missingLinkField = error instanceof CaptureError && error.field === "link_code" && !payload.view?.state?.values?.link_code;
        const field = error instanceof CaptureError && !missingLinkField ? error.field : "title";
        const message = missingLinkField ? "La connexion à Oshka a changé. Ferme cette fenêtre et recommence depuis le message." : error instanceof CaptureError ? error.message : "L’ajout n’a pas pu être confirmé. Réessaie : une carte déjà enregistrée ne sera pas dupliquée.";
        return res.json({ response_action: "errors", errors: { [field]: message } });
      }
      // Never log message text, tokens, link codes or payloads.
      console.error("Slack interaction failed:", error instanceof SlackApiError
        ? { name: error.name, method: error.method, code: error.code }
        : { name: (error as Error).name });
      return res.sendStatus(503);
    }
  });
  const unavailable: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Slack integration unavailable" });
  };
  app.use(unavailable);
  return app;
}
