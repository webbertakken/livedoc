import { describe, expect, it } from 'vitest';
import { assertSelect } from '../document-room/content-move-plan';
import {
  DRY_REPORT_QUERIES,
  dryReportOf,
  formatDryReport,
  type DryRow,
} from './sheet-migration-report';

// docs/specs/029-sheets/migration.md "How it runs": the operator reads the dry run's counts, read-only, totalled by
// what each document would become, with every failure named and what is left to plan counted.

const row = (over: Partial<DryRow>): DryRow => ({
  document_id: 'd',
  kind: 'none',
  tabs: 0,
  sheets: 0,
  cells: 0,
  card_tables: 0,
  charts: 0,
  tabs_removed: 0,
  sheets_left: 0,
  error: null,
  ...over,
});

describe('the dry run report', () => {
  it('reads with SELECT alone', () => {
    for (const q of DRY_REPORT_QUERIES) expect(() => assertSelect(q)).not.toThrow();
  });

  it('totals by kind, names failures and is whole only when all are planned', () => {
    const report = dryReportOf(
      [
        row({ document_id: 'a', kind: 'in-place', tabs: 2, sheets: 2, cells: 10, charts: 1 }),
        row({ document_id: 'b', kind: 'in-place', tabs: 1, sheets: 1, cells: 5, card_tables: 1 }),
        row({
          document_id: 'c',
          kind: 'split',
          tabs: 1,
          sheets: 1,
          tabs_removed: 1,
          sheets_left: 2,
        }),
        row({ document_id: 'd' }),
        row({ document_id: 'e', kind: 'failed', error: 'TypeError' }),
        row({ document_id: 'f', kind: 'failed' }),
      ],
      3,
    );
    expect(report.byKind['in-place']).toEqual({
      documents: 2,
      tabs: 3,
      sheets: 3,
      cells: 15,
      cardTables: 1,
      charts: 1,
      tabsRemoved: 0,
      sheetsLeft: 0,
    });
    expect(report.byKind.split).toMatchObject({ documents: 1, tabsRemoved: 1, sheetsLeft: 2 });
    expect(report.byKind.none.documents).toBe(1);
    expect(report.failed).toEqual([
      { documentId: 'e', error: 'TypeError' },
      { documentId: 'f', error: 'unknown' },
    ]);
    expect(report.complete).toBe(false);
    const text = formatDryReport(report);
    expect(text).toContain('failed e TypeError');
    expect(text).toContain('not planned yet: 3');
    expect(text.split('\n')[2]).toMatch(/^in-place\s+2\s+3\s+3\s+15\s+1\s+1\s+0\s+0$/);
  });

  it('is whole when every document is planned and none failed', () => {
    expect(dryReportOf([row({})], 0).complete).toBe(true);
  });
});
