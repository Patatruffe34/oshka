import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { useI18n } from "../lib/i18n";
import { IconArrow, IconClose, IconInbox } from "./icons";
import MobileShareHelp from "./MobileShareHelp";
import SlackIntegration from "./SlackIntegration";
import GmailIntegration from "./GmailIntegration";

export default function ConnectionsModal({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const headingId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current!.querySelector("button")?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls = [...panelRef.current!.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input, summary")]
      .filter((element) => !element.closest("details:not([open])") || element.tagName === "SUMMARY");
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="modal-overlay connections-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <section ref={panelRef} className="modal-card connections-modal" role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={descriptionId} onClick={(event) => event.stopPropagation()}>
        <header className="connections-header">
          <div>
            <button type="button" className="connections-back" onClick={onBack}><IconArrow back />{t("profile.title")}</button>
            <h2 id={headingId}>{t("connections.title")}</h2>
            <p id={descriptionId}>{t("connections.subtitle")}</p>
          </div>
          <button type="button" className="modal-close connections-close" onClick={onClose} aria-label={t("connections.close")}><IconClose /></button>
        </header>
        <div className="connections-body">
          <div className="connections-destination">
            <IconInbox size={24} />
            <div><span>{t("connections.destination")}</span><strong>{t("inbox.title")}</strong></div>
            <p>{t("connections.destination_hint")}</p>
          </div>
          <GmailIntegration />
          <SlackIntegration />
          <MobileShareHelp />
        </div>
      </section>
    </div>
  );
}
