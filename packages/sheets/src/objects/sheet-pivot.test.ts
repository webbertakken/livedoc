// docs/specs/029-sheets/pivot-tables.md "The model" (D378, D502): what a pivot table may be as its sheet keeps it, and
// what deleting rows and columns does to one, on its own sheet and on its source's.
import { describe, expect, it } from 'vitest';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { makeSheets } from '../testing/book';
import type { Sheet } from '../sheet';
import { isSheetObject, SHEET_OBJECTS_MAX } from './sheet-objects';
import {
  PIVOT_FILTERS_MAX,
  PIVOT_GROUPS_MAX,
  PIVOT_NAME_MAX,
  PIVOT_VALUES_MAX,
  pivotWithout,
  shrinkPivotSourcesOf,
  type SheetPivot,
} from './sheet-pivot';

const by = { id: 'p', name: 'P', color: '#000000' };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const apply = (s: Sheet, w: SheetWrite) => applySheetWrite(s, w, { now: 1, by });
const pivot = (x: Partial<SheetPivot> = {}): SheetPivot => ({
  id: 'pivot01',
  kind: 'pivot',
  at: { r: R(0), c: C(6) },
  source: { r1: R(0), c1: C(0), r2: R(8), c2: C(3) },
  rows: [{ col: C(0) }],
  values: [{ col: C(2), summary: 'SUM' }],
  ...x,
});
const set = (o: SheetPivot | null, id = o?.id ?? 'pivot01'): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'object', id, object: o }],
});
const base = () => makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 10 })[0]!;
const yes = (x: unknown) => expect(isSheetObject(x, 'pivot01')).toBe(true);
const no = (x: unknown) => expect(isSheetObject(x, 'pivot01')).toBe(false);

