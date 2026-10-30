import { useEffect, useRef, useState } from "react";
import { cardLabels, checklistProgress, subBoardProgress, getBoardAtPath } from "../lib/board-utils";
import { isRepeating } from "../lib/repeat";
import { colorHex, inkClass } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import { isComposingKey } from "../lib/text-entry";
import { useCardShortcuts } from "../hooks/useCardShortcuts";
import { IconCompass, IconCheck } from "./icons";
import CardMenu from "./CardMenu";
import Popover from "./Popover";

/** A card keeps its source address while the Plan groups it by date. */
export default function PlannerCard({ item, root, labels, fullLabels, where, cardRef, draggableProps, dragHandleProps, isDragging, onOpen, onLocate, onToggleDone, cardActions }) {
  const { t, locale } = useI18n();
  const dateFmt = locale === "fr" ? "fr-FR" : "en-US";
  const { card } = item;
  const own = cardLabels(card);
  const list = checklistProgress(card);
  const sub = subBoardProgress(card.board);
  const columns = getBoardAtPath(root, item.path)?.columns;
  const menuRef = useRef(null);
  const titleRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState("root");

  useEffect(() => {
    if (!editing) return;
    const input = titleRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);

  useEffect(() => {
    const input = titleRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [editing, card.title]);

  useCardShortcuts({
    enabled: hovered && !editing && !isDragging,
    onAction: (action) => {
      if (action === "rename") setEditing(true);
      else if (action === "archive") cardActions.onArchive(item);
      else {
        setMenuView(action);
        setMenuOpen(true);
      }
    },
  });

  return (
    <>
    <div
      ref={cardRef}
      {...draggableProps}
      {...dragHandleProps}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      className={`planner-card${item.overdue ? " overdue" : ""}${isDragging ? " lifting" : ""}`}
      /* Opening the card must not cost you the view you
         are planning from — it opens over it. */
      onClick={(e) => {
        if (editing || e.target.closest("button, a, input, textarea")) return;
        if (e.metaKey || e.ctrlKey) onLocate(item, { background: true });
        else onOpen(item);
      }}
      onAuxClick={(e) => {
        if (e.button !== 1 || e.target.closest("button, a, input, textarea")) return;
        e.preventDefault();
        onLocate(item, { background: true });
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || isDragging || e.key !== "Enter") return;
        e.preventDefault();
        onOpen(item);
      }}
    >
      {/* One click, from here: finishing a card while
          planning should not cost a trip into it. */}
      <button
        className="card-check planner-done"
        title={t("week.done")}
        aria-label={t("week.done")}
        onClick={(e) => {
          e.stopPropagation();
          const box = e.currentTarget.getBoundingClientRect();
          onToggleDone(item, {
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
          });
        }}
      >
        <span className="card-check-mark">
          <IconCheck size={12} />
        </span>
      </button>

      {own.length > 0 && (
        <span className="planner-labels">
          {labels.filter((l) => own.includes(l.id)).map((l) =>
            fullLabels ? (
              <span
                key={l.id}
                className={`label-chip planner-chip label-pattern-${l.color}${inkClass(l.color)}`}
                style={{ backgroundColor: colorHex(l.color) || "var(--surface3)" }}
              >
                {l.emoji && <span className="label-chip-emoji">{l.emoji}</span>}
                {l.name}
              </span>
            ) : (
              <span
                key={l.id}
                className={`outline-label-dot label-pattern-${l.color}`}
                style={{ backgroundColor: colorHex(l.color) }}
                title={[l.emoji, l.name].filter(Boolean).join(" ")}
              />
            )
          )}
        </span>
      )}
      {editing ? (
        <textarea
          ref={titleRef}
          className="card-title-input planner-card-title"
          aria-label={t("card.rename")}
          value={card.title}
          rows={1}
          enterKeyHint="done"
          onChange={(e) => cardActions.onRename(item, e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (isComposingKey(e)) return;
            if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <span className="planner-card-title">{card.title || t("board.untitled")}</span>
      )}
      {!editing && (
        <div className="planner-card-actions">
          <button
            className="planner-locate"
            title={t("week.locate")}
            aria-label={t("week.locate")}
            onClick={(e) => {
              e.stopPropagation();
              onLocate(item, { background: e.metaKey || e.ctrlKey });
            }}
          ><IconCompass size={13} /></button>
          <button
            ref={menuRef}
            className="planner-more planner-locate"
            title={t("card.more")}
            aria-label={t("card.more")}
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuView("root");
              setMenuOpen((v) => !v);
            }}
          >&#8943;</button>
        </div>
      )}

      {/* No group header to say where this lives, so the
          card says it itself — under its own title, the
          name first and the address second. */}
      {where && (
        <span className="planner-card-origin" title={`${where.full} › ${item.colEmoji ? `${item.colEmoji} ` : ""}${item.colTitle || t("board.untitled")}`}>
          <span className="planner-card-board">
            {where.ancestors && <span className="planner-card-ancestors">{where.ancestors} › </span>}
            <span className="planner-parent">{where.parent}</span>
          </span>
          <span className="planner-origin-sep" aria-hidden="true">›</span>
          <span className="planner-origin-col">
            {item.colEmoji && <span aria-hidden="true">{item.colEmoji}</span>}
            <span>{item.colTitle || t("board.untitled")}</span>
          </span>
        </span>
      )}

      <span className="planner-card-meta">
        {item.card.dueAt && (
          <span className={`planner-date${item.overdue ? " late" : ""}`}>
            {new Date(`${item.card.dueAt.slice(0, 10)}T12:00:00`)
              .toLocaleDateString(dateFmt, { day: "numeric", month: "short" })}
            {/* Worth knowing before you plan around it:
                this one is coming back either way. */}
            {isRepeating(item.card) && (
              <span className="due-badge-repeat" aria-hidden="true">&#8635;</span>
            )}
          </span>
        )}
        {list.total > 0 && (
          <span className="outline-chip">&#9745; {list.done}/{list.total}</span>
        )}
        {sub.total > 0 && (
          <span className="outline-chip">&#9679; {sub.done}/{sub.total}</span>
        )}
      </span>
    </div>
    {menuOpen && (
      <Popover anchorRef={menuRef} align="right" onClose={() => setMenuOpen(false)}>
        <div onClick={(e) => e.stopPropagation()}>
          <CardMenu
            card={card}
            labels={labels}
            initialView={menuView}
            onClose={() => setMenuOpen(false)}
            onRename={() => setEditing(true)}
            onEnterInTab={() => cardActions.onEnterInTab(item)}
            onDelete={() => cardActions.onDelete(item)}
            onArchive={() => cardActions.onArchive(item)}
            onToggleLabel={(id) => cardActions.onToggleLabel(item, id)}
            onSetDue={(value) => cardActions.onSetDue(item, value)}
            onSetRepeat={(value) => cardActions.onSetRepeat(item, value)}
            onAddLabel={cardActions.onAddLabel}
            onUpdateLabel={cardActions.onUpdateLabel}
            onDeleteLabel={cardActions.onDeleteLabel}
            columns={columns}
            colId={item.colId}
            onMoveTo={(colId) => cardActions.onMoveTo(item, colId)}
            onMoveElsewhere={() => cardActions.onMoveElsewhere(item)}
          />
        </div>
      </Popover>
    )}
    </>
  );
}
