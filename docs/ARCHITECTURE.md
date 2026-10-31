# Architecture

This document explains **why** the code is built the way it is. The *what* can
be read in the files; what gets lost are the reasons — and the traps already
paid for.

---

## The data model

A user's whole tree fits in **a single Firestore document**, `boards/{uid}`,
serialised as JSON.

```js
board = { columns: [ column ] }
column = { id, title, emoji, color, cards: [ card ] }
card   = { id, title, description, comments, done, doneAt, archived,
           labels, dueAt, repeat, checklists, board }   // ← and board starts over
```

The recursion is in the last line: a card holds a board, which holds columns,
which hold cards. There is no boards table and no cross-references — the
structure *is* the tree.

Firestore enforces none of this, since it only sees a JSON string. The
contract lives in `src/lib/types.ts`: the app, the MCP server and the capture
integrations all write this shape, and the type checker holds the code in
`src/lib` to it.

**Why a single document.** Text compresses well: a tree of several hundred
cards stays at a few dozen kilobytes, far below the one-megabyte limit per
document. In exchange, the whole tree is in memory at all times, and that is
what makes the cross-cutting views possible: the Agenda, the mind map, the
outline and search walk it without a single network request.

**When it will have to change.** The trigger is not size, it is **sharing
between several people**. Two people on the same document means last writer
wins. The day that happens, it will have to be split — and every cross-cutting
view will need rethinking.

---

## State and synchronisation

`useBoard` holds the tree, the current path, the trash, favourites and
settings. It writes to Firestore with a delay, and listens to remote changes
with `onSnapshot`.

Each authenticated UID owns a separate React workspace and sync session. Changing
accounts unmounts its UI, history and timers; late reads and transactions cannot
update the next account. Unsaved drafts remain scoped to their UID and browser
tab for recovery when that account returns.

Saving uses a Firestore transaction and a three-way merge of the last acknowledged
state, the submitted draft and the current server document. Entity arrays merge
by id; independent edits and Inbox captures survive. Competing field edits,
delete/edit conflicts, incompatible reorderings and duplicate moves fail visibly.
The transaction does not write on a merge conflict. Changes typed while a commit
is pending are rebased onto the committed result and saved in a later transaction.

Snapshots arriving during a local edit do not replace the editor; the next
transaction reads the latest server state. When a remote update is incorporated,
undo history is cleared so an old whole-tree snapshot cannot erase that update.
Settings, favorites and trash participate in the comparison, not just boardJson.

Before the debounce, drafts are persisted in localStorage with their merge base.
Transactions need connectivity: an offline draft stays local and retries on the
browser's online event. A failed write remains dirty, with a visible retry/export
notice. Oversized documents are rejected before sending. Other tabs' drafts can
be recovered explicitly; they are never silently written over. Export before
choosing the saved version to resolve a conflict. Browsers without available
storage show a warning and require keeping the tab open until saving or export.

### Mutating anywhere in the tree

Mutations go through `mutateAt(segments, updater, label)`, which applies a
function to the board at a given path. `mutate(...)` is just the special case:
"where I am standing".

This distinction is not decorative. The Agenda shows cards from
everywhere and can open one in place; without an explicit target, a checklist
edited from that view would have been written **to the board underneath**.
Every card mutation therefore accepts an optional `at`.

**Updaters must stay pure**: React calls them twice in strict mode. Deciding a
follow-up action inside an updater is a trap — the decision is made before.

### Undo

A `{root, trash}` snapshot is pushed before each mutation, with a label. Two
mutations with the same label less than 700 ms apart merge, so that typing does
not fill the stack.

Useful consequence: a compound action is **a single step**. Dropping a card in
a ✅ column moves it *and* ticks it in the same snapshot, so a single `⌘Z`
undoes both.

Emptying all archives permanently removes archived cards and their content,
with no copy in the trash. A confirmation shows how many cards are affected,
descendants included. This operation clears the undo and redo stacks so that
deleted data cannot be brought back to life; other cards and the trash stay.

