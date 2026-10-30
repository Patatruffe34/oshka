import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { IconArchive, IconClean, IconTrash } from "./icons";

export default function CleanupMenu({ compact, completedCount = 0, archivedCount = 0, onArchiveDone, onCleanArchives, onAction }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const keyboardEdge = useRef(null);
  const id = useId();

  const focusEdge = (last = false) => {
    const items = panelRef.current?.querySelectorAll("button:not(:disabled)");
    const item = last ? items?.[items.length - 1] : items?.[0];
    (item ?? triggerRef.current)?.focus();
  };

  useEffect(() => {
    if (!open || compact) return;
    if (keyboardEdge.current) {
      focusEdge(keyboardEdge.current === "last");
      keyboardEdge.current = null;
    }
    const outside = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open, compact]);

  const choose = (action) => {
    setOpen(false);
    triggerRef.current?.focus();
    onAction?.();
    action();
  };

  const actions = (
    <>
      <button
        className="cleanup-action"
        role={compact ? undefined : "menuitem"}
        tabIndex={compact ? undefined : -1}
        disabled={completedCount === 0}
        onClick={() => choose(onArchiveDone)}
        title={t("clean.all_boards")}
      >
        <IconArchive />
        <span className="cleanup-action-text">{t("clean.archive_done")}</span>
        <span className="cleanup-action-count" aria-hidden="true">{completedCount}</span>
      </button>
      <button
        className="cleanup-action cleanup-danger"
        role={compact ? undefined : "menuitem"}
        tabIndex={compact ? undefined : -1}
        disabled={archivedCount === 0}
        onClick={() => choose(onCleanArchives)}
        title={t("clean.all_boards")}
      >
        <IconTrash />
        <span className="cleanup-action-text">{t("archive.clean")}</span>
        <span className="cleanup-action-count" aria-hidden="true">{archivedCount}</span>
      </button>
    </>
  );

  if (compact) return (
    <section className="cleanup-mobile" aria-labelledby={id}>
      <div id={id} className="cleanup-heading"><IconClean /><span>{t("clean.title")}</span></div>
      <div className="cleanup-mobile-actions">{actions}</div>
    </section>
  );

  return (
    <div
      ref={wrapRef}
      className="cleanup-control"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!panelRef.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation();
          setOpen(false); triggerRef.current?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          if (!open) {
            keyboardEdge.current = e.key === "ArrowUp" || e.key === "End" ? "last" : "first";
            setOpen(true);
            return;
          }
          const items = [...panelRef.current.querySelectorAll("button:not(:disabled)")];
          if (items.length === 0) return;
          const at = items.indexOf(document.activeElement);
          const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 :
            e.key === "ArrowDown" ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
          items[next]?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        className="icon-btn"
        title={t("clean.title")}
        aria-label={t("clean.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          if (!open && e.detail === 0) keyboardEdge.current = "first";
          setOpen((value) => !value);
        }}
      >
        <IconClean />
      </button>
      {open && (
        <div className="cleanup-popover">
          <div ref={panelRef} id={id} className="cleanup-panel" role="menu" aria-label={t("clean.title")}>
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
