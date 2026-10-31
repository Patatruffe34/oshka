import { useState, useRef, useEffect } from "react";
import { useI18n } from "../lib/i18n";
import { isComposingKey } from "../lib/text-entry";

export default function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    if (val.trim()) {
      onAdd(val.trim());
      inputRef.current?.blur();
      setVal("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <div className="add-col-wrap">
        <button className="add-col-btn" onClick={() => setOpen(true)}>
          + {t("board.add_column")}
        </button>
      </div>
    );
  }

  return (
    <div className="add-col-wrap">
      <div className="add-col-form">
        <input
          ref={inputRef}
          className="add-col-input"
          placeholder={t("board.col_placeholder")}
          value={val}
          enterKeyHint="done"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (isComposingKey(e)) return;
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            if (e.key === "Escape") { inputRef.current?.blur(); setOpen(false); setVal(""); }
          }}
        />
        <div className="add-card-actions">
          <button className="btn-primary" onClick={submit}>{t("board.create")}</button>
          <button className="btn-ghost" onClick={() => { inputRef.current?.blur(); setOpen(false); setVal(""); }}>{t("board.cancel")}</button>
        </div>
      </div>
    </div>
  );
}
