// What a workbook holds beside its sheets' cells (docs/specs/029-sheets/sheet-store.md "In a spreadsheet";
// spreadsheet.md "What a workbook holds"): objects over a sheet (charts, pivot tables, images, ...) and the content a
// file carried that LiveDoc does not model, kept to be written back
// (standard-mapping.md "Unknown content"). Each a plain value with a reader that refuses what is not one.
import { isAxisId, isSheetId } from '../ids';
import type { IdRange } from '../sheet';
import { idRangeOk } from '../validate';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';

const PART_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isPartId = (v: unknown): v is string => typeof v === 'string' && PART_ID.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ---- Objects over a sheet ----------------------------------------------------------------------------------------

export const WORKBOOK_OBJECT_KINDS = [
  'chart',
  'pivot',
  'image',
  'drawing',
  'slicer',
  'filter-view',
  'table',
  'timeline',
] as const;
export type WorkbookObjectKind = (typeof WORKBOOK_OBJECT_KINDS)[number];

// An object's model as stored: one row, so under the room's row cap with room to spare.
export const WORKBOOK_OBJECT_BYTES_MAX = 1024 * 1024;

// Where an object sits: over a cell (its top-left at an offset, its size in px), or as a sheet of its own (a chart
// moved to its own sheet), or nowhere visible (a filter view, a table: they cover a range held in their model).
export type ObjectAnchor =
  | {
      readonly at: 'cell';
      readonly r: string;
      readonly c: string;
      readonly dx: number;
      readonly dy: number;
      readonly w: number;
      readonly h: number;
    }
  | { readonly at: 'sheet' }
  | { readonly at: 'none' };

export type WorkbookObject = {
  readonly id: string;
  readonly sheetId: string;
  readonly kind: WorkbookObjectKind;
  readonly anchor: ObjectAnchor;
  // The object's own model, read by its area (charts.md, pivot-tables.md, ...).
  readonly model: Readonly<Record<string, unknown>>;
};

const isPx = (v: unknown): v is number =>
  Number.isFinite(v) && (v as number) >= 0 && (v as number) <= 100_000;

function readAnchor(raw: unknown): ObjectAnchor | null {
  if (!isRecord(raw)) return null;
  if (raw.at === 'sheet' || raw.at === 'none') return { at: raw.at };
  if (raw.at !== 'cell') return null;
  const { r, c, dx, dy, w, h } = raw;
  if (!isAxisId(r) || !isAxisId(c) || ![dx, dy, w, h].every(isPx)) return null;
  return { at: 'cell', r, c, dx: dx as number, dy: dy as number, w: w as number, h: h as number };
}

export const WorkbookObject = {
  read: (raw: unknown): WorkbookObject | null => {
    if (!isRecord(raw)) return null;
    const { id, sheetId, kind, anchor, model } = raw;
    if (!isPartId(id) || !isSheetId(sheetId)) return null;
    if (!(WORKBOOK_OBJECT_KINDS as readonly unknown[]).includes(kind)) return null;
    const placed = readAnchor(anchor);
    if (!placed || !isRecord(model)) return null;
    if (JSON.stringify(model).length > WORKBOOK_OBJECT_BYTES_MAX) return null;
    return { id, sheetId, kind: kind as WorkbookObjectKind, anchor: placed, model };
  },
} as const;

// ---- Unknown content (standard-mapping.md "Unknown content") -----------------------------------------------------

// One kept fragment's XML: a part a file carried whole (a macro project, a custom part) is kept up to this.
export const KEPT_PART_BYTES_MAX = 4 * 1024 * 1024;
// The path of the part inside its file's package.
export const KEPT_PART_PATH_MAX = 512;

export type KeptAnchor =
  | { readonly at: 'workbook' }
  | { readonly at: 'sheet'; readonly sheetId: string }
  | { readonly at: 'cell'; readonly sheetId: string; readonly r: string; readonly c: string }
  | { readonly at: 'range'; readonly sheetId: string; readonly range: IdRange };

export type KeptPart = {
  readonly id: string;
  // The format it is written back to; never into the other one.
  readonly format: WorkbookFormat;
  readonly part: string;
  readonly anchor: KeptAnchor;
  readonly xml: string;
};

function readKeptAnchor(raw: unknown): KeptAnchor | null {
  if (!isRecord(raw)) return null;
  if (raw.at === 'workbook') return { at: 'workbook' };
  if (!isSheetId(raw.sheetId)) return null;
  const sheetId = raw.sheetId;
  if (raw.at === 'sheet') return { at: 'sheet', sheetId };
  if (raw.at === 'cell')
    return isAxisId(raw.r) && isAxisId(raw.c) ? { at: 'cell', sheetId, r: raw.r, c: raw.c } : null;
  if (raw.at === 'range')
    return idRangeOk(raw.range) ? { at: 'range', sheetId, range: raw.range } : null;
  return null;
}

export const KeptPart = {
  read: (raw: unknown): KeptPart | null => {
    if (!isRecord(raw)) return null;
    const { id, format, part, anchor, xml } = raw;
    if (!isPartId(id) || !WorkbookRecord.isFormat(format)) return null;
    if (typeof part !== 'string' || part.length === 0 || part.length > KEPT_PART_PATH_MAX)
      return null;
    if (typeof xml !== 'string' || xml.length > KEPT_PART_BYTES_MAX) return null;
    const placed = readKeptAnchor(anchor);
    return placed ? { id, format, part, anchor: placed, xml } : null;
  },

  /** What a file in `format` writes back: only what was kept from that format (C1: never across formats). */
  forFormat: (kept: readonly KeptPart[], format: WorkbookFormat): KeptPart[] => {
    const family = (f: WorkbookFormat) => (f === 'xlsx' ? 'ooxml' : 'odf');
    return kept.filter((k) => family(k.format) === family(format));
  },
} as const;
