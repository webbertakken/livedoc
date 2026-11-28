// docs/specs/029-sheets/pivot-tables.md "In the grid", "Sliced" (D629); data-tools.md "Slicers" (D487): a pivot table
// whose source is exactly a slicer's range on its own sheet, Apply to Pivot Tables ticked, is worked out for one
// person from the rows their slicers keep; its cells keep everyone's output.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { filteredOutRows } from '../filter';
import type { SheetPivot } from '../objects/sheet-pivot';
import { slicersOverPivot, type SheetSlicer } from '../objects/sheet-slicer';
import type { Sheet } from '../sheet';

const DATA = {
  A1: 'Region',
  B1: 'Units',
  A2: 'East',
  B2: '5',
  A3: 'West',
  B3: '3',
  A4: 'East',
  B4: '2',
};

function withSlicedPivot(
  slicer: Partial<SheetSlicer> = {},
  source: Partial<SheetPivot['source']> = {},
  more: Record<string, string> = {},
) {
  const b = book({ Data: { ...DATA, ...more } }, { rows: 8, cols: 6 });
  const data = b.sheets[0] as Sheet;
  const { rows, cols } = data.layout;
  const range = { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[1]! };
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[3]! },
    source: { ...range, ...source },
    rows: [{ col: cols[0]! }],
    values: [{ col: cols[1]!, summary: 'SUM' }],
  };
  const x: SheetSlicer = {
    id: 'slc001',
    kind: 'slicer',
    at: { r: rows[5]!, c: cols[0]!, dx: 0, dy: 0 },
    width: 200,
    height: 40,
    range,
    col: cols[0]!,
    filter: { values: ['West'] },
    ...slicer,
  };
  const sheet = { ...data, layout: { ...data.layout, objects: [pivot, x] } };
  b.wb.updateSheet(sheet);
  return { wb: b.wb, sheet, pivot };
}

describe('slicersOverPivot', () => {
  it('takes a slicer over the pivot table’s source exactly, with Apply to Pivot Tables', () => {
    const { sheet, pivot } = withSlicedPivot();
    expect(slicersOverPivot(sheet.layout, pivot.source, {})).toHaveLength(1);
  });

  it('takes none unticked, over another range, for a source on another sheet, or with none', () => {
    const off = withSlicedPivot({ pivots: false });
    expect(slicersOverPivot(off.sheet.layout, off.pivot.source, {})).toEqual([]);
    const other = withSlicedPivot({}, { r2: 'elsewhere' });
    expect(slicersOverPivot(other.sheet.layout, other.pivot.source, {})).toEqual([]);
    const away = withSlicedPivot({}, { s: 'sheetTwo' });
    expect(slicersOverPivot(away.sheet.layout, away.pivot.source, {})).toEqual([]);
    expect(slicersOverPivot(away.sheet.layout, undefined, {})).toEqual([]);
  });

  it('takes none while one’s own filter keeps every row', () => {
    const { sheet, pivot } = withSlicedPivot();
    expect(slicersOverPivot(sheet.layout, pivot.source, { slc001: null })).toEqual([]);
  });
});

describe('Workbook.pivotOutputSliced', () => {
  it('works the output out from the rows kept, leaving everyone’s in the cells', () => {
    const { wb, sheet, pivot } = withSlicedPivot();
    const hidden = filteredOutRows(
      wb,
      sheet.id,
      null,
      slicersOverPivot(sheet.layout, pivot.source, {}),
    );
    const sliced = wb.pivotOutputSliced(sheet.id, pivot.id, hidden)!;
    expect(sliced.rect).toEqual({ r1: 0, c1: 3, r2: 3, c2: 4 });
    expect(sliced.drawn.rows).toEqual([
      ['Region', 'SUM of Units'],
      ['West', 3],
      ['Grand Total', 3],
    ]);
    expect(wb.value(sheet.id, 1, 3)).toBe('East');
    expect(wb.value(sheet.id, 3, 4)).toBe(10);
  });

  it('works a calculated field out over the rows kept', () => {
    const { wb, sheet, pivot } = withSlicedPivot();
    const calc = {
      ...pivot,
      values: [{ formula: '=Units*2', summary: 'SUM' as const, name: 'Double' }],
    };
    const next = {
      ...sheet,
      layout: { ...sheet.layout, objects: [calc, sheet.layout.objects[1]!] },
    };
    wb.updateSheet(next);
    const hidden = filteredOutRows(
      wb,
      next.id,
      null,
      slicersOverPivot(next.layout, calc.source, {}),
    );
    expect(wb.pivotOutputSliced(next.id, calc.id, hidden)!.drawn.rows[1]).toEqual(['West', 6]);
  });

  it('is null for a pivot table not on the sheet, or not landed', () => {
    const { wb, sheet } = withSlicedPivot();
    expect(wb.pivotOutputSliced(sheet.id, 'nopivot', new Set())).toBeNull();
    expect(wb.pivotOutputSliced('nosheet', 'pivot01', new Set())).toBeNull();
    // Its anchor holding a value, it has not landed.
    const blocked = withSlicedPivot({}, {}, { D1: 'mine' });
    expect(blocked.wb.pivotOutputSliced(blocked.sheet.id, 'pivot01', new Set())).toBeNull();
  });
});
