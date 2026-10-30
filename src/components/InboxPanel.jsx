import { useEffect, useId, useRef, useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { INBOX_DROP_ID } from "../lib/inbox";
import { CAPTURE_UNFOLDED, foldCapture } from "../lib/inbox-motion";
import { useI18n } from "../lib/i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { dismissTextInput, isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";
import { IconInbox, IconMove, IconTrash, IconUndo } from "./icons";
import MoveCardPanel from "./MoveCardPanel";

/** The layout where the panel sits above the board and its height is scarce. */
const INBOX_STACKED = "(max-width: 640px)";

function InboxItem({ card, onOpen, onEdit, onFile, onDelete, provided, dragging }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const editRef = useRef(null);
  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);
  const save = () => {
    if (!text.trim()) return;
    onEdit(card.id, text);
    editRef.current?.blur();
    setEditing(false);
  };
  return (
    <li className={`inbox-item${dragging ? " is-dragging" : ""}`}
      ref={provided?.innerRef} {...provided?.draggableProps} {...provided?.dragHandleProps}
      aria-label={provided ? `${t("inbox.drag")} : ${card.title}` : undefined}>
      {editing ? (
        <div className="inbox-edit">
          <textarea ref={editRef} value={text} onChange={(e) => setText(e.target.value)}
            aria-label={t("inbox.edit")} rows={3} onKeyDown={(e) => {
              if (isComposingKey(e)) return;
              if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setEditing(false); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
            }} />
          <div className="inbox-edit-actions">
            <button className="btn-ghost" onClick={() => setEditing(false)}>{t("board.cancel")}</button>
            <button className="btn-primary" disabled={!text.trim()} onClick={save}>{t("inbox.save")}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="inbox-item-top">
          {provided && <span className="inbox-drag-handle" aria-hidden="true">⠿</span>}
          <div className="inbox-item-text" role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onOpen(card.id); } }}
            onClick={() => onOpen(card.id)}
            title={t("inbox.open")} aria-label={`${t("inbox.open")} : ${card.title}`}>
            {card.title}
          </div>
          </div>
          <div className="inbox-item-bottom">
            <span className="inbox-date">{card.capturedAt && new Date(card.capturedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" })}</span>
            <button className="inbox-edit-button" onClick={() => { setText(card.title); setEditing(true); }}
              aria-label={`${t("inbox.edit")} : ${card.title}`}>{t("inbox.edit")}</button>
            <button className="inbox-delete" onClick={() => onDelete(card.id)} title={t("inbox.delete")}
              aria-label={`${t("inbox.delete")} : ${card.title}`}><IconTrash size={15} /></button>
            <button className="inbox-file" onClick={() => onFile(card.id)}>
              <IconMove size={14} />{t("inbox.file")}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/** A separate capture space; closing it keeps both the board and draft intact. */
export default function InboxPanel({ open, root, cards, onAdd, onOpen, onEdit, onFile, onDelete, onClose, onUndo, canUndo, draggable = false }) {
  const { t } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  const stacked = useMediaQuery(INBOX_STACKED);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const foldRef = useRef(null);
  const foldTrack = useRef(CAPTURE_UNFOLDED);
  const titleId = useId();
  const [draft, setDraft] = useState("");
  const [filingId, setFilingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [foldedState, setFoldedState] = useState(false);
  const [captureFocused, setCaptureFocused] = useState(false);
  const filing = cards.find((card) => card.id === filingId);
  // Scrolling down the list folds the capture form away; focus or a draft keeps it.
  const pinned = captureFocused || draft !== "";
  const folded = stacked && foldedState && !pinned;
  const trackFold = (next) => {
    foldTrack.current = next;
    setFoldedState(next.folded);
  };
  const onListScroll = (event, dragging) => {
    const list = listRef.current;
    if (!stacked || dragging || !list) return;
    trackFold(foldCapture(foldTrack.current, {
      top: list.scrollTop,
      room: list.scrollHeight - list.clientHeight - (foldRef.current?.offsetHeight ?? 0),
      now: event.timeStamp,
      pinned,
    }));
  };

  const close = () => {
    dismissTextInput(panelRef.current);
    setFilingId(null);
    onClose();
  };
  const capture = () => {
    if (!draft.trim() || onAdd(draft.trim()) === false) return;
    setDraft("");
    setNotice(t("inbox.added"));
    if (mobile) inputRef.current?.blur();
    else inputRef.current?.focus();
  };

  const item = (card, provided, dragging) => <InboxItem key={card.id} card={card} provided={provided} dragging={dragging}
    onOpen={(id) => { dismissTextInput(panelRef.current); onOpen(id); }} onEdit={onEdit} onFile={(id) => { dismissTextInput(panelRef.current); setFilingId(id); setNotice(""); }}
    onDelete={(id) => { onDelete(id); setNotice(t("inbox.deleted")); }} />;
  const list = (provided) => <ul>
    {cards.map((card, index) => draggable ? (
      <Draggable key={card.id} draggableId={card.id} index={index}>
        {(dragProvided, snapshot) => item(card, dragProvided, snapshot.isDragging)}
      </Draggable>
    ) : item(card))}
    {provided?.placeholder}
  </ul>;

  // A drag measured the list already: its geometry must not change underneath.
  const dropArea = (provided, snapshot) => <div
    className={`inbox-list${snapshot?.isDraggingOver ? " is-over" : ""}`}
    ref={(el) => { listRef.current = el; provided?.innerRef(el); }} {...provided?.droppableProps}
    onScroll={(e) => onListScroll(e, snapshot?.isDraggingOver || !!snapshot?.draggingFromThisWith)}>
    {list(provided)}
    {cards.length === 0 && !snapshot?.isDraggingOver && <div className="inbox-empty" aria-hidden="true"><IconInbox size={38} /></div>}
  </div>;

  return (
    <aside ref={panelRef} id="oshka-inbox" className="inbox-panel" aria-labelledby={titleId} hidden={!open} aria-hidden={!open} inert={!open}
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.stopPropagation(); close(); } }}>
      <div className="inbox-shell">
        <header className="inbox-header">
          <span className="inbox-heading-icon"><IconInbox size={22} /></span>
          <h2 id={titleId}>{t("inbox.title")}</h2>
          <span className="inbox-count" aria-label={t("inbox.count", { n: cards.length })}>{cards.length}</span>
          <button className="icon-btn" disabled={!canUndo} onClick={onUndo} title={t("history.undo")} aria-label={t("history.undo")}><IconUndo /></button>
          <button className="modal-close" onClick={close} aria-label={t("inbox.close")}>&times;</button>
        </header>

        <div ref={foldRef} className={`inbox-capture-fold${folded ? " is-folded" : ""}`}><div>
        <form className="inbox-capture" onSubmit={(e) => { e.preventDefault(); capture(); }}
          onFocus={(e) => {
            setCaptureFocused(true);
            trackFold({ folded: false, anchor: listRef.current?.scrollTop ?? 0, changedAt: e.timeStamp });
          }}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setCaptureFocused(false); }}>
          <textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            placeholder={t("inbox.placeholder")} aria-label={t("inbox.placeholder")}
            enterKeyHint="done" onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isComposingKey(e)) { e.preventDefault(); capture(); }
            }} />
          <div className="inbox-capture-bottom">
            <button type="submit" className="btn-primary" disabled={!draft.trim() || !root}>
              <span aria-hidden="true">+</span> {t("board.add")}
            </button>
          </div>
        </form>
        </div></div>
        <div className="inbox-feedback" role="status">{notice}</div>
        <div className="inbox-list-heading">{t("inbox.to_file")}<span>{cards.length}</span></div>
        {draggable ? (
          <Droppable droppableId={INBOX_DROP_ID} type="card" isDropDisabled={!open}>
            {(provided, snapshot) => dropArea(provided, snapshot)}
          </Droppable>
        ) : dropArea()}
      </div>
      {open && filing && (
        <MoveCardPanel root={root} card={filing} currentPath={[]} currentColId={null}
          onMove={(path, colId) => {
            if (onFile(filing.id, path, colId) === false) { setNotice(t("inbox.stale_destination")); return; }
            setFilingId(null);
            setNotice(t("inbox.filed"));
          }} onClose={() => setFilingId(null)} />
      )}
    </aside>
  );
}
