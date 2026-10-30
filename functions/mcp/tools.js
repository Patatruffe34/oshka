const { z } = require("zod");
const {
  uid: newId,
  makeCard,
  makeCol,
  makeChecklist,
  makeChecklistItem,
  inboxCards,
  captureInboxCard,
  fileInboxCard,
  moveCardIntoInbox,
  moveCardAcrossBoards,
  getBoardAtPath,
  isDoneColumn,
  markCardDone,
  fileUnderDone,
  isRepeating,
  nextOccurrence,
  rollCardOver,
  normalizeRepeat,
  planWeek,
  searchBoard,
  visibleCards,
  cardChecklists,
  REPEAT_UNITS,
  LANES,
} = require("./build/oshka.cjs");
const { ToolError, loadBoard, updateBoard } = require("./store");
const {
  ROOT,
  INBOX,
  fold,
  locateCard,
  locateBoard,
  findColumn,
  columnName,
  trailText,
  resolveLabels,
  cardLine,
  outline,
} = require("./tree");

const INSTRUCTIONS = `Oshka is a kanban where every card holds a whole board of its own, to any depth: boards have columns, columns have cards, and each card opens onto another board.

- Every tool addresses cards by id. Ids are unique across the tree; get_outline, search_cards, get_agenda and list_inbox hand them out. "root" names the top board.
- A column whose emoji contains ✅ marks a board meant to progress. Finishing a card files it there, and moving a card into it finishes it.
- A repeating card is never finished: completing it moves its due date to the next occurrence and unticks its checklists.
- The Inbox holds captures not filed anywhere yet. add_to_inbox is the quickest way to note something; move_card files it later.
- Due dates are calendar days (YYYY-MM-DD) in the user's timezone.
- Nothing here deletes. To put a card away, archive it with update_card.`;

/** Long trees must not swamp the conversation */
const MAX_CHARS = 40000;
const LANE_LIMIT = 25;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = () => z.string().regex(DAY, "a calendar day, YYYY-MM-DD");
const cardId = () => z.string().describe("Card id");
const boardRef = () =>
  z.string().optional().describe(`Card id whose board to use, or "${ROOT}" (default)`);

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const capped = (s) =>
  s.length <= MAX_CHARS ? s : `${s.slice(0, MAX_CHARS)}\n… (cut: ask for a smaller depth or a deeper board)`;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Where a card sits, said in titles */
const placeOf = (at) => (at.inInbox ? "Inbox" : `${trailText(at.trail)} › ${columnName(at.col)}`);

/**
 * Index in the full card list for a position among visible cards, counted
 * as if the moving card had already left — moving within its own column
 * would otherwise land one slot off.
 */
const indexFor = (col, position, movingId) => {
  if (!Number.isInteger(position)) return undefined;
  const rest = col.cards.filter((c) => c.id !== movingId);
  const anchor = visibleCards({ cards: rest })[Math.max(0, position)];
  return anchor ? rest.indexOf(anchor) : rest.length;
};

function cardDetail(root, at) {
  const { card } = at;
  const lines = [`# ${card.title} [${card.id}]`, `Where: ${placeOf(at)}`, `Summary: ${cardLine(root, card)}`];
  if (card.doneAt) lines.push(`Done at: ${card.doneAt}`);
  if (card.capturedAt) lines.push(`Captured at: ${card.capturedAt}`);
  lines.push("", "## Description", card.description?.trim() || "(none)");

  const lists = cardChecklists(card);
  if (lists.length) {
    lines.push("", "## Checklists");
    for (const list of lists) {
      lines.push(`### ${list.title} [${list.id}]`);
      for (const item of list.items) lines.push(`- [${item.done ? "x" : " "}] ${item.text} [${item.id}]`);
    }
  }
  if (card.comments?.length) {
    lines.push("", "## Comments");
    for (const c of card.comments) lines.push(`- ${String(c.createdAt).slice(0, 16)} — ${c.text}`);
  }
  if (card.board?.columns?.length) lines.push("", "## Board inside", outline(root, card.board, 1));
  return lines.join("\n");
}