The "Clean" group gathers that deletion and archiving finished cards. The
latter walks every board, only touches cards explicitly marked done and keeps
their content. A single undo step covers the whole operation. The submenu opens
on hover, click or keyboard on desktop; its two actions are shown directly
under "Clean" in the mobile menu.

### Inbox

Mobile shares arrive on `/share`: `title`, `text` and `url` in the query string
from the Android PWA (`manifest.share_target`), or `#text=…` from the signed iOS
shortcut. The fragment keeps iOS content out of HTTP requests. `main.jsx` reads
them before the authentication URL rewrites, keeps a pending capture in
`oshka_pending_share_v1` and cleans the URL. This local storage lets the share
survive a round trip through the magic link. Without storage available, it
stays usable in the current tab.

`SharedCapture` asks for explicit confirmation: a plain GET navigation never
changes the account. After sign-in and board load, title and description are
saved together by `captureInbox`, in one undoable snapshot, then the Inbox
opens. Cancelling only removes the pending capture. The service worker serves
the shell for `/share`, offline too, without ever caching the URL that carries
the share parameters.

On iOS, the shortcut uses the browser and its sign-in session; the home-screen
app's session can be separate. Its generator is
`scripts/build-share-shortcut.py`, its signed file goes in `public/shortcuts/`.
The installation guide for both platforms is available in the settings.

The generator serialises the URL Encode input as a `WFTextTokenString`: its
text parameter does not keep a bare `WFTextTokenAttachment` token on import
into Shortcuts. Signing validates the file without checking that each action
receives the expected value. The export test covers that contract. An empty
`/share` invocation stays visible, including after sign-in, with an explanation
and an empty form; it must never silently fall back to the board.

Captures without a destination live in `root.inbox`, an array of cards in the
usual format, outside the board hierarchy. An old account without that field
has an empty Inbox. JSON serialisation, sync and the existing snapshots thus
include the Inbox, without adding a Firestore document.

`fileInboxCard` validates the path and the column before removing the capture,
then moves it while keeping its identifier and content. The move is a single
undoable step and honours the "complete on drop" preference in ✅. Deleting
creates a trash entry with `source: "inbox"`: restoring brings it back to the
Inbox and does not create a column in the current board.

The Inbox occupies a panel built into the left side, with a distinct bluish
palette. It narrows the app without blocking its interactions. On mobile, the
panel takes the top of the screen and leaves the board usable below. The draft
stays when the panel is closed during the session.

Opening and closing slide over 240 ms: from the left on desktop, from the top
on mobile, gradually adjusting the board's space. The closed panel is
immediately `inert` and hidden from screen readers, but stays rendered until
its exit finishes. Margins animate the content without creating a transformed
ancestor that would offset dragged cards. Before the DnD measurements, ongoing
geometry transitions are finished. The "reduce motion" preference disables
these transitions.

On mobile (≤ 640 px), the capture field folds when the list is scrolled down,
to give its height back to the cards, and returns as soon as you scroll up or
near the top of the list. It stays unfolded while it has focus or holds a
draft. `foldCapture` (`src/lib/inbox-motion.ts`) decides from the scroll: a
margin ignores small jolts, the reflow caused by the fold itself is ignored
during its transition, and the field does not fold if the list would no longer
have enough to scroll to bring it back. The fold animates a grid row (no
`transform`), which `settleInboxTransition` finishes before the DnD
measurements; during a drag hovering or leaving the list, scrolling neither
folds nor unfolds anything. On desktop, the field stays fixed.

The Inbox and the board share one `DragDropContext`; `useBoardDrag` keeps the
column move zones and edge scrolling. Captures can be dragged by their handle
to the current board's columns. The drop uses the index among visible cards
(archives and label filter excluded), then files the capture in a single
undoable mutation.

The Agenda also shares its context with the Inbox, through
`usePlannerDrag`. Dropping into a dated lane keeps the chosen date and opens
the board picker: the plan's lane says when to act, not where to file the card.
The note stays in the Inbox until that destination is confirmed. Date, filing
and order in "Today" are applied in a single undoable step. Cancelling the
picker leaves the note alone. Lanes stay present when the plan is empty but the
Inbox holds captures; "Standstill" stays non-droppable.

