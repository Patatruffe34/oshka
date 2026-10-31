import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "../lib/i18n";
import Logo from "./Logo";
import { IconSun, IconMoon } from "./icons";

interface AuthProps {
  /** Resolves true once the link is on its way */
  onSendLink: (email: string) => Promise<boolean | void>;
  onSignInWithPassword: (email: string, password: string) => Promise<unknown>;
  onSignUpWithPassword: (email: string, password: string) => Promise<unknown>;
  sending: boolean;
  /** A Firebase error code, or a message to show as is */
  error: string | null;
  theme: string;
  onToggleTheme: () => void;
  /** Opened from a sign-in link on another device: only the address is asked */
  emailConfirmMode: boolean;
  /** Something shared to the app is waiting for a sign-in */
  sharePending: boolean;
}

export default function Auth({
  onSendLink,
  onSignInWithPassword,
  onSignUpWithPassword,
  sending,
  error,
  theme,
  onToggleTheme,
  emailConfirmMode,
  sharePending,
}: AuthProps) {
  const { t, locale, changeLocale } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState("password"); // "password" | "magic"
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"

  // Auto-dismiss "link sent" screen when user comes back to the app
  useEffect(() => {
    if (!sent) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setTimeout(() => setSent(false), 1500);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [sent]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    if (emailConfirmMode) {
      await onSendLink(email.trim());
      return;
    }

    if (mode === "magic") {
      const ok = await onSendLink(email.trim());
      if (ok) setSent(true);
    } else {
      if (!password) return;
      if (authMode === "signup") {
        await onSignUpWithPassword(email.trim(), password);
      } else {
        await onSignInWithPassword(email.trim(), password);
      }
    }
  };

  const errorMessage = error
    ? t(`auth.error.${error}`) !== `auth.error.${error}`
      ? t(`auth.error.${error}`)
      : error
    : null;

  return (
    <div className="auth-page">
      {/* Top-right controls */}
      <div className="auth-controls">
        <button
          className="icon-btn lang-btn"
          onClick={() => changeLocale(locale === "en" ? "fr" : "en")}
          title={locale === "en" ? "Français" : "English"}
        >
          <span className="icon-slot">{locale === "en" ? "EN" : "FR"}</span>
        </button>
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === "dark" ? t("header.theme_light") : t("header.theme_dark")}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      <div className="auth-card">
        <div className="auth-logo">
          <Logo size={26} />
          <span className="logo-word">Oshka</span>
        </div>
        <div className="auth-subtitle">
          {emailConfirmMode ? t("auth.confirm_email") : t("auth.subtitle")}
        </div>
        {sharePending && <p className="profile-hint" role="status">{t("share.sign_in")}</p>}

        {/* Login / Signup tab toggle */}
        {!emailConfirmMode && !sent && (
          <div className="auth-tabs">
            <button
              className={`auth-tab${authMode === "login" ? " active" : ""}`}
              onClick={() => setAuthMode("login")}
            >
              {t("auth.tab_login")}
            </button>
            <button
              className={`auth-tab${authMode === "signup" ? " active" : ""}`}
              onClick={() => setAuthMode("signup")}
            >
              {t("auth.tab_signup")}
            </button>
          </div>
        )}

        {sent ? (
          <div className="auth-success">
            {t("auth.success.1")} <strong>{email}</strong>.<br />
            {t("auth.success.2")}
            <button
              className="auth-back-btn"
              onClick={() => setSent(false)}
            >
              {t("auth.back")}
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              <input
                className="auth-input"
                type="email"
                placeholder={t("auth.placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
              {mode === "password" && !emailConfirmMode && (
                <input
                  className="auth-input"
                  type="password"
                  placeholder={t("auth.password_placeholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              )}
              <button className="auth-btn" type="submit" disabled={sending}>
                {sending
                  ? t("auth.sending")
                  : emailConfirmMode
                    ? t("auth.confirm_btn")
                    : mode === "magic"
                      ? t("auth.send")
                      : authMode === "signup"
                        ? t("auth.sign_up_btn")
                        : t("auth.sign_in")}
              </button>
            </form>

            {!emailConfirmMode && (
              <button
                className="auth-mode-toggle"
                onClick={() => setMode(mode === "password" ? "magic" : "password")}
              >
                {mode === "password" ? t("auth.use_magic") : t("auth.use_password")}
              </button>
            )}
          </>
        )}

        {errorMessage && <div className="auth-error">{errorMessage}</div>}
      </div>
    </div>
  );
}
