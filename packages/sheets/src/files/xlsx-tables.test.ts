// docs/specs/029-sheets/standard-mapping.md "Tables in the file" (XLSX, D452, D453): a sheet's tables written as table
// parts with LiveDoc's record beside them and read back exactly; formulas in Excel's grammar; another app's tables
// read with their columns None; one LiveDoc cannot hold kept as the file wrote it.
import {
  OOXML_CONTENT_TYPES,
  readOoxmlPackage,
  RELATIONSHIP_TYPES,
  writeOoxmlPackage,
  type OoxmlPart,
} from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { makeSheets } from '../testing/book';
import { sheetFromJson } from '../sheet-json';
import type { Sheet } from '../sheet';
import type { SheetTable } from '../tables/table';
import { WorkbookRecord } from '../workbook-record';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { sheetsFromFile, type FileRead } from './workbook-file';
import { workbookFileFor, writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';
import { SPREADSHEETML_NS } from './xlsx-parts';

let n = 5;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const BY = { id: 'test', name: 'Test', color: '#000000' };
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

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

// Sales over A1:C5 on "Data": Item (Dropdown), Amount (Currency) and a blank header; a total row; formulas beside it.
const SALES: SheetTable = {
  id: 'tbl001',
  name: 'My Sales',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r4',
  c2: 's0c2',
  total: true,
  types: { s0c0: 'dropdown', s0c1: 'currency' },
  opts: { s0c0: [{ v: 'pen' }, { v: 'ink' }, { v: 'cap' }] },
  // Its own filter on, no column filtered, as Convert to Table makes it (D481).
  filter: {},
};
const sheetsWithSales = () =>
  makeSheets(
    {
      Data: {
        A1: 'Item',
        B1: 'Amount',
        A2: 'pen',
        B2: '3',
        A3: 'ink',
        B3: '1',
        A4: 'cap',
        B4: '2',
        A5: 'Total',
        B5: '=SUBTOTAL(109,My_Sales[Amount])',
        E1: '=SUM(My_Sales[Amount])',
        E2: '=My_Sales[@Amount]*2',
        E3: '=ROWS(My_Sales)',
        E4: '=COUNTA(My_Sales[#ALL])',
      },
    },
    { tables: { Data: [SALES] } },
  );

// The sheets a file made, as a spreadsheet holds them.
const opened = (made: ReturnType<typeof sheetsFromFile>): Sheet[] =>
  made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );

