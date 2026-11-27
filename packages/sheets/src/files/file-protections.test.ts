// docs/specs/029-sheets/standard-mapping.md "Protection in the file" (D349 to D352): protections written as each
// suite's standard form with LiveDoc's record beside it, read back exactly; another app's protection read as a sheet
// protected Only the Owner but the cells it frees; a file's password kept for its own format only.
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { Protection } from '../protection';
import { emptyLayout, emptySheet, type Sheet } from '../sheet';
import { flatOds, xlsx } from '../testing/hand-files';
import { WorkbookRecord } from '../workbook-record';
import {
  fileProtectionsOf,
  freeRectangles,
  freeRunsOf,
  protectionFingerprint,
  protectionsFound,
  readProtectionRecord,
} from './file-protections';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { sheetsFromFile, type FileRead } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';
import { readOds } from './ods-read';
import { workbookConversion } from './conversion';
import { conversionLine } from './conversion-copy';

let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function ok(read: Promise<FileRead>) {
  const out = await read;
  if (!out.ok) throw new Error(out.rejection);
  return out;
}

async function worksheetOf(bytes: Uint8Array<ArrayBuffer>, at = 1): Promise<string> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return decode(read.package.parts.get(`xl/worksheets/sheet${at}.xml`)!);
}

// A sheet of 8 rows and 6 columns holding `protections`, each range given by place: [r1, c1, r2, c2].
type Place = [number, number, number, number];
type Given = Omit<Protection, 'id' | 'range' | 'except'> & { range?: Place; except?: Place[] };
function sheetProtected(title: string, given: Given[]): Sheet {
  const layout = emptyLayout(rand, 8, 6);
  const ids = ([r1, c1, r2, c2]: Place) => ({
    r1: layout.rows[r1]!,
    c1: layout.cols[c1]!,
    r2: layout.rows[r2]!,
    c2: layout.cols[c2]!,
  });
  const protections: Protection[] = given.map(({ range, except, ...rest }, i) => ({
    ...rest,
    id: `prot${i + 1}`,
    ...(range ? { range: ids(range) } : {}),
    ...(except ? { except: except.map(ids) } : {}),
  }));
  return emptySheet({ id: title, tabId: title, title, layout: { ...layout, protections } });
}

// The sheets a file made, as a spreadsheet holds them.
const asSheets = (made: ReturnType<typeof sheetsFromFile>) =>
  made.sheets.map((s) => emptySheet({ id: s.id, tabId: s.id, title: s.title, layout: s.layout }));

// Each protection made, its cells by place, its id left out.
const placesOf = (sheet: Pick<Sheet, 'layout'>) => fileProtectionsOf(sheet.layout);

describe('free cells as rectangles', () => {
  it('lays a row’s own cells over its base runs', () => {
    expect(freeRunsOf([[0, 9]], [])).toEqual([[0, 9]]);
    expect(
      freeRunsOf(
        [[2, 6]],
        [
          { c: 0, free: true },
          { c: 1, free: true },
          { c: 4, free: false },
          { c: 8, free: true },
        ],
      ),
    ).toEqual([
      [0, 3],
      [5, 6],
      [8, 8],
    ]);
    expect(freeRunsOf([], [{ c: 3, free: false }])).toEqual([]);
  });

  it('carries a run over consecutive rows, and cuts past the most', () => {
    expect(
      freeRectangles([
        { r1: 0, r2: 0, runs: [[1, 2]] },
        { r1: 1, r2: 4, runs: [[1, 2]] },
        {
          r1: 6,
          r2: 6,
          runs: [
            [1, 2],
            [4, 4],
          ],
        },
      ]),
    ).toEqual({
      free: [
        { r1: 0, c1: 1, r2: 4, c2: 2 },
        { r1: 6, c1: 1, r2: 6, c2: 2 },
        { r1: 6, c1: 4, r2: 6, c2: 4 },
      ],
      cut: false,
    });
    const checkered = Array.from({ length: 60 }, (_, r) => ({
      r1: r,
      r2: r,
      runs: [[r % 2, r % 2] as const],
    }));
    const cut = freeRectangles(checkered);
    expect(cut.cut).toBe(true);
    expect(cut.free).toHaveLength(50);
  });
});

