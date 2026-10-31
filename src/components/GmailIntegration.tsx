import { useEffect, useId, useState } from "react";
import { auth } from "../lib/firebase";
import { useI18n } from "../lib/i18n";
import { IconArrow, IconDuplicate, IconMail } from "./icons";

async function request(path: string, method = "GET", signal?: AbortSignal) {
  const token = await auth.currentUser!.getIdToken();
  const response = await fetch(`/integrations/gmail/${path}`, { method, signal, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("unavailable");
  return response.status === 204 ? null : response.json();
}

export default function GmailIntegration() {
  const { t } = useI18n();
  const codeId = useId();
  const [status, setStatus] = useState("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const connected = status === "connected";
  useEffect(() => {
    const controller = new AbortController();
    request("link", "GET", controller.signal).then((result) => {
      if (!controller.signal.aborted) setStatus(result.connected ? "connected" : "ready");
    }).catch(() => { if (!controller.signal.aborted) setStatus("unavailable"); });
    return () => controller.abort();
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setNotice("");
    try { await action(); } catch { setNotice(t("gmail.unavailable")); }
    finally { setBusy(false); }
  };
  const statusKey = connected ? "linked" : status === "loading" ? "checking" : status === "unavailable" ? "unavailable" : "not_linked";
  return (
    <section className="connection-card connection-gmail" aria-label="Gmail">
      <div className="connection-card-header">
        <span className="connection-symbol connection-symbol-gmail"><IconMail size={24} /></span>
        <div><h3>Gmail</h3><p>{t("gmail.hint")}</p></div>
        <span className={`connection-status${connected ? " is-connected" : ""}`}><i aria-hidden="true" />{t(`connections.${statusKey}`)}</span>
      </div>
      <details className="connection-guide connection-slack-guide">
        <summary>{t(connected ? "gmail.manage" : "gmail.connect")}<IconArrow size={15} /></summary>
        <div className="connection-guide-body">
          <p className="connection-footnote">{t(connected ? "gmail.connected" : "gmail.install_hint")}</p>
          {!connected && <ol className="connection-steps"><li>{t("gmail.step_one")}</li><li>{t("gmail.step_two")}</li><li>{t("gmail.step_three")}</li></ol>}
          <p className="connection-footnote">{t("gmail.privacy")}</p>
          <div className="connection-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => run(async () => setCode((await request("link-code", "POST")).code))}>{t("slack.code")}</button>
            {connected && <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(async () => {
              await request("link", "DELETE"); setStatus("ready"); setCode(""); setNotice(t("gmail.disconnected"));
            })}>{t("gmail.disconnect")}</button>}
          </div>
          {code && <div className="connection-code-wrap">
            <label htmlFor={codeId}>{t("slack.expires")}</label>
            <div className="connection-code">
              <input id={codeId} className="auth-input" readOnly value={code} onFocus={(event) => event.target.select()} />
              <button type="button" className="btn-ghost" title={t("slack.copy")} aria-label={t("slack.copy")} onClick={async () => {
                try { await navigator.clipboard.writeText(code); setNotice(t("slack.copied")); }
                catch { setNotice(t("slack.select_code")); }
              }}><IconDuplicate /></button>
            </div>
          </div>}
          {notice && <p className="connection-notice" role="status">{notice}</p>}
        </div>
      </details>
      {status === "unavailable" && <p className="connection-footnote connection-load-error" role="status">{t("gmail.unavailable")}</p>}
    </section>
  );
}
