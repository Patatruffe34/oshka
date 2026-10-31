import { useSyncExternalStore, useCallback } from "react";

/**
 * Subscribe to a media query, e.g. useMediaQuery("(max-width: 640px)").
 *
 * Built on useSyncExternalStore rather than useState + useEffect: matchMedia is
 * an external store, and this reads it during render instead of correcting the
 * value after a first paint at the wrong breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false // server / prerender: assume the wide layout
  );
}
