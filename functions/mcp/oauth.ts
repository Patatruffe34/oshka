import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentData, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { consentPage, type ConsentPageOptions } from "./consent-page";

/*
 * The MCP server is its own OAuth authorization server, with Firebase Auth
 * as the login behind it. The SDK's router handles the protocol — metadata,
 * client registration, PKCE, the token endpoint — and this provider stores
 * what it needs in Firestore, where the security rules shut clients out.
 *
 * Every secret handed out (codes, tokens) is stored under its SHA-256 only:
 * a leak of the collection gives nothing that can be replayed.
 */

const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 60 * 24 * 3600;
const CODE_TTL = 5 * 60;
const REQUEST_TTL = 15 * 60;

/**
 * Who may register as a client.
 *
 * Registration is open by design (claude.ai and Codex register themselves),
 * so the redirect is what keeps a stranger from minting a client that sends
 * codes to their own site: claude.ai's callback, or a loopback port on the
 * user's machine for the CLIs.
 */
const TRUSTED_ORIGINS = ["https://claude.ai", "https://claude.com"];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const allowedRedirect = (uri: string) => {
  try {
    const url = new URL(uri);
    return TRUSTED_ORIGINS.includes(url.origin) || (LOOPBACK.has(url.hostname) && url.protocol === "http:");
  } catch {
    return false;
  }
};

const db = () => getFirestore();
const col = (name: string) => db().collection(name);
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = () => randomBytes(32).toString("base64url");
const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000);
const live = (snap: DocumentSnapshot) => snap.exists && snap.data()!.expiresAt.toDate() > new Date();
// Firestore refuses undefined fields, and client metadata is full of them
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

/** What an authorization code or a token stands for */
interface Grant {
  uid: string;
  clientId: string;
  scopes: string[];
  resource: string | null;
}

async function issueTokens({ uid, clientId, scopes, resource }: Grant): Promise<OAuthTokens> {
  const access = newSecret();
  const refresh = newSecret();
  const grant = { uid, clientId, scopes, resource };
  const batch = db().batch();
  batch.set(col("mcp_tokens").doc(hash(access)), { kind: "access", ...grant, expiresAt: expiry(ACCESS_TTL) });
  batch.set(col("mcp_tokens").doc(hash(refresh)), { kind: "refresh", ...grant, expiresAt: expiry(REFRESH_TTL) });
  await batch.commit();
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: refresh,
    scope: scopes.length ? scopes.join(" ") : undefined,
  };
}

/**
 * Spend a single-use secret: read it, check it, delete it, in one transaction,
 * so the same code or refresh token can never be exchanged twice.
 */
const spend = (ref: DocumentReference, check: (data: DocumentData) => boolean) =>
  db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!live(snap) || !check(snap.data()!)) throw new InvalidGrantError("Invalid or expired grant");
    tx.delete(ref);
    return snap.data() as Grant;
  });

export function createProvider({ firebaseConfig }: { firebaseConfig: ConsentPageOptions["firebase"] }): OAuthServerProvider {
  return {
    clientsStore: {
      async getClient(clientId) {
        const snap = await col("mcp_clients").doc(clientId).get();
        return snap.exists ? (snap.data() as OAuthClientInformationFull) : undefined;
      },
      async registerClient(client: OAuthClientInformationFull) {
        const refused = client.redirect_uris.filter((uri) => !allowedRedirect(uri));
        if (refused.length) {
          throw new InvalidClientMetadataError(`Redirect URI not allowed: ${refused.join(", ")}`);
        }
        await col("mcp_clients").doc(client.client_id).set(plain(client));
        return client;
      },
    },

    /**
     * Park the validated request and show the sign-in page. The page only
     * carries the request's id back, so nothing it posts can widen the grant.
     */
    async authorize(client, params, res) {
      const ref = col("mcp_requests").doc(newSecret());
      await ref.set({
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state ?? null,
        scopes: params.scopes ?? [],
        resource: params.resource?.href ?? null,
        expiresAt: expiry(REQUEST_TTL),
      });
      const redirectHost = new URL(params.redirectUri).host;
      res.type("html").send(
        consentPage({
          request: ref.id,
          client: client.client_name || redirectHost,
          redirectHost,
          firebase: firebaseConfig,
        })
      );
    },

    async challengeForAuthorizationCode(client, code) {
      const snap = await col("mcp_grants").doc(hash(code)).get();
      if (!live(snap) || snap.data()!.clientId !== client.client_id) {
        throw new InvalidGrantError("Invalid or expired authorization code");
      }
      return snap.data()!.codeChallenge;
    },

    async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
      const grant = await spend(
        col("mcp_grants").doc(hash(code)),
        (g) => g.clientId === client.client_id && (!redirectUri || g.redirectUri === redirectUri)
      );
      return issueTokens(grant);
    },

    async exchangeRefreshToken(client, refreshToken) {
      const grant = await spend(
        col("mcp_tokens").doc(hash(refreshToken)),
        (t) => t.kind === "refresh" && t.clientId === client.client_id
      );
      return issueTokens(grant);
    },

    async verifyAccessToken(token) {
      const snap = await col("mcp_tokens").doc(hash(token)).get();
      if (!live(snap) || snap.data()!.kind !== "access") throw new InvalidTokenError("Invalid or expired token");
      const t = snap.data()!;
      return {
        token,
        clientId: t.clientId,
        scopes: t.scopes ?? [],
        expiresAt: Math.floor(t.expiresAt.toDate().getTime() / 1000),
        resource: t.resource ? new URL(t.resource) : undefined,
        extra: { uid: t.uid },
      };
    },

    async revokeToken(client, { token }) {
      const ref = col("mcp_tokens").doc(hash(token));
      const snap = await ref.get();
      if (snap.exists && snap.data()!.clientId === client.client_id) await ref.delete();
    },
  };
}

/** Where the sign-in page posts its answer: a code for the client, or a no. */
export async function approve(req: Request, res: Response): Promise<void> {
  const { request, decision, id_token } = req.body ?? {};
  const ref = col("mcp_requests").doc(String(request || "-"));
  const snap = await ref.get();
  if (!live(snap)) {
    res.status(400).type("text").send("This request has expired. Start again from your app.");
    return;
  }
  const pending = snap.data()!;
  const back = new URL(pending.redirectUri);

  if (decision !== "allow") {
    await ref.delete();
    back.searchParams.set("error", "access_denied");
  } else {
    let user: DecodedIdToken;
    try {
      user = await getAuth().verifyIdToken(String(id_token));
    } catch {
      res.status(401).type("text").send("Sign-in could not be verified. Go back and try again.");
      return;
    }
    const code = newSecret();
    await col("mcp_grants").doc(hash(code)).set({
      uid: user.uid,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      scopes: pending.scopes,
      resource: pending.resource,
      expiresAt: expiry(CODE_TTL),
    });
    await ref.delete();
    back.searchParams.set("code", code);
  }
  if (pending.state) back.searchParams.set("state", pending.state);
  res.redirect(302, back.href);
}

