import { useState, useEffect } from "react";

/**
 * Tracks browser connectivity. Firestore already queues writes offline via its
 * IndexedDB cache — this only drives the UI hint so the user knows edits are
 * being held locally rather than lost.
 */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
