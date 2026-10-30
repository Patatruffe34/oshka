import { useState, useRef } from "react";
import { useI18n } from "../lib/i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";

/** One checklist: title, progress bar, items, and an inline "add item" row. */
export default function Checklist({
  list,
  onRename,
  onDelete,
  onAddItem,
  onToggleItem,
  onUpdateItem,
  onDeleteItem,
}) {
  const { t } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  const addRef = useRef(null);
  const cancelEdit = useRef(false);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = list.items.filter((i) => i.done).length;
  const total = list.items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const submitItem = () => {
    const text = newItem.trim();
    if (!text) { addRef.current?.blur(); setAdding(false); return; }
    onAddItem(text);
    setNewItem("");
    if (mobile) { addRef.current?.blur(); setAdding(false); }
    else addRef.current?.focus();
  };

  const commitEdit = (itemId) => {
    const text = draft.trim();
    if (text) onUpdateItem(itemId, text);
    setEditingId(null);
  };

  return (
    <div className="checklist">
      <div className="checklist-header">
        <input
          className="checklist-title"
          value={list.title}
          enterKeyHint="done"
          onChange={(e) => onRename(e.target.value)}
          onKeyDown={(e) => {
            if (isComposingKey(e)) return;
            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
          }}
        />
        <span className="checklist-count">{done}/{total}</span>
        {confirmDelete ? (
          <button
            className="checklist-del confirm"
            onClick={onDelete}
            onMouseLeave={() => setConfirmDelete(false)}
            title={t("board.confirm_delete")}
          >
            ?
          </button>
        ) : (
          <button
            className="checklist-del"
            onClick={() => setConfirmDelete(true)}
            title={t("checklist.delete")}
          >
            &times;
          </button>
        )}
      </div>

      <div className="checklist-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`checklist-bar-fill${total > 0 && done === total ? " complete" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="checklist-items">
        {list.items.map((item) => (
          <div key={item.id} className={`checklist-item${item.done ? " done" : ""}`}>
            <button
              className={`checklist-check${item.done ? " checked" : ""}`}
              onClick={() => onToggleItem(item.id)}
              aria-pressed={item.done}
            >
              <span className="checklist-check-mark">&#10003;</span>
            </button>
            {editingId === item.id ? (
              <input
                className="checklist-item-input"
                value={draft}
                enterKeyHint="done"
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (cancelEdit.current) { cancelEdit.current = false; setEditingId(null); }
                  else commitEdit(item.id);
                }}
                onKeyDown={(e) => {
                  if (isComposingKey(e)) return;
                  if (e.key === "Enter" || e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelEdit.current = e.key === "Escape";
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <span
                className="checklist-item-text"
                onClick={() => { setEditingId(item.id); setDraft(item.text); }}
              >
                {item.text}
              </span>
            )}
            <button
              className="checklist-item-del"
              onClick={() => onDeleteItem(item.id)}
              title={t("checklist.delete_item")}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="checklist-add-form">
          <input
            ref={addRef}
            className="checklist-item-input"
            value={newItem}
            enterKeyHint={mobile ? "done" : "enter"}
            autoFocus
            placeholder={t("checklist.item_placeholder")}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (isComposingKey(e)) return;
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); submitItem(); }
              if (e.key === "Escape") { e.stopPropagation(); addRef.current?.blur(); setAdding(false); setNewItem(""); }
            }}
            onBlur={() => { if (!newItem.trim()) setAdding(false); }}
          />
          <button
            className="btn-primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submitItem}
          >
            {t("board.add")}
          </button>
        </div>
      ) : (
        <button className="checklist-add-btn" onClick={() => setAdding(true)}>
          + {t("checklist.add_item")}
        </button>
      )}
    </div>
  );
}