describe('tables in XLSX', () => {
  it('writes each as a table part, its header cells its column names, LiveDoc’s record beside', async () => {
    const written = writeWorkbook(sheetsWithSales(), record, 'Book', 'xlsx');
    expect(written.losses).toEqual([]);
    const pkg = await partsOf(written.data);
    expect(decode(pkg.parts.get('xl/tables/table1.xml')!)).toContain(
      `<table xmlns="${SPREADSHEETML_NS}" id="1" name="My_Sales" displayName="My_Sales" ref="A1:C5" headerRowCount="1" totalsRowCount="1"><autoFilter ref="A1:C4"/><tableColumns count="3"><tableColumn id="1" name="Item"/><tableColumn id="2" name="Amount"/><tableColumn id="3" name="Column 3"/></tableColumns><tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
    );
    const sheet = decode(pkg.parts.get('xl/worksheets/sheet1.xml')!);
    expect(sheet).toContain('<tableParts count="1"><tablePart r:id="rId1"/></tableParts>');
    expect(sheet).toContain(
      '<livedoc:tables record="{&quot;tables&quot;:[{&quot;name&quot;:&quot;My Sales&quot;',
    );
    expect(sheet).toContain('<f>SUM(My_Sales[Amount])</f>');
    expect(sheet).toContain('<f>My_Sales[[#This Row],[Amount]]*2</f>');
    expect(sheet).toContain('<f>ROWS(My_Sales[])</f>');
    expect(sheet).toContain('<f>COUNTA(My_Sales[#All])</f>');
    expect(decode(pkg.parts.get('xl/sharedStrings.xml')!)).toContain('<t>Column 3</t>');
    expect(pkg.relationships.get('xl/worksheets/sheet1.xml')).toEqual([
      { id: 'rId1', type: RELATIONSHIP_TYPES.table, target: '../tables/table1.xml' },
    ]);
  });

  it('reads back each table and every formula reading it as made', async () => {
    const sheets = sheetsWithSales();
    const read = await ok(readXlsx(writeWorkbook(sheets, record, 'Book', 'xlsx').data));
    expect(read.losses).toEqual([]);
    expect(read.file.kept?.items.filter((i) => i.xml.includes('tablePart')) ?? []).toEqual([]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    const before = workbookFileFor(sheets, record).sheets[0]!;
    const after = workbookFileFor(opened(made), record).sheets[0]!;
    expect(after.tables).toEqual(before.tables);
    const formulas = (s: typeof before) =>
      s.cells.filter((c) => c.formula).map((c) => [c.r, c.c, c.formula, c.value]);
    // The blank header now holds its name, as Excel holds a header (D452): the whole table counts one more value.
    expect(after.cells.find((c) => c.r === 0 && c.c === 2)?.value).toEqual({
      k: 's',
      v: 'Column 3',
    });
    const counted = (s: typeof before) =>
      formulas(s).map((f) =>
        f[2] === '=COUNTA(My_Sales[#ALL])' ? [...f.slice(0, 3), 'counted'] : f,
      );
    expect(counted(after)).toEqual(counted(before));
    expect(formulas(after).find((f) => f[1] === 4 && f[0] === 3)?.[3]).toEqual({ k: 'n', v: 11 });
  });

  it('reads the standard form when another app changed the tables since, and names the change', async () => {
    const pkg = await partsOf(writeWorkbook(sheetsWithSales(), record, 'Book', 'xlsx').data);
    const table = decode(pkg.parts.get('xl/tables/table1.xml')!).replace(
      'ref="A1:C5"',
      'ref="A1:C6"',
    );
    const read = await ok(readXlsx(repacked(pkg, { 'xl/tables/table1.xml': table })));
    expect(read.losses).toEqual([{ k: 'tables_changed', sheet: 'Data' }]);
    expect(read.file.sheets[0]!.tables).toEqual([
      {
        name: 'My_Sales',
        range: { r1: 0, c1: 0, r2: 5, c2: 2 },
        columns: ['Item', 'Amount', 'Column 3'],
        total: true,
        // Its `autoFilter`: its own filter on (D481).
        filter: [],
      },
    ]);
    expect(importReport(read.losses)).toEqual([]);
  });

  it('reads another app’s table, its columns None, Google’s this row and the table alone too', async () => {
    const bytes = otherAppFile(
      '<table xmlns="' +
        SPREADSHEETML_NS +
        '" ref="A1:B3" displayName="Sales" name="Sales" id="4"><tableColumns count="2"><tableColumn name="Item" id="1"/><tableColumn name="Amount" id="2"/></tableColumns></table>',
    );
    const read = await ok(readXlsx(bytes));
    expect(read.losses).toEqual([]);
    expect(read.file.kept?.parts.map((p) => p.name) ?? []).not.toContain('xl/tables/table1.xml');
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    const layout = made.sheets[0]!.layout;
    expect(layout.tables).toEqual([
      expect.objectContaining({ name: 'Sales', r1: layout.rows[0], c2: layout.cols[1] }),
    ]);
    expect(layout.tables![0]!.types).toBeUndefined();
    const file = workbookFileFor(opened(made), record).sheets[0]!;
    expect(file.cells.filter((c) => c.formula).map((c) => [c.formula, c.value])).toEqual([
      ['=Sales[@Amount]*2', { k: 'n', v: 6 }],
      ['=ROWS(Sales)', { k: 'n', v: 2 }],
    ]);
  });

  it('keeps a table LiveDoc cannot hold as the file wrote it, names it, and writes it back', async () => {
    const headless =
      '<table xmlns="' +
      SPREADSHEETML_NS +
      '" ref="A2:B3" displayName="Raw" name="Raw" id="4" headerRowCount="0"><tableColumns count="2"><tableColumn name="A" id="1"/><tableColumn name="B" id="2"/></tableColumns></table>';
    const read = await ok(readXlsx(otherAppFile(headless)));
    expect(read.losses).toEqual([{ k: 'table_unread', sheet: 'S1', name: 'Raw' }]);
    expect(importReport(read.losses).map(importReportLine)).toEqual([
      '1 table LiveDoc cannot read stays plain cells: Raw',
    ]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.sheets[0]!.layout.tables).toBeUndefined();
    const record2 = WorkbookRecord.opened(record, 'xlsx', undefined);
    const again = await partsOf(
      writeWorkbook(opened(made), record2, 'Book', 'xlsx', made.kept).data,
    );
    expect(decode(again.parts.get('xl/tables/table1.xml')!)).toBe(headless);
    expect(decode(again.parts.get('xl/worksheets/sheet1.xml')!)).toContain(
      '<tableParts count="1">',
    );
  });

  it('writes its own table past a kept one, a kept one of its name giving way (D453)', async () => {
    const kept =
      '<table xmlns="' +
      SPREADSHEETML_NS +
      '" ref="D1:D3" displayName="Raw" name="Raw" id="7" headerRowCount="0"><tableColumns count="1"><tableColumn name="A" id="1"/></tableColumns></table>';
    const read = await ok(readXlsx(otherAppFile(kept)));
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const [sheet] = opened(made);
    const layout = sheet!.layout;
    const own = (name: string): SheetTable => ({
      id: 'tbl123',
      name,
      r1: layout.rows[0]!,
      c1: layout.cols[0]!,
      r2: layout.rows[2]!,
      c2: layout.cols[1]!,
    });
    const record2 = WorkbookRecord.opened(record, 'xlsx', undefined);
    const beside = { ...sheet!, layout: { ...layout, tables: [own('Mine')] } };
    const out = writeWorkbook([beside], record2, 'Book', 'xlsx', made.kept);
    expect(out.losses).toEqual([]);
    const pkg = await partsOf(out.data);
    expect(decode(pkg.parts.get('xl/tables/table1.xml')!)).toBe(kept);
    expect(decode(pkg.parts.get('xl/tables/table2.xml')!)).toContain(' id="8" name="Mine"');
    expect(decode(pkg.parts.get('xl/worksheets/sheet1.xml')!)).toContain(
      '<tableParts count="2"><tablePart r:id="rId3"/><tablePart r:id="rId1"/></tableParts>',
    );
    const taken = { ...sheet!, layout: { ...layout, tables: [own('RAW')] } };
    const over = writeWorkbook([taken], record2, 'Book', 'xlsx', made.kept);
    expect(over.losses).toEqual([{ k: 'kept_dropped', count: 1 }]);
    const pkg2 = await partsOf(over.data);
    expect(decode(pkg2.parts.get('xl/tables/table1.xml')!)).toContain('name="RAW"');
    expect(pkg2.parts.has('xl/tables/table2.xml')).toBe(false);
  });
});

// Another app's workbook: S1 holding Item/Amount over A1:B3 and two formulas, its table part `table`.
function otherAppFile(table: string): Uint8Array<ArrayBuffer> {
  const encode = (text: string) => new TextEncoder().encode(text);
  const ns = `xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const rows =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>pen</t></is></c><c r="B2"><v>3</v></c><c r="E2"><f>Sales[@Amount]*2</f><v>6</v></c></row>' +
    '<row r="3"><c r="A3" t="inlineStr"><is><t>ink</t></is></c><c r="B3"><v>1</v></c><c r="E3"><f>ROWS(Sales[])</f><v>2</v></c></row>';
  const parts: OoxmlPart[] = [
    {
      name: 'xl/workbook.xml',
      contentType: OOXML_CONTENT_TYPES.spreadsheet,
      data: encode(
        `<workbook ${ns}><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      contentType: OOXML_CONTENT_TYPES.worksheet,
      data: encode(
        `<worksheet ${ns}><sheetData>${rows}</sheetData><tableParts count="1"><tablePart r:id="rId3"/></tableParts></worksheet>`,
      ),
    },
    { name: 'xl/tables/table1.xml', contentType: OOXML_CONTENT_TYPES.table, data: encode(table) },
  ];
  return writeOoxmlPackage(
    parts,
    new Map([
      ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }]],
      [
        'xl/workbook.xml',
        [{ id: 'rId1', type: RELATIONSHIP_TYPES.worksheet, target: 'worksheets/sheet1.xml' }],
      ],
      [
        'xl/worksheets/sheet1.xml',
        [{ id: 'rId3', type: RELATIONSHIP_TYPES.table, target: '../tables/table1.xml' }],
      ],
    ]),
  );
}

// A package read, written again with some parts' text replaced.
function repacked(
  pkg: Awaited<ReturnType<typeof partsOf>>,
  replaced: Record<string, string>,
): Uint8Array<ArrayBuffer> {
  const parts: OoxmlPart[] = [...pkg.parts].map(([name, data]) => ({
    name,
    contentType: pkg.contentTypes.get(name) ?? OOXML_CONTENT_TYPES.xml,
    data: replaced[name] === undefined ? data : new TextEncoder().encode(replaced[name]),
  }));
  return writeOoxmlPackage(parts, pkg.relationships);
}
