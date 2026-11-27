// docs/specs/029-sheets/standard-mapping.md "Filters in the file": a sheet's filter and views as a file holds them,
// LiveDoc's record read back only whole, and the filter and views a file's sheet makes on its grid.
import { describe, expect, it } from 'vitest';
import { book, gridLayout } from '../testing/book';
import type { SheetLayout } from '../sheet';
import { fileFiltersOf, filtersFromFile, type FileFilterView } from './file-filters';
import { filterRecordText, filtersFound, readFilterRecord } from './filter-record';
import type { FileLoss } from './workbook-file';

let n = 3;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const DATES = { locale: 'en-GB', today: 46000 };

describe('fileFiltersOf', () => {
  it('leaves out a filter or view whose cells are gone, a condition past its range, a sort key gone', () => {
    const { wb, sheets } = book({ A1: 'x' });
    const sheet = sheets[0]!;
    const ctx = wb.ctxFor(sheet.id);
    const [r0, r1] = sheet.layout.rows;
    const [c0, c1, c2] = sheet.layout.cols;
    const layout: SheetLayout = {
      ...sheet.layout,
      filter: {
        r1: r0!,
        c1: c0!,
        r2: r1!,
        c2: c1!,
        conds: { [c2!]: { op: 'empty' }, [c0!]: { op: 'notEmpty' }, gone: { op: 'empty' } },
      },
      filterViews: [
        { id: 'aaaa', title: 'Gone', r1: 'gone', c1: c0!, r2: r1!, c2: c1!, conds: {} },
        {
          id: 'bbbb',
          title: 'Kept',
          r1: r0!,
          c1: c0!,
          r2: r1!,
          c2: c1!,
          conds: {},
          sort: [{ c: 'gone' }, { c: c1! }],
        },
      ],
    };
    const out = fileFiltersOf(layout, new Set([r1!]), ctx, DATES);
    expect(out.filter).toEqual({
      range: { r1: 0, c1: 0, r2: 1, c2: 1 },
      cols: [{ c: 0, cond: { op: 'notEmpty' }, std: { tests: [{ op: 'notEmpty', v: '' }] } }],
      hidden: [1],
    });
    expect(out.filterViews).toEqual([
      {
        name: 'Kept',
        key: 'bbbb',
        range: { r1: 0, c1: 0, r2: 1, c2: 1 },
        cols: [],
        sort: [{ c: 1 }],
      },
    ]);
    expect(
      fileFiltersOf(
        { ...layout, filter: { ...layout.filter!, r1: 'gone' }, filterViews: [] },
        new Set(),
        ctx,
        DATES,
      ),
    ).toEqual({});
  });
});

describe('readFilterRecord', () => {
  it('reads a record whole', () => {
    const text = filterRecordText(
      {
        range: { r1: 0, c1: 0, r2: 4, c2: 1 },
        cols: [{ c: 1, cond: { op: 'gt', a: '2' } }],
        hidden: [2],
      },
      [
        {
          name: 'V',
          range: { r1: 0, c1: 0, r2: 4, c2: 1 },
          cols: [],
          sort: [{ c: 1, desc: true }],
        },
      ],
    );
    expect(readFilterRecord(text)).toEqual({
      filter: {
        range: { r1: 0, c1: 0, r2: 4, c2: 1 },
        conds: new Map([[1, { op: 'gt', a: '2' }]]),
        hidden: [2],
      },
      views: [
        {
          name: 'V',
          range: { r1: 0, c1: 0, r2: 4, c2: 1 },
          conds: new Map(),
          sort: [{ c: 1, desc: true }],
        },
      ],
    });
    expect(readFilterRecord('{}')).toEqual({ views: [] });
  });

  it('refuses a record that is not whole', () => {
    const filter = (f: unknown) => JSON.stringify({ filter: f });
    const view = (v: unknown) => JSON.stringify({ views: [v] });
    const range = 'A1:B5';
    for (const text of [
      'not json',
      '[]',
      filter('x'),
      filter({ range: 'nope', conds: {} }),
      filter({ range, conds: 'x' }),
      filter({ range, conds: { C: { op: 'empty' } } }),
      filter({ range, conds: { '1': { op: 'empty' } } }),
      filter({ range, conds: { A: { op: 'nope' } } }),
      filter({ range, conds: { A: { op: 'empty', fx: '=A2' } } }),
      filter({ range, conds: { A: { op: 'formula' } } }),
      filter({ range, conds: { A: { op: 'formula', fx: '=A2', colour: 'red' } } }),
      filter({ range, conds: {}, hidden: 'x' }),
      filter({ range, conds: {}, hidden: [1] }),
      filter({ range, conds: {}, hidden: [6] }),
      JSON.stringify({ views: 'x' }),
      view('x'),
      view({ name: 'V', range: 'nope', conds: {} }),
      view({ name: 'V', range, conds: { Z: {} } }),
      view({ name: 'V', range, conds: {}, sort: 'x' }),
      view({ name: 'V', range, conds: {}, sort: [{ c: 1 }] }),
      view({ name: 'V', range, conds: {}, sort: [{ c: '1' }] }),
      view({ name: 'V', range, conds: {}, sort: [{ c: 'A', desc: false }] }),
    ])
      expect(readFilterRecord(text), text).toBeNull();
    expect(
      readFilterRecord(
        filter({ range, conds: { A: { op: 'formula', fx: '=A2>1' } } }),
      )?.filter?.conds.get(0),
    ).toEqual({
      op: 'formula',
      fx: '=A2>1',
    });
  });
});

