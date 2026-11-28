// docs/specs/029-sheets/standard-mapping.md "Filters in the file" (XLSX, D477-D479): the sheet's filter as an
// `autoFilter` with its hidden rows and Excel's name, filter views as Google writes them, LiveDoc's record beside them;
// another app's filter read through the standard form, a form LiveDoc cannot read named.
import { readOoxmlPackage, writeOoxmlPackage, type OoxmlPart } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { makeSheets } from '../testing/book';
import { sheetFromJson } from '../sheet-json';
import type { FilterCondition, Sheet, SheetLayout } from '../sheet';
import type { SheetFilterView } from '../filter-views';
import { WorkbookRecord } from '../workbook-record';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { sheetsFromFile, type FileRead } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';
import { filterViewGuid, xlsxFilterColumnXml } from './xlsx-filters';
import { readXlsxFilterColumn } from './xlsx-filters-read';
import { parseXml } from '@livedoc/office-packages';
import { SPREADSHEETML_NS } from './xlsx-parts';
import { filtersByPlace, twoTablesAndAFilter } from '../testing/table-filters';

let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const BY = { id: 'test', name: 'Test', color: '#000000' };
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const encode = (text: string) => new TextEncoder().encode(text);

async function ok(read: Promise<FileRead>) {
  const out = await read;
  if (!out.ok) throw new Error(out.rejection);
  return out;
}

async function partsOf(bytes: Uint8Array<ArrayBuffer>) {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read.package;
}

// A package with one part's text changed.
async function changed(
  bytes: Uint8Array<ArrayBuffer>,
  part: string,
  edit: (xml: string) => string,
) {
  const pkg = await partsOf(bytes);
  const parts: OoxmlPart[] = [...pkg.parts].map(([name, data]) => ({
    name,
    contentType: pkg.contentTypes.get(name) ?? 'application/xml',
    data: name === part ? encode(edit(decode(data))) : data,
  }));
  return writeOoxmlPackage(parts, pkg.relationships);
}

const opened = (made: ReturnType<typeof sheetsFromFile>): Sheet[] =>
  made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );

// Items over A1:C6: the filter keeps pen, cap and the blank in A, B between 2 and 8, C containing "ap"; row 3 hidden
// by hand; a view "Big counts" with B > 2, sorted Z to A by B.
const VIEW: SheetFilterView = {
  id: 'view01',
  title: 'Big counts',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r5',
  c2: 's0c2',
  conds: { s0c1: { op: 'gt', a: '2' } },
  sort: [{ c: 's0c1', desc: true }],
};
function itemSheets(conds?: Record<string, FilterCondition>): Sheet[] {
  const [sheet] = makeSheets({
    Data: {
      A1: 'Item',
      B1: 'N',
      C1: 'Fruit',
      A2: 'pen',
      B2: '5',
      C2: 'apple',
      A3: 'ink',
      B3: '1',
      C3: 'banana',
      A4: 'cap',
      B4: '7',
      C4: 'pineapple',
      A5: 'pen',
      B5: '9',
      C5: 'grape',
      B6: '4',
      C6: 'apricot',
    },
  });
  const layout: SheetLayout = {
    ...sheet!.layout,
    hiddenRows: ['s0r2'],
    filter: {
      r1: 's0r0',
      c1: 's0c0',
      r2: 's0r5',
      c2: 's0c2',
      conds: conds ?? {
        s0c0: { values: ['pen', 'cap', ''] },
        s0c1: { op: 'between', a: '2', b: '8' },
        s0c2: { op: 'contains', a: 'ap' },
      },
    },
    filterViews: [VIEW],
  };
  return [{ ...sheet!, layout }];
}

// A sheet's conditions by column place.
const byPlace = (layout: SheetLayout, conds: Record<string, FilterCondition> | undefined) =>
  Object.fromEntries(Object.entries(conds ?? {}).map(([c, v]) => [layout.cols.indexOf(c), v]));

