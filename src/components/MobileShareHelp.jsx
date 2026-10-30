import { useI18n } from "../lib/i18n";
import { IconArrow, IconPhone } from "./icons";

export default function MobileShareHelp() {
  const { t } = useI18n();
  return (
    <section aria-label={t("connections.mobile")}>
      <h3 className="connections-section-title">{t("connections.mobile")}</h3>
      <div className="connections-platforms">
        <article className="connection-card connection-mobile">
          <div className="connection-card-header">
            <span className="connection-symbol connection-symbol-phone"><IconPhone size={24} /></span>
            <div><h3>iPhone / iPad</h3><p>{t("connections.ios_hint")}</p></div>
          </div>
          <a className="connection-install" href="/shortcuts/Ajouter-a-Oshka.shortcut?download=1&v=2" download="Ajouter-a-Oshka.shortcut">{t("connections.install")}<IconArrow /></a>
          <details className="connection-guide">
            <summary>{t("connections.install_guide")}<IconArrow size={15} /></summary>
            <div className="connection-guide-body">
              <ol className="connection-steps"><li>{t("share.install_hint")}</li><li>{t("share.ios_use")}</li><li>{t("share.confirm")}</li></ol>
              <p className="connection-footnote">{t("share.ios_browser")}</p>
            </div>
          </details>
        </article>
        <article className="connection-card connection-mobile">
          <div className="connection-card-header">
            <span className="connection-symbol connection-symbol-android"><IconPhone size={24} /></span>
            <div><h3>Android</h3><p>{t("connections.android_hint")}</p></div>
          </div>
          <details className="connection-guide connection-android-guide">
            <summary>{t("connections.android_setup")}<IconArrow size={15} /></summary>
            <div className="connection-guide-body">
              <ol className="connection-steps"><li>{t("share.android_install")}</li><li>{t("share.android_use")}</li><li>{t("share.confirm")}</li></ol>
              <p className="connection-footnote">{t("share.android_update")}</p>
            </div>
          </details>
        </article>
      </div>
    </section>
  );
}
