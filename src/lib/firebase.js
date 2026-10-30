import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore";

/*
 * Against the local emulators, never the real project.
 *
 * A "demo-" project id is one Firebase knows does not exist: should the
 * emulator connection ever be skipped, requests fail instead of landing in
 * production. The cache stays in memory for the same reason — an IndexedDB
 * cache is keyed by project, and a stale one is how test data leaks back.
 */
const EMULATORS = import.meta.env.VITE_EMULATORS === "1";
const PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID;

const firebaseConfig = EMULATORS
  ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-oshka" }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: `${PROJECT}.firebaseapp.com`,
      projectId: PROJECT,
      storageBucket: `${PROJECT}.firebasestorage.app`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Enable IndexedDB persistence — writes survive page close / refresh
export const db = initializeFirestore(app, {
  localCache: EMULATORS
    ? memoryLocalCache()
    : persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
});

if (EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
