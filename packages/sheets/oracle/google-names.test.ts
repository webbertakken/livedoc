import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readXlsx } from '../src/files/xlsx-read';
import { writeXlsx } from '../src/files/xlsx-write';
import { asGoogleReadsIt } from './google-names.ts';

// formulas.md "The oracle": Google reads `_xlfn._xlws.FILTER` as `_xlws.FILTER` (#NAME?) and `_xlfn.FILTER` as FILTER.

const WORKBOOK = {
  sheets: [
    {
      name: 'Cases',
      rows: 3,
      cols: 3,
      cells: [
        { r: 0, c: 0, value: { k: 'n' as const, v: 1 } },
        { r: 0, c: 1, formula: '=FILTER(A1:A2, A1:A2>0)' },
        { r: 0, c: 2, formula: '=SORT(XLOOKUP(1, A1:A2, A1:A2))' },
      ],
    },
  ],
};

async function worksheetXml(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return new TextDecoder().decode(read.package.parts.get('xl/worksheets/sheet1.xml'));
}

describe('asGoogleReadsIt', () => {
  it('names worksheet functions with `_xlfn.` alone, leaving every other name and part as written', async () => {
    const written = writeXlsx(WORKBOOK, 'Oracle').data;
    expect(await worksheetXml(written)).toContain('_xlfn._xlws.FILTER(');
    const renamed = await asGoogleReadsIt(written);
    const xml = await worksheetXml(renamed);
    expect(xml).toContain('<f>_xlfn.FILTER(A1:A2, A1:A2&gt;0)</f>');
    expect(xml).toContain('_xlfn.SORT(_xlfn.XLOOKUP(');
    expect(xml).not.toContain('_xlws.');
    const read = await readXlsx(renamed);
    expect(read.ok && read.file.sheets[0]!.cells.map((c) => c.formula)).toEqual([
      undefined,
      '=FILTER(A1:A2, A1:A2>0)',
      '=SORT(XLOOKUP(1, A1:A2, A1:A2))',
    ]);
  });

  it('refuses bytes that are no package, naming the rejection', async () => {
    await expect(asGoogleReadsIt(new Uint8Array([1, 2]))).rejects.toThrow(
      'the written workbook: package_damaged',
    );
  });
});
