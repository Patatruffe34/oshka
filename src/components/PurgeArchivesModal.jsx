import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/i18n";

export default function PurgeArchivesModal({ summary, onConfirm, onClose }) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="purge-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="modal-header-top">
        <h2 id={titleId} className="modal-title">{t("archive.clean_title")}</h2>
        <button className="modal-close" aria-label={t("board.cancel")} onClick={onClose}>&times;</button>
      </div>
      <div id={descriptionId} className="purge-description">
        <p>{t(summary.archived === 1 ? "archive.clean_count_one" : "archive.clean_count", { n: summary.archived })}</p>
        <p>{t("archive.clean_contents", { n: summary.total })}</p>
        <p>{t("archive.clean_warning")}</p>
      </div>
      <div className="finish-actions">
        <button className="btn-ghost" onClick={onClose} autoFocus>{t("board.cancel")}</button>
        <button className="btn-danger-sm" disabled={summary.total === 0} onClick={onConfirm}>{t("archive.clean_confirm")}</button>
      </div>
    </dialog>,
    document.body
  );
}