function registerTools(server, uid) {
  const tool = (name, config, run) =>
    server.registerTool(name, config, async (args) => {
      try {
        return { content: [{ type: "text", text: capped(await run(args)) }] };
      } catch (err) {
        if (err instanceof ToolError) return { content: [{ type: "text", text: err.message }], isError: true };
        throw err;
      }
    });

  // ── Reading ──

  tool(
    "get_outline",
    {
      title: "Board outline",
      description:
        "The tree of boards, from the root or from inside one card, with the ids the other tools take. `depth` is how many levels of nested boards to unfold.",
      inputSchema: {
        board: boardRef(),
        depth: z.number().int().min(1).max(6).optional().describe("Levels of boards to unfold (default 2)"),
        include_done: z.boolean().optional().describe("List finished cards too (default true)"),
      },
      annotations: { title: "Board outline", ...READ },
    },
    async ({ board, depth = 2, include_done = true }) => {
      const { root } = await loadBoard(uid);
      const at = locateBoard(root, board);
      return `# ${trailText(at.trail)}\n\n${outline(root, at.board, depth, { includeDone: include_done })}`;
    }
  );

  tool(
    "search_cards",
    {
      title: "Search cards",
      description:
        "Find cards anywhere in the tree by text (titles, descriptions, checklists, comments) and/or filters. Accents and case are ignored.",
      inputSchema: {
        query: z.string().optional(),
        labels: z.array(z.string()).optional().describe("Card must carry all of these label names"),
        overdue: z.boolean().optional().describe("Only cards past their due date"),
        done: z.boolean().optional().describe("Only finished (true) or open (false) cards"),
        include_archived: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
      },
      annotations: { title: "Search cards", ...READ },
    },
    async ({ query = "", labels, overdue, done, include_archived = false, limit = 20 }) => {
      if (!query.trim() && !labels?.length && !overdue && done == null) {
        throw new ToolError("Give a query or at least one filter.");
      }
      const { root } = await loadBoard(uid);
      const results = searchBoard(root, {
        text: query,
        labelIds: labels ? resolveLabels(root, labels) : [],
        due: overdue ? "overdue" : null,
        done: done ?? null,
        includeArchived: include_archived,
      });
      const needle = fold(query);
      const fromInbox = needle
        ? inboxCards(root).filter((c) => fold(c.title).includes(needle) || fold(c.description).includes(needle))
        : [];

      const lines = [
        ...fromInbox.map((c) => `- ${cardLine(root, c)} — in Inbox`),
        ...results.map(
          (r) => `- ${cardLine(root, r.card)} — in ${trailText(["Root", ...r.trail.slice(0, -1)])} › ${r.colTitle || "(untitled)"}`
        ),
      ];
      if (!lines.length) return "No card matches.";
      const shown = lines.slice(0, limit);
      if (lines.length > limit) shown.push(`… and ${lines.length - limit} more`);
      return shown.join("\n");
    }
  );

  tool(
    "get_card",
    {
      title: "Card details",
      description: "Everything on one card: where it is, description, checklists (with item ids), comments and the board inside it.",
      inputSchema: { card_id: cardId() },
      annotations: { title: "Card details", ...READ },
    },
    async ({ card_id }) => {
      const { root } = await loadBoard(uid);
      return cardDetail(root, locateCard(root, card_id));
    }
  );

  tool(
    "get_agenda",
    {
      title: "Agenda",
      description:
        "What to do and when, across the whole tree, as the Agenda view lays it out: today (overdue included), tomorrow, this week, next week, later — and stalled branches, boards with a ✅ column that still hold work but no date anywhere.",
      inputSchema: {
        lanes: z.array(z.enum(LANES)).optional().describe("Only these lanes (default all)"),
      },
      annotations: { title: "Agenda", ...READ },
    },
    async ({ lanes = LANES }) => {
      const { root, settings } = await loadBoard(uid);
      const plan = planWeek(root, { weekMode: settings.weekMode });
      const names = {
        today: "Today (and overdue)",
        tomorrow: "Tomorrow",
        week: "This week",
        nextWeek: "Next week",
        later: "Later",
        stalled: "Stalled branches",
      };
      const out = [`Today is ${today()}. "This week" reads as ${settings.weekMode === "calendar" ? "the rest of the calendar week" : "the next seven days"}.`];
      for (const lane of lanes) {
        const entries = plan[lane];
        out.push("", `## ${names[lane]} (${entries.length})`);
        for (const e of entries.slice(0, LANE_LIMIT)) {
          const trail = trailText(["Root", ...e.path.map((p) => p.cardTitle)]);
          out.push(`- ${cardLine(root, e.card)}${e.overdue ? " · OVERDUE" : ""} — in ${trail} › ${e.colTitle || "(untitled)"}`);
        }
        if (entries.length > LANE_LIMIT) out.push(`… and ${entries.length - LANE_LIMIT} more`);
      }
      return out.join("\n");
    }
  );

  tool(
    "list_inbox",
    {
      title: "Inbox",
      description: "Captures waiting to be filed, newest first.",
      inputSchema: {},
      annotations: { title: "Inbox", ...READ },
    },
    async () => {
      const { root } = await loadBoard(uid);
      const cards = inboxCards(root);
      return cards.length ? cards.map((c) => `- ${cardLine(root, c)}`).join("\n") : "The Inbox is empty.";
    }
  );

  // ── Writing ──

  tool(
    "add_to_inbox",
    {
      title: "Capture to Inbox",
      description: "Note one or more things quickly, without deciding where they go. They land at the top of the Inbox, in the order given.",
      inputSchema: { titles: z.array(z.string().min(1)).min(1).max(50) },
      annotations: { title: "Capture to Inbox", ...WRITE },
    },
    async ({ titles }) =>
      updateBoard(uid, (state) => {
        const stamp = new Date().toISOString();
        const cards = titles.map((t) => ({ ...makeCard(t.trim()), capturedAt: stamp }));
        // Each capture goes on top, so the last one is captured first
        for (const card of [...cards].reverse()) state.root = captureInboxCard(state.root, card);
        return `Captured ${cards.length}:\n${cards.map((c) => `- ${c.title} [${c.id}]`).join("\n")}`;
      })
  );

  tool(
    "create_card",
    {
      title: "Create card",
      description: "Add a card to a column of any board. The column is named by id, title or emoji; the board's first column when left out.",
      inputSchema: {
        title: z.string().min(1),
        board: boardRef(),
        column: z.string().optional(),
        description: z.string().optional().describe("Markdown"),
        due_date: day().optional(),
        position: z.number().int().min(0).optional().describe("0 for the top; the bottom when left out"),
      },
      annotations: { title: "Create card", ...WRITE },
    },
    async ({ title, board, column, description, due_date, position }) =>
      updateBoard(uid, ({ root }) => {
        const at = locateBoard(root, board);
        const col = findColumn(at.board, at.trail, column);
        const card = makeCard(title.trim());
        if (description) card.description = description;
        if (due_date) card.dueAt = due_date;
        col.cards.splice(indexFor(col, position) ?? col.cards.length, 0, card);
        return `Created ${cardLine(root, card)} in ${trailText(at.trail)} › ${columnName(col)}.`;
      })
  );

  tool(
    "create_column",
    {
      title: "Create column",
      description: "Add a column to a board — the root, or the board inside a card. Give it a ✅ emoji to make it the board's finished column.",
      inputSchema: {
        title: z.string().min(1),
        emoji: z.string().optional(),
        board: boardRef(),
      },
      annotations: { title: "Create column", ...WRITE },
    },
    async ({ title, emoji, board }) =>
      updateBoard(uid, ({ root }) => {
        const at = locateBoard(root, board);
        const col = makeCol(title.trim());
        if (emoji) col.emoji = emoji;
        at.board.columns.push(col);
        return `Created column ${columnName(col)} [${col.id}] on ${trailText(at.trail)}.`;
      })
  );

  tool(
    "update_card",
    {
      title: "Update card",
      description:
        "Change a card's title, description, due date, repetition, labels or archived state. Only the fields given change; null clears a due date or a repetition.",
      inputSchema: {
        card_id: cardId(),
        title: z.string().min(1).optional(),
        description: z.string().optional().describe("Markdown; replaces the current one"),
        due_date: day().nullable().optional(),
        repeat: z
          .object({ every: z.number().int().min(1).max(99), unit: z.enum(REPEAT_UNITS) })
          .nullable()
          .optional()
          .describe("Counted from the due date"),
        labels: z.array(z.string()).optional().describe("Label names; replaces the card's labels"),
        archived: z.boolean().optional(),
      },
      annotations: { title: "Update card", ...WRITE },
    },
    async ({ card_id, title, description, due_date, repeat, labels, archived }) =>
      updateBoard(uid, ({ root }) => {
        const { card } = locateCard(root, card_id);
        if (title !== undefined) card.title = title.trim();
        if (description !== undefined) card.description = description;
        if (due_date !== undefined) card.dueAt = due_date;
        if (repeat !== undefined) card.repeat = normalizeRepeat(repeat);
        if (labels !== undefined) card.labels = resolveLabels(root, labels);
        if (archived !== undefined) card.archived = archived;
        return `Updated: ${cardLine(root, card)}`;
      })
  );

  tool(
    "set_card_done",
    {
      title: "Finish or reopen card",
      description:
        "Tick a card off, or reopen it. As in the app: a repeating card moves on to its next occurrence instead, and a finished card is filed under its board's ✅ column when there is one.",
      inputSchema: { card_id: cardId(), done: z.boolean().optional().describe("Default true") },
      annotations: { title: "Finish or reopen card", ...WRITE },
    },
    async ({ card_id, done = true }) =>
      updateBoard(uid, ({ root, settings }) => {
        const at = locateCard(root, card_id);
        const { card } = at;
        if (done && !card.done && isRepeating(card)) {
          const next = nextOccurrence(card.dueAt, card.repeat);
          rollCardOver(card, next);
          return `"${card.title}" repeats, so it moved on to ${next} and its checklists were reset.`;
        }
        if (Boolean(card.done) === done) return `"${card.title}" was already ${done ? "done" : "open"}.`;

        card.done = done;
        card.doneAt = done ? new Date().toISOString() : null;
        let said = `${done ? "Finished" : "Reopened"} "${card.title}"`;
        if (done && !at.inInbox && settings.moveOnDone) {
          const filed = fileUnderDone(at.board, at.col.id, card.id);
          if (filed) said += ` and filed it under ${columnName(at.board.columns.find((c) => c.id === filed))}`;
        }
        if (done && settings.autoArchiveDone) {
          card.archived = true;
          said += ", then archived it (auto-archive is on)";
        }
        return `${said}.`;
      })
  );

  tool(
    "move_card",
    {
      title: "Move card",
      description: `Move a card, with everything inside it, to a column of another board, or between the Inbox and a board. \`to\` is a card id (its board), "${ROOT}" or "${INBOX}". Moving into a ✅ column finishes the card, as in the app.`,
      inputSchema: {
        card_id: cardId(),
        to: z.string().describe(`Card id, "${ROOT}" or "${INBOX}"`),
        column: z.string().optional().describe("Column id, title or emoji; the first one when left out"),
        position: z.number().int().min(0).optional().describe("0 for the top; the bottom when left out"),
      },
      annotations: { title: "Move card", ...WRITE },
    },
    async ({ card_id, to, column, position }) =>
      updateBoard(uid, (state) => {
        const { root, settings } = state;
        const at = locateCard(root, card_id);
        const stamp = new Date().toISOString();

        if (to === INBOX) {
          if (at.inInbox) throw new ToolError(`"${at.card.title}" is already in the Inbox.`);
          const next = moveCardIntoInbox(root, at.path, at.col.id, card_id, { index: position ?? 0, stamp });
          if (!next) throw new ToolError("An archived card cannot go to the Inbox; unarchive it first.");
          state.root = next;
          return `Moved "${at.card.title}" to the Inbox.`;
        }

        const dest = locateBoard(root, to);
        const col = findColumn(dest.board, dest.trail, column);
        const where = `${trailText(dest.trail)} › ${columnName(col)}`;

        if (at.inInbox) {
          const next = fileInboxCard(root, card_id, dest.path, col.id, {
            doneOnDrop: settings.doneOnDrop,
            stamp,
            index: position,
          });
          if (!next) throw new ToolError("That card could not be filed there.");
          state.root = next;
          return `Filed "${at.card.title}" in ${where}.`;
        }

        const next = moveCardAcrossBoards(
          root,
          { path: at.path, colId: at.col.id, cardId: card_id },
          { path: dest.path, colId: col.id, index: indexFor(col, position, card_id) ?? col.cards.length }
        );
        if (!next) {
          throw new ToolError(
            dest.path.some((s) => s.cardId === card_id)
              ? "A card cannot move inside itself."
              : "Nothing to move: the card is already there."
          );
        }
        // Moving and dropping are the same deposit in the app, so the same rule
        let said = `Moved "${at.card.title}" to ${where}`;
        if (settings.doneOnDrop && isDoneColumn(col) && col.id !== at.col.id) {
          const destBoard = getBoardAtPath(next, dest.path);
          const landed = destBoard.columns.find((c) => c.id === col.id).cards.find((c) => c.id === card_id);
          if (isRepeating(landed)) {
            const nextDue = nextOccurrence(landed.dueAt, landed.repeat);
            rollCardOver(landed, nextDue);
            said += `; it repeats, so it moved on to ${nextDue}`;
          } else if (markCardDone(destBoard, col.id, card_id)) {
            said += " and finished it";
          }
        }
        state.root = next;
        return `${said}.`;
      })
  );

  tool(
    "add_comment",
    {
      title: "Comment on card",
      description: "Add a comment to a card.",
      inputSchema: { card_id: cardId(), text: z.string().min(1) },
      annotations: { title: "Comment on card", ...WRITE },
    },
    async ({ card_id, text }) =>
      updateBoard(uid, ({ root }) => {
        const { card } = locateCard(root, card_id);
        card.comments = [...(card.comments || []), { id: newId(), text: text.trim(), createdAt: new Date().toISOString() }];
        return `Commented on "${card.title}".`;
      })
  );

  tool(
    "add_checklist_items",
    {
      title: "Add checklist items",
      description: "Add items to a card's checklist, found by title — created when the card has none by that name.",
      inputSchema: {
        card_id: cardId(),
        items: z.array(z.string().min(1)).min(1).max(50),
        checklist: z.string().optional().describe('Checklist title (default "Checklist")'),
      },
      annotations: { title: "Add checklist items", ...WRITE },
    },
    async ({ card_id, items, checklist = "Checklist" }) =>
      updateBoard(uid, ({ root }) => {
        const { card } = locateCard(root, card_id);
        card.checklists = cardChecklists(card);
        let list = card.checklists.find((l) => fold(l.title) === fold(checklist));
        if (!list) {
          list = makeChecklist(checklist.trim());
          card.checklists.push(list);
        }
        const added = items.map((text) => makeChecklistItem(text.trim()));
        list.items.push(...added);
        return `Added to "${list.title}" on "${card.title}":\n${added.map((i) => `- ${i.text} [${i.id}]`).join("\n")}`;
      })
  );

  tool(
    "set_checklist_item",
    {
      title: "Tick checklist item",
      description: "Tick or untick one checklist item; get_card lists the item ids.",
      inputSchema: { card_id: cardId(), item_id: z.string(), done: z.boolean().optional().describe("Default true") },
      annotations: { title: "Tick checklist item", ...WRITE },
    },
    async ({ card_id, item_id, done = true }) =>
      updateBoard(uid, ({ root }) => {
        const { card } = locateCard(root, card_id);
        const item = cardChecklists(card).flatMap((l) => l.items).find((i) => i.id === item_id);
        if (!item) throw new ToolError(`No checklist item "${item_id}" on "${card.title}".`);
        item.done = done;
        return `${done ? "Ticked" : "Unticked"} "${item.text}".`;
      })
  );
}

module.exports = { registerTools, INSTRUCTIONS };
