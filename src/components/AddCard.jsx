import { useState, useRef, useEffect } from "react";
import { useI18n } from "../lib/i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isComposingKey, MOBILE_TEXT_ENTRY } from "../lib/text-entry";

export default function AddCard({ onAdd }) {
  const { t } = useI18n();
  const mobile = useMediaQuery(MOBILE_TEXT_ENTRY);
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    inputRef.current?.blur();
    setOpen(false);
    setVal("");
  };

  /** Mobile finishes the entry; desktop stays open for batch creation. */
  const submit = () => {
    const title = val.trim();
    if (!title) {
      close();
      return;
    }
    onAdd(title);
    if (mobile) { close(); return; }
    setVal("");
    inputRef.current?.focus();
    // Keep the freshly added card in view as the list grows
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: "nearest" });
    });
  };

  if (!open) {
    return (
      <div className="add-card-area">
        <button className="add-card-btn" onClick={() => setOpen(true)}>
          <span>+</span> {t("board.add_card")}
        </button>
      </div>
    );
  }

  return (
    <div className="add-card-area">
      <div className="add-card-form">
        <input
          ref={inputRef}
          className="add-card-input"
          placeholder={t("board.card_placeholder")}
          value={val}
          enterKeyHint={mobile ? "done" : "enter"}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (isComposingKey(e)) return;
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") close();
          }}
          // Clicking elsewhere closes the form, but only when nothing is typed
          onBlur={() => { if (!val.trim()) setOpen(false); }}
        />
        <div className="add-card-actions">
          <button className="btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
            {t("board.add")}
          </button>
          <button className="btn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={close}>
            {t("board.cancel")}
          </button>
          {!mobile && <span className="add-card-hint">{t("board.add_hint")}</span>}
        </div>
      </div>
    </div>
  );
}
