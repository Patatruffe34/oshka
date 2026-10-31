import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { useI18n } from "../lib/i18n";
import ConnectionsModal from "./ConnectionsModal";
import { IconArrow, IconClose, IconConnections } from "./icons";
import type { Settings, WeekMode } from "../lib/types";

interface ProfileModalProps {
  user: User;
  settings: Settings;
  onUpdateSettings: (fields: Partial<Settings>) => void;
  onClose: () => void;
}

export default function ProfileModal({ user, settings, onUpdateSettings, onClose }: ProfileModalProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const connectionsEntryRef = useRef<HTMLButtonElement>(null);
  const returningFromConnections = useRef(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!connectionsOpen && returningFromConnections.current) {
      connectionsEntryRef.current?.focus();
      returningFromConnections.current = false;
    }
  }, [connectionsOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPwd.length < 6) {
      setError(t("profile.error_min"));
      return;
    }

    if (newPwd !== confirmPwd) {
      setError(t("profile.error_match"));
      return;
    }

    setSaving(true);

    try {
      if (needsReauth && currentPwd) {
        const credential = EmailAuthProvider.credential(user.email!, currentPwd);
        await reauthenticateWithCredential(auth.currentUser!, credential);
      }

      await updatePassword(auth.currentUser!, newPwd);
      setSuccess(true);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setNeedsReauth(false);
    } catch (caught) {
      const err = caught as { code?: string; message: string };
      if (err.code === "auth/requires-recent-login") {
        setNeedsReauth(true);
        setError(t("profile.error_reauth"));
      } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError(t("profile.error_wrong_current"));
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (connectionsOpen) return <ConnectionsModal onBack={() => {
    returningFromConnections.current = true;
    setConnectionsOpen(false);
  }} onClose={onClose} />;

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="modal-card profile-modal" role="dialog" aria-modal="true" aria-labelledby={headingId} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-top profile-header">
          <h2 id={headingId} className="modal-title">{t("profile.title")}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("connections.close")}>
            <IconClose />
          </button>
        </div>

        <div className="modal-section">
          <div className="modal-section-title">{t("profile.email")}</div>
          <div className="profile-email">{user.email}</div>
        </div>

        <button ref={connectionsEntryRef} type="button" className="connections-entry" onClick={() => setConnectionsOpen(true)}>
          <span className="connections-entry-icon"><IconConnections size={23} /></span>
          <span className="connections-entry-text"><strong>{t("connections.entry")}</strong><span>{t("connections.entry_hint")}</span></span>
          <IconArrow />
        </button>

        <div className="modal-section">
          <div className="modal-section-title">{t("settings.title")}</div>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.autoArchiveDone}
              onChange={(e) =>
                onUpdateSettings({ autoArchiveDone: e.target.checked })
              }
            />
            <span className="setting-text">
              <span className="setting-label">{t("settings.auto_archive")}</span>
              <span className="setting-hint">{t("settings.auto_archive_hint")}</span>
            </span>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.doneOnDrop !== false}
              onChange={(e) => onUpdateSettings({ doneOnDrop: e.target.checked })}
            />
            <span className="setting-text">
              <span className="setting-label">{t("settings.done_on_drop")}</span>
              <span className="setting-hint">{t("settings.done_on_drop_hint")}</span>
            </span>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.moveOnDone !== false}
              onChange={(e) => onUpdateSettings({ moveOnDone: e.target.checked })}
            />
            <span className="setting-text">
              <span className="setting-label">{t("settings.move_on_done")}</span>
              <span className="setting-hint">{t("settings.move_on_done_hint")}</span>
            </span>
          </label>

          <div className="setting-row setting-choice">
            <span className="setting-text">
              <span className="setting-label">{t("settings.week_mode")}</span>
              <span className="setting-hint">{t("settings.week_mode_hint")}</span>
            </span>
            <span className="setting-options">
              {(["rolling", "calendar"] as WeekMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`btn-ghost-sm${(settings.weekMode || "rolling") === mode ? " lab-on" : ""}`}
                  onClick={() => onUpdateSettings({ weekMode: mode })}
                >
                  {t(mode === "rolling" ? "settings.week_rolling" : "settings.week_calendar")}
                </button>
              ))}
            </span>
          </div>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.confetti}
              onChange={(e) => onUpdateSettings({ confetti: e.target.checked })}
            />
            <span className="setting-text">
              <span className="setting-label">{t("settings.confetti")}</span>
              <span className="setting-hint">{t("settings.confetti_hint")}</span>
            </span>
          </label>
        </div>

        <div className="modal-section">
          <div className="modal-section-title">{t("profile.set_pwd")}</div>
          <p className="profile-hint">{t("profile.set_hint")}</p>

          <form onSubmit={handleSubmit} className="profile-form">
            {needsReauth && (
              <input
                className="auth-input"
                type="password"
                placeholder={t("profile.current_pwd")}
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
              />
            )}
            <input
              className="auth-input"
              type="password"
              placeholder={t("profile.new_pwd")}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              minLength={6}
              required
            />
            <input
              className="auth-input"
              type="password"
              placeholder={t("profile.confirm_pwd")}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              minLength={6}
              required
            />
            <button className="auth-btn" type="submit" disabled={saving}>
              {saving ? t("auth.sending") : t("profile.save_btn")}
            </button>
          </form>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{t("profile.success")}</div>}
        </div>
      </div>
    </div>
  );
}
