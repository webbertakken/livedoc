// docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers" (D475, D476, D483-D487): a slicer floats
// over the grid and filters a range by one of its columns; its default is everyone's, one's own change theirs alone;
// a row is drawn only when every filter and every slicer over it keep it; formulas never read a slicer.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { cellKey, type Sheet } from '../sheet';
import type { Grid } from '../selection';
import { filteredOutRows } from '../filter';
import { applySheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import type { SheetTable } from '../tables/table';
import { isSheetObject } from './sheet-objects';
import { objectsAfterDelete } from './objects-after-delete';
import {
  SLICERS_MAX,
  slicerColumnIds,
  slicerDrawnFilters,
  slicerOverTable,
  slicerPlacement,
  type SheetSlicer,
} from './sheet-slicer';

const DATA = {
  A1: 'Item',
  B1: 'N',
  A2: 'pen',
  B2: '1',
  A3: 'ink',
  B3: '2',
  A4: 'pad',
  B4: '3',
};
const slicer = (over: Partial<SheetSlicer> = {}): SheetSlicer => ({
  id: 'slc001',
  kind: 'slicer',
  at: { r: 's0r0', c: 's0c4', dx: 0, dy: 0 },
  width: 200,
  height: 40,
  range: { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1' },
  col: 's0c0',
  ...over,
});
const objectWrite = (x: SheetSlicer): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'object', id: x.id, object: x }],
});
const apply = (sheet: Sheet, w: SheetWrite) =>
  applySheetWrite(sheet, w, { now: 1, by: sheet.updatedBy }).sheet;

function gridOf(sheet: Sheet): Grid {
  return {
    rows: sheet.layout.rows.length,
    cols: sheet.layout.cols.length,
    hiddenRow: () => false,
    hiddenCol: () => false,
    filled: (r, c) => sheet.cells.has(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!)),
    mergeAt: () => null,
  };
}

describe('a slicer as an object', () => {
  it('is a sheet object when whole and within its bounds', () => {
    expect(isSheetObject(slicer(), 'slc001')).toBe(true);
    expect(isSheetObject(slicer({ filter: { values: ['pen'] }, title: 'Items' }), 'slc001')).toBe(
      true,
    );
    expect(isSheetObject(slicer({ pivots: false }), 'slc001')).toBe(true);
    // Its column gone or its range gone (D486) are still slicers.
    const { col: _c, range: _r, ...bare } = slicer();
    expect(isSheetObject(bare, 'slc001')).toBe(true);
  });

  it('refuses what a slicer cannot hold (D483, D484)', () => {
    expect(isSheetObject(slicer({ width: 99 }), 'slc001')).toBe(false);
    expect(isSheetObject(slicer({ height: 29 }), 'slc001')).toBe(false);
    expect(isSheetObject(slicer({ title: 'x'.repeat(101) }), 'slc001')).toBe(false);
    expect(isSheetObject({ ...slicer(), extra: 1 }, 'slc001')).toBe(false);
    expect(
      isSheetObject(slicer({ filter: { colour: { key: 'bg', is: '#ff0000' } } }), 'slc001'),
    ).toBe(false);
    expect(
      isSheetObject(slicer({ filter: { op: 'formula', fx: { t: '=TRUE', r: [] } } }), 'slc001'),
    ).toBe(false);
    expect(isSheetObject({ ...slicer(), pivots: true }, 'slc001')).toBe(false);
  });

  it('is written by an Editor, up to 50 a sheet', () => {
    const b = book(DATA);
    const sheet = b.sheets[0]!;
    expect(validateWrite(sheet, objectWrite(slicer())).ok).toBe(true);
    let full = sheet;
    for (let i = 0; i < SLICERS_MAX; i++)
      full = apply(full, objectWrite(slicer({ id: `slc${String(i).padStart(3, '0')}` })));
    const v = validateWrite(full, objectWrite(slicer({ id: 'slcmore' })));
    expect(v).toEqual({ ok: false, error: 'objects_full' });
  });
});

