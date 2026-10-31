import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";

import { createGmailApp } from "./gmail/app";
import { createGmailStore } from "./gmail/store";
import { app as mcpApp } from "./mcp";
import { createSlackApp } from "./slack/app";
import { createStore } from "./slack/store";

initializeApp();

// Gmail's Apps Script module uses an Inbox-only credential, not Gmail OAuth
// tokens. Gmail permissions remain inside the user's Google account.
export const gmail = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 5 },
  createGmailApp({
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    store: createGmailStore(getFirestore()),
  })
);

// ── MCP server: the boards, for Claude, Codex and other MCP clients ──
export const mcp = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 5 },
  mcpApp
);

const slackSigningSecret = defineSecret("OSHKA_SLACK_SIGNING_SECRET");
const slackBotToken = defineSecret("OSHKA_SLACK_BOT_TOKEN");
export const slack = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 5, secrets: [slackSigningSecret, slackBotToken] },
  createSlackApp({
    signingSecret: () => slackSigningSecret.value(), botToken: () => slackBotToken.value(),
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    store: createStore(getFirestore()),
    origin: process.env.OSHKA_ORIGIN || (process.env.FUNCTIONS_EMULATOR === "true" ? "http://localhost:5002" : `https://${process.env.GCLOUD_PROJECT}.web.app`),
  })
);
