// docs/research/sheets-open-standard/security.md, one test per abuse case of a file opened; docs/specs/029-sheets/
// files-and-print.md "Import security": each with its named rejection or its line in the import report. Fetching
// functions and regular expressions are guarded where they run (Formulas). The cells cap is made small here, so a
// repeated cell's bomb is read in a blink; its value is D121's (file-read-limits.ts).
import { describe, expect, it, vi } from 'vitest';
import {
  ODF_MEDIA_TYPES,
  PACKAGE_BUDGETS,
  writeOdfPackage,
  type PackageBudgets,
} from '@livedoc/office-packages';
import { csvSafeField } from '../csv';
import { safeHyperlink } from '../hyperlink';
import { excelFileWithKept } from '../testing/kept-files';
import { flatOds, ODF_NAMESPACES, xlsx } from '../testing/hand-files';
import { sheetsFromText } from './csv-file';
import { importReport } from './import-report';
import { keptWithinSizes } from './kept-sizes';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile } from './workbook-file';

vi.mock('./file-read-limits', () => ({ FILE_READ_CELLS_MAX: 100 }));

const encode = (text: string) => new TextEncoder().encode(text);
const budgets = (smaller: Partial<PackageBudgets>) => ({ ...PACKAGE_BUDGETS, ...smaller });
const CELL = '<table:table-cell office:value-type="float" office:value="1"/>';
const table = (name: string, rows: string) =>
  `<table:table table:name="${name}">${rows}</table:table>`;
const flatBody = (tables: string) =>
  encode(
    `<?xml version="1.0"?><office:document ${ODF_NAMESPACES} office:mimetype="${ODF_MEDIA_TYPES.spreadsheet}">` +
      `<office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document>`,
  );

async function read(bytes: Uint8Array<ArrayBuffer>, smaller: Partial<PackageBudgets> = {}) {
  const out = await readWorkbookFile(bytes, 'en-GB', budgets(smaller));
  if (!out.ok) throw new Error(out.rejection);
  return out;
}

