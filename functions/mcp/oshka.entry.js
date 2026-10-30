/*
 * The app's own rules, for the MCP server.
 *
 * Bundled by vite.functions.config.js into build/oshka.cjs: src/lib is ESM
 * with extensionless imports, which Node cannot load as it stands. Running
 * the same code is the only way the server keeps agreeing with the app about
 * what ticking a repeating card does or what Horizon calls "this week".
 */
export {
  uid,
  makeCard,
  makeCol,
  makeChecklist,
  makeChecklistItem,
  makeDefaultLabels,
  visibleCards,
  cardLabels,
  cardChecklists,
  checklistProgress,
  isDoneColumn,
  markCardDone,
  fileUnderDone,
  moveCardAcrossBoards,
  getBoardAtPath,
} from "../../src/lib/board-utils";
export { isRepeating, nextOccurrence, rollCardOver, normalizeRepeat, REPEAT_UNITS } from "../../src/lib/repeat";
export { planWeek, LANES } from "../../src/lib/planner";
export { searchBoard } from "../../src/lib/search";
export { inboxCards, captureInboxCard, fileInboxCard, moveCardIntoInbox } from "../../src/lib/inbox";
export { DEFAULT_SETTINGS } from "../../src/lib/settings";
