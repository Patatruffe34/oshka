import { useState, useRef } from "react";
import { useI18n } from "../lib/i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Logo from "./Logo";
import Popover from "./Popover";
import CleanupMenu from "./CleanupMenu";
import {
  IconOutline, IconFilter, IconCompass, IconSearch, IconStar, IconTrash,
  IconSun, IconMoon, IconGear, IconPower, IconUndo, IconInbox,
} from "./icons";
import { LabelDots } from "./BoardFilter";
import { toggleIn } from "../lib/toggle";

export default function Header({
  path,
  pageTitle,
  saving,
  theme,
  onToggleTheme,
  onGoToBreadcrumb,
  onOpenCurrentCardDetail,
  onLogout,
  onOpenProfile,
  onOpenFavorites,
  onOpenTrash,
  onCleanArchives,
  archivedCount = 0,
  completedCount = 0,
  onArchiveDone,
  onOpenSearch,
  onOpenInbox,
  inboxOpen = false,
  inboxCount = 0,
  labels = [],
  labelFilter = [],
  onLabelFilterChange,
  onOpenOutline,
  onOpenWeek,
  weekOpen,
  onUndo,
  canUndo,
  onToggleFavorite,
  isFavorited,
  trashCount,
  userEmail,
  online,
}) {
  const { t, locale, changeLocale } = useI18n();
  // Eight icons need 264px — more than the whole breadcrumb gets on a phone.
  // Below this width everything but search folds into a menu.
  const compact = useMediaQuery("(max-width: 640px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const burgerRef = useRef(null);
  const pathRef = useRef(null);

  const currentTitle = path.length ? path[path.length - 1].cardTitle : t("header.root");

  const secondaryActions = (
    <>
      {/* No keyboard on a phone, so undo needs a real control there */}
      {compact && (
        <button
          className="icon-btn"
          onClick={() => { onUndo(); setMenuOpen(false); }}
          disabled={!canUndo}
          title={t("history.undo")}
        >
          <IconUndo />
          <span className="menu-label">{t("history.undo")}</span>
        </button>
      )}

      <button
        className="icon-btn"
        onClick={() => { onOpenOutline(); setMenuOpen(false); }}
        title={t("outline.title")}
      >
        <IconOutline />
        {compact && <span className="menu-label">{t("outline.title")}</span>}
      </button>

      <button
        className="icon-btn"
        onClick={() => { onOpenFavorites(); setMenuOpen(false); }}
        title={t("favorites.title")}
      >
        <IconStar />
        {compact && <span className="menu-label">{t("favorites.title")}</span>}
      </button>

      <button
        className="icon-btn icon-btn-badge-wrap"
        onClick={() => { onOpenTrash(); setMenuOpen(false); }}
        title={t("trash.title")}
      >
        <IconTrash />
        {/* Before the badge: in the menu the badge takes the free space, and
            anything after it is pushed to the far edge. */}
        {compact && <span className="menu-label">{t("trash.title")}</span>}
        {trashCount > 0 && <span className="icon-badge">{trashCount}</span>}
      </button>

      <CleanupMenu
        key={compact ? "mobile-clean" : "desktop-clean"}
        compact={compact}
        archivedCount={archivedCount}
        completedCount={completedCount}
        onArchiveDone={onArchiveDone}
        onCleanArchives={onCleanArchives}
        onAction={() => setMenuOpen(false)}
      />

      <button
        className="icon-btn lang-btn"
        onClick={() => changeLocale(locale === "en" ? "fr" : "en")}
        title={locale === "en" ? "Français" : "English"}
      >
        <span className="icon-slot">{locale === "en" ? "EN" : "FR"}</span>
        {compact && <span className="menu-label">{locale === "en" ? "Français" : "English"}</span>}
      </button>

      <button
        className="icon-btn"
        onClick={onToggleTheme}
        title={theme === "dark" ? t("header.theme_light") : t("header.theme_dark")}
      >
        {theme === "dark" ? <IconSun /> : <IconMoon />}
        {compact && (
          <span className="menu-label">
            {theme === "dark" ? t("header.theme_light") : t("header.theme_dark")}
          </span>
        )}
      </button>

      <button
        className="icon-btn"
        onClick={() => { onOpenProfile(); setMenuOpen(false); }}
        title={userEmail}
      >
        <IconGear />
        {compact && <span className="menu-label">{t("profile.title")}</span>}
      </button>

      <button className="icon-btn" onClick={onLogout} title={t("header.logout")}>
        <IconPower />
        {compact && <span className="menu-label">{t("header.logout")}</span>}
      </button>
    </>
  );

  return (
    <div className="header">
      {!compact && (
        <button className="inbox-trigger" onClick={onOpenInbox} title={t("inbox.title")}
          aria-label={t("inbox.count", { n: inboxCount })} aria-controls="oshka-inbox" aria-expanded={inboxOpen}>
          <IconInbox size={18} /><span>{t("inbox.title")}</span>
          {inboxCount > 0 && <span className="inbox-trigger-count">{inboxCount}</span>}
        </button>
      )}
      <span className="logo">
        <Logo size={18} />
        <span className="logo-word">Oshka</span>
      </span>

      {pageTitle ? (
        /* A view tab has no position in the tree, so it names itself */
        <span className="page-title">{pageTitle}</span>
      ) : compact ? (
        /* The tree has no depth limit, so no horizontal breadcrumb can hold.
           Up one level stays a button of its own — it is the frequent move —
           and the full path opens vertically, where depth costs nothing. */
        <div className="crumb-compact">
          {path.length > 0 && (
            <button
              className="crumb-up"
              onClick={() => onGoToBreadcrumb(path.length - 2)}
              title={t("header.up")}
              aria-label={t("header.up")}
            >
              &lsaquo;
            </button>
          )}
          <button
            ref={pathRef}
            className="crumb-current"
            onClick={() => setPathOpen((v) => !v)}
            aria-expanded={pathOpen}
            title={t("header.path")}
          >
            <span className="crumb-current-name">{currentTitle}</span>
            <span className="crumb-chevron" aria-hidden="true">&#9662;</span>
          </button>

          {pathOpen && (
            <Popover anchorRef={pathRef} onClose={() => setPathOpen(false)}>
              <div className="crumb-panel">
                <span className="label-picker-title">{t("header.path")}</span>
                <button
                  className={`crumb-step${path.length === 0 ? " current" : ""}`}
                  onClick={() => { onGoToBreadcrumb(-1); setPathOpen(false); }}
                >
                  <span className="crumb-step-rail" />
                  {t("header.root")}
                </button>
                {path.map((p, i) => (
                  <button
                    key={p.cardId}
                    className={`crumb-step${i === path.length - 1 ? " current" : ""}`}
                    style={{ paddingLeft: 14 + (i + 1) * 12 }}
                    onClick={() => { onGoToBreadcrumb(i); setPathOpen(false); }}
                  >
                    <span className="crumb-step-rail" />
                    {p.cardTitle}
                  </button>
                ))}
                {path.length > 0 && onOpenCurrentCardDetail && (
                  <button
                    className="crumb-step crumb-details"
                    onClick={() => {
                      setPathOpen(false);
                      onOpenCurrentCardDetail();
                    }}
                  >
                    {t("header.card_details")}
                  </button>
                )}
                {path.length > 0 && (
                  <button
                    className="crumb-step crumb-favorite"
                    onClick={() => {
                      onToggleFavorite();
                      setPathOpen(false);
                    }}
                    aria-pressed={isFavorited}
                  >
                    <IconStar size={14} filled={isFavorited} />
                    {isFavorited ? t("favorites.remove") : t("favorites.add")}
                  </button>
                )}
              </div>
            </Popover>
          )}
        </div>
      ) : (
        <div className="breadcrumb">
          <div className="breadcrumb-item">
            <button
              className={`breadcrumb-btn ${path.length === 0 ? "active" : ""}`}
              onClick={() => onGoToBreadcrumb(-1)}
            >
              {t("header.root")}
            </button>
          </div>
          {path.map((p, i) => (
            <div key={p.cardId} className="breadcrumb-item">
              <span className="breadcrumb-sep">&rsaquo;</span>
              <button
                className={`breadcrumb-btn ${i === path.length - 1 ? "active" : ""}`}
                onClick={() => onGoToBreadcrumb(i)}
                title={p.cardTitle}
              >
                {p.cardTitle}
              </button>
              {i === path.length - 1 && (
                <>
                  {onOpenCurrentCardDetail && (
                    <button
                      className="breadcrumb-detail"
                      onClick={onOpenCurrentCardDetail}
                      title={t("header.card_details")}
                      aria-label={t("header.card_details")}
                    >
                      {t("header.details")}
                    </button>
                  )}
                  <button
                    className={`breadcrumb-fav${isFavorited ? " active" : ""}`}
                    onClick={onToggleFavorite}
                    title={isFavorited ? t("favorites.remove") : t("favorites.add")}
                  >
                    <IconStar size={14} filled={isFavorited} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {path.length > 0 && (
        <span className="depth-badge">{t("header.depth")} {path.length}</span>
      )}

      <div className="header-actions">
        {!online && (
          <span className="offline-indicator" title={t("header.offline_hint")}>
            {t("header.offline")}
          </span>
        )}
        {saving && <span className="saving-indicator">{t("header.saving")}</span>}

        <button
          className="icon-btn"
          onClick={onOpenSearch}
          title={`${t("search.title")}  ⌘K`}
        >
          <IconSearch />
        </button>

        {/* On a phone the filter sits beside search rather than as a standing
            bar over the board, which was costing vertical space full time. */}
        {compact && labels.length > 0 && (
          <>
            <button
              ref={filterRef}
              className={`icon-btn${labelFilter.length > 0 ? " icon-btn-on" : ""}`}
              onClick={() => setFilterOpen((v) => !v)}
              title={t("filter.title")}
              aria-expanded={filterOpen}
            >
              <IconFilter />
              {labelFilter.length > 0 && (
                <span className="icon-badge icon-badge-accent">{labelFilter.length}</span>
              )}
            </button>
            {filterOpen && (
              <Popover anchorRef={filterRef} align="right" onClose={() => setFilterOpen(false)}>
                <div className="filter-menu">
                  <span className="label-picker-title">{t("filter.title")}</span>
                  <LabelDots
                    labels={labels}
                    selected={labelFilter}
                    size="lg"
                    onToggle={(id) => onLabelFilterChange(toggleIn(labelFilter, id))}
                  />
                  {labelFilter.length > 0 && (
                    <button
                      className="filter-menu-clear"
                      onClick={() => { onLabelFilterChange([]); setFilterOpen(false); }}
                    >
                      {t("filter.clear")}
                    </button>
                  )}
                </div>
              </Popover>
            )}
          </>
        )}

        {compact ? (
          <>
            <button
              ref={burgerRef}
              className="icon-btn icon-btn-badge-wrap"
              onClick={() => setMenuOpen((v) => !v)}
              title={t("header.menu")}
              aria-expanded={menuOpen}
            >
              &#9776;
              {trashCount > 0 && !menuOpen && <span className="icon-badge">{trashCount}</span>}
            </button>
            {menuOpen && (
              <Popover anchorRef={burgerRef} align="right" onClose={() => setMenuOpen(false)}>
                <div className="header-menu">{secondaryActions}</div>
              </Popover>
            )}
          </>
        ) : (
          secondaryActions
        )}
      </div>

      {/* Reached far more often than anything in the menu, and a thumb is
          nearer the bottom of a phone than its top corner. It is the way back
          as well as the way in, so it shows which of the two it will do. */}
      {compact && (
        <button className="week-fab inbox-fab" onClick={onOpenInbox} title={t("inbox.title")}
          aria-label={t("inbox.count", { n: inboxCount })} aria-controls="oshka-inbox" aria-expanded={inboxOpen}>
          <IconInbox size={20} />
        </button>
      )}
      {compact && (
        <button
          className={`week-fab${weekOpen ? " on" : ""}`}
          onClick={onOpenWeek}
          aria-pressed={weekOpen}
          aria-label={weekOpen ? t("week.close") : t("week.title")}
          title={weekOpen ? t("week.close") : t("week.title")}
        >
          {weekOpen ? <span className="week-fab-close">&times;</span> : <IconCompass size={20} />}
        </button>
      )}
    </div>
  );
}
