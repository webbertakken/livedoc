// docs/specs/029-sheets/standard-mapping.md "Named ranges in the file" (D343, D344): named ranges written and read as
// the workbook's names in XLSX and ODF; what LiveDoc cannot read kept and named; a name written once.
import { readOdfPackage, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { CellMap } from '../cells/cell-map';
import type { NamedFunction } from '../named-functions';
import { cellKey, emptyLayout, emptySheet, type RangeName, type Sheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { conversionLine } from './conversion-copy';
import { workbookConversion } from './conversion';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import type { KeptContent } from './kept-content';
import { readOds } from './ods-read';
import { writeOds } from './ods-write';
import { sheetsFromFile, type FileRead, type WorkbookFile } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { withOdsNames } from './file-names';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';

let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';

// A sheet whose names cover cells by place: [name, r1, c1, r2, c2].
function sheetNamed(
  id: string,
  title: string,
  names: [string, number, number, number, number][],
): Sheet {
  const layout = emptyLayout(rand, 6, 4);
  const at = (r: number, c: number) => ({ r: layout.rows[r]!, c: layout.cols[c]! });
  const ranges: RangeName[] = names.map(([name, r1, c1, r2, c2]) => ({
    name,
    r1: at(r1, c1).r,
    c1: at(r1, c1).c,
    r2: at(r2, c2).r,
    c2: at(r2, c2).c,
  }));
  return emptySheet({ id, tabId: id, title, layout: { ...layout, names: ranges } });
}

// Each name made, by its sheet's title and its cells by place.
function placesOf(made: ReturnType<typeof sheetsFromFile>): string[] {
  return made.sheets.flatMap((s) =>
    (s.layout.names ?? []).map((x) => {
      const r1 = s.layout.rows.indexOf(x.r1);
      const c1 = s.layout.cols.indexOf(x.c1);
      const r2 = s.layout.rows.indexOf(x.r2);
      const c2 = s.layout.cols.indexOf(x.c2);
      return `${x.name}@${s.title}:${r1},${c1}:${r2},${c2}`;
    }),
  );
}

async function ok(read: Promise<FileRead>) {
  const out = await read;
  if (!out.ok) throw new Error(out.rejection);
  return out;
}

async function xlsxWorkbook(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return decode(read.package.parts.get('xl/workbook.xml')!);
}

async function odsContent(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const read = await readOdfPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return decode(read.package.entries.get('content.xml')!);
}

// An XLSX another app wrote, holding `names` in its workbook, and sheets Data and Totals.
function excelWithNames(...names: string[]): Uint8Array<ArrayBuffer> {
  const kept: KeptContent = {
    standard: 'ooxml',
    items: names.map((xml) => ({
      place: 'workbook' as const,
      xml,
      ns: { '': SML },
      at: xml.includes('localSheetId') ? { sheet: 0 } : {},
    })),
    parts: [],
    relationships: [],
  };
  const sheets = ['Data', 'Totals'].map((name) => ({ name, rows: 6, cols: 4, cells: [] }));
  return writeXlsx({ sheets, kept }, 'Book').data;
}

// An ODF package another app wrote, its spreadsheet's names `after` the tables and a table's own `own`.
function odfWithNames(after: string, own = ''): Uint8Array<ArrayBuffer> {
  const kept: KeptContent = {
    standard: 'odf',
    items: [
      { place: 'spreadsheet-after', xml: after, ns: { table: TABLE_NS }, at: {} },
      ...(own
        ? [{ place: 'table-after' as const, xml: own, ns: { table: TABLE_NS }, at: { sheet: 0 } }]
        : []),
    ],
    parts: [],
    relationships: [],
  };
  const sheets = ['Data', 'Totals'].map((name) => ({ name, rows: 6, cols: 4, cells: [] }));
  return writeOds({ sheets, kept }, 'Book').data;
}

const data = sheetNamed('sheetData1', 'My data', [
  ['Total', 0, 0, 3, 1],
  ['Rate', 2, 2, 2, 2],
]);
const totals = sheetNamed('sheetTot1', 'Totals', [['Sum.All', 1, 0, 4, 3]]);

describe('named ranges written', () => {
  it('writes each as a workbook’s defined name in XLSX, sheet-qualified and absolute', async () => {
    const xml = await xlsxWorkbook(writeWorkbook([data, totals], record, 'Book', 'xlsx').data);
    expect(xml).toContain(
      '<definedNames><definedName name="Total">\'My data\'!$A$1:$B$4</definedName>' +
        '<definedName name="Rate">\'My data\'!$C$3</definedName>' +
        '<definedName name="Sum.All">Totals!$A$2:$D$5</definedName></definedNames>',
    );
  });

  it('writes each as a table:named-range in ODF, after the tables', async () => {
    const xml = await odsContent(writeWorkbook([data, totals], record, 'Book', 'ods').data);
    expect(xml).toContain(
      '</table:table>\n<table:named-expressions>' +
        '<table:named-range table:name="Total" table:base-cell-address="$\'My data\'.$A$1" table:cell-range-address="$\'My data\'.$A$1:.$B$4"/>' +
        '<table:named-range table:name="Rate" table:base-cell-address="$\'My data\'.$C$3" table:cell-range-address="$\'My data\'.$C$3"/>',
    );
  });

  it('leaves out a name whose cells are gone', () => {
    const gone = sheetNamed('sheetGone1', 'Gone', []);
    const named = {
      ...gone,
      layout: {
        ...gone.layout,
        names: [{ name: 'Lost', r1: 'nope', c1: 'nope', r2: 'nope', c2: 'nope' }],
      },
    };
    const read = writeWorkbook([named], record, 'Book', 'xlsx');
    expect(read.losses).toEqual([]);
  });

  it('writes a name on two sheets once, the first in tab order, and leaves out one Excel refuses', () => {
    const twice = sheetNamed('sheetTwo1', 'Two', [
      ['total', 0, 0, 0, 0],
      ['R', 1, 1, 1, 1],
    ]);
    expect(writeWorkbook([data, twice], record, 'Book', 'xlsx').losses).toEqual([
      { k: 'name_unwritten', name: 'total' },
      { k: 'name_unwritten', name: 'R' },
    ]);
    expect(writeWorkbook([data, twice], record, 'Book', 'ods').losses).toEqual([
      { k: 'name_unwritten', name: 'total' },
    ]);
  });

  it('writes a named range before a named function of its name, the function named', async () => {
    const fn: NamedFunction = { name: 'RATE', params: ['x'], body: '=x' };
    const written = writeWorkbook([data], { ...record, functions: [fn] }, 'Book', 'xlsx');
    expect(written.losses).toEqual([{ k: 'function_unwritten', name: 'RATE' }]);
    expect(await xlsxWorkbook(written.data)).not.toContain('LAMBDA');
  });

  it('says converting to Excel leaves out a name Excel refuses', () => {
    const odsBook = { ...record, format: 'ods' as const };
    const named = sheetNamed('sheetC1', 'Sheet1', [['C', 0, 0, 0, 0]]);
    const conversion = workbookConversion([named], odsBook, 'xlsx');
    expect(conversion.losses).toEqual([{ k: 'names_left', count: 1, names: ['C'] }]);
    expect(conversionLine(conversion.losses[0]!, 'xlsx')).toBe(
      '1 named range is left out, as Excel refuses its name: C',
    );
    expect(conversionLine({ k: 'names_left', count: 2, names: ['C', 'R'] }, 'xlsx')).toBe(
      '2 named ranges are left out, as Excel refuses their names: C and R',
    );
  });
});

describe('named ranges round trip', () => {
  for (const format of ['xlsx', 'ods', 'fods'] as const)
    it(`keeps each name on its sheet and cells in ${format}, a sheet renamed between`, async () => {
      const renamed = { ...data, title: 'Figures' };
      const written = writeWorkbook([renamed, totals], record, 'Book', format);
      expect(written.losses).toEqual([]);
      const read = await ok((format === 'xlsx' ? readXlsx : readOds)(written.data));
      const made = sheetsFromFile(read.file, 'en-GB', rand);
      expect(made.losses).toEqual([]);
      expect(made.kept).toBeUndefined();
      expect(placesOf(made)).toEqual([
        'Total@Figures:0,0:3,1',
        'Rate@Figures:2,2:2,2',
        'Sum.All@Totals:1,0:4,3',
      ]);
    });

  it('reads a cell formula calling a name back as it was', async () => {
    const layout = data.layout;
    const called = {
      ...data,
      cells: CellMap.from([
        [cellKey(layout.rows[5]!, layout.cols[0]!), { input: { f: { t: 'SUM(Total)', r: [] } } }],
      ]),
    };
    const read = await ok(readXlsx(writeWorkbook([called], record, 'Book', 'xlsx').data));
    expect(read.file.sheets[0]!.cells.find((c) => c.formula)?.formula).toBe('=SUM(Total)');
  });
});

describe('XLSX names read', () => {
  it('keeps and names what LiveDoc cannot read; keeps Excel’s own and hidden names unnamed', async () => {
    const names = [
      '<definedName name="Rate">0.2</definedName>',
      '<definedName name="Two">Data!$A$1,Data!$B$2</definedName>',
      '<definedName name="Col">Data!$A:$A</definedName>',
      '<definedName name="Open">Data!A2:A</definedName>',
      '<definedName name="Spill">Data!A1#</definedName>',
      '<definedName name="Gone">#REF!</definedName>',
      '<definedName name="Away">Elsewhere!$A$1</definedName>',
      '<definedName name="Mine" localSheetId="0">Data!$B$1</definedName>',
      '<definedName name="Local" localSheetId="0">_xlfn.LAMBDA(_xlpm.x,_xlpm.x)</definedName>',
      '<definedName name="_xlnm.Print_Area" localSheetId="0">Data!$A$1:$B$2</definedName>',
      '<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Data!$A$1:$B$6</definedName>',
      '<definedName name="_xlfn.SINGLE" hidden="1">#NAME?</definedName>',
      '<definedName>Data!$C$1</definedName>',
    ];
    const read = await ok(readXlsx(excelWithNames(...names)));
    expect(read.file.names).toBeUndefined();
    expect(read.losses).toEqual([
      { k: 'name_unread', name: 'Rate' },
      { k: 'name_unread', name: 'Two' },
      { k: 'name_unread', name: 'Col' },
      { k: 'name_unread', name: 'Open' },
      { k: 'name_unread', name: 'Spill' },
      { k: 'name_unread', name: 'Gone' },
      { k: 'name_unread', name: 'Away' },
      { k: 'name_unread', name: 'Mine' },
      { k: 'function_unread', name: 'Local' },
    ]);
    // Excel's filter range is LiveDoc's to write again (standard-mapping.md "Filters in the file"): never kept.
    expect(read.file.kept!.items.filter((i) => i.xml.startsWith('<definedName'))).toHaveLength(
      names.length - 1,
    );
    expect(importReport(read.losses).map(importReportLine)).toEqual([
      '8 named ranges LiveDoc cannot read are kept for the file: Rate, Two, Col and more',
      '1 named function LiveDoc cannot read is kept for Excel: Local',
    ]);
  });

  it('keeps a name the rules refuse as it came, naming it, and writes it back', async () => {
    const refused = '<definedName name="TRUE">Data!$A$1</definedName>';
    const read = await ok(
      readXlsx(excelWithNames(refused, '<definedName name="Fine">Totals!$B$2</definedName>')),
    );
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(placesOf(made)).toEqual(['Fine@Totals:1,1:1,1']);
    expect(made.losses).toEqual([{ k: 'name_unread', name: 'TRUE' }]);
    expect(made.kept!.items.map((i) => i.xml)).toEqual([refused]);
  });

  it('keeps a name whose cells the workbook’s limits cut, and one past the sheets', () => {
    const file: WorkbookFile = {
      sheets: [{ name: 'Data', rows: 3, cols: 3, cells: [] }],
      names: [
        { name: 'Far', sheet: 0, r1: 0, c1: 0, r2: 0, c2: 5_000 },
        { name: 'Lost', sheet: 4, r1: 0, c1: 0, r2: 0, c2: 0 },
      ],
    };
    const made = sheetsFromFile(file, 'en-GB', rand);
    expect(placesOf(made)).toEqual([]);
    expect(made.losses.filter((l) => l.k === 'name_unread')).toEqual([
      { k: 'name_unread', name: 'Far' },
      { k: 'name_unread', name: 'Lost' },
    ]);
    expect(made.kept).toBeUndefined();
  });

  it('writes a named range in a kept workbook name’s place, counted, beside a kept sheet’s name of it', async () => {
    const read = await ok(
      readXlsx(
        excelWithNames(
          '<definedName name="TOTAL">Data!$A$1,Data!$B$2</definedName>',
          '<definedName name="Total" localSheetId="0">Data!$C$1</definedName>',
        ),
      ),
    );
    const mine = sheetNamed('sheetD1', 'Data', [['Total', 4, 0, 5, 0]]);
    const file: WorkbookFile = {
      ...read.file,
      names: [{ name: 'Total', sheet: 0, r1: 4, c1: 0, r2: 5, c2: 0 }],
    };
    const written = writeXlsx(file, 'Book');
    const xml = await xlsxWorkbook(written.data);
    expect(xml).not.toContain('Data!$A$1,Data!$B$2');
    expect(xml).toContain('<definedName name="Total" localSheetId="0">Data!$C$1</definedName>');
    expect(xml).toContain('<definedName name="Total">Data!$A$5:$A$6</definedName>');
    expect(written.losses).toEqual([{ k: 'kept_dropped', count: 1 }]);
    expect(mine.layout.names).toHaveLength(1);
  });
});

describe('ODF names read', () => {
  it('reads named ranges and keeps, naming them, expressions and a table’s own names', async () => {
    const after =
      '<table:named-expressions>' +
      '<table:named-range table:name="Total" table:base-cell-address="$Data.$A$1" table:cell-range-address="$Data.$A$1:.$B$3"/>' +
      '<table:named-expression table:name="Rate" table:base-cell-address="$Data.$A$1" table:expression="of:=0.2"/>' +
      '<table:named-range table:name="Away" table:base-cell-address="$Data.$A$1" table:cell-range-address="$Nope.$A$1"/>' +
      '<table:named-range table:name="Nowhere"/>' +
      '<table:named-range table:cell-range-address="$Data.$A$1"/>' +
      '</table:named-expressions>';
    const own =
      '<table:named-expressions><table:named-range/><table:named-range table:name="Mine" table:base-cell-address="$Data.$A$1" table:cell-range-address="$Data.$C$1"/></table:named-expressions>';
    const read = await ok(readOds(odfWithNames(after, own)));
    expect(read.losses).toEqual([
      { k: 'name_unread', name: 'Rate' },
      { k: 'name_unread', name: 'Away' },
      { k: 'name_unread', name: 'Nowhere' },
      { k: 'name_unread', name: 'Mine' },
    ]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(placesOf(made)).toEqual(['Total@Data:0,0:2,1']);
    const xml = await odsContent(writeOds({ ...read.file, kept: read.file.kept }, 'Book').data);
    expect(xml).toContain('table:name="Rate"');
    expect(xml).toContain('table:name="Away"');
    // Total is the model's now, written once by LiveDoc.
    expect(xml.split('table:name="Total"')).toHaveLength(2);
  });

  it('keeps a refused name in a holder of its own, written back in the one holder', async () => {
    const after =
      '<table:named-expressions><table:named-range table:name="A1" table:base-cell-address="$Data.$A$1" table:cell-range-address="$Data.$A$1"/></table:named-expressions>';
    const made = sheetsFromFile((await ok(readOds(odfWithNames(after)))).file, 'en-GB', rand);
    expect(made.losses).toEqual([{ k: 'name_unread', name: 'A1' }]);
    expect(made.kept!.standard).toBe('odf');
    const holders = withOdsNames(
      [...made.kept!.items.map((i) => i.xml), '<table:named-expressions/>'],
      ['<table:named-range table:name="Mine"/>'],
      new Set(['MINE']),
    );
    expect(holders.xml).toEqual([
      '<table:named-expressions><table:named-range table:name="A1" table:base-cell-address="$Data.$A$1" table:cell-range-address="$Data.$A$1"/><table:named-range table:name="Mine"/></table:named-expressions>',
    ]);
  });

  it('writes a named range in a kept name’s place, counted; an empty holder stays as it was', () => {
    const kept = [
      '<table:database-ranges/>',
      '<table:named-expressions><table:named-expression table:name="TOTAL" table:expression="of:=1"/></table:named-expressions>',
    ];
    expect(withOdsNames(kept, ['<own/>'], new Set(['TOTAL']))).toEqual({
      xml: [
        '<table:database-ranges/>',
        '<table:named-expressions><own/></table:named-expressions>',
      ],
      dropped: 1,
    });
    expect(withOdsNames(['<table:named-expressions/>'], [], new Set())).toEqual({
      xml: ['<table:named-expressions/>'],
      dropped: 0,
    });
    expect(withOdsNames(['<x/>'], ['<own/>'], new Set(['OWN']))).toEqual({
      xml: ['<table:named-expressions><own/></table:named-expressions>', '<x/>'],
      dropped: 0,
    });
    expect(withOdsNames(['<x/>'], [], new Set())).toEqual({ xml: ['<x/>'], dropped: 0 });
    // A kept name without its name never gives way.
    expect(
      withOdsNames(
        ['<table:named-expressions><table:named-range/></table:named-expressions>'],
        [],
        new Set(['']),
      ),
    ).toEqual({
      xml: ['<table:named-expressions><table:named-range/></table:named-expressions>'],
      dropped: 0,
    });
  });

  it('counts a kept name a named range takes in an ODF write', async () => {
    const after =
      '<table:named-expressions><table:named-expression table:name="TOTAL" table:base-cell-address="$Data.$A$1" table:expression="of:=1"/></table:named-expressions>';
    const read = await ok(readOds(odfWithNames(after)));
    const file: WorkbookFile = {
      ...read.file,
      names: [{ name: 'Total', sheet: 0, r1: 0, c1: 0, r2: 1, c2: 1 }],
    };
    const written = writeOds(file, 'Book');
    expect(written.losses).toEqual([{ k: 'kept_dropped', count: 1 }]);
    expect(await odsContent(written.data)).not.toContain('of:=1');
  });
});
