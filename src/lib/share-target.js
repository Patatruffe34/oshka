const PENDING_KEY = "oshka_pending_share_v1";

/** Android may put the URL in text rather than url. Keep the original content. */
export function parseSharedContent(href) {
  const address = new URL(href);
  if (address.pathname.replace(/\/$/, "") !== "/share") return null;
  // iPhone shortcuts use the fragment so the content stays out of server logs.
  const params = address.hash.startsWith("#text=")
    ? new URLSearchParams(address.hash.slice(1))
    : address.searchParams;
  const title = (params.get("title") || "").trim();
  const text = (params.get("text") || "").trim();
  const url = (params.get("url") || "").trim();
  if (!title && !text && !url) return null;
  const description = [text, url && !text.includes(url) ? url : ""].filter(Boolean).join("\n\n");
  return {
    title: title || text.split("\n")[0] || url,
    description,
  };
}

export function readPendingShare(storage = localStorage) {
  try {
    const pending = JSON.parse(storage.getItem(PENDING_KEY));
    return pending && typeof pending.id === "string" && typeof pending.title === "string"
      && (pending.title.trim() || pending.empty === true) && typeof pending.description === "string" ? pending : null;
  } catch {
    return null;
  }
}

/** Called before React/Auth can rewrite the URL. Survives a magic-link round trip. */
export function stageIncomingShare(location = window.location, history = window.history, storage = localStorage) {
  const content = parseSharedContent(location.href);
  const isShare = new URL(location.href).pathname.replace(/\/$/, "") === "/share";
  if (!content && !isShare) return readPendingShare(storage);
  // A broken/old shortcut must show an explanation, not silently open a board.
  const pending = { id: crypto.randomUUID(), ...(content || { title: "", description: "", empty: true }) };
  try { storage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch { /* Still works in this tab. */ }
  history.replaceState(null, "", "/");
  return pending;
}

export function clearPendingShare(id, storage = localStorage) {
  try {
    // An older tab must not discard a more recent incoming share.
    if (readPendingShare(storage)?.id === id) storage.removeItem(PENDING_KEY);
  } catch { /* Storage can be unavailable in private browsing. */ }
}