describe('what a pivot table may be', () => {
  it('takes its place, a source on any sheet, every field and option', () => {
    yes({ id: 'pivot01', kind: 'pivot', at: { r: R(0), c: C(0) } });
    yes(pivot({ source: { r1: R(0), c1: C(0), r2: R(1), c2: C(1), s: 'sheet1xx' } }));
    yes(pivot({ source: { r1: R(0), c1: C(0), r2: R(1), c2: C(1), st: 'Data' } }));
    yes(
      pivot({
        rows: [
          { col: C(0), desc: true, totals: false, repeat: true, sortBy: { value: 1 } },
          { col: C(1), grouping: { k: 'date', rule: 'yearMonth' } },
          { col: C(2), grouping: { k: 'interval', size: 5, start: 0, end: 20 } },
          { col: C(3), grouping: { k: 'interval', size: 0.5 } },
        ],
        columns: [
          { col: C(1), sortBy: { value: 0, item: ['East'] } },
          { col: C(4), grouping: { k: 'custom', groups: [{ name: 'A', items: ['x', 'y'] }] } },
        ],
        values: [
          { col: C(2), summary: 'AVERAGE', showAs: 'row', name: 'Mean' },
          { col: C(3), summary: 'COUNTUNIQUE' },
        ],
        filters: [
          { col: C(0), cond: { values: ['East', ''] } },
          { col: C(2), cond: { op: 'gt', a: '5' } },
        ],
        valuesAsRows: true,
      }),
    );
  });

  it('refuses unknown keys, a malformed place or source, empty lists and anything past its bounds', () => {
    no({ ...pivot(), extra: 1 });
    no(pivot({ at: { r: R(0), c: C(0), dx: 0 } as SheetPivot['at'] }));
    no(pivot({ at: { r: 'X', c: C(0) } }));
    no({ ...pivot(), at: null });
    no(pivot({ source: { r1: R(0), c1: C(0), r2: R(1), c2: C(1), s: 'sheet1xx', st: 'T' } }));
    no(pivot({ source: { r1: R(0), c1: C(0), r2: R(1), c2: C(1), s: 'no' } }));
    no(pivot({ source: { r1: R(0), c1: C(0), r2: R(1), c2: C(1), st: '' } }));
    no(pivot({ source: { r1: R(0), c1: C(0), r2: R(1) } as SheetPivot['source'] }));
    no({ ...pivot(), source: 'A1:B2' });
    no(pivot({ rows: [] }));
    no(pivot({ rows: Array.from({ length: PIVOT_GROUPS_MAX + 1 }, () => ({ col: C(0) })) }));
    no(
      pivot({
        values: Array.from({ length: PIVOT_VALUES_MAX + 1 }, () => ({
          col: C(0),
          summary: 'SUM' as const,
        })),
      }),
    );
    no(
      pivot({
        filters: Array.from({ length: PIVOT_FILTERS_MAX + 1 }, () => ({ col: C(0), cond: {} })),
      }),
    );
    no({ ...pivot(), valuesAsRows: false });
  });

  it('refuses a malformed group, value or filter', () => {
    const group = (g: unknown) => no(pivot({ rows: [g as SheetPivot['rows'] & object] as never }));
    group({ col: 'X' });
    group({ col: C(0), other: 1 });
    group({ col: C(0), desc: false });
    group({ col: C(0), totals: true });
    group({ col: C(0), repeat: false });
    group({ col: C(0), sortBy: { value: 1 } });
    group({ col: C(0), sortBy: { value: 0.5 } });
    group({ col: C(0), sortBy: { value: 0, item: [] } });
    group({ col: C(0), sortBy: { value: 0, other: 1 } });
    group({ col: C(0), sortBy: 0 });
    group({ col: C(0), grouping: { k: 'date', rule: 'week' } });
    group({ col: C(0), grouping: { k: 'date', rule: 'year', size: 1 } });
    group({ col: C(0), grouping: { k: 'interval', size: 0 } });
    group({ col: C(0), grouping: { k: 'interval', size: 1, start: 5, end: 5 } });
    group({ col: C(0), grouping: { k: 'interval', size: 1, start: Infinity } });
    group({ col: C(0), grouping: { k: 'interval', size: 1, other: 1 } });
    group({ col: C(0), grouping: { k: 'custom', groups: [{ name: '', items: [] }] } });
    group({
      col: C(0),
      grouping: { k: 'custom', groups: [{ name: 'x'.repeat(PIVOT_NAME_MAX + 1), items: [] }] },
    });
    group({ col: C(0), grouping: { k: 'custom', groups: [{ name: 'A', items: [1] }] } });
    group({ col: C(0), grouping: { k: 'custom', groups: [{ name: 'A', items: [], x: 1 }] } });
    group({ col: C(0), grouping: { k: 'custom', groups: [null] } });
    group({ col: C(0), grouping: { k: 'custom', groups: 'A' } });
    group({ col: C(0), grouping: 'date' });
    const value = (v: unknown) => no(pivot({ values: [v as never] }));
    value({ col: C(0), summary: 'SUMX' });
    value({ col: C(0), summary: 'SUM', showAs: 'percent' });
    value({ col: C(0), summary: 'SUM', name: '' });
    value({ col: C(0), summary: 'SUM', name: 'x'.repeat(PIVOT_NAME_MAX + 1) });
    value({ col: C(0), summary: 'SUM', other: 1 });
    value({ col: 'X', summary: 'SUM' });
    value(null);
    const filter = (f: unknown) => no(pivot({ filters: [f as never] }));
    filter({ col: C(0), cond: { op: 'formula', fx: { t: 'TRUE', r: [] } } });
    filter({ col: C(0), cond: { colour: { key: 'bg', is: '#ffffff' } } });
    filter({ col: C(0), cond: { op: 'nearly' } });
    filter({ col: C(0), cond: null });
    filter({ col: C(0), cond: {}, other: 1 });
    filter({ col: 'X', cond: {} });
  });

  it('counts toward the objects cap with charts', () => {
    const s0 = base();
    const many = Array.from({ length: SHEET_OBJECTS_MAX }, (_, i) =>
      pivot({ id: `pivot${String(i).padStart(3, '0')}` }),
    );
    const full = apply(s0, {
      kind: 'layout',
      changes: many.map((p) => ({ k: 'object' as const, id: p.id, object: p })),
    });
    expect(full.sheet.layout.objects).toHaveLength(SHEET_OBJECTS_MAX);
  });
});

