// docs/specs/029-sheets/standard-mapping.md "Cell styles in the file": a cell's style leaves in either format as its
// cell style and comes back the same, an empty styled cell too; ODF's default cell style is LiveDoc's (D204).
import { readOdfPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { CellStyle } from './cell-style';
import { readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import type { FileCell, FileRead, WorkbookFile } from './workbook-file';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';

const EVERY: CellStyle = {
  b: true,
  i: true,
  u: true,
  st: true,
  fc: '#ff0000',
  bg: '#ffff00',
  ff: 'Roboto Mono',
  fs: 14,
  ha: 'c',
  va: 't',
  wr: 'w',
  bt: { w: 3, s: 'double', c: '#000000' },
  br: { w: 2, s: 'dashed', c: '#0000ff' },
  bb: { w: 3, s: 'solid', c: '#00ff00' },
  bl: { w: 1, s: 'dotted', c: '#000000' },
};

const CELLS: FileCell[] = [
  { r: 0, c: 0, value: { k: 's', v: 'Total' }, style: EVERY },
  { r: 0, c: 1, value: { k: 'n', v: 0.5 }, format: '0.00%', style: { b: true, va: 'b' } },
  { r: 0, c: 2, value: { k: 'n', v: 2 } },
  { r: 1, c: 0, style: { bg: '#cfe2f3' } },
  { r: 1, c: 1, format: '0.00%', style: { ha: 'r' } },
];
const FILE: WorkbookFile = { sheets: [{ name: 'S', rows: 2, cols: 3, cells: CELLS }] };

const cellsOf = (read: FileRead) => {
  if (!read.ok) throw new Error(read.rejection);
  expect(read.losses).toEqual([]);
  return read.file.sheets[0]!.cells;
};

describe('cell styles in the file', () => {
  it('come back from XLSX as they left', async () => {
    const written = writeXlsx(FILE, 'T');
    expect(written.losses).toEqual([]);
    expect(cellsOf(await readXlsx(written.data, 'en-GB'))).toEqual(CELLS);
  });

  it('come back from an ODF package and a flat file as they left', async () => {
    const pkg = writeOds(FILE, 'T');
    expect(pkg.losses).toEqual([]);
    expect(cellsOf(await readOds(pkg.data))).toEqual(CELLS);
    const flat = writeFlatOds(FILE, 'T');
    expect(cellsOf(await readOds(new TextEncoder().encode(flat.data)))).toEqual(CELLS);
  });

  it('write ODF’s default cell style as LiveDoc’s, in styles.xml of a package', async () => {
    const read = await readOdfPackage(writeOds(FILE, 'T').data);
    if (!read.ok) throw new Error(read.rejection);
    const entry = (name: string) => new TextDecoder().decode(read.package.entries.get(name));
    const properties =
      '<style:table-cell-properties style:vertical-align="middle"/>' +
      '<style:text-properties fo:font-family="Arial" fo:font-size="10pt"/>';
    expect(entry('styles.xml')).toContain(
      `<office:styles>\n<style:default-style style:family="table-cell">${properties}</style:default-style>\n` +
        `<style:style style:name="Default" style:family="table-cell">${properties}</style:style>\n</office:styles>`,
    );
    expect(entry('content.xml')).not.toContain('<office:styles>');
  });

  it('write a code ODF cannot say without it, keeping the cell’s look', async () => {
    const odd: WorkbookFile = {
      sheets: [
        {
          name: 'S',
          rows: 1,
          cols: 1,
          cells: [{ r: 0, c: 0, value: { k: 'n', v: 1 }, format: '# ?/?', style: { b: true } }],
        },
      ],
    };
    const written = writeOds(odd, 'T');
    expect(written.losses).toEqual([{ k: 'format_unwritten', sheet: 'S', r: 0, c: 0 }]);
    const read = await readOds(written.data);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 1 }, style: { b: true } },
    ]);
  });
});
