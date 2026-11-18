// docs/specs/029-sheets/sheet-store.md "What a sheet is": cells from the wire, into the compact store.
import { describe, expect, it } from 'vitest';
import { cellsFromJson, type SheetCellJson } from './sheet-json';

describe('cellsFromJson', () => {
  it('holds each cell with an input or a format, and skips the empty', () => {
    const cells = cellsFromJson([
      { r: 'r1', c: 'c1', i: { n: 1 } },
      { r: 'r1', c: 'c2', f: { b: true } },
      { r: 'r1', c: 'c3', i: { s: 'x' }, f: { i: true } },
      { r: 'r1', c: 'c4' },
      { r: 'r1', c: 'c5', i: null, f: { u: true } } as unknown as SheetCellJson,
    ]);
    expect([...cells]).toEqual([
      ['r1:c1', { input: { n: 1 } }],
      ['r1:c2', { format: { b: true } }],
      ['r1:c3', { input: { s: 'x' }, format: { i: true } }],
      ['r1:c5', { format: { u: true } }],
    ]);
  });

  it("holds a cell not of a cell's shape as sent, for validation to refuse", () => {
    const odd = [
      { r: 'r1', c: 'c1', i: 5 },
      { r: 'r1', c: 'c2', f: 'bold' },
      { r: 'r1', c: 'c3', i: { x: 1 }, f: { b: true } },
    ] as unknown as SheetCellJson[];
    expect([...cellsFromJson(odd)]).toEqual([
      ['r1:c1', { input: 5 }],
      ['r1:c2', { format: 'bold' }],
      ['r1:c3', { input: { x: 1 }, format: { b: true } }],
    ]);
  });
});
