/**
 * The mark, opening.
 *
 * The logo is already a doll: an O parted along its seam with something inside.
 * The top half is a lid hinged where the two halves meet on the right; it
 * swings open, then the whole shell — lid and base together — fades away. What
 * is left is the dot at the centre, and a doll grows out of it, ending exactly
 * where the first one stood. Which is the shape of the product, drawn once.
 */

/*

 * The mark is 32 units, but the lid swings well outside it: measured across
 * the whole rotation, the motion runs x 2.7 to 41.5 and y -10.8 to 31.7, which
 * needs 27 units of half-side around the centre. An SVG clips at its viewBox,
 * so the box holds all of it, centred on the mark so it stays put while the
 * lid travels.
 *
 * `size` stays the size of the mark; the element around it is larger.
 */
const BOX = 56;
const MARK = 32;

export default function LoadingLogo({ size = 64 }) {
  return (
    <svg
      className="oshka-loader"
      width={(size * BOX) / MARK}
      height={(size * BOX) / MARK}
      viewBox={`${16 - BOX / 2} ${16 - BOX / 2} ${BOX} ${BOX}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* One shell that leaves as one piece — the lid only hinges inside it */}
      <g className="oshka-shell">
        <path d="M4.9 18.4a11.1 11.1 0 0 0 22.2 0" />
        <g className="oshka-lid">
          <path d="M4.9 13.6a11.1 11.1 0 0 1 22.2 0" />
        </g>
      </g>

      {/* The doll grows out of this, and its own dot lands back on it, so the
          dot is never taken away — it is the thing that grows. */}
      <g className="oshka-next">
        <path d="M4.9 13.6a11.1 11.1 0 0 1 22.2 0" />
        <path d="M4.9 18.4a11.1 11.1 0 0 0 22.2 0" />
        <circle cx="16" cy="16" r="2.9" />
      </g>

      <circle className="oshka-core" cx="16" cy="16" r="2.9" />
    </svg>
  );
}
