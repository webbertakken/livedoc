// docs/specs/029-sheets/standard-mapping.md "Filters in the file" (XLSX slicers, XLSX slicers read, LiveDoc's record of
// slicers, ODS slicers; D488-D490): every slicer in LiveDoc's record, one over a table also Excel's table slicer as
// Google writes one; a file's table slicers read all or none; ODF leaves slicers out, named.
import { readOoxmlPackage, writeOoxmlPackage, type OoxmlPart } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { makeSheets } from '../testing/book';
import { sheetFromJson } from '../sheet-json';
import type { Sheet } from '../sheet';
import type { SheetSlicer } from '../objects/sheet-slicer';
import { WorkbookRecord } from '../workbook-record';
import { conversionLine } from './conversion-copy';
import { workbookConversion } from './conversion';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { sheetsFromFile, type FileRead } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';
import { fileSlicersOf } from './file-slicers';

let n = 11;
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

// A package with some parts' text changed.
async function changed(
  bytes: Uint8Array<ArrayBuffer>,
  edit: (name: string, xml: string) => string,
) {
  const pkg = await partsOf(bytes);
  const parts: OoxmlPart[] = [...pkg.parts].map(([name, data]) => ({
    name,
    contentType: pkg.contentTypes.get(name) ?? 'application/xml',
    data: name.endsWith('.xml') ? encode(edit(name, decode(data))) : data,
  }));
  return writeOoxmlPackage(parts, pkg.relationships);
}

const opened = (made: ReturnType<typeof sheetsFromFile>): Sheet[] =>
  made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );

// Items in a table over A1:C6, and a plain range at E1:F4: a slicer over the table's B with a default, title and
// Apply to Pivot Tables unticked, and one over the plain range's F.
const OVER_TABLE: SheetSlicer = {
  id: 'slc001',
  kind: 'slicer',
  at: { r: 's0r1', c: 's0c7', dx: 4, dy: 6 },
  width: 240,
  height: 90,
  range: { r1: 's0r0', c1: 's0c0', r2: 's0r5', c2: 's0c2' },
  col: 's0c1',
  filter: { op: 'gt', a: '2' },
  title: 'Pick a count',
  pivots: false,
};
const OVER_RANGE: SheetSlicer = {
  id: 'slc002',
  kind: 'slicer',
  at: { r: 's0r8', c: 's0c7', dx: 0, dy: 0 },
  width: 200,
  height: 40,
  range: { r1: 's0r0', c1: 's0c4', r2: 's0r3', c2: 's0c5' },
  col: 's0c5',
  filter: { values: ['x'] },
};

function slicedSheets(objects: SheetSlicer[] = [OVER_TABLE, OVER_RANGE]): Sheet[] {
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
      A6: 'lid',
      B6: '4',
      C6: 'apricot',
      E1: 'Key',
      F1: 'Tag',
      E2: '1',
      F2: 'x',
      E3: '2',
      F3: 'y',
    },
  });
  const table = { id: 'tbl001', name: 'Items', r1: 's0r0', c1: 's0c0', r2: 's0r5', c2: 's0c2' };
  return [{ ...sheet!, layout: { ...sheet!.layout, tables: [table], objects } }];
}

// The slicers as the file holds them: by place, ids aside.
const slicersOf = (sheet: Sheet) => fileSlicersOf(sheet.layout);

const count = (text: string, part: RegExp) => [...text.matchAll(part)].length;

