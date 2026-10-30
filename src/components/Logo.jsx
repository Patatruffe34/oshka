/**
 * The Oshka mark: an O parting along its seam, with something showing inside.
 *
 * Drawn in `currentColor`, so it takes the colour of the text around it —
 * black on light, white on dark. To give the mark a colour of its own instead,
 * set `--logo-color` on any ancestor (see .logo in app.css).
 */
export default function Logo({ size = 20, className = "" }) {
  return (
    <svg
      className={`logo-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.9 13.6a11.1 11.1 0 0 1 22.2 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <path
        d="M4.9 18.4a11.1 11.1 0 0 0 22.2 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.9" fill="currentColor" />
    </svg>
  );
}
