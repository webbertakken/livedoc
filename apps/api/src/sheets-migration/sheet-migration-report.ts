// The operator's read of the Sheets migration's dry run (docs/specs/029-sheets/migration.md "How it runs"): every
// document's planned counts from D1, totalled by what each would become, the failures named and the documents not
// planned yet counted. Pure, so the script that runs it through wrangler only fetches and prints.

/** The two reads, both SELECT only: each document's plan, and the documents with none yet. */
export const DRY_REPORT_QUERIES = [
  `SELECT document_id, kind, tabs, sheets, cells, card_tables, charts, tabs_removed, sheets_left, error
     FROM sheet_migration_plans ORDER BY document_id`,
  `SELECT COUNT(*) AS n FROM documents d
     LEFT JOIN sheet_migration_plans p ON p.document_id = d.id WHERE p.document_id IS NULL`,
] as const;

export type DryRow = {
  document_id: string;
  kind: 'none' | 'in-place' | 'split' | 'failed';
  tabs: number;
  sheets: number;
  cells: number;
  card_tables: number;
  charts: number;
  tabs_removed: number;
  sheets_left: number;
  error: string | null;
};

type Totals = {
  documents: number;
  tabs: number;
  sheets: number;
  cells: number;
  cardTables: number;
  charts: number;
  tabsRemoved: number;
  sheetsLeft: number;
};

export type DryReport = {
  byKind: Record<'none' | 'in-place' | 'split', Totals>;
  failed: { documentId: string; error: string }[];
  unplanned: number;
  // Every document planned, none failed: the dry run is whole.
  complete: boolean;
};

const zero = (): Totals => ({
  documents: 0,
  tabs: 0,
  sheets: 0,
  cells: 0,
  cardTables: 0,
  charts: 0,
  tabsRemoved: 0,
  sheetsLeft: 0,
});

export function dryReportOf(rows: readonly DryRow[], unplanned: number): DryReport {
  const byKind = { none: zero(), 'in-place': zero(), split: zero() };
  const failed: DryReport['failed'] = [];
  for (const r of rows) {
    if (r.kind === 'failed') {
      failed.push({ documentId: r.document_id, error: r.error ?? 'unknown' });
      continue;
    }
    const t = byKind[r.kind];
    t.documents++;
    t.tabs += r.tabs;
    t.sheets += r.sheets;
    t.cells += r.cells;
    t.cardTables += r.card_tables;
    t.charts += r.charts;
    t.tabsRemoved += r.tabs_removed;
    t.sheetsLeft += r.sheets_left;
  }
  return { byKind, failed, unplanned, complete: failed.length === 0 && unplanned === 0 };
}

/** The report as the script prints it: one line a kind, then each failure, then what is left to plan. */
export function formatDryReport(report: DryReport): string {
  const lines = [
    'kind      documents  tabs  sheets  cells  card-tables  charts  tabs-removed  sheets-left',
  ];
  for (const [kind, t] of Object.entries(report.byKind))
    lines.push(
      [
        kind.padEnd(8),
        String(t.documents).padStart(11),
        String(t.tabs).padStart(5),
        String(t.sheets).padStart(7),
        String(t.cells).padStart(6),
        String(t.cardTables).padStart(12),
        String(t.charts).padStart(7),
        String(t.tabsRemoved).padStart(13),
        String(t.sheetsLeft).padStart(12),
      ].join(' '),
    );
  for (const f of report.failed) lines.push(`failed ${f.documentId} ${f.error}`);
  lines.push(`not planned yet: ${report.unplanned}`);
  return lines.join('\n');
}
