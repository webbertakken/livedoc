// A spreadsheet's pivot tables for agents (docs/specs/029-sheets/pivot-tables.md "The model", "Working with one"):
// change_sheet's pivot sets one by its columns' names, clear_pivots takes them off, read_sheet answers them, and a
// value typed into the output is refused.
import { describe, expect, it } from 'vitest';
import { sheetFromJson, Workbook, WorkbookRecord, type SheetPivot } from '@livedoc/sheets';
import { DOC_A, fakeApi } from '../testing/fake-api';
import { sheetJson, sheetServer } from '../testing/sheets';
import { changeSheet } from './change-sheet';
import { readSheet } from './read-sheet';
import { buildPivotChange, pivotsClearWrite, pivotsRead } from './sheet-pivot-objects';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const DATA = [
  ['Region', 'Units', 'Rep'],
  ['East', 5, 'Ann'],
  ['West', 3, 'Bo'],
  ['East', 2, 'Ann'],
];

function book() {
  const server = sheetServer(
    DOC_A,
    [
      sheetJson({ id: 'sheet_data01', tabId: 'tab-data', title: 'Data' }, DATA),
      sheetJson({ id: 'sheet_rep001', tabId: 'tab-rep', title: 'Report' }, []),
    ],
    { workbook: WORKBOOK },
  );
  return { api: fakeApi(server.routes), server };
}

const change = (api: ReturnType<typeof book>['api'], sheet: string, changes: unknown[]) =>
  changeSheet(api, DOC_A, { sheet, changes: changes as never }, 'mcp');

let seq = 3;
const rand = () => ((seq = (seq * 16807) % 2147483647) - 1) / 2147483646;

function workbook() {
  const data = sheetFromJson(sheetJson({ id: 'sheet_data01', tabId: 't1', title: 'Data' }, DATA));
  const rep = sheetFromJson(sheetJson({ id: 'sheet_rep001', tabId: 't2', title: 'Report' }));
  return { wb: new Workbook({ sheets: [data, rep], locale: 'en-GB' }), data, rep };
}

describe('change_sheet’s pivot', () => {
  it('sets a pivot table by its columns’ names, its output read like cells, and refuses typing into it', async () => {
    const { api, server } = book();
    const made = await change(api, 'Data', [
      {
        op: 'pivot',
        range: 'A1:C4',
        rows: ['Region'],
        values: [{ column: 'units' }, { column: 'C' }],
      },
    ]);
    expect(made.refusal).toBeUndefined();
    const pivot = server.sheets[0]!.layout.objects![0] as SheetPivot;
    expect(made.applied[0]).toBe(
      `pivot table ${pivot.id} of A1:C4 at E1: rows Region; values SUM of Units, COUNTA of Rep`,
    );
    const read = (await readSheet(api, DOC_A, { sheet: 'Data' })) as { pivots?: { id: string }[] };
    expect(read.pivots?.map((x) => x.id)).toEqual([pivot.id]);
    const missing = await change(api, 'Data', [{ op: 'clear_pivots', id: 'nope' }]);
    expect(missing.refusal?.code).toBe('pivot_not_found');
    const typed = await change(api, 'Data', [{ op: 'set', at: 'F2', rows: [[9]] }]);
    expect(typed.refusal?.code).toBe('pivot_cell');
    const cleared = await change(api, 'Data', [{ op: 'clear_pivots', id: pivot.id }]);
    expect(cleared.applied).toEqual([`cleared the pivot table ${pivot.id} (1)`]);
    expect(server.sheets[0]!.layout.objects ?? []).toEqual([]);
    const none = await change(api, 'Data', [{ op: 'clear_pivots' }]);
    expect(none.applied).toEqual(['cleared the sheet’s pivot tables (none there)']);
  });

  it('works on a spreadsheet’s sheet alone', async () => {
    const server = sheetServer(DOC_A, [
      sheetJson({ id: 'sheet_plan01', tabId: 't1', title: 'Costs' }),
    ]);
    for (const op of [{ op: 'pivot', range: 'A1:B2' }, { op: 'clear_pivots' }]) {
      const result = await changeSheet(
        fakeApi(server.routes),
        DOC_A,
        { sheet: 'Costs', changes: [op as never] },
        'mcp',
      );
      expect(result.refusal?.code).toBe('not_spreadsheet');
    }
  });
});

