// docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file" (D604 to D607): every evidence case's pivot
// table written to each format, its standard form beside LiveDoc's record and its output cached, read back the same;
// a record another app changed stays the file's own; what other apps lose is listed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, parseXml, readZipEntry, writeZip } from '@livedoc/office-packages';
import { sheetFromJson } from '../sheet-json';
import type { Sheet } from '../sheet';
import type { SheetPivot } from '../objects/sheet-pivot';
import { casesInTheGrid } from '../testing/pivot-cases-book';
import { makeSheets } from '../testing/book';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile } from './workbook-file';
import { workbookFileFor, writeWorkbook } from './write-workbook';
import { workbookConversion } from './conversion';
import { conversionLine } from './conversion-copy';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import {
  pivotFieldNames,
  pivotSimplified,
  readPivotRecord,
  sheetPivotOf,
  type FilePivotFields,
} from './file-pivots';
import { readOdsDataPilot } from './ods-pivots-read';
import { parseOdfRange } from './ods-pivot-standard';
import { withDataPilots } from './ods-pivots';
import { readXlsxCache, readXlsxPivotTable } from './xlsx-pivots-read';
import { withPivotCaches } from './xlsx-kept-write';

const record = WorkbookRecord.create({ locale: 'en-US', timeZone: 'UTC' });
const BY = { id: 'x', name: 'x', color: '#000000' };
let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const FORMATS: WorkbookFormat[] = ['xlsx', 'ods', 'fods'];

