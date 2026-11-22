// A live tab kind (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): a kind outside the canvas whose
// content is a live state of merged updates, stored by its room the same way for every kind. The kind declares only
// what is its own: its tab and frame kinds, its tables, how its updates merge, its sizes, limits and digest.

/** A live tab's digest, read from its state when the outbox drains the tab. */
export type LiveTabDigest = {
  readonly characters: number;
  readonly words: number;
  readonly pages: number;
  readonly hasContent: boolean;
  readonly searchText: string;
};

/**
 * The least level an update needs ("The level an update asks"), or `unreadable`: it stands on changes the stored
 * state lacks, so what it touches cannot be judged.
 */
export type LevelAsked = 'participate' | 'edit' | 'unreadable';

/** The kind's three tables in the room's SQLite: the updates log, the chunks it folds into, and the digest. */
export type LiveTabTables = {
  readonly updates: string;
  readonly chunks: string;
  readonly digest: string;
};

export type LiveTabKind = {
  /** The tab kind, as a tab's body names it (`kind`). */
  readonly tabKind: string;
  /** The op kind of its frames; a refusal is told as `<frame>-refused`. */
  readonly frame: string;
  /** The tag its logs open with (`[text-document]`). */
  readonly tag: string;
  readonly tables: LiveTabTables;
  readonly state: {
    /** Every update merged into one, in order. */
    readonly merge: (updates: readonly Uint8Array[]) => Uint8Array;
    /** The bytes are one update of the kind. */
    readonly decodes: (update: Uint8Array) => boolean;
    /** How many characters the update inserts (deletions not counted). */
    readonly insertedCharacters: (update: Uint8Array) => number;
    /** The digest of the state the updates make. */
    readonly digest: (updates: readonly Uint8Array[]) => LiveTabDigest;
    /**
     * The level `update` asks on the state `stored` makes, for the tab whose body is `tab`. Read for a
     * Participant's update only; a kind that declares none asks an Editor for every update.
     */
    readonly asks?: (
      stored: readonly Uint8Array[],
      update: Uint8Array,
      tab: Readonly<Record<string, unknown>>,
    ) => LevelAsked;
  };
  readonly sizes: {
    /** A chunk row's bytes, under the room's row cap. */
    readonly chunkBytes: number;
    /** The log's bytes and updates before compaction folds it. */
    readonly logBytes: number;
    readonly logUpdates: number;
    /** A relayed frame's base64 characters; a bigger posted update is relayed as the tab's `stale`. */
    readonly frameChars: number;
  };
  /** An update past these is refused whole. */
  readonly caps: LiveTabCaps;
};

/** The limits an update is checked against. */
export type LiveTabCaps = { readonly characters: number; readonly stateBytes: number };

/** Why an update was refused by a limit. */
export type LiveTabLimit = 'characters' | 'state';

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/** A kind as declared, its table names checked: they are written into SQL. */
export function liveTabKind(kind: LiveTabKind): LiveTabKind {
  for (const table of Object.values(kind.tables))
    if (!IDENTIFIER.test(table))
      throw new Error(`live tab kind ${kind.tabKind}: bad table ${table}`);
  return kind;
}
