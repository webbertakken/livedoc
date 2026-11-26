// The operator's read of the content summaries' refresh (docs/specs/006-document/document-storage.md "Refreshing the
// summaries"): every document's flags from D1, totalled, each failure named. Pure, so the script that runs it through
// wrangler only fetches and prints.

/** The two reads, both SELECT only: each document's refresh row, and how many documents there are. */
export const SUMMARY_REPORT_QUERIES = [
  `SELECT document_id, changed, gains_text_document, checked_at, written_at, error
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
  // Every document checked (dry) or written (run), none failed: the pass is whole.
  complete: boolean;
};

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
    changed += r.changed;
    gainsTextDocument += r.gains_text_document;
    if (r.written_at !== null) written++;
  }
  const done = mode === 'dry' ? checked : written;
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
    `complete: ${report.complete ? 'yes' : 'no'}`,
  ].join('\n');
}
