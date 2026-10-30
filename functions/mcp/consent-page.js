/**
 * The page an MCP client opens to ask for access.
 *
 * Served from the app's own origin (Hosting rewrites /authorize here), which
 * is what lets it reuse the session already open in Oshka: Firebase Auth keeps
 * it in this origin's IndexedDB, under the same default app. Someone signed in
 * to the app only has to say yes.
 *
 * It never sees a password server-side: sign-in happens in the browser, and
 * only the resulting ID token is posted back, to /oauth/approve.
 */

const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/12.11.0";

/** JSON that can sit inside a <script> without closing it */
const embed = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

function consentPage({ request, client, redirectHost, firebase }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Oshka — Connexion</title>
<style>
  :root {
    --bg: #f5f5f7; --surface: #fff; --border: #d8d8e0; --text: #1a1a2e;
    --muted: #6a6a82; --accent: #b83c26; --on-accent: #f5f5f7; --red: #c2185b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e0e11; --surface: #18181c; --border: #2e2e38; --text: #e8e8f0;
      --muted: #7a7a90; --accent: #e2543b; --on-accent: #0e0e11; --red: #fb7185;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    min-height: 100dvh; display: grid; place-items: center; padding: 16px;
    background: var(--bg); color: var(--text);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "DM Sans", system-ui, sans-serif;
  }
  main {
    width: 100%; max-width: 380px; padding: 28px 24px; border-radius: 12px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .brand { font-family: "DM Mono", ui-monospace, monospace; letter-spacing: .12em; color: var(--accent); font-size: 13px; }
  h1 { font-size: 19px; margin: 10px 0 6px; font-weight: 600; }
  p { color: var(--muted); }
  p strong { color: var(--text); font-weight: 600; }
  p.small { font-size: 13px; margin-top: 4px; }
  form, section { display: grid; gap: 10px; margin-top: 20px; }
  input {
    font: inherit; padding: 10px 12px; border-radius: 8px; color: var(--text);
    background: var(--bg); border: 1px solid var(--border);
  }
  button {
    font: inherit; font-weight: 600; padding: 10px 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent);
  }
  button.ghost { background: transparent; color: var(--text); border-color: var(--border); font-weight: 500; }
  button.link { background: none; border: 0; padding: 4px; color: var(--muted); font-weight: 400; text-decoration: underline; }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: var(--red); min-height: 1.5em; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <div class="brand">OSHKA</div>
  <h1 data-t="title"></h1>
  <p><strong id="client"></strong> <span data-t="wants"></span></p>
  <p class="small"><span data-t="back"></span> <strong id="host"></strong></p>

  <section id="loading"><p data-t="loading"></p></section>

  <form id="signin" hidden>
    <input id="email" type="email" autocomplete="email" required data-ph="email">
    <input id="password" type="password" autocomplete="current-password" data-ph="password">
    <button type="submit" data-t="signin"></button>
    <button type="button" class="link" id="magic" data-t="magic"></button>
  </form>

  <section id="sent" hidden><p data-t="sent"></p></section>

  <section id="consent" hidden>
    <p><span data-t="as"></span> <strong id="who"></strong></p>
    <button type="button" id="allow" data-t="allow"></button>
    <button type="button" class="ghost" id="deny" data-t="deny"></button>
    <button type="button" class="link" id="switch" data-t="switch"></button>
  </section>

  <p class="error" id="error" role="alert"></p>

  <form id="answer" method="post" action="/oauth/approve" hidden>
    <input type="hidden" name="request">
    <input type="hidden" name="decision">
    <input type="hidden" name="id_token">
  </form>
</main>

<script id="data" type="application/json">${embed({ request, client, redirectHost, firebase })}</script>
<script type="module">
import { initializeApp } from "${FIREBASE_SDK}/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from "${FIREBASE_SDK}/firebase-auth.js";

const T = {
  fr: {
    title: "Autoriser l'accès à vos boards",
    wants: "demande à lire et modifier vos boards Oshka.",
    back: "Réponse envoyée à",
    loading: "Un instant…",
    email: "E-mail", password: "Mot de passe",
    signin: "Se connecter", magic: "Recevoir un lien de connexion par e-mail",
    sent: "Lien envoyé. Ouvrez-le dans ce navigateur pour continuer.",
    as: "Connecté en tant que",
    allow: "Autoriser", deny: "Refuser",
    switch: "Utiliser un autre compte (déconnecte Oshka dans ce navigateur)",
    failed: "Connexion impossible : vérifiez l'e-mail et le mot de passe.",
  },
  en: {
    title: "Allow access to your boards",
    wants: "asks to read and change your Oshka boards.",
    back: "Answer sent to",
    loading: "One moment…",
    email: "Email", password: "Password",
    signin: "Sign in", magic: "Email me a sign-in link instead",
    sent: "Link sent. Open it in this browser to carry on.",
    as: "Signed in as",
    allow: "Allow", deny: "Deny",
    switch: "Use another account (signs Oshka out in this browser)",
    failed: "Could not sign in: check the email and password.",
  },
};
const t = T[navigator.language?.startsWith("fr") ? "fr" : "en"];
document.documentElement.lang = t === T.fr ? "fr" : "en";
document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t[el.dataset.t]));
document.querySelectorAll("[data-ph]").forEach((el) => (el.placeholder = t[el.dataset.ph]));

const data = JSON.parse(document.getElementById("data").textContent);
const $ = (id) => document.getElementById(id);
$("client").textContent = data.client;
$("host").textContent = data.redirectHost;

const views = ["loading", "signin", "sent", "consent"];
const show = (view) => views.forEach((v) => ($(v).hidden = v !== view));
const fail = (message) => ($("error").textContent = message || "");

// Hosting serves the project's web config at this reserved path
const config = data.firebase ?? (await (await fetch("/__/firebase/init.json")).json());
const auth = getAuth(initializeApp(config));
if (config.emulator) connectAuthEmulator(auth, config.emulator, { disableWarnings: true });

const EMAIL_KEY = "oshka_mcp_email";
if (isSignInWithEmailLink(auth, location.href)) {
  const email = localStorage.getItem(EMAIL_KEY) || prompt(t.email);
  try {
    await signInWithEmailLink(auth, email, location.href);
    localStorage.removeItem(EMAIL_KEY);
  } catch (err) {
    fail(err.message);
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) $("who").textContent = user.email;
  show(user ? "consent" : "signin");
});

$("signin").addEventListener("submit", async (e) => {
  e.preventDefault();
  fail();
  if (!$("password").value) return $("password").focus();
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch {
    fail(t.failed);
  }
});

$("magic").addEventListener("click", async () => {
  fail();
  const email = $("email").value.trim();
  if (!$("email").reportValidity()) return;
  try {
    await sendSignInLinkToEmail(auth, email, { url: location.href, handleCodeInApp: true });
    localStorage.setItem(EMAIL_KEY, email);
    show("sent");
  } catch (err) {
    fail(err.message);
  }
});

const answer = async (decision) => {
  const form = $("answer");
  form.request.value = data.request;
  form.decision.value = decision;
  if (decision === "allow") form.id_token.value = await auth.currentUser.getIdToken(true);
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  form.submit();
};
$("allow").addEventListener("click", () => answer("allow"));
$("deny").addEventListener("click", () => answer("deny"));
$("switch").addEventListener("click", () => signOut(auth));
</script>
</body>
</html>`;
}

module.exports = { consentPage };
