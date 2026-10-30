import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

export default function SharedCapture({ pending, ready, onCapture, onCancel }) {
  const { t } = useI18n();
  const heading = useId();
  const titleId = useId();
  const contentId = useId();
  const input = useRef(null);
  const submitted = useRef(false);
  const [title, setTitle] = useState(pending.title);
  const [description, setDescription] = useState(pending.description);
  const [error, setError] = useState(false);

  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus();
    return () => previous?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (submitted.current || !ready || !title.trim()) return;
    submitted.current = true;
    if (onCapture(title.trim(), { description }) === false) {
      submitted.current = false;
      setError(true);
    }
  };

  return (
    <div className="modal-overlay" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
      if (event.key === "Tab") {
        const items = [...event.currentTarget.querySelectorAll("button:not(:disabled), input, textarea")];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <section className="modal-card shared-capture" role="dialog" aria-modal="true" aria-labelledby={heading}>
        <div className="modal-header">
          <h2 className="modal-title" id={heading}>{t("share.title")}</h2>
          <button className="modal-close" onClick={onCancel} aria-label={t("board.cancel")}>&times;</button>
        </div>
        <p className="profile-hint" role={pending.empty ? "alert" : undefined}>{t(pending.empty ? "share.empty" : "share.hint")}</p>
        <form onSubmit={submit}>
          <label htmlFor={titleId}>{t("share.card_title")}</label>
          <input ref={input} id={titleId} className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label htmlFor={contentId}>{t("share.content")}</label>
          <textarea id={contentId} className="auth-input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
          {error && <p role="alert">{t("share.error")}</p>}
          <div className="shared-capture-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>{t("board.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={!ready || !title.trim()}>{ready ? t("share.add") : t("loading")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