The reverse trip removes the card from its column by identifier and places it
in the Inbox at the drop position. The operation keeps the whole card,
sub-board and metadata included; no copy goes through the trash. Moving,
saving and undoing use a single snapshot. The Inbox drop zone covers the list,
even empty, and accepts cards from the current board as well as those shown in
the Agenda. The Inbox can also be reordered by drag and drop; when closed,
it refuses drops.

Clicking a capture's title opens `CardDetail` through `InboxCardDetail`.
Descriptions, comments and checklists use the same interface as filed cards.
`updateInboxCard` and `useBoard.updateInbox` explicitly target `root.inbox` to
save and undo changes, without touching the board shown behind. Quick rename
stays available through a separate button; Enter opens the detail and Space
keeps its DnD role.

Descriptions and comments go through `react-markdown` with GFM and preserved
line breaks. HTML stays text, URLs follow the engine's filtering, with a narrow
exception for `obsidian://` links. Long strings and code blocks wrap; wide
tables scroll within their own area to stay inside the card.

The original bug came from two choices incompatible with this flow: captures
were not draggable in the Agenda, and the lanes lived in a separate nested
context. The integration test now checks that the Inbox and the lanes share the
same context in the real app, including on an empty plan.

---

### Agenda quick actions

`PlannerCard` reuses `CardMenu` for labels, dates and repetitions, moves,
renaming, archiving and deletion. `useCardShortcuts` shares the `E`, `D`, `M`,
`R`, `A` keys with board cards. Only the hovered card listens; text input,
composition, modifiers and open panels suspend these shortcuts.

Each action receives the card's path in the tree: the board shown behind the
Agenda is never an implicit destination. Deletion also records that path
in the trash so the card can be restored in place. The menu shows on hover, on
focus and on touch screens. Controls keep their keyboard events; `Enter` on the
card opens it and `Space` stays reserved for drag and drop.

## Drag and drop

`@hello-pangea/dnd` (the maintained fork of `react-beautiful-dnd`) imposes two
constraints that each cost a bug:

**1. A single scroll container per list, the closest one — nested containers
are not supported.** While each column scrolled its own cards, the library
watched the column, and scrolling the board underneath made its geometry wrong:
the card landed columns away from the target. Hence the current layout — **the
board carries both axes, the columns carry none**, and column headers are
sticky to stay readable.

In the Agenda on mobile, columns scroll independently while reading.
Before the drag measurements (`onBeforeCapture`), `preparePlannerDrag` moves
their positions to the shared container and extends the drop zones, including
those of empty columns. Margins compensate for the reading positions: the card
does not jump, and you can still scroll up. After the drop or cancellation,
each column gets its independent scrolling back. Horizontal swiping uses
`useColumnSwipe`, like boards, with the plan's columns as snap points. Anchors
are disabled before the drag measurements and during the swipe, so they do not
fight the scroll.

**2. A drag does not start from an interactive element.** A draggable card, tab
or row must be a `div` with `role="button"`, never a `<button>` — otherwise
nothing lifts, without any message. That is also why `Enter` activates these
elements: `Space` belongs to the drag.

And one rule that is not the library's but common sense: **indexes must follow
the displayed order**. In the Agenda, cards are sorted by date then
grouped by board — the on-screen order is not the source array's.

---

## Cross-cutting views

They live in `src/lib`, as pure functions, and that is what makes them
testable:

| File | Role |
|---|---|
| `planner.ts` | slicing the Agenda and the dates of a drop |
| `mindmap.ts` | the tree as a disc, angles proportional to the number of leaves |
| `search.ts` | filtering walk, with each result's path |
| `board-utils.ts` | the rest — paths, moves, labels, statistics |

### The ✅ column convention

A column whose emoji contains ✅ marks a board **meant to progress**. It is a
convention rather than a setting: you set it like any other icon, and it reads
on the board for what it is.

