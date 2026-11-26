// A sheet's objects (docs/specs/029-sheets/charts.md "The model"; sheet-store.md "Objects"): what a chart may be, the
// layout write that sets or removes one, its undo, what deleting rows and columns does to it, and the cap.
import { describe, expect, it } from 'vitest';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import { makeSheets } from '../testing/book';
import type { Sheet } from '../sheet';
import {
  SHEET_CHART_TYPES,
  SHEET_OBJECTS_MAX,
  isSheetObject,
  type SheetChart,
} from './sheet-objects';

const by = { id: 'p', name: 'P', color: '#000000' };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const apply = (s: Sheet, w: SheetWrite) => applySheetWrite(s, w, { now: 1, by });
const chart = (x: Partial<SheetChart> = {}): SheetChart => ({
  id: 'chart01',
  kind: 'chart',
  at: { r: R(1), c: C(4), dx: 0, dy: 0 },
  width: 420,
  height: 280,
  type: 'scatter',
  range: { r1: R(0), c1: C(0), r2: R(5), c2: C(2) },
  ...x,
});
const set = (o: SheetChart | null, id = o?.id ?? 'chart01'): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'object', id, object: o }],
});
const base = () => makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 8 })[0]!;

describe('what a chart may be', () => {
  it('takes every built type, its look, titles and series looks by column id', () => {
    for (const type of SHEET_CHART_TYPES)
      expect(isSheetObject(chart({ type }), 'chart01')).toBe(true);
    const full = chart({
      cols: [C(0), C(2)],
      palette: 'vivid',
      legend: 'none',
      values: true,
      axis: false,
      stack: 'percent',
      title: 'Value',
      xTitle: 'Cost',
      yTitle: 'Index',
      alt: 'Cost against index',
      series: { [C(2)]: { color: '#3366cc', line: true, right: true } },
      kept: { part: 'xl/charts/chart1.xml', sum: '0a1b2c3d' },
    });
    expect(isSheetObject(full, 'chart01')).toBe(true);
  });

  it('refuses another id, a kind not built, unknown keys and anything past its bounds', () => {
    const no = (x: unknown) => expect(isSheetObject(x, 'chart01')).toBe(false);
    no(chart({ id: 'other1' }));
    no({ ...chart(), kind: 'pivot' });
    no({ ...chart(), extra: 1 });
    no(chart({ width: 159 }));
    no(chart({ height: 2001 }));
    no({ ...chart(), type: 'treemap' });
    no(chart({ at: { r: 'X', c: C(0), dx: 0, dy: 0 } }));
    no(chart({ at: { r: R(0), c: C(0), dx: -1, dy: 0 } }));
    no(chart({ cols: [] }));
    no(chart({ cols: [C(0), C(0)] }));
    no(chart({ title: 'x'.repeat(201) }));
    no(chart({ alt: 'x'.repeat(1001) }));
    no({ ...chart(), legend: 'middle' });
    no({ ...chart(), axis: true });
    no({ ...chart(), stack: 'none' });
    no(chart({ series: { [C(1)]: { color: 'red' } } }));
    no(chart({ series: { [C(1)]: { line: false as unknown as true } } }));
    no(chart({ kept: { part: '', sum: '0a1b2c3d' } }));
    no(chart({ kept: { part: 'x'.repeat(201), sum: '0a1b2c3d' } }));
    no(chart({ kept: { part: 'p', sum: 'XYZ' } }));
    no({ ...chart(), kept: { part: 'p', sum: '0a1b2c3d', more: 1 } });
    no({ ...chart(), kept: { part: 1, sum: 2 } });
    no({ ...chart(), kept: 'p' });
  });
});

describe('setting and removing a chart', () => {
  it('sets one on top, replaces it in place, removes it, each undone by its inverse', () => {
    const s0 = base();
    const one = apply(s0, set(chart()));
    expect(one.sheet.layout.objects).toEqual([chart()]);
    const two = apply(one.sheet, set(chart({ id: 'chart02' })));
    const moved = apply(two.sheet, set(chart({ width: 500 })));
    expect(moved.sheet.layout.objects!.map((x) => [x.id, x.width])).toEqual([
      ['chart01', 500],
      ['chart02', 420],
    ]);
    const back = apply(moved.sheet, inverseSheetWrite(two.sheet, moved));
    expect(back.sheet.layout.objects).toEqual(two.sheet.layout.objects);
    const gone = apply(back.sheet, set(null, 'chart01'));
    expect(gone.sheet.layout.objects!.map((x) => x.id)).toEqual(['chart02']);
    const none = apply(gone.sheet, set(null, 'chart02'));
    expect(none.sheet.layout.objects).toBeUndefined();
    const undone = apply(none.sheet, inverseSheetWrite(gone.sheet, none));
    expect(undone.sheet.layout.objects!.map((x) => x.id)).toEqual(['chart02']);
  });

  it('refuses a chart that is not one, and one past the cap of a sheet', () => {
    const s = base();
    expect(validateWrite(s, set(chart({ width: 10 })))).toMatchObject({
      ok: false,
      error: 'write_invalid',
    });
    expect(validateWrite(s, set(chart()))).toEqual({ ok: true });
    let full = s;
    const many: SheetChart[] = Array.from({ length: SHEET_OBJECTS_MAX }, (_, i) =>
      chart({ id: `chart${String(i).padStart(3, '0')}` }),
    );
    full = { ...full, layout: { ...full.layout, objects: many } };
    expect(validateWrite(full, set(chart({ id: 'chartzz' })))).toMatchObject({
      ok: false,
      error: 'objects_full',
    });
    expect(validateWrite(full, set(chart({ id: 'chart000', width: 300 })))).toEqual({ ok: true });
  });
});

describe('deleting rows and columns under a chart', () => {
  it('shrinks its range, drops gone columns and looks, and moves its anchor to the next row', () => {
    const s0 = apply(
      base(),
      set(
        chart({
          cols: [C(0), C(2)],
          series: { [C(2)]: { line: true }, [C(1)]: { color: '#112233' } },
        }),
      ),
    ).sheet;
    const rows = apply(s0, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(1), R(5)] }] });
    const after = rows.sheet.layout.objects![0]!;
    expect(after.range).toEqual({ r1: R(0), c1: C(0), r2: R(4), c2: C(2) });
    expect(after.at.r).toBe(R(2));
    const cols = apply(rows.sheet, {
      kind: 'layout',
      changes: [{ k: 'deleteCols', ids: [C(1), C(4)] }],
    });
    const x = cols.sheet.layout.objects![0]!;
    expect(x.series).toEqual({ [C(2)]: { line: true } });
    expect(x.at.c).toBe(C(5));
    const undone = apply(cols.sheet, inverseSheetWrite(rows.sheet, cols));
    expect(undone.sheet.layout.objects).toEqual(rows.sheet.layout.objects);
  });

  it('leaves no data when every cell or every picked column of it goes, and anchors on the row before at the end', () => {
    const s0 = apply(
      base(),
      set(chart({ at: { r: R(9), c: C(7), dx: 4, dy: 6 }, cols: [C(1)] })),
    ).sheet;
    const gone = apply(s0, { kind: 'layout', changes: [{ k: 'deleteCols', ids: [C(1), C(7)] }] });
    const x = gone.sheet.layout.objects![0]!;
    expect(x.range).toBeUndefined();
    expect(x.cols).toBeUndefined();
    expect(x.at).toEqual({ r: R(9), c: C(6), dx: 4, dy: 6 });
    const end = apply(gone.sheet, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(9)] }] });
    expect(end.sheet.layout.objects![0]!.at.r).toBe(R(8));
  });
});
