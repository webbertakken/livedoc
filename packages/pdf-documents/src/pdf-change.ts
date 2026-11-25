// A change to a PDF document's live changes, and what takes it back (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "A change and what takes it back"). Every change is a change to one entry of a root
// that is a map by id; a changeset is several as one step. Value objects: a change is plain data, made here, applied
// to the live changes here, and never holds a reference into them.
import * as Y from 'yjs';
import type { FieldValue } from './field-value';
import { PDF_MAX_MARKS } from './limits';
import type { DrawingMark, LineStyle, Mark, TextMark } from './mark';
import type { MarkPlace } from './mark-place';
import type { PageName } from './page-name';

/** The roots a change reaches; the others join as what they hold is built. */
export type PdfChangeRoot = 'marks' | 'fieldValues' | 'pages' | 'removed';

/** An entry's properties, each a whole value. */
export type PdfEntry = Readonly<Record<string, unknown>>;

export type PdfChange =
  /** The entry becomes exactly this, new or not. */
  | { readonly root: PdfChangeRoot; readonly id: string; readonly put: PdfEntry }
  /** Some of the entry's properties are set, others unset; the entry is there already. */
  | {
      readonly root: PdfChangeRoot;
      readonly id: string;
      readonly set: PdfEntry;
      readonly unset: readonly string[];
    }
  | { readonly root: PdfChangeRoot; readonly id: string; readonly remove: true };

/** Why a change was refused whole, writing nothing. */
export type PdfChangeRefusal = 'pdf_change_target_missing' | 'pdf_too_many_marks';

/** What a mark's maker may change of its look afterwards (marks.md "Changing a mark"). */
export type MarkLook = Partial<
  Pick<TextMark, 'colour' | 'opacity' | 'quads' | 'text' | 'modifiedAt'> &
    Pick<DrawingMark, 'strokes' | 'width'> & {
      /** A line's style; Solid reads as none. */
      readonly lineStyle: LineStyle;
      /** A Rectangle's or an Ellipse's fill, `#rrggbb`; null takes it away. */
      readonly fill: string | null;
    }
>;

/** A change to a mark: its look, and its geometry where it moved. */
export type MarkChange = MarkLook & Partial<MarkPlace>;

/** What of the stored file a deletion names (the layout's `removed`). */
export type RemovedKind = 'mark' | 'field' | 'object';

export type PdfChangesetResult =
  /** `back`: the changes that take the changeset back, to be made in the order given. */
  | { readonly ok: true; readonly back: readonly PdfChange[] }
  /** `at`: which change was refused; nothing was written. */
  | { readonly ok: false; readonly refusal: PdfChangeRefusal; readonly at: number };

const entriesOf = (doc: Y.Doc, root: PdfChangeRoot): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>(root);

const held = (entry: Y.Map<unknown>): PdfEntry => Object.fromEntries(entry.entries());

function refusalOf(doc: Y.Doc, change: PdfChange): PdfChangeRefusal | null {
  const entries = entriesOf(doc, change.root);
  const there = entries.has(change.id);
  if ('set' in change && !there) return 'pdf_change_target_missing';
  if ('put' in change && change.root === 'marks' && !there && entries.size >= PDF_MAX_MARKS)
    return 'pdf_too_many_marks';
  return null;
}

function write(doc: Y.Doc, change: PdfChange): void {
  const entries = entriesOf(doc, change.root);
  if ('remove' in change) {
    entries.delete(change.id);
  } else if ('put' in change) {
    const entry = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(change.put)) entry.set(key, value);
    entries.set(change.id, entry);
  } else {
    const entry = entries.get(change.id)!;
    for (const [key, value] of Object.entries(change.set)) entry.set(key, value);
    for (const key of change.unset) entry.delete(key);
  }
}

export const PdfChange = {
  /** A mark made. */
  addMark: (mark: Mark): PdfChange => ({ root: 'marks', id: mark.id, put: { ...mark } }),
  /** A mark made here changed: only what is given. */
  changeMark: (id: string, change: MarkChange): PdfChange => ({
    root: 'marks',
    id,
    set: { ...change },
    unset: [],
  }),
  /** A mark made here deleted. */
  removeMark: (id: string): PdfChange => ({ root: 'marks', id, remove: true }),
  /** A field filled. */
  fill: (value: FieldValue): PdfChange => ({
    root: 'fieldValues',
    id: value.field,
    put: { ...value },
  }),
  /** A field given back the value the stored file holds. */
  clearField: (field: string): PdfChange => ({ root: 'fieldValues', id: field, remove: true }),
  /** A mark, field or object of the stored file deleted. */
  removeFromFile: (id: string, kind: RemovedKind): PdfChange => ({
    root: 'removed',
    id,
    put: { kind },
  }),
  /** A deletion of something of the stored file taken back: the file's own shows again. */
  restoreFromFile: (id: string): PdfChange => ({ root: 'removed', id, remove: true }),
  /** A page turned to stand as given, in place of the file's own turn. */
  turnPage: (page: PageName, rotation: 0 | 90 | 180 | 270): PdfChange => ({
    root: 'pages',
    id: page,
    put: { rotation },
  }),

  /** The change that takes `change` back, read from the state before it is made; null where it changes nothing. */
  inverse: (doc: Y.Doc, change: PdfChange): PdfChange | null => {
    const { root, id } = change;
    const entry = entriesOf(doc, root).get(id);
    if ('remove' in change) return entry ? { root, id, put: held(entry) } : null;
    if ('put' in change) return entry ? { root, id, put: held(entry) } : { root, id, remove: true };
    if (!entry) return null;
    const touched = [...Object.keys(change.set), ...change.unset];
    const before = touched.filter((key) => entry.has(key));
    return {
      root,
      id,
      set: Object.fromEntries(before.map((key) => [key, entry.get(key)])),
      unset: touched.filter((key) => !entry.has(key)),
    };
  },

  /** Makes the change as one step; refused whole, by name, where it cannot be made. */
  apply: (doc: Y.Doc, change: PdfChange, origin?: unknown): PdfChangeRefusal | null => {
    const refusal = refusalOf(doc, change);
    if (refusal) return refusal;
    doc.transact(() => write(doc, change), origin);
    return null;
  },
} as const;

export const PdfChangeset = {
  /**
   * Makes the changes in order as one step, or none of them where one is refused. `back` takes the whole changeset
   * back when applied as a changeset itself.
   */
  apply: (doc: Y.Doc, changes: readonly PdfChange[], origin?: unknown): PdfChangesetResult => {
    const back: PdfChange[] = [];
    let refused: { refusal: PdfChangeRefusal; at: number } | null = null;
    doc.transact(() => {
      for (const [at, change] of changes.entries()) {
        const refusal = refusalOf(doc, change);
        if (refusal) {
          refused = { refusal, at };
          break;
        }
        const inverse = PdfChange.inverse(doc, change);
        if (inverse) back.unshift(inverse);
        write(doc, change);
      }
      // One refused: what the earlier ones wrote is written back within the same step, so nothing is seen to change.
      if (refused) for (const inverse of back) write(doc, inverse);
    }, origin);
    return refused
      ? { ok: false, ...(refused as { refusal: PdfChangeRefusal; at: number }) }
      : { ok: true, back };
  },
} as const;
