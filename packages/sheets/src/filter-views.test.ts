import { describe, expect, it } from 'vitest';
import {
  createFilterView,
  FILTER_VIEW_TITLE_MAX,
  FILTER_VIEWS_MAX,
  filterViewOf,
  isSheetFilterView,
  nextFilterViewTitle,
  saveFilterAsView,
  type SheetFilterView,
} from './filter-views';
import { applyLayoutChange } from './store-layout';
import { inverseLayoutChanges } from './store';
import { validateWrite } from './validate';
import { book } from './testing/book';
import { columnValueCounts, filteredOutRows } from './filter';
import { columnColours } from './filter-colours';
import { idRangeOf } from './layout';
import type { Grid } from './selection';

const seeded = (seed = 7) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

const view = (over: Partial<SheetFilterView> = {}): SheetFilterView => ({
  id: 'fvaa',
  title: 'Filter 1',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r4',
  c2: 's0c1',
  conds: {},
  ...over,
});

function gridOf(b: ReturnType<typeof book>, sheetId: string): Grid {
  const sheet = b.sheets.find((x) => x.id === sheetId)!;
  return {
    rows: sheet.layout.rows.length,
    cols: sheet.layout.cols.length,
    hiddenRow: () => false,
    hiddenCol: () => false,
    filled: (r, c) => {
      const v = b.wb.value(sheetId, r, c);
      return v !== null && v !== '';
    },
    mergeAt: () => null,
  };
}

describe('isSheetFilterView', () => {
  it('accepts a whole view of its id', () => {
    expect(isSheetFilterView(view({ sort: [{ c: 's0c1', desc: true }] }), 'fvaa')).toBe(true);
  });

  it('refuses another id, a stray key, an empty or long title, a bad condition and a bad sort', () => {
    expect(isSheetFilterView(view(), 'fvbb')).toBe(false);
    expect(isSheetFilterView({ ...view(), x: 1 }, 'fvaa')).toBe(false);
    expect(isSheetFilterView(view({ title: '  ' }), 'fvaa')).toBe(false);
    expect(isSheetFilterView(view({ title: 'x'.repeat(FILTER_VIEW_TITLE_MAX + 1) }), 'fvaa')).toBe(
      false,
    );
    expect(isSheetFilterView(view({ conds: { s0c0: { op: 'nope' } as never } }), 'fvaa')).toBe(
      false,
    );
    expect(isSheetFilterView(view({ sort: [] }), 'fvaa')).toBe(false);
    expect(isSheetFilterView(view({ sort: [{ c: 's0c1', desc: false as never }] }), 'fvaa')).toBe(
      false,
    );
  });
});

describe('nextFilterViewTitle', () => {
  it('takes the smallest free number', () => {
    expect(nextFilterViewTitle([], 'Filter')).toBe('Filter 1');
    expect(nextFilterViewTitle(['Filter 1', 'filter 3'], 'Filter')).toBe('Filter 2');
    expect(nextFilterViewTitle(['Filter 1'], 'Temporary Filter')).toBe('Temporary Filter 1');
  });
});

describe('createFilterView', () => {
  it('copies the filter when the sheet has one', () => {
    const wb = book({ S: { A1: 'Fruit', B1: 'Count', A2: 'apple', B2: '3' } });
    const sheet = wb.sheets[0]!;
    const filter = {
      ...idRangeOf(sheet.layout, 0, 0, 1, 1)!,
      conds: { s0c1: { op: 'gt' as const, a: '2' } },
    };
    const layout = applyLayoutChange(sheet.layout, { k: 'filter', filter });
    const made = createFilterView(layout, { r1: 5, c1: 5, r2: 5, c2: 5 }, gridOf(wb, sheet.id), {
      rand: seeded(),
      prefix: 'Filter',
      taken: [],
    });
    expect(made).toMatchObject({ title: 'Filter 1', r1: 's0r0', r2: 's0r1', conds: filter.conds });
  });

  it('takes the filled block around the selection without a filter', () => {
    const wb = book({ S: { A1: 'Fruit', B1: 'Count', A2: 'apple', B2: '3', A3: 'pear', B3: '8' } });
    const sheet = wb.sheets[0]!;
    const made = createFilterView(
      sheet.layout,
      { r1: 1, c1: 0, r2: 1, c2: 0 },
      gridOf(wb, sheet.id),
      {
        rand: seeded(),
        prefix: 'Temporary Filter',
        taken: ['Temporary Filter 1'],
      },
    );
    expect(made).toMatchObject({
      title: 'Temporary Filter 2',
      r1: 's0r0',
      c1: 's0c0',
      r2: 's0r2',
      c2: 's0c1',
      conds: {},
    });
  });
});

