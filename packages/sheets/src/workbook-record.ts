// The workbook row (docs/specs/029-sheets/sheet-store.md "In a spreadsheet"): what belongs to a spreadsheet as a
// whole rather than to one of its sheets. One per spreadsheet, in its room; a document holds one exactly when it is
// a spreadsheet (docs/specs/029-sheets/spreadsheet.md "The workbook shape").
import type { FileMeaning } from './formula/meaning';

/** The native file format a workbook keeps (standard-mapping.md): ODF as a package or flat, or OOXML. */
export const WORKBOOK_FORMATS = ['ods', 'fods', 'xlsx'] as const;
export type WorkbookFormat = (typeof WORKBOOK_FORMATS)[number];

/** A spreadsheet made in LiveDoc is born in ODF (fork C5, ruled 2026-11-18): no setting chooses otherwise. */
export const WORKBOOK_BORN_FORMAT: WorkbookFormat = 'ods';

// A new spreadsheet's one sheet, as Google Sheets starts (spreadsheet.md "Making a spreadsheet").
export const WORKBOOK_FIRST_SHEET_NAME = 'Sheet1';
export const WORKBOOK_ROWS_NEW = 1_000;
export const WORKBOOK_COLS_NEW = 26;

export const WORKBOOK_RECALC_MODES = ['change', 'minute', 'hour'] as const;
export type WorkbookRecalc = (typeof WORKBOOK_RECALC_MODES)[number];

// Iterative calculation's defaults and bounds, as Google Sheets' File › Settings (settings.md).
export const WORKBOOK_ITERATIONS_DEFAULT = 50;
export const WORKBOOK_ITERATIONS_MAX = 1_000;
export const WORKBOOK_THRESHOLD_DEFAULT = 0.05;

// The longest locale tag and time zone name a workbook keeps: room for any BCP 47 tag a browser reports, with its
// extensions, and any IANA zone name (the longest is 32 characters).
export const WORKBOOK_SETTING_TEXT_MAX = 64;

export type WorkbookSettings = {
  readonly locale: string;
  readonly timeZone: string;
  readonly recalc: WorkbookRecalc;
  readonly iterate: { readonly on: boolean; readonly max: number; readonly threshold: number };
};

export type WorkbookRecord = {
  readonly format: WorkbookFormat;
  readonly settings: WorkbookSettings;
  // Whose answer a formula Google and a standard answer differently gives (formulas.md, the file's meaning): the
  // standard of the format it was opened from, kept by its copies; absent, Google's (made in LiveDoc, or opened from a
  // file before the meaning was kept, D98).
  readonly meaning?: FileMeaning;
  // An Editor allowed its imports to fetch from the web (imports.md "Allow access"): for good, never on a copy.
  readonly importsAllowed?: true;
  // The spreadsheets its IMPORTRANGEs may read, connected by an Editor (formulas.md "Connecting two spreadsheets"):
  // for good, never on a copy; absent when none.
  readonly rangeSources?: readonly string[];
};

/** The sources a workbook keeps at most, and an id's longest (the api's bound on a document id). */
export const WORKBOOK_RANGE_SOURCES_MAX = 100;
const RANGE_SOURCE_RE = /^[A-Za-z0-9_-]{1,200}$/;

/** Connected sources from the wire or the room: each an id, no repeats, at most the bound; null when not. */
function readRangeSources(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > WORKBOOK_RANGE_SOURCES_MAX)
    return null;
  if (!raw.every((id): id is string => typeof id === 'string' && RANGE_SOURCE_RE.test(id)))
    return null;
  return new Set(raw).size === raw.length ? raw : null;
}

const isFormat = (value: unknown): value is WorkbookFormat =>
  (WORKBOOK_FORMATS as readonly unknown[]).includes(value);

const isFileMeaning = (value: unknown): value is FileMeaning =>
  value === 'ooxml' || value === 'openformula';

const isRecalc = (value: unknown): value is WorkbookRecalc =>
  (WORKBOOK_RECALC_MODES as readonly unknown[]).includes(value);

function readIterate(raw: unknown): WorkbookSettings['iterate'] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { on, max, threshold } = raw as Record<string, unknown>;
  if (typeof on !== 'boolean') return null;
  if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > WORKBOOK_ITERATIONS_MAX)
    return null;
  if (typeof threshold !== 'number' || !(threshold >= 0)) return null;
  return { on, max: max as number, threshold };
}

function readSettings(raw: unknown): WorkbookSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { locale, timeZone, recalc, iterate } = raw as Record<string, unknown>;
  const text = (v: unknown): v is string =>
    typeof v === 'string' && v !== '' && v.length <= WORKBOOK_SETTING_TEXT_MAX;
  if (!text(locale) || !text(timeZone)) return null;
  if (!isRecalc(recalc)) return null;
  const it = readIterate(iterate);
  return it ? { locale, timeZone, recalc, iterate: it } : null;
}

export const WorkbookRecord = {
  isFormat,

  /** Whether two formats are one standard (fork C1): a workbook leaves in either form of its own, never the other. */
  sameStandard: (a: WorkbookFormat, b: WorkbookFormat): boolean =>
    (a === 'xlsx') === (b === 'xlsx'),

  /** Settings from the wire or the room, or null when any of them is not one. */
  readSettings,

  /** A new spreadsheet's record: born in ODF, its settings from its maker's locale and time zone. */
  create: (made: { locale: string; timeZone: string }): WorkbookRecord => ({
    format: WORKBOOK_BORN_FORMAT,
    settings: {
      locale: made.locale,
      timeZone: made.timeZone,
      recalc: 'change',
      iterate: {
        on: false,
        max: WORKBOOK_ITERATIONS_DEFAULT,
        threshold: WORKBOOK_THRESHOLD_DEFAULT,
      },
    },
  }),

  /** The meaning a format's file has: OOXML's for `.xlsx`, OpenFormula's for `.ods` and `.fods`. */
  meaningOf: (format: WorkbookFormat): FileMeaning => (format === 'xlsx' ? 'ooxml' : 'openformula'),

  /** A new spreadsheet's record opened from a file: the file's format and that format's meaning. */
  opened: (made: WorkbookRecord, format: WorkbookFormat): WorkbookRecord => ({
    ...made,
    format,
    meaning: WorkbookRecord.meaningOf(format),
  }),

  /** The record converted to `format`: a file's meaning becomes the new format's (D97); Google's stays Google's. */
  converted: (record: WorkbookRecord, format: WorkbookFormat): WorkbookRecord => ({
    ...record,
    format,
    ...(record.meaning ? { meaning: WorkbookRecord.meaningOf(format) } : {}),
  }),

  /** Sources as kept (the room's column), or none when they are not (logged by the caller). */
  readRangeSources,

  /** A record from the wire or the room, or null when any part of it is not one. */
  read: (raw: unknown): WorkbookRecord | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const { format, settings, importsAllowed, rangeSources, meaning } = raw as Record<
      string,
      unknown
    >;
    if (!isFormat(format)) return null;
    if (meaning !== undefined && !isFileMeaning(meaning)) return null;
    const read = readSettings(settings);
    if (!read) return null;
    const sources = rangeSources === undefined ? undefined : readRangeSources(rangeSources);
    if (sources === null) return null;
    return {
      format,
      settings: read,
      ...(meaning === undefined ? {} : { meaning }),
      ...(importsAllowed === true ? { importsAllowed } : {}),
      ...(sources ? { rangeSources: sources } : {}),
    };
  },
} as const;
