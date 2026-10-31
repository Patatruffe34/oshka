const VERSION = "oshka-v7";
const SHELL = ["/", "/index.html", "/manifest.json", "/logo.svg", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) =>
      // A single missing file must not abort the whole install
      Promise.allSettled(SHELL.map(async (url) => {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok && !/no-store/i.test(response.headers.get("Cache-Control") || "")) {
          await cache.put(url, response);
        }
      }))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/** Vite emits content-hashed asset filenames, so they can be cached forever. */
const isHashedAsset = (url) => url.pathname.startsWith("/assets/");

/**
 * Drop cached assets the current shell no longer points at.
 *
 * Hashed filenames change on every build, so without this each deploy leaves
 * its predecessor behind for good: the cache only ever grew. The version bump
 * that clears everything happens far more rarely than a deploy.
 *
 * Safe because the app ships as a single bundle — nothing is fetched lazily
 * later, so a running tab never needs an asset the fresh HTML omits.
 */
async function pruneStaleAssets(cache, html) {
  const referenced = new Set(
    [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((m) => m[0])
  );
  if (referenced.size === 0) return; // unparseable HTML: keep everything

  const keys = await cache.keys();
  await Promise.all(
    keys.map((request) => {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/assets/") && !referenced.has(path)) {
        return cache.delete(request);
      }
      return null;
    })
  );
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Let Firestore/Auth manage their own connectivity — they have an offline
  // queue of their own and streaming requests must never be cached.
  if (url.origin !== self.location.origin) return;

  // Let the browser handle attachment downloads and their response headers.
  if (url.pathname.startsWith("/shortcuts/")) return;

  // Shared content is personal: cache only the shell, never a share URL.
  if (url.pathname.replace(/\/$/, "") === "/share") {
    e.respondWith(
      fetch("/index.html", { cache: "reload" }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache only a closed list of public resources. OAuth, integration APIs,
  // Firebase auth helpers and magic-link query strings never enter CacheStorage.
  if (request.headers?.has("Authorization") || url.search ||
      (!isHashedAsset(url) && !SHELL.includes(url.pathname) &&
       !["/icon-192.png", "/icon-512.png"].includes(url.pathname))) return;

  if (isHashedAsset(url)) {
    // Cache first: the filename changes whenever the content does.
    e.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const clone = res.clone();
            if (res.ok && !/no-store/i.test(res.headers.get("Cache-Control") || "")) {
              e.waitUntil(caches.open(VERSION).then((c) => c.put(request, clone)));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations and everything else: network first, fall back to the cached
  // shell so a cold offline launch still boots the app.
  // `cache: "reload"` bypasses the browser's HTTP cache — otherwise a stale
  // index.html can be replayed from disk and keep pinning old asset hashes.
  const isDocument = request.mode === "navigate" || url.pathname.endsWith(".html");

  e.respondWith(
    fetch(request, { cache: "reload" })
      .then((res) => {
        // Both clones must be taken synchronously, before the response is
        // handed to the browser — once its body starts streaming out, cloning
        // it throws and the whole caching step fails silently.
        const forCache = res.clone();
        const forPrune = isDocument && res.ok ? res.clone() : null;

        if (res.ok && !/no-store/i.test(res.headers.get("Cache-Control") || "")) e.waitUntil(
          caches.open(VERSION).then(async (c) => {
            await c.put(request, forCache);
            // A fresh shell is the moment we learn which assets are current
            if (forPrune) {
              await pruneStaleAssets(c, await forPrune.text()).catch(() => {});
            }
          })
        );
        return res;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || caches.match("/index.html"))
      )
  );
});
