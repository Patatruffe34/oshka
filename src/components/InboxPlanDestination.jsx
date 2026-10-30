import { useState } from "react";
import { useI18n } from "../lib/i18n";
import MoveCardPanel from "./MoveCardPanel";

/** Keep an Inbox drop pending until the user chooses where the scheduled card lives. */
export default function InboxPlanDestination({ root, drop, onFile, onClose }) {
  const { t } = useI18n();
  const [notice, setNotice] = useState("");
  const card = root?.inbox?.find((item) => item.id === drop.cardId);
  if (!card) return null;
  return <MoveCardPanel root={root} card={card} currentPath={[]} currentColId={null} notice={notice}
    onClose={onClose} onMove={(path, colId) => {
      if (onFile(card.id, path, colId, undefined, undefined, drop) === false) {
        setNotice(t("inbox.stale_destination"));
        return;
      }
      onClose();
    }} />;
}
