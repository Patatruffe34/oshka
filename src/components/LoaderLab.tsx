import { useState, useRef, useEffect, useCallback } from "react";
import LoadingLogo from "./LoadingLogo";

/**
 * A bench for the loading mark, so it can be watched and picked apart.
 *
 * It renders the real component against the real stylesheet rather than a
 * copy: a copy would drift from what actually ships, which is exactly when a
 * bench stops being worth anything.
 *
 * Development only — mounted from main.tsx at #loader.
 */
const SPEEDS = [1, 0.5, 0.25];

export default function LoaderLab() {
  const stage = useRef<HTMLDivElement | null>(null);
  const [speed, setSpeed] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null); // null = running
  const [duration, setDuration] = useState(2.8);

  // The cycle length belongs to the stylesheet, so it is read, not restated.
  // Measured from the ref callback: the node is there, and it runs once.
  const attachStage = useCallback((node: HTMLDivElement | null) => {
    stage.current = node;
    if (!node) return;
    const el = node.querySelector(".oshka-lid");
    const d = el && parseFloat(getComputedStyle(el).animationDuration);
    if (d) setDuration(d);
  }, []);

  useEffect(() => {
    const marks = stage.current?.querySelectorAll<SVGElement>(
      ".oshka-lid, .oshka-shell, .oshka-core, .oshka-next"
    );
    marks?.forEach((el) => {
      el.style.animationDuration = `${duration / speed}s`;
      if (scrub == null) {
        el.style.animationPlayState = "running";
        el.style.animationDelay = "";
      } else {
        el.style.animationPlayState = "paused";
        el.style.animationDelay = `-${scrub / speed}s`;
      }
    });
  }, [speed, scrub, duration]);

  return (
    <div className="lab">
      <div className="lab-stage" ref={attachStage}>
        <div className="lab-slot">
          <LoadingLogo size={140} />
          <span className="lab-caption">140</span>
        </div>
        <div className="lab-slot">
          <LoadingLogo size={64} />
          <span className="lab-caption">64 — la taille livrée</span>
        </div>
        {/* On the ground it will actually be seen against, both ways round */}
        <div className="lab-slot lab-inverted">
          <LoadingLogo size={64} />
          <span className="lab-caption">64 sur fond clair</span>
        </div>
      </div>

      <div className="lab-controls">
        <button
          className="btn-ghost-sm"
          onClick={() => setScrub(scrub == null ? 0 : null)}
        >
          {scrub == null ? "Pause" : "Lecture"}
        </button>

        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn-ghost-sm${speed === s ? " lab-on" : ""}`}
            onClick={() => setSpeed(s)}
          >
            {s}&times;
          </button>
        ))}

        <input
          className="lab-scrub"
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={scrub ?? 0}
          onChange={(e) => setScrub(Number(e.target.value))}
        />
        <span className="lab-time">
          {scrub == null ? "en boucle" : `${scrub.toFixed(2)}s / ${duration}s`}
        </span>
      </div>

      <p className="lab-hint">
        Glisse la réglette pour figer une image · <a href="/">retour à l’app</a>
      </p>
    </div>
  );
}
