import { describe, expect, it } from 'vitest';
import {
  formatSummaryReport,
  formatTook,
  SUMMARY_REPORT_QUERIES,
  summaryReportOf,
  type SummaryRefreshRow,
} from './summary-refresh-report';

// docs/specs/006-document/document-storage.md "Refreshing the summaries" ("The operator's read"): the documents, how
// many are checked, would change, would gain textDocument, are written, every failure; complete when every document
// is checked (dry) or written (run) and none failed. Reads only.

const row = (id: string, over: Partial<SummaryRefreshRow> = {}): SummaryRefreshRow => ({
  document_id: id,
  changed: 0,
  gains_text_document: 0,
  checked_at: 1_000,
  written_at: null,
  error: null,
  fields: null,
  has_content_before: null,
  has_content_after: null,
  deltas: null,
  skipped: null,
  ...over,
});

describe('summaryReportOf', () => {
  it('totals the flags and names each failure', () => {
    const report = summaryReportOf(
      [
        row('a', { changed: 1, gains_text_document: 1 }),
        row('b', { changed: 1 }),
        row('c'),
        row('d', { error: 'TypeError', checked_at: 1_000 + 61 * 60_000 }),
      ],
      6,
      'dry',
    );
    expect(report).toEqual({
      mode: 'dry',
      documents: 6,
      checked: 3,
      changed: 2,
      gainsTextDocument: 1,
      written: 0,
      failed: [{ documentId: 'd', error: 'TypeError' }],
      tookMs: 61 * 60_000,
      complete: false,
      fieldCounts: {},
      deltaRanges: {},
      flips: [],
      skipped: [],
    });
  });

  it('counts each field, ranges each difference, and lists every hasContent flip and skip', () => {
    const report = summaryReportOf(
      [
        row('a', {
          changed: 1,
          fields: 'stats.bytes,tabCounts',
          deltas: JSON.stringify({ bytes: -40, tabCounts: 1 }),
          has_content_before: 1,
          has_content_after: 1,
        }),
        row('b', {
          changed: 1,
          fields: 'stats.bytes,hasContent',
          deltas: JSON.stringify({ bytes: 12 }),
          has_content_before: 1,
          has_content_after: 0,
        }),
        row('c', {
          changed: 1,
          fields: 'hasContent',
          deltas: '{}',
          has_content_before: 0,
          has_content_after: 1,
        }),
        row('d', { fields: '', deltas: '{}' }),
        row('e', { changed: 1, skipped: 'has_content_lost' }),
      ],
      5,
      'run',
    );
    expect(report.fieldCounts).toEqual({ 'stats.bytes': 2, tabCounts: 1, hasContent: 2 });
    expect(report.deltaRanges).toEqual({
      bytes: { min: -40, max: 12 },
      tabCounts: { min: 1, max: 1 },
    });
    expect(report.flips).toEqual([
      { documentId: 'b', from: true, to: false },
      { documentId: 'c', from: false, to: true },
    ]);
    expect(report.skipped).toEqual([{ documentId: 'e', reason: 'has_content_lost' }]);
    expect(formatSummaryReport(report)).toContain(
      [
        'field tabCounts: 1',
        'field stats.bytes: 2',
        'field hasContent: 2',
        'delta tabCounts: 1..1',
        'delta bytes: -40..12',
        'flip b true->false',
        'flip c false->true',
        'skipped e has_content_lost',
      ].join('\n'),
    );
  });

  it('counts a skipped document as settled in a run', () => {
    expect(
      summaryReportOf(
        [row('a', { written_at: 1 }), row('b', { skipped: 'has_content_lost' })],
        2,
        'run',
      ).complete,
    ).toBe(true);
  });

  it('is complete for a dry run when every document is checked and none failed', () => {
    expect(summaryReportOf([row('a'), row('b')], 2, 'dry').complete).toBe(true);
    expect(summaryReportOf([row('a')], 2, 'dry').complete).toBe(false);
  });

  it('is complete for a run only when every document is written', () => {
    expect(summaryReportOf([row('a'), row('b')], 2, 'run').complete).toBe(false);
    expect(
      summaryReportOf([row('a', { written_at: 1 }), row('b', { written_at: 1 })], 2, 'run'),
    ).toMatchObject({ written: 2, complete: true });
  });
});

describe('formatSummaryReport', () => {
  it('prints the counts, then each failure', () => {
    const text = formatSummaryReport(
      summaryReportOf(
        [row('a', { changed: 1, gains_text_document: 1 }), row('d', { error: 'E' })],
        3,
        'dry',
      ),
    );
    expect(text).toBe(
      [
        'mode: dry',
        'documents: 3',
        'checked: 1',
        'would change: 1',
        'would gain textDocument: 1',
        'written: 0',
        'took: 0h 00m',
        'failed d E',
        'complete: no',
      ].join('\n'),
    );
  });
});

describe('SUMMARY_REPORT_QUERIES', () => {
  it('only reads', () => {
    for (const q of SUMMARY_REPORT_QUERIES) expect(q.trimStart().startsWith('SELECT')).toBe(true);
  });
});

describe('formatTook', () => {
  it('says hours and minutes', () => {
    expect(formatTook(0)).toBe('0h 00m');
    expect(formatTook(61 * 60_000)).toBe('1h 01m');
    expect(formatTook(7 * 60_000 + 29_000)).toBe('0h 07m');
  });
});
