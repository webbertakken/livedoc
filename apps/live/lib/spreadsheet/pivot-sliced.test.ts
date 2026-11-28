// A pivot table under this person's slicers (docs/specs/029-sheets/pivot-tables.md "In the grid", "Sliced", D629): drawn
// from the rows their slicers keep, blank where its output is smaller, its number formats kept; the cells keep everyone's.
import { describe, expect, it } from 'vitest';
import {
  emptyLayout,
  sheetFromJson,
  Workbook,
  type CellInput,
  type SheetCellJson,
  type SheetPivot,
  type SheetSlicer,
} from '@livedoc/sheets';
import { cellSpokenValue } from '@/components/sheets/sheet-cell-speech';
import { drawnFormat, drawnPivotsOf, drawnValue, slicedPivotsOf } from './pivot-sliced';

let seq = 11;
const rand = () => ((seq = (seq * 16807) % 2147483647) - 1) / 2147483646;
const by = { id: 'me', name: 'Me', color: '#000000' };

// Region and Units in A:B (Units as currency), a pivot table at D1 summing Units by Region, a slicer over A1:B4.
function setup(slicer: Partial<SheetSlicer> = {}) {
  const layout = emptyLayout(rand, 20, 8);
  const { rows, cols } = layout;
  const data: [CellInput, CellInput][] = [
    [{ s: 'Region' }, { s: 'Units' }],
    [{ s: 'East' }, { n: 5 }],
    [{ s: 'West' }, { n: 3 }],
    [{ s: 'East' }, { n: 2 }],
  ];
  const cells: SheetCellJson[] = data.flatMap((vs, r) =>
    vs.map((i, c) => ({
      r: rows[r]!,
      c: cols[c]!,
      i,
      ...(c === 1 && r > 0 ? { f: { nf: 'currency' as const } } : {}),
    })),
  );
  const range = { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[1]! };
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[3]! },
    source: range,
    rows: [{ col: cols[0]! }],
    values: [{ col: cols[1]!, summary: 'SUM' }],
  };
  const x: SheetSlicer = {
    id: 'slc001',
    kind: 'slicer',
    at: { r: rows[8]!, c: cols[0]!, dx: 0, dy: 0 },
    width: 200,
    height: 40,
    range,
    col: cols[0]!,
    filter: { values: ['West'] },
    ...slicer,
  };
  const sheet = sheetFromJson({
    id: 'sheet1',
    tabId: 'tab1',
    title: 'Data',
    layout: { ...layout, objects: [pivot, x] },
    cells,
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  });
  const wb = new Workbook({ sheets: [sheet], locale: 'en-GB' });
  return { wb, sheet };
}

describe('slicedPivotsOf', () => {
  it('draws the output from the rows the slicer keeps, blank past it, the cells keeping everyone’s', () => {
    const { wb, sheet } = setup();
    const drawn = slicedPivotsOf(wb, sheet, {});
    const at = (r: number, c: number) => drawnValue(drawn, wb, sheet.id, r, c);
    expect([at(0, 3), at(1, 3), at(1, 4), at(2, 3), at(3, 3)]).toEqual([
      'Region',
      'West',
      3,
      'Grand Total',
      null,
    ]);
    // Outside its output, the workbook's.
    expect(at(1, 0)).toBe('East');
    expect(wb.value(sheet.id, 1, 3)).toBe('East');
  });

  it('keeps the output’s number format unless the cell has its own', () => {
    const { wb, sheet } = setup();
    const drawn = slicedPivotsOf(wb, sheet, {});
    expect(drawnFormat(drawn, wb, sheet.id, 1, 4, undefined)).toMatchObject({ nf: 'currency' });
    expect(drawnFormat(drawn, wb, sheet.id, 1, 4, { nf: 'percent' })).toEqual({ nf: 'percent' });
    expect(drawnFormat(drawn, wb, sheet.id, 1, 3, { b: true })).toEqual({ b: true });
    // Undrawn, everyone's output gives it.
    expect(drawnFormat(null, wb, sheet.id, 1, 4, undefined)).toMatchObject({ nf: 'currency' });
  });

  it('draws nothing while the slicer keeps every row, or does not apply to pivot tables', () => {
    expect(
      slicedPivotsOf(setup({ filter: undefined }).wb, setup({ filter: undefined }).sheet, {}),
    ).toBeNull();
    const off = setup({ pivots: false });
    expect(slicedPivotsOf(off.wb, off.sheet, {})).toBeNull();
    const own = setup();
    expect(slicedPivotsOf(own.wb, own.sheet, { slc001: null })).toBeNull();
  });
});

describe('drawnPivotsOf', () => {
  it('draws none for no output, and a cell past a short row blank', () => {
    expect(drawnPivotsOf([])).toBeNull();
    const drawn = drawnPivotsOf([
      {
        rect: { r1: 0, c1: 0, r2: 1, c2: 1 },
        drawn: {
          rows: [['a']],
          fmts: [[]],
          index: { cells: [] },
          head: { rows: 1, cols: 1 },
          items: [],
        } as never,
      },
    ])!;
    expect(drawn.at(1, 1)).toEqual({ v: null, fmt: undefined });
    expect(drawn.at(5, 5)).toBeUndefined();
  });
});

describe('a sliced pivot table read to a screen reader', () => {
  it('reads the drawn output, not everyone’s', () => {
    const { wb, sheet } = setup();
    const drawn = slicedPivotsOf(wb, sheet, {});
    expect(cellSpokenValue(sheet, wb, 'en-GB', 1, 3, drawn)).toBe('West');
    expect(cellSpokenValue(sheet, wb, 'en-GB', 1, 3)).toBe('East');
  });
});
