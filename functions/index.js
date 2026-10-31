const { onRequest } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");

const { initializeApp } = require("firebase-admin/app");
initializeApp();

// Gmail's Apps Script module uses an Inbox-only credential, not Gmail OAuth
// tokens. Gmail permissions remain inside the user's Google account.
const { createGmailApp } = require("./gmail/app");
const { createGmailStore } = require("./gmail/store");
exports.gmail = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 5 },
  createGmailApp({
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    store: createGmailStore(getFirestore()),
  })
);

// ── MCP server: the boards, for Claude, Codex and other MCP clients ──
exports.mcp = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 5 },
  require("./mcp").app
);

const slackSigningSecret = defineSecret("OSHKA_SLACK_SIGNING_SECRET");
const slackBotToken = defineSecret("OSHKA_SLACK_BOT_TOKEN");
const { createSlackApp } = require("./slack/app");
const { createStore } = require("./slack/store");
exports.slack = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 5, secrets: [slackSigningSecret, slackBotToken] },
  createSlackApp({
    signingSecret: () => slackSigningSecret.value(), botToken: () => slackBotToken.value(),
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    store: createStore(getFirestore()),
    origin: process.env.OSHKA_ORIGIN || (process.env.FUNCTIONS_EMULATOR === "true" ? "http://localhost:5002" : `https://${process.env.GCLOUD_PROJECT}.web.app`),
  })
);