describe('what a slicer hides', () => {
  it('hides the rows its default leaves out, the header never', () => {
    const b = book(DATA);
    const s = slicer({ filter: { values: ['pen', 'pad'] } });
    const sheet = apply(b.sheets[0]!, objectWrite(s));
    b.wb.updateSheet(sheet, []);
    const slicers = slicerDrawnFilters(sheet.layout, {});
    expect([...filteredOutRows(b.wb, sheet.id, undefined, slicers)]).toEqual(['s0r2']);
    // Formulas, and every read without the slicers, never see it.
    expect([...filteredOutRows(b.wb, sheet.id)]).toEqual([]);
  });

  it("filters by one's own in place of the default, and by nothing once cleared (D485)", () => {
    const b = book(DATA);
    const sheet = apply(b.sheets[0]!, objectWrite(slicer({ filter: { values: ['pen'] } })));
    b.wb.updateSheet(sheet, []);
    const own = slicerDrawnFilters(sheet.layout, { slc001: { op: 'contains', a: 'p' } });
    expect([...filteredOutRows(b.wb, sheet.id, undefined, own)]).toEqual(['s0r2']);
    const cleared = slicerDrawnFilters(sheet.layout, { slc001: null });
    expect(cleared).toEqual([]);
  });

  it('keeps a row only when every filter and every slicer keep it', () => {
    const b = book(DATA);
    let sheet = apply(b.sheets[0]!, objectWrite(slicer({ filter: { values: ['pen', 'ink'] } })));
    sheet = apply(sheet, {
      kind: 'layout',
      changes: [
        {
          k: 'filter',
          filter: {
            r1: 's0r0',
            c1: 's0c0',
            r2: 's0r3',
            c2: 's0c1',
            conds: { s0c1: { op: 'gt', a: '1' } },
          },
        },
      ],
    });
    b.wb.updateSheet(sheet, []);
    const slicers = slicerDrawnFilters(sheet.layout, {});
    expect([...filteredOutRows(b.wb, sheet.id, undefined, slicers)].sort()).toEqual([
      's0r1',
      's0r3',
    ]);
    // Under an open view, the view and the slicers both hide.
    const view = { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1', conds: {} };
    expect([...filteredOutRows(b.wb, sheet.id, view, slicers)]).toEqual(['s0r3']);
  });

  it('filters nothing without a column or a range (D486)', () => {
    const b = book(DATA);
    const { col: _c, ...noCol } = slicer({ filter: { values: ['pen'] } });
    const sheet = apply(b.sheets[0]!, objectWrite(noCol));
    expect(slicerDrawnFilters(sheet.layout, {})).toEqual([]);
  });
});

describe('Data › Add a Slicer', () => {
  it('takes the filled range around the selection, on the active column', () => {
    const sheet = book(DATA).sheets[0]!;
    const at = slicerPlacement(sheet.layout, { r1: 2, c1: 1, r2: 2, c2: 1 }, gridOf(sheet));
    expect(at).toEqual({
      range: { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1' },
      col: 's0c1',
    });
  });

  it("takes the sheet filter's range, on its first column when the active one is outside", () => {
    let sheet = book({ ...DATA, F1: 'far' }).sheets[0]!;
    sheet = apply(sheet, {
      kind: 'layout',
      changes: [
        { k: 'filter', filter: { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1', conds: {} } },
      ],
    });
    const at = slicerPlacement(sheet.layout, { r1: 0, c1: 5, r2: 0, c2: 5 }, gridOf(sheet));
    expect(at).toEqual({
      range: { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1' },
      col: 's0c0',
    });
  });

  it("attaches to a table's filter rows when the selection is inside a table", () => {
    const table: SheetTable = {
      id: 'tbl001',
      name: 'Table1',
      r1: 's0r0',
      c1: 's0c0',
      r2: 's0r4',
      c2: 's0c1',
      total: true,
    };
    const sheet = book(DATA, { tables: { 'Sheet 1': [table] } }).sheets[0]!;
    const at = slicerPlacement(sheet.layout, { r1: 1, c1: 0, r2: 1, c2: 0 }, gridOf(sheet));
    // Its header and data rows, the total row apart.
    expect(at?.range).toEqual({ r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1' });
    expect(slicerOverTable(sheet.layout, slicer({ range: at!.range }))?.name).toBe('Table1');
    expect(slicerOverTable(sheet.layout, slicer())?.name).toBe('Table1');
    expect(
      slicerOverTable(
        sheet.layout,
        slicer({ range: { r1: 's0r1', c1: 's0c0', r2: 's0r3', c2: 's0c1' } }),
      ),
    ).toBeNull();
  });

  it('offers the range’s columns, as the panel’s Column lists them', () => {
    const sheet = book(DATA).sheets[0]!;
    expect(slicerColumnIds(sheet.layout, slicer())).toEqual(['s0c0', 's0c1']);
    expect(slicerColumnIds(sheet.layout, {})).toEqual([]);
  });
});

describe('a slicer after a delete (D486)', () => {
  it('shrinks its range, and loses its column with it', () => {
    const sheet = book(DATA).sheets[0]!;
    const before = { ...sheet.layout, objects: [slicer({ filter: { values: ['pen'] } })] };
    const [rowsGone] = objectsAfterDelete(before, new Set(['s0r3']), new Set()) as SheetSlicer[];
    expect(rowsGone!.range).toEqual({ r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c1' });
    expect(rowsGone!.col).toBe('s0c0');
    const [colGone] = objectsAfterDelete(before, new Set(), new Set(['s0c0'])) as SheetSlicer[];
    expect(colGone!.range).toEqual({ r1: 's0r0', c1: 's0c1', r2: 's0r3', c2: 's0c1' });
    expect(colGone!.col).toBeUndefined();
    expect(colGone!.filter).toBeUndefined();
    const [allGone] = objectsAfterDelete(
      before,
      new Set(['s0r0', 's0r1', 's0r2', 's0r3']),
      new Set(),
    ) as SheetSlicer[];
    expect(allGone!.range).toBeUndefined();
  });
});
