import { describe, expect, it } from 'vitest';
import type { SheetSlicer } from '../objects/sheet-slicer';
import { emptyLayout, type SheetLayout } from '../sheet';
import type { FileLoss } from './workbook-file';
import { fileSlicersOf, slicersFromFile, type FileSlicer } from './file-slicers';
import { readSlicerRecord, slicerRecordEntries } from './slicer-record';

const layout = (): SheetLayout => emptyLayout(Math.random, 10, 5);

const slicer = (l: SheetLayout, extra: Partial<SheetSlicer> = {}): SheetSlicer => ({
  id: 's1',
  kind: 'slicer',
  at: { r: l.rows[1]!, c: l.cols[4]!, dx: 3, dy: 4 },
  width: 220,
  height: 60,
  range: { r1: l.rows[0]!, c1: l.cols[0]!, r2: l.rows[5]!, c2: l.cols[2]! },
  col: l.cols[1]!,
  ...extra,
});

let n = 0;
const rand = () => (n = (n * 9301 + 49297) % 233280) / 233280;

const making = (losses: FileLoss[] = []) => ({ sheet: 'Data', rand, losses });

describe('fileSlicersOf', () => {
  it('places each slicer by position, every field kept', () => {
    const l = layout();
    const s = slicer(l, { filter: { values: ['a'] }, title: 'Pick', pivots: false });
    expect(fileSlicersOf({ ...l, objects: [s] })).toEqual([
      {
        at: { r: 1, c: 4, dx: 3, dy: 4 },
        width: 220,
        height: 60,
        range: { r1: 0, c1: 0, r2: 5, c2: 2 },
        c: 1,
        filter: { values: ['a'] },
        title: 'Pick',
        pivots: false,
      },
    ]);
  });

  it('leaves out a range or column a delete took', () => {
    const l = layout();
    const s = slicer(l, { range: undefined, col: undefined });
    expect(fileSlicersOf({ ...l, objects: [s] })).toEqual([
      { at: { r: 1, c: 4, dx: 3, dy: 4 }, width: 220, height: 60 },
    ]);
  });
});

describe('the slicer record', () => {
  it('round trips every field', () => {
    const file: FileSlicer[] = [
      {
        at: { r: 1, c: 4, dx: 3, dy: 4 },
        width: 220,
        height: 60,
        range: { r1: 0, c1: 0, r2: 5, c2: 2 },
        c: 1,
        filter: { op: 'gt', a: '2' },
        title: 'Pick',
        pivots: false,
        name: 'Slicer_1',
      },
      { at: { r: 0, c: 0, dx: 0, dy: 0 }, width: 200, height: 40 },
    ];
    const text = JSON.stringify({ slicers: slicerRecordEntries(file) });
    expect(readSlicerRecord(text)).toEqual({ slicers: file, unread: 0 });
  });

  it('counts an entry it cannot read, keeping the others', () => {
    const text = JSON.stringify({
      slicers: [
        { at: 'B2', dx: 0, dy: 0, width: 200, height: 40 },
        { at: 'B2', dx: 0, dy: 0, width: 200, height: 40, filter: { op: 'formula', fx: '=1' } },
        { at: 'nowhere', width: 200, height: 40 },
        'nonsense',
      ],
    });
    expect(readSlicerRecord(text)).toEqual({
      slicers: [{ at: { r: 1, c: 1, dx: 0, dy: 0 }, width: 200, height: 40 }],
      unread: 3,
    });
  });

  it('reads none from a record without slicers or that does not parse', () => {
    expect(readSlicerRecord('{"filter":{}}')).toEqual({ slicers: [], unread: 0 });
    expect(readSlicerRecord('{')).toEqual({ slicers: [], unread: 0 });
    expect(readSlicerRecord('{"slicers":3}')).toEqual({ slicers: [], unread: 1 });
  });
});

describe('slicersFromFile', () => {
  it('makes each slicer on the grid with a fresh id', () => {
    const l = layout();
    const [made] = slicersFromFile(
      [
        {
          at: { r: 1, c: 4, dx: 3, dy: 4 },
          width: 220,
          height: 60,
          range: { r1: 0, c1: 0, r2: 5, c2: 2 },
          c: 1,
          filter: { values: ['a'] },
          title: 'Pick',
          pivots: false,
        },
      ],
      l,
      making(),
      new Set(),
    );
    expect(made).toEqual({
      ...slicer(l, { filter: { values: ['a'] }, title: 'Pick', pivots: false }),
      id: made!.id,
    });
  });

  it('cuts its range to the grid, clamps its size and drops a column outside its range', () => {
    const l = layout();
    const [made] = slicersFromFile(
      [
        {
          at: { r: 1, c: 4, dx: 9000, dy: 0 },
          width: 5,
          height: 9000,
          range: { r1: 2, c1: 1, r2: 50, c2: 3 },
          c: 0,
        },
      ],
      l,
      making(),
      new Set(),
    );
    expect(made).toMatchObject({
      at: { dx: 2000, dy: 0 },
      width: 100,
      height: 2000,
      range: { r1: l.rows[2], c1: l.cols[1], r2: l.rows[9], c2: l.cols[3] },
    });
    expect(made!.col).toBeUndefined();
  });

  it('names a slicer placed past the grid, and those past 50 a sheet', () => {
    const losses: FileLoss[] = [];
    const one: FileSlicer = { at: { r: 0, c: 0, dx: 0, dy: 0 }, width: 200, height: 40 };
    const made = slicersFromFile(
      [{ ...one, at: { r: 99, c: 0, dx: 0, dy: 0 } }, ...Array.from({ length: 51 }, () => one)],
      layout(),
      making(losses),
      new Set(),
    );
    expect(made).toHaveLength(50);
    expect(new Set(made.map((x) => x.id)).size).toBe(50);
    expect(losses).toEqual([
      { k: 'slicer_unread', sheet: 'Data' },
      { k: 'slicer_unread', sheet: 'Data' },
    ]);
  });

  it('drops a range starting past the grid with its column', () => {
    const l = layout();
    const [made] = slicersFromFile(
      [
        {
          at: { r: 0, c: 0, dx: 0, dy: 0 },
          width: 200,
          height: 40,
          range: { r1: 20, c1: 0, r2: 30, c2: 1 },
          c: 0,
        },
      ],
      l,
      making(),
      new Set(),
    );
    expect(made!.range).toBeUndefined();
    expect(made!.col).toBeUndefined();
  });
});