It serves twice: a card dropped there becomes done, and a board without one is
never flagged as at a standstill — a database or a brainstorming grid has no
final state.

### A repeating card is never done

A repeating card carries `repeat = { every, unit }`, and the rule that follows
fits in one sentence: **ticking it does not finish it, it postpones it.** Its
due date moves forward one period, its checklists are unticked, `done` stays
false.

That sentence is what leaves the rest of the app untouched. Since a repeating
card never becomes done, it is never filed under ✅, never auto-archived, and
nobody is ever asked whether to finish what it contains — none of those paths
had to learn about repetition. The same reasoning applies to a drop in the ✅
column: same gesture, same answer.

Ending a series is the mirror of this: remove the repetition, and the next tick
finishes the card like any other.

The only exception is **completing a branch**, which completes everything it
contains, repetitions included. That is on purpose: it declares the whole
project finished, and it is the only place a series stops without being
removed. The card keeps its rule — unticking it restarts the series where it
was.

**The next date counts from the one on the card**, not from a hidden anchor —
postponing an occurrence therefore postpones the series, and what you read on
the card is the only thing that decides. It then moves forward until it passes
today: a weekly card ticked three weeks late comes back once next week, not
three times in the past.

The only awkward case is the month: 31 February does not exist, so a day that
overflows is clamped to the end of the month it lands in. The price is that a
monthly card set on the 31st then stays on the 28th. The alternative — a
remembered anchor — would mean that moving it by hand would not move the
series, and that surprise costs more than the one date in twelve that cannot
exist everywhere.

### What "this week" means

Two possible readings, six days apart: the rest of the calendar week, or the
next seven days. So it is a setting, not an assumption. And a drop targets
**the Friday** of the lane, not its last day — setting a due date on a Sunday
helps nobody.

---

## Tabs

Several boards open, one on screen. A tab is **a list of identifiers**, nothing
else; its title is resolved from the tree at draw time, so a rename follows and
a tab whose card disappeared fades instead of lying.

**The displayed tab carries no path of its own: it *is* the current path.**
Only the others keep segments, and one is written at the moment it stops being
displayed. Nothing needs to be kept in step, so nothing can drift apart.

They live in `localStorage`, **per device**: these are this screen's tabs, not
the account's. The Firestore document is not touched.

A tab can also hold a view rather than a position — that is the case of the
Agenda, pinned on the left and not movable.

---

## Offline

Firestore is configured with `persistentLocalCache` for cached reads. App edits
are persisted as account- and tab-scoped drafts before their debounce; reconnect
retries the transaction against a current server snapshot. There is no blind
whole-document offline write queue.

The service worker (`public/sw.js`) only handles an explicit list of public
static files and hashed assets. OAuth, integration APIs, authenticated requests
and query-string URLs bypass CacheStorage. `/share` fetches only the canonical
shell. Responses marked `no-store` are not cached. The version bump removes
older caches that may contain auth URLs. For allowed static files it serves the shell: **network first for the
document**, cache first for versioned files. Hosting headers follow the same
logic — `no-cache` on the entry point and the worker, `immutable` on
`/assets/**`.

> A deployment can never reach browsers if the worker replays a stale
> `index.html` from the HTTP cache. Hence the `cache: "reload"` on that exact
> request.

---

## Input and the mobile keyboard

On a phone or touch tablet, confirming a card or a checklist item ends input
and explicitly removes focus before closing the form. On desktop, these forms
stay open to allow entering several in a row. Coming back from the destination
picker only refocuses the title on desktop.

`useMobileKeyboard` removes focus after a tap outside fields or a browser
history navigation. It listens to the click, not the start of the touch: a
scroll or a text selection must not interrupt input. Drafts stay until they are
confirmed or cancelled. Edits saved on blur go through this single path on
confirmation to avoid a double write. Enter stays a line break in descriptions
and comments.

## Tests

