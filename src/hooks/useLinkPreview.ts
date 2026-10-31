import { useState, useEffect } from "react";

const URL_REGEX = /^https?:\/\/[^\s]+$/i;

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string;
  url: string;
}


/**
 * Detects if a card title is a URL and fetches Open Graph preview data.
 * Uses microlink.io as a free OG metadata proxy.
 */
export function useLinkPreview(title: string | null | undefined, enabled = false) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const url = title?.trim();
  const isUrl = !!url && URL_REGEX.test(url);

  useEffect(() => {
    if (!url || !isUrl || !enabled || !navigator.onLine) return;
    const controller = new AbortController();

    const fetchPreview = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://api.microlink.io?url=${encodeURIComponent(url)}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        if (controller.signal.aborted) return;

        if (json.status === "success" && json.data) {
          const data: LinkPreview = {
            title: json.data.title || null,
            description: json.data.description || null,
            image: json.data.image?.url || json.data.logo?.url || null,
            siteName: json.data.publisher || new URL(url).hostname,
            url,
          };

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

          setPreview(fallback);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const fallback = {
            title: null,
            description: null,
            image: null,
            siteName: (() => { try { return new URL(url).hostname; } catch { return url; } })(),
            url,
          };

          setPreview(fallback);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    // Only called after explicit consent for this exact URL.
    // Debounce fetch by 500ms
    const timer = setTimeout(fetchPreview, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, isUrl, enabled]);

  return { isUrl, preview: enabled && preview?.url === url ? preview : null, loading: enabled && loading };
}
