const PENDING_KEY = "oshka_pending_share_v1";

export interface SharedContent {
  title: string;
  description: string;
}

/** A share waiting for the board; `empty` when nothing usable came with it */
export interface PendingShare extends SharedContent {
  id: string;
  empty?: true;
}

type ShareStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Android may put the URL in text rather than url. Keep the original content. */
export function parseSharedContent(href: string): SharedContent | null {
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

export function readPendingShare(storage: ShareStorage = localStorage): PendingShare | null {
  try {
    const pending = JSON.parse(storage.getItem(PENDING_KEY) ?? "null");
    return pending && typeof pending.id === "string" && typeof pending.title === "string"
      && (pending.title.trim() || pending.empty === true) && typeof pending.description === "string" ? pending : null;
  } catch {
    return null;
  }
}

/** Called before React/Auth can rewrite the URL. Survives a magic-link round trip. */
export function stageIncomingShare(
  location: Pick<Location, "href"> = window.location,
  history: Pick<History, "replaceState"> = window.history,
  storage: ShareStorage = localStorage,
): PendingShare | null {
  const content = parseSharedContent(location.href);
  const isShare = new URL(location.href).pathname.replace(/\/$/, "") === "/share";
  if (!content && !isShare) return readPendingShare(storage);
  // A broken/old shortcut must show an explanation, not silently open a board.
  const pending: PendingShare = { id: crypto.randomUUID(), ...(content || { title: "", description: "", empty: true as const }) };
  try { storage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch { /* Still works in this tab. */ }
  history.replaceState(null, "", "/");
  return pending;
}

export function clearPendingShare(id: string, storage: ShareStorage = localStorage): void {
  try {
    // An older tab must not discard a more recent incoming share.
    if (readPendingShare(storage)?.id === id) storage.removeItem(PENDING_KEY);
  } catch { /* Storage can be unavailable in private browsing. */ }
}