describe('filters in XLSX', () => {
  it('writes the filter as an autoFilter, its hidden rows and Excel’s name, the views as Google does', async () => {
    const written = writeWorkbook(itemSheets(), record, 'Book', 'xlsx');
    expect(written.losses).toEqual([]);
    const pkg = await partsOf(written.data);
    const sheet = decode(pkg.parts.get('xl/worksheets/sheet1.xml')!);
    expect(sheet).toContain(
      '<autoFilter ref="A1:C6"><filterColumn colId="0"><filters blank="1"><filter val="pen"/><filter val="cap"/></filters></filterColumn>' +
        '<filterColumn colId="1"><customFilters and="1"><customFilter operator="greaterThanOrEqual" val="2"/><customFilter operator="lessThanOrEqual" val="8"/></customFilters></filterColumn>' +
        '<filterColumn colId="2"><customFilters><customFilter val="*ap*"/></customFilters></filterColumn></autoFilter>',
    );
    const guid = filterViewGuid(0, 'view01');
    expect(sheet).toContain(
      `<customSheetViews><customSheetView guid="${guid}" filter="1" showAutoFilter="1"><autoFilter ref="A1:C6"><filterColumn colId="1"><customFilters><customFilter operator="greaterThan" val="2"/></customFilters></filterColumn><sortState ref="A1:C6"><sortCondition descending="1" ref="B1:B6"/></sortState></autoFilter></customSheetView></customSheetViews>`,
    );
    // Rows 3 (by hand) and 6 (the filter: blank-less B 4 is kept, but row 5's B 9 is not) are hidden.
    expect(sheet).toMatch(/<row r="3" hidden="1">/);
    expect(sheet).toMatch(/<row r="5" hidden="1">/);
    expect(sheet).not.toMatch(/<row r="2" hidden/);
    expect(sheet).toContain('<livedoc:filters record="');
    const workbook = decode(pkg.parts.get('xl/workbook.xml')!);
    const bare = guid.slice(1, -1).replace(/-/g, '_');
    expect(workbook).toContain(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Data!$A$1:$C$6</definedName>` +
        `<definedName name="Z_${bare}_.wvu.FilterData" localSheetId="0" hidden="1">Data!$A$1:$C$6</definedName>`,
    );
    expect(workbook).toContain(
      `<customWorkbookViews><customWorkbookView name="Big counts" guid="${guid}" activeSheetId="0" maximized="1" windowWidth="0" windowHeight="0"/></customWorkbookViews>`,
    );
  });

  it('reads back the filter, its views and the rows hidden by hand exactly, nothing kept', async () => {
    const sheets = itemSheets({
      s0c0: { values: ['pen', 'cap', ''], colour: { key: 'bg', is: '#ff0000' } },
      s0c1: { op: 'dateOn', d: 'pastWeek' },
    });
    const read = await ok(readXlsx(writeWorkbook(sheets, record, 'Book', 'xlsx').data));
    expect(read.losses).toEqual([]);
    expect(read.file.kept?.items.map((i) => i.xml).join('') ?? '').not.toMatch(
      /autoFilter|customSheetView|FilterData|FilterDatabase|customWorkbookView/,
    );
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    const [sheet] = opened(made);
    const layout = sheet!.layout;
    expect(byPlace(layout, layout.filter?.conds)).toEqual(
      byPlace(sheets[0]!.layout, sheets[0]!.layout.filter!.conds),
    );
    expect(layout.hiddenRows).toEqual([layout.rows[2]]);
    const [view] = layout.filterViews!;
    expect(view!.title).toBe('Big counts');
    expect(byPlace(layout, view!.conds)).toEqual({ 1: { op: 'gt', a: '2' } });
    expect(view!.sort).toEqual([{ c: layout.cols[1], desc: true }]);
  });

  it('keeps a Custom Formula Is in the record, read back against the sheet', async () => {
    const [plain] = itemSheets();
    // A formula as the sheet stores one: typed in a cell of a sheet of the same grid.
    const input = makeSheets({ Data: { Z1: '=B2>3' } })[0]!
      .cells.values()
      .next().value!.input!;
    const cond: FilterCondition = { op: 'formula', fx: 'f' in input ? input.f : undefined };
    const withFx = [
      {
        ...plain!,
        layout: { ...plain!.layout, filter: { ...plain!.layout.filter!, conds: { s0c1: cond } } },
      },
    ];
    const read = await ok(readXlsx(writeWorkbook(withFx, record, 'Book', 'xlsx').data));
    const [sheet] = opened(sheetsFromFile(read.file, 'en-GB', rand));
    const got = Object.values(sheet!.layout.filter!.conds)[0]!;
    expect(got.op).toBe('formula');
    expect(got.fx?.t).toBe(cond.fx!.t);
  });

  it('reads the standard form over a record Excel changed since, the change logged, not reported', async () => {
    const bytes = writeWorkbook(itemSheets(), record, 'Book', 'xlsx').data;
    const edited = await changed(bytes, 'xl/worksheets/sheet1.xml', (xml) =>
      xml.replace('<customFilter val="*ap*"/>', '<customFilter val="*ra*"/>'),
    );
    const read = await ok(readXlsx(edited));
    expect(read.losses).toEqual([{ k: 'filters_changed', sheet: 'Data' }]);
    expect(importReport(read.losses)).toEqual([]);
    const [sheet] = opened(sheetsFromFile(read.file, 'en-GB', rand));
    const layout = sheet!.layout;
    expect(byPlace(layout, layout.filter!.conds)).toEqual({
      0: { values: ['pen', 'cap', ''] },
      1: { op: 'between', a: '2', b: '8' },
      2: { op: 'contains', a: 'ra' },
    });
    // Without the record, every hidden row under the header is the filter's (D478).
    expect(layout.hiddenRows ?? []).toEqual([]);
  });

  it('names a column whose form LiveDoc cannot read, and leaves it unfiltered', async () => {
    const bytes = writeWorkbook(itemSheets(), record, 'Book', 'xlsx').data;
    const edited = await changed(bytes, 'xl/worksheets/sheet1.xml', (xml) =>
      xml
        .replace(/<extLst>[\s\S]*<\/extLst>/, '')
        .replace(
          '<filterColumn colId="2"><customFilters><customFilter val="*ap*"/></customFilters></filterColumn>',
          '<filterColumn colId="2"><top10 val="3"/></filterColumn>',
        ),
    );
    const read = await ok(readXlsx(edited));
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([{ k: 'filter_unread', sheet: 'Data', r: 0, c: 2 }]);
    expect(importReport(made.losses).map(importReportLine)).toEqual([
      '1 filter column LiveDoc cannot read is left unfiltered: Data!C1',
    ]);
    const [sheet] = opened(made);
    expect(Object.keys(sheet!.layout.filter!.conds)).toHaveLength(2);
  });

  it('keeps Excel’s own custom views and writes LiveDoc’s beside them', async () => {
    const bytes = writeWorkbook(itemSheets(), record, 'Book', 'xlsx').data;
    const excel = '<customSheetView guid="{11111111-2222-3333-4444-555555555555}" scale="90"/>';
    const edited = await changed(bytes, 'xl/worksheets/sheet1.xml', (xml) =>
      xml.replace('<customSheetViews>', `<customSheetViews>${excel}`),
    );
    const read = await ok(readXlsx(edited));
    const kept = read.file.kept!.items.map((i) => i.xml).join('');
    expect(kept).toContain('scale="90"');
    expect(kept).not.toContain('autoFilter');
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const xlsx = WorkbookRecord.opened(record, 'xlsx', undefined);
    const again = writeWorkbook(opened(made), xlsx, 'Book', 'xlsx', made.kept);
    const xml = decode((await partsOf(again.data)).parts.get('xl/worksheets/sheet1.xml')!);
    expect(xml.match(/<customSheetViews>/g)).toHaveLength(1);
    expect(xml).toMatch(
      /<customSheetViews><customSheetView guid="\{11111111[^>]*scale="90"\/><customSheetView guid="\{/,
    );
  });

  it('writes each table’s own filter in its table part, beside the sheet’s, and reads them back (D481)', async () => {
    const sheets = twoTablesAndAFilter();
    const written = writeWorkbook(sheets, record, 'Book', 'xlsx');
    expect(written.losses).toEqual([]);
    const pkg = await partsOf(written.data);
    const xml = decode(pkg.parts.get('xl/worksheets/sheet1.xml')!);
    // The sheet's filter over H, each table's in its own part.
    expect(xml).toContain('<autoFilter ref="H1:H4">');
    expect(decode(pkg.parts.get('xl/tables/table1.xml')!)).toContain(
      '<autoFilter ref="A1:B4"><filterColumn colId="1"><filters><filter val="2"/>',
    );
    expect(decode(pkg.parts.get('xl/tables/table2.xml')!)).toContain(
      '<autoFilter ref="D1:E4"><filterColumn colId="0"><filters><filter val="b"/>',
    );
    // Row 2 (both tables hide it) and row 4 (the sheet's filter): hidden; row 3, kept by every filter, shown.
    for (const r of [2, 4]) expect(xml).toMatch(new RegExp(`<row r="${r}"[^>]* hidden="1"`));
    expect(xml).not.toMatch(/<row r="3"[^>]* hidden="1"/);
    const read = await ok(readXlsx(written.data));
    expect(read.losses).toEqual([]);
    const [sheet] = opened(sheetsFromFile(read.file, 'en-GB', rand));
    expect(filtersByPlace(sheet!.layout)).toEqual(filtersByPlace(sheets[0]!.layout));
    expect(sheet!.layout.hiddenRows).toBeUndefined();
    // Without LiveDoc's records, Excel's own forms read back the same, the colour apart.
    const bare = await changed(written.data, 'xl/worksheets/sheet1.xml', (x) =>
      x.replace(/<livedoc:(filters|tables) [^>]*\/>/g, ''),
    );
    const [plain] = opened(sheetsFromFile((await ok(readXlsx(bare))).file, 'en-GB', rand));
    const conds = plain!.layout.tables!.map((t) => byPlace(plain!.layout, t.filter));
    expect(conds).toEqual([{ 1: { values: ['2'] } }, { 3: { values: ['b'] } }]);
  });

  it('reads a table part without an autoFilter as a table whose filter is off', async () => {
    const sheets = twoTablesAndAFilter();
    const written = writeWorkbook(sheets, record, 'Book', 'xlsx');
    const off = await changed(written.data, 'xl/tables/table2.xml', (x) =>
      x.replace(/<autoFilter .*<\/autoFilter>/, ''),
    );
    const [sheet] = opened(sheetsFromFile((await ok(readXlsx(off))).file, 'en-GB', rand));
    expect(sheet!.layout.tables!.map((t) => t.filter !== undefined)).toEqual([true, false]);
  });

  it('keeps a filter over part of a table in LiveDoc’s record alone, logged (D480)', async () => {
    const [plain] = itemSheets();
    const table = { id: 'tbl001', name: 'Items', r1: 's0r0', c1: 's0c0', r2: 's0r5', c2: 's0c1' };
    const sheets = [{ ...plain!, layout: { ...plain!.layout, tables: [table], filterViews: [] } }];
    const written = writeWorkbook(sheets, record, 'Book', 'xlsx');
    expect(written.losses).toEqual([{ k: 'filter_beside_table', sheet: 'Data' }]);
    expect(importReport(written.losses)).toEqual([]);
    const pkg = await partsOf(written.data);
    expect(decode(pkg.parts.get('xl/worksheets/sheet1.xml')!)).not.toContain('<autoFilter');
    expect(decode(pkg.parts.get('xl/tables/table1.xml')!)).not.toContain('<autoFilter');
    const read = await ok(readXlsx(written.data));
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([{ k: 'filter_beside_table', sheet: 'Data' }]);
    const [sheet] = opened(made);
    expect(Object.keys(sheet!.layout.filter!.conds)).toHaveLength(3);
  });

  it('reads Excel’s own wildcard, blank and day forms', () => {
    const col = (inner: string) => {
      const parsed = parseXml(
        `<filterColumn xmlns="${SPREADSHEETML_NS}" colId="0">${inner}</filterColumn>`,
      );
      if (!parsed.ok) throw new Error('xml');
      return readXlsxFilterColumn(parsed.root, SPREADSHEETML_NS);
    };
    expect(col('<customFilters><customFilter val="ab*"/></customFilters>')).toEqual({
      tests: [{ op: 'begins', v: 'ab' }],
    });
    expect(col('<customFilters><customFilter val="*a~*b"/></customFilters>')).toEqual({
      tests: [{ op: 'ends', v: 'a*b' }],
    });
    expect(
      col('<customFilters><customFilter operator="notEqual" val=" "/></customFilters>'),
    ).toEqual({ tests: [{ op: 'notEmpty', v: '' }] });
    expect(col('<customFilters><customFilter val="a?c"/></customFilters>')).toBeNull();
    expect(
      col('<customFilters><customFilter operator="notEqual" val="ab*"/></customFilters>'),
    ).toBeNull();
    expect(col('<dynamicFilter type="tomorrow"/>')).toEqual({ day: 'tomorrow' });
    expect(col('<dynamicFilter type="thisWeek"/>')).toBeNull();
    expect(col('<colorFilter dxfId="0"/>')).toBeNull();
    expect(
      col('<filters><dateGroupItem year="2026" dateTimeGrouping="year"/></filters>'),
    ).toBeNull();
    expect(xlsxFilterColumnXml(1, { values: [], blank: true })).toBe(
      '<filterColumn colId="1"><filters blank="1"/></filterColumn>',
    );
    expect(xlsxFilterColumnXml(0, { tests: [{ op: 'eq', v: 'a*' }] })).toBe(
      '<filterColumn colId="0"><customFilters><customFilter val="a~*"/></customFilters></filterColumn>',
    );
  });
});
