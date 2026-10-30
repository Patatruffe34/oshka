import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./lib/i18n.jsx";
import App from "./App.jsx";
import LoaderLab from "./components/LoaderLab.jsx";
import { stageIncomingShare } from "./lib/share-target";

const initialShare = stageIncomingShare();

/*
 * A bench for the loading mark, at /loader — dev only, mounted instead of the
 * app so it needs no sign-in and no board.
 *
 * A path, not a hash: the app owns the hash and rewrites it to whatever board
 * you are on, so #loader was wiped a moment after being typed. #loader still
 * works for muscle memory, but only by reloading into it — see below.
 */
const isLab = () =>
  window.location.pathname.replace(/\/$/, "") === "/loader" ||
  window.location.hash === "#loader";

// Typing a hash into an open tab changes nothing here: the choice below was
// made when this module ran. Reload into it — and before the app's own
// listener gets to put its board path back.
window.addEventListener("hashchange", () => {
  if (import.meta.env.DEV && window.location.hash === "#loader") {
    window.location.reload();
  }
});

const lab = import.meta.env.DEV && isLab();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <I18nProvider>{lab ? <LoaderLab /> : <App initialShare={initialShare} />}</I18nProvider>
  </StrictMode>
);
