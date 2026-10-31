import { visibleCards } from "../lib/board-utils";
import { colorHex } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import type { Column, Id } from "../lib/types";

/**
 * The columns of the board a card sits on, as rows to move it to.
 *
 * Changing column is most of what moving a card is, and the full picker makes
 * it the hardest case: the board you are on, buried in a list of every board
 * in the tree. Here it takes one tap. The rest of the tree is one row further,
 * for the moves that really do leave.
 */
interface ColumnPickerProps {
  columns: Column[];
  currentColId: Id;
  onPick: (colId: Id) => void;
  /** Offers the rest of the tree; left out when there is nowhere else */
  onElsewhere?: () => void;
}

export default function ColumnPicker({ columns, currentColId, onPick, onElsewhere }: ColumnPickerProps) {
  const { t } = useI18n();

  return (
    <>
      {columns.map((col) => {
        const here = col.id === currentColId;
        const hex = colorHex(col.color);
        return (
          <button
            key={col.id}
            className={`card-menu-row column-pick${here ? " here" : ""}`}
            disabled={here}
            aria-current={here || undefined}
            title={here ? t("move.already_here") : undefined}
            onClick={() => onPick(col.id)}
          >
            <span
              className="column-pick-dot"
              style={hex ? { background: hex } : undefined}
              aria-hidden="true"
            />
            {col.emoji && <span className="column-pick-emoji">{col.emoji}</span>}
            <span className="column-pick-name">{col.title || t("board.untitled")}</span>
            {here ? (
              <span className="column-pick-mark" aria-hidden="true">&#10003;</span>
            ) : (
              <span className="column-pick-count">{visibleCards(col).length}</span>
            )}
          </button>
        );
      })}

      {onElsewhere && (
        <>
          <span className="card-menu-sep" />
          <button className="card-menu-row" onClick={onElsewhere}>
            <span className="card-menu-glyph" aria-hidden="true">&#8599;</span>
            {t("move.other_board")}
          </button>
        </>
      )}
    </>
  );
}