describe('filtersFound', () => {
  const standard = { filter: { range: { r1: 0, c1: 0, r2: 3, c2: 1 }, cols: [] }, views: [] };
  const held = <T>(x: T) => x;

  it('drops a record that does not parse or does not match the standard form', () => {
    expect(filtersFound(standard, { text: 'x', fingerprint: undefined }, held).changed).toBe(true);
    const text = filterRecordText(undefined, []);
    expect(filtersFound(standard, { text, fingerprint: 'f' }, held).changed).toBe(true);
    expect(filtersFound(standard, undefined, held)).toEqual({ ...standard, changed: false });
  });
});

describe('filtersFromFile', () => {
  const layout = gridLayout('t', 5, 3);
  const making = (losses: FileLoss[]) => {
    const { wb, sheets } = book({ A1: 'x' });
    return { sheet: 'S', rand, losses, ctx: wb.ctxFor(sheets[0]!.id) };
  };

  it('names a filter past the grid, a column past it and views it cannot hold', () => {
    const losses: FileLoss[] = [];
    const view = (name: string, r1 = 0): FileFilterView => ({
      name,
      range: { r1, c1: 0, r2: 9, c2: 9 },
      cols: [],
    });
    const out = filtersFromFile(
      {
        filter: {
          range: { r1: 0, c1: 1, r2: 9, c2: 9 },
          cols: [{ c: 7, std: { values: ['a'] } }, { c: 1 }],
        },
        filterViews: [
          view(' '),
          view('Off', 50),
          ...Array.from({ length: 51 }, (_, i) => view(`V${i}`)),
        ],
      },
      layout,
      making(losses),
    );
    expect(out.filter).toEqual({ r1: 'tr0', c1: 'tc1', r2: 'tr4', c2: 'tc2', conds: {} });
    expect(losses).toEqual([
      { k: 'filter_unread', sheet: 'S', r: 0, c: 7 },
      { k: 'filter_unread', sheet: 'S', r: 0, c: 1 },
      { k: 'filter_view_unread', sheet: 'S', name: 'Off' },
      { k: 'filter_view_unread', sheet: 'S', name: 'V49' },
      { k: 'filter_view_unread', sheet: 'S', name: 'V50' },
    ]);
    expect(out.filterViews).toHaveLength(50);
    expect(out.filterViews![0]!.title).toBe('Filter 1');
    const past: FileLoss[] = [];
    filtersFromFile(
      { filter: { range: { r1: 9, c1: 0, r2: 12, c2: 1 }, cols: [] } },
      layout,
      making(past),
    );
    expect(past).toEqual([{ k: 'filter_unread', sheet: 'S', r: 9, c: 0 }]);
  });

  it('names a Custom Formula Is it cannot compile', () => {
    const losses: FileLoss[] = [];
    const out = filtersFromFile(
      {
        filter: {
          range: { r1: 0, c1: 0, r2: 4, c2: 1 },
          cols: [{ c: 0, cond: { op: 'formula', fx: '=(' } }],
        },
      },
      layout,
      making(losses),
    );
    expect(out.filter!.conds).toEqual({});
    expect(losses).toEqual([{ k: 'filter_unread', sheet: 'S', r: 0, c: 0 }]);
  });
});
