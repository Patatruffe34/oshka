import type { Settings } from "./types";

/**
 * What a board does when its owner has never said otherwise.
 *
 * Kept apart from useBoard so the MCP server, which runs the same rules
 * against the same document, reads the same defaults.
 */
export const DEFAULT_SETTINGS: Settings = {
  autoArchiveDone: false,
  confetti: true,
  doneOnDrop: true,
  moveOnDone: true,
  weekMode: "rolling",
};
