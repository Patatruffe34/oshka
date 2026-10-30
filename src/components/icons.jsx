/**
 * Small monochrome icons for the card detail header.
 *
 * Drawn rather than picked from Unicode: glyphs like ⇩ or 🗃 either render as
 * coloured emoji or read as something else entirely (download, database).
 * All are 20-unit squares stroked in currentColor so they sit on the same
 * optical weight as each other.
 */
const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};

export function IconClose({ size = 20 }) {
  return <svg {...base} width={size} height={size}><path d="m5 5 10 10M15 5 5 15" /></svg>;
}

export function IconConnections({ size = 20 }) {
  return <svg {...base} width={size} height={size}><path d="m7 3 3 3m3-3 3 3M5 8l7-7M5 8l-1 1a5 5 0 0 0 7 7l1-1m-7-7 7 7m-8 2-2 2M9 4l7 7" /></svg>;
}

export function IconMail({ size = 20 }) {
  return <svg {...base} width={size} height={size}><rect x="2" y="4" width="16" height="12" rx="2" /><path d="m3 5 7 6 7-6" /></svg>;
}

export function IconPhone({ size = 20 }) {
  return <svg {...base} width={size} height={size}><rect x="5" y="2" width="10" height="16" rx="2" /><path d="M8 5h4m-3 10h2" /></svg>;
}

export function IconSlack({ size = 20 }) {
  return <svg {...base} width={size} height={size}><path d="M8 3v14M13 3v14M3 8h14M3 13h14" /></svg>;
}

export function IconArrow({ size = 17, back = false }) {
  return <svg {...base} width={size} height={size} style={back ? { transform: "rotate(180deg)" } : undefined}><path d="M3 10h14m-5-5 5 5-5 5" /></svg>;
}

