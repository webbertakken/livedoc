// The changes a browser holds that its room has not confirmed, and carrying them onto another state (docs/specs/
// 035-pdf-documents/live-editing-and-storage.md "A change carried across a replacement"). When the stored file is
// replaced the live changes are emptied, and a Yjs update made on the old ones follows items the new state does not
// hold; so what was not confirmed is read entry by entry, as plain values, and made again by its anchor. Value
// objects: nothing here holds a reference into a live document.
import * as Y from 'yjs';
import { canonical } from './canonical';
import { PdfChange, type PdfChangeRoot, type PdfEntry } from './pdf-change';

/** The roots an unconfirmed change is read from, in the layout's order. */
const ROOTS: readonly PdfChangeRoot[] = ['marks', 'fieldValues', 'pages', 'removed'];

/** An entry this browser holds otherwise than the room is known to hold it. */
export type UnconfirmedChange = {
  readonly root: PdfChangeRoot;
  readonly id: string;
  /** What the room is known to hold there; null where it holds nothing. */
  readonly held: PdfEntry | null;
  /** What stands here; null where the entry was removed here. */
  readonly made: PdfEntry | null;
};

/** What of a stored file a change can stand on. */
export type PdfAnchors = {
  /** The names of the file's pages. */
  readonly pages: ReadonlySet<string>;
  /** The ids of the file's own marks, on the pages the changes name. */
  readonly fileMarks: ReadonlySet<string>;
};

export type PdfCarried = {
  /** How many were made again. */
  readonly carried: number;
  /** How many the new file or the new state held already. */
  readonly already: number;
  /** Those with nothing left to stand on. */
  readonly lost: readonly UnconfirmedChange[];
};

const entryOf = (doc: Y.Doc, root: PdfChangeRoot, id: string): PdfEntry | null => {
  const entry = doc.getMap<unknown>(root).get(id);
  return entry instanceof Y.Map ? entry.toJSON() : null;
};

const isEntry = (value: unknown): value is PdfEntry =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const same = (one: unknown, other: unknown): boolean => canonical(one) === canonical(other);

/** The properties `made` holds otherwise than `held`, set; those it no longer holds, unset. */
function changed(change: UnconfirmedChange, held: PdfEntry, made: PdfEntry): PdfChange {
  return {
    root: change.root,
    id: change.id,
    set: Object.fromEntries(Object.entries(made).filter(([key, value]) => !same(held[key], value))),
    unset: Object.keys(held).filter((key) => !(key in made)),
  };
}

/** What carries the change onto `doc`: a change to make, that it is there already, that it is lost, or nothing. */
function carriedAs(
  doc: Y.Doc,
  change: UnconfirmedChange,
  anchors: PdfAnchors,
): PdfChange | 'already' | 'lost' | null {
  const { root, id, held, made } = change;
  const now = entryOf(doc, root, id);
  if (made) {
    if (held && now) return changed(change, held, made);
    if (root === 'marks') {
      // The file's own under this id: the replacement wrote it in. A look given it since has nowhere to go yet.
      if (anchors.fileMarks.has(id)) return held ? 'lost' : 'already';
      // Changed here and gone since: the removal won, as it does between two people.
      if (held) return null;
      if (now) return 'already';
      return anchors.pages.has(String(made['page'])) ? { root, id, put: made } : 'lost';
    }
    if (root === 'pages' && !anchors.pages.has(id)) return 'lost';
    return { root, id, put: made };
  }
  if (now) return { root, id, remove: true };
  if (root !== 'marks') return 'lost';
  return anchors.fileMarks.has(id) ? PdfChange.removeFromFile(id, 'mark') : null;
}

export const PdfUnconfirmed = {
  /**
   * What `live` holds otherwise than `room`, the document of what the room is known to hold: every entry made,
   * changed or removed here and not yet confirmed, by root and then by id.
   */
  read: (room: Y.Doc, live: Y.Doc): UnconfirmedChange[] =>
    ROOTS.flatMap((root) => {
      const ids = new Set([...room.getMap(root).keys(), ...live.getMap(root).keys()]);
      return [...ids].sort().flatMap((id): UnconfirmedChange[] => {
        const held = entryOf(room, root, id);
        const made = entryOf(live, root, id);
        return same(held, made) ? [] : [{ root, id, held, made }];
      });
    }),

  /** The unconfirmed changes a value holds: what a local copy kept is read back through here. */
  parse: (value: unknown): UnconfirmedChange[] =>
    (Array.isArray(value) ? value : []).flatMap((item: unknown): UnconfirmedChange[] => {
      if (!isEntry(item)) return [];
      const { root, id, held, made } = item;
      if (!ROOTS.includes(root as PdfChangeRoot) || typeof id !== 'string') return [];
      if ((held !== null && !isEntry(held)) || (made !== null && !isEntry(made))) return [];
      if (held === null && made === null) return [];
      return [{ root: root as PdfChangeRoot, id, held, made }];
    }),

  /**
   * Makes each change again on `doc`, a state on another stored file, by its anchor, all as one step: a mark on its
   * page, a field by its name, a deletion by its id. One with nothing left to stand on is answered as lost.
   */
  carry: (
    doc: Y.Doc,
    changes: readonly UnconfirmedChange[],
    anchors: PdfAnchors,
    origin?: unknown,
  ): PdfCarried => {
    let carried = 0;
    let already = 0;
    const lost: UnconfirmedChange[] = [];
    if (changes.length === 0) return { carried, already, lost };
    doc.transact(() => {
      for (const change of changes) {
        const as = carriedAs(doc, change, anchors);
        if (as === 'already') already += 1;
        else if (as === 'lost') lost.push(change);
        else if (as !== null) {
          if (PdfChange.apply(doc, as) === null) carried += 1;
          else lost.push(change);
        }
      }
    }, origin);
    return { carried, already, lost };
  },
} as const;
