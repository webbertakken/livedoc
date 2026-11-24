// docs/specs/029-sheets/standard-mapping.md "Number formats in the file" (D90, D92): a cell's number format leaves in
// the file as its code, XLSX's built-in ids where a code is one, and comes back as the same format; a format no reader
// defines is a named loss.
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { Workbook } from '../engine/workbook';
import { cellKey, type CellFormat, type Sheet } from '../sheet';
import { makeSheets } from '../testing/book';
import { fileParts } from './file-parts';
import { sheetsFromFile, workbookFileOf, type WorkbookFile } from './workbook-file';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';

function seeded(n = 3): () => number {
  let x = n;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

// A sheet with formats set on cells by A1 position (row and column ids as makeSheets lays them out).
function formatted(inputs: Record<string, string>, formats: Record<string, CellFormat>): Sheet[] {
  const sheets = makeSheets({ S: inputs }, { rows: 5, cols: 5 });
  const sheet = sheets[0]!;
  for (const [a1, format] of Object.entries(formats)) {
    const c = a1.charCodeAt(0) - 65;
    const r = Number(a1.slice(1)) - 1;
    const key = cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!);
    sheet.cells.set(key, {
      ...sheet.cells.get(key),
      format: { ...sheet.cells.get(key)?.format, ...format },
    });
  }
  return sheets;
}

async function part(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return new TextDecoder().decode(read.package.parts.get(name));
}

describe('number formats in the file model', () => {
  it('writes each cell’s format as its code and style, a format alone as a styled empty cell, and lends a spill its format', () => {
    const sheets = formatted(
      { A1: '1234.5', B1: '0.25', C1: '=SEQUENCE(2)' },
      {
        A1: { nf: 'number', dp: 1, b: true },
        B1: { nf: 'percent' },
        A2: { nf: 'date' },
        C2: { nf: 'currency', cur: '$' },
        D1: { b: true },
      },
    );
    const file = workbookFileOf(new Workbook({ sheets, locale: 'en-GB' }), sheets, 'en-GB');
    expect(file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, format: '#,##0.0', style: { b: true }, value: { k: 'n', v: 1234.5 } },
      { r: 0, c: 1, format: '0.00%', value: { k: 'n', v: 0.25 } },
      { r: 0, c: 2, formula: '=SEQUENCE(2)', spans: { rows: 2, cols: 1 }, value: { k: 'n', v: 1 } },
      { r: 0, c: 3, style: { b: true } },
      { r: 1, c: 0, format: 'dd/mm/yyyy' },
      { r: 1, c: 2, value: { k: 'n', v: 2 }, format: '"$"#,##0.00' },
    ]);
  });

  it('makes each cell’s format from its code, a format alone included, and names a code it cannot read', () => {
    const file: WorkbookFile = {
      sheets: [
        {
          name: 'S',
          rows: 2,
          cols: 2,
          cells: [
            { r: 0, c: 0, value: { k: 'n', v: 1 }, format: '0.0%' },
            { r: 0, c: 1, format: 'mm/dd/yyyy' },
            { r: 1, c: 0, value: { k: 'n', v: 2 }, format: '0;0;0;0;0' },
            { r: 1, c: 1, value: { k: 'n', v: 3 }, format: 'General' },
          ],
        },
      ],
    };
    const made = sheetsFromFile(file, 'en-US', seeded());
    expect(made.sheets[0]!.cells.map(({ i, f }) => ({ i, f }))).toEqual([
      { i: { n: 1 }, f: { nf: 'percent', dp: 1 } },
      { i: undefined, f: { nf: 'date' } },
      { i: { n: 2 }, f: undefined },
      { i: { n: 3 }, f: undefined },
    ]);
    expect(made.losses).toEqual([{ k: 'format_unread', sheet: 'S', r: 1, c: 0 }]);
    // Sent in parts, a cell past the create keeps its format.
    const parts = fileParts(made.sheets);
    expect(parts.seeds[0]!.cells[0]).toMatchObject({ f: { nf: 'percent', dp: 1 } });
  });
});

describe('number formats in XLSX', () => {
  it('writes built-in ids where a code is one, its own from 164, and a cell style per format', async () => {
    const file: WorkbookFile = {
      sheets: [
        {
          name: 'S',
          rows: 2,
          cols: 4,
          cells: [
            { r: 0, c: 0, value: { k: 'n', v: 1 }, format: '#,##0.00' },
            { r: 0, c: 1, value: { k: 'n', v: 2 }, format: 'dd/mm/yyyy' },
            { r: 0, c: 2, value: { k: 'n', v: 3 }, format: '#,##0.00' },
            { r: 0, c: 3, format: '"a&b"0' },
          ],
        },
      ],
    };
    const written = writeXlsx(file, 'T');
    const styles = await part(written.data, 'xl/styles.xml');
    expect(styles).toContain(
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;a&amp;b&quot;0"/></numFmts>',
    );
    expect(styles).toContain(
      '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>',
    );
    expect(styles).toContain(
      '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    );
    const sheet = await part(written.data, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain(
      '<c r="A1" s="1"><v>1</v></c><c r="B1" s="2"><v>2</v></c><c r="C1" s="1"><v>3</v></c><c r="D1" s="3"></c>',
    );
    const read = await readXlsx(written.data, 'en-GB');
    expect(read.ok && read.file.sheets[0]!.cells.map((c) => c.format)).toEqual([
      '#,##0.00',
      'dd/mm/yyyy',
      '#,##0.00',
      '"a&b"0',
    ]);
  });

  it('writes no number formats when no cell has one', async () => {
    const written = writeXlsx({ sheets: [{ name: 'S', rows: 1, cols: 1, cells: [] }] }, 'T');
    expect(await part(written.data, 'xl/styles.xml')).not.toContain('numFmts');
  });

  it('round-trips every format of the model through XLSX', async () => {
    const formats: CellFormat[] = [
      { nf: 'number', dp: 0 },
      { nf: 'percent', dp: 2 },
      { nf: 'scientific', dp: 2 },
      { nf: 'currency', cur: '€', dp: 2 },
      { nf: 'accounting', cur: '$', dp: 2 },
      { nf: 'date' },
      { nf: 'time' },
      { nf: 'datetime' },
      { nf: 'duration' },
      { nf: 'text' },
      { nf: 'custom', nc: '[Red]0.0;"neg"' },
    ];
    const inputs = Object.fromEntries(formats.map((_, i) => [`A${i + 1}`, String(i + 1)]));
    const sheets = makeSheets({ S: inputs }, { rows: 12, cols: 2 });
    const sheet = sheets[0]!;
    formats.forEach((format, i) => {
      const key = cellKey(sheet.layout.rows[i]!, sheet.layout.cols[0]!);
      sheet.cells.set(key, { ...sheet.cells.get(key), format });
    });
    const file = workbookFileOf(new Workbook({ sheets, locale: 'en-US' }), sheets, 'en-US');
    const read = await readXlsx(writeXlsx(file, 'T').data, 'en-US');
    if (!read.ok) throw new Error(read.rejection);
    const made = sheetsFromFile(read.file, 'en-US', seeded());
    expect(made.sheets[0]!.cells.map((c) => c.f)).toEqual(formats);
    expect(made.losses).toEqual([]);
  });
});
