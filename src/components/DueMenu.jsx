import { useState } from "react";
import { dayFromNow } from "../lib/board-utils";
import { useI18n } from "../lib/i18n";
import {
  REPEAT_UNITS,
  REPEAT_MAX,
  DEFAULT_REPEAT,
  normalizeRepeat,
  nextOccurrence,
} from "../lib/repeat";

/**
 * Setting a due date, from the card or from its detail.
 *
 * Nearly every date anyone picks is one of three, so those come first and the
 * calendar is there for the rest.
 *
 * Repetition lives here rather than in a menu of its own because it is not a
 * separate idea: it is what the date does next. A card with no deadline has
 * nothing to repeat, so the switch sits below the date and, when it is turned
 * on without one, the date becomes today.
 */
export default function DueMenu({ value, onSet, onClear, onSetRepeat, repeat, title = true }) {
  const { t, locale } = useI18n();
  // What is in the count field while it is being typed, when that is not yet
  // a number the card could keep. Null the rest of the time.
  const [draft, setDraft] = useState(null);
  const rule = normalizeRepeat(repeat);
  const dateFmt = locale === "fr" ? "fr-FR" : "en-US";

  const change = (patch) => onSetRepeat({ ...(rule ?? DEFAULT_REPEAT), ...patch });

  /* What the next tick will do, said as a date rather than as a rule. "Every
     two weeks" is a promise; "then 24 Sept" is the thing you can check. */
  const upcoming = rule ? nextOccurrence(value, rule) : null;

  return (
    <div className="due-menu">
      {title && <span className="label-picker-title">{t("due.title")}</span>}
      <div className="due-presets">
        <button className="btn-ghost-sm" onClick={() => onSet(dayFromNow(0))}>
          {t("due.today")}
        </button>
        <button className="btn-ghost-sm" onClick={() => onSet(dayFromNow(1))}>
          {t("due.tomorrow")}
        </button>
        <button className="btn-ghost-sm" onClick={() => onSet(dayFromNow(7))}>
          {t("due.in_a_week")}
        </button>
      </div>
      <input
        type="date"
        className="modal-due-input"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) => onSet(e.target.value || null)}
      />

      {/* Some date pickers only schedule; card menus can also repeat. */}
      {onSetRepeat && (
        <div className="repeat-block">
          <label className="repeat-switch">
            <input
              type="checkbox"
              checked={Boolean(rule)}
              onChange={(e) => {
                setDraft(null);
                onSetRepeat(e.target.checked ? DEFAULT_REPEAT : null);
              }}
            />
            <span>{t("repeat.title")}</span>
          </label>

          {rule && (
            <>
              <div className="repeat-rule">
                <span className="repeat-every">{t("repeat.every")}</span>
                <input
                  type="number"
                  className="repeat-count"
                  min={1}
                  max={REPEAT_MAX}
                  step={1}
                  inputMode="numeric"
                  /* The field shows what is being typed; the card only ever
                     stores what makes sense. Without the draft, clearing the
                     field to retype it would snap the old number straight
                     back under the cursor. */
                  value={draft ?? rule.every}
                  aria-label={t("repeat.count")}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n)) change({ every: Math.min(Math.max(n, 1), REPEAT_MAX) });
                  }}
                  // Whatever half-written thing is left, the stored rule wins
                  onBlur={() => setDraft(null)}
                />
                <select
                  className="repeat-unit"
                  value={rule.unit}
                  aria-label={t("repeat.unit")}
                  onChange={(e) => change({ unit: e.target.value })}
                >
                  {REPEAT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(`repeat.unit_${unit}${rule.every > 1 ? "s" : ""}`)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="repeat-hint">
                {t("repeat.next", {
                  date: new Date(`${upcoming}T12:00:00`).toLocaleDateString(dateFmt, {
                    day: "numeric",
                    month: "short",
                  }),
                })}
              </p>
            </>
          )}
        </div>
      )}

      {value && (
        <button className="due-clear" onClick={onClear}>
          {t("due.clear")}
        </button>
      )}
    </div>
  );
}
