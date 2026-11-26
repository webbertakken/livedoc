// A live tab kind (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): a kind outside the canvas whose
// content is a live state of merged updates, stored by its room the same way for every kind. The kind declares only
// what is its own: its tab and frame kinds, its tables, how its updates merge, its sizes, limits and digest; and, where
// it has them, the level an update asks, what its state stands on, and how the state is replaced with its row.
import type { AccessLevel } from '@livedoc/api-schema';
import type { CollabIndexRows } from '@livedoc/document';
import type { DocumentEnv } from '../types';

/** A live tab's digest, read from its state when the outbox drains the tab. */
export type LiveTabDigest = {
  readonly characters: number;
  readonly words: number;
  readonly pages: number;
  readonly hasContent: boolean;
  readonly searchText: string;
  /** The gallery images its state places: its rows in the reference index (images.md "Reference index"). */
  readonly imageIds?: readonly string[];
  /** Its rows in the collaboration index, authors as adder keys (inbox.md §2.7): a kind with comments. */
  readonly collab?: CollabIndexRows;
};

/**
 * The least level an update needs ("The level an update asks"); `not_your_mark`: it changes a PDF's mark its sender
 * does not own; or `unreadable`: it stands on changes the stored state lacks, so what it touches cannot be judged.
 */
export type LevelAsked = 'participate' | 'edit' | 'not_your_mark' | 'unreadable';

/** The kind's three tables in the room's SQLite: the updates log, the chunks it folds into, and the digest. */
export type LiveTabTables = {
  readonly updates: string;
  readonly chunks: string;
  readonly digest: string;
};

/** A replacement as its kind is asked to judge it ("Replacing a state with its row"). */
export type LiveTabReplacementAsked = {
  readonly env: DocumentEnv;
  readonly documentId: string;
  readonly tabId: string;
  /** The op as the client sent it. */
  readonly op: unknown;
  /** The tab's body as stored. */
  readonly tab: Readonly<Record<string, unknown>>;
  /** The stored state's updates. */
  readonly stored: readonly Uint8Array[];
  /** The sender's server-verified level. */
  readonly level: AccessLevel;
  readonly now: number;
};

/** What the kind answers: why not, by name, or everything the room writes and tells in one step. */
export type LiveTabReplacement =
  | { readonly refusal: string }
  | {
      /** The tab's body as its row will hold it. */
      readonly tab: Readonly<Record<string, unknown>>;
      /** The state that stands on the new row, as one update; null for none. */
      readonly state: Uint8Array | null;
      /** The rows the kind keeps of what was replaced, written in the same transaction. */
      readonly statements: readonly D1PreparedStatement[];
      /** What everyone hears once it is written, in order. */
      readonly told: readonly Readonly<Record<string, unknown>>[];
      /** The log's fingerprint, its name first. */
      readonly log: string;
    };

export type LiveTabReplace = {
  /** The op kind a replacement is asked with. */
  readonly op: string;
  /** The tab a client's op names, or null when the op is no replacement at all. */
  readonly tabIdOf: (op: unknown) => string | null;
  readonly judge: (asked: LiveTabReplacementAsked) => Promise<LiveTabReplacement>;
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
     * Participant's update only; a kind that declares none asks an Editor for every update. `sender`: the adder key
     * its session holds (share-roles.md "Integrity"), none for a session without an identity.
     */
    readonly asks?: (
      stored: readonly Uint8Array[],
      update: Uint8Array,
      tab: Readonly<Record<string, unknown>>,
      sender: { readonly adderKey: string | null },
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
  /**
   * What the tab's row says its state stands on ("What a state stands on"): a frame made on anything else is
   * refused. A kind whose state stands on nothing but itself declares none.
   */
  readonly standsOn?: (tab: Readonly<Record<string, unknown>>) => string | null;
  /** How the state is replaced together with its row, where the kind allows it. */
  readonly replace?: LiveTabReplace;
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