describe('pivotWithout', () => {
  it('drops the fields of gone columns and keeps value sorts pointing at their values', () => {
    const p = pivot({
      rows: [
        { col: C(0), sortBy: { value: 2 } },
        { col: C(1), sortBy: { value: 0 } },
      ],
      columns: [{ col: C(3) }],
      values: [
        { col: C(1), summary: 'SUM' },
        { col: C(2), summary: 'SUM' },
        { col: C(2), summary: 'MAX' },
      ],
      filters: [
        { col: C(1), cond: { values: ['a'] } },
        { col: C(2), cond: {} },
      ],
    });
    expect(pivotWithout(p, new Set([C(9)]))).toBe(p);
    const out = pivotWithout(p, new Set([C(1)]));
    expect(out.rows).toEqual([{ col: C(0), sortBy: { value: 1 } }]);
    expect(out.columns).toEqual([{ col: C(3) }]);
    expect(out.values).toEqual([
      { col: C(2), summary: 'SUM' },
      { col: C(2), summary: 'MAX' },
    ]);
    expect(out.filters).toEqual([{ col: C(2), cond: {} }]);
    const noValues = pivot({ values: undefined, rows: [{ col: C(1) }, { col: C(0) }] });
    expect(pivotWithout(noValues, new Set([C(1)])).rows).toEqual([{ col: C(0) }]);
    const bare = pivotWithout(out, new Set([C(0), C(2), C(3)]));
    expect(bare).toEqual({ id: 'pivot01', kind: 'pivot', at: p.at, source: p.source });
  });

  it('turns a sort by a dropped value back to the items', () => {
    const p = pivot({
      rows: [{ col: C(0), desc: true, sortBy: { value: 0 } }],
      values: [{ col: C(1), summary: 'SUM' }],
    });
    expect(pivotWithout(p, new Set([C(1)])).rows).toEqual([{ col: C(0), desc: true }]);
  });
});

describe('deleting rows and columns of its own sheet', () => {
  it('shrinks its source, drops gone fields, and is undone by the inverse', () => {
    const s0 = apply(base(), set(pivot({ columns: [{ col: C(1) }] }))).sheet;
    const rows = apply(s0, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(8)] }] });
    const after = rows.sheet.layout.objects![0] as SheetPivot;
    expect(after.source).toEqual({ r1: R(0), c1: C(0), r2: R(7), c2: C(3) });
    const cols = apply(rows.sheet, { kind: 'layout', changes: [{ k: 'deleteCols', ids: [C(1)] }] });
    const x = cols.sheet.layout.objects![0] as SheetPivot;
    expect(x.columns).toBeUndefined();
    expect(x.rows).toEqual([{ col: C(0) }]);
    const undone = apply(cols.sheet, inverseSheetWrite(rows.sheet, cols));
    expect(undone.sheet.layout.objects).toEqual(rows.sheet.layout.objects);
  });

  it('stays as it is when nothing of it goes', () => {
    const s0 = apply(base(), set(pivot())).sheet;
    const out = apply(s0, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(9)] }] });
    expect(out.sheet.layout.objects).toEqual(s0.layout.objects);
    const undo = inverseSheetWrite(s0, out);
    expect(undo.kind === 'layout' && undo.changes.some((x) => x.k === 'object')).toBe(false);
  });

  it('leaves no source when every cell of it goes', () => {
    const p = pivot({
      source: { r1: R(2), c1: C(0), r2: R(3), c2: C(1) },
      rows: undefined,
      values: undefined,
    });
    const s0 = apply(base(), set(p)).sheet;
    const out = apply(s0, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(2), R(3)] }] });
    expect(out.sheet.layout.objects).toEqual([{ id: 'pivot01', kind: 'pivot', at: p.at }]);
  });

  it('goes with its anchor row or column, and the inverse puts it back', () => {
    const s0 = apply(base(), set(pivot())).sheet;
    const row = apply(s0, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(0)] }] });
    expect(row.sheet.layout.objects).toBeUndefined();
    expect(apply(row.sheet, inverseSheetWrite(s0, row)).sheet.layout.objects).toEqual(
      s0.layout.objects,
    );
    const col = apply(s0, { kind: 'layout', changes: [{ k: 'deleteCols', ids: [C(6)] }] });
    expect(col.sheet.layout.objects).toBeUndefined();
    // One set in its place since is left as it is.
    const since = apply(row.sheet, set(pivot({ at: { r: R(1), c: C(6) } })));
    const back = apply(since.sheet, inverseSheetWrite(s0, row, since.sheet.layout));
    expect(back.sheet.layout.objects).toEqual(since.sheet.layout.objects);
  });

  it('leaves a source on another sheet to that sheet', () => {
    const p = pivot({ source: { r1: R(0), c1: C(0), r2: R(8), c2: C(3), s: 'sheet1xx' } });
    const s0 = apply(base(), set(p)).sheet;
    const out = apply(s0, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(8)] }] });
    expect(out.sheet.layout.objects).toEqual([p]);
  });
});

