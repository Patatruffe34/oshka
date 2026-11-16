import { useMemo, useRef, type ComponentProps, type CSSProperties } from "react";
import { useColumnSwipe } from "../hooks/useColumnSwipe";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cardsByLabel } from "../lib/cards-by-label";
import { useI18n } from "../lib/i18n";
import { colorHex } from "../lib/palette";
import { shortTrail } from "../lib/planner";
import PlannerCard from "./PlannerCard";

type LabelsViewProps = Pick<ComponentProps<typeof PlannerCard>,
  "root" | "labels" | "onOpen" | "onLocate" | "onToggleDone" | "onClearLabels" | "cardActions">;

export default function LabelsView({ root, labels, ...cardProps }: LabelsViewProps) {
  const { t, locale } = useI18n();
  const lanes = useMemo(() => cardsByLabel(root, labels), [root, labels]);
  const sortedLabels = useMemo(() => {
    const byName = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    return labels.toSorted((a, b) => byName.compare(a.name, b.name));
  }, [labels, locale]);
  const lanesRef = useRef<HTMLDivElement>(null);
  const compact = useMediaQuery("(max-width: 640px)");
  useColumnSwipe(lanesRef, compact && lanes.size > 0, ":scope > .planner-lane");

  return (
    <div className="planner labels-view">
      {lanes.size === 0 ? (
        <div className="side-panel-empty">{t("labels.empty")}</div>
      ) : (
        <div className="planner-lanes" ref={lanesRef} role="region" aria-label={t("labels.title")} tabIndex={0}>
          {sortedLabels.map((label) => {
            const items = lanes.get(label.id)!;
            const name = label.name || t("labels.unnamed");
            const color = colorHex(label.color);
            return (
              <section key={label.id} className="planner-lane" aria-label={name}
                style={{ "--label-color": color ?? undefined } as CSSProperties}>
                <h3 className={`planner-lane-head label-pattern-${label.color}`}>
                  {label.emoji && <span className="labels-lane-emoji" aria-hidden="true">{label.emoji}</span>}
                  <span className="labels-lane-name" title={name}>{name}</span>
                  <span className="planner-count">{items.length}</span>
                </h3>
                <div className="planner-lane-body">
                  <div className="planner-lane-content">
                    {items.length === 0 && <p className="planner-nudge">{t("labels.column_empty")}</p>}
                    {items.map((item) => {
                      const steps = item.path.map((p) => p.cardTitle || t("board.untitled"));
                      if (steps.length === 0) steps.push(t("tabs.home"));
                      const where = {
                        ancestors: shortTrail(steps).slice(0, -1).join(" › "),
                        parent: steps.at(-1)!,
                        full: steps.join(" › "),
                      };
                      return <PlannerCard key={item.card.id} {...cardProps} root={root} labels={labels}
                        item={item} fullLabels where={where} />;
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
