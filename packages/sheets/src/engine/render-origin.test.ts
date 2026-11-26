// A window that starts past A1 (docs/specs/029-sheets/sheet-store.md "Agents in a spreadsheet", previews of a range):
// its rows and columns from the origin, labelled as the sheet labels them, with no frozen panes.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { renderWindow } from './render';

describe('renderWindow from an origin', () => {
  it('starts at the origin, labelled as the sheet labels it', () => {
    const b = book({ A1: 'top', C3: 'mid', D4: 'far' });
    const id = b.sheets[0]!.id;
    const m = renderWindow(b.wb, id, { width: 150, height: 40 }, 'en-GB', undefined, {
      r: 2,
      c: 2,
    })!;
    expect(m.rowLabels[0]).toBe('3');
    expect(m.colLabels[0]).toBe('C');
    expect(m.cells.find((c) => c.r === 0 && c.c === 0)?.text).toBe('mid');
    expect(m.cells.some((c) => c.text === 'top')).toBe(false);
  });

  it('draws no frozen panes past A1, and keeps them from A1', () => {
    const b = book({ A1: 'x' });
    const id = b.sheets[0]!.id;
    b.sheets[0]!.layout.frozenRows = 1;
    b.sheets[0]!.layout.frozenCols = 1;
    const from = renderWindow(b.wb, id, { width: 200, height: 80 }, 'en-GB', undefined, {
      r: 1,
      c: 1,
    })!;
    expect([from.frozenRows, from.frozenCols]).toEqual([0, 0]);
    const top = renderWindow(b.wb, id, { width: 200, height: 80 }, 'en-GB')!;
    expect([top.frozenRows, top.frozenCols]).toEqual([1, 1]);
  });
});
