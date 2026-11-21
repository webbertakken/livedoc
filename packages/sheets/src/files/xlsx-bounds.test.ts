// docs/specs/029-sheets/standard-mapping.md "Values in XLSX" (D89): Excel's own bounds held in every XLSX written, each
// loss named.
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { FileCell, WorkbookFile } from './workbook-file';
import { cutXlsxText, XLSX_FORMULA_MAX, XLSX_TEXT_MAX, xlsxFormula } from './xlsx-bounds';
import { writeXlsx } from './xlsx-write';

async function worksheet(bytes: Uint8Array<ArrayBuffer>, part = 'xl/worksheets/sheet1.xml') {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return new TextDecoder().decode(read.package.parts.get(part)!);
}

// A formula within LiveDoc's 8,000 characters that Excel's prefixes take past its 8,192.
const PREFIXED = `=${Array.from({ length: 1_000 }, () => 'XOR(1)').join('+')}`;

const one = (cells: FileCell[]): WorkbookFile => ({
  sheets: [{ name: 'Sheet1', rows: 10, cols: 20_000, cells }],
});

describe('cutXlsxText', () => {
  it('keeps text that fits, and cuts the rest to Excel’s length', () => {
    expect(cutXlsxText('short')).toBe('short');
    expect(cutXlsxText('x'.repeat(XLSX_TEXT_MAX + 5))).toHaveLength(XLSX_TEXT_MAX);
  });

  it('never cuts through a surrogate pair', () => {
    const text = `${'x'.repeat(XLSX_TEXT_MAX - 1)}😀`;
    expect(cutXlsxText(text)).toBe('x'.repeat(XLSX_TEXT_MAX - 1));
  });
});

describe('xlsxFormula', () => {
  it('writes Excel’s grammar, S5’s wrapping, or the value alone past 8,192 characters', () => {
    expect(xlsxFormula('=SUM(A1:A2)', undefined)).toEqual({ k: 'excel', text: 'SUM(A1:A2)' });
    expect(xlsxFormula('=JOIN(",", A1)', { k: 's', v: 'a' })).toEqual({
      k: 'wrapped',
      text: 'IFERROR(__xludf.DUMMYFUNCTION("JOIN("","", A1)"),"a")',
    });
    expect(xlsxFormula(PREFIXED, undefined)).toEqual({ k: 'value' });
    expect(xlsxFormula('=JOIN(",", A1)', { k: 's', v: 'y'.repeat(XLSX_FORMULA_MAX) })).toEqual({
      k: 'value',
    });
  });

  it('wraps a formula naming a column past XFD', () => {
    expect(xlsxFormula('=XFE1+1', { k: 'n', v: 1 }).k).toBe('wrapped');
    expect(xlsxFormula('=SUM(A1:XFE2)', { k: 'n', v: 1 }).k).toBe('wrapped');
    expect(xlsxFormula('=XFD1+1', { k: 'n', v: 1 }).k).toBe('excel');
  });
});

describe('writeXlsx within Excel’s bounds', () => {
  it('cuts a long text, in a cell and as a formula’s result, and names the cut', async () => {
    const long = 'z'.repeat(XLSX_TEXT_MAX + 3);
    const written = writeXlsx(
      one([
        { r: 0, c: 0, value: { k: 's', v: long } },
        { r: 0, c: 1, formula: '=A1', value: { k: 's', v: long } },
      ]),
      'T',
    );
    expect(written.losses).toEqual([{ k: 'text_cut', sheet: 'Sheet1', cells: 2 }]);
    const xml = await worksheet(written.data);
    expect(xml).toContain(`<c r="B1" t="str"><f>A1</f><v>${'z'.repeat(XLSX_TEXT_MAX)}</v></c>`);
    expect(xml).not.toContain('z'.repeat(XLSX_TEXT_MAX + 1));
  });

  it('writes a formula past 8,192 characters as its value, and names it', async () => {
    const written = writeXlsx(
      one([{ r: 2, c: 1, formula: PREFIXED, value: { k: 'n', v: 9 } }]),
      'T',
    );
    expect(written.losses).toEqual([{ k: 'formula_unwritten', sheet: 'Sheet1', r: 2, c: 1 }]);
    expect(await worksheet(written.data)).toContain('<c r="B3"><v>9</v></c>');
  });

  it('writes a block whose wrapped formula is too long as plain values', async () => {
    const long = 'a'.repeat(XLSX_FORMULA_MAX);
    const written = writeXlsx(
      one([
        {
          r: 0,
          c: 0,
          formula: '=SPLIT(A9, ",")',
          value: { k: 's', v: long },
          spans: { rows: 1, cols: 2 },
        },
        { r: 0, c: 1, value: { k: 's', v: 'a' } },
      ]),
      'T',
    );
    expect(written.losses).toEqual([{ k: 'formula_unwritten', sheet: 'Sheet1', r: 0, c: 0 }]);
    const xml = await worksheet(written.data);
    expect(xml).toContain('<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>');
  });

  it('leaves out cells past XFD, names the cut once, and ends a block spilling past it at XFD', async () => {
    const written = writeXlsx(
      one([
        {
          r: 0,
          c: 16_382,
          formula: '=SEQUENCE(1, 4)',
          value: { k: 'n', v: 1 },
          spans: { rows: 1, cols: 4 },
        },
        { r: 0, c: 16_383, value: { k: 'n', v: 2 } },
        { r: 0, c: 16_384, value: { k: 'n', v: 3 } },
        { r: 0, c: 16_385, value: { k: 'n', v: 4 } },
      ]),
      'T',
    );
    expect(written.losses).toEqual([{ k: 'sheet_cut', sheet: 'Sheet1', rows: 10, cols: 16_384 }]);
    const xml = await worksheet(written.data);
    expect(xml).toContain('<f t="array" ref="XFC1:XFD1">_xlfn.SEQUENCE(1, 4)</f>');
    expect(xml).not.toContain('XFE1');
  });
});
