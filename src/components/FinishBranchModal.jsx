import { useEffect, useRef } from "react";
import { useI18n } from "../lib/i18n";

/**
 * You finished a card that still holds unfinished work.
 *
 * Oshka's whole shape makes this ambiguous: a card is also a board, so ticking
 * it can mean "this is done" or "this whole branch is done". Guessing either
 * way is wrong — silently finishing a subtree destroys work you can no longer
 * see, and silently leaving it strands cards nothing will ever surface again.
 * So it is asked, once, with the number in plain sight.
 *
 * Keeping the card done and the branch open stays a legitimate answer, which
 * is why the quiet button is not a cancel: nothing is undone by refusing.
 */
export default function FinishBranchModal({ subject, left, depth, onConfirm, onClose }) {
  const { t } = useI18n();
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card finish-modal">
        <div className="modal-header-top">
          <h2 className="modal-title">{t("finish.title")}</h2>
          <button className="modal-close" onClick={onClose} title={t("board.cancel")}>
            &times;
          </button>
        </div>

        <p className="finish-subject">{subject || t("board.untitled")}</p>

        <p className="finish-count">
          <strong>{t("finish.count").replace("{n}", left)}</strong>
          {depth > 1 && <span className="finish-depth">{t("finish.depth").replace("{n}", depth)}</span>}
        </p>

        <p className="label-picker-hint">{t("finish.hint")}</p>

        <div className="finish-actions">
          <button className="btn-ghost-sm" onClick={onClose}>
            {t("finish.only_this")}
          </button>
          <button className="btn-primary" ref={confirmRef} onClick={onConfirm}>
            {t("finish.all")}
          </button>
        </div>
      </div>
    </div>
  );
}
