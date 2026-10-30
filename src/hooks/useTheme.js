import { useState, useEffect } from "react";

const STORAGE_KEY = "oshka_theme";
const LEGACY_KEY = "inceptio_theme";

/** Background of each theme, mirrored from --bg in app.css */
const CHROME = { dark: "#0e0e11", light: "#f5f5f7" };

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    // Carry over the preference saved under the old product name
    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.removeItem(LEGACY_KEY);

    // The installed app paints its title bar from this tag, so it has to track
    // the theme — otherwise the PWA chrome stays on whatever shipped in the HTML.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", CHROME[theme] ?? CHROME.dark);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}