describe('saveFilterAsView', () => {
  it('makes a view of the filter, or nothing without one', () => {
    const wb = book({ S: { A1: 'x' } });
    const sheet = wb.sheets[0]!;
    expect(saveFilterAsView(sheet.layout, seeded())).toBeNull();
    const filter = { ...idRangeOf(sheet.layout, 0, 0, 3, 0)!, conds: { s0c0: { values: ['x'] } } };
    const layout = applyLayoutChange(sheet.layout, { k: 'filter', filter });
    expect(saveFilterAsView(layout, seeded())).toMatchObject({
      title: 'Filter 1',
      conds: filter.conds,
    });
  });
});

describe('the fview layout change', () => {
  it('sets, replaces and removes a view, its inverse putting it back', () => {
    const wb = book({ S: {} });
    const layout = wb.sheets[0]!.layout;
    const set = applyLayoutChange(layout, { k: 'fview', id: 'fvaa', view: view() });
    expect(set.filterViews).toEqual([view()]);
    const renamed = applyLayoutChange(set, {
      k: 'fview',
      id: 'fvaa',
      view: view({ title: 'Big' }),
    });
    expect(renamed.filterViews?.map((x) => x.title)).toEqual(['Big']);
    expect(
      inverseLayoutChanges(
        set,
        [{ k: 'fview', id: 'fvaa', view: view({ title: 'Big' }) }],
        renamed,
      ),
    ).toEqual([{ k: 'fview', id: 'fvaa', view: view() }]);
    const gone = applyLayoutChange(renamed, { k: 'fview', id: 'fvaa', view: null });
    expect(gone.filterViews).toBeUndefined();
    expect(filterViewOf(set, 'fvaa')).toEqual(view());
  });

  it('shrinks a view as rows and columns go, dropping a gone column condition and sort key', () => {
    const wb = book({ S: {} });
    const layout = applyLayoutChange(wb.sheets[0]!.layout, {
      k: 'fview',
      id: 'fvaa',
      view: view({ conds: { s0c1: { op: 'empty' } }, sort: [{ c: 's0c1' }] }),
    });
    const after = applyLayoutChange(layout, { k: 'deleteCols', ids: ['s0c1'] });
    expect(after.filterViews).toEqual([view({ c2: 's0c0' })]);
    const none = applyLayoutChange(after, { k: 'deleteCols', ids: ['s0c0'] });
    expect(none.filterViews).toBeUndefined();
  });

  it('validates the write and caps the views a sheet holds', () => {
    const wb = book({ S: {} });
    const sheet = wb.sheets[0]!;
    const write = (v: unknown, id = 'fvaa') => ({
      kind: 'layout' as const,
      changes: [{ k: 'fview' as const, id, view: v as SheetFilterView }],
    });
    expect(validateWrite(sheet, write(view())).ok).toBe(true);
    expect(validateWrite(sheet, write(null)).ok).toBe(true);
    expect(validateWrite(sheet, write({ ...view(), title: '' })).ok).toBe(false);
    let layout = sheet.layout;
    for (let i = 0; i < FILTER_VIEWS_MAX; i++)
      layout = applyLayoutChange(layout, {
        k: 'fview',
        id: `fv${i}x`,
        view: view({ id: `fv${i}x` }),
      });
    const full = { ...sheet, layout };
    expect(validateWrite(full, write(view({ id: 'fvnew' }), 'fvnew')).ok).toBe(false);
    expect(validateWrite(full, write(view({ id: 'fv0x', title: 'B' }), 'fv0x')).ok).toBe(true);
  });
});

describe('a view drawn in place of the filter', () => {
  it('hides, counts and colours by the view given, the sheet filter left aside', () => {
    const b = book({ S: { A1: 'Fruit', B1: 'Count', A2: 'apple', B2: '3', A3: 'pear', B3: '8' } });
    const sheet = b.sheets[0]!;
    const filter = {
      ...idRangeOf(sheet.layout, 0, 0, 2, 1)!,
      conds: { s0c1: { op: 'gt' as const, a: '5' } },
    };
    const withFilter = {
      ...sheet,
      layout: applyLayoutChange(sheet.layout, { k: 'filter', filter }),
    };
    b.wb.updateSheet(withFilter, []);
    expect([...filteredOutRows(b.wb, sheet.id)]).toEqual(['s0r1']);
    const v = view({ r2: 's0r2', conds: { s0c0: { values: ['apple'] } } });
    expect([...filteredOutRows(b.wb, sheet.id, v)]).toEqual(['s0r2']);
    expect(columnValueCounts(b.wb, sheet.id, 's0c0', v).map((x) => x.text)).toEqual([
      'apple',
      'pear',
    ]);
    expect(columnColours(b.wb, sheet.id, 's0c0', 'bg', v)).toEqual([]);
    expect([...filteredOutRows(b.wb, sheet.id, null)]).toEqual([]);
  });
});
