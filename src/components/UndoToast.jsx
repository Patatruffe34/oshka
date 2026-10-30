import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";

const VISIBLE_MS = 2600;

/**
 * Brief confirmation that something was undone, with the reverse move to hand.
 *
 * Undo is invisible by nature — without this you cannot tell whether the
 * shortcut did anything, nor what it took back.
 */
export default function UndoToast({ event, onUndo, onRedo, canUndo, canRedo }) {
  const { t } = useI18n();
  // Mounted fresh for each event (the parent keys on its timestamp), so the
  // lifetime is simply this instance's own.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  const undone = event.direction === "undo";
  const action = event.label ? t(`history.action.${event.label}`) : null;

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-text">
        {undone ? t("history.undone") : t("history.redone")}
        {action && <span className="undo-toast-what">{action}</span>}
      </span>
      <button
        className="undo-toast-btn"
        onClick={undone ? onRedo : onUndo}
        disabled={undone ? !canRedo : !canUndo}
      >
        {undone ? t("history.redo") : t("history.undo")}
      </button>
    </div>
  );
}
