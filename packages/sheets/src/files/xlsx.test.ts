// docs/specs/029-sheets/standard-mapping.md "Values in XLSX", "Arrays in the file", "Excel's grammar in detail":
// the XLSX writer and reader, each rule in both directions.
import {
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  readOoxmlPackage,
  writeOdfPackage,
  writeOoxmlPackage,
} from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readWorkbookFile } from './read-workbook-file';
import type { FileCell, WorkbookFile } from './workbook-file';
import { dateStyles, isDateFormatCode, readCellStyles } from './xlsx-styles';
import { fromXstring, readBlock, readCellAddress, SPREADSHEETML_NS, toXstring } from './xlsx-parts';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';
import { writeFlatOds, writeOds } from './ods-write';
import { xlsx } from '../testing/hand-files';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const dates = (xml: string | undefined) => dateStyles(readCellStyles(xml, 'en-US'));

async function partsOf(bytes: Uint8Array<ArrayBuffer>): Promise<Map<string, string>> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return new Map([...read.package.parts].map(([name, data]) => [name, decode(data)]));
}

const sheet = (name: string, cells: FileCell[]) => ({ name, rows: 1, cols: 1, cells });

describe('writeXlsx', () => {
  it('writes a workbook part, a worksheet per sheet, shared strings in first use, styles and properties', async () => {
    const file: WorkbookFile = {
      sheets: [
        sheet('Budget', [
          { r: 0, c: 0, value: { k: 'n', v: 2.5 } },
          { r: 0, c: 1, value: { k: 's', v: 'rent' } },
          { r: 1, c: 0, value: { k: 's', v: ' rent\n' } },
          { r: 1, c: 1, value: { k: 's', v: 'rent' } },
          { r: 2, c: 0, value: { k: 'b', v: true } },
          { r: 2, c: 1, value: { k: 'b', v: false } },
        ]),
        sheet('Empty & "odd"', []),
      ],
    };
    const written = writeXlsx(file, 'Q3');
    expect(written.losses).toEqual([]);
    const parts = await partsOf(written.data);
    expect(parts.get('xl/workbook.xml')).toContain(
      '<sheets><sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Empty &amp; &quot;odd&quot;" sheetId="2" r:id="rId2"/></sheets>',
    );
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain(
      '<row r="1"><c r="A1"><v>2.5</v></c><c r="B1" t="s"><v>0</v></c></row>',
    );
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain(
      '<c r="A3" t="b"><v>1</v></c><c r="B3" t="b"><v>0</v></c>',
    );
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain('<dimension ref="A1:B3"/>');
    expect(parts.get('xl/worksheets/sheet2.xml')).toContain('<dimension ref="A1"/>\n<sheetData/>');
    expect(parts.get('xl/sharedStrings.xml')).toContain(
      'count="3" uniqueCount="2"><si><t>rent</t></si><si><t xml:space="preserve"> rent\n</t></si></sst>',
    );
    expect(parts.get('xl/styles.xml')).toContain('<name val="Arial"/>');
    expect(parts.get('docProps/core.xml')).toContain('<dc:title>Q3</dc:title>');
    expect(parts.get('docProps/app.xml')).toContain('<Application>LiveDoc</Application>');
    expect(parts.has('xl/metadata.xml')).toBe(false);
    // The same workbook gives the same bytes.
    expect(writeXlsx(file, 'Q3').data).toEqual(written.data);
  });

  it('writes a formula beside its cached value, text results inline, errors Excel knows as errors (D82)', async () => {
    const file: WorkbookFile = {
      sheets: [
        sheet('S', [
          { r: 0, c: 0, formula: '=STDEV.S(1, 2)', value: { k: 'n', v: 0.7 } },
          { r: 0, c: 1, formula: '="a"&"b"', value: { k: 's', v: 'ab' } },
          { r: 0, c: 2, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
          { r: 0, c: 3, formula: '=SUM(', value: { k: 'e', v: '#ERROR!' } },
          { r: 0, c: 4, formula: '=B9' },
          { r: 0, c: 5, value: { k: 'e', v: '#ERROR!' } },
          { r: 0, c: 6, formula: '=1=1', value: { k: 'b', v: true } },
          { r: 0, c: 7, formula: '=JOIN(",", B9)' },
          { r: 0, c: 8 },
        ]),
      ],
    };
    const xml = (await partsOf(writeXlsx(file, '').data)).get('xl/worksheets/sheet1.xml')!;
    expect(xml).toContain('<c r="A1"><f>_xlfn.STDEV.S(1, 2)</f><v>0.7</v></c>');
    expect(xml).toContain('<c r="B1" t="str"><f>"a"&amp;"b"</f><v>ab</v></c>');
    expect(xml).toContain('<c r="C1" t="e"><f>1/0</f><v>#DIV/0!</v></c>');
    expect(xml).toContain(
      '<c r="D1" t="str"><f>IFERROR(__xludf.DUMMYFUNCTION("SUM("),#ERROR!)</f><v>#ERROR!</v></c>',
    );
    expect(xml).toContain('<c r="E1"><f>B9</f></c>');
    expect(xml).toContain('<c r="F1" t="s"><v>0</v></c>');
    expect(xml).toContain('<c r="G1" t="b"><f>1=1</f><v>1</v></c>');
    expect(xml).toContain(
      '<c r="H1"><f>IFERROR(__xludf.DUMMYFUNCTION("JOIN("","", B9)"),"")</f></c>',
    );
    expect(xml).not.toContain('r="I1"');
  });

  it('writes a spill as a dynamic array with its metadata, and a wrapped one as Google does', async () => {
    const file: WorkbookFile = {
      sheets: [
        sheet('S', [
          {
            r: 0,
            c: 0,
            formula: '=SEQUENCE(2)',
            spans: { rows: 2, cols: 1 },
            value: { k: 'n', v: 1 },
          },
          { r: 1, c: 0, value: { k: 'n', v: 2 } },
          {
            r: 0,
            c: 1,
            formula: '=SPLIT("a,b", ",")',
            spans: { rows: 1, cols: 2 },
            value: { k: 's', v: 'a' },
          },
          { r: 0, c: 2, value: { k: 's', v: 'b' } },
        ]),
      ],
    };
    const parts = await partsOf(writeXlsx(file, '').data);
    const xml = parts.get('xl/worksheets/sheet1.xml')!;
    expect(xml).toContain(
      '<c r="A1" cm="1"><f t="array" ref="A1:A2">_xlfn.SEQUENCE(2)</f><v>1</v></c>',
    );
    expect(xml).toContain('<c r="A2"><v>2</v></c>');
    expect(xml).toContain(
      '<c r="C1" t="str"><f>IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"b")</f><v>b</v></c>',
    );
    expect(parts.get('xl/metadata.xml')).toContain('fDynamic="1"');
  });

  it('cuts a sheet name past 31 characters, numbering one taken, and its formulas follow (D84)', async () => {
    const long = 'A sheet name well past thirty-one characters';
    const file: WorkbookFile = {
      sheets: [
        sheet(long, []),
        sheet(`${long} too`, [{ r: 0, c: 0, formula: `='${long}'!A1`, value: { k: 'n', v: 0 } }]),
      ],
    };
    const written = writeXlsx(file, '');
    expect(written.losses).toEqual([
      { k: 'sheet_renamed', from: long, to: 'A sheet name well past thirty-o' },
      { k: 'sheet_renamed', from: `${long} too`, to: 'A sheet name well past thirty 2' },
    ]);
    const parts = await partsOf(written.data);
    expect(parts.get('xl/worksheets/sheet2.xml')).toContain(
      "<f>'A sheet name well past thirty-o'!A1</f>",
    );
  });

  it('escapes text XML cannot hold', async () => {
    const file: WorkbookFile = {
      sheets: [sheet('S', [{ r: 0, c: 0, value: { k: 's', v: 'a\u0001_x0041_' } }])],
    };
    const parts = await partsOf(writeXlsx(file, '').data);
    expect(parts.get('xl/sharedStrings.xml')).toContain('<t>a_x0001__x005F_x0041_</t>');
  });
});

describe('readXlsx', () => {
  it('reads back what it writes', async () => {
    const file: WorkbookFile = {
      sheets: [
        {
          name: 'S',
          rows: 3,
          cols: 3,
          cells: [
            { r: 0, c: 0, value: { k: 'n', v: 1 } },
            {
              r: 0,
              c: 1,
              formula: '=SEQUENCE(2)',
              spans: { rows: 2, cols: 1 },
              value: { k: 'n', v: 1 },
            },
            {
              r: 0,
              c: 2,
              formula: '=SPLIT("a,b", ",")',
              spans: { rows: 1, cols: 2 },
              value: { k: 's', v: 'a' },
            },
            { r: 0, c: 3, value: { k: 's', v: 'b' } },
            { r: 1, c: 1, value: { k: 'n', v: 2 } },
            { r: 2, c: 0, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
            { r: 2, c: 1, value: { k: 'b', v: true } },
            { r: 2, c: 2, value: { k: 's', v: ' x\u0001' } },
          ],
        },
      ],
    };
    const read = await readXlsx(writeXlsx(file, '').data);
    expect(read).toEqual({
      ok: true,
      file: { sheets: [{ ...file.sheets[0], cols: 4 }] },
      losses: [],
    });
  });
});

async function cellsOf(bytes: Uint8Array<ArrayBuffer>) {
  const read = await readXlsx(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read;
}

describe('readXlsx from other makers', () => {
  it('reads each cell type, rich and inline text, and cells and rows without addresses', async () => {
    const strings = `<sst xmlns="${SPREADSHEETML_NS}"><si><t>plain</t></si><si><r><t>ri</t></r><r><t>ch</t></r><rPh><t>x</t></rPh></si><si><t></t></si></sst>`;
    const read = await cellsOf(
      xlsx(
        [
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>9</v></c></row>' +
            '<row><c t="inlineStr"><is><t>in</t></is></c><c t="inlineStr"><is/></c><c t="b"><v>true</v></c><c t="b"/></row>' +
            '<row r="4"><c r="A4" t="inlineStr"/><c r="B4"><v> </v></c><c r="C4"><v>x</v></c></row>' +
            '<row r="5"><c r="A5" t="e"><v>#N/A</v></c><c r="B5" t="e"><v>#GETTING_DATA</v></c><c r="C5" t="d"><v>2024-01-02</v></c><c r="D5" t="d"><v>soon</v></c><c r="E5" t="x"><v>1</v></c><c r="F5"><v></v></c><c r="G5"/><c r="ZZZZ5"><v>1</v></c><c r="H5" t="str"><v>t</v></c><c r="I5" t="str"/></row>',
        ],
        { strings },
      ),
    );
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 's', v: 'plain' } },
      { r: 0, c: 1, value: { k: 's', v: 'rich' } },
      { r: 1, c: 0, value: { k: 's', v: 'in' } },
      { r: 1, c: 2, value: { k: 'b', v: true } },
      { r: 4, c: 0, value: { k: 'e', v: '#N/A' } },
      { r: 4, c: 2, value: { k: 'n', v: 45293 } },
      { r: 4, c: 7, value: { k: 's', v: 't' } },
    ]);
  });

  it('moves dates, and only dates, in the 1904 date system', async () => {
    const styles = `<styleSheet xmlns="${SPREADSHEETML_NS}"><numFmts><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`;
    const workbook = `<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="1"/><sheets><sheet name="D" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const read = await cellsOf(
      xlsx(
        [
          '<row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="2"><v>1</v></c><c r="C1" s="3"><v>1</v></c><c r="D1"><v>1</v></c></row>',
        ],
        {
          styles,
          workbook,
        },
      ),
    );
    expect(read.file.sheets[0]!.cells.map((c) => c.value)).toEqual([
      { k: 'n', v: 1462 },
      { k: 'n', v: 1463 },
      { k: 'n', v: 1 },
      { k: 'n', v: 1 },
    ]);
  });

  // standard-mapping.md "Number formats in the file" (D92): each cell's style read as its code; a format no reader
  // defines is a named loss, its value kept; a style past the list is none.
  it('reads each cell’s number format, names one no reader defines, and keeps a styled empty cell', async () => {
    const styles = `<styleSheet xmlns="${SPREADSHEETML_NS}"><cellXfs><xf/><xf numFmtId="10"/><xf numFmtId="7"/></cellXfs></styleSheet>`;
    const read = await cellsOf(
      xlsx(
        [
          '<row r="1"><c r="A1" s="1"><v>0.5</v></c><c r="B1" s="2"><v>3</v></c><c r="C1" s="1"/><c r="D1" s="9"><v>1</v></c></row>',
        ],
        {
          styles,
        },
      ),
    );
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, format: '0.00%', value: { k: 'n', v: 0.5 } },
      { r: 0, c: 1, value: { k: 'n', v: 3 } },
      { r: 0, c: 2, format: '0.00%' },
      { r: 0, c: 3, value: { k: 'n', v: 1 } },
    ]);
    expect(read.losses).toEqual([{ k: 'format_unread', sheet: 'S1', r: 0, c: 1 }]);
  });

  it('unfolds shared formulas, keeps array blocks, and unwraps S5 with its block', async () => {
    const read = await cellsOf(
      xlsx([
        '<row r="1"><c r="A1"><f t="shared" ref="A1:A3" si="0">B1*$C$1</f><v>1</v></c><c r="B1"><f t="array" ref="B1:C2">_xlfn.SEQUENCE(2,2)</f><v>1</v></c><c r="D1"><f t="array" ref="D1">1</f></c><c r="E1" t="str"><f>IFERROR(__xludf.DUMMYFUNCTION("SPLIT(""a,b"","","")"),"a")</f><v>a</v></c><c r="F1" t="str"><f>IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"b")</f><v>b</v></c><c r="G1"><f>IFERROR(__xludf.DUMMYFUNCTION("SEQUENCE(2)"),1)</f><v>1</v></c></row>' +
          '<row r="2"><c r="A2"><f t="shared" si="0"/><v>2</v></c><c r="B2"><f t="shared" si="7"/></c><c r="G2"><f>IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),2)</f><v>2</v></c></row>' +
          '<row r="3"><c r="A3"><f t="shared" si="0"/></c><c r="B3"><f t="shared"/></c><c r="C3"><f t="array">2</f></c></row>',
      ]),
    );
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, formula: '=B1*$C$1', value: { k: 'n', v: 1 } },
      {
        r: 0,
        c: 1,
        formula: '=SEQUENCE(2,2)',
        spans: { rows: 2, cols: 2 },
        value: { k: 'n', v: 1 },
      },
      { r: 0, c: 3, formula: '=1' },
      {
        r: 0,
        c: 4,
        formula: '=SPLIT("a,b",",")',
        spans: { rows: 1, cols: 2 },
        value: { k: 's', v: 'a' },
      },
      { r: 0, c: 5, value: { k: 's', v: 'b' } },
      { r: 0, c: 6, formula: '=SEQUENCE(2)', spans: { rows: 2, cols: 1 }, value: { k: 'n', v: 1 } },
      { r: 1, c: 0, formula: '=B2*$C$1', value: { k: 'n', v: 2 } },
      { r: 1, c: 6, value: { k: 'n', v: 2 } },
      { r: 2, c: 0, formula: '=B3*$C$1' },
      { r: 2, c: 2, formula: '=2' },
    ]);
    expect(read.losses).toEqual([
      { k: 'formula_unread', sheet: 'S1', r: 1, c: 1 },
      { k: 'formula_unread', sheet: 'S1', r: 2, c: 1 },
    ]);
  });

  it('names what it cannot read: a data table, a spill of a function, a chart sheet', async () => {
    const workbook = `<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Chart" sheetId="2" r:id="rC"/><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const read = await cellsOf(
      xlsx(
        [
          '<row r="1"><c r="A1"><f t="dataTable" ref="A1:B2"/><v>3</v></c><c r="B1"><f>_xlfn.ANCHORARRAY(INDEX(A1:A2,1))</f><v>4</v></c></row>',
        ],
        {
          workbook,
          rels: [
            { id: 'rId1', type: RELATIONSHIP_TYPES.worksheet, target: 'worksheets/sheet1.xml' },
            {
              id: 'rC',
              type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet',
              target: 'chartsheets/sheet1.xml',
            },
          ],
        },
      ),
    );
    expect(read.file.sheets.map((s) => s.name)).toEqual(['S']);
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 3 } },
      { r: 0, c: 1, value: { k: 'n', v: 4 } },
    ]);
    expect(read.losses).toEqual([
      { k: 'sheet_unread', sheet: 'Chart' },
      { k: 'formula_unread', sheet: 'S', r: 0, c: 0 },
      { k: 'formula_unread', sheet: 'S', r: 0, c: 1 },
    ]);
  });

  it('cuts cells past the grid and sheets past the workbook', async () => {
    const read = await cellsOf(
      xlsx([
        '<row r="1"><c r="A1"><v>1</v></c></row><row r="1000001"><c r="A1000001"><v>2</v></c></row>',
      ]),
    );
    expect(read.losses).toEqual([{ k: 'sheet_cut', sheet: 'S1', rows: 1_000_000, cols: 18_278 }]);
    expect(read.file.sheets[0]!.cells).toHaveLength(1);
    const many = await cellsOf(xlsx(Array.from({ length: 201 }, () => '')));
    expect(many.file.sheets).toHaveLength(200);
    expect(many.losses).toEqual([{ k: 'sheets_cut', kept: 200, had: 201 }]);
  });

  it.each([
    ['a word-processing file', { mediaType: OOXML_CONTENT_TYPES.document }, 'package_wrong_type'],
    [
      'a sheet the package lacks',
      { rels: [{ id: 'rId1', type: RELATIONSHIP_TYPES.worksheet, target: 'worksheets/gone.xml' }] },
      'package_damaged',
    ],
    ['a malformed workbook', { workbook: '<workbook' }, 'xml_malformed'],
  ])('refuses %s', async (_, options, rejection) => {
    const read = await readXlsx(xlsx(['<row r="1"/>'], options));
    expect(read).toMatchObject({ ok: false, rejection });
  });

  it('reads Strict namespaces, a sheet with no name and a worksheet with no cells', async () => {
    const strict = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
    const workbook = `<workbook xmlns="${strict}" xmlns:r="http://purl.oclc.org/ooxml/officeDocument/relationships"><sheets><sheet sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const bytes = xlsx([''], { workbook });
    const read = await cellsOf(bytes);
    expect(read.file.sheets).toEqual([{ name: '', rows: 0, cols: 0, cells: [] }]);
  });

  it('refuses a workbook whose sheets it cannot find', async () => {
    const bytes = writeOoxmlPackage(
      [
        {
          name: 'xl/workbook.xml',
          contentType: OOXML_CONTENT_TYPES.spreadsheet,
          data: new TextEncoder().encode(
            `<workbook xmlns="${SPREADSHEETML_NS}"><sheets><sheet name="S"/></sheets></workbook>`,
          ),
        },
      ],
      new Map([
        ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }]],
      ]),
    );
    expect(await readXlsx(bytes)).toMatchObject({
      ok: false,
      rejection: 'package_damaged',
      entry: 'xl/workbook.xml',
    });
    const noSheets = writeOoxmlPackage(
      [
        {
          name: 'xl/workbook.xml',
          contentType: OOXML_CONTENT_TYPES.spreadsheet,
          data: new TextEncoder().encode(`<workbook xmlns="${SPREADSHEETML_NS}"/>`),
        },
      ],
      new Map([
        ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }]],
      ]),
    );
    expect(await readXlsx(noSheets)).toMatchObject({ ok: true, file: { sheets: [] } });
  });

  it('refuses a malformed worksheet, and reads a macro workbook and a template', async () => {
    const bad = xlsx(['<row r="1"><c></row>']);
    expect(await readXlsx(bad)).toMatchObject({ ok: false, rejection: 'xml_malformed' });
    for (const mediaType of [
      OOXML_CONTENT_TYPES.macroSpreadsheet,
      OOXML_CONTENT_TYPES.spreadsheetTemplate,
    ])
      expect((await readXlsx(xlsx(['<row r="1"/>'], { mediaType }))).ok).toBe(true);
    expect(await readXlsx(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
  });
});

describe('readWorkbookFile', () => {
  it('finds the format from the bytes', async () => {
    const file: WorkbookFile = { sheets: [sheet('S', [{ r: 0, c: 0, value: { k: 'n', v: 1 } }])] };
    const flat = new TextEncoder().encode(writeFlatOds(file, '').data);
    expect(await readWorkbookFile(flat)).toMatchObject({ ok: true, format: 'fods' });
    expect(await readWorkbookFile(writeOds(file, '').data)).toMatchObject({
      ok: true,
      format: 'ods',
    });
    expect(await readWorkbookFile(writeXlsx(file, '').data)).toMatchObject({
      ok: true,
      format: 'xlsx',
    });
    const text = writeOdfPackage('application/vnd.oasis.opendocument.text', []);
    expect(await readWorkbookFile(text)).toMatchObject({
      ok: false,
      rejection: 'package_wrong_type',
    });
  });
});

describe('the parts XLSX shares', () => {
  it('reads cell addresses and blocks', () => {
    expect(readCellAddress('$B$3')).toEqual({ r: 2, c: 1 });
    expect(readCellAddress('B0')).toBeNull();
    expect(readCellAddress('3B')).toBeNull();
    expect(readBlock('B3:C7', { r: 2, c: 1 })).toEqual({ rows: 5, cols: 2 });
    expect(readBlock('B3', { r: 2, c: 1 })).toEqual({ rows: 1, cols: 1 });
    expect(readBlock('C3:D4', { r: 2, c: 1 })).toBeNull();
    expect(readBlock('B3:A1', { r: 2, c: 1 })).toBeNull();
    expect(readBlock('', { r: 2, c: 1 })).toBeNull();
  });

  it('escapes and unescapes strings', () => {
    expect(toXstring('a\u0001_x0041_\uffff')).toBe('a_x0001__x005F_x0041__xFFFF_');
    expect(fromXstring('a_x0001__x005F_x0041_')).toBe('a\u0001_x0041_');
  });

  it('knows a date format from its code or its built-in number', () => {
    expect(isDateFormatCode('yyyy-mm-dd')).toBe(true);
    expect(isDateFormatCode('[h]:mm')).toBe(true);
    expect(isDateFormatCode('[Red]0.00;"days"')).toBe(false);
    expect(isDateFormatCode('0.00\\d')).toBe(false);
    expect(isDateFormatCode('General')).toBe(false);
    expect(
      dates(
        `<styleSheet xmlns="${SPREADSHEETML_NS}"><numFmts><numFmt numFmtId="164"/></numFmts><cellXfs><xf numFmtId="164"/></cellXfs></styleSheet>`,
      ),
    ).toEqual(new Set());
    expect(dates(undefined)).toEqual(new Set());
    expect(dates('<styleSheet')).toEqual(new Set());
    expect(dates(`<styleSheet xmlns="${SPREADSHEETML_NS}"/>`)).toEqual(new Set());
    expect(
      dates(
        '<styleSheet xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"><cellXfs><xf/><xf numFmtId="22"/></cellXfs></styleSheet>',
      ),
    ).toEqual(new Set([1]));
  });
});