Most tests cover the pure logic. Input transitions are also tested with the
real React components in `happy-dom`: confirmation, cancellation, text
composition, mobile focus and keeping serial input on desktop. These tests
check the DOM and events; the system keyboard display and browser animations
still need checking on a device.

**The practice that matters: each suite is proven by reintroducing the bugs it
must catch.** A passing test proves nothing until you have seen that it can
fail.

That caught several real defects during development — including a week
boundary off by one day, which none of the eleven original tests saw, and a
depth that kept the last branch walked instead of the deepest.

```bash
# The gesture: break on purpose, check that it fails, restore.
cp src/lib/planner.ts /tmp/bak
# … change a boundary, a comparison, a guard …
npm test
cp /tmp/bak src/lib/planner.ts
```

---

## Security

The Firestore rules (`firestore.rules`) fit in three blocks: a user only reads
and writes `boards/{their uid}`, connection codes are closed to the client, and
everything else is denied by default.

The Firebase identifiers used by `src/lib/firebase.ts` — the project ID, from
which `authDomain` and `storageBucket` are derived, and the API key — **are
public by nature**. A web app necessarily exposes them; security comes from the
rules, not from keeping them secret. They come from environment variables so
that each instance points at its own project.

---

## The MCP server

`functions/mcp/` exposes the tree to MCP clients — claude.ai (web and mobile),
Claude Code, Codex — at `https://<project>.web.app/mcp`. A single function,
`mcp` (europe-west1, next to Firestore), serves the protocol and OAuth.

**The same rules as the app, through the same code.** The server does not
rewrite the logic: `npm run build:functions` bundles `src/lib` as CommonJS
(`functions/mcp/build/oshka.cjs`, generated before each deployment). Ticking a
repeating card, dropping into ✅, what "this week" means: everything goes
through the functions the tests already cover. Default settings live in
`src/lib/settings.ts` for the same reason. The server's time zone is set to
`Europe/Paris` (`OSHKA_TIMEZONE`), otherwise "today" would be UTC's.

**Two writers.** Each tool reads, modifies and rewrites `boardJson` in a
transaction; trash, favourites and settings are not touched. The app receives
the change through its `onSnapshot` or merges it with the next local transaction.
A competing edit remains a visible conflict instead of overwriting server data.
No tool deletes: they archive.

**Everything goes through the app's domain.** Hosting rewrites send `/mcp`,
`/.well-known/oauth-*`, `/authorize`, `/token`, `/register`, `/revoke` and
`/oauth/**` to the function. OAuth discovery must live at the root of a domain,
and the sign-in page can only reuse the session open in Oshka on the same
origin — Firebase Auth keeps it in that origin's IndexedDB. Someone already
signed in only has to click "Authorize".

**OAuth.** The server is its own authorisation server, backed by Firebase Auth.
The MCP SDK's router carries the protocol (metadata, dynamic registration,
PKCE, token exchange); `oauth.js` stores what it needs in Firestore:

| Collection | Content | Lifetime |
|---|---|---|
| `mcp_clients` | registered clients | — |
| `mcp_requests` | validated request, waiting for the page | 15 min |
| `mcp_grants` | authorisation code, single-use | 5 min |
| `mcp_tokens` | access tokens (1 h) and refresh tokens (60 days, renewed on each use) | same |

Codes and tokens are only stored **hashed** (SHA-256). A TTL policy
(`firestore.indexes.json`) purges expired entries. The sign-in page only sends
back the request identifier and a Firebase ID token, verified server-side:
nothing it posts can widen access. Registration is open, as claude.ai requires,
but only accepts redirects to claude.ai, claude.com or a local address (the
CLIs): a stranger cannot create a client that would send codes to themselves.

**Testing.** `firebase emulators:start --only auth,firestore,functions,hosting
--project demo-oshka`, then `npm run seed:local`: the server answers on
`http://localhost:5002/mcp`, with the test account.

---

## What remains open

- **The two-device update loss** described above.
- **Sharing**: the one-document model does not lend itself to it.
- **Bundle weight** — Firebase makes up most of it. Splitting will become
  relevant if more views are added.
