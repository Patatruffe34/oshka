import { useState, useMemo, useRef, useCallback, useEffect, type PointerEvent, type WheelEvent } from "react";
import { buildMindTree, radialLayout, allNodeKeys, keysBelowDepth, type PlacedNode } from "../lib/mindmap";
import { colorHex, colorInk } from "../lib/palette";
import { dueState, cardLabels } from "../lib/board-utils";
import ViewSwitch from "./ViewSwitch";
import { useI18n } from "../lib/i18n";
import type { Label, PathSegment, RootBoard } from "../lib/types";

interface Viewport {
  x: number;
  y: number;
  /** Zoom */
  k: number;
}

const RADIUS_STEP = 112;
const ZOOM_LIMITS = [0.25, 2.5];
// The disc that opens a board sits here, in screen space, never rotated with
// the branch — so it is in the same place on every node you point at.
const JUMP_X = 22;

/** Curved link between two placed nodes, bowing along the circle */
function edgePath(from: PlacedNode, to: PlacedNode) {
  // Control point on the parent's radius at the child's angle: the link leaves
  // the parent outward, then bends into the child's direction.
  const cx = Math.cos(to.angle) * from.radius;
  const cy = Math.sin(to.angle) * from.radius;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

/**
 * The tree as a disc, root at the centre, branches fanning out.
 *
 * A list tells you what is nested; this shows the shape — which branches carry
 * the weight, which are stubs, whether the whole thing is lopsided.
 */
interface MindMapProps {
  root: RootBoard;
  labels: Label[];
  /** Where you stand, marked on the map */
  path: PathSegment[];
  onGo: (path: PathSegment[]) => void;
  onOpenOutline: () => void;
  onClose: () => void;
}

export default function MindMap({ root, labels, path, onGo, onOpenOutline, onClose }: MindMapProps) {
  const { t } = useI18n();
  // A phone cannot hold six rings at a readable scale, so it opens on the
  // first ones and the rest unfolds on demand.
  const [collapsed, setCollapsed] = useState(() =>
    window.matchMedia("(max-width: 640px)").matches
      ? keysBelowDepth(buildMindTree(root, "", () => false), 3)
      : new Set<string>()
  );
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: Viewport } | null>(null);

  const tree = useMemo(
    () => buildMindTree(root, t("header.root"), (k) => collapsed.has(k)),
    [root, collapsed, t]
  );
  const { nodes, edges } = useMemo(
    () => radialLayout(tree, { radiusStep: RADIUS_STEP }),
    [tree]
  );
  const foldable = useMemo(() => allNodeKeys(buildMindTree(root, "", () => false)), [root]);
  const currentKey = path.map((p) => p.cardId).join("/");

  /**
   * Frame the content, not the origin.
   *
   * Branches rarely spread evenly, so centring on the root leaves a wide empty
   * side and pushes the dense side off-screen. This centres the actual extent.
   */
  const fit = useCallback(() => {
    const el = surfaceRef.current;
    if (!el || nodes.length === 0) return;
    const { width, height } = el.getBoundingClientRect();

    // Room for the labels running outward; more than this wastes zoom, and a
    // deep tree is already tight.
    const pad = 90;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - 30;
    const maxY = Math.max(...ys) + 30;

    const k = Math.max(
      ZOOM_LIMITS[0],
      Math.min(ZOOM_LIMITS[1], Math.min(width / (maxX - minX), height / (maxY - minY)))
    );
    setView({
      k,
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
    });
  }, [nodes]);

  useEffect(() => { fit(); }, [fit]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const enter = (p: PathSegment[]) => { onGo(p); onClose(); };

  // ── Pan & zoom ──
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-node]")) return; // let node clicks through
    drag.current = { x: e.clientX, y: e.clientY, view };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    setView({
      ...drag.current.view,
      x: drag.current.view.x + (e.clientX - drag.current.x),
      y: drag.current.view.y + (e.clientY - drag.current.y),
    });
  };
  const endDrag = () => { drag.current = null; };

  const onWheel = (e: WheelEvent) => {
    const el = surfaceRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    setView((v) => {
      const k = Math.max(
        ZOOM_LIMITS[0],
        Math.min(ZOOM_LIMITS[1], v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
      );
      // Keep the point under the cursor fixed while scaling
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);


  // Zoomed far out every label overlaps its neighbours and the map turns to
  // mush. Below this only the inner rings keep theirs, which is enough to know
  // where you are; zooming in brings the rest back.
  // A six-level tree fits at roughly k=0.4, so the first threshold has to sit
  // below that or the whole map opens with almost no labels at all.
  const labelDepth = view.k < 0.3 ? 1 : view.k < 0.62 ? 3 : Infinity;

  const unfoldAll = () => setCollapsed(new Set<string>());

  return (
    <div className="mindmap">
      <header className="mindmap-bar">
        <ViewSwitch view="map" onOutline={onOpenOutline} />
        <div className="mindmap-actions">
          <button className="btn-ghost-sm" onClick={fit}>{t("mindmap.fit")}</button>
          {foldable.size > 0 && (
            <button
              className="btn-ghost-sm"
              onClick={() => (collapsed.size > 0 ? unfoldAll() : setCollapsed(new Set(foldable)))}
            >
              {collapsed.size > 0 ? t("outline.expand_all") : t("outline.collapse_all")}
            </button>
          )}
          <button className="modal-close" onClick={onClose} title={t("board.cancel")}>
            &times;
          </button>
        </div>
      </header>

      <div
        className="mindmap-surface"
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <svg className="mindmap-svg" role="presentation">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {edges.map((e) => (
              <path
                key={e.key}
                d={edgePath(e.from, e.to)}
                className={`mm-edge${hover && (hover === e.to.key || hover === e.from.key) ? " lit" : ""}`}
              />
            ))}

            {nodes.map((n) => {
              if (n.kind === "root") {
                return (
                  <g key="root" data-node transform={`translate(${n.x} ${n.y})`}
                     onClick={() => enter([])} className="mm-node mm-root">
                    <circle r="30" />
                    <text dy="4">{n.label}</text>
                  </g>
                );
              }

              const isColumn = n.kind === "column";
              const hex = isColumn ? colorHex(n.color!) : null;
              const due = !isColumn ? dueState(n.card!.dueAt, n.card!.done) : null;
              const own = !isColumn ? cardLabels(n.card!) : [];
              const here = !isColumn && n.key.split("/").filter((_, i) => i % 2).join("/") === currentKey;
              // Labels on the left half read upside-down without this flip
              const flip = Math.cos(n.angle) < 0;

              // A column is a bucket, not a board — there is nothing to enter.
              const canEnter = !isColumn;
              const canFold = n.children.length > 0 || n.collapsed;
              const isHover = hover === n.key;
              const goPath = canEnter ? (n.hasChildren ? n.childPath : n.path) : null;

              // The jump disc sits at the node's absolute right, so on branches
              // heading that way the label would run straight through it.
              const clash =
                isHover && canEnter && !flip && Math.abs(Math.tan(n.angle)) * JUMP_X < 13;

              return (
                <g
                  key={n.key}
                  data-node
                  className={`mm-node ${isColumn ? "mm-col" : "mm-card"}${
                    !isColumn && n.card!.done ? " done" : ""
                  }${here ? " here" : ""}`}
                  transform={`translate(${n.x} ${n.y})`}
                  onMouseEnter={() => setHover(n.key)}
                  onMouseLeave={() => setHover(null)}
                  /* Folding is the move you make over and over while reading the
                     map, so it gets the whole node. Entering a board leaves the
                     map entirely, so it gets its own target. */
                  onClick={() => (canFold ? toggle(n.key) : canEnter && enter(goPath!))}
                >
                  {/* Glyph and disc do not touch, and crossing the gap would
                      drop the hover that reveals the disc — leaving it visible
                      but unreachable. One pad spans both. */}
                  {canEnter && (
                    <rect className="mm-hit" x="-11" y="-11"
                          width={JUMP_X + 22} height="22" rx="11" />
                  )}

                  {isColumn ? (
                    <rect x="-7" y="-7" width="14" height="14" rx="3"
                          style={hex ? { fill: hex } : undefined} />
                  ) : (
                    <circle r={n.hasChildren ? 8 : 5} />
                  )}

                  {/* Which way the click will go, shown on the node itself */}
                  {canFold && (
                    <path
                      className="mm-sign"
                      style={hex ? { stroke: colorInk(n.color!) } : undefined}
                      d={n.collapsed ? "M -3.5 0 H 3.5 M 0 -3.5 V 3.5" : "M -3.5 0 H 3.5"}
                    />
                  )}

                  {own.length > 0 && (
                    <g className="mm-labels">
                      {labels.filter((l) => own.includes(l.id)).slice(0, 3).map((l, i) => (
                        <rect key={l.id} x={-9 + i * 7} y="-15" width="5" height="4" rx="1"
                              style={{ fill: colorHex(l.color) ?? undefined }} />
                      ))}
                    </g>
                  )}

                  {(n.depth <= labelDepth || isHover) && (
                  <g transform={`rotate(${(n.angle * 180) / Math.PI + (flip ? 180 : 0)})`}>
                    <text
                      className="mm-label"
                      x={(flip ? -14 : 14) + (clash ? 20 : 0)}
                      dy="4"
                      textAnchor={flip ? "end" : "start"}
                    >
                      {n.emoji ? `${n.emoji} ` : ""}
                      {n.label || t("board.untitled")}
                      {/* Counts sat in the title's own colour and size, so they
                          read as part of the name. Set apart instead. */}
                      {isColumn && n.count! > 0 && (
                        <tspan className="mm-count" dx="7">
                          {n.done! > 0 ? `${n.done}/${n.count}` : n.count}
                        </tspan>
                      )}
                      {/* A folded column already states its size, so +N there
                          would just print the same number twice. */}
                      {n.collapsed && n.hidden !== n.count && (
                        <tspan className="mm-hidden" dx="7">+{n.hidden}</tspan>
                      )}
                    </text>
                  </g>
                  )}

                  {due && <circle className={`mm-due due-${due}`} r="3" cx="0" cy="12" />}

                  {canEnter && (
                    <g
                      className="mm-jump"
                      onClick={(e) => { e.stopPropagation(); enter(goPath!); }}
                    >
                      <title>{t("detail.open_board")}</title>
                      <circle r="9" cx={JUMP_X} cy="0" />
                      {/* The breadcrumb already reads › as "one level deeper" */}
                      <path d={`M ${JUMP_X - 2} -3.2 L ${JUMP_X + 2.2} 0 L ${JUMP_X - 2} 3.2`} />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <footer className="mindmap-hint">{t("mindmap.hint")}</footer>
    </div>
  );
}
