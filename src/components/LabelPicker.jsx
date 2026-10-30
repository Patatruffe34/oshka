import { useState, useRef } from "react";
import { PALETTE, colorHex, inkClass } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import EmojiGrid from "./EmojiGrid";
import Popover from "./Popover";
import { isComposingKey } from "../lib/text-entry";

/** One label row's emoji button plus its floating grid */
function LabelEmojiButton({ label, onPick, title }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  return (
    <>
      <button
        ref={btnRef}
        className="label-row-btn"
        onClick={() => setOpen((v) => !v)}
        title={title}
      >
        {label.emoji || "\u263A"}
      </button>
      {open && (
        <Popover anchorRef={btnRef} align="right" onClose={() => setOpen(false)}>
          <EmojiGrid
            current={label.emoji || ""}
            onPick={(emoji) => { onPick(emoji); setOpen(false); }}
          />
        </Popover>
      )}
    </>
  );
}

/**
 * Label editor: toggle labels on the card, rename them, recolour them, or add
 * new ones. Labels are shared across the whole board tree, so renaming one here
 * renames it everywhere — the hint below the list says so.
 */
export default function LabelPicker({
  labels,
  selected,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
}) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const cancelEdit = useRef(false);

  const startEdit = (label) => {
    setEditingId(label.id);
    setDraftName(label.name || "");
  };

  const commitEdit = () => {
    if (editingId) onUpdate(editingId, { name: draftName.trim() });
    setEditingId(null);
  };

  return (
    <div className="label-picker">
      <div className="label-picker-header">
        <span className="label-picker-title">{t("labels.title")}</span>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      <div className="label-picker-list">
        {labels.length === 0 && (
          <div className="label-picker-empty">{t("labels.empty")}</div>
        )}
        {labels.map((label) => {
          const isOn = selected.includes(label.id);
          return (
            <div key={label.id} className="label-row">
              <button
                className={`label-swatch label-pattern-${label.color}${inkClass(label.color)}${isOn ? " selected" : ""}`}
                style={{ backgroundColor: colorHex(label.color) || "var(--surface3)" }}
                onClick={() => onToggle(label.id)}
                aria-pressed={isOn}
                title={label.name || t("labels.unnamed")}
              >
                {isOn && <span className="label-swatch-check">&#10003;</span>}
                {label.emoji && (
                  <span className="label-swatch-emoji">{label.emoji}</span>
                )}
                {editingId !== label.id && (
                  <span className="label-swatch-name">{label.name}</span>
                )}
              </button>

              <LabelEmojiButton
                label={label}
                title={t("labels.emoji")}
                onPick={(emoji) => onUpdate(label.id, { emoji })}
              />

              {editingId === label.id ? (
                <input
                  className="label-name-input"
                  value={draftName}
                  enterKeyHint="done"
                  autoFocus
                  placeholder={t("labels.name_placeholder")}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    if (cancelEdit.current) { cancelEdit.current = false; setEditingId(null); }
                    else commitEdit();
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
                <button
                  className="label-row-btn"
                  onClick={() => startEdit(label)}
                  title={t("labels.rename")}
                >
                  &#9998;
                </button>
              )}

              {confirmDeleteId === label.id ? (
                <button
                  className="label-row-btn danger"
                  onClick={() => { onDelete(label.id); setConfirmDeleteId(null); }}
                  onMouseLeave={() => setConfirmDeleteId(null)}
                  title={t("labels.confirm_delete")}
                >
                  ?
                </button>
              ) : (
                <button
                  className="label-row-btn danger"
                  onClick={() => setConfirmDeleteId(label.id)}
                  title={t("labels.delete")}
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="label-picker-add">
        <span className="label-picker-add-title">{t("labels.add")}</span>
        <div className="label-picker-colors">
          {PALETTE.map((c) => (
            <button
              key={c.id}
              className={`label-add-swatch label-pattern-${c.id}`}
              style={{ backgroundColor: c.hex }}
              onClick={() => onAdd("", c.id)}
              title={c.label}
            />
          ))}
        </div>
      </div>

      <p className="label-picker-hint">{t("labels.shared_hint")}</p>
    </div>
  );
}
