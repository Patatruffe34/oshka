import { colorHex } from "../lib/palette";
import { useI18n } from "../lib/i18n";
import { toggleIn } from "../lib/toggle";

/** The label swatches, shared by the desktop bar and the mobile menu */
export function LabelDots({ labels, selected, onToggle, size = "sm" }) {
  const { t } = useI18n();
  return (
    <div className={`board-filter-dots${size === "lg" ? " lg" : ""}`}>
      {labels.map((label) => (
        <button
          key={label.id}
          className={`board-filter-dot label-pattern-${label.color}${
            selected.includes(label.id) ? " on" : ""
          }`}
          style={{ backgroundColor: colorHex(label.color) }}
          onClick={() => onToggle(label.id)}
          aria-pressed={selected.includes(label.id)}
          title={[label.emoji, label.name].filter(Boolean).join(" ") || t("labels.unnamed")}
        />
      ))}
    </div>
  );
}

/**
 * Desktop filter bar: floats over the board, dim until used.
 *
 * On a phone this lives in the header instead — a permanent bar there costs
 * vertical space the board needs more.
 */
export default function BoardFilter({ labels, selected, onChange }) {
  const { t } = useI18n();
  const active = selected.length > 0;

  return (
    <div className={`board-filter${active ? " active" : ""}`}>
      <span className="board-filter-label">{t("filter.title")}</span>
      <LabelDots
        labels={labels}
        selected={selected}
        onToggle={(id) => onChange(toggleIn(selected, id))}
      />
      {active && (
        <button className="board-filter-clear" onClick={() => onChange([])}>
          {t("filter.clear")}
        </button>
      )}
    </div>
  );
}