describe('LiveDoc’s record', () => {
  it('reads back what it wrote, and refuses what is not one', () => {
    expect(
      readProtectionRecord(
        '[{"range":"A1:B2","can":"warn","d":"Totals"},{"except":["C3"],"can":"owner"}]',
      ),
    ).toEqual([
      { range: { r1: 0, c1: 0, r2: 1, c2: 1 }, can: 'warn', description: 'Totals' },
      { except: [{ r1: 2, c1: 2, r2: 2, c2: 2 }], can: 'owner' },
    ]);
    for (const bad of [
      'nope',
      '{}',
      '[{"can":"anyone"}]',
      '[{"can":"owner","d":3}]',
      '[{"can":"owner","range":"A1","except":["B2"]}]',
      '[{"can":"owner","range":"Z"}]',
      '[{"can":"owner","except":"B2"}]',
      '[{"can":"owner","except":["?"]}]',
      '[null]',
    ])
      expect(readProtectionRecord(bad), bad).toBeNull();
  });

  it('is taken while its fingerprint is the standard form’s, else the standard form is read and the change named', () => {
    const free = [{ r1: 1, c1: 0, r2: 2, c2: 0 }];
    const text = '[{"except":["A2:A3"],"can":"editors","d":"Inputs"},{"range":"C1","can":"warn"}]';
    const kept = { standard: 'ooxml' as const, attributes: { password: 'CC1A' } };
    expect(
      protectionsFound({
        protected: true,
        free,
        kept,
        record: { text, fingerprint: protectionFingerprint(true, free) },
      }),
    ).toEqual({
      protections: [
        { except: free, can: 'editors', description: 'Inputs', kept },
        { range: { r1: 0, c1: 2, r2: 0, c2: 2 }, can: 'warn' },
      ],
      changed: false,
    });
    expect(
      protectionsFound({ protected: true, free: [], record: { text, fingerprint: 'deadbeef' } }),
    ).toEqual({ protections: [{ can: 'owner' }], changed: true });
    expect(protectionsFound({ protected: false, free: [] })).toEqual({ changed: false });
  });
});

