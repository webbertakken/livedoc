// docs/specs/029-sheets/files-and-print.md "The import report" (D120): a line a kind, in the spec's order, counted,
// naming up to three; kept content one line; a dropped entry by what it was; a thumbnail never listed.
import { describe, expect, it } from 'vitest';
import { importReport, REPORT_NAMES_SHOWN, REPORTED_KINDS } from './import-report';
import type { FileLoss } from './workbook-file';

describe('importReport', () => {
  it('lists nothing for a file that left nothing behind', () => {
    expect(importReport([])).toEqual([]);
  });

  it('gives a line a kind in the spec’s order, each counted with its first names', () => {
    const losses: FileLoss[] = [
      { k: 'sheet_renamed', from: 'Data', to: 'Data (2)' },
      { k: 'sizes_cut', sheet: 'Data' },
      { k: 'format_rule_unread', sheet: 'Data', r: 1, c: 0 },
      { k: 'validation_rule_unread', sheet: 'Data', r: 2, c: 1 },
      { k: 'validation_rule_changed', sheet: 'Data', r: 3, c: 1 },
      { k: 'protection_cut', sheet: 'Data' },
      { k: 'protection_changed', sheet: 'Data' },
      { k: 'protection_unread', sheet: 'Data' },
      { k: 'styles_unread', sheet: 'Data' },
      { k: 'formats_cut', sheet: 'Data' },
      { k: 'format_approximated', sheet: 'Data', code: 'yyyy' },
      { k: 'format_unwritten', sheet: 'Data', r: 0, c: 0 },
      { k: 'format_unread', sheet: 'My data', r: 1, c: 27 },
      { k: 'answers_differ', count: 2, functions: ['CEILING', 'SORT'] },
      { k: 'parts_left', count: 1 },
      { k: 'kept_too_large', count: 2 },
      { k: 'kept_dropped', count: 1 },
      { k: 'kept_unread', count: 1 },
      { k: 'kept_cut', sheet: 'Data', cells: 4 },
      {
        k: 'entries_dropped',
        entries: [
          'Thumbnails/thumbnail.png',
          'xl/embeddings/oleObject1.bin',
          'META-INF/documentsignatures.xml',
          'Basic/Standard/Module1.xml',
        ],
      },
      { k: 'text_cut', sheet: 'Data', cells: 3 },
      { k: 'formula_unwritten', sheet: 'Data', r: 0, c: 1 },
      { k: 'formula_unread', sheet: 'Data', r: 4, c: 2 },
      { k: 'function_unwritten', name: 'TWICE' },
      { k: 'function_cut', name: 'TWICE' },
      { k: 'function_unread', name: 'SUM' },
      { k: 'name_unwritten', name: 'R' },
      { k: 'name_unread', name: 'Rate' },
      { k: 'cells_cut', sheet: 'Data' },
      { k: 'sheet_cut', sheet: 'Data', rows: 10, cols: 10 },
      { k: 'sheet_unread', sheet: 'Chart1' },
      { k: 'charts_unwritten', sheet: 'Data' },
      { k: 'chart_rewritten', sheet: 'Data' },
      { k: 'chart_nearest_type', sheet: 'Data' },
      { k: 'pivot_unwritten', sheet: 'Data' },
      { k: 'pivot_changed', sheet: 'Data' },
      { k: 'sheets_cut', kept: 200, had: 203 },
    ];
    const report = importReport(losses);
    expect(report.map((line) => line.k)).toEqual(REPORTED_KINDS);
    expect(report).toEqual([
      { k: 'sheets_cut', count: 3, names: [] },
      { k: 'sheet_unread', count: 1, names: ['Chart1'] },
      { k: 'sheet_cut', count: 1, names: ['Data'] },
      { k: 'cells_cut', count: 1, names: ['Data'] },
      { k: 'formula_unread', count: 1, names: ['Data!C5'] },
      { k: 'name_unread', count: 1, names: ['Rate'] },
      { k: 'function_unread', count: 1, names: ['SUM'] },
      { k: 'formula_unwritten', count: 1, names: ['Data!B1'] },
      { k: 'text_cut', count: 3, names: ['Data'] },
      { k: 'macros', count: 1, names: ['Basic/Standard/Module1.xml'] },
      { k: 'signature', count: 1, names: ['META-INF/documentsignatures.xml'] },
      { k: 'objects', count: 1, names: ['xl/embeddings/oleObject1.bin'] },
      { k: 'kept', count: 9, names: [] },
      { k: 'answers_differ', count: 2, names: ['CEILING', 'SORT'] },
      { k: 'format_unread', count: 1, names: ["'My data'!AB2"] },
      { k: 'format_unwritten', count: 1, names: ['Data!A1'] },
      { k: 'format_approximated', count: 1, names: ['yyyy'] },
      { k: 'formats_cut', count: 1, names: ['Data'] },
      { k: 'styles_unread', count: 1, names: ['Data'] },
      { k: 'format_rule_unread', count: 1, names: ['Data!A2'] },
      { k: 'validation_rule_unread', count: 1, names: ['Data!B3'] },
      { k: 'protection_cut', count: 1, names: ['Data'] },
      { k: 'sizes_cut', count: 1, names: ['Data'] },
      { k: 'charts_unwritten', count: 1, names: ['Data'] },
      { k: 'chart_rewritten', count: 1, names: ['Data'] },
      { k: 'chart_nearest_type', count: 1, names: ['Data'] },
      { k: 'pivot_unwritten', count: 1, names: ['Data'] },
      { k: 'sheet_renamed', count: 1, names: [{ from: 'Data', to: 'Data (2)' }] },
    ]);
  });

  it('counts every loss of a kind but names each once, up to three', () => {
    const sheets = ['A', 'B', 'A', 'C', 'D'];
    const report = importReport([
      ...sheets.map((sheet): FileLoss => ({ k: 'styles_unread', sheet })),
      ...sheets.map((sheet): FileLoss => ({ k: 'sheet_renamed', from: sheet, to: `${sheet}2` })),
    ]);
    expect(report).toEqual([
      { k: 'styles_unread', count: 5, names: ['A', 'B', 'C'] },
      {
        k: 'sheet_renamed',
        count: 5,
        names: ['A', 'B', 'C'].map((s) => ({ from: s, to: `${s}2` })),
      },
    ]);
    expect(report[0]!.names).toHaveLength(REPORT_NAMES_SHOWN);
  });

  it('leaves out a thumbnail and a count of none', () => {
    expect(
      importReport([
        { k: 'entries_dropped', entries: ['Thumbnails/thumbnail.png', 'docProps/thumbnail.jpeg'] },
        { k: 'kept_unread', count: 0 },
      ]),
    ).toEqual([]);
  });
});
