import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createProvider, approve } from "./oauth";
import { registerTools, INSTRUCTIONS } from "./tools";

/*
 * Due dates are calendar days, and "today" is the user's, not the server's.
 * Set as the module loads, before any request reads the clock; imports run
 * first, but none of them reads it. Node honours TZ changes at runtime.
 */
process.env.TZ = process.env.OSHKA_TIMEZONE || "Europe/Paris";

/*
 * Everything is served from the app's origin through Hosting rewrites
 * (firebase.json): OAuth discovery lives at the root of a domain, and the
 * sign-in page can only reuse the app's session on the app's own origin.
 * OSHKA_ORIGIN overrides it for a custom domain.
 */
const EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
const PROJECT = process.env.GCLOUD_PROJECT;
const ORIGIN = process.env.OSHKA_ORIGIN || (EMULATOR ? "http://localhost:5002" : `https://${PROJECT}.web.app`);
const MCP_URL = new URL("/mcp", ORIGIN);

const provider = createProvider({
  // In production the page reads the web config Hosting publishes
  firebaseConfig: EMULATOR
    ? { apiKey: "demo-key", authDomain: "localhost", projectId: PROJECT, emulator: "http://127.0.0.1:9099" }
    : null,
});

/*
 * Behind Hosting every request arrives from the same proxy, so the SDK's
 * per-IP limits would pool all callers together; they key on the forwarded
 * address instead, and skip their proxy checks, which do not fit Hosting.
 */
const limits = { rateLimit: { validate: false } };

export const app = express();
app.set("trust proxy", true);
app.use((req, res, next) => {
  // A CDN sits in front: nothing here may ever be cached
  res.set("Cache-Control", "no-store");
  next();
});

app.post("/oauth/approve", express.urlencoded({ extended: false }), approve);

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(ORIGIN),
    resourceServerUrl: MCP_URL,
    resourceName: "Oshka",
    authorizationOptions: limits,
    tokenOptions: limits,
    clientRegistrationOptions: limits,
    revocationOptions: limits,
  })
);

// Some clients look for the resource metadata at the root rather than under /mcp
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(MCP_URL);
app.get("/.well-known/oauth-protected-resource", (req, res) => res.redirect(307, resourceMetadataUrl));

const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

/**
 * Stateless: a fresh server per request, answering in plain JSON. Nothing
 * lives between calls, which is what a function scaled to zero can promise.
 */
app.post("/mcp", bearer, async (req, res) => {
  const server = new McpServer({ name: "oshka", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerTools(server, req.auth!.extra!.uid as string);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
});

// No sessions, so no stream to open or close
app.all("/mcp", (req, res) => {
  res.set("Allow", "POST").status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