describe('protections in XLSX', () => {
  const owner = sheetProtected('Data', [
    {
      can: 'editors',
      description: 'Inputs',
      except: [
        [1, 0, 2, 0],
        [5, 3, 5, 4],
      ],
    },
    { can: 'owner', range: [0, 2, 1, 3] },
    { can: 'warn', range: [7, 0, 7, 0] },
  ]);

  it('writes a protected sheet as sheetProtection, its exceptions as password-less protected ranges, LiveDoc’s record beside', async () => {
    const written = writeWorkbook([owner], record, 'Book', 'xlsx');
    expect(written.losses).toEqual([]);
    const xml = await worksheetOf(written.data);
    expect(xml).toContain(
      '<sheetProtection sheet="1" objects="1" scenarios="1"/>\n<protectedRanges><protectedRange sqref="A2:A3" name="LiveDocException1"/><protectedRange sqref="D6:E6" name="LiveDocException2"/></protectedRanges>',
    );
    expect(xml).toContain(
      '<livedoc:protections record="[{&quot;except&quot;:[&quot;A2:A3&quot;,&quot;D6:E6&quot;]',
    );
    expect(xml).not.toContain('password');
  });

  it('reads back every protection as made', async () => {
    const written = writeWorkbook([owner], record, 'Book', 'xlsx');
    const read = await ok(readXlsx(written.data));
    expect(read.losses).toEqual([]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    expect(made.kept).toBeUndefined();
    expect(placesOf(made.sheets[0]!)).toEqual(placesOf(owner));
  });

  it('writes no standard form for a sheet guarded only by a warning or by ranges', async () => {
    const warned = sheetProtected('Data', [{ can: 'warn' }, { can: 'owner', range: [0, 0, 0, 0] }]);
    const xml = await worksheetOf(writeWorkbook([warned], record, 'Book', 'xlsx').data);
    expect(xml).not.toContain('<sheetProtection');
    expect(xml).not.toContain('<protectedRanges');
    const read = await ok(readXlsx(writeWorkbook([warned], record, 'Book', 'xlsx').data));
    expect(placesOf(sheetsFromFile(read.file, 'en-GB', rand).sheets[0]!)).toEqual(placesOf(warned));
  });

  // Excel's file: B2 (its cell style 1) and column E (style 1) and row 6 (style 1) not locked; style 2 locked.
  const STYLES =
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="3"><xf/>' +
    '<xf applyProtection="1"><protection locked="0"/></xf><xf applyProtection="1"><protection locked="1"/></xf>' +
    '</cellXfs></styleSheet>';
  const excel = (sheetProtection: string, more = '') =>
    xlsx(
      [
        '<row r="2"><c r="B2" s="1"/><c r="E2" s="2"/></row>' +
          '<row r="6" s="1" customFormat="1"><c r="C6" s="2"/></row>',
      ],
      {
        styles: STYLES,
        around: [
          {
            before: '<cols><col min="5" max="5" width="9" style="1"/></cols>',
            after: sheetProtection + more,
          },
        ],
      },
    );
  const PROTECTED_RANGES =
    '<protectedRanges><protectedRange sqref="A8:B9" name="Open"/>' +
    '<protectedRange sqref="F1" name="Locked" password="83AF"/></protectedRanges>';

  it('reads another app’s protected sheet as Only the Owner, freeing its open ranges and unlocked cells', async () => {
    const read = await ok(
      readXlsx(
        excel(
          '<sheetProtection password="CC1A" sheet="1" objects="1" scenarios="1" formatCells="0"/>\n',
          PROTECTED_RANGES,
        ),
      ),
    );
    expect(read.losses).toEqual([]);
    expect(read.file.sheets[0]!.protections).toEqual([
      {
        can: 'owner',
        except: [
          { r1: 7, c1: 0, r2: 8, c2: 1 },
          { r1: 0, c1: 4, r2: 0, c2: 4 },
          { r1: 1, c1: 1, r2: 1, c2: 1 },
          { r1: 2, c1: 4, r2: 4, c2: 4 },
          { r1: 5, c1: 0, r2: 5, c2: 1 },
          { r1: 5, c1: 3, r2: 5, c2: 16383 },
          { r1: 6, c1: 4, r2: 1048575, c2: 4 },
        ],
        kept: { standard: 'ooxml', attributes: { password: 'CC1A', formatCells: '0' } },
      },
    ]);
    // The protected range with a password stays the file's own.
    expect(read.file.kept?.items.map((i) => i.xml)).toEqual([
      '<protectedRanges><protectedRange sqref="F1" name="Locked" password="83AF"/></protectedRanges>',
    ]);
  });

  it('writes the file’s password back to XLSX only, beside the kept protected range', async () => {
    const read = await ok(
      readXlsx(
        excel('<sheetProtection password="CC1A" sheet="true" formatCells="0"/>', PROTECTED_RANGES),
      ),
    );
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const xml = await worksheetOf(
      writeWorkbook(asSheets(made), record, 'Book', 'xlsx', made.kept).data,
    );
    expect(xml).toContain(
      '<sheetProtection sheet="1" objects="1" scenarios="1" password="CC1A" formatCells="0"/>\n',
    );
    expect(xml).toContain(
      '<protectedRanges><protectedRange sqref="F1" name="Locked" password="83AF"/><protectedRange sqref="A8:B9" name="LiveDocException1"/>',
    );
    const ods = writeWorkbook(asSheets(made), record, 'Book', 'fods', made.kept);
    expect(decode(ods.data)).not.toContain('CC1A');
  });

  it('reads a protection that protects nothing as none, keeping its protected ranges', async () => {
    const read = await ok(
      readXlsx(excel('<sheetProtection sheet="0" password="CC1A"/>', PROTECTED_RANGES)),
    );
    expect(read.file.sheets[0]!.protections).toBeUndefined();
    expect(read.file.kept?.items.map((i) => i.xml)).toEqual([PROTECTED_RANGES]);
    // Unlocked cells on a sheet that is not protected say more than LiveDoc holds.
    expect(read.losses).toEqual([{ k: 'styles_unread', sheet: 'S1' }]);
  });

  it('reads the standard form when another app changed it since LiveDoc wrote its record', async () => {
    const written = await worksheetOf(writeWorkbook([owner], record, 'Book', 'xlsx').data);
    const ext = /<extLst>.*<\/extLst>/.exec(written)![0];
    const read = await ok(
      readXlsx(xlsx([''], { around: [{ after: `<sheetProtection sheet="1"/>${ext}` }] })),
    );
    expect(read.losses).toEqual([{ k: 'protection_changed', sheet: 'S1' }]);
    expect(read.file.sheets[0]!.protections).toEqual([{ can: 'owner' }]);
    expect(read.file.kept).toBeUndefined();
  });

  it('frees at most 50 ranges, the rest staying protected, named', async () => {
    const rows = Array.from(
      { length: 60 },
      (_, r) => `<row r="${r + 1}"><c r="${r % 2 ? 'B' : 'A'}${r + 1}" s="1"/></row>`,
    );
    const read = await ok(
      readXlsx(
        xlsx([rows.join('')], {
          styles: STYLES,
          around: [{ after: '<sheetProtection sheet="1"/>' }],
        }),
      ),
    );
    expect(read.losses).toEqual([{ k: 'protection_cut', sheet: 'S1' }]);
    expect(read.file.sheets[0]!.protections![0]!.except).toHaveLength(50);
    expect(importReport(read.losses).map(importReportLine)).toEqual([
      '1 protected sheet frees more than 50 ranges; the rest stay protected: S1',
    ]);
  });
});

describe('protections in ODF', () => {
  const owner = sheetProtected('Data', [
    { can: 'owner', description: 'Inputs', except: [[1, 0, 2, 0]] },
    { can: 'editors', range: [0, 2, 1, 3] },
  ]);

  it('writes a protected sheet as table:protected, its exceptions in LiveDoc’s record only, and reads every one back', async () => {
    const written = writeWorkbook([owner], record, 'Book', 'fods');
    expect(written.losses).toEqual([]);
    const xml = decode(written.data);
    expect(xml).toMatch(
      /<table:table table:name="Data"[^>]* table:protected="true" xmlns:livedoc="[^"]+" livedoc:protections="\[\{&quot;except&quot;:\[&quot;A2:A3&quot;\]/,
    );
    expect(xml).not.toContain('cell-protect');
    for (const format of ['ods', 'fods'] as const) {
      const read = await ok(readOds(writeWorkbook([owner], record, 'Book', format).data));
      expect(read.losses).toEqual([]);
      const made = sheetsFromFile(read.file, 'en-GB', rand);
      expect(made.kept).toBeUndefined();
      expect(placesOf(made.sheets[0]!)).toEqual(placesOf(owner));
    }
  });

  // LibreOffice's file: style ce1 unprotected, ce2 protected; column C (ce1) and row 4 (ce1) free but where ce2 says.
  const AUTOMATIC =
    '<style:style style:name="ce1" style:family="table-cell"><style:table-cell-properties style:cell-protect="none"/></style:style>' +
    '<style:style style:name="ce2" style:family="table-cell"><style:table-cell-properties style:cell-protect="protected"/></style:style>';
  const TABLE =
    '<loext:table-protection loext:select-protected-cells="true" loext:select-unprotected-cells="true"/>' +
    '<table:table-column table:number-columns-repeated="2"/><table:table-column table:default-cell-style-name="ce1"/>' +
    '<table:table-column table:number-columns-repeated="3"/>' +
    '<table:table-row><table:table-cell table:style-name="ce1"/><table:table-cell table:number-columns-repeated="5"/></table:table-row>' +
    '<table:table-row table:number-rows-repeated="2"><table:table-cell table:number-columns-repeated="2"/><table:table-cell table:style-name="ce2"/><table:table-cell table:number-columns-repeated="3"/></table:table-row>' +
    '<table:table-row table:default-cell-style-name="ce1"><table:table-cell table:number-columns-repeated="4"/><table:table-cell table:style-name="ce2"/><table:table-cell/></table:table-row>';
  const KEY =
    ' table:protection-key="AAAAAAAAAAAAAAAAAAAAAAAAAAA=" table:protection-key-digest-algorithm="http://docs.oasis-open.org/office/ns/table/legacy-hash-excel"' +
    ' loext:protection-key-digest-algorithm-2="http://www.w3.org/2000/09/xmldsig#sha1"';

  it('reads another app’s protected table as Only the Owner, freeing its unprotected cells, its key kept', async () => {
    const read = await ok(readOds(flatOds('', AUTOMATIC, TABLE, ` table:protected="true"${KEY}`)));
    expect(read.losses).toEqual([]);
    expect(read.file.sheets[0]!.protections).toEqual([
      {
        can: 'owner',
        except: [
          { r1: 0, c1: 0, r2: 0, c2: 0 },
          { r1: 0, c1: 2, r2: 0, c2: 2 },
          { r1: 3, c1: 0, r2: 3, c2: 3 },
          { r1: 3, c1: 5, r2: 3, c2: 18277 },
        ],
        kept: {
          standard: 'odf',
          attributes: {
            'table:protection-key': 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'table:protection-key-digest-algorithm':
              'http://docs.oasis-open.org/office/ns/table/legacy-hash-excel',
            'loext:protection-key-digest-algorithm-2': 'http://www.w3.org/2000/09/xmldsig#sha1',
          },
        },
      },
    ]);
    // LibreOffice's options stay the file's own; the protection's attributes do not.
    expect(read.file.kept?.items.map((i) => i.xml)).toEqual([
      '<loext:table-protection loext:select-protected-cells="true" loext:select-unprotected-cells="true"/>',
    ]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const again = decode(
      writeWorkbook(asSheets(made), { ...record, format: 'fods' }, 'Book', 'fods', made.kept).data,
    );
    expect(again).toContain(` table:protected="true"${KEY.replace(' loext:', ' loext:')}`);
    const excel = await worksheetOf(
      writeWorkbook(asSheets(made), record, 'Book', 'xlsx', made.kept).data,
    );
    expect(excel).toContain('<sheetProtection sheet="1" objects="1" scenarios="1"/>');
    expect(excel).not.toContain('AAAAAAAA');
  });

  it('names an unprotected cell style on a table that is not protected, and reads no protection', async () => {
    const read = await ok(readOds(flatOds('', AUTOMATIC, TABLE)));
    expect(read.file.sheets[0]!.protections).toBeUndefined();
    expect(read.losses).toEqual([{ k: 'styles_unread', sheet: 'S' }]);
  });

  it('reads the standard form when another app changed it since LiveDoc wrote its record', async () => {
    const record =
      ' livedoc:protections="[{&quot;range&quot;:&quot;A1&quot;,&quot;can&quot;:&quot;warn&quot;}]" livedoc:protections-fingerprint="00000000"';
    const read = await ok(
      readOds(
        flatOds(
          '',
          '',
          '',
          ` table:protected="true" xmlns:livedoc="urn:livedoc:xmlns:spreadsheet:1.0"${record}`,
        ),
      ),
    );
    expect(read.losses).toEqual([{ k: 'protection_changed', sheet: 'S' }]);
    expect(read.file.sheets[0]!.protections).toEqual([{ can: 'owner' }]);
  });
});

describe('converting protections', () => {
  const guarded = sheetProtected('Data', [
    {
      can: 'owner',
      except: [[1, 0, 2, 0]],
      kept: { standard: 'ooxml', attributes: { password: 'CC1A' } },
    },
    { can: 'editors', range: [0, 2, 1, 3] },
    { can: 'warn', range: [5, 0, 5, 0] },
  ]);

  it('lists what other apps hold more simply, and a file password the new format cannot carry', () => {
    const toOds = workbookConversion([guarded], { ...record, format: 'xlsx' }, 'ods');
    expect(toOds.losses).toEqual([
      { k: 'protections_simplified', count: 3, features: ['ranges', 'warnings', 'exceptions'] },
      { k: 'protection_passwords_left', count: 1 },
    ]);
    expect(toOds.losses.map((l) => conversionLine(l, 'ods'))).toEqual([
      '3 protections work more simply in other apps: protected ranges, warnings and cells left open on protected sheets',
      '1 protected sheet leaves its file password behind',
    ]);
    const toXlsx = workbookConversion([guarded], record, 'xlsx');
    expect(toXlsx.losses).toEqual([
      { k: 'protections_simplified', count: 2, features: ['ranges', 'warnings'] },
    ]);
    expect(conversionLine(toXlsx.losses[0]!, 'xlsx')).toBe(
      '2 protections work more simply in Excel: protected ranges and warnings',
    );
    expect(
      conversionLine({ k: 'protections_simplified', count: 1, features: ['warnings'] }, 'xlsx'),
    ).toBe('1 protection works more simply in Excel: warnings');
    expect(conversionLine({ k: 'protection_passwords_left', count: 2 }, 'xlsx')).toBe(
      '2 protected sheets leave their file passwords behind',
    );
  });
});