describe('shrinkPivotSourcesOf', () => {
  const [data, report] = makeSheets({ Data: {}, Report: {} }, { rows: 10, cols: 6 });
  const D = (i: number) => `s0r${i}`;
  const DC = (i: number) => `s0c${i}`;
  const reading = pivot({
    id: 'pivot01',
    at: { r: 's1r0', c: 's1c0' },
    source: { r1: D(0), c1: DC(0), r2: D(5), c2: DC(3), s: data!.id },
    rows: [{ col: DC(1) }],
    values: [{ col: DC(2), summary: 'SUM' }],
  });
  const other = pivot({
    id: 'pivot02',
    at: { r: 's1r0', c: 's1c4' },
    source: { r1: 's1r0', c1: 's1c0', r2: 's1r1', c2: 's1c1' },
  });
  const layout = { ...report!.layout, objects: [reading, other] };

  it('shrinks a pivot table reading the sheet, and drops its gone fields', () => {
    const changes = shrinkPivotSourcesOf(
      data!.id,
      data!.layout,
      [
        { k: 'deleteRows', ids: [D(5)] },
        { k: 'deleteCols', ids: [DC(1)] },
      ],
      layout,
    );
    expect(changes).toEqual(
      [
        {
          k: 'object',
          id: 'pivot01',
          object: {
            ...reading,
            rows: undefined,
            source: { r1: D(0), c1: DC(0), r2: D(4), c2: DC(3), s: data!.id },
          },
        },
      ].map((x) => {
        const { rows: _rows, ...object } = x.object;
        return { ...x, object };
      }),
    );
  });

  it('asks nothing when no pivot table reads the sheet, or nothing of its source goes', () => {
    expect(
      shrinkPivotSourcesOf(data!.id, data!.layout, [{ k: 'deleteRows', ids: [D(9)] }], layout),
    ).toEqual([]);
    expect(
      shrinkPivotSourcesOf(
        data!.id,
        data!.layout,
        [{ k: 'deleteRows', ids: [D(0)] }],
        report!.layout,
      ),
    ).toEqual([]);
    expect(
      shrinkPivotSourcesOf(data!.id, data!.layout, [{ k: 'freeze', rows: 1 } as never], layout),
    ).toEqual([]);
  });

  it('keeps a source gone by one change gone through the next', () => {
    const changes = shrinkPivotSourcesOf(
      data!.id,
      data!.layout,
      [
        { k: 'deleteRows', ids: [0, 1, 2, 3, 4, 5].map(D) },
        { k: 'deleteRows', ids: [D(7)] },
      ],
      layout,
    );
    expect((changes[0] as { object: SheetPivot }).object.source).toBeUndefined();
  });

  it('leaves no source when all of it goes', () => {
    const ids = [0, 1, 2, 3, 4, 5].map(D);
    const [change] = shrinkPivotSourcesOf(
      data!.id,
      data!.layout,
      [{ k: 'deleteRows', ids }],
      layout,
    );
    expect((change as { object: SheetPivot }).object.source).toBeUndefined();
  });
});