describe('slicers in XLSX', () => {
  it('writes a slicer over a table as Excel’s table slicer, Google’s form, and every slicer in the record', async () => {
    const written = writeWorkbook(slicedSheets(), record, 'Book', 'xlsx');
    expect(written.losses).toEqual([{ k: 'slicers_unwritten', sheet: 'Data', count: 1 }]);
    expect(importReport(written.losses)).toEqual([]);
    const pkg = await partsOf(written.data);
    const cache = decode(pkg.parts.get('xl/slicerCaches/slicerCache1.xml')!);
    expect(cache).toContain('name="SlicerCache_Items_Col_2" sourceName="N"');
    expect(cache).toContain('<x15:tableSlicerCache tableId="1" column="2"/>');
    expect(pkg.contentTypes.get('xl/slicerCaches/slicerCache1.xml')).toBe(
      'application/vnd.ms-excel.slicerCache+xml',
    );
    const slicers = decode(pkg.parts.get('xl/slicers/slicer1.xml')!);
    expect(slicers).toContain(
      '<x14:slicer name="Slicer_1" cache="SlicerCache_Items_Col_2" caption="Pick a count" rowHeight="247650"/>',
    );
    expect(pkg.contentTypes.get('xl/slicers/slicer1.xml')).toBe(
      'application/vnd.ms-excel.slicer+xml',
    );
    expect(pkg.parts.has('xl/slicers/slicer2.xml')).toBe(false);
    const workbook = decode(pkg.parts.get('xl/workbook.xml')!);
    expect(workbook).toContain('<definedName name="SlicerCache_Items_Col_2">#N/A</definedName>');
    expect(workbook).toMatch(
      /<x15:slicerCaches><x14:slicerCache r:id="rId\d+"\/><\/x15:slicerCaches>/,
    );
    const sheet = decode(pkg.parts.get('xl/worksheets/sheet1.xml')!);
    expect(sheet).toMatch(/<x14:slicerList><x14:slicer r:id="rId\d+"\/><\/x14:slicerList>/);
    expect(sheet).toContain('slicers&quot;:[');
    const drawing = decode(pkg.parts.get('xl/drawings/drawing1.xml')!);
    expect(drawing).toContain('<xdr:col>7</xdr:col><xdr:colOff>38100</xdr:colOff>');
    expect(drawing).toContain('<xdr:ext cx="2286000" cy="857250"/>');
    expect(drawing).toContain('name="Slicer_1"/></a:graphicData>');
    // The default stays the record's: the table's own filter is off (D488).
    expect(decode(pkg.parts.get('xl/tables/table1.xml')!)).not.toContain('autoFilter');
  });

  it('reads every slicer back, and a reopened file writes its slicers once', async () => {
    const written = writeWorkbook(slicedSheets(), record, 'Book', 'xlsx');
    const read = await ok(readXlsx(written.data));
    expect(read.file.kept).toBeUndefined();
    expect(read.losses).toEqual([]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    const [sheet] = opened(made);
    expect(slicersOf(sheet!)).toEqual(slicersOf(slicedSheets()[0]!));
    const again = writeWorkbook([sheet!], record, 'Book', 'xlsx', made.kept);
    const pkg = await partsOf(again.data);
    expect([...pkg.parts.keys()].filter((p) => p.includes('slicer')).sort()).toEqual([
      'xl/slicerCaches/slicerCache1.xml',
      'xl/slicers/slicer1.xml',
    ]);
    const workbook = decode(pkg.parts.get('xl/workbook.xml')!);
    expect(count(workbook, /SlicerCache_Items_Col_2/g)).toBe(1);
    expect(count(workbook, /<x14:slicerCache /g)).toBe(1);
  });

  it('reads Excel’s table slicer without LiveDoc’s record: over the table’s rows, no default', async () => {
    const written = writeWorkbook(
      slicedSheets([{ ...OVER_TABLE, title: undefined, filter: undefined, pivots: undefined }]),
      record,
      'Book',
      'xlsx',
    );
    const plain = await changed(written.data, (_, x) =>
      x
        .replace(/<livedoc:(filters|tables) [^>]*\/>/g, '')
        .replace('caption="N"', 'caption="Counts"'),
    );
    const read = await ok(readXlsx(plain));
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    expect(slicersOf(opened(made)[0]!)).toEqual([
      {
        at: { r: 1, c: 7, dx: 4, dy: 6 },
        width: 240,
        height: 90,
        range: { r1: 0, c1: 0, r2: 5, c2: 2 },
        c: 1,
        title: 'Counts',
      },
    ]);
  });

  it('keeps every slicer of a file holding one it cannot read, named once a sheet (D489)', async () => {
    const written = writeWorkbook(slicedSheets(), record, 'Book', 'xlsx');
    // A pivot table's cache in place of the table's.
    const pivot = await changed(written.data, (name, x) =>
      name.startsWith('xl/slicerCaches/') ? x.replace(/<x14:extLst>.*<\/x14:extLst>/, '') : x,
    );
    const read = await ok(readXlsx(pivot));
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(read.losses).toEqual([{ k: 'slicers_kept', sheet: 'Data' }]);
    expect(importReport(read.losses).map(importReportLine)).toEqual([
      'Slicers LiveDoc cannot read stay as the file had them on 1 sheet: Data',
    ]);
    // LiveDoc's record still brings its slicers back; Excel's stay as they came, written once.
    const [sheet] = opened(made);
    expect(slicersOf(sheet!)).toHaveLength(2);
    const again = writeWorkbook([sheet!], record, 'Book', 'xlsx', made.kept);
    expect(again.losses).toContainEqual({ k: 'slicers_unwritten', sheet: 'Data', count: 2 });
    const pkg = await partsOf(again.data);
    expect([...pkg.parts.keys()].filter((p) => p.includes('slicer')).sort()).toEqual([
      'xl/slicerCaches/slicerCache1.xml',
      'xl/slicers/slicer1.xml',
    ]);
    expect(count(decode(pkg.parts.get('xl/workbook.xml')!), /SlicerCache_Items_Col_2/g)).toBe(1);
  });

  it('names a record entry it cannot read, keeping the rest', async () => {
    const written = writeWorkbook(slicedSheets(), record, 'Book', 'xlsx');
    const broken = await changed(written.data, (_, x) =>
      x.replace('&quot;width&quot;:200', '&quot;width&quot;:&quot;wide&quot;'),
    );
    const read = await ok(readXlsx(broken));
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(read.losses).toEqual([{ k: 'slicer_unread', sheet: 'Data' }]);
    expect(importReport(read.losses).map(importReportLine)).toEqual([
      '1 slicer LiveDoc cannot read is left out: Data',
    ]);
    expect(slicersOf(opened(made)[0]!)).toHaveLength(1);
  });
});

describe('slicers converted', () => {
  it('leaves every slicer out of an OpenDocument file, named', () => {
    const out = workbookConversion(slicedSheets(), { ...record, format: 'xlsx' }, 'ods');
    expect(out.losses).toContainEqual({ k: 'slicers_left', count: 2 });
    expect(conversionLine({ k: 'slicers_left', count: 2 }, 'ods')).toBe('2 slicers are left out');
    expect(conversionLine({ k: 'slicers_left', count: 1 }, 'ods')).toBe('1 slicer is left out');
  });

  it('names the slicers Excel does not see', () => {
    const out = workbookConversion(slicedSheets(), record, 'xlsx');
    expect(out.losses).toContainEqual({ k: 'slicers_unseen', count: 1 });
    expect(conversionLine({ k: 'slicers_unseen', count: 1 }, 'xlsx')).toBe(
      '1 slicer is not seen by Excel',
    );
    expect(conversionLine({ k: 'slicers_unseen', count: 3 }, 'xlsx')).toBe(
      '3 slicers are not seen by Excel',
    );
  });
});
