import { useI18n } from "../lib/i18n";

export default function FavoritesPanel({ favorites, onGo, onRemove, onClose }) {
  const { t } = useI18n();

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <div className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="side-panel-header">
          <span className="side-panel-title">{t("favorites.title")}</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {favorites.length === 0 ? (
          <div className="side-panel-empty">{t("favorites.empty")}</div>
        ) : (
          <div className="side-panel-list">
            {favorites.map((fav) => {
              const trail = fav.path.map((s) => s.cardTitle).join(" › ");
              return (
                <div key={fav.id} className="side-panel-item">
                  <button
                    className="side-panel-item-main"
                    onClick={() => { onGo(fav); onClose(); }}
                  >
                    <span className="fav-icon">★</span>
                    <div className="side-panel-item-text">
                      <span className="side-panel-item-title">{fav.title}</span>
                      <span className="side-panel-item-sub">{trail}</span>
                    </div>
                  </button>
                  <button
                    className="side-panel-item-action danger"
                    onClick={() => onRemove(fav.id)}
                    title={t("favorites.remove")}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
