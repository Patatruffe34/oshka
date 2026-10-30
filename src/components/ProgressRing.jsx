import { useState, useEffect } from "react";
import Logo from "./Logo";

const R = 5;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * How far a card's own board has come, drawn as a ring that fills.
 *
 * Finished, the ring closes into the mark: an O with something inside — the
 * board is done, and what it held is still in there.
 */
/* Whether each ring was last drawn complete, kept across navigation. The last
   card is usually ticked inside the board, with its ring off screen; this is
   how the ring still closes in front of you when you come back up. */
const lastSeen = new Map();

export default function ProgressRing({ id, done, total, size = 12 }) {
  const complete = total > 0 && done >= total;
  /* The closing plays when it happens, not every time a finished board comes
     into view — a board of finished cards would otherwise pop all at once. */
  const [closing, setClosing] = useState(() => complete && lastSeen.get(id) === false);
  const [wasComplete, setWasComplete] = useState(complete);
  if (complete !== wasComplete) {
    setWasComplete(complete);
    setClosing(complete);
  }
  useEffect(() => { lastSeen.set(id, complete); }, [id, complete]);

  if (complete) {
    return <Logo size={size} className={`progress-ring${closing ? " closed" : ""}`} />;
  }
  const filled = total > 0 ? done / total : 0;
  return (
    <svg
      className="progress-ring"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="progress-ring-track" cx="7" cy="7" r={R} />
      <circle
        className="progress-ring-fill"
        cx="7"
        cy="7"
        r={R}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - filled)}
      />
    </svg>
  );
}
