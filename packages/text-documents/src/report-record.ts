// The import report as the document keeps it (docs/specs/034-text-documents/files-and-print.md "Import report"): what
// reading the file dropped or kept ("Opened") and what each conversion could not carry ("Converted"), summarised so
// it stays small whatever the file held: each kind counted, with the first few of its names.
import type { ConversionLoss } from './convert';
import type { TextDocumentFormat } from './model/text-document';
import type { DroppedReason, ImportReport, ReportItem } from './report';

/** The distinct names an entry keeps; the rest are counted in `nameCount`. */
export const REPORT_NAMES_KEPT = 10;
/** The characters a kept name keeps (a name comes from the file). */
export const REPORT_NAME_MAX = 120;
/** The conversions the report keeps, the oldest dropped first. */
export const REPORT_CONVERSIONS_MAX = 20;

/** One kind of thing dropped, kept or lost: how many, the first of their names, and how many names there were. */
export type ReportEntry<Reason extends string = string> = {
  readonly reason: Reason;
  readonly count: number;
  readonly names: readonly string[];
  readonly nameCount: number;
};

export type ImportRecord = {
  /** The type of the file read: `odt`, `docx`, `txt`, `html` and on. */
  readonly type: string;
  readonly dropped: readonly ReportEntry<DroppedReason>[];
  readonly kept: ReportEntry<'kept'> | null;
};

export type ConversionRecord = {
  readonly from: TextDocumentFormat;
  readonly to: TextDocumentFormat;
  readonly losses: readonly ReportEntry<ConversionLoss['kind']>[];
};

export type TextDocumentReport = {
  readonly imported: ImportRecord | null;
  readonly converted: readonly ConversionRecord[];
};

export const EMPTY_REPORT: TextDocumentReport = { imported: null, converted: [] };

/** Items summarised by reason, in the order each reason first came. */
function entriesOf<Reason extends string>(
  items: readonly (ReportItem & { readonly reason: Reason })[],
): ReportEntry<Reason>[] {
  const byReason = new Map<Reason, { count: number; names: Set<string> }>();
  for (const item of items) {
    const entry = byReason.get(item.reason) ?? { count: 0, names: new Set<string>() };
    entry.count += item.count;
    entry.names.add(item.name.slice(0, REPORT_NAME_MAX));
    byReason.set(item.reason, entry);
  }
  return [...byReason].map(([reason, { count, names }]) => ({
    reason,
    count,
    names: [...names].slice(0, REPORT_NAMES_KEPT),
    nameCount: names.size,
  }));
}

/** A read's report as the document keeps it, or null when it dropped and kept nothing. */
export function importRecordOf(type: string, report: ImportReport): ImportRecord | null {
  if (report.dropped.length === 0 && report.kept.length === 0) return null;
  const [kept] = entriesOf(report.kept.map((item) => ({ ...item, reason: 'kept' as const })));
  return { type, dropped: entriesOf(report.dropped), kept: kept ?? null };
}

/** A conversion's losses as the document keeps them, or null when it lost nothing. */
export function conversionRecordOf(
  from: TextDocumentFormat,
  to: TextDocumentFormat,
  losses: readonly ConversionLoss[],
): ConversionRecord | null {
  if (losses.length === 0) return null;
  return { from, to, losses: entriesOf(losses.map((loss) => ({ ...loss, reason: loss.kind }))) };
}

/** The report with one more conversion, the oldest past the cap dropped. */
export const withConversion = (
  converted: readonly ConversionRecord[],
  record: ConversionRecord,
): ConversionRecord[] => [...converted, record].slice(-REPORT_CONVERSIONS_MAX);

export const isEmptyReport = (report: TextDocumentReport): boolean =>
  report.imported === null && report.converted.length === 0;

// Reading a stored value back: anything not of the shape reads as nothing rather than throwing.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
const isFormat = (value: unknown): value is TextDocumentFormat =>
  value === 'odf' || value === 'ooxml';

function entryOf(value: unknown): ReportEntry | null {
  if (!isRecord(value)) return null;
  const { reason, count, names, nameCount } = value;
  if (typeof reason !== 'string' || !isCount(count) || !isCount(nameCount)) return null;
  if (!Array.isArray(names) || !names.every((name) => typeof name === 'string')) return null;
  return { reason, count, names, nameCount };
}

function entriesRead(value: unknown): ReportEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map(entryOf);
  return entries.every((entry) => entry !== null) ? entries : null;
}

/** A stored import record, or null when there is none or it is not of the shape. */
export function readImportRecord(value: unknown): ImportRecord | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  const dropped = entriesRead(value.dropped);
  const kept = value.kept === null ? null : entryOf(value.kept);
  if (!dropped || (value.kept !== null && kept === null)) return null;
  return {
    type: value.type,
    dropped: dropped as ReportEntry<DroppedReason>[],
    kept: kept as ReportEntry<'kept'> | null,
  };
}

/** The stored conversions, those not of the shape left out. */
export function readConversionRecords(value: unknown): ConversionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ConversionRecord[] => {
    if (!isRecord(item) || !isFormat(item.from) || !isFormat(item.to)) return [];
    const losses = entriesRead(item.losses);
    return losses
      ? [
          {
            from: item.from,
            to: item.to,
            losses: losses as ReportEntry<ConversionLoss['kind']>[],
          },
        ]
      : [];
  });
}
