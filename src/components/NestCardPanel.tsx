import { useState } from "react";
import { resolveBoardAtPath, type CardLocation } from "../lib/board-utils";
import { INBOX_DROP_ID, inboxCards } from "../lib/inbox";
import { useI18n } from "../lib/i18n";
import type { NestDestination } from "../lib/card-nesting";
import type { PathSegment, RootBoard } from "../lib/types";
import MoveCardPanel from "./MoveCardPanel";

export interface NestDrop {
  from: CardLocation;
  path: PathSegment[];
}

export default function NestCardPanel({ root, drop, onMove, onClose }: {
  root: RootBoard;
  drop: NestDrop;
  onMove: (from: CardLocation, to: NestDestination) => boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [notice, setNotice] = useState("");
  const { from } = drop;
  const card = from.colId === INBOX_DROP_ID
    ? inboxCards(root).find((item) => item.id === from.cardId)
    : resolveBoardAtPath(root, from.path)?.columns.find((col) => col.id === from.colId)?.cards.find((item) => item.id === from.cardId);
  if (!card) return null;

  return <MoveCardPanel root={root} card={card} currentColId={from.colId} currentPath={[...from.path]}
    initialPath={drop.path} allowSetup notice={notice} onClose={onClose}
    onMove={(path, colId, initialColumns) => {
      if (!onMove(from, { path, colId, initialColumns })) {
        setNotice(t("move.stale_destination"));
        return;
      }
      onClose();
    }} />;
}
