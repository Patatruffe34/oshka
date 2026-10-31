import { useState } from "react";
import { useI18n } from "../lib/i18n";
import MoveCardPanel from "./MoveCardPanel";
import type { InboxPlan } from "../lib/inbox";
import type { Id, PathSegment, RootBoard } from "../lib/types";

/** Keep an Inbox drop pending until the user chooses where the scheduled card lives. */
interface InboxPlanDestinationProps {
  root: RootBoard;
  /** The Inbox card dropped on a day, and where it landed */
  drop: InboxPlan;
  /** useBoard's fileInbox: false when the destination no longer exists */
  onFile: (id: Id, path: PathSegment[], colId: Id, index?: number, labelFilter?: Id[], planning?: InboxPlan) => boolean;
  onClose: () => void;
}

export default function InboxPlanDestination({ root, drop, onFile, onClose }: InboxPlanDestinationProps) {
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
