import { useState, useEffect, useRef } from "react";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";

const ACTION_CODE_SETTINGS = {
  url: window.location.origin,
  handleCodeInApp: true,
};

/** Detect if we are running inside the installed PWA (standalone mode) */
function isStandalone() {
  return (
    window.navigator.standalone === true || // iOS Safari
    window.matchMedia("(display-mode: standalone)").matches // Chrome / Android
  );
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  // Read once: a magic link either has its email stored here, or was opened in
  // another browser/device and the user has to type it again
  const [magicLink] = useState(() =>
    isSignInWithEmailLink(auth, window.location.href)
      ? { url: window.location.href, email: window.localStorage.getItem("inceptio_email") }
      : null
  );
  const [verifying, setVerifying] = useState(Boolean(magicLink?.email));
  // True when the magic link was opened in a different browser and we need the email
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(Boolean(magicLink && !magicLink.email));

  const magicLinkUrl = useRef(magicLink && !magicLink.email ? magicLink.url : null); // store the magic link URL for cross-browser confirm

  // ---- Core auth listener ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ---- PWA focus re-sync ----
  // When the user switches back from the browser to the PWA the auth state
  // may already be persisted in IndexedDB. Force Firebase to pick it up.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isStandalone()) {
        // Reload current user from IndexedDB — triggers onAuthStateChanged
        auth.authStateReady?.().then(() => {
          if (auth.currentUser && !user) {
            setUser(auth.currentUser);
          }
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [user]);

  // ---- Handle magic link redirect on mount ----
  useEffect(() => {
    // Without a stored email, needsEmailConfirm already asks for it
    if (!magicLink?.email) return;

    const { email, url } = magicLink;
    signInWithEmailLink(auth, email, url)
      .then(() => {
        window.localStorage.removeItem("inceptio_email");
        window.history.replaceState(null, "", window.location.origin);
      })
      .catch((err) => setError(err.message))
      .finally(() => setVerifying(false));
  }, [magicLink]);

  const sendMagicLink = async (email) => {
    setSending(true);
    setError(null);
    try {
      await sendSignInLinkToEmail(auth, email, ACTION_CODE_SETTINGS);
      window.localStorage.setItem("inceptio_email", email);
      setSending(false);
      return true;
    } catch (err) {
      setError(err.message);
      setSending(false);
      return false;
    }
  };

  const confirmEmail = async (email) => {
    if (!magicLinkUrl.current) return false;
    setSending(true);
    setError(null);
    try {
      await signInWithEmailLink(auth, email, magicLinkUrl.current);
      window.localStorage.removeItem("inceptio_email");
      window.history.replaceState(null, "", window.location.origin);
      setNeedsEmailConfirm(false);
      setSending(false);
      return true;
    } catch (err) {
      setError(err.message);
      setSending(false);
      return false;
    }
  };

  const signInWithPassword = async (email, password) => {
    setSending(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setSending(false);
      return true;
    } catch (err) {
      if (err.code === "auth/invalid-credential") {
        setError("wrong_password");
      } else {
        setError(err.code);
      }
      setSending(false);
      return false;
    }
  };

  const signUpWithPassword = async (email, password) => {
    setSending(true);
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setSending(false);
      return true;
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("email_in_use");
      } else {
        setError(err.code);
      }
      setSending(false);
      return false;
    }
  };

  const logout = () => signOut(auth);

  return {
    user,
    loading: loading || verifying,
    sending,
    error,
    sendMagicLink,
    signInWithPassword,
    signUpWithPassword,
    confirmEmail,
    needsEmailConfirm,
    logout,
  };
}
