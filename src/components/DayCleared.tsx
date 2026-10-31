import Logo from "./Logo";
import LoadingLogo from "./LoadingLogo";
import { useI18n } from "../lib/i18n";

/**
 * What the today lane says once there is nothing left in it.
 *
 * Emptied in front of you, the mark opens once — the loader's own gesture, the
 * doll that was in there coming out — and says the day is done. Found empty,
 * it only says so: there is nothing to celebrate in a day that never had
 * anything in it.
 */
export default function DayCleared({ celebrate }: { celebrate: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`day-cleared${celebrate ? " celebrate" : ""}`} role="status">
      {celebrate ? <LoadingLogo size={40} /> : <Logo size={22} />}
      <span className="day-cleared-title">
        {t(celebrate ? "week.cleared" : "week.today_empty")}
      </span>
      {celebrate && <span className="day-cleared-sub">{t("week.cleared_sub")}</span>}
    </div>
  );
}
