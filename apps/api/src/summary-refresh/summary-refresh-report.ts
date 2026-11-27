// The operator's read of the content summaries' refresh (docs/specs/006-document/document-storage.md "Refreshing the
// summaries"): every document's flags from D1, totalled, each failure named; which fields differ in how many documents,
// each difference's range, every hasContent flip and every document the run skipped. Pure, so the script that runs it through
// wrangler only fetches and prints.

import { SUMMARY_FIELDS } from './summary-refresh-fields';

/** The numeric differences in the order they are printed. */
const DELTA_NAMES = [
  'tabs',
  'firstTabCount',
  'tabCounts',
  'elements',
  'comments',
  'bytes',
] as const;

/** The two reads, both SELECT only: each document's refresh row, and how many documents there are. */
export const SUMMARY_REPORT_QUERIES = [
  `SELECT document_id, changed, gains_text_document, checked_at, written_at, error,
          fields, has_content_before, has_content_after, deltas, skipped
     FROM summary_refreshes ORDER BY document_id`,
  `SELECT COUNT(*) AS n FROM documents`,
] as const;

export type SummaryRefreshRow = {
  document_id: string;
  changed: number;
  gains_text_document: number;
  checked_at: number;
  written_at: number | null;
  error: string | null;
  /** The fields that differ, comma separated; null before they were recorded. */
  fields: string | null;
  has_content_before: number | null;
  has_content_after: number | null;
  /** JSON of the numeric differences. */
  deltas: string | null;
  skipped: string | null;
};

export type SummaryReportMode = 'dry' | 'run';

export type SummaryReport = {
  mode: SummaryReportMode;
  documents: number;
  checked: number;
  changed: number;
  gainsTextDocument: number;
  written: number;
  failed: { documentId: string; error: string }[];
  // From the first check to the last (or the last write, for a run), in milliseconds; 0 with none.
  tookMs: number;
  // Every document checked (dry) or written or skipped (run), none failed: the pass is whole.
  complete: boolean;
  // How many documents each field differs in, in SUMMARY_FIELDS order.
  fieldCounts: Record<string, number>;
  // Each numeric difference's least and greatest.
  deltaRanges: Record<string, { min: number; max: number }>;
  // Every document whose hasContent would flip, either way.
  flips: { documentId: string; from: boolean; to: boolean }[];
  skipped: { documentId: string; reason: string }[];
};

function numbersOf(deltas: string | null): Record<string, number> {
  if (!deltas) return {};
  try {
    return JSON.parse(deltas) as Record<string, number>;
  } catch {
    return {};
  }
}

export function summaryReportOf(
  rows: readonly SummaryRefreshRow[],
  documents: number,
  mode: SummaryReportMode,
): SummaryReport {
  let checked = 0;
  let changed = 0;
  let gainsTextDocument = 0;
  let written = 0;
  const failed: SummaryReport['failed'] = [];
  const counts = new Map<string, number>();
  const ranges = new Map<string, { min: number; max: number }>();
  const flips: SummaryReport['flips'] = [];
  const skipped: SummaryReport['skipped'] = [];
  let first = Infinity;
  let last = -Infinity;
  for (const r of rows) {
    first = Math.min(first, r.checked_at);
    last = Math.max(last, r.written_at ?? r.checked_at);
    if (r.error !== null) {
      failed.push({ documentId: r.document_id, error: r.error });
      continue;
    }
    checked++;
    for (const field of r.fields ? r.fields.split(',') : [])
      counts.set(field, (counts.get(field) ?? 0) + 1);
    for (const [name, value] of Object.entries(numbersOf(r.deltas))) {
      const was = ranges.get(name);
      ranges.set(name, {
        min: Math.min(was?.min ?? value, value),
        max: Math.max(was?.max ?? value, value),
      });
    }
    if (r.has_content_before !== null && r.has_content_after !== null)
      if (r.has_content_before !== r.has_content_after)
        flips.push({
          documentId: r.document_id,
          from: r.has_content_before === 1,
          to: r.has_content_after === 1,
        });
    if (r.skipped !== null) skipped.push({ documentId: r.document_id, reason: r.skipped });
    changed += r.changed;
    gainsTextDocument += r.gains_text_document;
    if (r.written_at !== null) written++;
  }
  const done = mode === 'dry' ? checked : written + skipped.length;
  const fieldCounts: Record<string, number> = {};
  for (const field of SUMMARY_FIELDS) {
    const n = counts.get(field);
    if (n) fieldCounts[field] = n;
  }
  const deltaRanges: SummaryReport['deltaRanges'] = {};
  for (const name of DELTA_NAMES) {
    const range = ranges.get(name);
    if (range) deltaRanges[name] = range;
  }
  return {
    mode,
    documents,
    checked,
    changed,
    gainsTextDocument,
    written,
    failed,
    tookMs: rows.length > 0 ? last - first : 0,
    complete: failed.length === 0 && done >= documents,
    fieldCounts,
    deltaRanges,
    flips,
    skipped,
  };
}

/** A span as hours and minutes, the sweep's own grain (a minute a batch). */
export function formatTook(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** The report as the script prints it: the counts, each failure, then whether the pass is whole. */
export function formatSummaryReport(report: SummaryReport): string {
  return [
    `mode: ${report.mode}`,
    `documents: ${report.documents}`,
    `checked: ${report.checked}`,
    `would change: ${report.changed}`,
    `would gain textDocument: ${report.gainsTextDocument}`,
    `written: ${report.written}`,
    `took: ${formatTook(report.tookMs)}`,
    ...report.failed.map((f) => `failed ${f.documentId} ${f.error}`),
    ...Object.entries(report.fieldCounts).map(([field, n]) => `field ${field}: ${n}`),
    ...Object.entries(report.deltaRanges).map(([name, r]) => `delta ${name}: ${r.min}..${r.max}`),
    ...report.flips.map((f) => `flip ${f.documentId} ${f.from}->${f.to}`),
    ...report.skipped.map((s) => `skipped ${s.documentId} ${s.reason}`),
    `complete: ${report.complete ? 'yes' : 'no'}`,
  ].join('\n');
}