export function IconCheck({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

/** An arrow leaving its container: move out of here, to somewhere else */
export function IconMove({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M10.5 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5" />
      <path d="M11 9l6-6" />
      <path d="M12.5 3H17v4.5" />
    </svg>
  );
}

/** A box with its lid: put away, still retrievable */
export function IconArchive({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2.5" y="3" width="15" height="4" rx="1" />
      <path d="M4 7v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
      <path d="M8 11h4" />
    </svg>
  );
}

export function IconClean({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M15.5 2.5l-7 8M6 9l6 4-3 4H2l2-6zM6 12l-2 5M9 14l-2 3" />
      <path d="M15 12h3M16.5 10.5v3" />
    </svg>
  );
}

export function IconInbox({ size = 20 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 4h14l1 8v4H2v-4z" />
      <path d="M2 12h5l1 2h4l1-2h5M7 7h6" />
    </svg>
  );
}

/** The same box, arrow coming back out */
export function IconUnarchive({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2.5" y="3" width="15" height="4" rx="1" />
      <path d="M4 7v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
      <path d="M10 15v-5" />
      <path d="M7.5 12.5L10 10l2.5 2.5" />
    </svg>
  );
}

/** Two stacked sheets: a copy alongside the original */
export function IconDuplicate({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="6.5" y="6.5" width="10.5" height="10.5" rx="2" />
      <path d="M13 3.5H5a1.5 1.5 0 0 0-1.5 1.5v8" />
    </svg>
  );
}

/** A calendar page — replaces the colour emoji, which broke the header's tone */
export function IconCalendar({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
      <path d="M2.5 8.5h15" />
      <path d="M6.5 2.5v3M13.5 2.5v3" />
    </svg>
  );
}

/** An indented list: the outline, and not the same mark as the burger menu */
export function IconOutline({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 5h14" />
      <path d="M7 10h10" />
      <path d="M11 15h6" />
    </svg>
  );
}

/** A funnel: narrow the board down */
export function IconFilter({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 4.5h14l-5.4 6.4v5.1l-3.2 1.5v-6.6z" />
    </svg>
  );
}

/** A hub with spokes: the radial map */
export function IconMap({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="10" cy="10" r="2.6" />
      <circle cx="10" cy="3" r="1.8" />
      <circle cx="16" cy="13.5" r="1.8" />
      <circle cx="4" cy="13.5" r="1.8" />
      <path d="M10 7.4V4.8M11.9 11.4l2.6 1.5M8.1 11.4l-2.6 1.5" />
    </svg>
  );
}

/** A luggage tag, corner-hung: the label, distinct from the filter's funnel */
export function IconTag({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M10.2 2.5H16a1.5 1.5 0 0 1 1.5 1.5v5.8a2 2 0 0 1-.6 1.4l-5.6 5.6a1.5 1.5 0 0 1-2.1 0l-5.2-5.2a1.5 1.5 0 0 1 0-2.1l5.6-5.6a2 2 0 0 1 1.4-.6z" />
      <path d="M13.6 6.4h.01" />
    </svg>
  );
}

/**
 * A compass: which way now.
 *
 * Not a spark — the view sorts what is already there by when it is due, and a
 * mark promising intelligence would be promising something it does not do.
 */
export function IconCompass({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="10" cy="10" r="7.6" />
      <path d="M13.4 6.6 L11.2 11.2 L6.6 13.4 L8.8 8.8 Z" />
    </svg>
  );
}

/* The header's own set. Drawn rather than borrowed from Unicode: ★ ⚙ ⏻ ☀ are
   text, so each arrives at a different width and the labels beside them never
   line up — and they sit at a different optical weight from the rest. */

export function IconSearch({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="8.8" cy="8.8" r="5.8" />
      <path d="M13.2 13.2 17 17" />
    </svg>
  );
}

export function IconStar({ size = 16, filled = false }) {
  return (
    <svg {...base} width={size} height={size} fill={filled ? "currentColor" : "none"}>
      <path d="M10 2.6l2.3 4.9 5.2.7-3.8 3.7.9 5.3-4.6-2.6-4.6 2.6.9-5.3L2.5 8.2l5.2-.7z" />
    </svg>
  );
}

export function IconTrash({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3.5 5.5h13" />
      <path d="M7.5 5.5V3.4h5v2.1" />
      <path d="M5.3 5.5l.8 10.3a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.8-10.3" />
    </svg>
  );
}

export function IconSun({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="10" cy="10" r="3.8" />
      <path d="M10 1.6v2M10 16.4v2M18.4 10h-2M3.6 10h-2M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4M15.9 15.9l-1.4-1.4M5.5 5.5L4.1 4.1" />
    </svg>
  );
}

export function IconMoon({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M16.2 12.3A7 7 0 0 1 7.7 3.8a7 7 0 1 0 8.5 8.5z" />
    </svg>
  );
}

export function IconGear({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="10" cy="10" r="2.9" />
      <path d="M15.8 12.3a1.4 1.4 0 0 0 .3 1.5l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-2.4 1v.2a1.7 1.7 0 1 1-3.4 0v-.1a1.4 1.4 0 0 0-2.4-1l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0-1-2.4h-.2a1.7 1.7 0 1 1 0-3.4h.1a1.4 1.4 0 0 0 1-2.4l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 2.4-1v-.2a1.7 1.7 0 1 1 3.4 0v.1a1.4 1.4 0 0 0 2.4 1l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0 1 2.4h.2a1.7 1.7 0 1 1 0 3.4h-.1a1.4 1.4 0 0 0-1.3.9z" />
    </svg>
  );
}

export function IconPower({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M10 2.6v7.6" />
      <path d="M14.8 5.2a6.8 6.8 0 1 1-9.6 0" />
    </svg>
  );
}

export function IconUndo({ size = 16 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6.6 5.4L3 9l3.6 3.6" />
      <path d="M3 9h8.4a5 5 0 0 1 0 10H7.6" />
    </svg>
  );
}