describe('import security', () => {
  it('stores a text cell that looks like a formula as text, and downloads it safe (formula injection)', async () => {
    const excel = await read(
      xlsx([
        '<row r="1"><c r="A1" t="inlineStr"><is><t>=HYPERLINK("javascript:x")</t></is></c></row>',
      ]),
    );
    const odf = await read(
      flatOds(
        '',
        '',
        '<table:table-row><table:table-cell office:value-type="string"><text:p>=1+1</text:p></table:table-cell></table:table-row>',
      ),
    );
    for (const [file, text] of [
      [excel.file, '=HYPERLINK("javascript:x")'],
      [odf.file, '=1+1'],
    ] as const) {
      const cell = sheetsFromFile(file, 'en-GB').sheets[0]!.cells[0]!;
      expect(cell.i).toEqual({ s: text });
      expect(csvSafeField(text)).toBe(`'${text}`);
    }
  });

  it('refuses a zip bomb, a package of too many entries and a file too large (package_too_large)', async () => {
    const excel = xlsx(['<row r="1"><c r="A1"><v>1</v></c></row>']);
    const odf = writeOdfPackage(ODF_MEDIA_TYPES.spreadsheet, [
      { name: 'content.xml', mediaType: 'text/xml', data: flatBody(table('S', '')) },
    ]);
    for (const bytes of [excel, odf])
      for (const smaller of [{ inflatedBytes: 100 }, { entries: 2 }, { bytes: 10 }])
        expect(await readWorkbookFile(bytes, 'en-GB', budgets(smaller))).toMatchObject({
          rejection: 'package_too_large',
        });
    // A flat file is under the package's byte budget too, before it is parsed.
    expect(
      await readWorkbookFile(flatBody(table('S', '')), 'en-GB', budgets({ bytes: 10 })),
    ).toEqual({
      ok: false,
      rejection: 'package_too_large',
    });
  });

  it('refuses any DOCTYPE, resolving no entity (xml_doctype_refused)', async () => {
    const doctype = '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>';
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const excel = xlsx([''], { workbook: `${doctype}<workbook ${ns}><sheets/></workbook>` });
    const flat = new TextDecoder().decode(flatBody(table('S', '')));
    const odf = encode(flat.replace('?>', `?>${doctype}`));
    for (const bytes of [excel, odf])
      expect(await readWorkbookFile(bytes)).toMatchObject({ rejection: 'xml_doctype_refused' });
  });

  it('drops macros, scripts, signatures and embedded programs: never run, never kept, listed', async () => {
    const excel = await read(excelFileWithKept());
    const odf = await read(
      writeOdfPackage(ODF_MEDIA_TYPES.spreadsheet, [
        {
          name: 'content.xml',
          mediaType: 'text/xml',
          data: flatBody(table('S', `<table:table-row>${CELL}</table:table-row>`)),
        },
        { name: 'Basic/Standard/Module1.xml', mediaType: 'text/xml', data: encode('<x/>') },
        { name: 'Scripts/python/run.py', mediaType: '', data: encode('import os') },
        { name: 'META-INF/documentsignatures.xml', mediaType: 'text/xml', data: encode('<x/>') },
      ]),
    );
    const keptParts = excel.file.kept!.parts.map((p) => p.name);
    expect(keptParts.length).toBeGreaterThan(0);
    expect(keptParts.filter((n) => /vbaProject/.test(n))).toEqual([]);
    expect(odf.file.kept?.parts ?? []).toEqual([]);
    expect(importReport(excel.losses).find((l) => l.k === 'macros')).toEqual({
      k: 'macros',
      count: 1,
      names: ['xl/vbaProject.bin'],
    });
    expect(importReport(odf.losses).filter((l) => ['macros', 'signature'].includes(l.k))).toEqual([
      { k: 'macros', count: 2, names: ['Basic/Standard/Module1.xml', 'Scripts/python/run.py'] },
      { k: 'signature', count: 1, names: ['META-INF/documentsignatures.xml'] },
    ]);
  });

  it('opens a link only by an allowed scheme, and keeps another workbook’s reference as its value (external links)', async () => {
    expect(safeHyperlink('javascript:alert(1)')).toBeNull();
    expect(safeHyperlink('https://docs.nu/')).toBe('https://docs.nu/');
    const excel = await read(xlsx(['<row r="1"><c r="A1"><f>[1]Sheet1!A1</f><v>5</v></c></row>']));
    const made = sheetsFromFile(excel.file, 'en-GB');
    expect(made.sheets[0]!.cells[0]!.i).toEqual({ n: 5 });
    expect(importReport([...excel.losses, ...made.losses])).toEqual([
      { k: 'formula_unread', count: 1, names: ["'S1'!A1"] },
    ]);
  });

  it('makes at most so many cells however few bytes repeat them (cells_cut)', async () => {
    const bomb = table(
      'Bomb',
      `<table:table-row table:number-rows-repeated="1000000"><table:table-cell office:value-type="float" ` +
        'office:value="1" table:number-columns-repeated="16384"/></table:table-row>',
    );
    const odf = await read(
      flatBody(bomb + table('After', `<table:table-row>${CELL}</table:table-row>`)),
    );
    expect(odf.file.sheets.map((s) => s.cells.length)).toEqual([0, 1]);
    const rows = Array.from(
      { length: 60 },
      (_, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}"><v>1</v></c><c r="B${i + 1}"><v>2</v></c></row>`,
    );
    const excel = await read(xlsx([rows.join(''), rows.join('')]));
    expect(excel.file.sheets.map((s) => s.cells.length)).toEqual([100, 0]);
    const text = sheetsFromText(encode('1,2,3\n'.repeat(50)), 'detect', 'Text', 'en-GB');
    expect(text.sheets[0]!.cells).toHaveLength(99);
    for (const losses of [odf.losses, excel.losses, text.losses])
      expect(importReport(losses).find((l) => l.k === 'cells_cut')).toBeDefined();
    expect(odf.losses).toContainEqual({ k: 'cells_cut', sheet: 'Bomb' });
    expect(excel.losses).toEqual([
      { k: 'cells_cut', sheet: 'S1' },
      { k: 'cells_cut', sheet: 'S2' },
    ]);
  });

  it('makes at most 200 sheets, never parsing one past them (sheets_cut)', async () => {
    const sheets = [...Array.from({ length: 200 }, () => ''), '<row r="1"><c'];
    expect((await read(xlsx(sheets))).losses).toEqual([{ k: 'sheets_cut', kept: 200, had: 201 }]);
    const odf = await read(
      flatBody(Array.from({ length: 201 }, (_, i) => table(`S${i}`, '')).join('')),
    );
    expect(odf.losses).toEqual([{ k: 'sheets_cut', kept: 200, had: 201 }]);
  });

  it('keeps names within the kept content’s sizes (kept_too_large)', async () => {
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const name = `<definedName name="Huge">"${'x'.repeat(1024 * 1024)}"</definedName>`;
    const excel = await read(
      xlsx([''], {
        workbook: `<workbook ${ns} ${rel}><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets><definedNames>${name}</definedNames></workbook>`,
      }),
    );
    expect(keptWithinSizes(excel.file.kept!).left).toBe(1);
    expect(importReport([{ k: 'kept_too_large', count: 1 }])).toEqual([
      { k: 'kept', count: 1, names: [] },
    ]);
  });

  it('reads a file of many styles at the cost of its bytes, each code once (styles)', async () => {
    const formats = Array.from(
      { length: 300 },
      (_, i) => `<numFmt numFmtId="${164 + i}" formatCode="0.${'0'.repeat(i % 9)}"/>`,
    );
    const xfs = Array.from({ length: 300 }, (_, i) => `<xf numFmtId="${164 + i}"/>`);
    const cells = Array.from({ length: 300 }, (_, i) => `<c r="A${i + 1}" s="${i}"><v>1</v></c>`);
    const excel = await read(
      xlsx([`<row r="1">${cells.slice(0, 100).join('')}</row>`], {
        styles: `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts>${formats.join('')}</numFmts><cellXfs>${xfs.join('')}</cellXfs></styleSheet>`,
      }),
    );
    const made = sheetsFromFile(excel.file, 'en-GB');
    expect(made.sheets[0]!.cells).toHaveLength(100);
    expect(new Set(made.sheets[0]!.cells.map((c) => c.f)).size).toBe(9);
  });
});
