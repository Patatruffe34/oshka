import { IconOutline, IconMap } from "./icons";
import { useI18n } from "../lib/i18n";

/**
 * Two readings of the same tree, so they share one title: the list and the
 * shape. The week is not among them — it is a page, and it lives in a tab.
 *
 * Reaching them used to cost an icon each in the top bar; here they sit where
 * you already are when you want them — looking at the whole tree.
 */
interface ViewSwitchProps {
  view: "outline" | "map";
  /** Each view leaves out the switch to itself */
  onOutline?: () => void;
  onMap?: () => void;
}

export default function ViewSwitch({ view, onOutline, onMap }: ViewSwitchProps) {
  const { t } = useI18n();
  return (
    <div className="view-switch" role="group">
      <button
        className={view === "outline" ? "on" : ""}
        onClick={view === "outline" ? undefined : onOutline}
        aria-pressed={view === "outline"}
      >
        <IconOutline size={13} />
        {t("outline.title")}
      </button>
      <button
        className={view === "map" ? "on" : ""}
        onClick={view === "map" ? undefined : onMap}
        aria-pressed={view === "map"}
      >
        <IconMap size={13} />
        {t("mindmap.title")}
      </button>
    </div>
  );
}
