// Rows and columns in XLSX (standard-mapping.md "Rows and columns in the file").
import { describe, expect, it } from 'vitest';
import { parseXml } from '@livedoc/office-packages';
import { SPREADSHEETML_NS } from './xlsx-parts';
import { readXlsxLines, withSheetPrOwn, xlsxLinesOut } from './xlsx-lines';

const sheet = (body: string) => {
  const parsed = parseXml(`<worksheet xmlns="${SPREADSHEETML_NS}">${body}</worksheet>`);
  if (!parsed.ok) throw new Error('xml');
  return readXlsxLines(parsed.root, SPREADSHEETML_NS);
};

describe('readXlsxLines', () => {
  it('says nothing of a sheet that says nothing of its lines', () => {
    expect(sheet('<sheetData><row r="1"><c r="A1"/></row></sheetData>')).toBeUndefined();
  });

  it('reads rows by their number or their place, sized only by hand, deep at most 7', () => {
    const read = sheet(
      '<sheetData><row r="2" ht="30" customHeight="1"/><row ht="45"/><row r="0" hidden="1"/>' +
        '<row r="9" hidden="true" outlineLevel="12"/><row r="x" outlineLevel="-1"/></sheetData>',
    );
    expect(read?.r?.lines).toEqual(
      new Map([
        [1, { size: 40 }],
        [8, { hidden: true, depth: 7 }],
      ]),
    );
    expect(read?.c).toBeUndefined();
  });

  it('reads column runs, their defaults and the controls before (outlinePr 0)', () => {
    const read = sheet(
      '<sheetPr><outlinePr summaryBelow="0" summaryRight="false"/></sheetPr>' +
        '<sheetFormatPr defaultRowHeight="15.75" defaultColWidth="9.140625"/>' +
        '<cols><col min="2" max="3" width="20" outlineLevel="1"/><col max="1" hidden="1"/><col min="6" hidden="1"/></cols>',
    );
    expect(read?.r).toEqual({ lines: new Map(), collapsed: [], size: 21 });
    expect(read?.c).toEqual({
      lines: new Map([
        [1, { size: 140, depth: 1 }],
        [2, { size: 140, depth: 1 }],
        // No `min`: from the first column.
        [0, { hidden: true }],
        // No `max`: the one column.
        [5, { hidden: true }],
      ]),
      collapsed: [],
      size: 64,
    });
  });

  it('collapses a group whose lines are all hidden and whose control’s line says so', () => {
    const rows = (control: string) =>
      sheet(
        `<sheetData><row r="2" hidden="1" outlineLevel="1"/><row r="3" hidden="1" outlineLevel="1"/>${control}` +
          '<row r="6" outlineLevel="1"/><row r="7" hidden="1" outlineLevel="1"/><row r="8" collapsed="1"/></sheetData>',
      )!.r!;
    // Excel's default: the control after its group.
    expect(rows('<row r="4" collapsed="1"/>').collapsed).toEqual([{ at: 1, depth: 1 }]);
    expect(rows('').collapsed).toEqual([]);
    expect(rows('').after).toBe(true);
  });
});

describe('xlsxLinesOut', () => {
  it('writes Excel’s own defaults for a sheet that sizes nothing', () => {
    const out = xlsxLinesOut({}, 10, 4);
    expect(out).toEqual({
      rows: new Map(),
      cols: null,
      sheetFormatPr: '<sheetFormatPr defaultRowHeight="15"/>',
      outlinePr: null,
    });
  });

  it('writes a collapsed group’s control, columns past the sheet left out', () => {
    const out = xlsxLinesOut(
      {
        c: {
          lines: new Map([
            [0, { depth: 1 }],
            [1, { depth: 1 }],
            [9, { hidden: true }],
          ]),
          collapsed: [{ at: 0, depth: 1 }],
        },
      },
      10,
      4,
    );
    // Before its group, but the group starts the sheet: after it.
    expect(out.cols).toBe(
      '<cols><col min="1" max="2" width="9.140625" hidden="1" outlineLevel="1"/>' +
        '<col min="3" max="3" width="9.140625" collapsed="1"/></cols>',
    );
    expect(out.outlinePr).toBe(' summaryBelow="0" summaryRight="0"');
    const after = xlsxLinesOut(
      { r: { lines: new Map([[2, { depth: 1 }]]), collapsed: [], after: true } },
      10,
      4,
    );
    expect(after.outlinePr).toBe(' summaryBelow="1" summaryRight="0"');
  });
});

describe('withSheetPrOwn', () => {
  const own = (p: string) => `<${p}outlinePr summaryBelow="0"/>`;
  it.each([
    ['<sheetPr/>', '<sheetPr><outlinePr summaryBelow="0"/></sheetPr>'],
    [
      '<x:sheetPr codeName="a>b" />',
      '<x:sheetPr codeName="a>b"><x:outlinePr summaryBelow="0"/></x:sheetPr>',
    ],
    [
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
      '<sheetPr><outlinePr summaryBelow="0"/><pageSetUpPr fitToPage="1"/></sheetPr>',
    ],
    [
      '<sheetPr filterMode="1"><pageSetUpPr/></sheetPr>',
      '<sheetPr filterMode="1"><outlinePr summaryBelow="0"/><pageSetUpPr/></sheetPr>',
    ],
  ])('puts LiveDoc’s own children first into %s', (kept, merged) => {
    expect(withSheetPrOwn(kept, own)).toBe(merged);
  });

  it('closes an unterminated start tag at its end', () => {
    expect(withSheetPrOwn('<sheetPr', own)).toBe('<sheetPr<outlinePr summaryBelow="0"/>');
  });
});
