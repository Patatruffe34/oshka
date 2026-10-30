import { useState, useEffect } from "react";
import { localDay, msUntilNextDay } from "../lib/day";

/**
 * Today's date, kept current.
 *
 * A PWA is rarely opened, mostly resumed: put away in the evening and brought
 * back in the morning, it was still drawing yesterday — the Agenda's "today"
 * showed the day before, and nothing was late yet. So the day is looked at
 * again every time the app comes back into view, and at midnight for one left
 * open on screen.
 *
 * A new day re-renders the app rather than reloading it: a reload would drop
 * an open card and could cut a save short, and nothing needs fetching again —
 * only re-reading against a different date.
 */
export function useToday() {
  const [today, setToday] = useState(localDay);

  useEffect(() => {
    // The same string twice is a no-op for React, so checking often is free
    const check = () => setToday(localDay());

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);

    // A second late rather than early: just before midnight is still today
    const timer = setTimeout(check, msUntilNextDay() + 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      clearTimeout(timer);
    };
    // Re-armed each day, so the midnight timer always aims at the next one
  }, [today]);

  return today;
}