describe('a pivot table built for an agent', () => {
  it('reads another sheet, places it at a cell, and sets every option', () => {
    const { wb, rep, data } = workbook();
    const built = buildPivotChange(
      wb,
      rep.id,
      {
        op: 'pivot',
        range: 'Data!A1:C4',
        at: 'B2',
        rows: [{ column: 'Region', order: 'desc', sortBy: 'Total', totals: false, repeat: true }],
        columns: ['Rep'],
        values: [
          { column: 'Units', summarise: 'MAX', showAs: 'row', name: 'Total' },
          { formula: "='Units'*2", name: 'Double', showAs: 'total' },
        ],
        filters: [
          { column: 'Region', show: ['East'] },
          { column: 'Rep', formula: '=Units>1' },
        ],
        valuesAsRows: true,
      },
      rand,
    );
    if (!built.ok) throw new Error(built.message);
    const { rows, cols } = data.layout;
    const object = (built.writes[0] as { changes: { object: SheetPivot }[] }).changes[0]!.object;
    expect(object).toMatchObject({
      at: { r: rep.layout.rows[1], c: rep.layout.cols[1] },
      source: { r1: rows[0], c1: cols[0], r2: rows[3], c2: cols[2], s: data.id },
      rows: [{ col: cols[0], desc: true, sortBy: { value: 0 }, totals: false, repeat: true }],
      columns: [{ col: cols[2] }],
      values: [
        { col: cols[1], summary: 'MAX', showAs: 'row', name: 'Total' },
        { formula: "='Units'*2", name: 'Double', summary: 'SUM', showAs: 'total' },
      ],
      filters: [
        { col: cols[0], cond: { values: ['East'] } },
        { col: cols[2], formula: '=Units>1' },
      ],
      valuesAsRows: true,
    });
    expect(built.line).toMatch(/at B2: rows Region; columns Rep; values Total, Double$/);
  });

  it('starts at A1 for another sheet’s range, and says when it has no fields yet', () => {
    const { wb, rep } = workbook();
    const built = buildPivotChange(wb, rep.id, { op: 'pivot', range: 'Data!A1:B3' }, rand);
    expect(built).toMatchObject({ ok: true });
    expect(built.ok && built.line).toMatch(/at A1 \(no fields yet\)$/);
  });

  it('refuses what it cannot read, naming what it can', () => {
    const { wb, data } = workbook();
    const go = (extra: object) =>
      buildPivotChange(wb, data.id, { op: 'pivot', range: 'A1:C4', ...extra }, rand);
    expect(go({ range: 'nope' })).toMatchObject({ code: 'range_invalid' });
    expect(go({ range: 'A1:C1' })).toMatchObject({ code: 'range_invalid' });
    expect(go({ at: 'ZZZ99999' })).toMatchObject({ code: 'range_invalid' });
    expect(go({ at: 'nope' })).toMatchObject({ code: 'range_invalid' });
    expect(go({ rows: ['Nope'] })).toMatchObject({
      code: 'column_not_found',
      message: expect.stringContaining('"Region", "Units", "Rep"'),
    });
    expect(go({ columns: [{ column: 'Nope' }] })).toMatchObject({ code: 'column_not_found' });
    expect(go({ values: [{ column: 'Nope' }] })).toMatchObject({ code: 'column_not_found' });
    expect(go({ filters: [{ column: 'Nope', show: [] }] })).toMatchObject({
      code: 'column_not_found',
    });
    expect(go({ values: [{ formula: 'Units*2', name: 'x' }] })).toMatchObject({
      code: 'formula_invalid',
    });
    expect(go({ rows: [{ column: 'Region', sortBy: 'Nope' }] })).toMatchObject({
      code: 'write_invalid',
      message: expect.stringContaining('none yet'),
    });
    expect(
      go({ values: [{ column: 'Units' }], rows: [{ column: 'Region', sortBy: 'Nope' }] }),
    ).toMatchObject({ message: expect.stringContaining('"SUM of Units"') });
    expect(go({ replace: 'nope' })).toMatchObject({
      code: 'pivot_not_found',
      message: expect.stringContaining('none'),
    });
  });

  it('takes the place of one by its id', () => {
    const { wb, data } = workbook();
    const first = buildPivotChange(wb, data.id, { op: 'pivot', range: 'A1:C4' }, rand);
    if (!first.ok) throw new Error('x');
    const placed = (first.writes[0] as { changes: { object: SheetPivot }[] }).changes[0]!.object;
    wb.updateSheet({ ...data, layout: { ...data.layout, objects: [placed] } });
    const again = buildPivotChange(
      wb,
      data.id,
      { op: 'pivot', range: 'A1:C4', replace: placed.id, rows: ['Rep'] },
      rand,
    );
    expect(again.ok && again.line).toContain(`(in place of ${placed.id})`);
    const another = buildPivotChange(
      wb,
      data.id,
      { op: 'pivot', range: 'A1:C4', values: [{ formula: '=Units', name: 'U' }] },
      rand,
    );
    expect(another.ok && another.line).not.toContain(placed.id);
    expect(pivotsClearWrite(wb.sheet(data.id)!.layout, 'nope')).toMatchObject({
      code: 'pivot_not_found',
      message: expect.stringContaining(placed.id),
    });
  });
});

