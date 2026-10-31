/** Shared colour palette for column accents and card labels. */
// `ink` is the text colour that wins the WCAG contrast check on that
// background: black on all of them except grey, where white scores higher
// (4.83 vs 4.34). Measured, not eyeballed.
export interface PaletteColor {
  id: string;
  label: string;
  hex: string;
  ink?: "dark" | "light";
}

export const PALETTE: PaletteColor[] = [
  { id: "violet", label: "Violet", hex: "#7c6ef8", ink: "dark" },
  { id: "blue", label: "Blue", hex: "#3b82f6", ink: "dark" },
  { id: "cyan", label: "Cyan", hex: "#06b6d4", ink: "dark" },
  { id: "green", label: "Green", hex: "#22c55e", ink: "dark" },
  { id: "lime", label: "Lime", hex: "#84cc16", ink: "dark" },
  { id: "yellow", label: "Yellow", hex: "#eab308", ink: "dark" },
  { id: "orange", label: "Orange", hex: "#f97316", ink: "dark" },
  { id: "red", label: "Red", hex: "#ef4444", ink: "dark" },
  { id: "pink", label: "Pink", hex: "#ec4899", ink: "dark" },
  { id: "gray", label: "Gray", hex: "#6b7280", ink: "light" },
];

/** Column colours include a "none" option; labels always carry a colour. */
export const COL_COLORS: PaletteColor[] = [{ id: "", label: "None", hex: "" }, ...PALETTE];

export const colorHex = (id: string): string | null => PALETTE.find((c) => c.id === id)?.hex || null;

/** CSS class carrying the readable text colour for a label's background */
export const inkClass = (colorId: string): string =>
  PALETTE.find((c) => c.id === colorId)?.ink === "light" ? " label-ink-light" : "";

/** Sign/glyph colour that survives on a palette swatch, whatever the theme. */
export const colorInk = (id: string): string =>
  PALETTE.find((c) => c.id === id)?.ink === "light" ? "#f5f5f7" : "#0e0e11";
