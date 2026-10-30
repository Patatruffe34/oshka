import { useState, useEffect, useRef } from "react";

const URL_REGEX = /^https?:\/\/[^\s]+$/i;
const cache = new Map();

/**
 * Detects if a card title is a URL and fetches Open Graph preview data.
 * Uses microlink.io as a free OG metadata proxy.
 */
export function useLinkPreview(title) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const url = title?.trim();
  const isUrl = url && URL_REGEX.test(url);

  useEffect(() => {
    if (!isUrl) {
      setPreview(null);
      return;
    }

    // Check cache first
    if (cache.has(url)) {
      setPreview(cache.get(url));
      return;
    }

    // Offline: show the bare domain without caching it, so the real preview
    // is still fetched once the connection returns.
    if (!navigator.onLine) {
      setPreview({
        title: null, description: null, image: null,
        siteName: (() => { try { return new URL(url).hostname; } catch { return url; } })(),
        url,
      });
      return;
    }

    setLoading(true);

    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchPreview = async () => {
      try {
        const res = await fetch(
          `https://api.microlink.io?url=${encodeURIComponent(url)}`,
          { signal: controller.signal }
        );
        const json = await res.json();

        if (json.status === "success" && json.data) {
          const data = {
            title: json.data.title || null,
            description: json.data.description || null,
            image: json.data.image?.url || json.data.logo?.url || null,
            siteName: json.data.publisher || new URL(url).hostname,
            url,
          };
          cache.set(url, data);
          setPreview(data);
        } else {
          // Fallback: just show the domain
          const fallback = {
            title: null,
            description: null,
            image: null,
            siteName: new URL(url).hostname,
            url,
          };
          cache.set(url, fallback);
          setPreview(fallback);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          const fallback = {
            title: null,
            description: null,
            image: null,
            siteName: (() => { try { return new URL(url).hostname; } catch { return url; } })(),
            url,
          };
          cache.set(url, fallback);
          setPreview(fallback);
        }
      } finally {
        setLoading(false);
      }
    };

    // Debounce fetch by 500ms
    const timer = setTimeout(fetchPreview, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, isUrl]);

  return { isUrl, preview, loading };
}
