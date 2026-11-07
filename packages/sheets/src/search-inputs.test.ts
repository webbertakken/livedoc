import { describe, expect, it } from 'vitest';
import type { SheetJson } from './sheet-json';
import { sheetSearchInputs } from './search-inputs';

// A Sheet tab's part of its content search text (docs/specs/013-workspace/content-search.md
// "tabSearchText"): the inputs of its sheets' cells that are not formulas, row-major.

function sheet(
  id: string,
  cells: SheetJson['cells'],
  rows = ['r1', 'r2'],
  cols = ['c1', 'c2'],
): SheetJson {
  return {
    id,
    tabId: 't',
    title: id,
    layout: { rows, cols },
    cells,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    updatedBy: { id: '', name: '', color: '' },
  };
}

describe('sheetSearchInputs', () => {
  it('reads each sheet row by row, in layout order', () => {
    const s = sheet(
      's',
      [
        { r: 'r2', c: 'c1', i: { s: 'third' } },
        { r: 'r1', c: 'c2', i: { n: 42 } },
        { r: 'r1', c: 'c1', i: { s: 'first' } },
      ],
      ['r1', 'r2'],
    );
    expect(sheetSearchInputs([s])).toEqual(['first', '42', 'third']);
  });

  it('skips formulas, empty cells and cells outside the layout, and reads booleans as TRUE or FALSE', () => {
    const s = sheet('s', [
      { r: 'r1', c: 'c1', i: { f: { src: '=1+1' } } as never },
      { r: 'r1', c: 'c2', i: { b: true } },
      { r: 'r2', c: 'c1' },
      { r: 'r2', c: 'c2', i: { s: '' } },
      { r: 'gone', c: 'c1', i: { s: 'orphan' } },
    ]);
    expect(sheetSearchInputs([s])).toEqual(['TRUE']);
  });

  it('takes the sheets in the order given', () => {
    const a = sheet('a', [{ r: 'r1', c: 'c1', i: { s: 'A' } }]);
    const b = sheet('b', [{ r: 'r1', c: 'c1', i: { s: 'B' } }]);
    expect(sheetSearchInputs([b, a])).toEqual(['B', 'A']);
  });
});
