import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";

export default function CardMoveToast({ text, onUndo, onOpen }: { text: string; onUndo: () => void; onOpen: () => void }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="undo-toast" role="status" aria-live="polite">
    <span className="undo-toast-text">{text}</span>
    <button className="undo-toast-btn" onClick={onUndo}>{t("history.undo")}</button>
    <button className="undo-toast-btn" onClick={onOpen}>{t("move.open")}</button>
  </div>;
}
