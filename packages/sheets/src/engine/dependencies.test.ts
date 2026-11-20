// formulas.md "Recalculation": who reads what, by cell number, so a change finds only its readers.
import { describe, expect, it } from 'vitest';
import { NO_CELL } from './cell-numbers';
import { Dependencies } from './dependencies';

const readers = (deps: Dependencies, cell: number, sheet: number, r: number, c: number) => {
  const out = new Set<number>();
  deps.readersOf(cell, sheet, r, c, out);
  return [...out].sort((a, b) => a - b);
};

describe('Dependencies', () => {
  it('finds the readers of a cell read one by one, once each however often it was read', () => {
    const deps = new Dependencies();
    deps.noteCell(1, 10);
    deps.noteCell(1, 10);
    deps.noteCell(2, 10);
    deps.noteCell(3, 11);
    expect(readers(deps, 10, 0, 0, 0)).toEqual([1, 2]);
    deps.clear(1);
    expect(readers(deps, 10, 0, 0, 0)).toEqual([2]);
    deps.clear(2);
    expect(readers(deps, 10, 0, 0, 0)).toEqual([]);
    expect(readers(deps, 11, 0, 0, 0)).toEqual([3]);
    expect(readers(deps, NO_CELL, 0, 0, 0)).toEqual([]);
    expect(readers(deps, 50_000, 0, 0, 0)).toEqual([]);
  });

  it('unlinks a reader from the middle of a cell’s readers', () => {
    const deps = new Dependencies();
    for (const reader of [1, 2, 3]) deps.noteCell(reader, 9);
    deps.clear(2);
    expect(readers(deps, 9, 0, 0, 0)).toEqual([1, 3]);
    deps.noteCell(4, 9);
    expect(readers(deps, 9, 0, 0, 0)).toEqual([1, 3, 4]);
  });

  it('finds the readers of a range by sheet and position, and forgets them', () => {
    const deps = new Dependencies();
    deps.noteRange(1, 0, 0, 0, 9, 1);
    deps.noteRange(2, 1, 0, 0, 9, 1);
    deps.noteRange(3, 0, 5, 1, 6, 1);
    expect(readers(deps, NO_CELL, 0, 5, 1)).toEqual([1, 3]);
    expect(readers(deps, NO_CELL, 0, 10, 1)).toEqual([]);
    expect(readers(deps, NO_CELL, 1, 0, 0)).toEqual([2]);
    expect(readers(deps, NO_CELL, 2, 0, 0)).toEqual([]);
    expect(readers(deps, NO_CELL, 0, 0, 5)).toEqual([]);
    deps.clear(1);
    expect(readers(deps, NO_CELL, 0, 5, 1)).toEqual([3]);
    expect(readers(deps, NO_CELL, 0, 0, 0)).toEqual([]);
  });

  it('reuses what it forgot, edges and ranges alike, through thousands of changes', () => {
    const deps = new Dependencies();
    for (let round = 0; round < 3; round++) {
      for (let reader = 1; reader <= 3_000; reader++) {
        deps.clear(reader);
        deps.noteCell(reader, reader + 10_000);
        deps.noteRange(reader, 0, reader, 0, reader + 1, 2);
      }
    }
    expect(readers(deps, 12_000, 0, 0, 0)).toEqual([2_000]);
    expect(readers(deps, NO_CELL, 0, 2_000, 1)).toEqual([1_999, 2_000]);
    for (let reader = 1; reader <= 3_000; reader++) deps.clear(reader);
    expect(readers(deps, NO_CELL, 0, 2_000, 1)).toEqual([]);
    deps.clear(70_000);
  });
});