describe('a pivot table as read_sheet answers it', () => {
  it('answers its source, place, output and fields by name', () => {
    const { wb, data, rep } = workbook();
    const { rows, cols } = data.layout;
    const pivot: SheetPivot = {
      id: 'pivot01',
      kind: 'pivot',
      at: { r: rep.layout.rows[0]!, c: rep.layout.cols[0]! },
      source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[2]!, s: data.id },
      rows: [{ col: cols[0]!, desc: true, sortBy: { value: 0 }, totals: false, repeat: true }],
      columns: [{ col: cols[2]! }],
      values: [
        { col: cols[1]!, summary: 'SUM', showAs: 'total' },
        { formula: '=Units*2', summary: 'SUM', name: 'Double' },
      ],
      filters: [
        { col: cols[0]!, cond: { values: ['East', 'West'] } },
        { col: cols[0]!, cond: {} },
        { col: cols[1]!, cond: { op: 'gt', a: '1' } },
        { col: cols[2]!, formula: '=Units>0' },
        { col: 'elsewhere', cond: {} },
      ],
      valuesAsRows: true,
    };
    const own: SheetPivot = {
      id: 'pivot02',
      kind: 'pivot',
      at: { r: data.layout.rows[0]!, c: data.layout.cols[6]! },
      source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[1]! },
      rows: [{ col: cols[0]! }],
      values: [{ col: cols[1]!, summary: 'SUM' }],
    };
    const gone: SheetPivot = { id: 'pivot03', kind: 'pivot', at: { r: 'nope', c: cols[0]! } };
    const empty: SheetPivot = {
      id: 'pivot04',
      kind: 'pivot',
      at: { r: data.layout.rows[8]!, c: data.layout.cols[6]! },
    };
    wb.updateSheet({ ...rep, layout: { ...rep.layout, objects: [pivot] } });
    wb.updateSheet({ ...data, layout: { ...data.layout, objects: [own, gone, empty] } });
    const [read] = pivotsRead(wb, rep.id);
    expect(read).toEqual({
      id: 'pivot01',
      at: 'A1',
      range: 'Data!A1:C4',
      output: expect.stringMatching(/^A1:/),
      rows: [
        { column: 'Region', order: 'desc', sortBy: 'SUM of Units', totals: false, repeat: true },
      ],
      columns: [{ column: 'Rep' }],
      values: [
        { column: 'Units', summarise: 'SUM', label: 'SUM of Units', showAs: 'total' },
        { formula: '=Units*2', summarise: 'SUM', label: 'Double' },
      ],
      filters: [
        { column: 'Region', show: ['East', 'West'] },
        { column: 'Region' },
        { column: 'Units', condition: true },
        { column: 'Rep', formula: '=Units>0' },
        { column: 'elsewhere' },
      ],
      valuesAsRows: true,
    });
    expect(pivotsRead(wb, data.id)).toEqual([
      {
        id: 'pivot02',
        at: 'G1',
        range: 'A1:B4',
        output: 'G1:H4',
        rows: [{ column: 'Region' }],
        values: [{ column: 'Units', summarise: 'SUM', label: 'SUM of Units' }],
      },
      { id: 'pivot04', at: 'G9', range: null, output: null },
    ]);
  });
});
