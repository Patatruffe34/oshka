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
  const [verifying, setVerifying] = useState(() =>
    isSignInWithEmailLink(auth, window.location.href)
  );
  // True when magic-link auth completed inside the browser (not the PWA)
  const [completedInBrowser, setCompletedInBrowser] = useState(false);
  // True when the magic link was opened in a different browser and we need the email
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const authEmail = useRef(null); // email used for the completed auth
  const magicLinkUrl = useRef(null); // store the magic link URL for cross-browser confirm

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
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    setVerifying(true);
    const email = window.localStorage.getItem("inceptio_email");

    if (!email) {
      // Different browser/device — ask user to re-enter their email
      magicLinkUrl.current = window.location.href;
      setNeedsEmailConfirm(true);
      setVerifying(false);
      return;
    }

    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        window.localStorage.removeItem("inceptio_email");
        window.history.replaceState(null, "", window.location.origin);

        authEmail.current = email;
      })
      .catch((err) => setError(err.message))
      .finally(() => setVerifying(false));
  }, []);

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
      authEmail.current = email;
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
    completedInBrowser,
    completedEmail: authEmail.current,
  };
}
