import { useState, useRef, useEffect, useMemo } from "react";
import { listBoardDestinations } from "../lib/board-utils";
import { useI18n } from "../lib/i18n";
import { colorHex } from "../lib/palette";
import MoveCardPanel from "./MoveCardPanel";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";
import type { Id, PathSegment, RootBoard } from "../lib/types";

const LAST_KEY = "oshka_week_destination";

/**
 * Write a card straight into a lane.
 *
 * The Agenda is not a board — it has no column of its own to drop a card into, so
 * a destination has to be named. It is remembered between adds: planning a day
 * usually means several cards into the same place, and re-picking it each time
 * would make the quick path the slow one.
 */
interface PlannerAddProps {
  root: RootBoard | null;
  onAdd: (title: string, path: PathSegment[], colId: Id) => void;
}

export default function PlannerAdd({ root, onAdd }: PlannerAddProps) {
  const { t } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const out = [];
    for (const dest of listBoardDestinations(root, null, t("header.root"))) {
      for (const col of dest.columns) {
        out.push({
          key: `${dest.path.map((p) => p.cardId).join("/")}|${col.id}`,
          path: dest.path,
          colId: col.id,
          boardTitle: dest.trail.at(-1) || t("board.untitled"),
          columnTitle: col.title || t("board.untitled"),
          emoji: col.emoji,
          color: colorHex(col.color),
          label: `${dest.trail.join(" › ")} · ${col.emoji ? `${col.emoji} ` : ""}${col.title}`,
        });
      }
    }
    return out;
  }, [root, t]);

  const [where, setWhere] = useState(() => localStorage.getItem(LAST_KEY) || "");
  // The remembered column can have been renamed away, or deleted outright
  const chosen = options.find((o) => o.key === where) ?? options[0];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    // Returning from a picker must not reopen the phone keyboard by itself.
    if (!mobile && open && !picking) inputRef.current?.focus();
  }, [open, picking, mobile]);

  if (options.length === 0) return null;

  const close = () => {
    inputRef.current?.blur();
    setOpen(false);
    setTitle("");
  };

  const submit = () => {
    const text = title.trim();
    if (!text || !chosen) {
      close();
      return;
    }
    onAdd(text, chosen.path, chosen.colId);
    if (mobile) { close(); return; }
    setTitle("");
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button className="planner-add-btn" onClick={() => setOpen(true)}>
        <span>+</span> {t("board.add_card")}
      </button>
    );
  }

  return (
    <div className="planner-add">
      <input
        ref={inputRef}
        className="add-card-input"
        value={title}
        enterKeyHint={mobile ? "done" : "enter"}
        placeholder={t("board.card_placeholder")}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (isComposingKey(e)) return;
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") close();
        }}
      />
      <button
        type="button"
        className="planner-add-where"
        onClick={() => { inputRef.current?.blur(); setPicking(true); }}
        aria-haspopup="dialog"
        aria-expanded={picking}
        aria-label={`${t("week.add_where")} : ${chosen.label}`}
        title={chosen.label}
      >
        <span className="planner-add-destination">
          <span className="planner-add-board">{chosen.boardTitle}</span>
          <span className="planner-add-column">
            <span className="column-pick-dot" style={chosen.color ? { background: chosen.color } : undefined} aria-hidden="true" />
            <span>{chosen.emoji && `${chosen.emoji} `}{chosen.columnTitle}</span>
          </span>
        </span>
        <span className="planner-add-chevron" aria-hidden="true">›</span>
      </button>
      {picking && (
        <MoveCardPanel
          root={root!}
          currentPath={chosen.path}
          currentColId={chosen.colId}
          onMove={(path, colId) => {
            const key = `${path.map((p) => p.cardId).join("/")}|${colId}`;
            setWhere(key);
            localStorage.setItem(LAST_KEY, key);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <div className="planner-add-actions">
        <button className="btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
          {t("board.add")}
        </button>
        <button className="btn-ghost" onClick={close}>
          {t("board.cancel")}
        </button>
      </div>
    </div>
  );
}
