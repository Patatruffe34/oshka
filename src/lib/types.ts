/**
 * The shape of a board, as the app, the MCP server and the capture
 * integrations all write it.
 *
 * Everything lives in one Firestore document per account (see board-sync):
 * the whole tree is serialized as JSON, so nothing here is enforced by the
 * database. These types are the contract instead.
 *
 * Fields are required when every writer sets them. Documents written by older
 * versions can still lack some of them, which is why the accessors in
 * board-utils (cardLabels, cardChecklists, boardLabels) and inboxCards stay
 * tolerant.
 */

export type Id = string;

/** "2026-10-31" — a calendar day, local to the person, never UTC */
export type IsoDay = string;

/** A full ISO 8601 timestamp, as produced by Date#toISOString */
export type IsoDateTime = string;

export interface Comment {
  id: Id;
  text: string;
  createdAt: IsoDateTime;
}

export interface ChecklistItem {
  id: Id;
  text: string;
  done: boolean;
}

export interface Checklist {
  id: Id;
  title: string;
  items: ChecklistItem[];
}

/** Defined once on the root board; cards carry label ids */
export interface Label {
  id: Id;
  name: string;
  color: string;
}

export type RepeatUnit = "day" | "week" | "month";

export interface Repeat {
  every: number;
  unit: RepeatUnit;
}

/** Where a captured card came from, kept so it can link back */
export type CardSource =
  | {
      type: "gmail";
      mailbox: string;
      messageId: string;
      threadId: string;
      sender: string;
      sentAt: string;
      url: string;
    }
  | {
      type: "slack";
      team: string;
      channel: string;
      timestamp: string;
      author: string;
      url: string;
    };

export interface Card {
  id: Id;
  title: string;
  description: string;
  comments: Comment[];
  done: boolean;
  doneAt: IsoDateTime | null;
  archived: boolean;
  /** Ids of labels defined on the root board */
  labels: Id[];
  /** A day, or a timestamp when set by an older writer */
  dueAt: IsoDay | IsoDateTime | null;
  repeat: Repeat | null;
  checklists: Checklist[];
  /** Every card holds a board of its own, empty until used */
  board: Board;
  /** Hand-made position in the Agenda's Today lane */
  rank?: number;
  /** Set when the card entered through the Inbox */
  capturedAt?: IsoDateTime;
  source?: CardSource;
}

export interface Column {
  id: Id;
  title: string;
  /** A ✅ in here makes the column the board's "done" column */
  emoji: string;
  /** A palette id, or "" for none */
  color: string;
  cards: Card[];
}

export interface Board {
  columns: Column[];
}

/** The top board also carries what belongs to the whole account */
export interface RootBoard extends Board {
  labels?: Label[];
  /** Captured cards not filed on any board yet */
  inbox?: Card[];
}

/** One step down the tree: the card whose board is entered, and its column */
export interface PathSegment {
  colId: Id;
  cardId: Id;
}

/** A step that also remembers the card's title, for breadcrumbs and trails */
export interface TitledSegment extends PathSegment {
  cardTitle: string;
}

export type WeekMode = "rolling" | "calendar";

export interface Settings {
  autoArchiveDone: boolean;
  confetti: boolean;
  doneOnDrop: boolean;
  moveOnDone: boolean;
  weekMode: WeekMode;
}

export interface Favorite {
  id: Id;
  title: string;
  path: TitledSegment[];
}

interface TrashEntry {
  id: Id;
  /** Where the item was deleted from */
  path: TitledSegment[];
  deletedAt: IsoDateTime;
}

export interface CardTrashItem extends TrashEntry {
  type: "card";
  card: Card;
  colId: Id | null;
  colTitle: string;
  /** Deleted straight from the Inbox, so it goes back there */
  source?: "inbox";
}

export interface ColumnTrashItem extends TrashEntry {
  type: "column";
  col: Column;
  index: number;
}

export type TrashItem = CardTrashItem | ColumnTrashItem;

/** Everything an account owns, as held in memory */
export interface BoardState {
  root: RootBoard;
  trash: TrashItem[];
  favorites: Favorite[];
  settings: Settings;
}

/** The Firestore document an account's BoardState is stored as */
export interface BoardDocument {
  boardJson: string;
  trashJson: string;
  favorites: Favorite[];
  settings: Settings;
  updatedAt: Date;
}