async function reopened(data: Uint8Array) {
  const read = await readWorkbookFile(new Uint8Array(data), 'en-US');
  if (!read.ok) throw new Error(read.rejection);
  const made = sheetsFromFile(read.file, 'en-US', rand);
  const sheets = made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `t${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );
  return { sheets, losses: [...read.losses, ...made.losses], kept: made.kept, read: read.file };
}

const pivotsOf = (sheets: readonly Sheet[]) =>
  sheets.flatMap((s) =>
    (s.layout.objects ?? []).filter((o): o is SheetPivot => o.kind === 'pivot'),
  );

const cases = () => casesInTheGrid().sheets;

describe('pivot tables through a file', () => {
  it.each(FORMATS)(
    'reads back every case from %s with the same fields and output',
    async (format) => {
      const sheets = cases();
      const before = workbookFileFor(sheets, record);
      const again = await reopened(writeWorkbook(sheets, record, 'Pivots', format).data);
      expect(again.losses).toEqual([]);
      expect(again.kept).toBeUndefined();
      const after = workbookFileFor(again.sheets, record);
      expect(after.sheets.map((s) => s.pivots)).toEqual(before.sheets.map((s) => s.pivots));
      expect(after.sheets.map((s) => s.cells)).toEqual(before.sheets.map((s) => s.cells));
      expect(pivotsOf(again.sheets)).toHaveLength(pivotsOf(sheets).length);
    },
  );

  it.each(FORMATS)(
    'keeps no output cell of %s as an input: the engine works it out again',
    async (format) => {
      const again = await reopened(writeWorkbook(cases(), record, 'Pivots', format).data);
      const rows = again.sheets.find((s) => s.title === 'Rows')!;
      expect(rows.cells.size).toBe(0);
      expect(again.read.sheets.find((s) => s.name === 'Rows')!.cells.length).toBeGreaterThan(0);
    },
  );

  it('caches the output with the number formats it shows in', () => {
    const file = workbookFileFor(cases(), record);
    const percent = file.sheets.find((s) => s.name === 'Percent of row')!;
    expect(percent.cells.find((c) => c.r === 2 && c.c === 1)?.format).toBe('0.00%');
    expect(percent.pivots![0]!.output).toEqual({ rows: 6, cols: 6 });
  });
});

async function entries(bytes: Uint8Array): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const listed = listZip(new Uint8Array(bytes));
  if (!listed.ok) throw new Error('zip');
  for (const entry of listed.entries) {
    const read = await readZipEntry(new Uint8Array(bytes), entry, new ByteBudget(50_000_000));
    if (read.ok) out.set(entry.name, new TextDecoder().decode(read.bytes));
  }
  return out;
}

const zipped = (files: Map<string, string>) =>
  writeZip([...files].map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })));

// The id of a row of onePivot's sheet, by its place.
const onePivotRow = (r: number) => onePivot()[0]!.layout.rows[r]!;

// A workbook of one pivot table, on its source's sheet.
function onePivot(
  change?: (p: SheetPivot) => SheetPivot,
  more: Record<string, string> = {},
): Sheet[] {
  const [sheet] = makeSheets(
    { Data: { A1: 'Region', B1: 'Units', A2: 'East', B2: '3', A3: 'West', B3: '4', ...more } },
    { rows: 30, cols: 10 },
  ) as [Sheet];
  const { rows, cols } = sheet.layout;
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[4]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[1]! },
    rows: [{ col: cols[0]! }],
    values: [{ col: cols[1]!, summary: 'SUM' }],
  };
  const made = change ? change(pivot) : pivot;
  return [{ ...sheet, layout: { ...sheet.layout, objects: [made] } }];
}

describe('a pivot table another app changed', () => {
  it('is read from its XLSX standard form, its output worked out again', async () => {
    const files = await entries(writeWorkbook(onePivot(), record, 'P', 'xlsx').data);
    const table = files.get('xl/pivotTables/pivotTable1.xml')!;
    files.set(
      'xl/pivotTables/pivotTable1.xml',
      table.replace('<location ref="E1:F4"', '<location ref="E1:F5"'),
    );
    const again = await reopened(zipped(files));
    expect(again.losses).toEqual([{ k: 'pivot_changed', sheet: 'Data' }]);
    expect(workbookFileFor(again.sheets, record).sheets[0]!.pivots).toEqual(
      workbookFileFor(onePivot(), record).sheets[0]!.pivots,
    );
    expect(again.kept).toBeUndefined();
    // The other app's output, a row longer, is the engine's to work out again.
    expect(again.sheets[0]!.cells.size).toBe(6);
  });

  it('is read from its ODF standard form', async () => {
    const flat = new TextDecoder().decode(writeWorkbook(onePivot(), record, 'P', 'fods').data);
    const changed = flat.replace("'Data'.E1:'Data'.F4", "'Data'.E1:'Data'.F5");
    const again = await reopened(new TextEncoder().encode(changed));
    expect(again.losses).toEqual([{ k: 'pivot_changed', sheet: 'Data' }]);
    expect(workbookFileFor(again.sheets, record).sheets[0]!.pivots).toEqual(
      workbookFileFor(onePivot(), record).sheets[0]!.pivots,
    );
    expect(again.kept).toBeUndefined();
  });

  it('matches the members it hides to its own sheet’s cells as they show, a blank and an error hidden too', async () => {
    const sheets = onePivot(
      (p) => ({
        ...p,
        source: { ...p.source!, r2: onePivotRow(4) },
        filters: [{ col: p.rows![0]!.col, cond: { values: ['West'] } }],
      }),
      { A4: '=NA()', B4: '5', B5: '6' },
    );
    const flat = new TextDecoder().decode(writeWorkbook(sheets, record, 'P', 'fods').data);
    // Another app's data pilot table and pivot table part: no record of LiveDoc's.
    const theirs = flat.replace(/ livedoc:pivot="[^"]*"/, '');
    const files = await entries(writeWorkbook(sheets, record, 'P', 'xlsx').data);
    const table = files.get('xl/pivotTables/pivotTable1.xml')!;
    files.set('xl/pivotTables/pivotTable1.xml', table.replace(/<extLst>.*<\/extLst>/, ''));
    for (const data of [new TextEncoder().encode(theirs), zipped(files)]) {
      const again = await reopened(data);
      expect(again.losses).toEqual([]);
      expect(pivotsOf(again.sheets)[0]!.filters).toEqual([
        { col: expect.any(String), cond: { values: ['West'] } },
      ]);
    }
  });

  it.each([
    [/ table:target-range-address="[^"]*"/, 'LiveDocPivot1'],
    [/ table:(?:target-range-address|name)="[^"]*"/g, ''],
  ])('keeps a data pilot table with no place, named by what it has', async (drop, sheet) => {
    const flat = new TextDecoder().decode(writeWorkbook(onePivot(), record, 'P', 'fods').data);
    const pilot = /<table:data-pilot-table [^>]*>/.exec(flat)![0];
    const again = await reopened(
      new TextEncoder().encode(flat.replace(pilot, pilot.replace(drop, ''))),
    );
    expect(again.losses).toEqual([{ k: 'pivot_unread', sheet }]);
    expect(pivotsOf(again.sheets)).toEqual([]);
  });

  it('passes over a pivot table part the file does not hold', async () => {
    const files = await entries(writeWorkbook(onePivot(), record, 'P', 'xlsx').data);
    files.delete('xl/pivotTables/pivotTable1.xml');
    const again = await reopened(zipped(files));
    expect(pivotsOf(again.sheets)).toEqual([]);
  });

  it('passes over a record that does not read, though its fingerprint holds', async () => {
    const flat = new TextDecoder().decode(writeWorkbook(onePivot(), record, 'P', 'fods').data);
    const again = await reopened(
      new TextEncoder().encode(flat.replace(/livedoc:pivot="[^"]*"/, 'livedoc:pivot="[]"')),
    );
    expect(again.losses).toContainEqual({ k: 'pivot_changed', sheet: 'Data' });
  });
});

describe('pivot tables beside the file’s own', () => {
  const corpus = (path: string) =>
    readFileSync(join(import.meta.dirname, '..', '..', 'corpus', path));

  // LibreOffice's XLSX of a custom group keeps its pivot table (an empty field); Google's ODS its custom groups.
  it.each([
    ['libreoffice/PivotGroups-discrete.xlsx', 'xlsx', 'Tabelle1', 'Tabelle2', 3, 2],
    ['google/pivot-tables.ods', 'ods', 'Sales', 'Plain', 24, 5],
  ] as const)(
    'writes LiveDoc’s pivot table beside the kept ones of %s',
    async (path, format, data, onto, lastRow, lastCol) => {
      const opened = await reopened(new Uint8Array(corpus(path)));
      const sales = opened.sheets.find((s) => s.title === data)!;
      const plain = opened.sheets.find((s) => s.title === onto)!;
      const { rows, cols } = sales.layout;
      const ours: SheetPivot = {
        id: 'ours01',
        kind: 'pivot',
        at: { r: plain.layout.rows[40]!, c: plain.layout.cols[10]! },
        source: { r1: rows[0]!, c1: cols[0]!, r2: rows[lastRow]!, c2: cols[lastCol]!, s: sales.id },
        rows: [{ col: cols[0]! }],
        values: [{ col: cols[1]!, summary: 'COUNT' }],
      };
      const sheets = opened.sheets.map((s) =>
        s === plain
          ? { ...s, layout: { ...s.layout, objects: [...(s.layout.objects ?? []), ours] } }
          : s,
      );
      const written = writeWorkbook(sheets, record, 'Mixed', format, opened.kept);
      const again = await reopened(written.data);
      expect(pivotsOf(again.sheets)).toHaveLength(pivotsOf(opened.sheets).length + 1);
      expect(again.kept?.items.some((i) => /pivotCaches|data-pilot-tables/.test(i.xml))).toBe(true);
      if (format === 'xlsx') {
        const files = await entries(written.data);
        // LibreOffice's one kept beside the one read and LiveDoc's own.
        const tables = [...files.keys()].filter((n) =>
          /^xl\/pivotTables\/pivotTable\d+\.xml$/.test(n),
        );
        expect(tables).toHaveLength(1 + pivotsOf(again.sheets).length);
      } else {
        const files = await entries(written.data);
        expect(files.get('content.xml')!.match(/<table:data-pilot-tables>/g)).toHaveLength(1);
        expect(files.get('content.xml')).toContain('table:name="LiveDocPivot1"');
      }
    },
  );
});

describe('a pivot table no file can hold', () => {
  it('is left out when its source was deleted, named', () => {
    const sheets = onePivot(({ source: _s, ...p }) => p);
    const written = writeWorkbook(sheets, record, 'P', 'xlsx');
    expect(written.losses).toContainEqual({ k: 'pivot_unwritten', sheet: 'Data' });
    const report = importReport(written.losses);
    expect(report.map(importReportLine)).toContain(
      '1 pivot table whose source data was deleted is left out: Data',
    );
  });

  it('writes a blocked one with its anchor as its output', () => {
    const file = workbookFileFor(onePivot(undefined, { F2: 'x' }), record);
    expect(file.sheets[0]!.pivots![0]!.output).toEqual({ rows: 1, cols: 1 });
  });
});

describe('what other apps lose of a pivot table', () => {
  const fields = (f: FilePivotFields) => f;
  it('lists each feature a standard form leaves out, in order', () => {
    expect(
      pivotSimplified(
        fields({
          rows: [
            { col: 0, repeat: true, sortBy: { value: 0 }, grouping: { k: 'date', rule: 'month' } },
          ],
          values: [
            { col: 1, summary: 'MEDIAN' },
            { formula: '=Units*2', summary: 'CUSTOM', name: 'Twice' },
          ],
          filters: [
            { col: 0, cond: { op: 'gt', a: '1' } },
            { col: 1, formula: '=Units>1' },
          ],
        }),
        'xlsx',
      ),
    ).toEqual([
      'summary',
      'custom-summary',
      'sort-by-value',
      'grouping',
      'filter-by-condition',
      'filter-by-formula',
      'repeat-labels',
    ]);
    expect(
      pivotSimplified(
        fields({
          rows: [{ col: 0, repeat: true }],
          values: [
            { col: 1, summary: 'MEDIAN' },
            { col: 1, summary: 'COUNTUNIQUE' },
            { formula: '=Units*2', summary: 'SUM', name: 'Twice' },
          ],
        }),
        'odf',
      ),
    ).toEqual(['summary', 'calculated-field']);
  });

  it('is listed on converting, counted by pivot table', () => {
    const sheets = cases();
    const conversion = workbookConversion(sheets, record, 'xlsx');
    const loss = conversion.losses.find((l) => l.k === 'pivots_simplified');
    expect(loss).toMatchObject({ k: 'pivots_simplified' });
    expect(conversionLine(loss!, 'xlsx')).toMatch(
      /^\d+ pivot tables work more simply in Excel, without .*custom summaries.* and repeated row labels$/,
    );
    const toOds = workbookConversion(sheets, { ...record, format: 'xlsx' }, 'ods');
    const one = toOds.losses.find((l) => l.k === 'pivots_simplified')!;
    expect(conversionLine({ ...one, count: 1, features: ['grouping'] }, 'ods')).toBe(
      '1 pivot table works more simply in other apps, without grouping',
    );
  });
});

describe('LiveDoc’s record of a pivot table', () => {
  it('refuses what is not one', () => {
    expect(readPivotRecord('{')).toBeNull();
    expect(readPivotRecord('[]')).toBeNull();
    expect(readPivotRecord('{"at":"A1:B2","source":"A1:B2"}')).toBeNull();
    expect(readPivotRecord('{"at":"A1"}')).toBeNull();
    expect(readPivotRecord('{"at":1,"source":"A1:B2"}')).toBeNull();
    expect(readPivotRecord('{"at":"A1","source":"A1:B2","more":1}')).toBeNull();
    expect(readPivotRecord('{"at":"A1","source":"nowhere"}')).toBeNull();
    expect(readPivotRecord('{"at":"A1","source":"\'Other\'!A1:B3","rows":[]}')).toEqual({
      at: { r: 0, c: 0 },
      source: { sheet: 'Other', range: { r1: 0, c1: 0, r2: 2, c2: 1 } },
      fields: { rows: [] },
    });
  });

  it('makes no pivot table of fields outside its source, or the model refuses', () => {
    const [sheet] = onePivot() as [Sheet];
    const ctx = { own: sheet, byTitle: () => undefined, byId: () => undefined };
    const at = { r: 0, c: 4 };
    const source = { sheet: null, range: { r1: 0, c1: 0, r2: 2, c2: 1 } };
    const of = (fields: unknown) =>
      sheetPivotOf({ at, source, fields: fields as FilePivotFields }, sheet.layout, ctx, 'pivot02');
    expect(of({ rows: [{ col: 0 }] })?.rows).toEqual([{ col: sheet.layout.cols[0] }]);
    expect(of({ rows: [{ col: 5 }] })).toBeNull();
    expect(of({ rows: [7] })).toBeNull();
    expect(of({ rows: [{ col: 'A' }] })).toBeNull();
    expect(of({ rows: {} })).toBeNull();
    expect(of({ rows: [{ col: 0, desc: 'yes' }] })).toBeNull();
    expect(
      of({ values: [{ formula: '=Units', summary: 'SUM', name: 'U' }], valuesAsRows: true }),
    ).toMatchObject({
      values: [{ formula: '=Units', summary: 'SUM', name: 'U' }],
      valuesAsRows: true,
    });
    expect(
      sheetPivotOf({ at: { r: 99, c: 0 }, source, fields: {} }, sheet.layout, ctx, 'p3'),
    ).toBeNull();
  });
});

describe('a standard form’s names', () => {
  it('makes the source’s headers unique as Excel does, then the calculated fields’', () => {
    expect(
      pivotFieldNames({
        headers: ['Units', '', 'units', 'Units'],
        fields: {
          values: [
            { formula: '=1', summary: 'SUM', name: 'Units' },
            { col: 0, summary: 'SUM' },
          ],
        },
      }),
    ).toEqual(['Units', 'Column 2', 'units2', 'Units3', 'Units4']);
  });

  it('reads ODF range addresses, quoted or not', () => {
    expect(parseOdfRange("'It''s'.A1:'It''s'.B2")).toEqual({
      sheet: "It's",
      range: { r1: 0, c1: 0, r2: 1, c2: 1 },
    });
    expect(parseOdfRange('Sales.$A$1:.$F$25')).toEqual({
      sheet: 'Sales',
      range: { r1: 0, c1: 0, r2: 24, c2: 5 },
    });
    expect(parseOdfRange('A1:B2')).toBeNull();
    expect(parseOdfRange('Sales.B2:Sales.A1')).toBeNull();
    expect(parseOdfRange('nonsense')).toBeNull();
  });
});

// A pivot table over A1:C3 of a Data sheet (Region, Units, Flag), at E1, its fields made of the sheet's column ids.
function over(
  fields: (cols: readonly string[]) => Partial<SheetPivot>,
  more: Record<string, string> = {},
): Sheet[] {
  const [sheet] = makeSheets(
    {
      Data: {
        A1: 'Region',
        B1: 'Units',
        C1: 'Flag',
        A2: 'East',
        B2: '3',
        C2: 'TRUE',
        A3: 'West',
        B3: '4',
        C3: '=NA()',
        ...more,
      },
    },
    { rows: 30, cols: 10 },
  ) as [Sheet];
  const { rows, cols } = sheet.layout;
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[4]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[2]! },
    ...fields(cols),
  };
  return [{ ...sheet, layout: { ...sheet.layout, objects: [pivot] } }];
}

describe('the standard forms', () => {
  const both = async (sheets: Sheet[]) => {
    const xlsx = await entries(writeWorkbook(sheets, record, 'P', 'xlsx').data);
    const fods = new TextDecoder().decode(writeWorkbook(sheets, record, 'P', 'fods').data);
    for (const format of FORMATS) {
      const again = await reopened(writeWorkbook(sheets, record, 'P', format).data);
      expect(workbookFileFor(again.sheets, record).sheets[0]!.pivots).toEqual(
        workbookFileFor(sheets, record).sheets[0]!.pivots,
      );
    }
    return {
      table: xlsx.get('xl/pivotTables/pivotTable1.xml')!,
      cache: xlsx.get('xl/pivotCache/pivotCacheDefinition1.xml')!,
      fods,
    };
  };

  it('lists true values and errors among a field’s items, and a field on rows and columns once', async () => {
    const { table, cache, fods } = await both(
      over((c) => ({
        rows: [{ col: c[2]!, totals: false }],
        columns: [{ col: c[2]!, totals: false }],
      })),
    );
    expect(cache).toContain('<b v="1"/><e v="#N/A"/>');
    expect(cache).toContain('containsSemiMixedTypes="0" containsString="0" containsMixedTypes="1"');
    expect(table).toContain('rowGrandTotals="0" colGrandTotals="0"');
    expect(table).not.toContain('axisCol');
    expect(table).not.toContain('<dataFields');
    expect(fods).toContain('table:grand-total="none"');
  });

  it('names a value by its own name, and says which grand totals show', async () => {
    const { table, fods } = await both(
      over((c) => ({
        rows: [{ col: c[0]! }],
        columns: [{ col: c[2]!, totals: false }],
        values: [{ col: c[1]!, summary: 'MEDIAN', name: 'Middle' }],
      })),
    );
    expect(table).toContain('<dataField name="Middle" fld="1" baseField="0" baseItem="0"/>');
    // As Google Sheets writes them and LibreOffice reads them: a column group's totals off hides the columns' grand total.
    expect(table).toContain('colGrandTotals="0"');
    expect(table).not.toContain('rowGrandTotals');
    expect(fods).toContain('table:grand-total="row"');
    expect(fods).toContain('table:function="median"');
  });

  it('reads a source on another sheet named in the record', async () => {
    const [data, report] = makeSheets(
      { Data: { A1: 'Region', A2: 'East' }, Report: {} },
      { rows: 10, cols: 5 },
    ) as [Sheet, Sheet];
    const { rows, cols } = data.layout;
    const pivot: SheetPivot = {
      id: 'pivot01',
      kind: 'pivot',
      at: { r: rows[0]!, c: cols[0]! },
      source: { r1: rows[0]!, c1: cols[0]!, r2: rows[1]!, c2: cols[0]! },
    };
    const moved: SheetPivot = {
      ...pivot,
      at: { r: report.layout.rows[1]!, c: report.layout.cols[1]! },
      source: { ...pivot.source!, st: 'Data' },
      rows: [{ col: cols[0]! }],
    };
    const sheets = [data, { ...report, layout: { ...report.layout, objects: [moved] } }];
    const again = await reopened(writeWorkbook(sheets, record, 'P', 'xlsx').data);
    expect(pivotsOf(again.sheets)[0]!.source).toMatchObject({ s: again.sheets[0]!.id });
  });

  it('leaves out a field on a column outside the source', () => {
    const file = workbookFileFor(
      over((c) => ({
        rows: [{ col: c[5]! }],
        columns: [{ col: c[6]! }],
        values: [{ col: c[7]!, summary: 'SUM' }],
        filters: [{ col: c[8]!, cond: { values: ['x'] } }],
      })),
      record,
    );
    expect(file.sheets[0]!.pivots![0]!.fields).toEqual({});
  });

  it('selects no page of a filter over a source with no rows', () => {
    const sheets = onePivot((p) => ({
      ...p,
      source: { ...p.source!, r2: p.source!.r1 },
      filters: [{ col: p.rows![0]!.col, cond: { op: 'gt', a: '1' } }],
      rows: [],
    }));
    const fods = new TextDecoder().decode(writeWorkbook(sheets, record, 'P', 'fods').data);
    expect(fods).toContain(
      'table:orientation="page" table:selected-page="" loext:ignore-selected-page="true"',
    );
  });

  it('refuses a pivot table its record holds but the model cannot', () => {
    const file = workbookFileFor(
      over((c) => ({ rows: [{ col: c[0]! }] })),
      record,
    );
    const p = file.sheets[0]!.pivots![0]!;
    file.sheets[0]!.pivots = [{ ...p, fields: { rows: [{ col: 9 }] } }];
    const made = sheetsFromFile(file, 'en-US', rand);
    expect(made.losses).toContainEqual({ k: 'pivot_changed', sheet: 'Data' });
    expect(made.sheets[0]!.layout.objects).toBeUndefined();
  });
});

describe('reading another app’s pivot table parts', () => {
  const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const cacheOf = (inner: string) =>
    `<pivotCacheDefinition xmlns="${SML}">${inner}</pivotCacheDefinition>`;

  it('reads a cache only when it names a worksheet range', () => {
    expect(readXlsxCache('<broken')).toBeNull();
    expect(readXlsxCache(cacheOf(''))).toBeNull();
    expect(readXlsxCache(cacheOf('<cacheSource type="external"/>'))).toBeNull();
    expect(
      readXlsxCache(cacheOf('<cacheSource><worksheetSource ref="A1:B2"/></cacheSource>')),
    ).toBeNull();
    expect(
      readXlsxCache(
        cacheOf(
          '<cacheSource><worksheetSource ref="A1:B2" sheet="S"/></cacheSource><cacheFields><cacheField/></cacheFields>',
        ),
      ),
    ).toEqual({ source: 'S!A1:B2', names: [''] });
    expect(
      readXlsxCache(
        cacheOf('<cacheSource><worksheetSource name="Table1" sheet="S"/></cacheSource>'),
      ),
    ).toBeNull();
  });

  it('reads a pivot table part only with LiveDoc’s record and its place', () => {
    const cache = { source: 'S!A1:B2', names: ['A'] };
    const table = (inner: string) =>
      `<pivotTableDefinition xmlns="${SML}">${inner}</pivotTableDefinition>`;
    const ext = `<extLst><ext uri="urn:livedoc:xmlns:spreadsheet:1.0" xmlns:livedoc="urn:livedoc:xmlns:spreadsheet:1.0"><livedoc:pivot record="{}" fingerprint="0"/></ext></extLst>`;
    expect(readXlsxPivotTable('<broken', cache)).toBeNull();
    expect(readXlsxPivotTable(table('<location ref="A1:B2"/>'), cache)).toBeNull();
    expect(readXlsxPivotTable(table(ext), cache)).toBeNull();
    expect(readXlsxPivotTable(table(`<location/>${ext}`), cache)).toBeNull();
    expect(
      readXlsxPivotTable(
        table(
          `<location ref="A1:B2"/><rowFields><field x="7"/></rowFields><dataFields><dataField fld="0" subtotal="max"/></dataFields>${ext}`,
        ),
        cache,
      )?.standard.fields,
    ).toEqual(['row ', 'data A max']);
  });

  it('reads a data pilot table only with LiveDoc’s record on a sheet it has', () => {
    const TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
    const pilot = (attrs: string, inner = '') => {
      const parsed = parseXml(
        `<table:data-pilot-table xmlns:table="${TABLE}" xmlns:livedoc="urn:livedoc:xmlns:spreadsheet:1.0" ${attrs}>${inner}</table:data-pilot-table>`,
      );
      if (!parsed.ok) throw new Error('xml');
      return readOdsDataPilot(parsed.root);
    };
    const mark = 'livedoc:pivot="{}" livedoc:pivot-fingerprint="0"';
    expect(pilot(`table:target-range-address="S.A1:S.B2"`)).toBeNull();
    expect(pilot(`${mark} table:target-range-address="S.A1:S.B2"`)).toBeNull();
    expect(
      pilot(mark, '<table:source-cell-range table:cell-range-address="S.A1:S.B2"/>'),
    ).toBeNull();
    expect(
      pilot(
        `${mark} table:target-range-address="S.A1:S.B2"`,
        '<table:source-cell-range/><table:data-pilot-field/>',
      ),
    ).toBeNull();
    expect(
      pilot(
        `${mark} table:target-range-address="S.A1:S.B2"`,
        '<table:source-cell-range table:cell-range-address="S.A1:S.B2"/><table:data-pilot-field table:orientation="data"/><table:data-pilot-field table:orientation="hidden"/><table:data-pilot-field/><table:other/>',
      )?.standard.fields,
    ).toEqual(['data  auto']);
  });

  it('keeps a pivot table part with no cache, and passes over what is no data pilot table', async () => {
    const files = await entries(writeWorkbook(onePivot(), record, 'P', 'xlsx').data);
    files.delete('xl/pivotTables/_rels/pivotTable1.xml.rels');
    const again = await reopened(zipped(files));
    expect(pivotsOf(again.sheets)).toEqual([]);
    const flat = new TextDecoder().decode(writeWorkbook(onePivot(), record, 'P', 'fods').data);
    const other = await reopened(
      new TextEncoder().encode(
        flat.replace('<table:data-pilot-tables>', '<table:data-pilot-tables><table:other/>'),
      ),
    );
    expect(pivotsOf(other.sheets)).toHaveLength(1);
  });

  it('reads two pivot tables of one sheet, a false value among their items', async () => {
    const [sheet] = over((c) => ({ rows: [{ col: c[0]! }] }), { C2: 'FALSE' }) as [Sheet];
    const first = sheet.layout.objects![0] as SheetPivot;
    const second: SheetPivot = {
      ...first,
      id: 'pivot02',
      at: { r: sheet.layout.rows[10]!, c: sheet.layout.cols[4]! },
      rows: [{ col: sheet.layout.cols[2]! }],
    };
    const sheets = [{ ...sheet, layout: { ...sheet.layout, objects: [first, second] } }];
    const again = await reopened(writeWorkbook(sheets, record, 'P', 'xlsx').data);
    expect(pivotsOf(again.sheets)).toHaveLength(2);
  });

  it('keeps a data pilot table on a sheet the file does not have, named', async () => {
    const flat = new TextDecoder().decode(writeWorkbook(onePivot(), record, 'P', 'fods').data);
    const again = await reopened(
      new TextEncoder().encode(flat.replaceAll("'Data'.E1:'Data'.F4", "'Gone'.E1:'Gone'.F4")),
    );
    expect(pivotsOf(again.sheets)).toEqual([]);
    expect(again.losses).toEqual([{ k: 'pivot_unread', sheet: 'Gone' }]);
  });

  it('puts LiveDoc’s data pilot tables where ODF orders them', () => {
    expect(withDataPilots(['<table:named-expressions/>'], [])).toEqual([
      '<table:named-expressions/>',
    ]);
    expect(withDataPilots(['<table:dde-links/>'], ['<p/>'])).toEqual([
      '<table:data-pilot-tables><p/></table:data-pilot-tables>',
      '<table:dde-links/>',
    ]);
    expect(withPivotCaches([], [])).toEqual([]);
  });
});
