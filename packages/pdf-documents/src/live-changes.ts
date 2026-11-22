// A PDF document's live changes (docs/specs/035-pdf-documents/live-editing-and-storage.md "The live model", "The
// layout"): everything changed since the stored file, as one Yjs state every reader shares: the surface, the room,
// the api, agents and the CLI. Maps by id, each property a whole value, so two people changing one mark merge per
// property. A PDF nobody changed has no state at all.
import * as Y from 'yjs';
import { isBlobKey, type BlobKey } from '@livedoc/document';
import { PDF_MAX_MARKS, PDF_MAX_PAGES } from './limits';
import { Mark } from './mark';

/** Every root of the layout, in the spec's order. */
export const PDF_ROOTS = [
  'stored',
  'pageOrder',
  'pages',
  'marks',
  'threads',
  'fieldValues',
  'objects',
  'fields',
  'document',
  'recognised',
  'removed',
] as const;
export type PdfRoot = (typeof PDF_ROOTS)[number];

/** The stored file a state's changes are on. */
export type PdfStored = { readonly blob: BlobKey; readonly pages: number };

/** Why a change to the live changes was refused whole ("Limits"). */
export type PdfLimitRefusal = 'pdf_too_many_marks';

// A state with nothing in it, what merging no updates answers: an update of no structs and no deletions, two zero
// counts. Written out, never made from a live document: making one draws random numbers, which a Worker refuses
// while its modules load.
const EMPTY = Uint8Array.of(0, 0);

const marksOf = (doc: Y.Doc): Y.Map<Y.Map<unknown>> => doc.getMap<Y.Map<unknown>>('marks');

const holdsNothing = (doc: Y.Doc, root: PdfRoot): boolean =>
  root === 'pageOrder' ? doc.getArray(root).length === 0 : doc.getMap(root).size === 0;

export const PdfLiveChanges = {
  /**
   * A live document holding the given updates. Garbage collection is off: versions are a point in the live changes,
   * which needs deleted items kept (saving.md "Previous versions and version history").
   */
  load: (updates: readonly Uint8Array[] = []): Y.Doc => {
    const doc = new Y.Doc({ gc: false });
    for (const update of updates) Y.applyUpdate(doc, update);
    return doc;
  },
  /** The updates as one update, without a live document. */
  merge: (updates: readonly Uint8Array[]): Uint8Array =>
    updates.length === 0 ? EMPTY.slice() : Y.mergeUpdates([...updates]),
  /** Whether the bytes decode as a Yjs update; a frame that does not is refused before anything stores it. */
  decodes: (update: Uint8Array): boolean => {
    try {
      Y.decodeUpdate(update);
      return true;
    } catch {
      return false;
    }
  },
  /** The state vector of an update: what it holds, client by client. */
  stateVectorOf: (update: Uint8Array): Uint8Array => Y.encodeStateVectorFromUpdate(update),
  /** Whether the bytes decode as a state vector. */
  isStateVector: (bytes: Uint8Array): boolean => {
    try {
      Y.decodeStateVector(bytes);
      return true;
    } catch {
      return false;
    }
  },
  /** What `update` holds beyond `stateVector`: a catch-up's answer. */
  since: (update: Uint8Array, stateVector: Uint8Array): Uint8Array =>
    Y.diffUpdate(update, stateVector),
  /** The whole state as one update. */
  encode: (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc),

  /** The stored file the changes are on, or null when the state names none: then it is the tab's own `blob`. */
  stored: (doc: Y.Doc): PdfStored | null => {
    const map = doc.getMap<unknown>('stored');
    const blob = map.get('blob');
    const pages = map.get('pages');
    if (!isBlobKey(blob)) return null;
    if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 0 || pages > PDF_MAX_PAGES)
      return null;
    return { blob, pages };
  },
  /** Names the stored file: written once per stored file, by whoever first changes it. */
  setStored: (doc: Y.Doc, stored: PdfStored, origin?: unknown): void => {
    doc.transact(() => {
      const map = doc.getMap<unknown>('stored');
      map.set('blob', stored.blob);
      map.set('pages', stored.pages);
    }, origin);
  },

  /** Every mark, in the order of their ids; an entry that is no mark is left out. */
  marks: (doc: Y.Doc): readonly Mark[] => {
    const marks: Mark[] = [];
    for (const entry of marksOf(doc).values()) {
      const mark = entry instanceof Y.Map ? Mark.parse(entry.toJSON()) : null;
      if (mark) marks.push(mark);
    }
    return marks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  },
  /** Adds a mark as one change, each property a whole value; refused whole past the limit. */
  addMark: (doc: Y.Doc, mark: Mark, origin?: unknown): PdfLimitRefusal | null => {
    const marks = marksOf(doc);
    if (!marks.has(mark.id) && marks.size >= PDF_MAX_MARKS) return 'pdf_too_many_marks';
    doc.transact(() => {
      const entry = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(mark)) entry.set(key, value);
      marks.set(mark.id, entry);
    }, origin);
    return null;
  },
  /** Removes a mark made in LiveDoc; a mark that is not there changes nothing. */
  removeMark: (doc: Y.Doc, id: string, origin?: unknown): void => {
    const marks = marksOf(doc);
    if (marks.has(id)) doc.transact(() => marks.delete(id), origin);
  },

  /** Every root's shared type: what one person's undo watches (live-editing-and-storage.md "Undo"). */
  roots: (doc: Y.Doc): readonly (Y.Array<unknown> | Y.Map<unknown>)[] =>
    PDF_ROOTS.map((root) => (root === 'pageOrder' ? doc.getArray(root) : doc.getMap(root))),

  /** Whether nothing was changed since the stored file: such a state is never baked (saving.md "An unchanged file"). */
  isEmpty: (doc: Y.Doc): boolean =>
    PDF_ROOTS.every((root) => root === 'stored' || holdsNothing(doc, root)),
} as const;
